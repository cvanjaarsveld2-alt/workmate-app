import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync } from "../lib/sync";
import { Card, Btn, PageHeader } from "../components/ui";
import {
  MapPin,
  Play,
  CheckCircle2,
  Clock,
  RefreshCw,
  Sparkles,
  FileText,
  Save,
  WifiOff,
  ClipboardList,
  Timer,
  Car,
  Square,
} from "lucide-react";
import { createInvoiceFromJob } from "../lib/jobInvoiceAutomation";
import { CaptionedPhotos } from "../components/CaptionedPhotos";
import { PartsEditor } from "../components/PartsEditor";
import { normaliseParts, partsForSave, useProducts } from "../lib/products";
import { useTimeEntries } from "../lib/useTimeEntries";
import { entryMinutes, fmtMinutes, labourLines, totals } from "../lib/timesheets";
import { useCompanyProfile } from "../lib/companyProfile";
import { buildDocumentPDF, documentFilename, shareDocumentPDF } from "../lib/documentPDF";
import { jobToCard } from "../lib/documentData";
import { resolveDocumentPhotos } from "../lib/documentPhotos";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function JobsScreen({ userId, teamId, setData, clients = [] }) {
  const [jobs, setJobs] = useState([]),
    [quotes, setQuotes] = useState([]),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(null),
    [assistant, setAssistant] = useState(null),
    [assistantLoading, setAssistantLoading] = useState(null),
    [error, setError] = useState(""),
    [drafts, setDrafts] = useState({});
  const online = useOnlineStatus();
  const profile = useCompanyProfile(teamId);
  const [making, setMaking] = useState(null);
  const time = useTimeEntries({ userId, teamId, online, setData });
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!time.running) return;
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, [time.running]);
  const jobTime = job => totals(time.entries.filter(e => e.job_id === job.id));
  // Billable timesheet hours on a job, at the company's labour rate.
  const labourFor = job => labourLines(time.entries, job.id, profile.labour_rate);
  async function shareJobCard(job) {
    setMaking(job.id);
    setError("");
    try {
      const card = jobToCard({ ...job, photos: draft(job).photos }, { clients, quotes });
      const doc = await resolveDocumentPhotos({
        kind: "jobcard",
        number: card.number,
        client: { name: card.customer },
        jobCards: [card],
      });
      const blob = await buildDocumentPDF(doc, profile);
      const r = await shareDocumentPDF(blob, documentFilename(doc, profile), `Job card ${card.number}`);
      if (r !== "cancelled") setError(r === "shared" ? "Job card shared." : "Job card PDF downloaded.");
    } catch (err) {
      console.error("Job card PDF failed:", err);
      setError("Couldn't make the job card PDF.");
    } finally {
      setMaking(null);
    }
  }
  const apply = rows => {
    const mine = (rows || []).filter(
      j => j.user_id === userId || j.assigned_to_user_id === userId || (teamId && j.team_id === teamId),
    );
    setJobs(mine);
    setDrafts(d => {
      const n = { ...d };
      mine.forEach(
        j =>
          (n[j.id] = {
            technician_notes: j.technician_notes || "",
            work_done: j.work_done || "",
            parts_used: normaliseParts(j.parts_used),
            photos: Array.isArray(j.photos) ? j.photos.filter(p => p && typeof p === "object") : [],
          }),
      );
      return n;
    });
  };
  async function load() {
    if (!userId) return;
    setLoading(true);
    setError("");
    const [lq, lquotes] = await Promise.all([
      offlineGetAll("jobs").catch(() => []),
      offlineGetAll("quotes").catch(() => []),
    ]);
    apply(lq);
    setQuotes((lquotes || []).filter(q => q.user_id === userId));
    if (online) {
      const [jq, qq] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .order("scheduled_date", { ascending: true })
          .order("scheduled_time", { ascending: true }),
        supabase.from("quotes").select("id,value,client_name,description").eq("user_id", userId),
      ]);
      if (!jq.error) {
        apply(jq.data || []);
        await Promise.all((jq.data || []).map(x => offlineSave("jobs", x).catch(() => {})));
      } else if (!lq.length) setError(jq.error.message);
      if (!qq.error) {
        setQuotes(qq.data || []);
        await Promise.all((qq.data || []).map(x => offlineSave("quotes", x).catch(() => {})));
      }
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [userId, teamId, online]);
  const products = useProducts(supabase, teamId);
  const draft = j => drafts[j.id] || { technician_notes: "", work_done: "", parts_used: [], photos: [] };
  async function updateJob(job, patch, key) {
    const updated = { ...job, ...patch, sync_status: "pending" };
    setSaving(key);
    setError("");
    setJobs(r => r.map(x => (x.id === job.id ? updated : x)));
    const saved = await saveAndSync(updated, "jobs", "update", setData || (() => {}), online);
    if (saved?.sync_status === "synced") setJobs(r => r.map(x => (x.id === job.id ? saved : x)));
    setSaving(null);
    return saved || updated;
  }
  async function saveWork(job) {
    const d = draft(job);
    await updateJob(
      job,
      {
        technician_notes: d.technician_notes,
        work_done: d.work_done,
        parts_used: partsForSave(d.parts_used),
        photos: d.photos || [],
      },
      `save:${job.id}`,
    );
  }
  async function invoice(job) {
    setSaving(`invoice:${job.id}`);
    setError("");
    const q = quotes.find(x => x.id === job.quote_id);
    const r = await createInvoiceFromJob(
      { ...job, _quoteValue: q?.value || 0, _labourLines: labourFor(job) },
      userId,
      teamId,
      setData,
      online,
    );
    if (r.ok && r.created)
      setError(
        r.local
          ? `Invoice ${r.invoice.invoice_number} saved offline and queued.`
          : `Invoice ${r.invoice.invoice_number} created.`,
      );
    else if (r.ok) setError(`Invoice ${r.invoice?.invoice_number || "already exists"}.`);
    else setError(r.error?.message || "Could not create invoice.");
    setSaving(null);
  }
  async function complete(job) {
    const d = draft(job);
    setSaving(`complete:${job.id}`);
    setError("");
    // Finishing the job stops the clock on it.
    const stopped = time.running?.job_id === job.id ? await time.clockOut() : null;
    const q = quotes.find(x => x.id === job.quote_id);
    const updated = {
      ...job,
      status: "completed",
      completed_at: new Date().toISOString(),
      technician_notes: d.technician_notes,
      work_done: d.work_done,
      parts_used: partsForSave(d.parts_used),
      photos: d.photos || [],
      sync_status: "pending",
    };
    setJobs(r => r.map(x => (x.id === job.id ? updated : x)));
    const saved = await saveAndSync(updated, "jobs", "update", setData || (() => {}), online);
    const r = await createInvoiceFromJob(
      {
        ...(saved || updated),
        _quoteValue: q?.value || 0,
        _labourLines: labourLines(
          stopped ? [stopped, ...time.entries.filter(e => e.id !== stopped.id)] : time.entries,
          job.id,
          profile.labour_rate,
        ),
      },
      userId,
      teamId,
      setData,
      online,
    );
    setError(
      r.ok
        ? r.local
          ? `Job completed offline. Invoice ${r.invoice.invoice_number} queued.`
          : `Job completed and invoice ${r.invoice?.invoice_number || "created"}.`
        : `Job saved, invoice failed: ${r.error?.message || "unknown error"}`,
    );
    setSaving(null);
  }
  async function status(job, s) {
    if (s === "completed") return complete(job);
    await updateJob(
      job,
      {
        status: s,
        ...(s === "in_progress" && !job.started_at ? { started_at: new Date().toISOString() } : {}),
      },
      job.id,
    );
  }
  async function assist(job) {
    if (!online) {
      setError("Technician assist needs internet.");
      return;
    }
    setAssistantLoading(job.id);
    const { data, error: e } = await supabase.functions.invoke("technician-assist", {
      body: { fault: job.description || job.title, equipment: job.title },
    });
    if (e) setError(e.message || "Technician assistant unavailable");
    else if (data?.advice) setAssistant({ jobId: job.id, ...data });
    else setError("No technician guidance was returned.");
    setAssistantLoading(null);
  }
  return (
    <div className="stack-y-4">
      <PageHeader title="Jobs" subtitle="Technician jobs, field work & invoicing" />
      {!online && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 flex gap-2">
          <WifiOff size={16} />
          Offline mode — jobs and invoices save locally and sync later.
        </div>
      )}
      {error && (
        <div className="rounded-xl border p-3 text-sm bg-slate-50 border-slate-200 text-slate-700">
          {error}
        </div>
      )}
      <div className="flex justify-end">
        <Btn size="sm" variant="secondary" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </Btn>
      </div>
      {loading ? (
        <Card className="p-6 text-center text-slate-400">Loading jobs…</Card>
      ) : jobs.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-bold">No jobs yet</p>
          <p className="text-sm text-slate-400 mt-1">Accepted quotes automatically become jobs.</p>
        </Card>
      ) : (
        jobs.map(job => {
          const d = draft(job);
          return (
            <Card key={job.id} className="p-4 stack-y-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 truncate">
                    {job.job_number || "Job"} · {job.title}
                  </p>
                  <p className="text-sm text-slate-500">{job.description || "Field service"}</p>
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100">
                  {(job.status || "scheduled").replace("_", " ")}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                <span className="flex gap-1">
                  <Clock size={13} />
                  {job.scheduled_date || "Unscheduled"}
                  {job.scheduled_time ? ` · ${job.scheduled_time}` : ""}
                </span>
                <span className="flex gap-1 truncate">
                  <MapPin size={13} />
                  {job.location || "No location"}
                </span>
              </div>
              {(() => {
                const t = jobTime(job);
                const here = time.running?.job_id === job.id ? time.running : null;
                const open = job.status === "scheduled" || job.status === "in_progress";
                if (!open && !t.all) return null;
                return (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 flex items-center gap-1 mr-auto">
                      <Timer size={13} />
                      {t.all ? `Time on job ${fmtMinutes(t.work)}${t.travel ? ` · travel ${fmtMinutes(t.travel)}` : ""}` : "No time recorded"}
                    </span>
                    {open &&
                      (here ? (
                        <Btn size="sm" variant="warning" onClick={() => time.clockOut()}>
                          <Square size={13} />
                          {here.kind === "travel" ? "Stop travel" : "Clock out"} · {fmtMinutes(entryMinutes(here))}
                        </Btn>
                      ) : (
                        <>
                          <Btn size="sm" variant="ghost" onClick={() => time.clockIn({ job, kind: "travel" })}>
                            <Car size={13} /> Travel
                          </Btn>
                          <Btn size="sm" variant="secondary" onClick={() => time.clockIn({ job })}>
                            <Timer size={13} /> Clock in
                          </Btn>
                        </>
                      ))}
                  </div>
                );
              })()}
              {(job.status === "scheduled" || job.status === "in_progress") && (
                <div className="stack-y-2 rounded-xl bg-slate-50 p-3">
                  <textarea
                    value={d.technician_notes}
                    onChange={e =>
                      setDrafts(x => ({
                        ...x,
                        [job.id]: { ...draft(job), technician_notes: e.target.value },
                      }))
                    }
                    placeholder="Technician notes / findings"
                    rows={2}
                    className="w-full rounded-xl border p-2 text-sm"
                  />
                  <textarea
                    value={d.work_done}
                    onChange={e =>
                      setDrafts(x => ({ ...x, [job.id]: { ...draft(job), work_done: e.target.value } }))
                    }
                    placeholder="Work done"
                    rows={2}
                    className="w-full rounded-xl border p-2 text-sm"
                  />
                  <PartsEditor
                    parts={d.parts_used}
                    products={products}
                    onChange={parts => setDrafts(x => ({ ...x, [job.id]: { ...draft(job), parts_used: parts } }))}
                  />
                  <CaptionedPhotos
                    photos={d.photos || []}
                    onChange={photos => setDrafts(x => ({ ...x, [job.id]: { ...draft(job), photos } }))}
                  />
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => saveWork(job)}
                    disabled={saving === `save:${job.id}`}
                  >
                    <Save size={13} />
                    Save field report
                  </Btn>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {job.location && (
                  <a
                    className="rounded-xl border px-3 py-2 text-xs font-bold"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}
                  >
                    Open route
                  </a>
                )}
                <Btn size="sm" variant="secondary" onClick={() => shareJobCard(job)} disabled={making === job.id}>
                  <ClipboardList size={13} />
                  {making === job.id ? "Making…" : "Job card PDF"}
                </Btn>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => assist(job)}
                  disabled={assistantLoading === job.id}
                >
                  <Sparkles size={13} />
                  {assistantLoading === job.id ? "Thinking…" : "Technician assist"}
                </Btn>
                {job.status === "scheduled" && (
                  <Btn
                    size="sm"
                    onClick={async () => {
                      await status(job, "in_progress");
                      // Starting a job starts the clock on it.
                      if (time.running?.job_id !== job.id || time.running?.kind !== "work") await time.clockIn({ job });
                    }}
                    disabled={saving === job.id}
                  >
                    <Play size={13} />
                    Start job
                  </Btn>
                )}
                {job.status === "in_progress" && (
                  <Btn size="sm" onClick={() => complete(job)} disabled={saving === `complete:${job.id}`}>
                    <CheckCircle2 size={13} />
                    {saving === `complete:${job.id}` ? "Completing…" : "Complete & invoice"}
                  </Btn>
                )}
                {job.status === "completed" && (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => invoice(job)}
                    disabled={saving === `invoice:${job.id}`}
                  >
                    <FileText size={13} />
                    {saving === `invoice:${job.id}` ? "Creating…" : "Create invoice"}
                  </Btn>
                )}
              </div>
              {assistant?.jobId === job.id && (
                <div className="rounded-xl bg-violet-50 p-3 stack-y-2">
                  <p className="text-xs font-black">
                    Technician assistant · {assistant.mode === "ai" ? "AI" : "safe fallback"}
                  </p>
                  <p className="text-sm font-bold">{assistant.advice.diagnosis}</p>
                  {assistant.advice.checks?.map((x, i) => (
                    <p key={i} className="text-xs">
                      {i + 1}. {x}
                    </p>
                  ))}
                  <p className="text-[11px]">⚠ {assistant.advice.safety}</p>
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
