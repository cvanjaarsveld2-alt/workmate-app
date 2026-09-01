// ─── InteractionLog ───────────────────────────────────────────────────────────
// A cold-call / interaction outcome log on a client. Tap a quick outcome
// (Not interested, Has supplier, Call back later…), optionally add a note, and
// it's stamped with the date and saved to the client's `interactions` array.
// Builds a permanent, timestamped record you can show anyone who asks "did we
// ever speak to them?".
//
// After a NEGATIVE outcome (not interested / has supplier / no budget) it offers
// to move the client to the Dormant stage, so dead leads leave the active
// pipeline without being deleted.
//
// Writes through the app's normal hardened sync path (full-row update).
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, MessageSquare, X, Check, MoonStar } from "lucide-react";
import { BRAND, INTERACTION_OUTCOMES } from "../lib/constants";
import { genId } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";

function outcomeMeta(key) {
  return INTERACTION_OUTCOMES.find(o => o.key === key) || { key, label: key, negative: false };
}

export function InteractionLog({ client, setData, userId, teamId }) {
  const [picking, setPicking]   = useState(false);       // outcome picker open
  const [chosen, setChosen]     = useState(null);        // outcome selected, awaiting note
  const [note, setNote]         = useState("");
  const [offerDormant, setOfferDormant] = useState(false); // after negative outcome

  const interactions = Array.isArray(client?.interactions) ? client.interactions : [];
  const sorted = [...interactions].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  function persist(nextClient) {
    const updated = withTeamId({ ...nextClient, sync_status: "pending" }, teamId);
    setData(d => ({
      ...d,
      clients: (d.clients || []).map(c => c.id === client.id ? updated : c),
      syncQueue: [{ id: genId(), table: "clients", action: "update", data: updated, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    offlineSave("clients", updated).catch(() => {});
    triggerImmediateSync();
  }

  function saveInteraction() {
    if (!chosen) return;
    const entry = {
      id: genId(),
      date: new Date().toISOString(),
      outcome: chosen.key,
      label: chosen.label,
      note: note.trim(),
      by: userId,
    };
    const nextInteractions = [entry, ...interactions];
    persist({ ...client, interactions: nextInteractions, last_contacted: entry.date });
    // Reset the composer
    setNote(""); setPicking(false);
    if (chosen.negative) { setOfferDormant(true); }
    setChosen(null);
  }

  function moveToDormant() {
    persist({ ...client, stage: "Dormant" });
    setOfferDormant(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Phone size={15} style={{ color: BRAND.primary }} />
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">Interaction log</span>
        </div>
        <button onClick={() => { setPicking(true); setChosen(null); setNote(""); }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: BRAND.primary }}>
          + Log
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">No interactions logged yet. Tap “+ Log” after a call or visit.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map(it => {
            const m = outcomeMeta(it.outcome);
            return (
              <div key={it.id || it.date} className="rounded-xl px-3 py-2 bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.negative ? "#DC2626" : "#16A34A" }} />
                  <span className="text-sm font-bold text-slate-800">{it.label || m.label}</span>
                  <span className="ml-auto text-[11px] text-slate-400">{(it.date || "").slice(0, 10)}</span>
                </div>
                {it.note && <p className="text-xs text-slate-500 mt-1 pl-4">{it.note}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Outcome picker + note */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setPicking(false)}
            className="fixed inset-0 z-[120] flex items-end justify-center"
            style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}>
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md m-3 rounded-3xl bg-white p-5"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-black text-slate-800">Log interaction</span>
                <button onClick={() => setPicking(false)} className="w-8 h-8 grid place-items-center rounded-full bg-slate-100">
                  <X size={16} className="text-slate-500" />
                </button>
              </div>

              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Outcome</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {INTERACTION_OUTCOMES.map(o => {
                  const active = chosen?.key === o.key;
                  return (
                    <button key={o.key} onClick={() => setChosen(o)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                      style={active
                        ? { borderColor: o.negative ? "#DC2626" : BRAND.primary, background: o.negative ? "#FEF2F2" : BRAND.light, color: o.negative ? "#DC2626" : BRAND.primary }
                        : { borderColor: "#E2E8F0", background: "#fff", color: "#64748B" }}>
                      {o.label}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Note (optional)</p>
              <textarea
                value={note} onChange={e => setNote(e.target.value)}
                rows={3} placeholder="e.g. Spoke to Johan — already using a competitor, revisit next year"
                className="w-full rounded-2xl border border-slate-200 p-3 text-[15px] outline-none focus:border-slate-400 resize-none"
                style={{ fontSize: 16 }} />

              <button onClick={saveInteraction} disabled={!chosen}
                className="w-full mt-3 min-h-[52px] rounded-2xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: BRAND.primary }}>
                <Check size={18} /> Save to log
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offer to move to Dormant after a negative outcome */}
      <AnimatePresence>
        {offerDormant && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOfferDormant(false)}
            className="fixed inset-0 z-[121] flex items-center justify-center px-6"
            style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white p-5 text-center">
              <div className="w-12 h-12 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: "#F1F5F9" }}>
                <MoonStar size={22} style={{ color: "#64748B" }} />
              </div>
              <p className="font-black text-slate-900 mb-1">Move to Dormant?</p>
              <p className="text-sm text-slate-500 mb-4">
                This parks {client.company || "this client"} out of your active pipeline, planner, and reach-outs — but keeps all their history. You can move them back anytime.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setOfferDormant(false)}
                  className="flex-1 min-h-[48px] rounded-2xl font-bold text-slate-500 bg-slate-100">Keep active</button>
                <button onClick={moveToDormant}
                  className="flex-1 min-h-[48px] rounded-2xl font-bold text-white" style={{ background: "#64748B" }}>Move to Dormant</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
