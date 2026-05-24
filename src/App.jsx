// ─── PowerMate App ────────────────────────────────────────────────────────────
// Main application file — routing, auth, data management, sync
// All UI components, screens, and business logic live in separate files
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Users, Calendar, File as FileIcon,
  Clipboard, Wrench, Settings,
} from "lucide-react";

// Supabase
import { supabase } from "./supabase";

// Hooks
import { useOnlineStatus } from "./hooks/useOnlineStatus";

// Offline
import { offlineSave, offlineGetAll } from "./offline/offlineDb";

// Lib
import { todayISO, logEvent, genId }                    from "./lib/helpers";
import { LOCAL_STORAGE_KEY, URGENCY_ESCALATION, PIN_KEY, PIN_UNLOCKED_KEY } from "./lib/constants";
import { pushSyncQueue, pullFromSupabase, setupRealtimeSync, registerSyncHandlers, triggerImmediateSync } from "./lib/sync";
import { requestNotificationPermission, scheduleNotificationsViaSW, buildNotificationItems } from "./lib/notifications";
import { getPINHash, loadPINHash, isSessionUnlocked, resetPINAttempts } from "./lib/pinHelpers";

// Auth & PIN
import { AuthScreen }    from "./auth/AuthScreen";
import { PINSetupScreen, PINLockScreen } from "./auth/PINScreens";

// UI primitives
import { NavTab, Spinner, DataLoadingScreen, Toast } from "./components/ui";
import SyncStatusBadge from "./components/SyncStatusBadge";

// Screens
import { HomeScreen }      from "./screens/HomeScreen";
import { ClientsScreen }   from "./screens/ClientsScreen";
import { FollowupsScreen } from "./screens/FollowupsScreen";
import { QuotesScreen }    from "./screens/QuotesScreen";
import { NotesScreen }     from "./screens/NotesScreen";
import { EquipmentScreen } from "./screens/EquipmentScreen";
import { MoreScreen }      from "./screens/MoreScreen";

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) {
    console.error("PowerMate:", e, i);
    try { logEvent("app_crashed", { message: e?.message, stack: (e?.stack || "").slice(0, 500) }); } catch (_) {}
  }
  render() {
    if (this.state.hasError) return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: "#F7F3F3" }}>
        <div className="bg-white rounded-2xl max-w-sm w-full p-8 space-y-4 shadow-sm border border-slate-100">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
          <button onClick={() => window.location.reload()}
            className="w-full rounded-2xl py-4 text-sm font-bold text-white min-h-[52px]"
            style={{ background: "#8B1A1A" }}>
            Reload App
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const isOnline = useOnlineStatus();

  const [session,    setSession]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [screen,     setScreen]     = useState("Home");
  const [syncing,    setSyncing]    = useState(false);
  const [pinState,   setPinState]   = useState("checking");
  const [dataLoading, setDataLoading] = useState(true);
  const [syncError,  setSyncError]  = useState("");
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [data, setData] = useState({
    clients: [], followups: [], quotes: [], notes: [], equipment: [], syncQueue: [],
  });

  // ── Auth ──
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s || null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // ── Register sync handlers so screens can trigger immediate sync ──
  useEffect(() => {
    registerSyncHandlers(setData, () => data.syncQueue);
  }, [data.syncQueue]);

  // ── PIN — loads from localStorage or Supabase user metadata ──
  useEffect(() => {
    if (!session) return;
    async function checkPIN() {
      if (isSessionUnlocked()) { setPinState("unlocked"); return; }
      const hash = await loadPINHash(); // checks local then Supabase
      if (!hash) { setPinState("setup"); return; }
      setPinState("locked");
    }
    checkPIN();
  }, [session]);

  // ── Load local data (IndexedDB + localStorage) ──
  useEffect(() => {
    async function loadLocalData() {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) setData(d => ({ ...d, ...JSON.parse(saved) }));
      } catch (e) { console.warn("localStorage load failed:", e); }

      try {
        const tables  = ["clients", "followups", "quotes", "notes", "equipment"];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [clients, followups, quotes, notes, equipment] = results;
        setData(d => ({
          ...d,
          ...(clients?.length   ? { clients }   : {}),
          ...(followups?.length ? { followups } : {}),
          ...(quotes?.length    ? { quotes }    : {}),
          ...(notes?.length     ? { notes }     : {}),
          ...(equipment?.length ? { equipment } : {}),
        }));
      } catch (e) { console.warn("IndexedDB load failed:", e); }
    }
    loadLocalData();
  }, []);

  // ── Save to localStorage (debounced 500ms) ──
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const safeData = {
          ...data,
          notes:     (data.notes     || []).map(n => ({ ...n, media: (n.media     || []).map(m => m.url ? { ...m, base64: undefined } : m) })),
          equipment: (data.equipment || []).map(e => ({ ...e, media: (e.media     || []).map(m => m.url ? { ...m, base64: undefined } : m) })),
          // Strip base64 from syncQueue to prevent localStorage bloat
          // and prevent old base64 versions from overwriting synced URLs
          syncQueue: (data.syncQueue || []).map(q => {
            if (!q.data?.media) return q;
            return {
              ...q,
              data: {
                ...q.data,
                media: q.data.media.map(m => ({ ...m, base64: undefined })),
              },
            };
          }),
        };
        const serialized = JSON.stringify(safeData);
        const sizeMB     = (serialized.length / 1024 / 1024).toFixed(1);
        if (parseFloat(sizeMB) > 4) logEvent("localStorage_size_warning", { sizeMB });
        localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      } catch (e) {
        console.warn("Could not save local data:", e);
        if (e.name === "QuotaExceededError") logEvent("localStorage_quota_exceeded", { message: e.message });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  // ── Auto-escalate overdue note urgency ──
  useEffect(() => {
    const today = todayISO();
    const notes = data.notes || [];
    let changed = false;
    const escalated = notes.map(n => {
      if (n.resolved || !n.resolve_by || n.resolve_by >= today) return n;
      if (n.last_escalated === n.resolve_by) return n;
      const next = URGENCY_ESCALATION[n.urgency || "Normal"];
      if (next === (n.urgency || "Normal")) return { ...n, last_escalated: n.resolve_by };
      changed = true;
      return { ...n, urgency: next, last_escalated: n.resolve_by, sync_status: "pending" };
    });
    if (changed) setData(d => ({ ...d, notes: escalated }));
  }, []); // eslint-disable-line

  // ── Pull from Supabase + real-time subscriptions ──
  useEffect(() => {
    if (!session) return;
    if (!isOnline) { setDataLoading(false); return; }
    const uid = session.user.id;

    // Pull fresh data then clean up any bad syncQueue entries
    pullFromSupabase(uid, setData).then(() => {
      // After pull, remove any syncQueue entries where media has no URLs
      // These are stale entries that would overwrite good data
      setData(d => ({
        ...d,
        syncQueue: (d.syncQueue || []).filter(q => {
          if (!q.data?.media) return true; // no media field, keep it
          const hasUrls = q.data.media.some(m => m.url);
          const hasMedia = q.data.media.length > 0;
          if (hasMedia && !hasUrls) return false; // has media but no URLs = bad entry, remove
          return true;
        }),
      }));
    }).finally(() => setDataLoading(false));

    // Set up real-time sync for all tables
    const cleanup = setupRealtimeSync(uid, setData);
    return cleanup;
  }, [session?.user?.id, isOnline]);

  // ── Sync error listener ──
  useEffect(() => {
    function handleSyncFail(e) {
      setSyncError(`Sync failed: ${e.detail?.message || "Check your connection"}`);
      setTimeout(() => setSyncError(""), 5000);
    }
    window.addEventListener("powermate:sync_failed", handleSyncFail);
    return () => window.removeEventListener("powermate:sync_failed", handleSyncFail);
  }, []);

  // ── Schedule notifications ──
  useEffect(() => {
    if (notifPermission !== "granted") return;
    scheduleNotificationsViaSW(buildNotificationItems(data.followups, data.equipment, data.notes));
  }, [data.followups, data.equipment, notifPermission]);

  // ── Auto-sync: retry pending items when online, immediately on reconnect ──
  useEffect(() => {
    if (!isOnline || !session) return;
    const pending = (data.syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;
    // Immediate retry when coming back online, 3s debounce otherwise
    const t = setTimeout(() => pushSyncQueue(data.syncQueue, setData), 3000);
    return () => clearTimeout(t);
  }, [isOnline, session, data.syncQueue?.length]);

  // ── Re-pull when coming back online after being offline ──
  const prevOnlineRef = React.useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && wasOffline && session) {
      // Just came back online — pull fresh data and flush queue
      pullFromSupabase(session.user.id, setData);
      if ((data.syncQueue || []).some(i => i.status === "pending")) {
        pushSyncQueue(data.syncQueue, setData);
      }
    }
  }, [isOnline]);

  // ── Handlers ──
  async function handleSyncNow() { setSyncing(true); await pushSyncQueue(data.syncQueue, setData); setSyncing(false); }

  async function handleRequestNotif() {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? "granted" : "denied");
    if (granted) scheduleNotificationsViaSW(buildNotificationItems(data.followups, data.equipment, data.notes));
  }

  async function logout() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    resetPINAttempts();
    try { await supabase.auth.signOut(); } catch (e) { console.warn("Sign out failed:", e); }
    setSession(null);
  }

  async function forgotPIN() {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    resetPINAttempts();
    try { await supabase.auth.signOut(); } catch (e) { console.warn("Sign out failed:", e); }
    setSession(null);
  }

  // ── Badge counts ──
  const pendingCount    = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const flaggedQuotes   = (data.quotes    || []).filter(q => q.status === "Pending").length;
  const overdueEquip    = (data.equipment || []).filter(e => { if (!e.service_due) return false; const d = Math.round((new Date(e.service_due + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000); return d < 0; }).length;
  const overdueFollowups = (data.followups || []).filter(f => f.date < todayISO() && !f.completed).length;

  // ── Early returns ──
  if (loading)              return <Spinner />;
  if (!session)             return <AuthScreen />;
  if (pinState === "checking") return <Spinner />;
  if (pinState === "setup")    return <PINSetupScreen onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked")   return <PINLockScreen onUnlock={() => setPinState("unlocked")} onForgot={forgotPIN} />;
  if (dataLoading)             return <DataLoadingScreen />;

  // ── Screens ──
  const screens = {
    Home:      <HomeScreen      data={data} setScreen={setScreen} />,
    Clients:   <ClientsScreen   data={data} setData={setData} userId={session.user.id} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} />,
    Quotes:    <QuotesScreen    data={data} setData={setData} userId={session.user.id} />,
    Notes:     <NotesScreen     data={data} setData={setData} userId={session.user.id} isOnline={isOnline} />,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} isOnline={isOnline} />,
    More:      <MoreScreen      data={data} onLogout={logout}  onSyncNow={handleSyncNow} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif} />,
  };

  const NAV = [
    { icon: Home,      label: "Home",      key: "Home" },
    { icon: Users,     label: "Clients",   key: "Clients" },
    { icon: Calendar,  label: "Follow-ups",key: "Followups",  badge: overdueFollowups || undefined },
    { icon: FileIcon,  label: "Quotes",    key: "Quotes",     badge: flaggedQuotes    || undefined },
    { icon: Clipboard, label: "Notes",     key: "Notes" },
    { icon: Wrench,    label: "Equipment", key: "Equipment",  badge: overdueEquip     || undefined },
    { icon: Settings,  label: "More",      key: "More",       badge: pendingCount     || undefined },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-28" style={{ background: "#F7F3F3" }}>
        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              {screens[screen]}
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-100 bg-white/95 backdrop-blur-md px-1 pt-1 pb-safe shadow-lg">
          <div className="mx-auto grid max-w-2xl grid-cols-7 gap-0 pb-1">
            {NAV.map(({ icon, label, key, badge }) => (
              <NavTab key={key} icon={icon} label={label} active={screen === key} onClick={() => setScreen(key)} badge={badge} />
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} />

        <AnimatePresence>
          {syncError && <Toast message={syncError} type="error" onDone={() => setSyncError("")} />}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
