// ─── Bulk grouping ───────────────────────────────────────────────────────────
// Reusable multi-select toolbar + "assign to group" bottom sheet, used by both
// Contacts and Field Notes to bulk-tag records into a named group.
//
//   const bulk = useBulkGroup();
//   ...
//   <BulkGroupBar
//     active={bulk.active}
//     count={bulk.selected.size}
//     onCancel={bulk.cancel}
//     onAssign={() => bulk.openAssign()}
//     onEnter={bulk.enter}
//   />
//   <BulkGroupSheet
//     open={bulk.assignOpen}
//     existingGroups={groupNames}
//     onClose={bulk.closeAssign}
//     onConfirm={(name) => { applyGroupToSelected(name); bulk.cancel(); }}
//   />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FolderPlus, Check, Tag } from "lucide-react";
import { BRAND } from "../lib/constants";

const BRAND_PRIMARY = BRAND.primary;

export function useBulkGroup() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const enter = useCallback(() => { setActive(true); setSelected(new Set()); }, []);
  const cancel = useCallback(() => { setActive(false); setSelected(new Set()); setAssignOpen(false); }, []);
  const toggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((ids) => setSelected(new Set(ids)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const openAssign = useCallback(() => setAssignOpen(true), []);
  const closeAssign = useCallback(() => setAssignOpen(false), []);

  return { active, selected, assignOpen, enter, cancel, toggle, selectAll, clear, openAssign, closeAssign };
}

// Toolbar shown while in bulk-select mode
export function BulkGroupBar({ active, count, allCount, onCancel, onAssign, onSelectAll, onClear, label = "contacts" }) {
  if (!active) return null;
  const allSelected = count > 0 && count === allCount;
  return (
    <div className="bg-white rounded-2xl border-2 border-red-200 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-base font-black text-slate-900">{count} selected</p>
          <p className="text-xs text-slate-400">Tap {label} to select, then assign a group</p>
        </div>
        <button onClick={onCancel} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
          <X size={18} />
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => (allSelected ? onClear() : onSelectAll())}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold border border-slate-200 bg-white text-slate-600 min-h-[44px]">
          {allSelected ? <><X size={13} /> Clear all</> : <><Check size={13} /> Select all ({allCount})</>}
        </button>
        <button
          onClick={onAssign}
          disabled={count === 0}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-40 min-h-[44px]"
          style={{ background: BRAND_PRIMARY }}>
          <FolderPlus size={14} /> Assign to group
        </button>
      </div>
    </div>
  );
}

// Bottom sheet to name/pick a group
export function BulkGroupSheet({ open, existingGroups = [], onClose, onConfirm }) {
  const [name, setName] = useState("");

  React.useEffect(() => { if (open) setName(""); }, [open]);

  function confirm(chosen) {
    const clean = (chosen ?? name).trim();
    if (!clean) return;
    onConfirm(clean);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white"
            style={{ maxWidth: 480, margin: "0 auto" }}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
            <div className="px-6 pb-8 pt-3 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-black text-slate-900">Assign to group</p>
                <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500">
                  <X size={16} />
                </button>
              </div>

              <div>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && confirm()}
                  autoFocus
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none focus:border-red-300 focus:bg-white transition-colors"
                  placeholder="New group name…" />
              </div>

              {existingGroups.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 mb-2">Or pick an existing group</p>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {existingGroups.map(g => (
                      <button key={g} onClick={() => confirm(g)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-slate-100 bg-white text-sm font-bold text-slate-700 active:bg-slate-50">
                        <Tag size={12} style={{ color: BRAND_PRIMARY }} /> {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => confirm()} disabled={!name.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-black text-sm disabled:opacity-40 min-h-[52px]"
                style={{ background: BRAND_PRIMARY }}>
                <Check size={16} /> Assign group
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Collapsible group state ─────────────────────────────────────────────────
// Tracks which group headers are collapsed. Shared across Contacts, Notes,
// and Clients so grouped lists can be folded up.
//
//   const groups = useCollapsibleGroups();
//   groups.isCollapsed(name)   -> bool
//   groups.toggle(name)        -> fold/unfold one group
//   groups.collapseAll(names)  -> fold every group
//   groups.expandAll()         -> unfold all
export function useCollapsibleGroups(allNames = null, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = React.useState(() => new Set());
  const [touched, setTouched] = React.useState(false);

  // When defaultCollapsed is on, fold every group the first time we see the
  // group names (and whenever a brand-new group appears), until the user has
  // manually toggled something.
  React.useEffect(() => {
    if (!defaultCollapsed || !allNames) return;
    if (touched) return;
    setCollapsed(new Set(allNames));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCollapsed, allNames ? allNames.join("|") : "", touched]);

  const isCollapsed = React.useCallback((name) => collapsed.has(name), [collapsed]);
  const toggle = React.useCallback((name) => {
    setTouched(true);
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }, []);
  const collapseAll = React.useCallback((names) => setCollapsed(new Set(names)), []);
  const expandAll = React.useCallback(() => setCollapsed(new Set()), []);
  return { isCollapsed, toggle, collapseAll, expandAll };
}

// ─── Rename group sheet ──────────────────────────────────────────────────────
// Renames an existing group. The caller applies the new name to every record
// currently in that group.
//
//   const [renaming, setRenaming] = useState(null); // group name or null
//   ...
//   <RenameGroupSheet
//     open={!!renaming}
//     currentName={renaming}
//     existingGroups={groupNames}
//     onClose={() => setRenaming(null)}
//     onConfirm={(newName) => { renameGroup(renaming, newName); setRenaming(null); }}
//   />
export function RenameGroupSheet({ open, currentName, existingGroups = [], onClose, onConfirm }) {
  const [name, setName] = React.useState(currentName || "");

  React.useEffect(() => { if (open) setName(currentName || ""); }, [open, currentName]);

  const trimmed = name.trim();
  const clash = trimmed && trimmed !== currentName &&
    existingGroups.some(g => g.toLowerCase() === trimmed.toLowerCase());

  function confirm() {
    if (!trimmed || clash || trimmed === currentName) return;
    onConfirm(trimmed);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm" />
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[91] rounded-t-3xl bg-white"
            style={{ maxWidth: 480, margin: "0 auto" }}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
            <div className="px-6 pb-8 pt-3 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-base font-black text-slate-900">Rename group</p>
                <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500">
                  <X size={16} />
                </button>
              </div>

              <p className="text-xs text-slate-400 -mt-2">
                Renaming “{currentName}” updates every record in this group.
              </p>

              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirm()}
                autoFocus
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-900 outline-none focus:border-red-300 focus:bg-white transition-colors"
                placeholder="New group name…" />

              {clash && <p className="text-xs font-bold text-red-500 -mt-2">A group with that name already exists.</p>}

              <button onClick={confirm} disabled={!trimmed || clash || trimmed === currentName}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-black text-sm disabled:opacity-40 min-h-[52px]"
                style={{ background: BRAND_PRIMARY }}>
                <Check size={16} /> Rename
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
