// ─── Core UI Components ───────────────────────────────────────────────────────
// iPhone-first sizing pass:
//   - All interactive elements min 56px tap target
//   - Cards have stronger active press state
//   - Bottom nav NavTab is 72px tall, full-width column tap zone
//   - Form fields 56px min height
//   - Buttons sized for thumb use
import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ChevronDown, Camera } from "lucide-react";
import { BRAND, STAGE_COLORS, NOTE_URGENCY } from "../../lib/constants";
import { daysDiff, smartDate } from "../../lib/helpers";
import { haptic } from "../../lib/haptics";

// ─── Card ─────────────────────────────────────────────────────────────────────
// Tappable cards get a strong iOS-style press state — background dims and
// scales — so the user feels confident the tap registered.
export function Card({ children, className = "", onClick }) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 ${
        onClick
          ? "cursor-pointer transition-all duration-100 active:scale-[0.975] active:bg-slate-50 active:shadow-none"
          : ""
      } ${className}`}
      onClick={onClick ? (e) => { haptic.light(); onClick(e); } : undefined}>
      {children}
    </div>
  );
}

// ─── Btn ──────────────────────────────────────────────────────────────────────
// All buttons are at least 56px tall — comfortable for a thumb on a moving
// vehicle. The "sm" size stays at 48px for compact header buttons.
export function Btn({ children, onClick, disabled, variant = "solid", className = "", type = "button", size = "md" }) {
  const sizes = {
    sm: "px-4 py-3 text-sm rounded-xl min-h-[48px]",
    md: "px-5 py-4 text-base rounded-2xl min-h-[56px]",
    lg: "px-6 py-4 text-base rounded-2xl min-h-[60px]",
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
      onClick={onClick ? (e) => { haptic.light(); onClick(e); } : undefined}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 active:opacity-80 disabled:opacity-40 ${sizes[size]} ${className}`}
      style={vs[variant] || vs.solid}>
      {children}
    </button>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
// 56px min height — easy to tap accurately when the phone is bouncing.
export function Field({ label, value, onChange, placeholder = "", type = "text", multiline = false, required = false, maxLength }) {
  const cls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[56px]";
  return (
    <div>
      {label && (
        <label className="mb-2 block text-sm font-bold text-slate-500">
          {label}{required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {multiline
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={4} maxLength={maxLength || 5000} className={cls + " resize-none min-h-[100px]"} />
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
      {label && <label className="mb-2 block text-sm font-bold text-slate-500">{label}</label>}
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base outline-none focus:border-red-300 focus:bg-white transition-colors min-h-[56px]">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── PhotoField ───────────────────────────────────────────────────────────────
export function PhotoField({ photos = [], onAdd, onView, onRemove, label = "Photos", compact = false, disabled = false }) {
  const hasPhotos = photos.length > 0;

  if (compact) {
    return (
      <div>
        {label && <p className="mb-2 text-sm font-bold text-slate-500">{label}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <div key={i} className="relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 border-slate-200 bg-slate-50">
              <button type="button" onClick={() => onView?.(i)} className="absolute inset-0">
                <img src={p.url} alt={p.caption || `Photo ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              {onRemove && (
                <button type="button" onClick={() => onRemove(i)}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center active:bg-red-600/80">
                  <X size={12} className="text-white" />
                </button>
              )}
            </div>
          ))}
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="shrink-0 w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1.5 active:bg-red-50 active:border-red-300 transition-colors">
              <Camera size={20} style={{ color: "#8B1A1A" }} />
              <span className="text-xs font-bold text-slate-400">Add</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{label}</p>
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 min-h-[40px]"
              style={{ color: "#8B1A1A", background: "#F7F3F3" }}>
              <Camera size={13} /> Add photo
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
                  className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center active:bg-red-600/80">
                  <X size={13} className="text-white" />
                </button>
              )}
            </div>
          ))}
          {!disabled && onAdd && (
            <button type="button" onClick={onAdd}
              className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 active:border-red-300 active:bg-red-50 transition-colors"
              style={{ aspectRatio: "4/3" }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
                <Camera size={20} style={{ color: "#8B1A1A" }} />
              </div>
              <span className="text-xs font-bold text-slate-400">Add photo</span>
            </button>
          )}
        </div>
      ) : (
        !disabled && onAdd && (
          <button type="button" onClick={onAdd}
            className="w-full h-28 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center gap-3 active:border-red-300 active:bg-red-50 transition-colors">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#F7F3F3" }}>
              <Camera size={20} style={{ color: "#8B1A1A" }} />
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
      {label && <label className="mb-2 block text-sm font-bold text-slate-500">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-base text-left flex items-center justify-between outline-none focus:border-red-300 min-h-[56px] transition-colors">
        <span className={selected ? "text-slate-900 font-medium" : "text-slate-400"}>
          {selected ? `${selected.company}${selected.branch ? ` — ${selected.branch}` : ""}` : placeholder}
        </span>
        <ChevronDown size={18} className="text-slate-400 shrink-0" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-1 w-full bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-64 flex flex-col">
            <div className="p-2 border-b border-slate-50">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
                className="w-full rounded-lg bg-slate-50 px-3 py-2.5 text-sm outline-none min-h-[44px]" />
            </div>
            <div className="overflow-y-auto">
              <button type="button"
                onClick={() => { onChange(null); setOpen(false); setSearch(""); }}
                className="w-full text-left px-4 py-3.5 text-sm text-slate-400 hover:bg-slate-50 border-b border-slate-50 min-h-[52px]">
                — No client
              </button>
              {filtered.map(c => (
                <button key={c.id} type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                  className={`w-full text-left px-4 py-3.5 text-sm hover:bg-slate-50 transition-colors min-h-[52px] ${c.id === value ? "font-bold text-red-700 bg-red-50" : "text-slate-800"}`}>
                  <span className="font-bold">{c.company}</span>
                  {c.branch && <span className="text-slate-400 ml-1">— {c.branch}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">No clients found</p>}
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
      <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-slate-100 bg-white py-3.5 pl-11 pr-11 text-base outline-none focus:border-red-300 transition-colors min-h-[56px]" />
      {value && (
        <button onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ─── FilterPills ──────────────────────────────────────────────────────────────
// Pills are taller (44px) so they're easy to tap while scrolling
export function FilterPills({ options, value, onChange, dangerValue }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-all min-h-[44px] ${
            value === o ? "text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500"
          }`}
          style={value === o ? {
            background: o === dangerValue ? "#DC2626" : o === "Due Soon" ? "#D97706" : BRAND.primary
          } : {}}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function Toast({ message, onDone, type = "success" }) {
  const duration = Math.max(2200, Math.min(message.length * 55, 6000));
  useEffect(() => {
    // Tactile feedback whenever a toast appears — every save/action feels physical
    if (type === "error") haptic.error();
    else haptic.success();
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="fixed bottom-28 left-4 right-4 z-50 flex justify-start pointer-events-none"
      style={{ maxWidth: "calc(100vw - 2rem)" }}>
      <div className="rounded-2xl px-5 py-3.5 shadow-lg max-w-sm w-full"
        style={{ background: "#1e293b", color: "#fff" }}>
        <p className="text-sm font-bold leading-snug whitespace-normal break-words">{message}</p>
      </div>
    </motion.div>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────
export function Empty({ title, text, icon: Icon, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {Icon && (
        <div className="w-18 h-18 rounded-2xl flex items-center justify-center mb-4" style={{ background: BRAND.light, width: 72, height: 72 }}>
          <Icon size={30} style={{ color: BRAND.primary }} />
        </div>
      )}
      <p className="text-lg font-black text-slate-700 mb-1.5">{title}</p>
      {text && <p className="text-sm text-slate-400 leading-relaxed max-w-[260px]">{text}</p>}
      {actionLabel && onAction && (
        <button onClick={() => { haptic.light(); onAction(); }}
          className="mt-5 px-5 py-3 rounded-2xl text-white text-sm font-black min-h-[48px] active:scale-[0.97] transition-transform"
          style={{ background: BRAND.primary }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color, icon: Icon }) {
  const accent = color || BRAND.primary;
  // Soft tint of the accent for the icon chip background
  const chipBg = `${accent}14`;
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        {Icon && (
          <div className="rounded-[9px] shrink-0 flex items-center justify-center" style={{ background: chipBg, width: 30, height: 30 }}>
            <Icon size={15} style={{ color: accent }} />
          </div>
        )}
      </div>
      {/* Number is neutral dark so the row reads as one clean data set — colour lives in the icon */}
      <p className="text-[26px] font-black leading-none tracking-tight text-slate-900">{value}</p>
      {/* Sentence-case label below the number */}
      <p className="mt-1.5 text-[11px] font-bold text-slate-400 leading-tight">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400 leading-snug">{sub}</p>}
    </Card>
  );
}

// ─── NavTab ───────────────────────────────────────────────────────────────────
// 72px tall, full-width column tap zone — the entire column is tappable,
// not just the icon. Active state uses a pill under the icon.
export function NavTab({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick ? (e) => { haptic.light(); onClick(e); } : undefined}
      className="relative flex flex-col items-center justify-center gap-1 flex-1 transition-all"
      style={{ minHeight: 72, color: active ? BRAND.primary : "#94A3B8" }}>
      <div className={`rounded-2xl px-3 py-1.5 transition-all ${active ? "bg-red-50" : ""}`}>
        <Icon size={22} />
      </div>
      <span className="text-[11px] font-bold leading-none">{label}</span>
      {!!badge && (
        <span className="absolute right-1 top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white font-black min-w-[18px] text-center leading-none">
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
      {subtitle && <p className="mt-1 text-sm text-slate-400 leading-snug">{subtitle}</p>}
    </div>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-2 mt-1">
      <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{title}</p>
      {action && onAction && (
        <button onClick={onAction} className="text-xs font-bold py-2 px-3 rounded-xl min-h-[40px]"
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
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: c.bg, color: c.text }}>
      <span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />
      {stage}
    </span>
  );
}

// ─── ServiceBadge ─────────────────────────────────────────────────────────────
export function ServiceBadge({ dueDate }) {
  const d = daysDiff(dueDate);
  if (d === null) return null;
  if (d < 0)   return <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Overdue</span>;
  if (d <= 3)  return <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-700">Due in {d}d</span>;
  if (d <= 14) return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">Due {smartDate(dueDate)}</span>;
  return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">{smartDate(dueDate)}</span>;
}

// ─── UrgencyBadge ─────────────────────────────────────────────────────────────
export function UrgencyBadge({ urgency = "Normal" }) {
  const u = NOTE_URGENCY[urgency] || NOTE_URGENCY.Normal;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold border"
      style={{ background: u.bg, color: u.text, borderColor: u.border }}>
      <span className="w-2 h-2 rounded-full" style={{ background: u.dot }} />
      {urgency}
    </span>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
// Buttons are 60px tall — hard to miss even in a panic delete situation
export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = "Delete", confirmVariant = "danger" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-8"
      onClick={onCancel}>
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <p className="text-base font-bold text-slate-800 text-center pt-1">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 rounded-2xl border-2 border-slate-200 py-4 text-sm font-bold text-slate-600 active:scale-95 active:bg-slate-50 transition-all min-h-[60px]">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`flex-1 rounded-2xl py-4 text-sm font-bold text-white active:scale-95 active:opacity-80 transition-all min-h-[60px] ${confirmVariant === "danger" ? "bg-red-600" : "bg-green-600"}`}>
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
