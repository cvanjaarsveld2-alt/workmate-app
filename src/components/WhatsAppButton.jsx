// ─── WhatsApp Follow-up Component ────────────────────────────────────────────
// Opens WhatsApp with a pre-written message template.
// No API needed — uses wa.me links which work on all devices.
// Import and use: <WhatsAppButton phone="0821234567" contactName="John" clientName="Anglo American" followupTitle="Quote follow-up" />

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const BRAND = { primary: "#8B1A1A" };

// ─── WhatsApp message templates ───────────────────────────────────────────────
export const WA_TEMPLATES = [
  {
    id: "quote_followup",
    label: "Quote Follow-up",
    emoji: "📄",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nI'm following up on the quote we sent through to ${client || "you"}. Please let me know if you have any questions or if you'd like to discuss anything further.\n\nKind regards\nPower Works`,
  },
  {
    id: "meeting_request",
    label: "Meeting Request",
    emoji: "📅",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nI'd like to arrange a meeting to discuss how Power Works can assist ${client || "your team"}. Would you be available for a quick call or site visit this week?\n\nKind regards\nPower Works`,
  },
  {
    id: "general_checkin",
    label: "General Check-in",
    emoji: "👋",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nJust checking in to see how things are going at ${client || "your site"} and if there's anything Power Works can assist with.\n\nKind regards\nPower Works`,
  },
  {
    id: "product_intro",
    label: "Product Introduction",
    emoji: "🔧",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nI wanted to reach out regarding our range of jacks, tyre handlers, and industrial equipment that could benefit ${client || "your operations"}. I'd love the opportunity to present our products to you.\n\nKind regards\nPower Works`,
  },
  {
    id: "after_visit",
    label: "After Site Visit",
    emoji: "🏭",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nThank you for your time during our visit to ${client || "your site"}. It was great meeting you. I'll follow up with the information we discussed shortly.\n\nKind regards\nPower Works`,
  },
  {
    id: "urgent_followup",
    label: "Urgent Follow-up",
    emoji: "⚡",
    message: (contact, client) =>
      `Hi ${contact || "there"},\n\nI'm following up urgently regarding ${client || "your account"}. Please could you get back to me at your earliest convenience.\n\nKind regards\nPower Works`,
  },
];

// ─── Format phone for WhatsApp ─────────────────────────────────────────────────
function formatPhone(phone) {
  if (!phone) return null;
  // Strip spaces, dashes, brackets
  let clean = phone.replace(/[\s\-()]/g, "");
  // South African numbers: 0821234567 → 27821234567
  if (clean.startsWith("0") && clean.length === 10) {
    clean = "27" + clean.slice(1);
  }
  // Already has country code
  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }
  return clean;
}

// ─── WhatsApp Button ──────────────────────────────────────────────────────────
export function WhatsAppButton({ phone, contactName, clientName, followupTitle, size = "sm" }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [customMessage, setCustomMessage] = useState("");
  const [editing, setEditing] = useState(false);

  const formattedPhone = formatPhone(phone);

  function selectTemplate(template) {
    const msg = template.message(contactName, clientName);
    setSelectedTemplate(template);
    setCustomMessage(msg);
    setEditing(true);
  }

  function sendWhatsApp() {
    if (!formattedPhone) return;
    const encoded = encodeURIComponent(customMessage);
    const url = `https://wa.me/${formattedPhone}?text=${encoded}`;
    window.open(url, "_blank");
    setShowTemplates(false);
    setEditing(false);
    setSelectedTemplate(null);
  }

  if (!formattedPhone) return null;

  return (
    <>
      {/* WhatsApp button */}
      <button
        onClick={() => setShowTemplates(true)}
        className={`inline-flex items-center gap-1.5 rounded-xl font-bold transition-all active:scale-95 ${size === "sm" ? "px-3 py-1.5 text-xs min-h-[36px]" : "px-4 py-2.5 text-sm min-h-[44px]"}`}
        style={{ background: "#25D366", color: "#fff" }}
        title="Send WhatsApp message">
        {/* WhatsApp icon SVG */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </button>

      {/* Template picker modal */}
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
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#25D366" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">WhatsApp</p>
                    <p className="text-xs text-slate-400">{contactName || clientName} · {phone}</p>
                  </div>
                </div>
                <button onClick={() => { setShowTemplates(false); setEditing(false); }}
                  className="p-2 rounded-xl bg-slate-50 text-slate-400">
                  <X size={16} />
                </button>
              </div>

              {/* Template list or message editor */}
              {!editing ? (
                <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Choose a template</p>
                  {WA_TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => selectTemplate(t)}
                      className="w-full text-left rounded-xl p-3 hover:bg-slate-50 transition-colors border border-slate-100 active:scale-[0.98]">
                      <p className="text-sm font-bold text-slate-800">{t.emoji} {t.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {t.message(contactName, clientName).split("\n")[0]}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {selectedTemplate?.emoji} {selectedTemplate?.label} — edit if needed
                  </p>
                  <textarea
                    value={customMessage}
                    onChange={e => setCustomMessage(e.target.value)}
                    rows={8}
                    className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 p-3 text-sm outline-none focus:border-green-300 focus:bg-white transition-colors resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)}
                      className="flex-1 rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600">
                      ← Templates
                    </button>
                    <button onClick={sendWhatsApp}
                      className="flex-1 rounded-xl py-3 text-sm font-bold text-white"
                      style={{ background: "#25D366" }}>
                      Open WhatsApp →
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
