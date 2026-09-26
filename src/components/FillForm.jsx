// ─── Fill in a form ───────────────────────────────────────────────────────────
// Pick one of the company's forms, answer it, sign, save. Works without
// signal: the form is kept on the phone and sent later (lib/forms.js).
import React, { useEffect, useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "../supabase";
import { cachedTemplates, failedChecks, loadTemplates, missingAnswers, submitForm } from "../lib/forms";
import { BottomSheet } from "./BottomSheet";
import { SignaturePad } from "./SignaturePad";
import { Btn, Field } from "./ui";

const input = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base min-h-[52px]";

function Question({ f, value, onChange }) {
  if (f.type === "heading") return <p className="pt-3 text-sm font-black text-slate-800 uppercase tracking-wide">{f.label}</p>;
  const label = (
    <span className="mb-1.5 block text-sm font-bold text-slate-700">
      {f.label}
      {f.required && <span className="text-red-500 ml-1">*</span>}
    </span>
  );
  if (f.type === "yesno")
    return (
      <div>
        {label}
        <div className="grid grid-cols-3 gap-2">
          {[
            ["yes", "Yes", "bg-green-600"],
            ["no", "No", "bg-red-600"],
            ["na", "N/A", "bg-slate-500"],
          ].map(([v, t, on]) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(value === v ? "" : v)}
              aria-pressed={value === v}
              className={`rounded-xl py-3 text-sm font-bold min-h-[48px] ${value === v ? `${on} text-white` : "bg-slate-100 text-slate-700"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  if (f.type === "choice")
    return (
      <div>
        {label}
        <div className="stack-y-2">
          {(f.options || []).map(o => (
            <button
              key={o}
              type="button"
              onClick={() => onChange(value === o ? "" : o)}
              aria-pressed={value === o}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm font-bold min-h-[48px] ${value === o ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <label className="block">
      {label}
      {f.type === "textarea" ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value.slice(0, 2000))} rows={3} className={input} />
      ) : (
        <input
          type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
          inputMode={f.type === "number" ? "decimal" : undefined}
          value={value || ""}
          onChange={e => onChange(e.target.value.slice(0, 500))}
          className={input}
        />
      )}
    </label>
  );
}

export function FillForm({ open, onClose, teamId, userId, appliesTo = "any", job = null, equipment = null, client = null, userName = "", onDone }) {
  const [templates, setTemplates] = useState(() => cachedTemplates(teamId));
  const [chosen, setChosen] = useState(null);
  const [answers, setAnswers] = useState({});
  const [signature, setSignature] = useState(null);
  const [signedBy, setSignedBy] = useState(userName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !teamId || !navigator.onLine) return;
    loadTemplates(supabase, teamId).then(setTemplates, () => {});
  }, [open, teamId]);
  const offered = useMemo(
    () => templates.filter(t => t.active !== false && (t.applies_to === "any" || appliesTo === "any" || t.applies_to === appliesTo)),
    [templates, appliesTo],
  );
  useEffect(() => {
    if (open && offered.length === 1 && !chosen) setChosen(offered[0]);
  }, [open, offered, chosen]);

  async function save() {
    const missing = missingAnswers(chosen.fields, answers);
    if (missing.length) return setError(`Still to answer: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);
    if (chosen.require_signature && !signature) return setError("Please sign the form");
    setBusy(true);
    const result = await submitForm(supabase, {
      id: crypto.randomUUID(),
      team_id: teamId,
      user_id: userId,
      template_id: chosen.id,
      template_name: chosen.name,
      fields: chosen.fields,
      answers,
      job_id: job?.id || null,
      equipment_id: equipment?.id || null,
      client_id: client?.id || job?.client_id || equipment?.client_id || null,
      signature: signature || null,
      signed_by: signature ? signedBy.trim().slice(0, 120) || null : null,
      filled_at: new Date().toISOString(),
    });
    setBusy(false);
    const fails = failedChecks(chosen.fields, answers);
    onDone?.(
      (result === "sent" ? "Form saved" : "Saved on this phone; it'll send when you have signal") +
        (fails.length ? ` · ${fails.length} check${fails.length === 1 ? "" : "s"} answered No` : ""),
    );
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={chosen ? chosen.name : "Fill in a form"} subtitle={job ? job.title : equipment ? equipment.name : ""} maxHeight="94vh">
      {!chosen ? (
        <div className="stack-y-2">
          {offered.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">No forms yet. The master account or an admin can make them under Forms & checklists.</p>
          )}
          {offered.map(t => (
            <button key={t.id} type="button" onClick={() => setChosen(t)} className="w-full rounded-xl bg-slate-50 px-4 py-3 text-left min-h-[56px]">
              <span className="flex items-center gap-2 font-bold text-slate-800">
                <ClipboardCheck size={16} /> {t.name}
              </span>
              {t.description && <span className="block text-xs text-slate-500 mt-0.5">{t.description}</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="stack-y-4">
          {chosen.description && <p className="text-sm text-slate-500">{chosen.description}</p>}
          {(chosen.fields || []).map(f => (
            <Question key={f.id} f={f} value={answers[f.id]} onChange={v => setAnswers(a => ({ ...a, [f.id]: v }))} />
          ))}
          {chosen.require_signature && (
            <div className="stack-y-2 pt-2">
              <Field label="Signed by" value={signedBy} onChange={setSignedBy} maxLength={120} />
              <SignaturePad onChange={setSignature} />
            </div>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Btn onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save form"}
          </Btn>
          {offered.length > 1 && (
            <button type="button" onClick={() => setChosen(null)} className="w-full text-sm font-bold text-slate-500 min-h-[44px]">
              Choose a different form
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
