// ─── Email Follow-up Component ────────────────────────────────────────────────
// Opens the device email client (Outlook, Gmail, etc) with a pre-written template.
// Uses mailto: links — works on all devices, no API needed.
// Import and use: <EmailButton email="john@company.com" contactName="John" clientName="Anglo American" />

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, X } from "lucide-react";

// ─── Email message templates ───────────────────────────────────────────────────
export const EMAIL_TEMPLATES = [
  {
    id: "quote_followup",
    label: "Quote Follow-up",
    emoji: "📄",
    subject: (client) => `Quote Follow-up — Power Works`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nI hope this email finds you well.\n\nI am following up on the quote we recently submitted to ${client || "you"}. Please do not hesitate to contact me should you require any clarification or wish to discuss the details further.\n\nWe look forward to hearing from you.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
  {
    id: "meeting_request",
    label: "Meeting Request",
    emoji: "📅",
    subject: (client) => `Meeting Request — Power Works`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nI hope you are well.\n\nI would like to request a meeting to discuss how Power Works can assist ${client || "your organisation"}. Please let me know your availability and I will arrange accordingly.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
  {
    id: "general_checkin",
    label: "General Check-in",
    emoji: "👋",
    subject: (client) => `Checking In — Power Works`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nI trust you are well.\n\nI am reaching out to check in and enquire whether there is anything Power Works can assist ${client || "your team"} with at this time.\n\nPlease feel free to contact me at any time.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
  {
    id: "product_intro",
    label: "Product Introduction",
    emoji: "🔧",
    subject: (client) => `Power Works — Product Introduction`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nI hope this email finds you well.\n\nI would like to introduce our range of jacks, tyre handlers, mobile load testing equipment, and industrial solutions that may benefit ${client || "your operations"}.\n\nI would welcome the opportunity to present our products at your convenience.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
  {
    id: "after_visit",
    label: "After Site Visit",
    emoji: "🏭",
    subject: (client) => `Thank You — Power Works Site Visit`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nThank you for your time during our recent visit to ${client || "your site"}. It was a pleasure meeting with you.\n\nAs discussed, I will follow up with the relevant information shortly. Please do not hesitate to contact me in the meantime.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
  {
    id: "urgent_followup",
    label: "Urgent Follow-up",
    emoji: "⚡",
    subject: (client) => `Urgent: Follow-up Required — Power Works`,
    body: (contact, client) =>
      `Dear ${contact || "Sir/Madam"},\n\nI hope you are well.\n\nI am following up urgently regarding ${client || "your account"} and would appreciate your earliest response.\n\nPlease contact me directly at your convenience.\n\nKind regards\nPower Works (Pty) Ltd`,
  },
];

// ─── Email Button ──────────────────────────────────────────────────────────────
export function EmailButton({ email, contactName, clientName, size = "sm" }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [editing, setEditing] = useState(false);

  if (!email) return null;

  function selectTemplate(template) {
    setSelectedTemplate(template);
    setCustomSubject(template.subject(clientName));
    setCustomBody(template.body(contactName, clientName));
    setEditing(true);
  }

  function sendEmail() {
    const subject  = encodeURIComponent(customSubject);
    const body     = encodeURIComponent(customBody.replace(/\\n/g, "\n"));
    const mailto   = `mailto:${email}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
    setShowTemplates(false);
    setEditing(false);
    setSelectedTemplate(null);
  }

  return (
    <>
      <button
        onClick={() => setShowTemplates(true)}
        className={`inline-flex items-center gap-1.5 rounded-xl font-bold transition-all active:scale-95 ${size === "sm" ? "px-3 py-1.5 text-xs min-h-[36px]" : "px-4 py-2.5 text-sm min-h-[44px]"}`}
        style={{ background: "#0078D4", color: "#fff" }}
        title="Send email">
        <Mail size={13} />
        Email
      </button>

      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-6"
            onClick={() => { setShowTemplates(false); setEditing(false); }}>
            <motion.div
              initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#0078D4" }}>
                    <Mail size={15} color="white" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Email</p>
                    <p className="text-xs text-slate-400">{contactName || clientName} · {email}</p>
                  </div>
                </div>
                <button onClick={() => { setShowTemplates(false); setEditing(false); }}
                  className="p-2 rounded-xl bg-slate-50 text-slate-400">
                  <X size={16} />
                </button>
              </div>

              {/* Template list or editor */}
              {!editing ? (
                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Choose a template</p>
                  {EMAIL_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => selectTemplate(t)}
                      className="w-full text-left rounded-xl p-3 hover:bg-slate-50 transition-colors border border-slate-100 active:scale-[0.98]">
                      <p className="text-sm font-bold text-slate-800">{t.emoji} {t.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.subject(clientName)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Subject</label>
                    <input value={customSubject} onChange={e => setCustomSubject(e.target.value)}
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Message — edit if needed</label>
                    <textarea value={customBody} onChange={e => setCustomBody(e.target.value)}
                      rows={8}
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300 resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)}
                      className="flex-1 rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600">
                      ← Templates
                    </button>
                    <button onClick={sendEmail}
                      className="flex-1 rounded-xl py-3 text-sm font-bold text-white"
                      style={{ background: "#0078D4" }}>
                      Open Outlook →
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
