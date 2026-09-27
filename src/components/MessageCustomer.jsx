// ─── Message a customer ───────────────────────────────────────────────────────
// Pick the message (booking, on my way, job done, invoice …), check or edit the
// wording, then send by WhatsApp (from this phone) or SMS (sent by the
// platform, if the company's plan and the platform have SMS). See lib/messages.js.
import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, MessageSquare } from "lucide-react";
import { supabase } from "../supabase";
import { MESSAGE_KINDS, internationalPhone, messageVars, render, sendSms, sendWhatsApp, template } from "../lib/messages";
import { useCompanyProfile } from "../lib/companyProfile";
import { BottomSheet } from "./BottomSheet";
import { Btn } from "./ui";

export function MessageCustomer({ open, onClose, kinds = ["custom"], teamId, userId, client, job = null, invoice = null, quote = null, getLink = null, onSent }) {
  const profile = useCompanyProfile(teamId);
  const [kind, setKind] = useState(kinds[0]);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [sms, setSms] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const phone = client?.phone || "";
  const to = internationalPhone(phone);

  // The link (portal / quote), fetched once each time the sheet opens.
  const linkFn = useRef(getLink);
  linkFn.current = getLink;
  useEffect(() => {
    if (!open || !linkFn.current) return;
    let live = true;
    Promise.resolve(linkFn.current()).then(
      l => live && setLink(l || ""),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setNote("");
    setText(render(template(kind, profile), messageVars({ client, profile, job, invoice, quote, link })));
  }, [open, kind, link, profile, client, job, invoice, quote]);
  useEffect(() => {
    if (!open || !teamId) return;
    supabase.rpc("sms_status", { p_team_id: teamId }).then(
      ({ data }) => setSms(data || null),
      () => setSms(null),
    );
  }, [open, teamId]);

  async function whatsapp() {
    setBusy("wa");
    const err = await sendWhatsApp(supabase, { teamId, userId, phone, text, kind, clientId: client?.id || null, jobId: job?.id || null, invoiceId: invoice?.id || null });
    setBusy("");
    if (err) return setNote(err);
    onSent?.("WhatsApp opened");
    onClose();
  }
  async function smsSend() {
    setBusy("sms");
    const r = await sendSms(supabase, { teamId, userId, phone, text, kind, clientId: client?.id || null, jobId: job?.id || null, invoiceId: invoice?.id || null });
    setBusy("");
    if (r.error) return setNote(r.error);
    onSent?.("SMS on its way");
    onClose();
  }

  const left = sms?.available ? Math.max(0, (sms.limit || 0) - (sms.used || 0)) : 0;
  return (
    <BottomSheet open={open} onClose={onClose} title={`Message ${client?.contact || client?.company || "customer"}`} subtitle={to || "No cellphone number on this client"}>
      <div className="stack-y-3">
        {kinds.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {kinds.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold min-h-[36px] ${kind === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {MESSAGE_KINDS[k]?.label || "Message"}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={text}
          onChange={e => setText(e.target.value.slice(0, 1000))}
          rows={5}
          aria-label="Message"
          className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base"
        />
        <p className="text-xs text-slate-500">
          {text.length} characters{text.length > 160 ? ` · ${Math.ceil(text.length / 153)} SMS` : ""}
        </p>
        {note && <p className="text-sm text-red-700">{note}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={whatsapp} disabled={!to || !text.trim() || !!busy}>
            <MessageCircle size={16} /> WhatsApp
          </Btn>
          <Btn variant="secondary" onClick={smsSend} disabled={!to || !text.trim() || !!busy || !sms?.available || left === 0}>
            <MessageSquare size={16} /> {busy === "sms" ? "Sending…" : "SMS"}
          </Btn>
        </div>
        <p className="text-xs text-slate-500">
          {sms?.available
            ? `${left} SMS left this month.`
            : "SMS isn't available on your plan yet; WhatsApp opens on this phone with the message ready."}
        </p>
      </div>
    </BottomSheet>
  );
}
