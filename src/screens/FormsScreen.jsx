// ─── Forms & checklists ───────────────────────────────────────────────────────
// The company's own forms (master account and admins build them), and every
// form filled in on a job or machine, with a PDF of each.
import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCheck, FileText, Plus, Trash2 } from "lucide-react";
import { supabase } from "../supabase";
import { useCompanyProfile } from "../lib/companyProfile";
import { FIELD_TYPES, STARTER_TEMPLATES, cleanTemplate, failedChecks, flushForms, loadTemplates, newField, pendingForms, templateProblems } from "../lib/forms";
import { buildFormPDF } from "../lib/formPDF";
import { shareDocumentPDF } from "../lib/documentPDF";
import { BottomSheet } from "../components/BottomSheet";
import { FillForm } from "../components/FillForm";
import { Btn, Card, Field, PageHeader, Toast } from "../components/ui";

const fmt = d => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");
const APPLIES = { any: "Jobs and machines", job: "Jobs", equipment: "Machines" };

function Builder({ template, teamId, onClose, onSaved }) {
  const [t, setT] = useState(() => template);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const setField = (i, patch) => setT(x => ({ ...x, fields: x.fields.map((f, n) => (n === i ? { ...f, ...patch } : f)) }));
  const move = (i, d) =>
    setT(x => {
      const fields = [...x.fields];
      const j = i + d;
      if (j < 0 || j >= fields.length) return x;
      [fields[i], fields[j]] = [fields[j], fields[i]];
      return { ...x, fields };
    });
  async function save() {
    const problems = templateProblems(t);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    const row = { team_id: teamId, ...cleanTemplate(t) };
    const q = t.id ? supabase.from("form_templates").update(row).eq("id", t.id) : supabase.from("form_templates").insert(row);
    const { error } = await q;
    setBusy(false);
    if (error) return setErrors([error.message]);
    onSaved();
  }
  return (
    <BottomSheet open onClose={onClose} title={t.id ? "Edit form" : "New form"} maxHeight="94vh">
      <div className="stack-y-3">
        <Field label="Form name" value={t.name || ""} onChange={v => setT(x => ({ ...x, name: v }))} maxLength={120} />
        <Field label="Short description (optional)" value={t.description || ""} onChange={v => setT(x => ({ ...x, description: v }))} maxLength={1000} />
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-500">Used on</span>
          <select
            value={t.applies_to || "any"}
            onChange={e => setT(x => ({ ...x, applies_to: e.target.value }))}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-base min-h-[52px]"
          >
            {Object.entries(APPLIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 min-h-[44px] text-sm font-bold text-slate-700">
          <input type="checkbox" checked={t.require_signature !== false} onChange={e => setT(x => ({ ...x, require_signature: e.target.checked }))} className="h-5 w-5" />
          Needs a signature
        </label>

        <p className="text-sm font-black text-slate-800 pt-2">Questions</p>
        {(t.fields || []).map((f, i) => (
          <div key={f.id} className="rounded-xl bg-slate-50 p-3 stack-y-2">
            <div className="flex gap-2">
              <select
                value={f.type}
                onChange={e => setField(i, { type: e.target.value, ...(e.target.value === "choice" && !f.options ? { options: ["", ""] } : {}) })}
                aria-label="Question type"
                className="flex-1 rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm min-h-[44px]"
              >
                {Object.entries(FIELD_TYPES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
              <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="p-2 text-slate-500 min-h-[44px]">
                <ArrowUp size={16} />
              </button>
              <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="p-2 text-slate-500 min-h-[44px]">
                <ArrowDown size={16} />
              </button>
              <button type="button" aria-label="Remove question" onClick={() => setT(x => ({ ...x, fields: x.fields.filter((_, n) => n !== i) }))} className="p-2 text-slate-400 min-h-[44px]">
                <Trash2 size={16} />
              </button>
            </div>
            <Field label={f.type === "heading" ? "Heading" : "Question"} value={f.label} onChange={v => setField(i, { label: v })} maxLength={200} />
            {f.type === "choice" && (
              <div className="stack-y-2">
                {(f.options || []).map((o, n) => (
                  <Field
                    key={n}
                    label={`Choice ${n + 1}`}
                    value={o}
                    onChange={v => setField(i, { options: f.options.map((x, m) => (m === n ? v : x)) })}
                    maxLength={80}
                  />
                ))}
                <button type="button" onClick={() => setField(i, { options: [...(f.options || []), ""] })} className="text-sm font-bold underline min-h-[40px]">
                  Add a choice
                </button>
              </div>
            )}
            {f.type !== "heading" && (
              <label className="flex items-center gap-2 text-sm text-slate-700 min-h-[40px]">
                <input type="checkbox" checked={!!f.required} onChange={e => setField(i, { required: e.target.checked })} className="h-5 w-5" />
                Must be answered
              </label>
            )}
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <Btn size="sm" variant="secondary" onClick={() => setT(x => ({ ...x, fields: [...(x.fields || []), newField("yesno")] }))}>
            <Plus size={14} /> Yes/No check
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => setT(x => ({ ...x, fields: [...(x.fields || []), newField("text")] }))}>
            <Plus size={14} /> Other question
          </Btn>
        </div>
        {errors.length > 0 && (
          <ul className="text-sm text-red-700 list-disc pl-5">
            {errors.map(e => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save form"}
        </Btn>
      </div>
    </BottomSheet>
  );
}

export function FormsScreen({ teamId, userId, canManage = false, clients = [], equipment = [], teamMembers = [] }) {
  const profile = useCompanyProfile(teamId);
  const [tab, setTab] = useState("filled");
  const [templates, setTemplates] = useState([]);
  const [subs, setSubs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filling, setFilling] = useState(false);
  const [waiting, setWaiting] = useState(() => pendingForms().length);
  const [toast, setToast] = useState("");

  async function load() {
    const left = await flushForms(supabase);
    setWaiting(left.length);
    const [t, s] = await Promise.all([
      loadTemplates(supabase, teamId),
      supabase.from("form_submissions").select("*").eq("team_id", teamId).order("filled_at", { ascending: false }).limit(200),
    ]);
    setTemplates(t);
    const rows = s.data || [];
    setSubs(rows);
    const jobIds = [...new Set(rows.map(r => r.job_id).filter(Boolean))];
    if (jobIds.length) {
      const { data } = await supabase.from("jobs").select("id, job_number, title, client_id").in("id", jobIds);
      setJobs(data || []);
    }
  }
  useEffect(() => {
    if (teamId) load();
    // Loads once per company; saves reload explicitly.
  }, [teamId]);

  const person = id => {
    const m = teamMembers.find(t => t.user_id === id);
    return m ? m.full_name || m.email : "";
  };
  async function pdf(sub) {
    try {
      const job = jobs.find(j => j.id === sub.job_id);
      const eq = equipment.find(e => e.id === sub.equipment_id);
      const client = clients.find(c => c.id === (sub.client_id || job?.client_id || eq?.client_id));
      const { blob, filename } = await buildFormPDF(sub, { profile, job, equipment: eq, client, filledBy: person(sub.user_id) });
      await shareDocumentPDF(blob, filename, sub.template_name);
    } catch (e) {
      setToast(e.message || "Couldn't make the PDF");
    }
  }
  async function remove(sub) {
    if (!window.confirm(`Delete this ${sub.template_name}? It can't be undone.`)) return;
    const { error } = await supabase.from("form_submissions").delete().eq("id", sub.id);
    if (error) return setToast(error.message);
    load();
  }
  async function archive(t) {
    const { error } = await supabase.from("form_templates").update({ active: !t.active }).eq("id", t.id);
    if (error) return setToast(error.message);
    load();
  }

  return (
    <div className="stack-y-4">
      <PageHeader title="Forms & checklists" subtitle="Safety sign-offs, inspections and checklists, signed on the spot" />
      {waiting > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {waiting} form{waiting === 1 ? "" : "s"} saved on this phone, waiting for signal to send.
        </div>
      )}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[
          ["filled", `Filled in (${subs.length})`],
          ["templates", `Forms (${templates.filter(t => t.active !== false).length})`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-xs font-bold min-h-[44px] ${tab === k ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "filled" && (
        <>
          <Btn onClick={() => setFilling(true)}>
            <ClipboardCheck size={16} /> Fill in a form
          </Btn>
          {subs.length === 0 && <Card className="p-6 text-center text-slate-500">No forms filled in yet. Fill them in from a job or a machine, or here.</Card>}
          {subs.map(s => {
            const job = jobs.find(j => j.id === s.job_id);
            const eq = equipment.find(e => e.id === s.equipment_id);
            const fails = failedChecks(s.fields, s.answers);
            return (
              <Card key={s.id} className="p-4 stack-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">{s.template_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {fmt(s.filled_at)} · {person(s.user_id) || "Teammate"}
                      {job ? ` · ${job.job_number || job.title}` : ""}
                      {eq ? ` · ${eq.name}` : ""}
                    </p>
                  </div>
                  {fails.length > 0 && <span className="rounded-full bg-red-50 text-red-800 px-2 py-0.5 text-xs font-bold shrink-0">{fails.length} No</span>}
                </div>
                <div className="flex gap-2">
                  <Btn size="sm" variant="secondary" onClick={() => pdf(s)}>
                    <FileText size={14} /> PDF
                  </Btn>
                  {canManage && (
                    <Btn size="sm" variant="ghost" onClick={() => remove(s)}>
                      Delete
                    </Btn>
                  )}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {tab === "templates" && (
        <>
          {canManage && (
            <>
              <Btn onClick={() => setEditing({ name: "", applies_to: "any", require_signature: true, fields: [newField("yesno")] })}>
                <Plus size={16} /> New form
              </Btn>
              {templates.length === 0 && (
                <Card className="p-4 stack-y-2">
                  <p className="text-sm font-black text-slate-800">Start from an example</p>
                  {STARTER_TEMPLATES.map(t => (
                    <Btn key={t.name} size="sm" variant="secondary" onClick={() => setEditing(structuredClone(t))}>
                      {t.name}
                    </Btn>
                  ))}
                </Card>
              )}
            </>
          )}
          {!canManage && templates.length === 0 && <Card className="p-6 text-center text-slate-500">No forms yet. Your master account or an admin makes them.</Card>}
          {templates.map(t => (
            <Card key={t.id} className="p-4 stack-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`font-black truncate ${t.active === false ? "text-slate-400" : "text-slate-900"}`}>{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {APPLIES[t.applies_to] || "Jobs and machines"} · {(t.fields || []).filter(f => f.type !== "heading").length} questions
                    {t.require_signature ? " · signed" : ""}
                    {t.active === false ? " · switched off" : ""}
                  </p>
                </div>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Btn size="sm" variant="secondary" onClick={() => setEditing(t)}>
                    Edit
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => archive(t)}>
                    {t.active === false ? "Switch on" : "Switch off"}
                  </Btn>
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      {editing && (
        <Builder
          template={editing}
          teamId={teamId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setToast("Form saved");
            load();
          }}
        />
      )}
      {filling && (
        <FillForm
          open
          onClose={() => setFilling(false)}
          teamId={teamId}
          userId={userId}
          userName={person(userId)}
          onDone={msg => {
            setToast(msg);
            load();
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
