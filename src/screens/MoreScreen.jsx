// ─── More / Settings Screen ───────────────────────────────────────────────────
import React from "react";
import { RefreshCw, Shield, Bell, LogOut, File as FileIcon, ChevronRight } from "lucide-react";
import { BRAND, PIN_KEY, PIN_UNLOCKED_KEY } from "../lib/constants";
import { Card, Btn, PageHeader, useConfirm } from "../components/ui";
import ReportExport from "../ReportExport";
import { BackupExport } from "../components/BackupExport";

export function MoreScreen({ data, onLogout, onSyncNow, onClearQueue, syncing, isOnline, notifPermission, onRequestNotif, setScreen }) {
  const { confirm, dialog } = useConfirm();
  const pendingCount = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const flaggedQuotes = (data.quotes || []).filter(q => q.status === "Pending").length;

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

      {/* Quotes shortcut */}
      {setScreen && (
        <Card className="overflow-hidden">
          <button onClick={() => setScreen("Quotes")} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors text-left min-h-[60px]">
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
                  const cleared = (data.syncQueue || []).filter(q => {
                    if (q.table === 'equipment' && q.data?.service_due === '') return false;
                    if (q.table === 'notes' && q.data?.resolve_by === '') return false;
                    if (q.data?.media && q.data.media.length > 0 && !q.data.media.some(m => m.url)) return false;
                    return true;
                  });
                  if (cleared.length < (data.syncQueue || []).length) {
                    onClearQueue(cleared);
                  } else {
                    onClearQueue([]);
                  }
                }}
                className="mt-2 w-full rounded-xl border border-amber-300 py-2 text-xs font-bold text-amber-700 bg-white">
                Clear Stuck Items
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
            <p className="text-base font-bold text-slate-800">Push Notifications</p>
            <p className="text-sm text-slate-400 mt-0.5">
              {notifPermission === "granted" ? "✓ Active — follow-up reminders on"
               : notifPermission === "denied" ? "✗ Blocked in browser settings"
               : "Get reminders for follow-ups and service due dates"}
            </p>
          </div>
          {notifPermission === "granted"
            ? <span className="shrink-0 text-green-600 text-sm font-bold">Active ✓</span>
            : notifPermission !== "denied" && <Btn size="sm" variant="warning" onClick={onRequestNotif}><Bell size={14} />Enable</Btn>
          }
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Security</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-slate-800">PIN Lock</p>
            <p className="text-sm text-slate-400">Change your 6-digit PIN</p>
          </div>
          <Btn size="sm" variant="secondary" onClick={changePIN}><Shield size={14} />Change PIN</Btn>
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
        ].map(({ label, count }) => (
          <div key={label} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
            <p className="text-base text-slate-600">{label}</p>
            <p className="text-base font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </Card>

      {/* Backup */}
      <BackupExport data={data} />

      {/* Management Report (existing) */}
      <ReportExport data={data} />

      <Btn variant="danger" className="w-full" size="lg" onClick={handleLogout}>
        <LogOut size={16} />Sign Out
      </Btn>
      <p className="text-center text-xs text-slate-300">PowerMate v2.4 · Power Works (Pty) Ltd</p>
    </div>
  );
}
