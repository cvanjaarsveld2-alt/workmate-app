// ─── Cold Call Log ────────────────────────────────────────────────────────────
// A fast entry for logging cold calls to people who AREN'T clients yet. Type a
// name + number, pick the outcome, optionally add a note. Saving creates a
// lightweight LEAD (stage "New Lead") with the call logged in its interactions —
// so the call flows into your pipeline instead of a separate silo. Interested
// prospects surface in Clients; dead ones can be parked as Dormant later.
//
// If the outcome is "Call back later", it asks for a date and auto-creates a
// follow-up so the callback lands in your calendar and won't be forgotten.
//
// All writes go through the app's hardened sync path.
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Check, Calendar as CalendarIcon, PhoneCall } from "lucide-react";
import { BRAND, INTERACTION_OUTCOMES } from "../lib/constants";
import { Card, Field, PageHeader, Toast } from "../components/ui";
import { genId, todayISO } from "../lib/helpers";
import { withTeamId } from "../lib/teamId";
import { triggerImmediateSync } from "../lib/sync";
import { offlineSave } from "../offline/offlineDb";

export function ColdCallScreen({ data, setData, userId, teamId, onNavigate }) {
  const [name, setName]       = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone]     = useState("");
  const [outcome, setOutcome] = useState(null);
  const [note, setNote]       = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [toast, setToast]     = useState("");
  const [savedName, setSavedName] = useState(null); // for the "logged ✓" confirmation

  const isCallback = outcome?.key === "call_back";
  const canSave = (name.trim() || company.trim()) && outcome;

  // Recent cold calls logged (leads created via this screen), for quick reference.
  const recent = (data.clients || [])
    .filter(c => c.source === "Cold call" && (c.user_id === userId || c.assigned_to_user_id === userId))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 6);

  function save() {
    if (!canSave) return;
    const now = new Date().toISOString();
    const leadId = genId();

    const interaction = {
      id: genId(),
      date: now,
      outcome: outcome.key,
      label: outcome.label,
      note: note.trim(),
      by: userId,
    };

    // Create the lead record with the call attached.
    const lead = withTeamId({
      id: leadId,
      user_id: userId,
      company: company.trim() || name.trim(),   // company is the pipeline label
      contact: name.trim(),
      phone: phone.trim(),
      email: "",
      stage: "New Lead",
      source: "Cold call",
      category: "",
      division: "",
      notes: "",
      interactions: [interaction],
      last_contacted: now,
      sync_status: "pending",
      created_at: now,
      updated_at: now,
    }, teamId);

    const newSyncItems = [
      { id: genId(), table: "clients", action: "insert", data: lead, status: "pending", created_at: now },
    ];
    const newClients = [lead];
    const newFollowups = [];

    // Callback → create a follow-up on the chosen date.
    if (isCallback && callbackDate) {
      const fu = withTeamId({
        id: genId(),
        user_id: userId,
        client_id: leadId,
        client: lead.company,
        branch: "",
        title: `Call back: ${lead.company}${phone.trim() ? ` (${phone.trim()})` : ""}`,
        date: callbackDate,
        time: "09:00",
        reminder: "morning",
        notes: note.trim() ? `Cold call callback — ${note.trim()}` : "Cold call callback",
        completed: false,
        sync_status: "pending",
        created_at: now,
      }, teamId);
      newFollowups.push(fu);
      newSyncItems.push({ id: genId(), table: "followups", action: "insert", data: fu, status: "pending", created_at: now });
    }

    setData(d => ({
      ...d,
      clients: [...newClients, ...(d.clients || [])],
      followups: [...newFollowups, ...(d.followups || [])],
      syncQueue: [...newSyncItems, ...(d.syncQueue || [])],
    }));
    offlineSave("clients", lead).catch(() => {});
    newFollowups.forEach(f => offlineSave("followups", f).catch(() => {}));
    triggerImmediateSync();

    setSavedName(lead.company);
    setToast(isCallback && callbackDate ? "Logged + callback scheduled ✓" : "Cold call logged ✓");
    // Reset for the next call
    setName(""); setCompany(""); setPhone(""); setOutcome(null); setNote(""); setCallbackDate("");
  }

  return (
    <div className="space-y-3">
      <PageHeader title="Log a Cold Call" subtitle="Logs a lead you can chase or park" />

      <Card className="p-4 space-y-3">
        <Field label="Name / contact" value={name} onChange={setName} placeholder="e.g. Johan / receptionist" />
        <Field label="Company (optional)" value={company} onChange={setCompany} placeholder="e.g. Kumba Iron Ore" />
        <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="Phone number" type="tel" />

        {/* Outcome */}
        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Outcome</label>
          <div className="flex flex-wrap gap-1.5">
            {INTERACTION_OUTCOMES.map(o => {
              const active = outcome?.key === o.key;
              return (
                <button key={o.key} onClick={() => setOutcome(o)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  style={active
                    ? { borderColor: o.negative ? "#DC2626" : BRAND.primary, background: o.negative ? "#FEF2F2" : BRAND.light, color: o.negative ? "#DC2626" : BRAND.primary }
                    : { borderColor: "#E2E8F0", background: "#fff", color: "#64748B" }}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Callback date — only when "Call back later" */}
        <AnimatePresence>
          {isCallback && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <label className="block text-xs font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                <CalendarIcon size={13} style={{ color: BRAND.primary }} /> Call back on
              </label>
              <input type="date" value={callbackDate} min={todayISO()} onChange={e => setCallbackDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400"
                style={{ fontSize: 16 }} />
              <p className="text-[11px] text-slate-400 mt-1">Creates a follow-up in your calendar for this date.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div>
          <label className="block text-xs font-bold text-slate-500 mb-1.5">Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="e.g. Spoke to admin, needs maintenance manager — try mornings"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] outline-none focus:border-slate-400 resize-none"
            style={{ fontSize: 16 }} />
        </div>

        <button onClick={save} disabled={!canSave}
          className="w-full min-h-[52px] rounded-2xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: BRAND.primary }}>
          <Check size={18} /> Log call
        </button>
      </Card>

      {/* Recent cold calls logged */}
      {recent.length > 0 && (
        <Card className="p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <PhoneCall size={15} style={{ color: BRAND.primary }} />
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Recent cold calls</span>
          </div>
          <div className="space-y-1.5">
            {recent.map(c => {
              const last = Array.isArray(c.interactions) && c.interactions[0];
              return (
                <button key={c.id} onClick={() => onNavigate?.("Client360", { clientId: c.id, returnTo: "ColdCall" })}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 bg-slate-50 text-left active:bg-slate-100">
                  <span className="w-7 h-7 rounded-lg shrink-0 grid place-items-center" style={{ background: `${BRAND.primary}18` }}>
                    <Phone size={13} style={{ color: BRAND.primary }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-bold text-slate-800 truncate block">{c.company}</span>
                    {last && <span className="text-xs text-slate-400 truncate block">{last.label}{last.note ? ` — ${last.note}` : ""}</span>}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{(c.created_at || "").slice(5, 10)}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
