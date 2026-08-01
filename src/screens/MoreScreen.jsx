// ─── More / Settings Screen ───────────────────────────────────────────────────
import React, { useState, useEffect } from "react";
import { RefreshCw, Shield, Bell, LogOut, File as FileIcon, ChevronRight, Receipt, Users } from "lucide-react";
import { BRAND, PIN_KEY, PIN_UNLOCKED_KEY } from "../lib/constants";
import { Card, Btn, Toast, PageHeader, useConfirm } from "../components/ui";
import ReportExport from "../ReportExport";
import { BackupExport } from "../components/BackupExport";
import { CompanyDocuments } from "../components/CompanyDocuments";
import { subscribeToPush, pushSupported, iosNeedsInstall } from "../lib/pushManager";

export function MoreScreen({ data, onLogout, onSyncNow, onClearQueue, syncing, isOnline, notifPermission, onRequestNotif, setScreen, userId, teamId }) {
  const { confirm, dialog } = useConfirm();
  const pendingCount = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const failedCount = (data.syncQueue || []).filter(i => i.status === "failed").length;

  // Push notification state: idle | working | active | denied | ios-install | unsupported | error
  const [toast, setToast]           = useState("");
  const [targetInput, setTargetInput] = useState(
    () => localStorage.getItem(`pm_revenue_target_${userId}`) || ""
  );
  const [pushState, setPushState] = useState("idle");
  const [pushError, setPushError] = useState("");
  const [pinEnabled, setPinEnabled] = useState(
    !localStorage.getItem("pm_pin_disabled") && !!localStorage.getItem(PIN_KEY)
  );

  useEffect(() => {
    if (!pushSupported()) { setPushState("unsupported"); return; }
    if (iosNeedsInstall()) { setPushState("ios-install"); return; }
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") setPushState("active");
      else if (Notification.permission === "denied") setPushState("denied");
      else setPushState("idle");
    }
  }, []);

  async function handleEnablePush() {
    setPushState("working");
    setPushError("");
    const result = await subscribeToPush(userId);
    if (result.ok) {
      setPushState("active");
    } else if (result.reason === "ios-needs-install") {
      setPushState("ios-install");
    } else if (result.reason === "denied") {
      setPushState("denied");
    } else {
      // Subscribe-failed, sw-not-ready, save-failed, etc — show the real reason.
      setPushState("error");
      setPushError(
        result.reason === "sw-not-ready" ? "Service worker not ready. Hard-refresh and try again."
        : result.reason === "subscribe-failed" ? `Apple Push declined — usually a VAPID key mismatch. (${result.detail || ""})`
        : result.reason === "save-failed" ? `Couldn't save to database: ${result.detail || ""}`
        : result.reason === "unsupported" ? "This browser doesn't support push notifications."
        : `Failed: ${result.reason || "unknown error"}`
      );
    }
  }

  const flaggedQuotes = (data.quotes || []).filter(q => q.status === "Pending").length;
  const unsubmittedExpenses = (data.expenses || []).filter(e => e.status === "unsubmitted").length;

  function changePIN() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    window.location.reload();
  }

  async function handleLogout() {
    const ok = await confirm("Sign out of PowerMate?", { confirmLabel: "Sign Out", confirmVariant: "danger" });
    if (ok) onLogout();
  }

  return (
    <div className="space-y-4">
      {dialog}
      <PageHeader title="Settings" subtitle="Sync, security & account" />

      {/* Quotes + Expenses shortcuts */}
      {setScreen && (
        <Card className="overflow-hidden">
          <button onClick={() => setScreen("Quotes")} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px] border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#DCFCE7", color: "#15803D" }}>
              <FileIcon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800">Quotes</p>
              <p className="text-sm text-slate-400">
                {(data.quotes || []).length} total{flaggedQuotes > 0 ? ` · ${flaggedQuotes} pending` : ""}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
          <button onClick={() => setScreen("Expenses")} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px]">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#FFE4D9", color: "#7C2D12" }}>
              <Receipt size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800">Expenses</p>
              <p className="text-sm text-slate-400">
                {(data.expenses || []).length} total{unsubmittedExpenses > 0 ? ` · ${unsubmittedExpenses} unsubmitted` : ""}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300 shrink-0" />
          </button>
        </Card>
      )}

      {/* Sync */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Sync Status</p>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-green-500" : "bg-slate-300"}`} />
              <p className="text-base font-bold text-slate-800">{isOnline ? "Online" : "Offline"}</p>
            </div>
            <p className="text-sm text-slate-400 mt-0.5">{isOnline ? "Connected to cloud" : "Changes saved locally, will sync when back online"}</p>
          </div>
          <Btn size="sm" variant={isOnline ? "solid" : "secondary"} onClick={onSyncNow} disabled={!isOnline || syncing || pendingCount === 0}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Btn>
        </div>
        {pendingCount > 0
          ? <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5">
              <p className="text-sm font-bold text-amber-700">⚠️ {pendingCount} change{pendingCount !== 1 ? "s" : ""} waiting to sync</p>
              <p className="text-xs text-amber-600 mt-0.5">{isOnline ? "Tap Sync Now or wait — syncs automatically" : "Will sync automatically when you reconnect"}</p>
              <button
                onClick={() => {
                  // Only remove items that are genuinely stuck (failed 5+ times or have invalid data)
                  const stuck = (data.syncQueue || []).filter(q => {
                    if (q.status === 'failed') return true;
                    if (q.table === 'equipment' && q.data?.service_due === '') return true;
                    if (q.table === 'notes' && q.data?.resolve_by === '') return true;
                    if (q.data?.media && q.data.media.length > 0 && !q.data.media.some(m => m.url)) return true;
                    return false;
                  });
                  if (stuck.length === 0) {
                    window.alert("No stuck items found. Your queue looks healthy — just wait for sync.");
                    return;
                  }
                  const stuckIds = new Set(stuck.map(s => s.id));
                  const remaining = (data.syncQueue || []).filter(q => !stuckIds.has(q.id));
                  onClearQueue(remaining);
                }}
                className="mt-2 w-full rounded-xl border border-amber-300 py-2 text-xs font-bold text-amber-700 bg-white">
                Clear Stuck Items
              </button>
            </div>
          : failedCount > 0
          ? <div className="rounded-xl bg-red-50 border border-red-200 p-3.5">
              <p className="text-sm font-bold text-red-700">⚠️ {failedCount} item{failedCount !== 1 ? "s" : ""} failed to sync</p>
              <p className="text-xs text-red-600 mt-0.5">Tap Clear Stuck Items to remove them, or check Diagnostics</p>
              <button
                onClick={() => {
                  const remaining = (data.syncQueue || []).filter(q => q.status !== "failed");
                  onClearQueue(remaining);
                }}
                className="mt-2 w-full rounded-xl border border-red-300 py-2 text-xs font-bold text-red-700 bg-white">
                Clear Failed Items
              </button>
            </div>
          : <div className="rounded-xl bg-green-50 border border-green-200 p-3.5">
              <p className="text-sm font-bold text-green-700">✓ All data synced to cloud</p>
              <p className="text-xs text-green-600 mt-0.5">Your data is safe and visible on all devices</p>
            </div>
        }
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Notifications</p>
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-800">Background Notifications</p>
            <p className="text-sm text-slate-400 mt-0.5">
              {pushState === "active" ? "✓ Active — overdue & follow-up alerts, even when app is closed"
               : pushState === "denied" ? "✗ Blocked in browser settings"
               : pushState === "ios-install" ? "⚠ Add to Home Screen first (see below)"
               : pushState === "working" ? "Enabling…"
               : "Get alerts for overdue items and follow-ups, even when the app is closed"}
            </p>
          </div>
          {pushState === "active"
            ? <span className="shrink-0 text-green-600 text-sm font-bold">Active ✓</span>
            : (pushState !== "denied" && pushState !== "ios-install") &&
              <Btn size="sm" variant="warning" onClick={handleEnablePush} disabled={pushState === "working"}>
                <Bell size={14} />{pushState === "working" ? "…" : "Enable"}
              </Btn>
          }
        </div>
        {pushState === "error" && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 space-y-2">
            <p className="text-xs font-bold text-red-800">⚠ Couldn't enable notifications</p>
            <p className="text-xs text-red-700 leading-relaxed">{pushError}</p>
            <Btn size="sm" variant="warning" onClick={handleEnablePush}>
              <Bell size={13} /> Try again
            </Btn>
          </div>
        )}
        {pushState === "ios-install" && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">📱 iPhone/iPad — one-time setup</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Apple only allows notifications after you add PowerMate to your Home Screen:
              tap the <strong>Share</strong> button &rarr; <strong>Add to Home Screen</strong> &rarr; open PowerMate
              from the new icon &rarr; then tap Enable here. This is an Apple requirement for all web apps.
            </p>
          </div>
        )}
        {pushState === "denied" && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              Notifications are blocked. Re-enable them in your browser's site settings for this app, then tap Enable.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Security</p>

        {/* PIN toggle */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-800">PIN Lock</p>
            <p className="text-sm text-slate-400">
              {pinEnabled ? "App is locked on open" : "No lock — anyone can open the app"}
            </p>
          </div>
          <button
            onClick={() => {
              if (pinEnabled) {
                const sure = window.confirm(
                  "Disable PIN lock?\n\nAnyone with access to your phone will be able to open PowerMate and see all your client data.\n\nWe recommend keeping PIN lock on."
                );
                if (!sure) return;
                localStorage.removeItem(PIN_KEY);
                sessionStorage.removeItem(PIN_UNLOCKED_KEY);
                localStorage.setItem("pm_pin_disabled", "1");
                setPinEnabled(false);
              } else {
                localStorage.removeItem("pm_pin_disabled");
                localStorage.removeItem(PIN_KEY);
                sessionStorage.removeItem(PIN_UNLOCKED_KEY);
                window.location.reload(); // trigger PIN setup flow
              }
            }}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${pinEnabled ? "" : "bg-slate-200"}`}
            style={pinEnabled ? { background: BRAND.primary } : {}}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${pinEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
        </div>

        {/* Change PIN — only if enabled */}
        {pinEnabled && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <p className="text-sm text-slate-500">Change your 6-digit PIN</p>
            <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={14} />Change PIN</Btn>
          </div>
        )}

        {/* Warning when disabled */}
        {!pinEnabled && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 space-y-2">
            <p className="text-sm font-bold text-amber-700">⚠️ PIN lock is off</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Anyone who picks up your phone can open PowerMate and see all client data, field notes, quotes, and expenses — including your team's records.
            </p>
            <div className="pt-1 space-y-1.5">
              <p className="text-xs font-black text-amber-700">If you choose not to use PIN lock:</p>
              <ul className="text-xs text-amber-600 space-y-1">
                <li>• Enable your phone's own screen lock (Face ID, fingerprint, or phone PIN) — this is your minimum protection</li>
                <li>• Never leave your phone unattended at client sites</li>
                <li>• Enable auto-lock (screen timeout) set to 30 seconds or less</li>
                <li>• If your phone is lost or stolen, sign out of PowerMate from another device immediately</li>
              </ul>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("pm_pin_disabled");
                localStorage.removeItem(PIN_KEY);
                sessionStorage.removeItem(PIN_UNLOCKED_KEY);
                window.location.reload();
              }}
              className="w-full mt-1 rounded-xl py-2.5 text-sm font-black text-white"
              style={{ background: "#B45309" }}>
              Enable PIN lock
            </button>
          </div>
        )}
      </Card>

      {/* ── Dashboard Settings ── */}
      <Card className="p-4 space-y-4">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Dashboard Settings</p>

        {/* Neglect threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700">Client neglect warning</p>
              <p className="text-xs text-slate-400">Show warning after this many days without contact</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const v = Math.max(7, parseInt(localStorage.getItem("pm_neglect_days")||"21",10) - 7);
                localStorage.setItem("pm_neglect_days", String(v));
                setToast(`Warning after ${v} days`);
              }} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold text-lg flex items-center justify-center">−</button>
              <span className="text-base font-black text-slate-900 w-10 text-center">
                {localStorage.getItem("pm_neglect_days") || "21"}d
              </span>
              <button onClick={() => {
                const v = Math.min(90, parseInt(localStorage.getItem("pm_neglect_days")||"21",10) + 7);
                localStorage.setItem("pm_neglect_days", String(v));
                setToast(`Warning after ${v} days`);
              }} className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold text-lg flex items-center justify-center">+</button>
            </div>
          </div>
          <div className="flex gap-2">
            {[14, 21, 30, 45].map(d => (
              <button key={d} onClick={() => {
                localStorage.setItem("pm_neglect_days", String(d));
                setToast(`Warning after ${d} days`);
              }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  (parseInt(localStorage.getItem("pm_neglect_days")||"21",10)) === d
                    ? "text-white" : "bg-slate-100 text-slate-500"
                }`}
                style={(parseInt(localStorage.getItem("pm_neglect_days")||"21",10)) === d ? {background:"#8B1A1A"} : {}}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-slate-100"/>

        {/* Monthly Revenue Target */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-700">Monthly Revenue Target</p>
          <p className="text-xs text-slate-400">Shows a progress bar on your dashboard</p>
        <p className="text-xs text-slate-400">Set your monthly won-revenue target. Shows a progress bar on your dashboard.</p>
        <div className="flex gap-2 items-center">
          <span className="text-sm font-bold text-slate-500">R</span>
          <input
            type="number"
            value={targetInput}
            onChange={e => setTargetInput(e.target.value)}
            placeholder="e.g. 100000"
            className="flex-1 rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-red-300"
          />
          <button
            onClick={() => {
              const val = parseFloat(targetInput) || 0;
              if (val > 0) {
                localStorage.setItem(`pm_revenue_target_${userId}`, String(val));
                setToast("Target saved — check your dashboard");
              } else {
                localStorage.removeItem(`pm_revenue_target_${userId}`);
                setToast("Target cleared");
              }
            }}
            className="px-4 py-2.5 rounded-xl text-sm font-bold text-white min-h-[44px]"
            style={{ background: BRAND.primary }}>
            Save
          </button>
        </div>
        {localStorage.getItem(`pm_revenue_target_${userId}`) && (
          <p className="text-xs text-green-600 font-bold">
            ✓ Target: R {parseFloat(localStorage.getItem(`pm_revenue_target_${userId}`)).toLocaleString("en-ZA")} / month
          </p>
        )}
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Data Summary</p>
        {[
          { label: "Clients",    count: (data.clients   || []).length },
          { label: "Contacts",   count: (data.contacts  || []).length },
          { label: "Follow-ups", count: (data.followups || []).length },
          { label: "Quotes",     count: (data.quotes    || []).length },
          { label: "Notes",      count: (data.notes     || []).length },
          { label: "Equipment",  count: (data.equipment || []).length },
          { label: "Expenses",   count: (data.expenses  || []).length },
        ].map(({ label, count }) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
            <p className="text-base text-slate-600">{label}</p>
            <p className="text-base font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      {/* Diagnostics — quick health check, only loud when something's wrong */}
      {setScreen && (() => {
        const failedCount = (data.syncQueue || []).filter(i => i.status === "failed").length;
        const pendingCount2 = (data.syncQueue || []).filter(i => i.status === "pending").length;
        const isHealthy = failedCount === 0;
        return (
          <Card className="p-0 overflow-hidden">
            <button onClick={() => setScreen("Diagnostics")}
              className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px]">
              <div className="flex items-center gap-3">
                <Shield size={18} className={isHealthy ? "text-slate-400" : "text-red-500"} />
                <div>
                  <p className="text-base font-bold text-slate-800">Diagnostics</p>
                  <p className="text-xs text-slate-400">
                    {isHealthy
                      ? (pendingCount2 > 0 ? `${pendingCount2} syncing` : "All clear")
                      : `${failedCount} sync issue${failedCount !== 1 ? "s" : ""} — tap to view`}
                  </p>
                </div>
              </div>
              {!isHealthy && (
                <span className="shrink-0 w-2.5 h-2.5 rounded-full bg-red-500" />
              )}
            </button>
          </Card>
        );
      })()}

      {/* Company Documents */}
      <CompanyDocuments userId={userId} teamId={teamId} />

      {/* Team Settings */}
      <Card className="p-0 overflow-hidden">
        <button onClick={() => setScreen("Team")}
          className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px]">
          <div className="flex items-center gap-3">
            <Users size={18} className="text-slate-400" />
            <div>
              <p className="text-base font-bold text-slate-800">Team Settings</p>
              <p className="text-xs text-slate-400">Invite, manage members, sharing</p>
            </div>
          </div>
        </button>
      </Card>

      {/* Backup */}
      <BackupExport data={data} />

      {/* Management Report (existing) */}
      <ReportExport data={data} />

      <Btn variant="danger" className="w-full" size="lg" onClick={handleLogout}>
        <LogOut size={16} />Sign Out
      </Btn>
      <p className="text-center text-xs text-slate-300">PowerMate v2.4 · Power Works (Pty) Ltd</p>
      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}
