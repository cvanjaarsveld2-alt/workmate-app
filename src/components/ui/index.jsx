// ─── Core UI Components ───────────────────────────────────────────────────────
// All reusable primitives used across every screen in PowerMate
// Import what you need: import { Card, Btn, Field } from "../components/ui"

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Users, ChevronDown } from "lucide-react";
import { BRAND, STAGE_COLORS, NOTE_URGENCY } from "../../lib/constants";
import { daysDiff, smartDate } from "../../lib/helpers";

// ─── Card ───────────────────────────────────────────────────────────────────── 
export function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}
      onClick={onClick}>
      {children}
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, disabled, variant = "solid", className = "", type = "button", size = "md" }) {
  const sizes = {
    sm: "px-4 py-2.5 text-sm rounded-xl min-h-[44px]",
    md: "px-5 py-3.5 text-sm rounded-2xl min-h-[48px]",
    lg: "px-6 py-4 text-base rounded-2xl min-h-[52px]",
  };
  const vs = {
    solid:     { background: BRAND.primary, color: "#fff" },
    outline:   { background: "#fff", color: BRAND.primary, border: `2px solid ${BRAND.primary}` },
    danger:    { background: "#DC2626", color: "#fff" },
    secondary: { background: BRAND.light, color: BRAND.primary },
    success:   { background: "#16A34A", color: "#fff" },
    warning:   { background: "#D97706", color: "#fff" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-40 ${sizes[size]} ${className}`}
      style={vs[variant] || vs.solid}>
      {children}
    </button>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
export function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false, required = false, maxLength }) {
  const cls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors";
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-bold text-slate-500">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {multiline
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} maxLength={maxLength || 5000} className={cls + " resize-none"} />
        : <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength || 500} className={cls} />
      }
      {maxLength && (value || "").length > maxLength * 0.85 && (
        <p className="mt-1 text-xs text-slate-400 text-right">{(value || "").length}/{maxLength}</p>
      )}
    </div>
  );
}

// ─── SelectField ────────────────────────────────────────────────────────────── 
export function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-sm font-bold text-slate-500">{label}</label>}
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── ClientSelector ───────────────────────────────────────────────────────────
export function ClientSelector({ label, value, onChange, clients = [], placeholder = "Select client…" }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = clients.filter(c =>
    !search ||
    c.company?.toLowerCase().includes(search.toLowerCase()) ||
    c.branch?.toLowerCase().includes(search.toLowerCase())
  );

  const selected = clients.find(c => c.id === value);

  return (
    <div ref={ref} className="relative">
      {label && <label className="mb-1.5 block text-sm font-bold text-slate-500">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base text-left flex items-center justify-between outline-none focus:border-red-300 min-h-[52px] transition-colors">
        <span className={selected ? "text-slate-900 font-medium" : "text-slate-400"}>
          {selected ? `${selected.company}${selected.branch ? ` — ${selected.branch}` : ""}` : placeholder}
        </span>
        <ChevronDown size={16} className="text-slate-400 shrink-0" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 flex flex-col">
            <div className="p-2 border-b border-slate-50">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm outline-none" />
            </div>
            <div className="overflow-y-auto">
              <button type="button"
                onClick={() => { onChange(null); setOpen(false); setSearch(""); }}
                className="w-full text-left px-4 py-3 text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-50">
                — No client
              </button>
              {filtered.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 transition-colors ${c.id === value ? "font-bold text-red-700 bg-red-50" : "text-slate-800"}`}>
                  <span className="font-bold">{c.company}</span>
                  {c.branch && <span className="text-slate-400 ml-1">— {c.branch}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No clients found</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SearchBar ────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-3 pl-10 pr-10 text-base outline-none focus:border-red-300 transition-colors min-h-[48px]" />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 p-1">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

// ─── FilterPills ──────────────────────────────────────────────────────────────
export function FilterPills({ options, value, onChange, dangerValue }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-all min-h-[40px] ${value === o ? "text-white" : "bg-white border border-slate-200 text-slate-500"}`}
          style={value === o ? { background: o === dangerValue ? "#DC2626" : o === "Due Soon" ? "#D97706" : BRAND.primary } : {}}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────── 
export function Toast({ message, onDone, type = "success" }) {
  // Longer messages (like detailed error text) get more time on screen —
  // a one-word "Saved" doesn't need the same 2.4s as a full error sentence.
  const duration = Math.min(2400 + Math.max(0, (message?.length || 0) - 20) * 60, 6000);
  useEffect(() => { const t = setTimeout(onDone, duration); return () => clearTimeout(t); }, []);
  const bg = type === "error" ? "#DC2626" : BRAND.primary;
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
      className="fixed bottom-24 left-4 z-50 rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-lg"
      style={{ background: bg, maxWidth: "calc(100vw - 32px)", textAlign: "left" }}>
      {type === "success" ? "✓ " : "✗ "}{message}
    </motion.div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
export function Empty({ title, text, icon: Icon = Users }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-10 text-center">
      <div className="mx-auto mb-3 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: BRAND.light }}>
        <Icon size={24} style={{ color: BRAND.primary }} />
      </div>
      <p className="font-bold text-slate-800 text-base">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{text}</p>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = BRAND.primary, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</p>
          <p className="mt-1 text-2xl font-black" style={{ color }}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
        {Icon && (
          <div className="rounded-xl p-2.5" style={{ background: BRAND.light }}>
            <Icon size={18} style={{ color }} />
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── NavTab ───────────────────────────────────────────────────────────────────
export function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-all min-h-[56px]"
      style={{ color: active ? BRAND.primary : "#94A3B8" }}>
      <div className={`rounded-xl p-2 transition-all ${active ? "bg-red-50" : ""}`}>
        <Icon size={20} />
      </div>
      <span className="leading-none">{label}</span>
      {!!badge && (
        <span className="absolute right-0.5 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white font-black min-w-[18px] text-center">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: BRAND.light }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-slate-200 animate-spin" style={{ borderTopColor: BRAND.primary }} />
        <p className="text-sm font-bold text-slate-400">Loading PowerMate…</p>
      </div>
    </div>
  );
}

// ─── DataLoadingScreen ────────────────────────────────────────────────────────
export function DataLoadingScreen() {
  return (
    <div className="min-h-screen pb-28" style={{ background: BRAND.light }}>
      <main className="mx-auto max-w-2xl px-4 pt-4 space-y-4">
        <div className="flex items-start justify-between mb-5">
          <div className="space-y-2">
            <div className="h-7 w-32 rounded-xl bg-slate-200 animate-pulse" />
            <div className="h-4 w-48 rounded-xl bg-slate-100 animate-pulse" />
          </div>
          <div className="h-8 w-16 rounded-xl bg-slate-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100">
              <div className="h-4 w-20 rounded-lg bg-slate-100 animate-pulse mb-2" />
              <div className="h-8 w-12 rounded-lg bg-slate-200 animate-pulse mb-1" />
              <div className="h-3 w-24 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-16 rounded-lg bg-slate-100 animate-pulse" />
              <div className="flex-1 h-2.5 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-4 w-6 rounded-lg bg-slate-100 animate-pulse" />
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 pt-4">Syncing your data…</p>
      </main>
    </div>
  );
}

// ─── StagePill ────────────────────────────────────────────────────────────────
export function StagePill({ stage }) {
  const c = STAGE_COLORS[stage] || STAGE_COLORS["New Lead"];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: c.bg, color: c.text }}>
      <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
      {stage}
    </span>
  );
}

// ─── ServiceBadge ─────────────────────────────────────────────────────────────
export function ServiceBadge({ dueDate }) {
  const d = daysDiff(dueDate);
  if (d === null) return null;
  if (d < 0)  return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">⚠️ Overdue</span>;
  if (d <= 3) return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">Due in {d}d</span>;
  if (d <= 14) return <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Due {smartDate(dueDate)}</span>;
  return <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">{smartDate(dueDate)}</span>;
}

// ─── UrgencyBadge ─────────────────────────────────────────────────────────────
export function UrgencyBadge({ urgency = "Normal" }) {
  const u = NOTE_URGENCY[urgency] || NOTE_URGENCY.Normal;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border"
      style={{ background: u.bg, color: u.text, borderColor: u.border }}>
      <span className="w-2 h-2 rounded-full" style={{ background: u.dot }} />
      {urgency}
    </span>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = "Delete", confirmVariant = "danger" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-8"
      onClick={onCancel}>
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-slate-800 text-center">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-2xl border-2 border-slate-200 py-3.5 text-sm font-bold text-slate-600 active:scale-95 transition-transform">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-2xl py-3.5 text-sm font-bold text-white active:scale-95 transition-transform ${confirmVariant === "danger" ? "bg-red-600" : "bg-green-600"}`}>
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── useConfirm hook ──────────────────────────────────────────────────────────
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise(resolve => {
      setState({ message, options, resolve });
    });
  }, []);

  const dialog = state ? (
    <AnimatePresence>
      <ConfirmDialog
        message={state.message}
        confirmLabel={state.options.confirmLabel || "Confirm"}
        confirmVariant={state.options.confirmVariant || "danger"}
        onConfirm={() => { setState(null); state.resolve(true); }}
        onCancel={() => { setState(null); state.resolve(false); }}
      />
    </AnimatePresence>
  ) : null;

  return { confirm, dialog };
}
