// ─── Contact Picker Sheet ─────────────────────────────────────────────────────
// Multi-select sheet for linking contacts to notes — with inline quick-add,
// so a person you just met can be created and linked without leaving the note.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, CheckSquare, Square, User, UserPlus, Check, ChevronDown, ChevronRight, Tag } from "lucide-react";

const inputCls = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-2.5 px-3 text-sm outline-none focus:border-red-300 focus:bg-white min-h-[44px]";

export function ContactPicker({ contacts, selectedIds, onChange, onClose, onCreate }) {
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (name) => setExpandedGroups(prev => ({ ...prev, [name]: !prev[name] }));
  const [newContact, setNewContact] = useState({ name: "", company: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const filtered = (contacts || [])
    .filter(c => !search || [c.name, c.company, c.title, c.email]
      .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Group filtered contacts by category (fallback "(No group)"), matching the
  // Contacts screen. Groups are collapsible; "(No group)" sorts last.
  const grouped = (() => {
    const map = {};
    for (const c of filtered) {
      const key = (c.category?.trim()) || "(No group)";
      (map[key] = map[key] || []).push(c);
    }
    const names = Object.keys(map).sort((a, b) => {
      if (a === "(No group)") return 1;
      if (b === "(No group)") return -1;
      return a.localeCompare(b);
    });
    return names.map(name => ({ name, items: map[name] }));
  })();

  function toggle(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  }

  function clearAll() {
    onChange([]);
  }

  function openNewForm(prefillName) {
    setNewContact({ name: prefillName || "", company: "", phone: "" });
    setShowNew(true);
  }

  async function handleCreate() {
    if (!newContact.name.trim() || !onCreate || saving) return;
    setSaving(true);
    const id = await onCreate(newContact);
    setSaving(false);
    if (id) {
      onChange([...selectedIds, id]);
      setNewContact({ name: "", company: "", phone: "" });
      setShowNew(false);
      setSearch("");
    }
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

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-base font-black text-slate-900">{showNew ? "New Contact" : "Link Contacts"}</p>
            <p className="text-xs text-slate-500">
              {showNew ? "Create and link in one step" : `${selectedIds.length} selected · ${contacts.length} total`}
            </p>
          </div>
          <div className="flex gap-2">
            {!showNew && selectedIds.length > 0 && (
              <button onClick={clearAll} className="text-xs font-bold text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                Clear
              </button>
            )}
            {showNew && (
              <button onClick={() => setShowNew(false)} className="text-xs font-bold text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                ← Back to list
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>
        </div>

        {!showNew ? (
          <>
            {/* Search + New */}
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search contacts…"
                  className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-300 focus:bg-white min-h-[44px]"
                />
              </div>
              {onCreate && (
                <button
                  onClick={() => openNewForm(search.trim())}
                  className="shrink-0 flex items-center gap-1 rounded-xl px-3 text-sm font-bold min-h-[44px] border-2 transition-colors"
                  style={{ background: "#FFE4D9", color: "#7C2D12", borderColor: "#F8D5C4" }}>
                  <UserPlus size={14} /> New
                </button>
              )}
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <UserPlus size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-500">
                    {contacts.length === 0 ? "No contacts yet" : "No matches"}
                  </p>
                  {onCreate ? (
                    <button
                      onClick={() => openNewForm(search.trim())}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold min-h-[44px]"
                      style={{ background: "#FFE4D9", color: "#7C2D12" }}>
                      <UserPlus size={14} />
                      {search.trim() ? `Add "${search.trim()}" as new contact` : "Add a new contact"}
                    </button>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      {contacts.length === 0 ? "Add contacts on the Contacts screen first." : "Try a different search term."}
                    </p>
                  )}
                </div>
              )}

              {grouped.map(group => {
                // Collapsed by default. While searching, force-expand so
                // matching contacts are visible without extra taps.
                const isCollapsed = search.trim() ? false : !expandedGroups[group.name];
                return (
                  <div key={group.name}>
                    {/* Group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.name)}
                      className="w-full sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-y border-slate-100 text-left">
                      {isCollapsed
                        ? <ChevronRight size={16} className="text-slate-400 shrink-0" />
                        : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                      <Tag size={13} className="text-red-700 shrink-0" />
                      <span className="text-sm font-bold text-slate-800 truncate flex-1">{group.name}</span>
                      <span className="text-xs text-slate-400 shrink-0">{group.items.length}</span>
                    </button>

                    {/* Group members */}
                    {!isCollapsed && (
                      <div className="divide-y divide-slate-50">
                        {group.items.map(c => {
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
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100" style={{ background: "#F7F3F3" }}>
              <button
                onClick={onClose}
                className="w-full rounded-xl py-3 text-sm font-bold text-white min-h-[48px]"
                style={{ background: "#8B1A1A" }}>
                Done ({selectedIds.length} linked)
              </button>
            </div>
          </>
        ) : (
          <>
            {/* New contact mini-form */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Name <span className="text-red-500">*</span></label>
                <input autoFocus value={newContact.name}
                  onChange={(e) => setNewContact(c => ({ ...c, name: e.target.value }))}
                  placeholder="e.g. John Smith" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Company</label>
                <input value={newContact.company}
                  onChange={(e) => setNewContact(c => ({ ...c, company: e.target.value }))}
                  placeholder="e.g. ACME Mining" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-500">Phone</label>
                <input type="tel" value={newContact.phone}
                  onChange={(e) => setNewContact(c => ({ ...c, phone: e.target.value }))}
                  placeholder="+27 ..." className={inputCls} />
              </div>
              <p className="text-xs text-slate-400">
                Saved as a Lead. Email, title and other details can be added later on the Contacts screen.
              </p>
            </div>

            <div className="px-4 py-3 border-t border-slate-100" style={{ background: "#F7F3F3" }}>
              <button
                onClick={handleCreate}
                disabled={!newContact.name.trim() || saving}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold text-white min-h-[48px] disabled:opacity-40"
                style={{ background: "#8B1A1A" }}>
                <Check size={15} /> {saving ? "Saving…" : "Add & Link"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

// ─── Display chips of linked contacts (used in note cards & forms) ──────────
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
