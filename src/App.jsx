// ─── PowerMate App ────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, Users, Calendar, File as FileIcon,
  Clipboard, Wrench, Settings, UserPlus, Search,
} from "lucide-react";

import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll } from "./offline/offlineDb";

import { todayISO, logEvent, genId } from "./lib/helpers";
import { LOCAL_STORAGE_KEY, URGENCY_ESCALATION, PIN_KEY, PIN_UNLOCKED_KEY } from "./lib/constants";
import { pushSyncQueue, pullFromSupabase, setupRealtimeSync, registerSyncHandlers, triggerImmediateSync } from "./lib/sync";
import { requestNotificationPermission, scheduleNotificationsViaSW, buildNotificationItems } from "./lib/notifications";
import { getPINHash, loadPINHash, isSessionUnlocked, resetPINAttempts } from "./lib/pinHelpers";

import { AuthScreen }    from "./auth/AuthScreen";
import { PINSetupScreen, PINLockScreen } from "./auth/PINScreens";

import { NavTab, Spinner, DataLoadingScreen, Toast } from "./components/ui";
import SyncStatusBadge from "./components/SyncStatusBadge";
import { QuickCaptureFAB } from "./components/QuickCaptureFAB";
import { GlobalSearch } from "./components/GlobalSearch";

import { HomeScreen }      from "./screens/HomeScreen";
import { ClientsScreen }   from "./screens/ClientsScreen";
import { ContactsScreen }  from "./screens/ContactsScreen";
import { FollowupsScreen } from "./screens/FollowupsScreen";
import { QuotesScreen }    from "./screens/QuotesScreen";
import { NotesScreen }     from "./screens/NotesScreen";
import { EquipmentScreen } from "./screens/EquipmentScreen";
import { MoreScreen }      from "./screens/MoreScreen";

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

export default function PowerWorksApp() {
  const isOnline = useOnlineStatus();

  const [session,    setSession]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [screen,     setScreen]     = useState("Home");
  const [syncing,    setSyncing]    = useState(false);
  const [pinState,   setPinState]   = useState("checking");
  const [dataLoading, setDataLoading] = useState(true);
  const [syncError,  setSyncError]  = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [data, setData] = useState({
    clients: [], followups: [], quotes: [], notes: [], equipment: [], contacts: [], syncQueue: [],
  });
  const [quickAddTrigger, setQuickAddTrigger] = useState(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s || null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    registerSyncHandlers(setData, () => data.syncQueue);
  }, [data.syncQueue]);

  useEffect(() => {
    if (!session) return;
    async function checkPIN() {
      if (isSessionUnlocked()) { setPinState("unlocked"); return; }
      const hash = await loadPINHash();
      if (!hash) { setPinState("setup"); return; }
      setPinState("locked");
    }
    checkPIN();
  }, [session]);

  useEffect(() => {
    async function loadLocalData() {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (saved) setData(d => ({ ...d, ...JSON.parse(saved) }));
      } catch (e) { console.warn("localStorage load failed:", e); }

      try {
        const tables = ["clients", "followups", "quotes", "notes", "equipment", "contacts"];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [clients, followups, quotes, notes, equipment, contacts] = results;
        setData(d => ({
          ...d,
          ...(clients?.length   ? { clients }   : {}),
          ...(followups?.length ? { followups } : {}),
          ...(quotes?.length    ? { quotes }    : {}),
          ...(notes?.length     ? { notes }     : {}),
          ...(equipment?.length ? { equipment } : {}),
          ...(contacts?.length  ? { contacts }  : {}),
        }));
      } catch (e) { console.warn("IndexedDB load failed:", e); }
    }
    loadLocalData();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const safeData = {
          ...data,
          notes:     (data.notes     || []).map(n => ({ ...n, media: (n.media     || []).map(m => m.url ? { ...m, base64: undefined } : m) })),
          equipment: (data.equipment || []).map(e => ({ ...e, media: (e.media     || []).map(m => m.url ? { ...m, base64: undefined } : m) })),
          syncQueue: (data.syncQueue || []).map(q => {
            if (!q.data?.media) return q;
            return {
              ...q,
              data: { ...q.data, media: q.data.media.map(m => ({ ...m, base64: undefined })) },
            };
          }),
        };
        const serialized = JSON.stringify(safeData);
        const sizeMB = (serialized.length / 1024 / 1024).toFixed(1);
        if (parseFloat(sizeMB) > 4) logEvent("localStorage_size_warning", { sizeMB });
        localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
      } catch (e) {
        console.warn("Could not save local data:", e);
        if (e.name === "QuotaExceededError") logEvent("localStorage_quota_exceeded", { message: e.message });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  // ── FIXED: urgency escalation for overdue notes ──
  // Previously this ran on mount (before data had loaded, so it saw an empty
  // list) and never queued the escalated notes for sync — they showed
  // "Not synced" forever and other devices never saw the new urgency.
  // Now it runs once data is loaded, queues sync entries, persists offline,
  // and pushes immediately.
  useEffect(() => {
    if (dataLoading) return;
    const today = todayISO();
    const notes = data.notes || [];
    const toEscalate = notes.filter(n =>
      !n.resolved &&
      n.resolve_by &&
      n.resolve_by < today &&
      n.last_escalated !== n.resolve_by &&
      URGENCY_ESCALATION[n.urgency || "Normal"] !== (n.urgency || "Normal")
    );
    if (toEscalate.length === 0) return;

    const now = new Date().toISOString();
    const updates = toEscalate.map(n => ({
      ...n,
      urgency: URGENCY_ESCALATION[n.urgency || "Normal"],
      last_escalated: n.resolve_by,
      sync_status: "pending",
    }));
    const queueItems = updates.map(u => ({
      id: genId(),
      table: "notes",
      action: "update",
      data: { ...u, media: (u.media || []).map(m => ({ ...m, base64: undefined })) },
      status: "pending",
      created_at: now,
    }));

    setData(d => ({
      ...d,
      notes: (d.notes || []).map(n => updates.find(u => u.id === n.id) || n),
      syncQueue: [...queueItems, ...(d.syncQueue || [])],
    }));
    updates.forEach(u => offlineSave("notes", u));
    triggerImmediateSync();
  }, [dataLoading]); // eslint-disable-line

  useEffect(() => {
    if (!session) return;
    if (!isOnline) { setDataLoading(false); return; }
    const uid = session.user.id;

    pullFromSupabase(uid, setData).then(() => {
      setData(d => ({
        ...d,
        syncQueue: (d.syncQueue || []).filter(q => {
          if (!q.data?.media) return true;
          const hasUrls = q.data.media.some(m => m.url);
          const hasMedia = q.data.media.length > 0;
          if (hasMedia && !hasUrls) return false;
          return true;
        }),
      }));
    }).finally(() => setDataLoading(false));

    const cleanup = setupRealtimeSync(uid, setData);
    return cleanup;
  }, [session?.user?.id, isOnline]);

  useEffect(() => {
    function handleSyncFail(e) {
      setSyncError(`Sync failed: ${e.detail?.message || "Check your connection"}`);
      setTimeout(() => setSyncError(""), 5000);
    }
    window.addEventListener("powermate:sync_failed", handleSyncFail);
    return () => window.removeEventListener("powermate:sync_failed", handleSyncFail);
  }, []);

  useEffect(() => {
    if (notifPermission !== "granted") return;
    scheduleNotificationsViaSW(buildNotificationItems(data.followups, data.equipment, data.notes));
  }, [data.followups, data.equipment, notifPermission]);

  useEffect(() => {
    if (!isOnline || !session) return;
    const pending = (data.syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;
    const t = setTimeout(() => pushSyncQueue(data.syncQueue, setData), 3000);
    return () => clearTimeout(t);
  }, [isOnline, session, data.syncQueue?.length]);

  const prevOnlineRef = React.useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && wasOffline && session) {
      pullFromSupabase(session.user.id, setData);
      if ((data.syncQueue || []).some(i => i.status === "pending")) {
        pushSyncQueue(data.syncQueue, setData);
      }
    }
  }, [isOnline]);

  // ── Keyboard shortcut for search (desktop) ──
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

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

  function handleQuickCapture(targetScreen) {
    navigate(targetScreen);
    setQuickAddTrigger({ screen: targetScreen, ts: Date.now() });
  }

  // ── Android / browser back button support ──
  // Each screen change pushes a history entry, so the phone's back button
  // walks back through screens instead of exiting the app. If the search
  // overlay is open, back closes it first.
  function navigate(key) {
    if (key === screen) return;
    setSearchSeed(null); // normal navigation clears any pending search handoff
    window.history.pushState({ pmScreen: key }, "");
    setScreen(key);
  }

  // ── Global search handoff: navigating from a search result carries the
  // term into the destination screen's own search box ──
  function handleSearchNavigate(key, term) {
    navigate(key);
    setSearchSeed({ term: term || "", ts: Date.now() });
  }

  useEffect(() => {
    if (!window.history.state?.pmScreen) {
      window.history.replaceState({ pmScreen: "Home" }, "");
    }
    // Prevent accidental pull-to-refresh while scrolling lists (PWA polish).
    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
  }, []);

  useEffect(() => {
    function onPop(e) {
      if (searchOpen) {
        setSearchOpen(false);
        window.history.pushState({ pmScreen: screen }, "");
        return;
      }
      setScreen(e.state?.pmScreen || "Home");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [searchOpen, screen]);

  const pendingCount     = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const flaggedQuotes    = (data.quotes    || []).filter(q => q.status === "Pending").length;
  const overdueEquip     = (data.equipment || []).filter(e => { if (!e.service_due) return false; const d = Math.round((new Date(e.service_due + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000); return d < 0; }).length;
  const overdueFollowups = (data.followups || []).filter(f => f.date < todayISO() && !f.completed).length;
  const leadContacts     = (data.contacts  || []).filter(c => (c.status || "lead") === "lead").length;

  if (loading)              return <Spinner />;
  if (!session)             return <AuthScreen />;
  if (pinState === "checking") return <Spinner />;
  if (pinState === "setup")    return <PINSetupScreen onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked")   return <PINLockScreen onUnlock={() => setPinState("unlocked")} onForgot={forgotPIN} />;
  if (dataLoading)             return <DataLoadingScreen />;

  const screens = {
    Home:      <HomeScreen      data={data} setScreen={navigate} user={session.user} />,
    Clients:   <ClientsScreen   data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Contacts:  <ContactsScreen  data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} />,
    Quotes:    <QuotesScreen    data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Notes:     <NotesScreen     data={data} setData={setData} userId={session.user.id} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    More:      <MoreScreen      data={data} onLogout={logout} userId={session.user.id} onSyncNow={handleSyncNow} onClearQueue={(q) => setData(d => ({...d, syncQueue: q}))} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif} setScreen={navigate} />,
  };

  const NAV = [
    { icon: Home,      label: "Home",       key: "Home" },
    { icon: Users,     label: "Clients",    key: "Clients" },
    { icon: UserPlus,  label: "Contacts",   key: "Contacts",   badge: leadContacts || undefined },
    { icon: Calendar,  label: "Follow-ups", key: "Followups",  badge: overdueFollowups || undefined },
    { icon: Clipboard, label: "Notes",      key: "Notes" },
    { icon: Wrench,    label: "Equipment",  key: "Equipment",  badge: overdueEquip || undefined },
    { icon: Settings,  label: "More",       key: "More",       badge: (pendingCount + flaggedQuotes) || undefined },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-28" style={{ background: "#F7F3F3" }}>

        {/* Floating Search button — docked above the quick-capture FAB.
            (Top-right placement collided with screen header buttons on mobile.) */}
        <button
          onClick={() => setSearchOpen(true)}
          className="fixed z-40 rounded-full bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95"
          style={{
            width: 44,
            height: 44,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 152px)",
            right: 20,
            boxShadow: "0 2px 6px rgba(15, 23, 42, 0.12), 0 1px 2px rgba(15, 23, 42, 0.08)",
            border: "1px solid #E2E8F0",
            opacity: 0.96,
          }}
          aria-label="Search">
          <Search size={19} />
        </button>

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
              <NavTab key={key} icon={icon} label={label} active={screen === key} onClick={() => navigate(key)} badge={badge} />
            ))}
          </div>
        </nav>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} />

        <QuickCaptureFAB currentScreen={screen} onTrigger={handleQuickCapture} />

        <GlobalSearch
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          data={data}
          onNavigate={handleSearchNavigate}
        />

        <AnimatePresence>
          {syncError && <Toast message={syncError} type="error" onDone={() => setSyncError("")} />}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
