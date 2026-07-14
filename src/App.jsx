// ─── PowerMate App ────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home,
  Calendar,
  Settings,
  Search,
  Menu,
  Plus,
  Bell,
} from "lucide-react";

import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll, setOfflineUser, clearAllStores } from "./offline/offlineDb";

import { todayISO, logEvent, genId } from "./lib/helpers";
import { localStorageKey, URGENCY_ESCALATION, PIN_KEY, PIN_UNLOCKED_KEY, BRAND } from "./lib/constants";
import { pushSyncQueue, pullFromSupabase, setupRealtimeSync, registerSyncHandlers, triggerImmediateSync } from "./lib/sync";
import { requestNotificationPermission, scheduleNotificationsViaSW, buildNotificationItems } from "./lib/notifications";
import { runQuoteAutomations } from "./lib/quoteAutomation"; // NEW — quote auto-expire
import { getPINHash, isSessionUnlocked, markSessionUnlocked } from "./auth/PINScreens";
function resetPINAttempts() {
  localStorage.removeItem("pm_pin_attempts");
  localStorage.removeItem("pm_pin_lockout_until"); // FIX: also clear lockout
}

import { AuthScreen }    from "./auth/AuthScreen";
import { PINSetupScreen, PINLockScreen } from "./auth/PINScreens";

import { NavTab, Spinner, DataLoadingScreen, Toast } from "./components/ui";
import SyncStatusBadge from "./components/SyncStatusBadge";
import { QuickCaptureFAB } from "./components/QuickCaptureFAB";
import { GlobalSearch } from "./components/GlobalSearch";
import { NavDrawer } from "./components/NavDrawer";

import { HomeScreen }      from "./screens/HomeScreen";
import { ClientsScreen }   from "./screens/ClientsScreen";
import { ContactsScreen }  from "./screens/ContactsScreen";
import { FollowupsScreen } from "./screens/FollowupsScreen";
import { QuotesScreen }    from "./screens/QuotesScreen";
import { NotesScreen }     from "./screens/NotesScreen";
import { EquipmentScreen } from "./screens/EquipmentScreen";
import { VehicleCheckScreen }    from "./screens/VehicleCheckScreen";
import { AnalyticsScreen }       from "./screens/AnalyticsScreen";
import { LeadsScreen }           from "./screens/LeadsScreen";
import { TeamScreen }            from "./screens/TeamScreen";
import { NotificationsScreen }   from "./screens/NotificationsScreen";
import { SharedInboxScreen }     from "./screens/SharedInboxScreen";
import { ExpensesScreen }  from "./screens/ExpensesScreen";
import { MoreScreen }      from "./screens/MoreScreen";
import { DiagnosticsScreen } from "./screens/DiagnosticsScreen";
import { BackfillZARScreen } from "./screens/BackfillZARScreen";
// ── NEW SCREENS ──
import { Client360Screen }   from "./screens/Client360Screen";
import { CalendarScreen }     from "./screens/CalendarScreen";
import { TeamDashboardScreen } from "./screens/TeamDashboardScreen";

import { ErrorBoundary as ScreenErrorBoundary } from "./components/ErrorBoundary";

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
  const [screen,     setScreen]     = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("screen");
      const valid = [
        "Home", "Clients", "Contacts", "Followups", "Notes", "Equipment",
        "Quotes", "Expenses", "More", "Diagnostics", "BackfillZAR",
        "Analytics", "Leads", "Team", "VehicleCheck", "Notifications",
        "SharedInbox",
        // ── NEW ──
        "Client360", "Calendar", "TeamDashboard",
      ];
      if (p && valid.includes(p)) return p;
    } catch (e) { /* ignore */ }
    return "Home";
  });
  const [syncing,    setSyncing]    = useState(false);
  const [pinState,   setPinState]   = useState("checking");
  const [dataLoading, setDataLoading] = useState(true);
  const [syncError,  setSyncError]  = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "denied"
  );
  const [data, setData] = useState({
    clients: [], followups: [], quotes: [], notes: [], equipment: [],
    contacts: [], expenses: [], leads: [], activities: [], // NEW: activities
    syncQueue: [],
  });
  const [quickAddTrigger, setQuickAddTrigger] = useState(null);
  const [teamId, setTeamId]           = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole]       = useState("member"); // NEW: for team dashboard
  const [screenContext, setScreenContext] = useState({}); // NEW: for passing data between screens (e.g. clientId)

  // ── FIX #10 + #11: Use a ref for syncQueue so callbacks always read current data ──
  const syncQueueRef = useRef(data.syncQueue);
  useEffect(() => { syncQueueRef.current = data.syncQueue; }, [data.syncQueue]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s || null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // FIX #3: Single service worker registration — removed from index.html and here.
  // Registration is in main.jsx only, pointing to /service-worker.js.

  // FIX: Scope IndexedDB to current user on login
  useEffect(() => {
    if (session?.user?.id) setOfflineUser(session.user.id);
  }, [session?.user?.id]);

  // FIX #11: Register sync handlers ONCE using the ref (not a closure rebuilt every render).
  useEffect(() => {
    registerSyncHandlers(setData, syncQueueRef);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load team membership on login
  useEffect(() => {
    if (!session?.user?.id) return;
    let pollInterval;
    async function loadTeamState() {
      try {
        const { data: membership } = await supabase
          .from("team_members")
          .select("team_id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!membership?.team_id) return;
        setTeamId(membership.team_id);

        // NEW: track role for team dashboard access
        if (membership.role === "admin" || membership.role === "owner") {
          setUserRole("admin");
        } else {
          setUserRole("member");
        }

        const { data: rows, error: rpcError } = await supabase
          .rpc("get_team_member_emails", { p_team_id: membership.team_id });

        if (!rpcError && rows) {
          setTeamMembers(rows);
        } else {
          const { data: basicRows } = await supabase
            .from("team_members")
            .select("user_id, role, joined_at")
            .eq("team_id", membership.team_id);
          if (basicRows) {
            setTeamMembers(basicRows.map(r => ({
              ...r,
              email: r.user_id === session.user.id
                ? session.user.email
                : `Member ${r.user_id.slice(0, 8)}`,
            })));
          }
        }

        async function checkUnread() {
          try {
            const { count } = await supabase
              .from("team_notifications")
              .select("id", { count: "exact", head: true })
              .eq("to_user_id", session.user.id)
              .eq("read", false);
            setUnreadCount(count || 0);
          } catch {}
        }
        checkUnread();
        pollInterval = setInterval(checkUnread, 30000);
      } catch (e) { console.warn("Team load failed:", e); }
    }
    loadTeamState();
    return () => clearInterval(pollInterval);
  }, [session?.user?.id]);

  useEffect(() => {
    function onClearFailed() {
      setData(d => ({
        ...d,
        syncQueue: (d.syncQueue || []).filter(i => i.status !== "failed"),
      }));
    }
    window.addEventListener("powermate-clear-failed-queue", onClearFailed);
    return () => window.removeEventListener("powermate-clear-failed-queue", onClearFailed);
  }, []);

  useEffect(() => {
    if (!session) return;
    function checkPIN() {
      if (isSessionUnlocked()) { setPinState("unlocked"); return; }
      const hash = getPINHash();
      if (!hash) { setPinState("setup"); return; }
      setPinState("locked");
    }
    checkPIN();
  }, [session]);

  // FIX: loadLocalData must wait for session so it reads the correct user-scoped data.
  // Previously ran on mount with session=null, reading shared/legacy data.
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setOfflineUser(uid); // ensure IndexedDB is scoped to this user

    async function loadLocalData() {
      try {
        const saved = localStorage.getItem(localStorageKey(uid));
        if (saved) setData(d => ({ ...d, ...JSON.parse(saved) }));
      } catch (e) { console.warn("localStorage load failed:", e); }

      try {
        const tables = ["clients", "followups", "quotes", "notes", "equipment", "contacts", "expenses", "leads", "activities"];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [clients, followups, quotes, notes, equipment, contacts, expenses, leads, activities] = results;
        setData(d => ({
          ...d,
          ...(clients?.length    ? { clients }    : {}),
          ...(followups?.length  ? { followups }  : {}),
          ...(quotes?.length     ? { quotes }     : {}),
          ...(notes?.length      ? { notes }      : {}),
          ...(equipment?.length  ? { equipment }  : {}),
          ...(contacts?.length   ? { contacts }   : {}),
          ...(expenses?.length   ? { expenses }   : {}),
          ...(leads?.length      ? { leads }      : {}),
          ...(activities?.length ? { activities }  : {}),
        }));
      } catch (e) { console.warn("IndexedDB load failed:", e); }
    }
    loadLocalData();
  }, [session?.user?.id]);

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
        localStorage.setItem(localStorageKey(session?.user?.id), serialized);
      } catch (e) {
        console.warn("Could not save local data:", e);
        if (e.name === "QuotaExceededError") logEvent("localStorage_quota_exceeded", { message: e.message });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  // Urgency escalation for overdue notes
  useEffect(() => {
    if (dataLoading) return;
    const today = todayISO();
    const uid = session?.user?.id;
    const notes = (data.notes || []).filter(n => n.user_id === uid); // only escalate own notes
    const toEscalate = notes.filter(n =>
      !n.resolved &&
      n.resolve_by &&
      n.resolve_by < today &&
      n.last_escalated !== `${n.urgency}_${today}` &&
      URGENCY_ESCALATION[n.urgency || "Normal"] !== (n.urgency || "Normal")
    );
    if (toEscalate.length === 0) return;

    const now = new Date().toISOString();
    const updates = toEscalate.map(n => ({
      ...n,
      urgency: URGENCY_ESCALATION[n.urgency || "Normal"],
      last_escalated: `${URGENCY_ESCALATION[n.urgency || "Normal"]}_${today}`,
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

  // NEW: Auto-expire stale quotes (runs once after data loads)
  useEffect(() => {
    if (dataLoading) return;
    if ((data.quotes || []).length > 0) {
      runQuoteAutomations(data, setData, session?.user?.id);
    }
  }, [dataLoading]); // eslint-disable-line

  useEffect(() => {
    if (!session) return;
    if (!isOnline) { setDataLoading(false); return; }
    const uid = session.user.id;

    pullFromSupabase(uid, setData).then(() => {
      // Note: we no longer discard queue items just because media lacks URLs.
      // The upload may still be in progress or waiting for connectivity.
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

  // FIX #6: Added data.notes to dependency array
  useEffect(() => {
    if (notifPermission !== "granted") return;
    scheduleNotificationsViaSW(buildNotificationItems(data.followups, data.equipment, data.notes));
  }, [data.followups, data.equipment, data.notes, notifPermission]);

  // FIX #10: Read from syncQueueRef so the 3-second-later callback gets the current queue
  useEffect(() => {
    if (!isOnline || !session) return;
    const pending = (data.syncQueue || []).filter(i => i.status === "pending");
    if (pending.length === 0) return;
    const t = setTimeout(() => pushSyncQueue(syncQueueRef.current, setData), 3000);
    return () => clearTimeout(t);
  }, [isOnline, session, data.syncQueue?.length]);

  const prevOnlineRef = React.useRef(isOnline);
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (isOnline && wasOffline && session) {
      pullFromSupabase(session.user.id, setData);
      if ((data.syncQueue || []).some(i => i.status === "pending")) {
        pushSyncQueue(syncQueueRef.current, setData);
      }
    }
  }, [isOnline]);

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

  async function handleSyncNow() { setSyncing(true); await pushSyncQueue(syncQueueRef.current, setData); setSyncing(false); }

  async function handleRequestNotif() {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? "granted" : "denied");
    if (granted) scheduleNotificationsViaSW(buildNotificationItems(data.followups, data.equipment, data.notes));
  }

  // FIX #13: DRY — single logout function
  async function clearAuthAndSignOut() {
    // Warn about BOTH pending AND failed unsynced items
    const unsyncedItems = (data.syncQueue || []).filter(i => i.status === "pending" || i.status === "failed");
    if (unsyncedItems.length > 0) {
      const pending = unsyncedItems.filter(i => i.status === "pending").length;
      const failed = unsyncedItems.filter(i => i.status === "failed").length;
      const parts = [];
      if (pending > 0) parts.push(`${pending} pending`);
      if (failed > 0) parts.push(`${failed} failed`);
      const sure = window.confirm(
        `You have ${parts.join(" and ")} unsynced change${unsyncedItems.length !== 1 ? "s" : ""}. Signing out will delete them.\n\nSign out anyway?`
      );
      if (!sure) return;
    }
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(PIN_UNLOCKED_KEY);
    resetPINAttempts();
    await clearAllStores();
    if (session?.user?.id) localStorage.removeItem(localStorageKey(session.user.id));
    // Reset ALL state including team info to prevent cross-account leaks
    setData({
      clients: [], followups: [], quotes: [], notes: [], equipment: [],
      contacts: [], expenses: [], leads: [], activities: [], syncQueue: [],
    });
    setTeamId(null);
    setTeamMembers([]);
    setUserRole("member");
    setUnreadCount(0);
    setScreenContext({});
    setDataLoading(true);
    try { await supabase.auth.signOut(); } catch (e) { console.warn("Sign out failed:", e); }
    setSession(null);
  }
  const logout    = clearAuthAndSignOut;
  const forgotPIN = clearAuthAndSignOut;

  function handleQuickCapture(targetScreen) {
    const [screenName, mode] = targetScreen.split(":");
    navigate(screenName);
    setQuickAddTrigger({ screen: screenName, mode: mode || null, ts: Date.now() });
  }

  // Navigate forward — pushes a new history entry
  function navigate(key, ctx = {}) {
    if (key === screen && Object.keys(ctx).length === 0) return;
    setSearchSeed(null);
    setScreenContext(ctx);
    window.history.pushState({ pmScreen: key, pmContext: ctx }, "");
    setScreen(key);
  }

  // Navigate back — pops history so the device back button doesn't ping-pong.
  // Used by onBack handlers (Client360 → Clients, Diagnostics → More, etc.)
  function goBack(fallback = "Home") {
    setSearchSeed(null);
    if (window.history.length > 1) {
      window.history.back(); // triggers popstate → setScreen from history
    } else {
      // No history to pop (e.g. direct URL load) — navigate to fallback
      setScreenContext({});
      window.history.replaceState({ pmScreen: fallback, pmContext: {} }, "");
      setScreen(fallback);
    }
  }

  function handleSearchNavigate(key, term) {
    navigate(key);
    setSearchSeed({ term: term || "", ts: Date.now() });
  }

  useEffect(() => {
    if (!window.history.state?.pmScreen) {
      window.history.replaceState({ pmScreen: "Home", pmContext: {} }, "");
    }
    document.documentElement.style.overscrollBehaviorY = "contain";
    document.body.style.overscrollBehaviorY = "contain";
  }, []);

  useEffect(() => {
    function onPop(e) {
      if (searchOpen) {
        setSearchOpen(false);
        window.history.pushState({ pmScreen: screen, pmContext: screenContext }, "");
        return;
      }
      setScreenContext(e.state?.pmContext || {});
      setScreen(e.state?.pmScreen || "Home");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [searchOpen, screen, screenContext]);

  const pendingCount     = (data.syncQueue || []).filter(i => i.status === "pending").length;
  const flaggedQuotes    = (data.quotes    || []).filter(q => q.status === "Pending").length;
  const overdueEquip     = (data.equipment || []).filter(e => { if (!e.service_due) return false; const d = Math.round((new Date(e.service_due + "T12:00:00") - new Date(todayISO() + "T12:00:00")) / 86400000); return d < 0; }).length;
  const overdueFollowups = (data.followups || []).filter(f => f.date < todayISO() && !f.completed).length;
  const leadContacts     = (data.contacts  || []).filter(c => (c.status || "lead") === "lead").length;
  const criticalNotes    = (data.notes     || []).filter(n => !n.resolved && n.urgency === "Critical").length;
  const unsubmittedExp   = (data.expenses  || []).filter(e => e.status === "unsubmitted").length;

  const drawerBadges = {
    clients:        (data.clients || []).length,
    leads:          leadContacts,
    overdueFU:      overdueFollowups,
    criticalNotes,
    overdueEquip,
    pendingQ:       flaggedQuotes,
    unsubmittedExp,
    pending:        pendingCount,
    unread:         unreadCount,
    sharedInbox:    unreadCount,
  };

  if (loading)              return <Spinner />;
  if (!session)             return <AuthScreen />;
  if (pinState === "checking") return <Spinner />;
  if (pinState === "setup")    return <PINSetupScreen onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked")   return <PINLockScreen onUnlock={() => setPinState("unlocked")} onForgot={forgotPIN} />;
  if (dataLoading)             return <DataLoadingScreen />;

  const screens = {
    Home:      <HomeScreen      data={data} setScreen={navigate} user={session.user} onQuickAdd={handleQuickCapture} />,
    Clients:   <ClientsScreen   data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} onNavigate={navigate} isOnline={isOnline} />,
    Contacts:  <ContactsScreen  data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} />,
    Quotes:    <QuotesScreen    data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Notes:     <NotesScreen     data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    VehicleCheck: <VehicleCheckScreen data={data} setData={setData} userId={session.user.id} />,
    Analytics:    <AnalyticsScreen    data={data} onNavigate={navigate} />,
    Leads:        <LeadsScreen        data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} />,
    // FIX #16: use supabase directly instead of dynamic import
    Team:         <TeamScreen         userId={session.user.id} userEmail={session.user.email} data={data} setData={setData} onTeamChange={async (tid) => {
      setTeamId(tid);
      if (tid) {
        triggerImmediateSync();
        try {
          const { data: rows } = await supabase.rpc("get_team_member_emails", { p_team_id: tid });
          if (rows) setTeamMembers(rows);
        } catch (e) { console.warn("Could not load team members:", e); }
      }
    }} />,
    Expenses:  <ExpensesScreen  data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} />,
    More:      <MoreScreen      data={data} onLogout={logout} userId={session.user.id} onSyncNow={handleSyncNow} onClearQueue={(q) => setData(d => ({...d, syncQueue: q}))} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif} setScreen={navigate} />,
    Diagnostics: <DiagnosticsScreen data={data} userId={session.user.id} isOnline={isOnline} onBack={() => goBack("More")} onBackfill={() => navigate("BackfillZAR")} />,
    // FIX #4: BackfillZAR was missing from this map
    BackfillZAR: <BackfillZARScreen data={data} setData={setData} userId={session.user.id} onBack={() => goBack("Diagnostics")} />,
    Notifications: <NotificationsScreen userId={session.user.id} onNavigate={navigate} onMarkRead={() => setUnreadCount(0)} />,
    // Updated: SharedInbox now gets userEmail + teamId for response notifications
    SharedInbox: <SharedInboxScreen userId={session.user.id} userEmail={session.user.email} teamId={teamId} onBack={() => goBack("Notifications")} onAccepted={() => { triggerImmediateSync(); navigate("Notifications"); }} />,

    // ── NEW SCREENS ──
    Client360: (
      <Client360Screen
        data={data} setData={setData}
        userId={session.user.id} userEmail={session.user.email}
        teamId={teamId} teamMembers={teamMembers}
        clientId={screenContext.clientId}
        onBack={() => goBack(screenContext.returnTo || "Clients")}
        onNavigate={navigate}
      />
    ),
    Calendar: (
      <CalendarScreen
        data={data} setData={setData}
        userId={session.user.id}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    TeamDashboard: (
      <TeamDashboardScreen
        data={data}
        teamMembers={teamMembers}
        userId={session.user.id}
        userEmail={session.user.email}
        userRole={userRole}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-32" style={{ background: "#F7F3F3" }}>

        {/* ── Top bar ── */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
          <div className="mx-auto max-w-2xl px-3 h-14 flex items-center justify-between gap-2">
            <button onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              aria-label="Menu">
              <Menu size={22} />
            </button>

            {screen === "Home"
              ? <img src={BRAND.logo} alt="PowerMate" className="h-7 object-contain opacity-90" onError={e => e.target.style.display = "none"} />
              : (() => {
                  const SCREEN_LABELS = {
                    Clients:       { label: "Clients & Leads",  addHint: "lead / client" },
                    Contacts:      { label: "Contacts",         addHint: "contact" },
                    Followups:     { label: "Follow-ups",       addHint: "follow-up" },
                    Notes:         { label: "Field Notes",      addHint: "note" },
                    Equipment:     { label: "Equipment",        addHint: "item" },
                    Quotes:        { label: "Quotes",           addHint: "quote" },
                    Expenses:      { label: "Expenses",         addHint: "expense" },
                    More:          { label: "Settings",          addHint: null },
                    Diagnostics:   { label: "Diagnostics",      addHint: null },
                    Analytics:     { label: "Analytics",        addHint: null },
                    VehicleCheck:  { label: "Vehicle Checks",   addHint: "check" },
                    Calendar:      { label: "Calendar",         addHint: null },
                    BackfillZAR:   { label: "Backfill ZAR",     addHint: null },
                    Client360:     { label: "Client",           addHint: null },
                    TeamDashboard: { label: "Team Dashboard",   addHint: null },
                  };
                  const meta = SCREEN_LABELS[screen] || { label: screen, addHint: null };
                  return (
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-base font-black text-slate-900 truncate">{meta.label}</p>
                      {meta.addHint && (
                        <button
                          onClick={() => handleQuickCapture(screen)}
                          className="flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[32px] shrink-0"
                          style={{ background: "#F7F3F3", color: "#8B1A1A" }}
                          aria-label={`Add ${meta.addHint}`}>
                          <Plus size={13} strokeWidth={2.5} />
                          <span className="text-xs font-bold">{meta.addHint}</span>
                        </button>
                      )}
                    </div>
                  );
                })()
            }

            <div className="flex items-center gap-1 shrink-0">
              {teamId && (
                <button onClick={() => navigate("Notifications")}
                  className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Notifications">
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                      style={{ background: "#DC2626" }}>
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
              )}
              <button onClick={() => setSearchOpen(true)}
                className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Search">
                <Search size={20} />
              </button>
            </div>
          </div>
        </header>

        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          currentScreen={screen}
          onNavigate={navigate}
          badges={drawerBadges}
          userEmail={session.user?.email}
          onLogout={logout}
        />

        <main className="mx-auto max-w-2xl px-4 pt-4">
          <AnimatePresence mode="wait">
            <motion.div key={screen} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <ScreenErrorBoundary label={screen} onGoHome={() => navigate("Home")}>
                {screens[screen]}
              </ScreenErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>

        <SyncStatusBadge isOnline={isOnline} pendingCount={pendingCount} syncing={syncing} />
        <QuickCaptureFAB currentScreen={screen} onTrigger={handleQuickCapture} />
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} data={data} onNavigate={handleSearchNavigate} />
        <AnimatePresence>
          {syncError && <Toast message={syncError} type="error" onDone={() => setSyncError("")} />}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
