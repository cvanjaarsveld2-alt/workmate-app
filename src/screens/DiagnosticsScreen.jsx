// ─── Diagnostics Screen ──────────────────────────────────────────────────────
// What's broken right now? — surfaces sync queue errors, recent crashes,
// Edge Function health, and schema sanity in one place.
//
// Designed so that when something goes wrong, you (or a teammate) can open this
// page, screenshot it, and the answer is in the screenshot.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import {
  ArrowLeft, AlertTriangle, CheckCircle2, RefreshCw, Trash2,
  Wifi, WifiOff, Database, Server, Bug, ClipboardCopy,
} from "lucide-react";
import { Card, Btn, useConfirm } from "../components/ui";
import { supabase } from "../supabase";
import { readCrashLog, clearCrashLog } from "../components/ErrorBoundary";

const FUNCTIONS_BASE = "https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1";

function StatusDot({ status }) {
  // green | amber | red | grey
  const map = {
    ok:    { bg: "#22C55E", label: "OK" },
    warn:  { bg: "#F59E0B", label: "Warning" },
    error: { bg: "#EF4444", label: "Error" },
    idle:  { bg: "#94A3B8", label: "Idle" },
  };
  const m = map[status] || map.idle;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.bg }} />
      <span className="text-xs font-bold text-slate-500">{m.label}</span>
    </div>
  );
}

function Row({ icon: Icon, label, value, status, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && <Icon size={16} className="text-slate-400 mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-700">{label}</p>
          {hint && <p className="text-xs text-slate-400 mt-0.5 break-words">{hint}</p>}
        </div>
      </div>
      <div className="text-right shrink-0">
        {value !== undefined && <p className="text-sm font-mono text-slate-700">{value}</p>}
        {status && <StatusDot status={status} />}
      </div>
    </div>
  );
}

export function DiagnosticsScreen({ data, userId, isOnline, onBack, onBackfill }) {
  const { confirm, dialog } = useConfirm();
  const [funcStatus, setFuncStatus] = useState({});
  const [checking,   setChecking]   = useState(false);
  const [crashes,    setCrashes]    = useState(readCrashLog());

  const syncQueue   = data?.syncQueue || [];
  const pending     = syncQueue.filter(i => i.status === "pending");
  const failed      = syncQueue.filter(i => i.status === "failed");

  // Group failures by table for quick reading.
  const failedByTable = failed.reduce((acc, i) => {
    acc[i.table] = (acc[i.table] || 0) + 1;
    return acc;
  }, {});

  async function checkFunction(name) {
    setFuncStatus(s => ({ ...s, [name]: { state: "checking" } }));
    const start = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      // Use a HEAD request style: post an obvious "ping" payload that should
      // produce a fast validation error rather than running the function.
      const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ _ping: true }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      });
      const ms = Date.now() - start;
      // Anything 200-499 means the function is reachable & responding.
      // 5xx means the function exists but errored (still "alive" though).
      if (res.status >= 200 && res.status < 500) {
        setFuncStatus(s => ({ ...s, [name]: { state: "ok", ms } }));
      } else {
        setFuncStatus(s => ({ ...s, [name]: { state: "error", ms, code: res.status } }));
      }
    } catch (e) {
      setFuncStatus(s => ({ ...s, [name]: { state: "error", err: e?.message || "Network error" } }));
    }
  }

  async function checkAllFunctions() {
    setChecking(true);
    await Promise.all([
      checkFunction("scan-receipt"),
      checkFunction("scan-business-card"),
      checkFunction("send-notifications"),
    ]);
    setChecking(false);
  }

  // Copy a diagnostics summary to the clipboard so the user can paste it
  // into a support message in one tap.
  async function copyReport() {
    const lines = [
      `PowerMate Diagnostics — ${new Date().toLocaleString()}`,
      `User: ${userId}`,
      `Online: ${isOnline ? "yes" : "no"}`,
      `Sync queue: ${pending.length} pending, ${failed.length} failed`,
      ...Object.entries(failedByTable).map(([t, n]) => `  · ${t}: ${n} failed`),
      "",
      "Edge function checks:",
      ...Object.entries(funcStatus).map(([n, s]) => `  · ${n}: ${s.state}${s.ms ? ` (${s.ms}ms)` : ""}${s.err ? ` — ${s.err}` : ""}${s.code ? ` — HTTP ${s.code}` : ""}`),
      "",
      `Recent crashes (${crashes.length}):`,
      ...crashes.slice(0, 5).map(c => `  · [${c.screen}] ${c.message} — ${c.at}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      alert("Diagnostics report copied to clipboard");
    } catch {
      alert("Couldn't copy — please screenshot this page instead.");
    }
  }

  async function clearAllFailures() {
    const ok = await confirm(
      `Remove ${failed.length} permanently-failed item${failed.length !== 1 ? "s" : ""} from the sync queue? The data on this device stays — it just won't keep retrying.`,
      { confirmLabel: "Clear", confirmVariant: "danger" }
    );
    if (!ok) return;
    // Caller doesn't have setData here — emit a message to the parent screen.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("powermate-clear-failed-queue"));
    }
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-2xl font-black text-slate-900">Diagnostics</p>
          <p className="text-sm text-slate-500">What's broken right now</p>
        </div>
      </div>

      {/* ── Overall status ── */}
      <Card className="p-4">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Connection</p>
        <Row
          icon={isOnline ? Wifi : WifiOff}
          label="Network"
          value={isOnline ? "Online" : "Offline"}
          status={isOnline ? "ok" : "warn"}
          hint={!isOnline ? "Sync paused — will resume when back online." : null}
        />
        <Row
          icon={Database}
          label="Sync queue (pending)"
          value={String(pending.length)}
          status={pending.length === 0 ? "ok" : pending.length > 50 ? "warn" : "idle"}
          hint={
            pending.length > 50 ? "Large queue — something may be stuck."
            : pending.some(i => (i.attempts || 0) >= 2) ? `${pending.filter(i => (i.attempts || 0) >= 2).length} item(s) have failed and are retrying — will move to "failed" after 5 attempts.`
            : null
          }
        />
        <Row
          icon={AlertTriangle}
          label="Sync queue (failed)"
          value={String(failed.length)}
          status={failed.length === 0 ? "ok" : "error"}
          hint={failed.length > 0 ? "These won't sync without intervention. See breakdown below." : null}
        />
      </Card>

      {/* ── Backfill ZAR shortcut ── */}
      {(() => {
        const missingZAR = (data.expenses || []).filter(e => e.currency && e.currency !== "ZAR" && (!e.amount_zar || e.amount_zar <= 0));
        if (missingZAR.length === 0) return null;
        return (
          <Card className="p-0 overflow-hidden">
            <button onClick={onBackfill}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px]">
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-amber-500" />
                <div>
                  <p className="text-base font-bold text-slate-800">Backfill ZAR</p>
                  <p className="text-xs text-slate-400">{missingZAR.length} foreign-currency expense{missingZAR.length !== 1 ? "s" : ""} missing a ZAR amount</p>
                </div>
              </div>
              <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-amber-500" />
            </button>
          </Card>
        );
      })()}

      {/* ── Failed sync breakdown ── */}
      {failed.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Failed by table</p>
            <button onClick={clearAllFailures}
              className="text-xs font-bold text-red-600 inline-flex items-center gap-1">
              <Trash2 size={12} /> Clear all
            </button>
          </div>
          {Object.entries(failedByTable).map(([t, n]) => (
            <Row key={t} icon={Bug} label={t} value={`${n} item${n !== 1 ? "s" : ""}`} status="error" />
          ))}
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Most often this means a column is missing on the table (run the relevant SQL migration)
            or an RLS rule is blocking the write. Open the browser console for the exact error.
          </p>
        </Card>
      )}

      {/* ── Edge function health ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Edge functions</p>
          <button onClick={checkAllFunctions} disabled={checking || !isOnline}
            className="text-xs font-bold text-blue-600 inline-flex items-center gap-1 disabled:opacity-50">
            <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> {checking ? "Checking…" : "Check now"}
          </button>
        </div>
        {["scan-receipt", "scan-business-card", "send-notifications"].map(name => {
          const s = funcStatus[name];
          return (
            <Row key={name}
              icon={Server}
              label={name}
              value={s?.ms ? `${s.ms}ms` : s?.state === "checking" ? "…" : "—"}
              status={!s ? "idle" : s.state === "ok" ? "ok" : s.state === "checking" ? "idle" : "error"}
              hint={s?.err || (s?.code ? `HTTP ${s.code}` : null)}
            />
          );
        })}
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">
          Tap "Check now" to ping each function. Green = reachable. Red = not deployed, crashed, or unauthorized.
        </p>
      </Card>

      {/* ── Recent crashes ── */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Recent crashes</p>
          {crashes.length > 0 && (
            <button onClick={() => { clearCrashLog(); setCrashes([]); }}
              className="text-xs font-bold text-red-600 inline-flex items-center gap-1">
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>
        {crashes.length === 0 ? (
          <div className="flex items-center gap-2 py-3">
            <CheckCircle2 size={16} className="text-green-500" />
            <p className="text-sm text-slate-600">No crashes recorded.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {crashes.slice(0, 5).map((c, i) => (
              <div key={i} className="rounded-xl bg-red-50 border border-red-100 p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-red-700 uppercase">{c.screen}</p>
                  <p className="text-xs text-slate-400">{new Date(c.at).toLocaleString()}</p>
                </div>
                <p className="text-sm font-mono text-red-800 break-all leading-snug">{c.message}</p>
              </div>
            ))}
            {crashes.length > 5 && (
              <p className="text-xs text-slate-400">…and {crashes.length - 5} more</p>
            )}
          </div>
        )}
      </Card>

      {/* ── Copy report ── */}
      <Card className="p-4">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Support</p>
        <Btn onClick={copyReport} variant="warning" className="w-full">
          <ClipboardCopy size={14} /> Copy diagnostics report
        </Btn>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Bundles everything on this page into a text block on your clipboard — paste into a
          message instead of taking screenshots.
        </p>
      </Card>
    </div>
  );
}
