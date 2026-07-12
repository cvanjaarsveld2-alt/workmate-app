// ─── Activity Logger ──────────────────────────────────────────────────────────
// One-tap "Log interaction" sheet that records calls, WhatsApp, emails,
// site visits, and meetings. After logging, prompts "Schedule follow-up?"
//
// Usage:
//   <ActivityLogger
//     open={!!logTarget}
//     onClose={() => setLogTarget(null)}
//     client={logTarget}    // { id, company, contact, phone, email }
//     userId={userId}
//     data={data} setData={setData}
//   />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Mail, MessageSquare, MapPin, Users, Calendar, CheckCircle2, Plus } from "lucide-react";
import { BRAND } from "../lib/constants";
import { todayISO, genId } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { withTeamId } from "../lib/teamId";

const TYPES = [
  { key: "call_out",    label: "Outgoing call",  icon: Phone,         bg: "#DBEAFE", color: "#1E40AF" },
  { key: "call_in",     label: "Incoming call",  icon: Phone,         bg: "#EDE9FE", color: "#5B21B6" },
  { key: "whatsapp",    label: "WhatsApp",       icon: MessageSquare, bg: "#DCFCE7", color: "#166534" },
  { key: "email",       label: "Email",          icon: Mail,          bg: "#FEF3C7", color: "#92400E" },
  { key: "site_visit",  label: "Site visit",     icon: MapPin,        bg: "#CFFAFE", color: "#0E7490" },
  { key: "meeting",     label: "Meeting",        icon: Users,         bg: "#FFE4E6", color: "#BE123C" },
];

export function ActivityLogger({ open, onClose, client, userId, teamId, data, setData }) {
  const [step, setStep]             = useState("type"); // type | detail | followup | done
  const [actType, setActType]       = useState(null);
  const [summary, setSummary]       = useState("");
  const [outcome, setOutcome]       = useState("");
  const [duration, setDuration]     = useState("");
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupDate, setFollowupDate]   = useState("");

  function reset() { setStep("type"); setActType(null); setSummary(""); setOutcome(""); setDuration(""); setFollowupTitle(""); setFollowupDate(""); }
  function handleClose() { reset(); onClose(); }

  async function saveActivity() {
    const item = withTeamId({
      id: genId(),
      user_id: userId,
      client_id: client?.id,
      client_name: client?.company,
      activity_type: actType,
      summary: summary.trim(),
      outcome: outcome.trim(),
      duration_mins: parseInt(duration) || null,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      activities: [item, ...(d.activities || [])],
      syncQueue: [{ id: genId(), table: "activities", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("activities", item);
    triggerImmediateSync();
    setStep("followup");
  }

  async function saveFollowup() {
    if (!followupTitle.trim() || !followupDate) { setStep("done"); return; }
    const item = withTeamId({
      id: genId(), user_id: userId,
      client_id: client?.id, client: client?.company, branch: "",
      title: followupTitle.trim(), date: followupDate, time: "09:00",
      reminder: "morning", notes: outcome ? `Previous: ${outcome}` : "",
      completed: false, created_at: new Date().toISOString(), sync_status: "pending",
    }, teamId);
    setData(d => ({
      ...d,
      followups: [item, ...(d.followups || [])],
      syncQueue: [{ id: genId(), table: "followups", action: "insert", data: item, status: "pending", created_at: new Date().toISOString() }, ...(d.syncQueue || [])],
    }));
    await offlineSave("followups", item);
    triggerImmediateSync();
    setStep("done");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={handleClose} className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm"/>
          <motion.div initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}} transition={{type:"spring",damping:28,stiffness:300}}
            className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-3xl bg-white overflow-hidden" style={{maxHeight:"80vh"}}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200"/></div>
            <div className="flex items-center justify-between px-5 pb-3 border-b border-slate-100">
              <div><p className="text-base font-black text-slate-900">Log interaction</p>
                {client?.company && <p className="text-xs text-slate-400">{client.company}</p>}</div>
              <button onClick={handleClose} className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-500"><X size={18}/></button>
            </div>

            <div className="overflow-y-auto px-5 py-4" style={{maxHeight:"calc(80vh - 80px)"}}>
              {step === "type" && (
                <div className="grid grid-cols-2 gap-3">
                  {TYPES.map(t => (
                    <button key={t.key} onClick={() => { setActType(t.key); setStep("detail"); }}
                      className="flex flex-col items-center gap-2 rounded-2xl p-4 border-2 border-slate-100 hover:border-slate-200 transition-all min-h-[90px]">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:t.bg}}>
                        <t.icon size={18} style={{color:t.color}}/>
                      </div>
                      <span className="text-xs font-bold text-slate-700">{t.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {step === "detail" && (
                <div className="space-y-4">
                  <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">What happened?</label>
                    <textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={3} placeholder="Quick summary of the interaction…"
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300 resize-none"/></div>
                  <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">Outcome / next step</label>
                    <input value={outcome} onChange={e=>setOutcome(e.target.value)} placeholder="e.g. Client wants a quote for starters"
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300"/></div>
                  <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">Duration (minutes)</label>
                    <input type="number" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="15"
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300"/></div>
                  <button onClick={saveActivity} disabled={!summary.trim()}
                    className="w-full rounded-2xl py-4 text-sm font-black text-white min-h-[56px] disabled:opacity-40" style={{background:BRAND.primary}}>
                    Save interaction
                  </button>
                </div>
              )}

              {step === "followup" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-xl bg-green-50 p-3">
                    <CheckCircle2 size={18} className="text-green-600 shrink-0"/>
                    <p className="text-sm font-bold text-green-700">Interaction logged</p>
                  </div>
                  <p className="text-sm font-black text-slate-700">Schedule a follow-up?</p>
                  <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">Follow-up title</label>
                    <input value={followupTitle} onChange={e=>setFollowupTitle(e.target.value)} placeholder="e.g. Chase quote for starters"
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300"/></div>
                  <div><label className="text-xs font-bold text-slate-500 mb-1.5 block">Date</label>
                    <input type="date" value={followupDate} onChange={e=>setFollowupDate(e.target.value)} min={todayISO()}
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3.5 text-sm outline-none focus:border-red-300"/></div>
                  <div className="flex gap-3">
                    <button onClick={() => setStep("done")} className="flex-1 rounded-2xl py-3.5 text-sm font-bold border-2 border-slate-200 text-slate-600 min-h-[48px]">Skip</button>
                    <button onClick={saveFollowup} disabled={!followupTitle.trim() || !followupDate}
                      className="flex-[2] rounded-2xl py-3.5 text-sm font-black text-white min-h-[48px] disabled:opacity-40" style={{background:BRAND.primary}}>
                      <Calendar size={14} className="inline mr-1"/> Create follow-up
                    </button>
                  </div>
                </div>
              )}

              {step === "done" && (
                <div className="flex flex-col items-center py-8 gap-4">
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center"><CheckCircle2 size={32} className="text-green-600"/></div>
                  <p className="text-lg font-black text-slate-900">All done</p>
                  <button onClick={handleClose} className="px-6 py-3 rounded-2xl text-sm font-bold text-white min-h-[48px]" style={{background:BRAND.primary}}>Close</button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
