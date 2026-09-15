import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Card, Btn, PageHeader } from "../components/ui";
import { MapPin, Play, CheckCircle2, Clock, RefreshCw, Sparkles, FileText, Save } from "lucide-react";
import { createInvoiceFromJob } from "../lib/jobInvoiceAutomation";

export function JobsScreen({ userId, teamId }) {
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [assistant, setAssistant] = useState(null);
  const [assistantLoading, setAssistantLoading] = useState(null);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState({});

  async function load() {
    if (!userId) return;
    setLoading(true); setError("");
    const [{ data: jobsData, error: jobsError }, { data: quotesData, error: quotesError }] = await Promise.all([
      supabase.from("jobs").select("*").order("scheduled_date", { ascending: true }).order("scheduled_time", { ascending: true }),
      supabase.from("quotes").select("id, value, client_name, description").eq("user_id", userId),
    ]);
    if (jobsError) setError(jobsError.message); else {
      setJobs(jobsData || []);
      const next = {};
      (jobsData || []).forEach(j => { next[j.id] = { technician_notes: j.technician_notes || "", work_done: j.work_done || "", parts_used: Array.isArray(j.parts_used) ? j.parts_used.join(", ") : "" }; });
      setDrafts(next);
    }
    if (!quotesError) setQuotes(quotesData || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, teamId]);

  function draft(job) { return drafts[job.id] || { technician_notes: "", work_done: "", parts_used: "" }; }

  async function saveWork(job) {
    const d = draft(job);
    setSaving(`save:${job.id}`); setError("");
    const parts = d.parts_used.split(",").map(s => s.trim()).filter(Boolean);
    const { data, error: e } = await supabase.from("jobs").update({
      technician_notes: d.technician_notes,
      work_done: d.work_done,
      parts_used: parts,
    }).eq("id", job.id).select("*").single();
    if (e) setError(e.message); else setJobs(rows => rows.map(r => r.id === job.id ? data : r));
    setSaving(null);
  }

  async function createInvoice(job) {
    setSaving(`invoice:${job.id}`); setError("");
    const quote = quotes.find(q => q.id === job.quote_id);
    const result = await createInvoiceFromJob({ ...job, _quoteValue: quote?.value || 0 }, userId, teamId);
    if (!result.ok) setError(result.error?.message || "Could not create invoice.");
    else if (!result.created) setError(`Invoice ${result.invoice?.invoice_number || "already exists"}.`);
    else setError(`Invoice ${result.invoice.invoice_number} created.`);
    setSaving(null);
  }

  async function completeJob(job) {
    const d = draft(job);
    setSaving(`complete:${job.id}`); setError("");
    const parts = d.parts_used.split(",").map(s => s.trim()).filter(Boolean);
    const completedAt = new Date().toISOString();
    const { data, error: e } = await supabase.from("jobs").update({
      status: "completed",
      completed_at: completedAt,
      technician_notes: d.technician_notes,
      work_done: d.work_done,
      parts_used: parts,
    }).eq("id", job.id).select("*").single();
    if (e) { setError(e.message); setSaving(null); return; }
    setJobs(rows => rows.map(r => r.id === job.id ? data : r));

    const quote = quotes.find(q => q.id === job.quote_id);
    const invoiceResult = await createInvoiceFromJob({ ...data, _quoteValue: quote?.value || 0 }, userId, teamId);
    if (!invoiceResult.ok) setError(`Job completed, but invoice creation failed: ${invoiceResult.error?.message || "unknown error"}`);
    else if (invoiceResult.created) setError(`Job completed and invoice ${invoiceResult.invoice.invoice_number} created.`);
    else setError(`Job completed. Invoice ${invoiceResult.invoice?.invoice_number || "already exists"}.`);
    setSaving(null);
  }

  async function setStatus(job, status) {
    if (status === "completed") return completeJob(job);
    setSaving(job.id); setError("");
    const patch = { status };
    if (status === "in_progress" && !job.started_at) patch.started_at = new Date().toISOString();
    const { data, error: e } = await supabase.from("jobs").update(patch).eq("id", job.id).select("*").single();
    if (e) setError(e.message); else setJobs(rows => rows.map(r => r.id === job.id ? data : r));
    setSaving(null);
  }

  async function askAssistant(job) {
    setAssistantLoading(job.id); setAssistant(null); setError("");
    const { data, error: e } = await supabase.functions.invoke("technician-assist", { body: { fault: job.description || job.title, equipment: job.title } });
    if (e) setError(e.message || "Technician assistant unavailable");
    else if (data?.advice) setAssistant({ jobId: job.id, ...data });
    else setError("No technician guidance was returned.");
    setAssistantLoading(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Jobs" subtitle="Technician jobs, field work & invoicing" />
      {error && <div className={`rounded-xl border p-3 text-sm ${error.includes("completed") || error.includes("created") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>{error}</div>}
      <div className="flex justify-end"><Btn size="sm" variant="secondary" onClick={load}><RefreshCw size={14}/> Refresh</Btn></div>
      {loading ? <Card className="p-6 text-center text-slate-400">Loading jobs…</Card> : jobs.length === 0 ? (
        <Card className="p-6 text-center"><p className="font-bold text-slate-700">No jobs yet</p><p className="text-sm text-slate-400 mt-1">Accepted quotes automatically become jobs.</p></Card>
      ) : jobs.map(job => {
        const d = draft(job);
        return (
          <Card key={job.id} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0"><p className="font-black text-slate-900 truncate">{job.job_number || "Job"} · {job.title}</p><p className="text-sm text-slate-500">{job.description || "Field service"}</p></div>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{(job.status || "scheduled").replace("_", " ")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Clock size={13}/>{job.scheduled_date || "Unscheduled"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</span>
              <span className="flex items-center gap-1 truncate"><MapPin size={13}/>{job.location || "No location"}</span>
            </div>
            {(job.status === "in_progress" || job.status === "scheduled") && (
              <div className="space-y-2 rounded-xl bg-slate-50 border border-slate-100 p-3">
                <textarea value={d.technician_notes} onChange={e => setDrafts(x => ({ ...x, [job.id]: { ...draft(job), technician_notes: e.target.value } }))} placeholder="Technician notes / findings" rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                <textarea value={d.work_done} onChange={e => setDrafts(x => ({ ...x, [job.id]: { ...draft(job), work_done: e.target.value } }))} placeholder="Work done" rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                <input value={d.parts_used} onChange={e => setDrafts(x => ({ ...x, [job.id]: { ...draft(job), parts_used: e.target.value } }))} placeholder="Parts used (comma separated)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                <Btn size="sm" variant="secondary" onClick={() => saveWork(job)} disabled={saving === `save:${job.id}`}><Save size={13}/>{saving === `save:${job.id}` ? "Saving…" : "Save field report"}</Btn>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {job.location && <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}>Open route</a>}
              <Btn size="sm" variant="secondary" onClick={() => askAssistant(job)} disabled={assistantLoading === job.id}><Sparkles size={13}/>{assistantLoading === job.id ? "Thinking…" : "Technician assist"}</Btn>
              {job.status === "scheduled" && <Btn size="sm" onClick={() => setStatus(job, "in_progress")} disabled={saving === job.id}><Play size={13}/> Start job</Btn>}
              {job.status === "in_progress" && <Btn size="sm" onClick={() => completeJob(job)} disabled={saving === `complete:${job.id}`}><CheckCircle2 size={13}/>{saving === `complete:${job.id}` ? "Completing…" : "Complete & invoice"}</Btn>}
              {job.status === "completed" && <Btn size="sm" variant="secondary" onClick={() => createInvoice(job)} disabled={saving === `invoice:${job.id}`}><FileText size={13}/>{saving === `invoice:${job.id}` ? "Creating…" : "Create invoice"}</Btn>}
            </div>
            {assistant?.jobId === job.id && <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 space-y-2"><p className="text-xs font-black text-violet-800">Technician assistant · {assistant.mode === "ai" ? "AI" : "safe fallback"}</p><p className="text-sm font-bold text-violet-900">{assistant.advice.diagnosis}</p>{assistant.advice.checks?.map((check, i) => <p key={i} className="text-xs text-violet-800">{i + 1}. {check}</p>)}<p className="text-[11px] text-violet-700">⚠ {assistant.advice.safety}</p></div>}
          </Card>
        );
      })}
    </div>
  );
}
