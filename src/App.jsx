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
import { offlineSave, offlineGetAll } from "./offline/offlineDb";

import { todayISO, logEvent, genId } from "./lib/helpers";
import { LOCAL_STORAGE_KEY, URGENCY_ESCALATION, PIN_KEY, PIN_UNLOCKED_KEY, BRAND } from "./lib/constants";
import { pushSyncQueue, pullFromSupabase, setupRealtimeSync, registerSyncHandlers, triggerImmediateSync } from "./lib/sync";
import { requestNotificationPermission, scheduleNotificationsViaSW, buildNotificationItems } from "./lib/notifications";
// PIN helpers — imported from PINScreens which inlines them to avoid build issues
import { getPINHash, isSessionUnlocked, markSessionUnlocked } from "./auth/PINScreens";
// resetPINAttempts is just a localStorage clear — inlined here to remove the pinHelpers dependency
function resetPINAttempts() { localStorage.removeItem("pm_pin_attempts"); }

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
    // Notifications open the app at /?screen=Followups etc — honour that on load.
    try {
      const p = new URLSearchParams(window.location.search).get("screen");
      const valid = ["Home", "Clients", "Contacts", "Followups", "Notes", "Equipment", "Quotes", "Expenses", "More", "Diagnostics", "BackfillZAR", "Analytics", "Leads", "Team", "VehicleCheck", "Notifications", "SharedInbox"];
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
    clients: [], followups: [], quotes: [], notes: [], equipment: [], contacts: [], expenses: [], syncQueue: [],
  });
  const [quickAddTrigger, setQuickAddTrigger] = useState(null);
  const [teamId, setTeamId]           = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (mounted) { setSession(s || null); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Register the service worker (enables background push + offline).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(err => {
      console.warn("Service worker registration failed:", err);
    });
  }, []);

  useEffect(() => {
    registerSyncHandlers(setData, () => data.syncQueue);
  }, [data.syncQueue]);

  // Load team membership on login
  useEffect(() => {
    if (!session?.user?.id) return;
    let pollInterval;
    async function loadTeamState() {
      try {
        const { supabase: sb } = await import("./supabase");
        const { data: membership } = await sb
          .from("team_members")
          .select("team_id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!membership?.team_id) return;
        setTeamId(membership.team_id);

        const { data: rows, error: rpcError } = await sb
          .rpc("get_team_member_emails", { p_team_id: membership.team_id });

        if (!rpcError && rows) {
          setTeamMembers(rows);
        } else {
          const { data: basicRows } = await sb
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

        // Poll unread notification count every 30s
        async function checkUnread() {
          try {
            const { count } = await sb
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

  // Diagnostics screen dispatches this when the user taps "Clear failed".
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
      const hash = getPINHash(); // synchronous localStorage read
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
        const tables = ["clients", "followups", "quotes", "notes", "equipment", "contacts", "expenses"];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [clients, followups, quotes, notes, equipment, contacts, expenses] = results;
        setData(d => ({
          ...d,
          ...(clients?.length   ? { clients }   : {}),
          ...(followups?.length ? { followups } : {}),
          ...(quotes?.length    ? { quotes }    : {}),
          ...(notes?.length     ? { notes }     : {}),
          ...(equipment?.length ? { equipment } : {}),
          ...(contacts?.length  ? { contacts }  : {}),
          ...(expenses?.length  ? { expenses }  : {}),
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
    // targetScreen may be "Expenses:SelectMode" — parse screen name and optional mode
    const [screenName, mode] = targetScreen.split(":");
    navigate(screenName);
    setQuickAddTrigger({ screen: screenName, mode: mode || null, ts: Date.now() });
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
    sharedInbox:    unreadCount, // same count drives the inbox badge
  };

  if (loading)              return <Spinner />;
  if (!session)             return <AuthScreen />;
  if (pinState === "checking") return <Spinner />;
  if (pinState === "setup")    return <PINSetupScreen onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked")   return <PINLockScreen onUnlock={() => setPinState("unlocked")} onForgot={forgotPIN} />;
  if (dataLoading)             return <DataLoadingScreen />;

  const screens = {
    Home:      <HomeScreen      data={data} setScreen={navigate} user={session.user} onQuickAdd={handleQuickCapture} />,
    Clients:   <ClientsScreen   data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Contacts:  <ContactsScreen  data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Followups: <FollowupsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} />,
    Quotes:    <QuotesScreen    data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Notes:     <NotesScreen     data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    Equipment: <EquipmentScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} />,
    VehicleCheck: <VehicleCheckScreen data={data} setData={setData} userId={session.user.id} />,
    Analytics:    <AnalyticsScreen    data={data} onNavigate={navigate} />,
    Leads:        <LeadsScreen        data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} />,
    Team:         <TeamScreen         userId={session.user.id} userEmail={session.user.email} data={data} onTeamChange={async (tid) => {
      setTeamId(tid);
      if (tid) {
        triggerImmediateSync();
        try {
          const { data: rows } = await import("./supabase").then(m => m.supabase.rpc("get_team_member_emails", { p_team_id: tid }));
          if (rows) setTeamMembers(rows);
        } catch (e) { console.warn("Could not load team members:", e); }
      }
    }} />,
    Expenses:  <ExpensesScreen  data={data} setData={setData} userId={session.user.id} quickAddTrigger={quickAddTrigger} />,
    More:      <MoreScreen      data={data} onLogout={logout} userId={session.user.id} onSyncNow={handleSyncNow} onClearQueue={(q) => setData(d => ({...d, syncQueue: q}))} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif} setScreen={navigate} />,
    Diagnostics: <DiagnosticsScreen data={data} userId={session.user.id} isOnline={isOnline} onBack={() => navigate("More")} onBackfill={() => navigate("BackfillZAR")} />,
    Notifications: <NotificationsScreen userId={session.user.id} onNavigate={navigate} onMarkRead={() => setUnreadCount(0)} />,
    SharedInbox:   <SharedInboxScreen  userId={session.user.id} onBack={() => navigate("Notifications")} onAccepted={() => { triggerImmediateSync(); navigate("Notifications"); }} />,
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-32" style={{ background: "#F7F3F3" }}>

        {/* ── Top bar: hamburger + screen title/logo + search ── */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100">
          <div className="mx-auto max-w-2xl px-3 h-14 flex items-center justify-between gap-2">
            <button onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              aria-label="Menu">
              <Menu size={22} />
            </button>

            {/* Centre: logo on home, screen title + add hint on other screens */}
            {screen === "Home"
              ? <img src={BRAND.logo} alt="PowerMate" className="h-7 object-contain opacity-90" onError={e => e.target.style.display = "none"} />
              : (() => {
                  const SCREEN_LABELS = {
                    Clients:      { label: "Clients",          addHint: "client" },
                    Contacts:     { label: "Contacts",         addHint: "contact" },
                    Followups:    { label: "Follow-ups",       addHint: "follow-up" },
                    Notes:        { label: "Field Notes",      addHint: "note" },
                    Equipment:    { label: "Equipment",        addHint: "item" },
                    Quotes:       { label: "Quotes",           addHint: "quote" },
                    Expenses:     { label: "Expenses",         addHint: "expense" },
                    More:         { label: "Settings",         addHint: null },
                    Diagnostics:  { label: "Diagnostics",      addHint: null },
                    Analytics:    { label: "Analytics",        addHint: null },
                    VehicleCheck: { label: "Vehicle Checks",   addHint: "check" },
                    Calendar:     { label: "Calendar",         addHint: "event" },
                    BackfillZAR:  { label: "Backfill ZAR",     addHint: null },
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
              {/* Bell — only show when in a team */}
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
