// ─── Core UI Components ───────────────────────────────────────────────────────
// All reusable primitives used across every screen in PowerMate.
// Upgraded UI: sharper typography, stronger brand presence, consistent spacing.
// New: PhotoField — a universal photo add/view/replace widget for all screens.

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Users, ChevronDown, Camera, Plus, ImageIcon } from "lucide-react";
import { BRAND, STAGE_COLORS, NOTE_URGENCY } from "../../lib/constants";
import { daysDiff, smartDate } from "../../lib/helpers";

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${onClick ? "cursor-pointer active:scale-[0.985] transition-transform" : ""} ${className}`}
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
    ghost:     { background: "transparent", color: "#64748B", border: "2px solid #E2E8F0" },
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
  const cls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[52px]";
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-sm font-bold text-slate-500">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {multiline
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} maxLength={maxLength || 5000} className={cls + " resize-none min-h-[96px]"} />
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

// ─── PhotoField ───────────────────────────────────────────────────────────────
// Universal photo widget. Used on Notes, Equipment, Contacts, Clients, etc.
// Shows existing photos in a thumbnail grid.
// "Add" opens the provided onAdd callback (typically a scanner or file picker).
// Tapping a photo calls onView(index).
// Holding (or using the × button) calls onRemove(index).
//
// Props:
//   photos:    array of { url, caption? } objects (resolved URLs)
//   onAdd:     () => void — called when the user taps "Add photo"
//   onView:    (index) => void — called when user taps a photo
//   onRemove:  (index) => void — called when user removes a photo (optional)
//   label:     string — section label (default "Photos")
//   compact:   bool — single row, no grid (for tight form areas)
export function PhotoField({ photos = [], onAdd, onView, onRemove, label = "Photos", compact = false, disabled = false }) {
  const hasPhotos = photos.length > 0;

  if (compact) {
    // Horizontal scroll row — used in form contexts
    return (
      <div>
        {label && <p className="mb-1.5 text-sm font-bold text-slate-500">{label}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <div key={i} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50">
              <button type="button" onClick={() => onView?.(i)} className="absolute inset-0">
                <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              {onRemove && (
                <button type="button" onClick={() => onRemove(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                  <X size={10} className="text-white" />
                </button>
              )}
            </div>
          ))}
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 hover:border-red-300 hover:bg-red-50 active:scale-95 transition-all">
              <Camera size={18} style={{ color: "#8B1A1A" }} />
              <span className="text-[10px] font-bold text-slate-400">Add</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid layout — used in detail / full section views
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{label}</p>
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="flex items-center gap-1 text-xs font-bold rounded-lg px-2.5 py-1.5 min-h-[32px]"
              style={{ color: "#8B1A1A", background: "#F7F3F3" }}>
              <Camera size={12} /> Add photo
            </button>
          )}
        </div>
      )}
      {hasPhotos ? (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ aspectRatio: "4/3" }}>
              <button type="button" onClick={() => onView?.(i)} className="absolute inset-0 w-full h-full">
                <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              {p.caption && (
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-black/50">
                  <p className="text-[10px] text-white font-medium leading-tight truncate">{p.caption}</p>
                </div>
              )}
              {onRemove && (
                <button type="button" onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center active:bg-red-600/80">
                  <X size={11} className="text-white" />
                </button>
              )}
            </div>
          ))}
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 hover:border-red-300 hover:bg-red-50 active:scale-95 transition-all"
              style={{ aspectRatio: "4/3" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
                <Camera size={18} style={{ color: "#8B1A1A" }} />
              </div>
              <span className="text-xs font-bold text-slate-400">Add photo</span>
            </button>
          )}
        </div>
      ) : (
        !disabled && onAdd && (
          <button type="button" onClick={onAdd}
            className="w-full h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center gap-3 hover:border-red-300 hover:bg-red-50 active:scale-98 transition-all">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
              <Camera size={18} style={{ color: "#8B1A1A" }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-600">Add a photo</p>
              <p className="text-xs text-slate-400 mt-0.5">Tap to open camera</p>
            </div>
          </button>
        )
      )}
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
  const scrollRef = useRef(null);
  return (
    <div className="relative">
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-1 scroll-smooth" style={{ scrollbarWidth: "none" }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-all min-h-[40px] ${value === o ? "text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}
            style={value === o ? {
              background: o === dangerValue ? "#DC2626" : o === "Due Soon" ? "#D97706" : BRAND.primary
            } : {}}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ message, onDone }) {
  const duration = Math.max(2200, Math.min(message.length * 55, 6000));
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="fixed bottom-24 left-4 right-4 z-50 flex justify-start pointer-events-none"
      style={{ maxWidth: "calc(100vw - 2rem)" }}>
      <div
        className="rounded-2xl px-4 py-3 shadow-lg max-w-sm w-full"
        style={{ background: "#1e293b", color: "#fff" }}>
        <p className="text-sm font-bold leading-snug whitespace-normal break-words">{message}</p>
      </div>
    </motion.div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────
export function Empty({ title, text, icon: Icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: BRAND.light }}>
          <Icon size={28} style={{ color: BRAND.primary }} />
        </div>
      )}
      <p className="text-base font-black text-slate-700 mb-1">{title}</p>
      {text && <p className="text-sm text-slate-400 leading-relaxed max-w-[240px]">{text}</p>}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color, icon: Icon }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate">{label}</p>
          <p className="mt-1 text-2xl font-black leading-none" style={{ color: color || BRAND.primary }}>{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 leading-snug">{sub}</p>}
        </div>
        {Icon && (
          <div className="rounded-xl p-2.5 shrink-0" style={{ background: BRAND.light }}>
            <Icon size={18} style={{ color: color || BRAND.primary }} />
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
    <div className="mb-2">
      <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-slate-400 leading-snug">{subtitle}</p>}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
// Lightweight section divider with optional action button
export function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{title}</p>
      {action && onAction && (
        <button onClick={onAction} className="text-xs font-bold py-1 px-2.5 rounded-lg min-h-[28px]"
          style={{ color: BRAND.primary, background: BRAND.light }}>
          {action}
        </button>
      )}
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
  if (d < 0)   return <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">⚠️ Overdue</span>;
  if (d <= 3)  return <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">Due in {d}d</span>;
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
