// ─── Mail agent: connected mailboxes (in the Inbox on Expenses) ──────────────
// Each person can connect their own mailbox; the agent checks it every 5
// minutes and brings receipts, bills, quote requests, customer mail and
// supplier documents into the Inbox. The master account decides what it looks
// for and whether it may file sure items by itself. See docs/MAIL_AGENT.md.
import React, { useCallback, useEffect, useState } from "react";
import { Mail, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "../supabase";
import { activeProfile, MAIL_AGENT_KINDS, saveCompanyProfile } from "../lib/companyProfile";
import { KIND_LABELS, PROVIDER_LABELS } from "../lib/inbox";
import { Btn, Field, useConfirm } from "./ui";

const when = iso => {
  if (!iso) return "not yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

async function functionError(error, data) {
  if (data?.error) return data.message || data.error;
  try {
    const body = await error?.context?.json?.();
    if (body?.message || body?.error) return body.message || body.error;
  } catch {
    // not JSON
  }
  return error?.message || "Something went wrong. Try again.";
}

function ImapForm({ teamId, onDone, onCancel }) {
  const [form, setForm] = useState({ email: "", password: "", folder: "INBOX", host: "", port: "" });
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const icloud = /@(icloud|me|mac)\.com$/i.test(form.email.trim());

  async function connect() {
    setErr("");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("mail-agent", {
      body: { action: "connect_imap", team_id: teamId, email: form.email.trim(), password: form.password, folder: form.folder || "INBOX", host: form.host || undefined, port: form.port || undefined },
    });
    setBusy(false);
    if (error || data?.error) return setErr(await functionError(error, data));
    onDone();
  }

  return (
    <div className="stack-y-2 rounded-xl border border-slate-200 p-3">
      <Field label="Email address" type="email" value={form.email} onChange={set("email")} maxLength={200} />
      <Field label="App password" type="password" value={form.password} onChange={set("password")} maxLength={200} />
      <p className="text-xs text-slate-500">
        {icloud
          ? "iCloud: create an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords. Your normal Apple ID password won't work."
          : "Use an app password from your email provider (not your normal password) where it offers one."}
      </p>
      <Field label="Folder to read" value={form.folder} onChange={set("folder")} maxLength={200} />
      <button type="button" className="text-xs font-bold text-slate-500 underline" onClick={() => setAdvanced(a => !a)}>
        {advanced ? "Hide server settings" : "Server settings (only if asked)"}
      </button>
      {advanced && (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2"><Field label="IMAP server" value={form.host} onChange={set("host")} placeholder="imap.example.com" maxLength={200} /></div>
          <Field label="Port" value={form.port} onChange={set("port")} placeholder="993" maxLength={5} />
        </div>
      )}
      {err && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Btn size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <Btn size="sm" onClick={connect} disabled={busy || !form.email || !form.password}>{busy ? "Checking…" : "Connect"}</Btn>
      </div>
    </div>
  );
}

function Settings({ teamId, onToast }) {
  const p = activeProfile();
  const [auto, setAuto] = useState(p.mail_agent_auto === true);
  const [kinds, setKinds] = useState(Array.isArray(p.mail_agent_kinds) ? p.mail_agent_kinds : MAIL_AGENT_KINDS);
  const [busy, setBusy] = useState(false);

  async function save(next) {
    setBusy(true);
    const r = await saveCompanyProfile(teamId, { ...activeProfile(), mail_agent_auto: next.auto, mail_agent_kinds: next.kinds });
    setBusy(false);
    if (!r.ok) return onToast(r.error);
    setAuto(next.auto);
    setKinds(next.kinds);
    onToast("Mail agent settings saved");
  }

  return (
    <div className="stack-y-2 rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-600">What the agent brings in (master account)</p>
      <div className="grid grid-cols-2 gap-1.5">
        {MAIL_AGENT_KINDS.map(k => (
          <label key={k} className="flex min-h-[40px] items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={kinds.includes(k)} disabled={busy}
              onChange={e => save({ auto, kinds: e.target.checked ? MAIL_AGENT_KINDS.filter(x => x === k || kinds.includes(x)) : kinds.filter(x => x !== k) })} />
            {KIND_LABELS[k]}
          </label>
        ))}
      </div>
      <label className="flex min-h-[44px] items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={auto} disabled={busy} onChange={e => save({ auto: e.target.checked, kinds })} />
        <span>
          <b>File sure items by itself.</b> Receipts from known suppliers, mail from known customers, supplier mail about a purchase
          order, and very clear quote requests. Everything else still waits here for a person.
        </span>
      </label>
    </div>
  );
}

export function MailboxAgent({ teamId, isOwner = false, onToast = () => {}, onChecked = () => {} }) {
  const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false);
  const [imap, setImap] = useState(false);
  const [busy, setBusy] = useState("");
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("mail_connections", { p_team: teamId });
    setList(error ? [] : data || []);
  }, [teamId]);
  useEffect(() => { load(); }, [load]);

  async function signIn(provider) {
    setBusy(provider);
    const { data: state, error } = await supabase.rpc("mail_connect_start", { p_team: teamId, p_provider: provider });
    if (error) { setBusy(""); return onToast(error.message); }
    const { data, error: fe } = await supabase.functions.invoke("mail-agent", { body: { action: "authorize_url", state } });
    setBusy("");
    if (fe || !data?.url) return onToast(await functionError(fe, data));
    window.location.assign(data.url);
  }

  async function act(c, action) {
    if (action === "disconnect" && !(await confirm(`Disconnect ${c.email}? The agent stops reading it and its password or sign-in is deleted.`, { confirmLabel: "Disconnect" }))) return;
    let folder = null;
    if (action === "folder") {
      folder = window.prompt("Which folder should the agent read? (e.g. INBOX, or a folder like Invoices)", c.folder || "INBOX");
      if (!folder) return;
    }
    setBusy(c.id);
    const { error } = await supabase.rpc("mail_connection_update", { p_id: c.id, p_action: action, p_folder: folder });
    setBusy("");
    if (error) return onToast(error.message);
    await load();
  }

  async function checkNow(c) {
    setBusy(c.id);
    const { data, error } = await supabase.functions.invoke("mail-agent", { body: { action: "run_one", connection_id: c.id } });
    setBusy("");
    if (error || data?.error) onToast(await functionError(error, data));
    else onToast(data?.kept ? `${data.kept} new item${data.kept === 1 ? "" : "s"} from ${c.email}` : `Nothing new in ${c.email}`);
    await load();
    onChecked();
  }

  if (list === null) return null;
  return (
    <div className="stack-y-2" data-testid="mailbox-agent">
      {dialog}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-600">Mail agent: connected mailboxes</p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700">
            <Mail size={13} /> Connect a mailbox
          </button>
        )}
      </div>
      {list.length === 0 && !adding && (
        <p className="text-xs text-slate-500">
          Connect your mailbox and the agent reads new mail every 5 minutes: receipts and bills, quote requests, customer mail and
          supplier documents come here. Personal and marketing mail is skipped and never stored.
        </p>
      )}
      {list.map(c => (
        <div key={c.id} className="rounded-xl border border-slate-100 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{c.email}</p>
              <p className="text-xs text-slate-500">
                {PROVIDER_LABELS[c.provider]} · {c.folder} · checked {when(c.last_run_at)} · {c.found_total} brought in
                {!c.mine && c.owner_email ? ` · ${c.owner_email}` : ""}
              </p>
              {c.status === "paused" && <p className="text-xs font-bold text-slate-500">Paused</p>}
              {c.last_error && (
                <p className="text-xs text-amber-800">
                  {c.status === "error" ? "Stopped: " : "Last check: "}
                  {c.last_error.replace(/^AUTH:\s*/, "")}
                  {c.status === "error" && " Connect it again to carry on."}
                </p>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => checkNow(c)} disabled={!!busy || c.status !== "active"} aria-label={`Check ${c.email} now`}
              className="flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700 disabled:opacity-40">
              <RefreshCw size={13} className={busy === c.id ? "animate-spin" : ""} /> Check now
            </button>
            <button type="button" onClick={() => act(c, c.status === "paused" ? "resume" : "pause")} disabled={!!busy}
              className="flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700">
              {c.status === "paused" ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
            </button>
            <button type="button" onClick={() => act(c, "folder")} disabled={!!busy}
              className="min-h-[40px] rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-700">Folder</button>
            <button type="button" onClick={() => act(c, "disconnect")} disabled={!!busy} aria-label={`Disconnect ${c.email}`}
              className="flex min-h-[40px] items-center gap-1 rounded-lg border border-red-200 px-2.5 text-xs font-bold text-red-700">
              <Trash2 size={13} /> Disconnect
            </button>
          </div>
        </div>
      ))}
      {adding && !imap && (
        <div className="grid gap-2">
          <Btn size="sm" variant="secondary" onClick={() => signIn("microsoft")} disabled={!!busy}>{busy === "microsoft" ? "Opening…" : "Sign in with Microsoft (Outlook, 365)"}</Btn>
          <Btn size="sm" variant="secondary" onClick={() => signIn("google")} disabled={!!busy}>{busy === "google" ? "Opening…" : "Sign in with Google (Gmail)"}</Btn>
          <Btn size="sm" variant="secondary" onClick={() => setImap(true)} disabled={!!busy}>iCloud or another mailbox</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={!!busy}>Cancel</Btn>
          <p className="text-xs text-slate-500">
            The agent only reads mail (it can't send, delete or move anything). You can pause or disconnect it at any time.
          </p>
        </div>
      )}
      {adding && imap && (
        <ImapForm teamId={teamId} onCancel={() => setImap(false)}
          onDone={async () => { setImap(false); setAdding(false); onToast("Mailbox connected. The first check runs within 5 minutes."); await load(); }} />
      )}
      {isOwner && <Settings teamId={teamId} onToast={onToast} />}
    </div>
  );
}
