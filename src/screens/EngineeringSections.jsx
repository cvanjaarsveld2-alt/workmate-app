// ─── Engineering Breakdown Report — collapsible 9-section detail ─────────────
// Renders the full engineering report sections for a breakdown report.
// All data lives in report.engineering (a single object) so the DB schema
// only needed one new JSONB column. Sections are collapsible to stay usable
// on a phone. Everything is optional/additive — a report with no engineering
// data still works exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, FileText, Info, Clock, Search, AlertOctagon,
  ClipboardList, Wrench, ShieldCheck, Paperclip, Plus, X, Trash2,
} from "lucide-react";
import { Field, SelectField } from "../components/ui";
import { BRAND } from "../lib/constants";
import { genId } from "../lib/helpers";
import { haptic } from "../lib/haptics";

const BRAND_PRIMARY = BRAND.primary;

const RCA_METHODS = [
  { value: "", label: "Select method…" },
  { value: "5whys", label: "5 Whys" },
  { value: "fishbone", label: "Fishbone (Ishikawa)" },
  { value: "fmea", label: "FMEA" },
  { value: "fault_tree", label: "Fault Tree Analysis" },
  { value: "pareto", label: "Pareto Analysis" },
  { value: "other", label: "Other" },
];

const SEVERITY_LEVELS = [
  { value: "", label: "—" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// Collapsible section shell
function Section({ icon: Icon, title, subtitle, filled, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border-2 border-slate-100 overflow-hidden bg-white">
      <button
        onClick={() => { haptic.light(); setOpen(o => !o); }}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-slate-50 transition-colors">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: filled ? "#FEF2F2" : "#F1F5F9" }}>
          <Icon size={17} style={{ color: filled ? BRAND_PRIMARY : "#94A3B8" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        {filled && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BRAND_PRIMARY }} />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="text-slate-400 shrink-0" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Small labelled textarea helper
function TextBlock({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 mb-1.5">{label}</p>
      <textarea
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-sm text-slate-800 bg-slate-50 rounded-xl px-3 py-2.5 border-2 border-slate-100 focus:border-red-300 focus:bg-white focus:outline-none resize-none transition-colors" />
    </div>
  );
}

export function EngineeringSections({ engineering = {}, onChange }) {
  const eng = engineering || {};
  // Patch a top-level engineering field
  const set = (key, val) => onChange({ ...eng, [key]: val });
  // Patch a nested object field
  const setIn = (section, key, val) => onChange({ ...eng, [section]: { ...(eng[section] || {}), [key]: val } });

  // ── Corrective actions list ──
  const actions = Array.isArray(eng.corrective_actions) ? eng.corrective_actions : [];
  function addAction() {
    haptic.light();
    set("corrective_actions", [...actions, { id: genId(), action: "", responsible: "", target_date: "", status: "pending" }]);
  }
  function patchAction(id, fields) {
    set("corrective_actions", actions.map(a => a.id === id ? { ...a, ...fields } : a));
  }
  function removeAction(id) {
    haptic.light();
    set("corrective_actions", actions.filter(a => a.id !== id));
  }

  // ── Impact assessment rows (fixed 4 areas) ──
  const impact = eng.impact || {};
  const impactAreas = [
    { key: "safety", label: "Safety", hint: "Injuries, hazards" },
    { key: "production", label: "Production", hint: "Downtime, output loss" },
    { key: "financial", label: "Financial", hint: "Repair cost, lost revenue" },
    { key: "environmental", label: "Environmental", hint: "Spills, emissions" },
  ];

  // Helper to know if a section has content (drives the filled dot)
  const has = (v) => v && String(v).trim().length > 0;
  const hasObj = (o) => o && Object.values(o).some(v => has(v));

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 px-1 pt-1">
        <FileText size={15} style={{ color: BRAND_PRIMARY }} />
        <p className="text-sm font-black text-slate-700">Engineering report detail</p>
      </div>
      <p className="text-xs text-slate-400 px-1 -mt-1">Optional — fill the sections you need. Everything appears in the exported document.</p>

      {/* 1. Executive Summary */}
      <Section icon={Info} title="1. Executive Summary"
        subtitle="Incident overview, impact, key findings"
        filled={hasObj(eng.executive)}>
        <TextBlock label="Incident overview" value={eng.executive?.overview}
          onChange={v => setIn("executive", "overview", v)}
          placeholder="Brief description of the breakdown event." />
        <TextBlock label="Impact summary" value={eng.executive?.impact_summary}
          onChange={v => setIn("executive", "impact_summary", v)}
          placeholder="High-level effect on operations, safety, cost, timelines." />
        <TextBlock label="Key findings" value={eng.executive?.key_findings}
          onChange={v => setIn("executive", "key_findings", v)}
          placeholder="Main causes and resolutions (one per line)." />
      </Section>

      {/* 2. Incident Details */}
      <Section icon={Clock} title="2. Incident Details"
        subtitle="When, where, who reported"
        filled={hasObj(eng.incident)}>
        <Field label="Date & time of breakdown" value={eng.incident?.datetime || ""}
          onChange={v => setIn("incident", "datetime", v)}
          placeholder="DD/MM/YYYY HH:MM" />
        <Field label="Reported by (name & role)" value={eng.incident?.reported_by || ""}
          onChange={v => setIn("incident", "reported_by", v)}
          placeholder="e.g. J. Smith, Site Supervisor" />
        <Field label="Weather / environmental conditions" value={eng.incident?.conditions || ""}
          onChange={v => setIn("incident", "conditions", v)}
          placeholder="If applicable" />
      </Section>

      {/* 3. Background Information */}
      <Section icon={ClipboardList} title="3. Background Information"
        subtitle="Equipment history, operating conditions, personnel"
        filled={hasObj(eng.background)}>
        <TextBlock label="Equipment history" value={eng.background?.history}
          onChange={v => setIn("background", "history", v)}
          placeholder="Maintenance records, last inspection date, known issues." />
        <TextBlock label="Operating conditions" value={eng.background?.operating}
          onChange={v => setIn("background", "operating", v)}
          placeholder="Load, temperature, pressure or other parameters at the time." />
        <TextBlock label="Personnel involved" value={eng.background?.personnel}
          onChange={v => setIn("background", "personnel", v)}
          placeholder="Operators, engineers, contractors present." />
      </Section>

      {/* 4. Breakdown Description */}
      <Section icon={AlertOctagon} title="4. Breakdown Description"
        subtitle="Sequence, symptoms, immediate actions"
        filled={hasObj(eng.description)}>
        <TextBlock label="Sequence of events" value={eng.description?.sequence}
          onChange={v => setIn("description", "sequence", v)}
          placeholder="Step-by-step timeline from normal operation to failure." rows={4} />
        <TextBlock label="Observed symptoms" value={eng.description?.symptoms}
          onChange={v => setIn("description", "symptoms", v)}
          placeholder="Noise, vibration, leaks, alarms, performance drop, etc." />
        <TextBlock label="Immediate actions taken" value={eng.description?.immediate}
          onChange={v => setIn("description", "immediate", v)}
          placeholder="Shutdown procedures, isolation, safety measures." />
      </Section>

      {/* 5. Root Cause Analysis */}
      <Section icon={Search} title="5. Root Cause Analysis"
        subtitle="Method, primary cause, contributing factors"
        filled={hasObj(eng.rca)}>
        <SelectField label="Method used" value={eng.rca?.method || ""}
          onChange={v => setIn("rca", "method", v)}
          options={RCA_METHODS} />
        <TextBlock label="Primary cause" value={eng.rca?.primary}
          onChange={v => setIn("rca", "primary", v)}
          placeholder="Detailed explanation of the root cause." />
        <TextBlock label="Contributing factors" value={eng.rca?.contributing}
          onChange={v => setIn("rca", "contributing", v)}
          placeholder="Secondary causes (one per line)." />
        <TextBlock label="Evidence collected" value={eng.rca?.evidence}
          onChange={v => setIn("rca", "evidence", v)}
          placeholder="Photos, sensor data, inspection notes referenced." rows={2} />
      </Section>

      {/* 6. Impact Assessment */}
      <Section icon={AlertOctagon} title="6. Impact Assessment"
        subtitle="Safety, production, financial, environmental"
        filled={impactAreas.some(a => hasObj(impact[a.key]))}>
        {impactAreas.map(area => (
          <div key={area.key} className="rounded-xl bg-slate-50 p-3 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-800">{area.label}</p>
              <select
                value={impact[area.key]?.severity || ""}
                onChange={e => setIn("impact", area.key, { ...(impact[area.key] || {}), severity: e.target.value })}
                className="text-xs font-bold rounded-lg border border-slate-200 bg-white px-2 py-1.5 outline-none">
                {SEVERITY_LEVELS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <input
              value={impact[area.key]?.description || ""}
              onChange={e => setIn("impact", area.key, { ...(impact[area.key] || {}), description: e.target.value })}
              placeholder={area.hint}
              className="w-full text-sm text-slate-700 bg-white rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
          </div>
        ))}
      </Section>

      {/* 7. Corrective Actions */}
      <Section icon={Wrench} title="7. Corrective Actions"
        subtitle={actions.length ? `${actions.length} action${actions.length !== 1 ? "s" : ""}` : "Action items, owners, dates"}
        filled={actions.length > 0}>
        {actions.map((a, i) => (
          <div key={a.id} className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-400 shrink-0">#{i + 1}</span>
              <input value={a.action} onChange={e => patchAction(a.id, { action: e.target.value })}
                placeholder="Action item…"
                className="flex-1 text-sm font-bold text-slate-800 bg-white rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
              <button onClick={() => removeAction(a.id)} className="w-8 h-8 rounded-lg bg-white text-slate-400 flex items-center justify-center shrink-0 border border-slate-100">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={a.responsible} onChange={e => patchAction(a.id, { responsible: e.target.value })}
                placeholder="Responsible"
                className="text-xs text-slate-700 bg-white rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
              <input value={a.target_date} onChange={e => patchAction(a.id, { target_date: e.target.value })}
                placeholder="Target date"
                className="text-xs text-slate-700 bg-white rounded-lg px-2.5 py-2 border border-slate-100 focus:border-red-300 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              {["pending", "in_progress", "done"].map(st => (
                <button key={st} onClick={() => patchAction(a.id, { status: st })}
                  className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                  style={a.status === st
                    ? { background: st === "done" ? "#16A34A" : st === "in_progress" ? "#D97706" : "#DC2626", color: "#fff" }
                    : { background: "#fff", color: "#64748B", border: "1px solid #E2E8F0" }}>
                  {st === "in_progress" ? "In progress" : st === "done" ? "Done" : "Pending"}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button onClick={addAction}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 font-bold text-sm active:bg-slate-50 min-h-[44px]">
          <Plus size={15} /> Add corrective action
        </button>
      </Section>

      {/* 8. Preventive Measures */}
      <Section icon={ShieldCheck} title="8. Preventive Measures"
        subtitle="Design, maintenance, training"
        filled={hasObj(eng.preventive)}>
        <TextBlock label="Design improvements" value={eng.preventive?.design}
          onChange={v => setIn("preventive", "design", v)}
          placeholder="Modifications to prevent recurrence." />
        <TextBlock label="Maintenance changes" value={eng.preventive?.maintenance}
          onChange={v => setIn("preventive", "maintenance", v)}
          placeholder="Frequency, method or scope adjustments." />
        <TextBlock label="Training needs" value={eng.preventive?.training}
          onChange={v => setIn("preventive", "training", v)}
          placeholder="Skills or awareness gaps to address." />
      </Section>

      {/* 9. Supporting Documentation */}
      <Section icon={Paperclip} title="9. Supporting Documentation"
        subtitle="Reference notes for attached evidence"
        filled={has(eng.supporting)}>
        <TextBlock label="Supporting documentation" value={eng.supporting}
          onChange={v => set("supporting", v)}
          placeholder="Photos, diagrams, inspection sheets, sensor logs, vendor reports. (The photos captured in this report are automatically included.)" rows={3} />
      </Section>
    </div>
  );
}
