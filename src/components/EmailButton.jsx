// ─── Email Follow-up Component ────────────────────────────────────────────────
// Opens the device email client (Outlook, Gmail, etc) with a pre-written template.
// Uses mailto: links — works on all devices, no API needed.
// Import and use: <EmailButton email="john@company.com" contactName="John" clientName="Anglo American" />

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, X } from "lucide-react";
import { SalesFollowupComposer } from "../lib/industrialSalesEmail.jsx";

// ─── Email message templates ───────────────────────────────────────────────────
export const EMAIL_TEMPLATES = [
  {
    id: "gap_selling",
    label: "Gap-Selling Follow-Up",
    emoji: "✨",
    kind: "gap",
    subject: () => "Following up — Power Works",
    body: () => "Build a problem → impact → desired outcome follow-up",
  },
  {
    id: "quote_followup",
    label: "Quote Follow-up",
    emoji: "📄",
    subject: () => "Following up on the quote",
    body: (contact, client) =>
      `Hi ${contact || "there"},

Just checking in on the quote we sent through for ${client || "your team"}.

If you've had a chance to look at it, I'd be happy to run through anything you'd like clarified or changed.

Please let me know what works for you.

Regards,
Renita
Power Works (Pty) Ltd`,
  },
  {
    id: "meeting_request",
    label: "Meeting Request",
    emoji: "📅",
    subject: () => "A quick meeting",
    body: (contact, client) =>
      `Hi ${contact || "there"},

I'd like to set up a short meeting to understand what ${client || "your team"} is working on and where we may be able to help.

If you're open to it, send me a time that suits you and I'll work around it.

Regards,
Renita
Power Works (Pty) Ltd`,
  },
  {
    id: "general_checkin",
    label: "General Check-in",
    emoji: "👋",
    subject: () => "Just checking in",
    body: (contact, client) =>
      `Hi ${contact || "there"},

Just checking in to see how things are going at ${client || "your side"}.

If there's anything you're dealing with at the moment where Power Works could help, feel free to send it my way.

Regards,
Renita
Power Works (Pty) Ltd`,
  },
  {
    id: "product_intro",
    label: "Product Introduction",
    emoji: "🔧",
    subject: () => "Power Works",
    body: (contact, client) =>
      `Hi ${contact || "there"},

I wanted to introduce Power Works and the industrial equipment and services we provide.

We work with businesses on areas such as jacks, tyre handlers, load testing and industrial repairs.

If any of these are relevant to ${client || "your operation"}, I'm happy to send through some information or have a quick chat.

Regards,
Renita
Power Works (Pty) Ltd`,
  },
  {
    id: "after_visit",
    label: "After Site Visit",
    emoji: "🏭",
    subject: () => "Good meeting you",
    body: (contact, client) =>
      `Hi ${contact || "there"},

Thanks for your time when I was at ${client || "your site"}.

It was good to meet you and get a better understanding of what you're working with. As discussed, I'll follow up with the information we spoke about.

If anything comes up in the meantime, just let me know.

Regards,
Renita
Power Works (Pty) Ltd`,
  },
  {
    id: "urgent_followup",
    label: "Time-Sensitive Follow-up",
    emoji: "⚡",
    subject: () => "Following up",
    body: (contact, client) =>
      `Hi ${contact || "there"},

I'm following up on ${client || "the matter we discussed"}.

When you get a chance, please let me know where things stand and whether there's anything you need from my side.

Thanks,
Renita
Power Works (Pty) Ltd`,
  },
];

// ─── Email Composer sheet (open programmatically for a contact) ───────────────
// Templates + editable subject/body + BOTH copy-to-clipboard and open-in-Outlook.
// Structured so an AI "polish" step can slot in later (a single async function
// that rewrites `body` via a server-side Edge Function — not wired yet).
export function EmailComposer({ contact, onClose, onGapSelling }) {
  const [tpl, setTpl] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  if (!contact) return null;
  const email = contact.email;
  const contactName = contact.name;
  const clientName = contact.company;

  function pick(t) {
    if (t.kind === "gap") {
      onGapSelling?.();
      return;
    }
    setTpl(t);
    setSubject(t.subject(clientName));
    setBody(t.body(contactName, clientName));
  }
  function openOutlook() {
    const s = encodeURIComponent(subject);
    const b = encodeURIComponent(body.replace(/\\n/g, "\n"));
    window.location.href = `mailto:${email}?subject=${s}&body=${b}`;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50"
      onClick={onClose}>
      <motion.div
        initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
        className="w-full max-w-md bg-white rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "#0078D4" }}>
              <Mail size={15} color="white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">Email</p>
              <p className="text-xs text-slate-400 truncate">{contactName} · {email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-400 shrink-0"><X size={16} /></button>
        </div>

        {!tpl ? (
          <div className="p-3 space-y-2 overflow-y-auto">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Choose a template</p>
            {EMAIL_TEMPLATES.map(t => (
              <button key={t.id} onClick={() => pick(t)}
                className="w-full text-left rounded-xl p-3 border border-slate-100 active:scale-[0.98]">
                <p className="text-sm font-bold text-slate-800">{t.emoji} {t.label}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{t.subject(clientName)}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300" style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Message — edit as needed</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
                className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-blue-300 resize-none" style={{ fontSize: 16 }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={copy}
                className="rounded-xl py-3 text-sm font-bold border-2"
                style={{ borderColor: copied ? "#16A34A" : "#E2E8F0", color: copied ? "#16A34A" : "#475569" }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button onClick={openOutlook}
                className="rounded-xl py-3 text-sm font-bold text-white" style={{ background: "#0078D4" }}>
                Open Outlook →
              </button>
            </div>
            <button onClick={() => setTpl(null)}
              className="w-full rounded-xl border-2 border-slate-100 py-2.5 text-xs font-bold text-slate-500">
              ← Back to templates
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Email Button ──────────────────────────────────────────────────────────────
export function EmailButton({ email, contactName, clientName, size = "sm" }) {
  const contact = { email, name: contactName, company: clientName };
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [salesFollowupOpen, setSalesFollowupOpen] = useState(false);

  if (!email) return null;

  function selectTemplate(template) {
    if (template.kind === "gap") {
      setShowTemplates(false);
      setEditing(false);
      setSalesFollowupOpen(true);
      return;
    }
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

      <AnimatePresence>
        {salesFollowupOpen && (
          <SalesFollowupComposer
            contact={contact}
            onClose={() => setSalesFollowupOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
