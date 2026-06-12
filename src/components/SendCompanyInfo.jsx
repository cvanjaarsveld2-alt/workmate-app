// ─── Send Company Info Sheet ──────────────────────────────────────────────────
// Bottom sheet that lets a user pick company documents and send them
// via a pre-filled email or WhatsApp message to a contact/client/lead.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Mail, CheckSquare, Square, Send } from "lucide-react";
import { supabase } from "../supabase";

const WHATSAPP_ICON = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function SendCompanyInfoSheet({ recipientName, recipientEmail, recipientPhone, onClose }) {
  const [docs, setDocs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("company_documents")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });
      const list = data || [];
      setDocs(list);
      // Pre-select the first Company Profile if one exists
      const profile = list.find(d => d.category === "Company Profile");
      if (profile) setSelected(new Set([profile.id]));
      setLoading(false);
    }
    load();
  }, []);

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function getSelectedDocs() {
    return docs.filter(d => selected.has(d.id));
  }

  function buildEmailBody(selectedDocs) {
    const firstName = (recipientName || "").split(" ")[0] || "there";
    const docLines = selectedDocs.map(d =>
      `• ${d.name}\n  ${d.file_url}`
    ).join("\n\n");

    return `Hi ${firstName},

Thank you for your interest in Power Works (Pty) Ltd.

Please find the requested documents below:

${docLines}

Should you have any questions or require further information, please do not hesitate to contact us.

Kind regards,
Power Works (Pty) Ltd
Powerworks — Built for Industry`.trim();
  }

  function buildWhatsAppBody(selectedDocs) {
    const firstName = (recipientName || "").split(" ")[0] || "there";
    const docLines = selectedDocs.map(d => `• *${d.name}*: ${d.file_url}`).join("\n");

    return `Hi ${firstName}, thank you for connecting with *Power Works (Pty) Ltd*!\n\nPlease find our documents below:\n\n${docLines}\n\nFeel free to reach out if you have any questions. 👍`;
  }

  function handleEmail() {
    const sel = getSelectedDocs();
    if (sel.length === 0) return;
    const subject = encodeURIComponent("Powerworks Pty Ltd - Company Profile");
    const body    = encodeURIComponent(buildEmailBody(sel));
    const to      = encodeURIComponent(recipientEmail || "");
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
    onClose();
  }

  function handleWhatsApp() {
    const sel = getSelectedDocs();
    if (sel.length === 0) return;
    const phone   = (recipientPhone || "").replace(/[^0-9]/g, "");
    const message = encodeURIComponent(buildWhatsAppBody(sel));
    const url     = phone
      ? `https://wa.me/${phone}?text=${message}`
      : `https://wa.me/?text=${message}`;
    window.open(url, "_blank");
    onClose();
  }

  const selectedDocs = getSelectedDocs();
  const hasEmail = !!recipientEmail;
  const hasPhone = !!recipientPhone;

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
            <p className="text-base font-black text-slate-900">Send Company Info</p>
            <p className="text-xs text-slate-500">
              To: {recipientName || "Unknown"}{recipientEmail ? ` · ${recipientEmail}` : ""}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading documents…</p>
          ) : docs.length === 0 ? (
            <div className="text-center py-6">
              <FileText size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-500">No documents uploaded yet</p>
              <p className="text-xs text-slate-400 mt-1">Go to More → Company Documents to upload your company profile and brochures.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select documents to send</p>
              {docs.map(doc => {
                const isSelected = selected.has(doc.id);
                return (
                  <button key={doc.id} onClick={() => toggle(doc.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors min-h-[60px] border-2 ${
                      isSelected ? "border-red-200 bg-red-50" : "border-slate-100 bg-slate-50"
                    }`}>
                    <div className="shrink-0">
                      {isSelected
                        ? <CheckSquare size={22} className="text-red-600" />
                        : <Square size={22} className="text-slate-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{doc.name}</p>
                      <p className="text-xs text-slate-400">{doc.category}{doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ""}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Send buttons */}
        {docs.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 space-y-2" style={{ background: "#F7F3F3" }}>
            {selected.size === 0 && (
              <p className="text-xs text-slate-400 text-center">Select at least one document to send</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleEmail}
                disabled={selected.size === 0 || !hasEmail}
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white min-h-[48px] disabled:opacity-40 transition-opacity"
                style={{ background: "#8B1A1A" }}>
                <Mail size={15} />
                {hasEmail ? "Send Email" : "No email"}
              </button>
              <button
                onClick={handleWhatsApp}
                disabled={selected.size === 0}
                className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white min-h-[48px] disabled:opacity-40 transition-opacity"
                style={{ background: "#16A34A" }}>
                <WHATSAPP_ICON />
                WhatsApp
              </button>
            </div>
            {!hasEmail && (
              <p className="text-xs text-slate-400 text-center">Add an email address to this contact to enable email sending.</p>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
