// ─── PowerMate App ────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Calendar, Settings, Search, Menu, Plus, Bell } from "lucide-react";
import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import {
  offlineGetAll,
  offlineSave,
  offlineReplaceAll,
  setOfflineUser,
  getCurrentOfflineUser,
} from "./offline/offlineDb";
import { todayISO, reportError, genId } from "./lib/helpers";
import {
  localStorageKey,
  URGENCY_ESCALATION,
  PIN_KEY,
  PIN_UNLOCKED_KEY,
  PIN_DISABLED_KEY,
  PIN_AUTO_LOCK_MS,
  PIN_HIDDEN_AT_KEY,
  scopedPinKey,
  BRAND,
} from "./lib/constants";
import {
  pushSyncQueue,
  pullFromSupabase,
  parseVehicleCheckData,
  setupRealtimeSync,
  registerSyncHandlers,
  triggerImmediateSync,
  retryPendingMedia,
} from "./lib/sync";
import {
  requestNotificationPermission,
  scheduleNotificationsViaSW,
  buildNotificationItems,
  checkRemindersNow,
  registerReminderPeriodicSync,
} from "./lib/notifications";
import { runQuoteAutomations } from "./lib/quoteAutomation";
import { getPINHash, isSessionUnlocked } from "./auth/PINScreens";
import { AuthScreen, SetPasswordScreen } from "./auth/AuthScreen";
import { TeamViewContext, readTeamViewPref, isOwnRecord } from "./lib/teamView";
import { subscribeToPush, unsubscribeFromPush, pushSupported } from "./lib/pushManager";
import { PINSetupScreen, PINLockScreen } from "./auth/PINScreens";
import { NavTab, Spinner, DataLoadingScreen, Toast } from "./components/ui";
import SyncStatusBadge from "./components/SyncStatusBadge";
import { QuickCaptureFAB } from "./components/QuickCaptureFAB";
import { Wordmark } from "./components/Wordmark";
import { ExportProgressProvider } from "./components/ExportProgress";
import { GlobalSearch } from "./components/GlobalSearch";
import { NavDrawer } from "./components/NavDrawer";
import { readHiddenScreens, saveHiddenScreens, syncHiddenScreens } from "./lib/menuPrefs";
import { setActiveTeamId, loadCompanyProfile, useCompanyProfile } from "./lib/companyProfile";
import { unavailableScreens } from "./lib/modules";
import { assuranceLevel, TwoStepChallenge, TwoStepRequired } from "./auth/TwoStep";
import { useTeamPlan } from "./lib/plan";
import { PlanBanner, SuspendedScreen } from "./components/PlanBanner";
import { setMyName } from "./lib/me";
import { DailyVehiclePrompt } from "./components/DailyVehiclePrompt";
import { HomeScreen } from "./screens/HomeScreen";
const EquipmentScreen = lazy(() =>
  import("./screens/EquipmentScreen").then(m => ({ default: m.EquipmentScreen })),
);
const ClientsScreen = lazy(() => import("./screens/ClientsScreen").then(m => ({ default: m.ClientsScreen })));
const ContactsScreen = lazy(() =>
  import("./screens/ContactsScreen").then(m => ({ default: m.ContactsScreen })),
);
import { FollowupsScreen } from "./screens/FollowupsScreen";
const QuotesScreen = lazy(() => import("./screens/QuotesScreen").then(m => ({ default: m.QuotesScreen })));
const NotesScreen = lazy(() => import("./screens/NotesScreen").then(m => ({ default: m.NotesScreen })));
const MeetingScreen = lazy(() => import("./screens/MeetingScreen").then(m => ({ default: m.MeetingScreen })));
const VehicleCheckScreen = lazy(() =>
  import("./screens/VehicleCheckScreen").then(m => ({ default: m.VehicleCheckScreen })),
);
const WeeklyPlannerScreen = lazy(() =>
  import("./screens/WeeklyPlannerScreen").then(m => ({ default: m.WeeklyPlannerScreen })),
);
const ColdCallScreen = lazy(() =>
  import("./screens/ColdCallScreen").then(m => ({ default: m.ColdCallScreen })),
);
const JackSelectorScreen = lazy(() =>
  import("./screens/JackSelectorScreen").then(m => ({ default: m.JackSelectorScreen })),
);
const BreakdownScreen = lazy(() =>
  import("./screens/BreakdownScreen").then(m => ({ default: m.BreakdownScreen })),
);
const RepairScreen = lazy(() => import("./screens/RepairScreen").then(m => ({ default: m.RepairScreen })));
const AnalyticsScreen = lazy(() =>
  import("./screens/AnalyticsScreen").then(m => ({ default: m.AnalyticsScreen })),
);
const LeadsScreen = lazy(() => import("./screens/LeadsScreen").then(m => ({ default: m.LeadsScreen })));
const TeamScreen = lazy(() => import("./screens/TeamScreen").then(m => ({ default: m.TeamScreen })));
const NotificationsScreen = lazy(() =>
  import("./screens/NotificationsScreen").then(m => ({ default: m.NotificationsScreen })),
);
const SharedInboxScreen = lazy(() =>
  import("./screens/SharedInboxScreen").then(m => ({ default: m.SharedInboxScreen })),
);
const ExpensesScreen = lazy(() =>
  import("./screens/ExpensesScreen").then(m => ({ default: m.ExpensesScreen })),
);
const MoreScreen = lazy(() => import("./screens/MoreScreen").then(m => ({ default: m.MoreScreen })));
const DiagnosticsScreen = lazy(() =>
  import("./screens/DiagnosticsScreen").then(m => ({ default: m.DiagnosticsScreen })),
);
const AssistantScreen = lazy(() =>
  import("./screens/AssistantScreen").then(m => ({ default: m.AssistantScreen })),
);
const BackfillZARScreen = lazy(() =>
  import("./screens/BackfillZARScreen").then(m => ({ default: m.BackfillZARScreen })),
);
const JobsScreen = lazy(() => import("./screens/JobsScreen").then(m => ({ default: m.JobsScreen })));
const InvoicesScreen = lazy(() =>
  import("./screens/InvoicesScreen").then(m => ({ default: m.InvoicesScreen })),
);
const AuditLogScreen = lazy(() => import("./screens/AuditLogScreen").then(m => ({ default: m.AuditLogScreen })));
const ProductsScreen = lazy(() => import("./screens/ProductsScreen").then(m => ({ default: m.ProductsScreen })));
const TimesheetsScreen = lazy(() => import("./screens/TimesheetsScreen").then(m => ({ default: m.TimesheetsScreen })));
const ServicePlansScreen = lazy(() =>
  import("./screens/ServicePlansScreen").then(m => ({ default: m.ServicePlansScreen })),
);
const ScheduleScreen = lazy(() => import("./screens/ScheduleScreen").then(m => ({ default: m.ScheduleScreen })));
const HelpScreen = lazy(() => import("./screens/HelpScreen").then(m => ({ default: m.HelpScreen })));
const PlatformAdminScreen = lazy(() =>
  import("./screens/PlatformAdminScreen").then(m => ({ default: m.PlatformAdminScreen })),
);
const CompanySetup = lazy(() => import("./screens/CompanySetup").then(m => ({ default: m.CompanySetup })));
const CompanyProfileScreen = lazy(() =>
  import("./screens/CompanyProfileScreen").then(m => ({ default: m.CompanyProfileScreen })),
);
import { Client360Screen } from "./screens/Client360Screen";
import { CalendarScreen } from "./screens/CalendarScreen";
const TeamDashboardScreen = lazy(() =>
  import("./screens/TeamDashboardScreen").then(m => ({ default: m.TeamDashboardScreen })),
);
import {
  ErrorBoundary as ScreenErrorBoundary,
  clearHistoricalFollowupsCrashes,
} from "./components/ErrorBoundary";
import { Onboarding, shouldShowOnboarding } from "./components/Onboarding";
import { PullToRefresh } from "./components/PullToRefresh";

// FIX (Build 8, Phase 1) — single source of truth for the "no user loaded
// yet" data shape, used both for the initial useState AND to hard-reset
// state on every user switch (see the loadLocalData effect and logout()
// below). Before this fix, `data` was only ever merged onto — never reset —
// so on a shared device User B's in-memory `data` silently kept any table
// where User A had records but User B had none locally yet, and logout()
// never touched `data` at all. Kept in one place so the two reset sites and
// the initial useState can never drift out of sync with each other.
// Readable names for the top bar (route keys are internal identifiers).
const SCREEN_TITLES = {
  Followups: "Follow-ups",
  VehicleCheck: "Vehicle Check",
  ColdCall: "Cold Call",
  JackSelector: "Jack Selector",
  BackfillZAR: "Backfill ZAR",
  SharedInbox: "Shared Inbox",
  Client360: "Client 360",
  TeamDashboard: "Team Dashboard",
  Planner: "Weekly Planner",
  CompanyProfile: "Company Details",
  Help: "Help & support",
  Platform: "Platform",
  AuditLog: "Activity log",
  Products: "Products & stock",
  Timesheets: "Timesheets",
  ServicePlans: "Service plans",
  Schedule: "Schedule",
};
const INITIAL_DATA = {
  clients: [],
  followups: [],
  quotes: [],
  notes: [],
  equipment: [],
  contacts: [],
  expenses: [],
  leads: [],
  vehicleChecks: {},
  activities: [],
  breakdowns: [],
  repairs: [],
  customFaults: [],
  syncQueue: [],
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(e, i) {
    console.error("PowerMate:", e, i);
    try {
      reportError("app_crashed", e, { componentStack: (i?.componentStack || "").slice(0, 1000) });
    } catch (_) {}
  }
  render() {
    if (this.state.hasError)
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{ background: "var(--pm-page-bg)" }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-8 stack-y-4 shadow-xs border border-slate-100">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-black text-slate-900">Something went wrong</h2>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-2xl py-4 text-sm font-bold text-white min-h-[52px]"
              style={{ background: "#8B1A1A" }}
            >
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
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [teamAccess, setTeamAccess] = useState(null);
  const [teamViewOn, setTeamViewOn] = useState(readTeamViewPref);
  const [screen, setScreen] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("screen");
      const valid = [
        "Home",
        "Clients",
        "Contacts",
        "Followups",
        "Notes",
        "Equipment",
        "Quotes",
        "Expenses",
        "More",
        "Planner",
        "ColdCall",
        "JackSelector",
        "Meeting",
        "Breakdown",
        "Repair",
        "Diagnostics",
        "BackfillZAR",
        "Analytics",
        "Leads",
        "Team",
        "VehicleCheck",
        "Notifications",
        "SharedInbox",
        "Jobs",
        "Invoices",
        "CompanyProfile",
        "Help",
        "Platform",
        "AuditLog",
        "Products",
        "Timesheets",
        "ServicePlans",
        "Schedule",
        "Client360",
        "Calendar",
        "TeamDashboard",
      ];
      if (p && valid.includes(p)) return p;
    } catch (e) {}
    return "Home";
  });
  const [syncing, setSyncing] = useState(false);
  const [pinState, setPinState] = useState("checking");
  const [dataLoading, setDataLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    "Notification" in window ? Notification.permission : "denied",
  );
  const [data, setData] = useState(INITIAL_DATA);
  const [quickAddTrigger, setQuickAddTrigger] = useState(null);
  const [teamId, setTeamId] = useState(null);
  // True once we know whether this person belongs to a company.
  const [teamChecked, setTeamChecked] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState("member");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [screenContext, setScreenContext] = useState({});
  const [teamRefreshKey, setTeamRefreshKey] = useState(0);
  const syncQueueRef = useRef(data.syncQueue);
  const persistedQueueIds = useRef(new Set());
  const queueSyncTimer = useRef(null);
  useEffect(() => {
    syncQueueRef.current = data.syncQueue;
    // Many screens add queue entries straight into React state. Write each new one
    // to IndexedDB immediately so an offline edit survives the app being closed.
    const uid = session?.user?.id;
    if (!uid || getCurrentOfflineUser() !== uid) return;
    const writes = [];
    for (const item of data.syncQueue || []) {
      if (!item?.id || persistedQueueIds.current.has(item.id)) continue;
      persistedQueueIds.current.add(item.id);
      const durable = {
        attempts: 0,
        next_attempt_at: null,
        status: "pending",
        created_at: new Date().toISOString(),
        ...item,
      };
      writes.push(offlineSave("syncQueue", durable).catch(() => persistedQueueIds.current.delete(item.id)));
    }
    // Not every screen starts a sync after queueing; do it here once the new
    // entries are on the device (debounced so a burst of edits is one pass).
    if (writes.length && navigator.onLine) {
      clearTimeout(queueSyncTimer.current);
      queueSyncTimer.current = setTimeout(() => Promise.all(writes).then(() => triggerImmediateSync()), 400);
    }
  }, [data.syncQueue, session?.user?.id]);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = event => {
      if (event.data?.type === "POWERMATE_RETRY_SYNC") pushSyncQueue(syncQueueRef.current, setData);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  useEffect(() => {
    let mounted = true,
      settled = false;
    const finish = s => {
      if (mounted && !settled) {
        settled = true;
        setSession(s || null);
        setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data: { session: s } }) => finish(s));
    const failsafe = setTimeout(() => {
      if (settled) return;
      let cached = null;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.endsWith("-auth-token")) {
            const v = JSON.parse(localStorage.getItem(k) || "null");
            if (v && (v.access_token || v.currentSession || v.user)) cached = v.currentSession || v;
            break;
          }
        }
      } catch {}
      finish(cached);
    }, 1500);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
      if (mounted) {
        setSession(s);
        setLoading(false);
        settled = true;
      }
    });
    return () => {
      mounted = false;
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    clearHistoricalFollowupsCrashes();
  }, []);
  useEffect(() => {
    if (session?.user?.id) {
      setOfflineUser(session.user.id);
      if (shouldShowOnboarding(session.user.id)) setShowOnboarding(true);
    }
  }, [session?.user?.id]);
  useEffect(() => {
    function onFocusIn(e) {
      const el = e.target;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    }
    window.addEventListener("focusin", onFocusIn);
    return () => window.removeEventListener("focusin", onFocusIn);
  }, []);
  useEffect(() => {
    registerSyncHandlers(setData, syncQueueRef);
  }, []);
  useEffect(() => {
    if (!session?.user?.id) return;
    let pollInterval;
    async function loadTeamState() {
      try {
        const { data: authUser } = await supabase.auth.getUser();
        const uid = authUser?.user?.id || session.user.id;
        const { data: membership } = await supabase
          .from("team_members")
          .select("team_id, role")
          .eq("user_id", uid)
          .maybeSingle();
        const { data: effectiveRole } = await supabase.rpc("get_my_effective_role");
        // Admin is per company (the old app-wide users.role no longer counts).
        const isAdmin = effectiveRole === "admin" || membership?.role === "admin";
        const { data: access } = await supabase.rpc("get_my_team_access");
        setTeamAccess(access && typeof access === "object" ? access : null);
        if (!membership?.team_id) {
          setTeamId(null);
          setTeamMembers([]);
          setUserRole(isAdmin ? "admin" : "member");
          setTeamChecked(true);
          return;
        }
        setTeamId(membership.team_id);
        setTeamChecked(true);
        setUserRole(isAdmin ? "admin" : "member");
        const { data: rows, error: rpcError } = await supabase.rpc("get_team_member_emails", {
          p_team_id: membership.team_id,
        });
        if (!rpcError && rows) {
          const memberRows = rows;
          const ids = memberRows.map(r => r.user_id).filter(Boolean);
          const { data: profileRows } = ids.length
            ? await supabase.from("users").select("id,full_name,email").in("id", ids)
            : { data: [] };
          const profileMap = new Map((profileRows || []).map(p => [p.id, p]));
          setTeamMembers(
            memberRows.map(r => ({
              ...r,
              full_name: profileMap.get(r.user_id)?.full_name || "",
              email: r.email || profileMap.get(r.user_id)?.email || session.user.email,
            })),
          );
        } else {
          const { data: basicRows } = await supabase
            .from("team_members")
            .select("user_id, role, joined_at")
            .eq("team_id", membership.team_id);
          if (basicRows) {
            const ids = basicRows.map(r => r.user_id).filter(Boolean);
            const { data: profileRows } = ids.length
              ? await supabase.from("users").select("id,full_name,email").in("id", ids)
              : { data: [] };
            const profileMap = new Map((profileRows || []).map(p => [p.id, p]));
            setTeamMembers(
              basicRows.map(r => ({
                ...r,
                full_name: profileMap.get(r.user_id)?.full_name || "",
                email:
                  profileMap.get(r.user_id)?.email ||
                  (r.user_id === session.user.id ? session.user.email : "Team member"),
              })),
            );
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
      } catch (e) {
        console.warn("Team load failed:", e);
      }
    }
    loadTeamState();
    return () => clearInterval(pollInterval);
  }, [session?.user?.id, teamRefreshKey]);
  const handleTeamChange = useCallback(newTeamId => {
    if (!newTeamId) {
      setTeamId(null);
      setTeamMembers([]);
      setUserRole("member");
    }
    setTeamRefreshKey(k => k + 1);
  }, []);
  // The "Sync Now" button used to be wired to a no-op (onSyncNow={()=>{}}) — tapping it
  // did literally nothing, silently, with no error. This actually pushes the queue,
  // retries any stuck photo uploads, and pulls fresh server state, with the spinner
  // reflecting real progress instead of being permanently stuck at "not syncing".
  const handleSyncNow = useCallback(async () => {
    if (!isOnline || !session?.user?.id) return;
    setSyncing(true);
    try {
      await pushSyncQueue(syncQueueRef.current || [], setData);
      await retryPendingMedia(session.user.id, setData);
      await pullFromSupabase(session.user.id, setData);
    } finally {
      setSyncing(false);
    }
  }, [isOnline, session?.user?.id]);
  useEffect(() => {
    function onClearFailed() {
      setData(d => {
        const kept = (d.syncQueue || []).filter(i => i.status !== "failed");
        // Clear the stored copy too, or the next sync merges the failed items back.
        offlineGetAll("syncQueue")
          .then(rows =>
            offlineReplaceAll(
              "syncQueue",
              (rows || []).filter(i => i.status !== "failed"),
            ),
          )
          .catch(() => {});
        return { ...d, syncQueue: kept };
      });
    }
    window.addEventListener("powermate-clear-failed-queue", onClearFailed);
    return () => window.removeEventListener("powermate-clear-failed-queue", onClearFailed);
  }, []);
  useEffect(() => {
    function onLocalWriteFailed() {
      setSyncError("Could not save this change to the device. Please try again before leaving this screen.");
    }
    function onSyncFailed(e) {
      const items = e.detail?.items || [];
      const conflict = items.some(i => i.syncErrorCode === "PWR_ARRAY_CONFLICT");
      setSyncError(
        conflict
          ? "This record changed on another device while you were offline. Your newer server data was protected from being overwritten; review the record and try the change again."
          : "Some changes could not sync. They remain queued for retry.",
      );
    }
    window.addEventListener("powermate:local_write_failed", onLocalWriteFailed);
    window.addEventListener("powermate:sync_failed", onSyncFailed);
    return () => {
      window.removeEventListener("powermate:local_write_failed", onLocalWriteFailed);
      window.removeEventListener("powermate:sync_failed", onSyncFailed);
    };
  }, []);
  // Auto-lock: after PIN_AUTO_LOCK_MS in the background the PIN is asked for
  // again. The lock screen covers the app ("relocked") rather than replacing
  // it, so a half-finished form is still there after unlocking.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const key = scopedPinKey(PIN_HIDDEN_AT_KEY, uid);
    const onVisibility = () => {
      try {
        if (document.visibilityState === "hidden") {
          localStorage.setItem(key, String(Date.now()));
          return;
        }
        const hiddenAt = Number(localStorage.getItem(key) || 0);
        localStorage.removeItem(key);
        if (!hiddenAt || Date.now() - hiddenAt < PIN_AUTO_LOCK_MS) return;
        if (localStorage.getItem(scopedPinKey(PIN_DISABLED_KEY, uid)) === "1" || !getPINHash(uid)) return;
        sessionStorage.removeItem(scopedPinKey(PIN_UNLOCKED_KEY, uid));
        setPinState(s => (s === "unlocked" ? "relocked" : s));
      } catch {}
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    function checkPIN() {
      if (localStorage.getItem(scopedPinKey(PIN_DISABLED_KEY, uid)) === "1") {
        setPinState("unlocked");
        return;
      }
      // A still-open session counts as unlocked unless the app sat in the
      // background past the auto-lock limit (covers a relaunch after that).
      let hiddenAt = 0;
      try {
        hiddenAt = Number(localStorage.getItem(scopedPinKey(PIN_HIDDEN_AT_KEY, uid)) || 0);
      } catch {}
      if (isSessionUnlocked(uid) && !(hiddenAt && Date.now() - hiddenAt >= PIN_AUTO_LOCK_MS)) {
        setPinState("unlocked");
        return;
      }
      const hash = getPINHash(uid);
      if (!hash) {
        setPinState("setup");
        return;
      }
      setPinState("locked");
    }
    checkPIN();
  }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setOfflineUser(uid);
    // FIX (Build 8, Phase 1) — reset to a clean slate for THIS user before
    // merging anything in. Previously this effect only ever merged new data
    // onto whatever was already in `data`, and the per-table spreads below
    // (`...(clients?.length?{clients}:{})`) OMIT the key entirely when the
    // new user's local store is empty for that table — so a signed-out
    // user's records kept rendering under the next signed-in user on a
    // shared device whenever the new user had zero local rows there.
    setData(INITIAL_DATA);
    async function loadLocalData() {
      try {
        const saved = localStorage.getItem(localStorageKey(uid));
        if (saved) setData(d => ({ ...d, ...JSON.parse(saved) }));
      } catch (e) {
        console.warn("localStorage load failed:", e);
      }
      try {
        const tables = [
          "clients",
          "followups",
          "quotes",
          "notes",
          "equipment",
          "contacts",
          "expenses",
          "leads",
          "vehicle_checks",
          "activities",
          "breakdowns",
          "repairs",
          "customFaults",
          "syncQueue",
        ];
        const results = await Promise.all(tables.map(t => offlineGetAll(t)));
        const [
          clients,
          followups,
          quotes,
          notes,
          equipment,
          contacts,
          expenses,
          leads,
          vehicleCheckRows,
          activities,
          breakdowns,
          repairs,
          customFaults,
          syncQueue,
        ] = results;
        const vehicleChecks = (vehicleCheckRows || []).reduce((acc, row) => {
          if (row?.check_date)
            acc[row.check_date] = {
              ...parseVehicleCheckData(row.data),
              _id: row.id,
              _updated_at: row.updated_at,
            };
          return acc;
        }, {});
        setData(d => ({
          ...d,
          ...(clients?.length ? { clients } : {}),
          ...(followups?.length ? { followups } : {}),
          ...(quotes?.length ? { quotes } : {}),
          ...(notes?.length ? { notes } : {}),
          ...(equipment?.length ? { equipment } : {}),
          ...(contacts?.length ? { contacts } : {}),
          ...(expenses?.length ? { expenses } : {}),
          ...(leads?.length ? { leads } : {}),
          ...(vehicleChecks ? { vehicleChecks } : {}),
          ...(activities ? { activities } : {}),
          ...(breakdowns ? { breakdowns } : {}),
          ...(repairs ? { repairs } : {}),
          ...(customFaults ? { customFaults } : {}),
          ...(syncQueue ? { syncQueue } : {}),
        }));
      } catch (e) {
        console.warn("IndexedDB load failed:", e);
      }
    }
    loadLocalData();
  }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    if (navigator.onLine) {
      // Push first: changes queued before the app was last closed go up on startup.
      pushSyncQueue(syncQueueRef.current || [], setData)
        .catch(() => {})
        .finally(() => pullFromSupabase(uid, setData).catch(() => {}));
      retryPendingMedia(uid, setData).catch(() => {});
    }
    const unsubscribe = setupRealtimeSync(uid, setData);
    return () => {
      try {
        unsubscribe && unsubscribe();
      } catch {}
    };
  }, [session?.user?.id, teamId]);
  useEffect(() => {
    const onView = e => setTeamViewOn(!!e.detail?.on);
    const onAccess = e => setTeamAccess(a => (e.detail ? { ...(a || {}), ...e.detail } : a));
    window.addEventListener("powermate:team-view", onView);
    window.addEventListener("powermate:team-access", onAccess);
    return () => {
      window.removeEventListener("powermate:team-view", onView);
      window.removeEventListener("powermate:team-access", onAccess);
    };
  }, []);
  // Keep this device registered for push to whoever is signed in (no prompt: only
  // runs when notifications were already allowed).
  useEffect(() => {
    if (
      !session?.user?.id ||
      !isOnline ||
      !pushSupported() ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    )
      return;
    subscribeToPush(session.user.id).catch(() => {});
  }, [session?.user?.id, isOnline]);
  // Their own name, for signing off emails and messages.
  useEffect(() => {
    const u = session?.user;
    if (!u?.id) return;
    const fallback = (u.email || "").split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    setMyName(u.user_metadata?.full_name || fallback);
    supabase
      .from("users")
      .select("full_name")
      .eq("id", u.id)
      .maybeSingle()
      .then(
        ({ data }) => data?.full_name && setMyName(data.full_name),
        () => {},
      );
  }, [session?.user?.id]);
  // Two-step login: ask for the code after the password when it's set up, and
  // make owners/admins set it up when their company requires it.
  const [twoStep, setTwoStep] = useState({ checked: false, current: "aal1", next: "aal1" });
  const recheckTwoStep = useCallback(
    () => assuranceLevel().then(l => setTwoStep({ checked: true, ...l })),
    [],
  );
  useEffect(() => {
    if (session?.user?.id) recheckTwoStep();
  }, [session?.user?.id, recheckTwoStep]);
  // The company's plan (trial / read-only / suspended) and whether this person
  // runs the product itself (platform console).
  const teamPlan = useTeamPlan(teamId, isOnline);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => {
    if (!session?.user?.id || !isOnline) return;
    supabase.rpc("is_platform_admin").then(
      ({ data }) => setIsPlatformAdmin(data === true),
      () => {},
    );
  }, [session?.user?.id, isOnline]);
  // Modules the company switched off: their screens leave the menu and can't open.
  const companyProfile = useCompanyProfile(teamId);
  const offScreens = unavailableScreens(companyProfile.disabled_modules);
  // The company this person works for: its name and logo brand PDFs and messages.
  useEffect(() => {
    setActiveTeamId(teamId);
    if (teamId) loadCompanyProfile(teamId).catch(() => {});
  }, [teamId]);
  // Each teammate's own menu: screens they chose to hide. Instant from this
  // device, then reconciled with their user record (and any offline change sent).
  const [hiddenScreens, setHiddenScreens] = useState([]);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    setHiddenScreens(readHiddenScreens(uid));
    if (!isOnline) return;
    let live = true;
    syncHiddenScreens(uid).then(
      list => live && setHiddenScreens(list),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [session?.user?.id, isOnline]);
  const onSaveHidden = useCallback(
    list => {
      const uid = session?.user?.id;
      if (uid) saveHiddenScreens(uid, list).then(setHiddenScreens);
    },
    [session?.user?.id],
  );
  // Server reminders fire at each user's local time, so keep their timezone current.
  useEffect(() => {
    if (!session?.user?.id || !isOnline) return;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz)
        supabase.rpc("set_my_timezone", { p_tz: tz }).then(
          () => {},
          () => {},
        );
    } catch {}
  }, [session?.user?.id, isOnline]);
  // Device-side reminders for follow-ups, equipment and unresolved notes. These were
  // built but never scheduled. Rebuilt only under the "digest" source so calendar
  // reminders are untouched; needs the Notification permission from More → Notifications.
  useEffect(() => {
    if (!session?.user?.id || typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    const uid = session.user.id;
    let cancelled = false;
    const t = setTimeout(async () => {
      // Only this person's own/assigned records remind them, even with whole-team view on.
      const own = list => (list || []).filter(r => isOwnRecord(r, uid));
      // With a push subscription the server sends follow-up reminders at the user's
      // local time; scheduling them here too would notify twice.
      let hasPush = false;
      try {
        const reg = await navigator.serviceWorker?.ready;
        hasPush = !!(await reg?.pushManager?.getSubscription());
      } catch {}
      if (cancelled) return;
      registerReminderPeriodicSync();
      scheduleNotificationsViaSW(
        buildNotificationItems(hasPush ? [] : own(data.followups), own(data.equipment), own(data.notes)),
        { replace: true, source: "digest" },
      );
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [session?.user?.id, data.followups, data.equipment, data.notes]);
  // Reconnect handling: going offline→online used to do nothing but flip the badge —
  // anything queued while offline just waited for the next unrelated save or the 30s
  // reconcile tick. Now the moment signal comes back, we push the queue, retry any
  // stuck photo uploads, and pull the latest server state, so "back online" actually
  // means "syncing now" rather than "syncing eventually".
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    const justReconnected = isOnline && !wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (!justReconnected || !session?.user?.id) return;
    const uid = session.user.id;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const jitter = Math.floor(Math.random() * 2000);
        await new Promise(resolve => setTimeout(resolve, jitter));
        if (cancelled) return;
        await pushSyncQueue(syncQueueRef.current || [], setData);
        await retryPendingMedia(uid, setData);
        await pullFromSupabase(uid, setData);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline, session?.user?.id]);
  const navigate = useCallback((next, context) => {
    setScreen(next);
    setScreenContext(context || {});
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("screen", next);
      window.history.replaceState({}, "", url);
    } catch {}
  }, []);
  const goBack = useCallback(fallback => navigate(fallback), [navigate]);
  const handleQuickCapture = useCallback(
    target => {
      setQuickAddTrigger({ screen: target, ts: Date.now() });
      navigate(target);
    },
    [navigate],
  );
  const handleSearchNavigate = useCallback(
    (target, term) => {
      setSearchSeed({ term, ts: Date.now() });
      navigate(target);
    },
    [navigate],
  );
  async function logout() {
    const uid = session?.user?.id;
    try {
      // Flush durable local changes before signing out so a pending change cannot
      // disappear when the same user signs back in.
      if (uid && navigator.onLine) {
        try {
          await pushSyncQueue(syncQueueRef.current || [], setData);
          await pullFromSupabase(uid, setData);
        } catch (e) {
          console.warn("Logout sync failed; preserving this user's local store:", e);
        }
      }
    } finally {
      // Stop this device receiving the signed-out person's reminders; the next
      // person to sign in here registers the device for themselves.
      if (uid) {
        try {
          await unsubscribeFromPush(uid);
        } catch {}
      }
      try {
        await supabase.auth.signOut();
      } catch {}
      try {
        if (uid) sessionStorage.removeItem(scopedPinKey(PIN_UNLOCKED_KEY, uid));
      } catch {}
      // User stores are intentionally retained across logout. They are keyed by
      // authenticated user, so keeping them is required for reliable offline
      // persistence and prevents local-only changes vanishing after re-login.
      setSession(null);
      setData(INITIAL_DATA);
      setOfflineUser(null);
    }
  }
  if (loading) return <DataLoadingScreen />;
  if (!session?.user) return <AuthScreen />;
  if (recoveringPassword) return <SetPasswordScreen onDone={() => setRecoveringPassword(false)} />;
  if (!twoStep.checked) return <DataLoadingScreen />;
  if (twoStep.next === "aal2" && twoStep.current !== "aal2")
    return <TwoStepChallenge onDone={recheckTwoStep} onSignOut={logout} />;
  if (isOnline && userRole === "admin" && companyProfile.require_admin_mfa && twoStep.next !== "aal2")
    return <TwoStepRequired onDone={recheckTwoStep} onSignOut={logout} />;
  if (teamPlan?.access === "suspended" && screen !== "Help")
    return <SuspendedScreen onHelp={() => navigate("Help")} onSignOut={logout} />;
  // Signed in but not in a company yet: join one, or set up a new company.
  if (teamChecked && !teamId && isOnline)
    return (
      <Suspense fallback={<DataLoadingScreen />}>
        <CompanySetup userId={session.user.id} onDone={() => setTeamRefreshKey(k => k + 1)} onSignOut={logout} />
      </Suspense>
    );
  // FIX (Build 8, Phase 3 — CRITICAL) — PINSetupScreen/PINLockScreen were
  // imported and pinState was computed (see the checkPIN effect above) but
  // NEITHER was ever actually rendered here: the component fell straight
  // through from the auth check to the main app shell regardless of
  // pinState. The entire PIN-lock feature — the setup flow, the lock screen,
  // biometric unlock, the lockout timer — was dead code; PIN Lock in
  // Settings did nothing to protect a signed-in session on a shared device.
  if (pinState === "checking") return <DataLoadingScreen />;
  if (pinState === "setup")
    return <PINSetupScreen userId={session.user.id} onComplete={() => setPinState("unlocked")} />;
  if (pinState === "locked")
    return (
      <PINLockScreen userId={session.user.id} onUnlock={() => setPinState("unlocked")} onForgot={logout} />
    );
  const screens = {
    Home: (
      <HomeScreen
        data={data}
        setData={setData}
        userId={session?.user?.id}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    Clients: (
      <ClientsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
        onNavigate={navigate}
      />
    ),
    Contacts: (
      <ContactsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Followups: (
      <FollowupsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Notes: (
      <NotesScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        isOnline={isOnline}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Equipment: (
      <EquipmentScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        isOnline={isOnline}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Quotes: (
      <QuotesScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Expenses: (
      <ExpensesScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        quickAddTrigger={quickAddTrigger}
      />
    ),
    Analytics: (
      <AnalyticsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    Leads: (
      <LeadsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        quickAddTrigger={quickAddTrigger}
        searchSeed={searchSeed}
      />
    ),
    Team: (
      <TeamScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        userRole={userRole}
        onTeamChange={handleTeamChange}
      />
    ),
    Planner: (
      <WeeklyPlannerScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    ColdCall: (
      <ColdCallScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    JackSelector: (
      <JackSelectorScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} />
    ),
    Meeting: (
      <MeetingScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        onNavigate={navigate}
      />
    ),
    VehicleCheck: (
      <VehicleCheckScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} />
    ),
    Breakdown: <BreakdownScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} />,
    Repair: <RepairScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} />,
    Jobs: <JobsScreen userId={session.user.id} teamId={teamId} setData={setData} clients={data.clients} />,
    Invoices: (
      <InvoicesScreen
        userId={session.user.id}
        teamId={teamId}
        setData={setData}
        clients={data.clients}
        quotes={data.quotes}
      />
    ),
    CompanyProfile: <CompanyProfileScreen teamId={teamId} isOwner={!!teamAccess?.is_owner} />,
    Schedule: (
      <ScheduleScreen
        userId={session.user.id}
        teamId={teamId}
        setData={setData}
        clients={data.clients}
        teamMembers={teamMembers}
        canManage={!!teamAccess?.is_owner || userRole === "admin"}
      />
    ),
    ServicePlans: (
      <ServicePlansScreen
        teamId={teamId}
        canManage={!!teamAccess?.is_owner || userRole === "admin"}
        clients={data.clients}
        equipment={data.equipment}
        teamMembers={teamMembers}
      />
    ),
    Timesheets: (
      <TimesheetsScreen
        userId={session.user.id}
        teamId={teamId}
        setData={setData}
        teamMembers={teamMembers}
        isManager={!!teamAccess?.is_owner || userRole === "admin"}
      />
    ),
    Products: (
      <ProductsScreen
        teamId={teamId}
        canManage={!!teamAccess?.is_owner || userRole === "admin"}
        vatRegistered={companyProfile.vat_registered !== false}
      />
    ),
    Help: (
      <HelpScreen userId={session.user.id} userEmail={session.user.email} teamId={teamId} fromScreen={screenContext?.from} />
    ),
    Platform: isPlatformAdmin ? <PlatformAdminScreen /> : null,
    AuditLog: <AuditLogScreen teamId={teamId} teamMembers={teamMembers} />,
    More: (
      <MoreScreen
        data={data}
        onLogout={logout}
        userId={session.user.id}
        teamId={teamId}
        onSyncNow={handleSyncNow}
        onClearQueue={q => {
          setData(d => ({ ...d, syncQueue: q }));
          offlineReplaceAll("syncQueue", q || []).catch(() => {});
        }}
        syncing={syncing}
        isOnline={isOnline}
        notifPermission={notifPermission}
        onRequestNotif={() => {}}
        setScreen={navigate}
        isPlatformAdmin={isPlatformAdmin}
        isCompanyAdmin={userRole === "admin"}
      />
    ),
    Diagnostics: (
      <DiagnosticsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        isOnline={isOnline}
        onBack={() => goBack("More")}
        onBackfill={() => navigate("BackfillZAR")}
      />
    ),
    Assistant: <AssistantScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} />,
    BackfillZAR: (
      <BackfillZARScreen
        data={data}
        setData={setData}
        userId={session.user.id}
        onBack={() => goBack("Diagnostics")}
      />
    ),
    Notifications: (
      <NotificationsScreen
        userId={session.user.id}
        onNavigate={navigate}
        onMarkRead={() => setUnreadCount(0)}
      />
    ),
    SharedInbox: (
      <SharedInboxScreen
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        onBack={() => goBack("Notifications")}
        onAccepted={() => {
          triggerImmediateSync();
          navigate("Notifications");
        }}
      />
    ),
    Client360: (
      <Client360Screen
        data={data}
        setData={setData}
        userId={session.user.id}
        userEmail={session.user.email}
        teamId={teamId}
        teamMembers={teamMembers}
        clientId={screenContext.clientId}
        onBack={() => goBack(screenContext.returnTo || "Clients")}
        onNavigate={navigate}
      />
    ),
    Calendar: (
      <CalendarScreen
        data={data}
        setData={setData}
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
      {pinState === "relocked" && (
        <div className="fixed inset-0 z-200 overflow-y-auto" style={{ background: "var(--pm-page-bg)" }}>
          <PINLockScreen
            userId={session.user.id}
            onUnlock={() => setPinState("unlocked")}
            onForgot={logout}
          />
        </div>
      )}
      <TeamViewContext.Provider value={{ teamId, showTeam: !!teamAccess?.can_view_team && teamViewOn }}>
        <ExportProgressProvider>
          <div
            className="min-h-screen pb-32"
            style={{ background: "var(--pm-page-bg)", paddingTop: "calc(3.5rem + env(safe-area-inset-top))" }}
          >
            <header
              className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            >
              <div className="mx-auto max-w-2xl px-3 h-14 flex items-center justify-between gap-2">
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Menu"
                >
                  <Menu size={22} />
                </button>
                {screen === "Home" ? (
                  <Wordmark variant="dark" size="sm" />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-base font-black text-slate-900 truncate">
                      {SCREEN_TITLES[screen] || screen}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {teamId && (
                    <button
                      onClick={() => navigate("Notifications")}
                      className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Notifications"
                    >
                      <Bell size={20} />
                      {unreadCount > 0 && (
                        <span
                          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                          style={{ background: "#DC2626" }}
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Search"
                  >
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
              badges={{}}
              userEmail={session.user?.email}
              onLogout={logout}
              hiddenScreens={hiddenScreens}
              unavailableScreens={offScreens}
              onSaveHidden={onSaveHidden}
              userId={session.user.id}
              teamId={teamId}
              setData={setData}
            />
            <PlanBanner plan={teamPlan} isAdmin={userRole === "admin"} onHelp={() => navigate("Help", { from: screen })} />
            <main className="mx-auto max-w-2xl px-4 pt-4">
              <PullToRefresh
                onRefresh={async () => {
                  if (!isOnline || !session?.user?.id) return;
                  setSyncing(true);
                  try {
                    await pushSyncQueue(data.syncQueue, setData);
                    await retryPendingMedia(session.user.id, setData);
                    await pullFromSupabase(session.user.id, setData);
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={screen}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ScreenErrorBoundary label={screen} onGoHome={() => navigate("Home")}>
                      <Suspense
                        fallback={
                          <div className="flex justify-center items-center py-20">
                            <Spinner />
                          </div>
                        }
                      >
                        {offScreens.includes(screen) ? screens.Home : screens[screen]}
                      </Suspense>
                    </ScreenErrorBoundary>
                  </motion.div>
                </AnimatePresence>
              </PullToRefresh>
            </main>
            <SyncStatusBadge
              isOnline={isOnline}
              pendingCount={(data.syncQueue || []).filter(x => x.status === "pending").length}
              syncing={syncing}
            />
            <GlobalSearch
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              data={data}
              onNavigate={handleSearchNavigate}
            />
            <QuickCaptureFAB currentScreen={screen} onTrigger={handleQuickCapture} />
            <DailyVehiclePrompt
              userId={session.user.id}
              teamId={teamId}
              data={data}
              setData={setData}
              onNavigate={navigate}
            />
            <AnimatePresence>
              {syncError && <Toast message={syncError} type="error" onDone={() => setSyncError("")} />}{" "}
              {showOnboarding && session?.user?.id && (
                <Onboarding userId={session.user.id} onDone={() => setShowOnboarding(false)} />
              )}
            </AnimatePresence>
          </div>
        </ExportProgressProvider>
      </TeamViewContext.Provider>
    </ErrorBoundary>
  );
}
