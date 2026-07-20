// ─── Global Search ────────────────────────────────────────────────────────────
// Fullscreen search overlay across clients, contacts, followups, quotes, notes, equipment.
// Triggered from a search icon in the top header.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Users, UserPlus, Calendar, File as FileIcon,
  Clipboard, Wrench, ArrowRight, TrendingUp,
} from "lucide-react";
import { smartDate } from "../lib/helpers";

const ENTITY_CONFIG = {
  clients: {
    label: "Client",
    icon: Users,
    color: "#5B21B6",
    bg: "#EDE9FE",
    screen: "Clients",
    fields: ["company", "branch", "contact", "phone", "email", "notes", "stage"],
    title: (c) => c.company,
    subtitle: (c) => [c.branch, c.contact].filter(Boolean).join(" · ") || c.stage,
  },
  contacts: {
    label: "Contact",
    icon: UserPlus,
    color: "#7C2D12",
    bg: "#FFE4D9",
    screen: "Contacts",
    fields: ["name", "company", "title", "email", "phone", "met_at", "notes"],
    title: (c) => c.name,
    subtitle: (c) => [c.company, c.title].filter(Boolean).join(" · "),
  },
  followups: {
    label: "Follow-up",
    icon: Calendar,
    color: "#0E7490",
    bg: "#CFFAFE",
    screen: "Followups",
    fields: ["title", "client", "branch", "notes"],
    title: (f) => f.title,
    subtitle: (f) => [f.client, smartDate(f.date)].filter(Boolean).join(" · "),
  },
  quotes: {
    label: "Quote",
    icon: FileIcon,
    color: "#15803D",
    bg: "#DCFCE7",
    screen: "Quotes",
    fields: ["client_name", "description", "status"],
    title: (q) => q.client_name || "Quote",
    subtitle: (q) => `${q.status || "Pending"} · R${parseFloat(q.value || 0).toLocaleString("en-ZA")}`,
  },
  notes: {
    label: "Note",
    icon: Clipboard,
    color: "#92400E",
    bg: "#FEF3C7",
    screen: "Notes",
    fields: ["client", "note", "urgency"],
    title: (n) => n.client || "General Note",
    subtitle: (n) => (n.note || "").slice(0, 80) + ((n.note || "").length > 80 ? "…" : ""),
  },
  leads: {
    icon: TrendingUp,
    color: "#5B21B6",
    label: "Leads",
    screen: "Leads",
    fields: ["title", "client_name", "notes", "stage", "outcome_notes"],
    preview: r => r.title || r.client_name || "Lead",
    sub: r => [r.client_name, r.stage].filter(Boolean).join(" · "),
  },
  equipment: {
    label: "Equipment",
    icon: Wrench,
    color: "#9F1239",
    bg: "#FFE4E6",
    screen: "Equipment",
    fields: ["name", "type", "make", "model", "serial", "location", "client", "notes"],
    title: (e) => e.name,
    subtitle: (e) => [e.make, e.model, e.location].filter(Boolean).join(" · "),
  },
};

// ─── Match a record against the search query ───────────────────────────────────
function recordMatches(record, query, fields) {
  if (!query) return false;
  const q = query.toLowerCase();
  return fields.some(f => {
    const val = record[f];
    if (!val) return false;
    return String(val).toLowerCase().includes(q);
  });
}

// ─── Highlight matching text in a string ──────────────────────────────────────
function HighlightedText({ text, query }) {
  if (!query || !text) return <span>{text}</span>;
  const idx = String(text).toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ background: "#FEF08A", color: "#854D0E", fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </span>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function GlobalSearch({ open, onClose, data, onNavigate }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [open]);

  // Compute results per entity (each capped at 10)
  const results = {};
  let totalCount = 0;

  if (query && query.length >= 1) {
    for (const [entity, config] of Object.entries(ENTITY_CONFIG)) {
      const matches = (data[entity] || []).filter(r => recordMatches(r, query, config.fields));
      if (matches.length > 0) {
        results[entity] = matches.slice(0, 10);
        totalCount += matches.length;
      }
    }
  }

  function handleResultClick(entity) {
    const config = ENTITY_CONFIG[entity];
    if (onNavigate) onNavigate(config.screen, query);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-x-0 top-0 z-[61] bg-white shadow-xl rounded-b-2xl max-h-[85vh] flex flex-col">

            {/* Search input bar */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-slate-100">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients, contacts, notes, follow-ups…"
                className="flex-1 text-base outline-none placeholder:text-slate-400 min-h-[44px]"
              />
              {query && (
                <button onClick={() => setQuery("")} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X size={16} />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center font-bold text-sm">
                Cancel
              </button>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
              {!query && (
                <div className="px-4 py-8 text-center">
                  <Search size={32} className="text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-500">Search across everything</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Type a name, company, phone number, or any keyword.<br />
                    Searches all clients, contacts, notes, follow-ups, quotes, and equipment.
                  </p>
                </div>
              )}

              {query && totalCount === 0 && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-bold text-slate-500">No matches for "{query}"</p>
                  <p className="text-xs text-slate-400 mt-1">Try a shorter or different search term.</p>
                </div>
              )}

              {query && totalCount > 0 && (
                <div className="px-2 py-2">
                  <p className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {totalCount} result{totalCount !== 1 ? "s" : ""}
                  </p>

                  {Object.entries(results).map(([entity, items]) => {
                    const config = ENTITY_CONFIG[entity];
                    const Icon = config.icon;
                    return (
                      <div key={entity} className="mb-3">
                        <div className="px-3 py-1.5 flex items-center gap-2">
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: config.bg, color: config.color }}>
                            <Icon size={11} />
                          </div>
                          <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                            {config.label}{items.length !== 1 ? "s" : ""} ({items.length})
                          </p>
                        </div>
                        <div className="space-y-1">
                          {items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => handleResultClick(entity)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors min-h-[56px]">
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: config.bg, color: config.color }}>
                                <Icon size={15} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-900 truncate">
                                  <HighlightedText text={config.title(item)} query={query} />
                                </p>
                                <p className="text-xs text-slate-500 truncate">
                                  <HighlightedText text={config.subtitle(item)} query={query} />
                                </p>
                              </div>
                              <ArrowRight size={14} className="text-slate-300 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            {query && totalCount > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 text-center" style={{ background: "#F7F3F3" }}>
                <p className="text-xs text-slate-400">
                  Tap a result to jump to that section
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
