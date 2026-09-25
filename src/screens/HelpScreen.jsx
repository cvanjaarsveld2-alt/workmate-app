// ─── Help & support ───────────────────────────────────────────────────────────
// Send a question or report a problem to the product team, and see replies.
// Messages land in support_tickets; platform admins answer them in the console.
import React, { useEffect, useState } from "react";
import { LifeBuoy, Send, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field, PageHeader } from "../components/ui";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../lib/brand";
import { legalHref } from "../legal/LegalPage";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const STATUS = { open: "Waiting for a reply", answered: "Answered", closed: "Closed" };

export function HelpScreen({ userId, userEmail, teamId, fromScreen = "" }) {
  const online = useOnlineStatus();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState([]);

  async function load() {
    if (!online) return;
    const { data } = await supabase
      .from("support_tickets")
      .select("id, subject, message, status, admin_reply, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setTickets(data || []);
  }
  useEffect(() => {
    load();
  }, [userId, online]);

  async function send() {
    if (!subject.trim() || !message.trim()) return setError("Please add a subject and a message.");
    setBusy(true);
    setError("");
    const { error: e } = await supabase.from("support_tickets").insert({
      user_id: userId,
      team_id: teamId || null,
      email: userEmail || null,
      subject: subject.trim().slice(0, 200),
      message: message.trim().slice(0, 5000),
      screen: String(fromScreen || "").slice(0, 60),
      device: String(navigator.userAgent || "").slice(0, 300),
      app_version: PRODUCT_VERSION,
    });
    setBusy(false);
    if (e) return setError("Couldn't send your message. Please try again.");
    setSubject("");
    setMessage("");
    setSent(true);
    load();
  }

  return (
    <div className="stack-y-4">
      <PageHeader title="Help & support" subtitle={`Questions, problems or ideas about ${PRODUCT_NAME}`} />
      <Card className="p-4 stack-y-3">
        <div className="flex items-center gap-2">
          <LifeBuoy size={18} className="text-slate-400" />
          <p className="text-base font-black text-slate-800">Send us a message</p>
        </div>
        {!online && <p className="text-sm text-amber-700">You're offline. Messages can be sent once you're back online.</p>}
        <Field label="Subject" value={subject} onChange={setSubject} placeholder="e.g. Invoice PDF shows the wrong VAT" maxLength={200} />
        <Field label="Message" value={message} onChange={setMessage} placeholder="What happened, and what did you expect?" multiline maxLength={5000} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        {sent && (
          <p className="text-sm text-green-700 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> Sent. We'll reply here.
          </p>
        )}
        <Btn onClick={send} disabled={busy || !online}>
          <Send size={15} /> {busy ? "Sending…" : "Send"}
        </Btn>
      </Card>

      {tickets.length > 0 && (
        <Card className="p-4 stack-y-3">
          <p className="text-base font-black text-slate-800">Your messages</p>
          {tickets.map(t => (
            <div key={t.id} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <div className="flex justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">{t.subject}</p>
                <span className="text-xs text-slate-500 shrink-0">{STATUS[t.status] || t.status}</span>
              </div>
              <p className="text-xs text-slate-500">{new Date(t.created_at).toLocaleString("en-ZA")}</p>
              {t.admin_reply && (
                <p className="mt-2 rounded-lg bg-green-50 border border-green-100 p-2 text-sm text-green-900 whitespace-pre-line">{t.admin_reply}</p>
              )}
            </div>
          ))}
        </Card>
      )}

      <p className="text-center text-xs text-slate-500">
        <a href={legalHref("terms")} className="underline">Terms</a> ·{" "}
        <a href={legalHref("privacy")} className="underline">Privacy</a> ·{" "}
        <a href={legalHref("dpa")} className="underline">Data processing</a>
      </p>
    </div>
  );
}
