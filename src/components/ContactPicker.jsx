// ─── Contact Picker Sheet ─────────────────────────────────────────────────────
// Multi-select sheet for linking contacts to notes (or other entities)
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, CheckSquare, Square, User, UserPlus } from "lucide-react";

export function ContactPicker({ contacts, selectedIds, onChange, onClose }) {
  const [search, setSearch] = useState("");

  const filtered = (contacts || [])
    .filter(c => !search || [c.name, c.company, c.title, c.email]
      .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  function toggle(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">

        <div className="flex justify-center pt-2 pb-1">
          <div className="w-12 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-slate-900">Link Contacts</p>
            <p className="text-xs text-slate-500">{selectedIds.length} selected · {contacts.length} total</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <button onClick={clearAll} className="text-xs font-bold text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                Clear
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-300 focus:bg-white min-h-[40px]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center">
              <UserPlus size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-500">
                {contacts.length === 0 ? "No contacts yet" : "No matches"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {contacts.length === 0 ? "Add contacts on the Contacts screen first." : "Try a different search term."}
              </p>
            </div>
          )}

          <div className="divide-y divide-slate-50">
            {filtered.map(c => {
              const isSelected = selectedIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left min-h-[60px] transition-colors ${
                    isSelected ? "bg-red-50" : ""
                  }`}>
                  <div className="shrink-0">
                    {isSelected
                      ? <CheckSquare size={22} className="text-red-600" />
                      : <Square size={22} className="text-slate-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{c.name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {c.company || "(no company)"}{c.title ? ` · ${c.title}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100" style={{ background: "#F7F3F3" }}>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
            style={{ background: "#8B1A1A" }}>
            Done ({selectedIds.length} linked)
          </button>
        </div>
      </motion.div>
    </>
  );
}

export function LinkedContactsDisplay({ contactIds, contacts, onRemove, size = "sm" }) {
  if (!contactIds || contactIds.length === 0) return null;

  const linkedContacts = contactIds
    .map(id => contacts.find(c => c.id === id))
    .filter(Boolean);

  if (linkedContacts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {linkedContacts.map(c => (
        <span
          key={c.id}
          className={`inline-flex items-center gap-1 rounded-full px-2 ${size === "sm" ? "py-0.5 text-xs" : "py-1 text-sm"} font-bold`}
          style={{ background: "#FFE4D9", color: "#7C2D12" }}>
          <User size={size === "sm" ? 10 : 12} />
          {c.name}
          {c.company && <span className="opacity-60">· {c.company}</span>}
          {onRemove && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(c.id); }} className="ml-0.5 hover:opacity-70">
              <X size={size === "sm" ? 10 : 12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
