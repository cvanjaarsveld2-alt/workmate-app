// ─── PowerMate Assistant ──────────────────────────────────────────────────────
// Two jobs on one screen:
//
// 1. "Needs review" — quotes that were sent as plain Outlook emails (never
//    entered into PowerMate) get picked up by a daily Gmail-reading scheduled
//    task and land here with the client/amount already pulled out. Nothing
//    becomes a real quote until Christo confirms it — a bad extraction just
//    sits here, it never pollutes the real pipeline or fires a follow-up.
//
// 2. "Awaiting reply" — every Pending quote (entered by hand OR promoted from
//    an email) that hasn't been accepted/rejected/expired yet, oldest first,
//    with a one-tap Gap-Selling-style follow-up email ready to send. This is
//    the actual "remind me to chase this" list; the auto-created chase
//    follow-up (3 business days out) still lands in Follow-ups as before —
//    this is just a faster way to act on it without leaving the app.
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Check, X, Edit2, Clock, Inbox, ChevronDown, ChevronUp, Send } from "lucide-react";
import { BRAND } from "../lib/constants";
import { smartDate, formatCurrency, genId, todayISO } from "../lib/helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { promoteEmailQuoteToQuote } from "../lib/emailQuoteAutomation";
import { Card, Btn, Field, Toast, Empty, PageHeader, useConfirm } from "../components/ui";
import { useIsMine } from "../lib/teamView";

const CONFIDENCE_STYLE = {
  high:   { bg: "#DCFCE7", text: "#15803D", label: "High confidence" },
  medium: { bg: "#FEF3C7", text: "#92400E", label: "Double-check this one" },
  low:    { bg: "#FEE2E2", text: "#B91C1C", label: "Low confidence — check carefully" },
};

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - then.getTime()) / 86400000));
}

function firstName(name) {
  if (!name) return "there";
  return name.split(/[\s,—-]+/)[0] || "there";
}

function buildFollowupMailto(quote, toEmail) {
  const name = firstName(quote.client_name);
  const subject = `Following up — ${quote.description || "the quote we sent"}`;
  const body =
`Hi ${name},

Just following up on the quote we sent through for ${quote.description || "the work discussed"} — wanted to check where things stand on your side.

Is this still on your radar, or has anything changed that we should account for? Keen to help keep this moving if the timing's right.

Happy to jump on a quick call if that's easier than email.

Thanks,
Christo`;
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(toEmail || "")}?${params.toString()}`;
}

function ReviewCard({ candidate, clients, onConfirm, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]   = useState(candidate.extracted_client_name || "");
  const [amount, setAmount] = useState(candidate.extracted_amount != null ? String(candidate.extracted_amount) : "");
  const conf = CONFIDENCE_STYLE[candidate.extraction_confidence] || CONFIDENCE_STYLE.medium;
  const days = daysSince((candidate.sent_at || "").slice(0, 10));

  return (
    <Card className="p-4 stack-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-bold text-slate-900 truncate">{candidate.extracted_client_name || "Unknown client"}</p>
          <p className="text-sm text-slate-500 truncate">{candidate.subject || "(no subject)"}</p>
        </div>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: conf.bg, color: conf.text }}>
          {conf.label}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-lg font-black" style={{ color: BRAND.primary }}>
          {candidate.extracted_amount != null ? formatCurrency(candidate.extracted_amount) : "Amount not found"}
        </p>
        {days != null && <p className="text-xs text-slate-400">Sent {days === 0 ? "today" : `${days} day${days !== 1 ? "s" : ""} ago`}</p>}
      </div>

      {candidate.snippet && <p className="text-xs text-slate-400 line-clamp-2">{candidate.snippet}</p>}

      {editing ? (
        <div className="stack-y-2 pt-1">
          <Field label="Client" value={name} onChange={setName} placeholder="Client name" />
          <Field label="Amount (R)" type="number" value={amount} onChange={setAmount} placeholder="0.00" />
          <div className="flex gap-2">
            <Btn size="sm" className="flex-1" onClick={() => { onConfirm({ ...candidate, extracted_client_name: name, extracted_amount: amount === "" ? null : parseFloat(amount) }); setEditing(false); }}>
              <Check size={14} /> Save & Add to Quotes
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 pt-1">
          <Btn size="sm" className="flex-1" onClick={() => onConfirm(candidate)}><Check size={14} /> Add to Quotes</Btn>
          <button onClick={() => setEditing(true)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Fix client/amount first"><Edit2 size={15} /></button>
          <button onClick={() => onDismiss(candidate)} className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Not a quote"><X size={15} /></button>
        </div>
      )}
    </Card>
  );
}

export function AssistantScreen({ data, setData, userId, teamId }) {
  const isMine = useIsMine(userId);
  const [toast, setToast] = useState("");
  const [showDismissed, setShowDismissed] = useState(false);
  const { confirm, dialog } = useConfirm();

  const emailQuotes = (data.email_quotes || []).filter(isMine);
  const clients = (data.clients || []).filter(isMine);
  const followups = data.followups || [];

  const needsReview = useMemo(
    () => emailQuotes.filter(e => e.status === "new").sort((a, b) => (b.sent_at || "").localeCompare(a.sent_at || "")),
    [emailQuotes]
  );
  const dismissed = useMemo(
    () => emailQuotes.filter(e => e.status === "dismissed").sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || "")),
    [emailQuotes]
  );

  const awaitingReply = useMemo(() => {
    return (data.quotes || [])
      .filter(q => (q.user_id === userId || q.assigned_to_user_id === userId) && q.status === "Pending")
      .sort((a, b) => (a.sent_date || "").localeCompare(b.sent_date || ""));
  }, [data.quotes, userId]);

  function updateCandidate(id, patch) {
    setData(d => ({
      ...d,
      email_quotes: (d.email_quotes || []).map(e => e.id === id ? { ...e, ...patch, sync_status: "pending" } : e),
      syncQueue: [
        { id: genId(), table: "email_quotes", action: "update", data: { id, ...patch, sync_status: "pending" }, status: "pending", created_at: new Date().toISOString() },
        ...(d.syncQueue || []),
      ],
    }));
    const updated = emailQuotes.find(e => e.id === id);
    if (updated) offlineSave("email_quotes", { ...updated, ...patch, sync_status: "pending" });
    triggerImmediateSync();
  }

  function handleConfirm(candidate) {
    const quote = promoteEmailQuoteToQuote(candidate, { userId, teamId, clients, followups, setData });
    updateCandidate(candidate.id, { status: "confirmed", promoted_quote_id: quote.id });
    setToast("Added to Quotes — chase follow-up scheduled");
  }

  async function handleDismiss(candidate) {
    const ok = await confirm("Mark this as not a quote?", { confirmLabel: "Not a quote" });
    if (!ok) return;
    updateCandidate(candidate.id, { status: "dismissed" });
    setToast("Dismissed");
  }

  function handleRestore(candidate) {
    updateCandidate(candidate.id, { status: "new" });
    setToast("Moved back to Needs review");
  }

  return (
    <div className="stack-y-4">
      {dialog}
      <AnimatePresence>{toast && <Toast message={toast} onDone={() => setToast("")} />}</AnimatePresence>

      <PageHeader
        title="Assistant"
        subtitle={needsReview.length > 0 ? `${needsReview.length} email quote${needsReview.length !== 1 ? "s" : ""} to review` : "All caught up"}
      />

      <Card className="p-3.5 flex items-start gap-3" style={{ background: "#F7F3F3" }}>
        <Mail size={18} className="shrink-0 mt-0.5" style={{ color: BRAND.primary }} />
        <p className="text-xs text-slate-500 leading-relaxed">
          Quotes sent by plain email get read from a dedicated Gmail inbox once a day and show up below with the client and amount already pulled out. Nothing is sent automatically — you confirm each one before it becomes a real quote.
        </p>
      </Card>

      {/* ── Needs review ── */}
      <div>
        <p className="text-sm font-bold uppercase tracking-wider px-1 mb-2 text-slate-400">Needs review ({needsReview.length})</p>
        {needsReview.length === 0
          ? <Empty title="Nothing to review" text="Emailed quotes will show up here once the Gmail pipeline is set up." icon={Inbox} />
          : <div className="stack-y-2">
              {needsReview.map(c => (
                <ReviewCard key={c.id} candidate={c} clients={clients} onConfirm={handleConfirm} onDismiss={handleDismiss} />
              ))}
            </div>}
      </div>

      {/* ── Awaiting reply ── */}
      <div>
        <p className="text-sm font-bold uppercase tracking-wider px-1 mb-2 text-slate-400">Awaiting reply ({awaitingReply.length})</p>
        {awaitingReply.length === 0
          ? <Empty title="No quotes waiting" text="Pending quotes needing a follow-up will show up here." icon={Clock} />
          : <div className="stack-y-2">
              {awaitingReply.map(q => {
                const client = clients.find(c => c.id === q.client_id);
                const linkedEmail = emailQuotes.find(e => e.promoted_quote_id === q.id);
                const toEmail = client?.email || linkedEmail?.to_address || "";
                const days = daysSince(q.sent_date);
                return (
                  <Card key={q.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{q.client_name || "Unknown client"}</p>
                        <p className="text-xs text-slate-400 truncate">{q.description}</p>
                        <p className="text-sm font-black mt-1" style={{ color: BRAND.primary }}>{formatCurrency(q.value)}</p>
                        {days != null && (
                          <p className={`text-xs mt-0.5 ${days >= 7 ? "text-red-500 font-bold" : "text-slate-400"}`}>
                            Sent {smartDate(q.sent_date)} · {days} day{days !== 1 ? "s" : ""} ago
                          </p>
                        )}
                      </div>
                      <a
                        href={buildFollowupMailto(q, toEmail)}
                        className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-white min-h-[44px]"
                        style={{ background: BRAND.primary }}
                      >
                        <Send size={13} /> Follow up
                      </a>
                    </div>
                    {!toEmail && <p className="text-xs text-amber-600 mt-2">No email on file — fill in the "To" field once the draft opens.</p>}
                  </Card>
                );
              })}
            </div>}
      </div>

      {/* ── Dismissed (collapsed) ── */}
      {dismissed.length > 0 && (
        <div>
          <button onClick={() => setShowDismissed(v => !v)} className="w-full flex items-center justify-between px-1 py-2 text-sm font-bold text-slate-400">
            <span>Dismissed ({dismissed.length})</span>
            {showDismissed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <AnimatePresence>
            {showDismissed && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="stack-y-2">
                {dismissed.map(c => (
                  <Card key={c.id} className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-600 truncate">{c.extracted_client_name || "Unknown"}</p>
                      <p className="text-xs text-slate-400 truncate">{c.subject}</p>
                    </div>
                    <Btn size="sm" variant="secondary" onClick={() => handleRestore(c)}>Restore</Btn>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
