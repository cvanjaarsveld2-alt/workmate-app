// ─── PowerMate App ────────────────────────────────────────────────────────────
import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Calendar, Settings, Search, Menu, Plus, Bell } from "lucide-react";

import { supabase } from "./supabase";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { offlineSave, offlineGetAll, offlineReplaceAll, setOfflineUser, clearAllStores } from "./offline/offlineDb";
import { setMediaQueueUser, processMediaQueue } from "./lib/mediaQueue";
import { todayISO, logEvent, genId } from "./lib/helpers";
import { localStorageKey, URGENCY_ESCALATION, PIN_KEY, PIN_UNLOCKED_KEY, BRAND } from "./lib/constants";
import { pushSyncQueue, pullFromSupabase, setupRealtimeSync, registerSyncHandlers, triggerImmediateSync } from "./lib/sync";
import { requestNotificationPermission, scheduleNotificationsViaSW, buildNotificationItems, checkRemindersNow, registerReminderPeriodicSync } from "./lib/notifications";
import { runQuoteAutomations } from "./lib/quoteAutomation";
import { getPINHash, isSessionUnlocked, markSessionUnlocked } from "./auth/PINScreens";
function resetPINAttempts() { localStorage.removeItem("pm_pin_attempts"); localStorage.removeItem("pm_pin_lockout_until"); }

import { AuthScreen } from "./auth/AuthScreen";
import { PINSetupScreen, PINLockScreen } from "./auth/PINScreens";
import { NavTab, Spinner, DataLoadingScreen, Toast } from "./components/ui";
import SyncStatusBadge from "./components/SyncStatusBadge";
import { QuickCaptureFAB } from "./components/QuickCaptureFAB";
import { Wordmark } from "./components/Wordmark";
import { ExportProgressProvider } from "./components/ExportProgress";
import { GlobalSearch } from "./components/GlobalSearch";
import { NavDrawer } from "./components/NavDrawer";
import { DailyVehiclePrompt } from "./components/DailyVehiclePrompt";

import { HomeScreen } from "./screens/HomeScreen";
const EquipmentScreen = lazy(() => import("./screens/EquipmentScreen").then(m => ({ default: m.EquipmentScreen })));
const ClientsScreen = lazy(() => import("./screens/ClientsScreen").then(m => ({ default: m.ClientsScreen })));
const ContactsScreen = lazy(() => import("./screens/ContactsScreen").then(m => ({ default: m.ContactsScreen })));
const FollowupsScreen = lazy(() => import("./screens/FollowupsScreen").then(m => ({ default: m.FollowupsScreen })));
const QuotesScreen = lazy(() => import("./screens/QuotesScreen").then(m => ({ default: m.QuotesScreen })));
const NotesScreen = lazy(() => import("./screens/NotesScreen").then(m => ({ default: m.NotesScreen })));
const MeetingScreen = lazy(() => import("./screens/MeetingScreen").then(m => ({ default: m.MeetingScreen })));
const VehicleCheckScreen = lazy(() => import("./screens/VehicleCheckScreen").then(m => ({ default: m.VehicleCheckScreen })));
const WeeklyPlannerScreen = lazy(() => import("./screens/WeeklyPlannerScreen").then(m => ({ default: m.WeeklyPlannerScreen })));
const ColdCallScreen = lazy(() => import("./screens/ColdCallScreen").then(m => ({ default: m.ColdCallScreen })));
const JackSelectorScreen = lazy(() => import("./screens/JackSelectorScreen").then(m => ({ default: m.JackSelectorScreen })));
const BreakdownScreen = lazy(() => import("./screens/BreakdownScreen").then(m => ({ default: m.BreakdownScreen })));
const AnalyticsScreen = lazy(() => import("./screens/AnalyticsScreen").then(m => ({ default: m.AnalyticsScreen })));
const LeadsScreen = lazy(() => import("./screens/LeadsScreen").then(m => ({ default: m.LeadsScreen })));
const TeamScreen = lazy(() => import("./screens/TeamScreen").then(m => ({ default: m.TeamScreen })));
const NotificationsScreen = lazy(() => import("./screens/NotificationsScreen").then(m => ({ default: m.NotificationsScreen })));
const SharedInboxScreen = lazy(() => import("./screens/SharedInboxScreen").then(m => ({ default: m.SharedInboxScreen })));
const ExpensesScreen = lazy(() => import("./screens/ExpensesScreen").then(m => ({ default: m.ExpensesScreen })));
const MoreScreen = lazy(() => import("./screens/MoreScreen").then(m => ({ default: m.MoreScreen })));
const DiagnosticsScreen = lazy(() => import("./screens/DiagnosticsScreen").then(m => ({ default: m.DiagnosticsScreen })));
const BackfillZARScreen = lazy(() => import("./screens/BackfillZARScreen").then(m => ({ default: m.BackfillZARScreen })));
const JobsScreen = lazy(() => import("./screens/JobsScreen").then(m => ({ default: m.JobsScreen })));
const InvoicesScreen = lazy(() => import("./screens/InvoicesScreen").then(m => ({ default: m.InvoicesScreen })));
import { Client360Screen } from "./screens/Client360Screen";
import { CalendarScreen } from "./screens/CalendarScreen";
const TeamDashboardScreen = lazy(() => import("./screens/TeamDashboardScreen").then(m => ({ default: m.TeamDashboardScreen })));

import { ErrorBoundary as ScreenErrorBoundary } from "./components/ErrorBoundary";
import { Onboarding, shouldShowOnboarding } from "./components/Onboarding";
import { PullToRefresh } from "./components/PullToRefresh";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, i) { console.error("PowerMate:", e, i); try { logEvent("app_crashed", { message: e?.message, stack: (e?.stack || "").slice(0, 500) }); } catch (_) {} }
  render() {
    if (this.state.hasError) return <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: "var(--pm-page-bg)" }}><div className="bg-white rounded-2xl max-w-sm w-full p-8 space-y-4 shadow-sm border border-slate-100"><div className="text-4xl">⚠️</div><h2 className="text-lg font-black text-slate-900">Something went wrong</h2><button onClick={() => window.location.reload()} className="w-full rounded-2xl py-4 text-sm font-bold text-white min-h-[52px]" style={{ background: "#8B1A1A" }}>Reload App</button></div></div>;
    return this.props.children;
  }
}

export default function PowerWorksApp() {
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState(() => { try { const p = new URLSearchParams(window.location.search).get("screen"); const valid = ["Home","Clients","Contacts","Followups","Notes","Equipment","Quotes","Expenses","More","Diagnostics","BackfillZAR","Analytics","Leads","Team","VehicleCheck","Notifications","SharedInbox","Jobs","Invoices","Client360","Calendar","TeamDashboard"]; if (p && valid.includes(p)) return p; } catch (e) {} return "Home"; });
  const [syncing, setSyncing] = useState(false);
  const [pinState, setPinState] = useState("checking");
  const [dataLoading, setDataLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState("Notification" in window ? Notification.permission : "denied");
  const [data, setData] = useState({ clients: [], followups: [], quotes: [], notes: [], equipment: [], contacts: [], expenses: [], leads: [], activities: [], breakdowns: [], repairs: [], customFaults: [], syncQueue: [] });
  const [quickAddTrigger, setQuickAddTrigger] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState("member");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [screenContext, setScreenContext] = useState({});
  const syncQueueRef = useRef(data.syncQueue);
  useEffect(() => { syncQueueRef.current = data.syncQueue; }, [data.syncQueue]);
  useEffect(() => { if (!session?.user?.id) return; const timer = setTimeout(() => offlineReplaceAll("syncQueue", data.syncQueue || []).catch(() => {}), 100); return () => clearTimeout(timer); }, [data.syncQueue, session?.user?.id]);
  useEffect(() => { if (!("serviceWorker" in navigator)) return; const onMessage = e => { if (e.data?.type === "POWERMATE_RETRY_SYNC") pushSyncQueue(syncQueueRef.current, setData); }; navigator.serviceWorker.addEventListener("message", onMessage); return () => navigator.serviceWorker.removeEventListener("message", onMessage); }, []);
  useEffect(() => { let mounted=true, settled=false; const finish=s=>{if(mounted&&!settled){settled=true;setSession(s||null);setLoading(false);}}; supabase.auth.getSession().then(({data:{session:s}})=>finish(s)); const failsafe=setTimeout(()=>{if(settled)return;let cached=null;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.endsWith("-auth-token")){const v=JSON.parse(localStorage.getItem(k)||"null");if(v&&(v.access_token||v.currentSession||v.user))cached=v.currentSession||v;break;}}}catch{} finish(cached);},1500); const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>{if(mounted){setSession(s);setLoading(false);settled=true;}}); return()=>{mounted=false;clearTimeout(failsafe);subscription.unsubscribe();}; },[]);
  useEffect(() => { if(session?.user?.id){setOfflineUser(session.user.id);setMediaQueueUser(session.user.id);if(shouldShowOnboarding(session.user.id))setShowOnboarding(true);} },[session?.user?.id]);
  useEffect(() => { function onFocusIn(e){const el=e.target;if(!el||!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))return;setTimeout(()=>el.scrollIntoView({block:"center",behavior:"smooth"}),300);} window.addEventListener("focusin",onFocusIn);return()=>window.removeEventListener("focusin",onFocusIn); },[]);
  useEffect(() => { registerSyncHandlers(setData,syncQueueRef); },[]);
  useEffect(() => { if(!session?.user?.id)return;let pollInterval;async function loadTeamState(){try{const {data:membership}=await supabase.from("team_members").select("team_id, role").eq("user_id",session.user.id).maybeSingle();if(!membership?.team_id)return;setTeamId(membership.team_id);setUserRole(membership.role==="admin"||membership.role==="owner"?"admin":"member");const {data:rows,error:rpcError}=await supabase.rpc("get_team_member_emails",{p_team_id:membership.team_id});if(!rpcError&&rows)setTeamMembers(rows);else{const {data:basicRows}=await supabase.from("team_members").select("user_id, role, joined_at").eq("team_id",membership.team_id);if(basicRows)setTeamMembers(basicRows.map(r=>({...r,email:r.user_id===session.user.id?session.user.email:`Member ${r.user_id.slice(0,8)}`})));}async function checkUnread(){try{const {count}=await supabase.from("team_notifications").select("id",{count:"exact",head:true}).eq("to_user_id",session.user.id).eq("read",false);setUnreadCount(count||0);}catch{}}checkUnread();pollInterval=setInterval(checkUnread,30000);}catch(e){console.warn("Team load failed:",e);}}loadTeamState();return()=>clearInterval(pollInterval);},[session?.user?.id]);
  useEffect(() => { function onClearFailed(){setData(d=>({...d,syncQueue:(d.syncQueue||[]).filter(i=>i.status!=="failed")}));} window.addEventListener("powermate-clear-failed-queue",onClearFailed);return()=>window.removeEventListener("powermate-clear-failed-queue",onClearFailed); },[]);
  useEffect(() => { if(!session)return;function checkPIN(){if(localStorage.getItem("pm_pin_disabled")==="1"){setPinState("unlocked");return;}if(isSessionUnlocked()){setPinState("unlocked");return;}const hash=getPINHash();if(!hash){setPinState("setup");return;}setPinState("locked");}checkPIN();},[session]);
  useEffect(() => { if(!session?.user?.id)return;const uid=session.user.id;setOfflineUser(uid);async function loadLocalData(){try{const saved=localStorage.getItem(localStorageKey(uid));if(saved)setData(d=>({...d,...JSON.parse(saved)}));}catch(e){console.warn("localStorage load failed:",e);}try{const tables=["clients","followups","quotes","notes","equipment","contacts","expenses","leads","activities","breakdowns","repairs","customFaults","syncQueue"];const results=await Promise.all(tables.map(t=>offlineGetAll(t)));const [clients,followups,quotes,notes,equipment,contacts,expenses,leads,activities,breakdowns,repairs,customFaults,syncQueue]=results;setData(d=>({...d,...(clients?.length?{clients}:{}),...(followups?.length?{followups}:{}),...(quotes?.length?{quotes}:{}),...(notes?.length?{notes}:{}),...(equipment?.length?{equipment}:{}),...(contacts?.length?{contacts}:{}),...(expenses?.length?{expenses}:{}),...(leads?.length?{leads}:{}),...(activities?{activities}:{}),...(breakdowns?{breakdowns}:{}),...(repairs?{repairs}:{}),...(customFaults?{customFaults}:{}),...(syncQueue?{syncQueue}:{})}));}catch(e){console.warn("IndexedDB load failed:",e);}}loadLocalData();},[session?.user?.id]);
  useEffect(() => { const t=setTimeout(()=>{try{const safeData={...data,notes:(data.notes||[]).map(n=>({...n,media:(n.media||[]).map(m=>m.url?{...m,base64:undefined}:m)})),equipment:(data.equipment||[]).map(e=>({...e,media:(e.media||[]).map(m=>m.url?{...m,base64:undefined}:m)})),syncQueue:(data.syncQueue||[]).map(q=>q.data?.media?{...q,data:{...q.data,media:q.data.media.map(m=>({...m,base64:undefined}))}:q)};const serialized=JSON.stringify(safeData);if(parseFloat((serialized.length/1024/1024).toFixed(1))>4)logEvent("localStorage_size_warning",{sizeMB:(serialized.length/1024/1024).toFixed(1)});localStorage.setItem(localStorageKey(session?.user?.id),serialized);}catch(e){console.warn("Could not save local data:",e);if(e.name==="QuotaExceededError")logEvent("localStorage_quota_exceeded",{message:e.message});}},500);return()=>clearTimeout(t);},[data]);
  useEffect(() => { if(dataLoading)return;const today=todayISO(),uid=session?.user?.id,notes=(data.notes||[]).filter(n=>n.user_id===uid),toEscalate=notes.filter(n=>!n.resolved&&n.resolve_by&&n.resolve_by<today&&n.last_escalated!==`${n.urgency}_${today}`&&URGENCY_ESCALATION[n.urgency||"Normal"]!==(n.urgency||"Normal"));if(!toEscalate.length)return;const now=new Date().toISOString(),updates=toEscalate.map(n=>({...n,urgency:URGENCY_ESCALATION[n.urgency||"Normal"],last_escalated:`${URGENCY_ESCALATION[n.urgency||"Normal"]}_${today}`,sync_status:"pending"})),queueItems=updates.map(u=>({id:genId(),table:"notes",action:"update",data:{...u,media:(u.media||[]).map(m=>({...m,base64:undefined}))},status:"pending",created_at:now}));setData(d=>({...d,notes:(d.notes||[]).map(n=>updates.find(u=>u.id===n.id)||n),syncQueue:[...queueItems,...(d.syncQueue||[])]}));updates.forEach(u=>offlineSave("notes",u));triggerImmediateSync();},[dataLoading]);
  useEffect(() => { if(dataLoading)return;if((data.quotes||[]).length>0)runQuoteAutomations(data,setData,session?.user?.id,teamId); },[dataLoading]);
  useEffect(() => { if(!session)return;if(!isOnline){setDataLoading(false);return;}const uid=session.user.id;pullFromSupabase(uid,setData).finally(()=>setDataLoading(false));const cleanup=setupRealtimeSync(uid,setData);return cleanup; },[session?.user?.id,isOnline]);
  useEffect(() => { function handleSyncFail(e){setSyncError(`Sync failed: ${e.detail?.message||"Check your connection"}`);setTimeout(()=>setSyncError(""),5000);}window.addEventListener("powermate:sync_failed",handleSyncFail);return()=>window.removeEventListener("powermate:sync_failed",handleSyncFail); },[]);
  useEffect(() => { if(notifPermission!=="granted")return;scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment,data.notes)); },[data.followups,data.equipment,data.notes,notifPermission]);
  useEffect(() => { if(notifPermission!=="granted")return;registerReminderPeriodicSync();const onVisible=()=>{if(document.visibilityState==="visible")checkRemindersNow();};document.addEventListener("visibilitychange",onVisible);window.addEventListener("focus",checkRemindersNow);checkRemindersNow();return()=>{document.removeEventListener("visibilitychange",onVisible);window.removeEventListener("focus",checkRemindersNow);}; },[notifPermission]);
  useEffect(() => { if(!isOnline||!session)return;const pending=(data.syncQueue||[]).filter(i=>i.status==="pending");if(!pending.length)return;if("serviceWorker"in navigator){navigator.serviceWorker.ready.then(reg=>{if(reg.sync&&typeof reg.sync.register==="function")reg.sync.register("powermate-sync").catch(()=>{});}).catch(()=>{});}const t=setTimeout(()=>pushSyncQueue(syncQueueRef.current,setData),3000);return()=>clearTimeout(t); },[isOnline,session,data.syncQueue?.length]);
  const prevOnlineRef=useRef(isOnline);useEffect(()=>{const wasOffline=!prevOnlineRef.current;prevOnlineRef.current=isOnline;if(isOnline&&wasOffline&&session){pullFromSupabase(session.user.id,setData);if((data.syncQueue||[]).some(i=>i.status==="pending"))pushSyncQueue(syncQueueRef.current,setData);processMediaQueue(setData).catch(()=>{});}},[isOnline]);
  useEffect(()=>{function handleKey(e){if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setSearchOpen(true);}if(e.key==="Escape"&&searchOpen)setSearchOpen(false);}window.addEventListener("keydown",handleKey);return()=>window.removeEventListener("keydown",handleKey);},[searchOpen]);
  async function handleSyncNow(){setSyncing(true);await pushSyncQueue(syncQueueRef.current,setData);setSyncing(false);}
  async function handleRequestNotif(){const granted=await requestNotificationPermission();setNotifPermission(granted?"granted":"denied");if(granted)scheduleNotificationsViaSW(buildNotificationItems(data.followups,data.equipment,data.notes));}
  async function clearAuthAndSignOut(){const unsyncedItems=(data.syncQueue||[]).filter(i=>i.status==="pending"||i.status==="failed");if(unsyncedItems.length>0){const pending=unsyncedItems.filter(i=>i.status==="pending").length,failed=unsyncedItems.filter(i=>i.status==="failed").length,parts=[];if(pending>0)parts.push(`${pending} pending`);if(failed>0)parts.push(`${failed} failed`);if(!window.confirm(`You have ${parts.join(" and ")} unsynced change${unsyncedItems.length!==1?"s":""}. Signing out will delete them.\n\nSign out anyway?`))return;}localStorage.removeItem(PIN_KEY);sessionStorage.removeItem(PIN_UNLOCKED_KEY);localStorage.removeItem("pm_pin_disabled");resetPINAttempts();await clearAllStores();if(session?.user?.id)localStorage.removeItem(localStorageKey(session.user.id));setData({clients:[],followups:[],quotes:[],notes:[],equipment:[],contacts:[],expenses:[],leads:[],activities:[],breakdowns:[],repairs:[],customFaults:[],syncQueue:[]});setTeamId(null);setTeamMembers([]);setUserRole("member");setUnreadCount(0);setScreenContext({});setDataLoading(true);try{await supabase.auth.signOut();}catch(e){console.warn("Sign out failed:",e);}setSession(null);}
  const logout=clearAuthAndSignOut, forgotPIN=clearAuthAndSignOut;
  function handleQuickCapture(targetScreen){if(!targetScreen||typeof targetScreen!=="string")return;const [screenName,mode]=targetScreen.split(":");navigate(screenName);setQuickAddTrigger({screen:screenName,mode:mode||null,ts:Date.now()});}
  function navigate(key,ctx={}){if(key===screen&&!Object.keys(ctx).length)return;setSearchSeed(null);setScreenContext(ctx);window.history.pushState({pmScreen:key,pmContext:ctx},"");setScreen(key);}
  function goBack(fallback="Home"){setSearchSeed(null);if(window.history.length>1)window.history.back();else{setScreenContext({});window.history.replaceState({pmScreen:fallback,pmContext:{}},"");setScreen(fallback);}}
  function handleSearchNavigate(key,term){navigate(key);setSearchSeed({term:term||"",ts:Date.now()});}
  useEffect(()=>{if(!window.history.state?.pmScreen)window.history.replaceState({pmScreen:"Home",pmContext:{}},"");document.documentElement.style.overscrollBehaviorY="contain";document.body.style.overscrollBehaviorY="contain";},[]);
  useEffect(()=>{function onPop(e){if(searchOpen){setSearchOpen(false);window.history.pushState({pmScreen:screen,pmContext:screenContext},"");return;}setScreenContext(e.state?.pmContext||{});setScreen(e.state?.pmScreen||"Home");}window.addEventListener("popstate",onPop);return()=>window.removeEventListener("popstate",onPop);},[searchOpen,screen,screenContext]);
  const pendingCount=(data.syncQueue||[]).filter(i=>i.status==="pending").length,flaggedQuotes=(data.quotes||[]).filter(q=>q.status==="Pending").length,overdueEquip=(data.equipment||[]).filter(e=>{if(!e.service_due)return false;const d=Math.round((new Date(e.service_due+"T12:00:00")-new Date(todayISO()+"T12:00:00"))/86400000);return d<0;}).length,overdueFollowups=(data.followups||[]).filter(f=>f.date<todayISO()&&!f.completed).length,leadContacts=(data.contacts||[]).filter(c=>(c.status||"lead")==="lead").length,criticalNotes=(data.notes||[]).filter(n=>!n.resolved&&n.urgency==="Critical").length,unsubmittedExp=(data.expenses||[]).filter(e=>e.status==="unsubmitted").length,openBreakdowns=(data.breakdowns||[]).filter(b=>b.status!=="resolved").length;
  const drawerBadges={clients:(data.clients||[]).length,leads:leadContacts,overdueFU:overdueFollowups,criticalNotes,overdueEquip,openBreakdowns,pendingQ:flaggedQuotes,unsubmittedExp,pending:pendingCount,unread:unreadCount,sharedInbox:unreadCount};
  if(loading)return <Spinner/>; if(!session)return <AuthScreen/>; if(pinState==="checking")return <Spinner/>; if(pinState==="setup")return <PINSetupScreen onComplete={()=>setPinState("unlocked")}/>; if(pinState==="locked")return <PINLockScreen onUnlock={()=>setPinState("unlocked")} onForgot={forgotPIN}/>; if(dataLoading)return <DataLoadingScreen/>;
  const screens={
    Home:<HomeScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} setScreen={navigate} user={session.user} onQuickAdd={handleQuickCapture} onNavigate={navigate}/>,
    Planner:<WeeklyPlannerScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} onNavigate={navigate}/>,
    ColdCall:<ColdCallScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} onNavigate={navigate}/>,
    JackSelector:<JackSelectorScreen/>,
    Clients:<ClientsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed} onNavigate={navigate} isOnline={isOnline}/>,
    Contacts:<ContactsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Followups:<FollowupsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Quotes:<QuotesScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Notes:<NotesScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Equipment:<EquipmentScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} isOnline={isOnline} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Meeting:<MeetingScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} onNavigate={navigate}/>,
    VehicleCheck:<VehicleCheckScreen data={data} setData={setData} userId={session.user.id}/>,
    Breakdown:<BreakdownScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} onNavigate={navigate} mode="breakdown"/>,
    Repair:<BreakdownScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} onNavigate={navigate} mode="repair"/>,
    Analytics:<AnalyticsScreen data={data} onNavigate={navigate}/>,
    Leads:<LeadsScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} quickAddTrigger={quickAddTrigger} searchSeed={searchSeed}/>,
    Team:<TeamScreen userId={session.user.id} userEmail={session.user.email} data={data} setData={setData} onTeamChange={async tid=>{setTeamId(tid);if(tid){triggerImmediateSync();try{const {data:rows}=await supabase.rpc("get_team_member_emails",{p_team_id:tid});if(rows)setTeamMembers(rows);}catch(e){console.warn("Could not load team members:",e);}}}}/>,
    Expenses:<ExpensesScreen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} quickAddTrigger={quickAddTrigger}/>,
    Jobs:<JobsScreen userId={session.user.id} teamId={teamId}/>,
    Invoices:<InvoicesScreen userId={session.user.id} teamId={teamId}/>,
    More:<MoreScreen data={data} onLogout={logout} userId={session.user.id} teamId={teamId} onSyncNow={handleSyncNow} onClearQueue={q=>setData(d=>({...d,syncQueue:q}))} syncing={syncing} isOnline={isOnline} notifPermission={notifPermission} onRequestNotif={handleRequestNotif} setScreen={navigate}/>,
    Diagnostics:<DiagnosticsScreen data={data} userId={session.user.id} isOnline={isOnline} onBack={()=>goBack("More")} onBackfill={()=>navigate("BackfillZAR")}/>,
    BackfillZAR:<BackfillZARScreen data={data} setData={setData} userId={session.user.id} onBack={()=>goBack("Diagnostics")}/>,
    Notifications:<NotificationsScreen userId={session.user.id} onNavigate={navigate} onMarkRead={()=>setUnreadCount(0)}/>,
    SharedInbox:<SharedInboxScreen userId={session.user.id} userEmail={session.user.email} teamId={teamId} onBack={()=>goBack("Notifications")} onAccepted={()=>{triggerImmediateSync();navigate("Notifications");}}/>,
    Client360:<Client360Screen data={data} setData={setData} userId={session.user.id} userEmail={session.user.email} teamId={teamId} teamMembers={teamMembers} clientId={screenContext.clientId} onBack={()=>goBack(screenContext.returnTo||"Clients")} onNavigate={navigate}/>,
    Calendar:<CalendarScreen data={data} setData={setData} userId={session.user.id} teamId={teamId} onNavigate={navigate}/>,
    TeamDashboard:<TeamDashboardScreen data={data} teamMembers={teamMembers} userId={session.user.id} userEmail={session.user.email} userRole={userRole} teamId={teamId} onNavigate={navigate}/>,
  };
  return <ErrorBoundary><ExportProgressProvider><div className="min-h-screen pb-32" style={{background:"var(--pm-page-bg)",paddingTop:"calc(3.5rem + env(safe-area-inset-top))"}}>
    <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100" style={{paddingTop:"env(safe-area-inset-top)"}}><div className="mx-auto max-w-2xl px-3 h-14 flex items-center justify-between gap-2"><button onClick={()=>setDrawerOpen(true)} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0" aria-label="Menu"><Menu size={22}/></button>{screen==="Home"?<Wordmark variant="dark" size="sm"/>:(()=>{const SCREEN_LABELS={Clients:{label:"Clients & Leads",addHint:"lead / client"},Contacts:{label:"Contacts",addHint:"contact"},Followups:{label:"Follow-ups",addHint:"follow-up"},Notes:{label:"Field Notes",addHint:"note"},Equipment:{label:"Equipment",addHint:"item"},Quotes:{label:"Quotes",addHint:"quote"},Expenses:{label:"Expenses",addHint:"expense"},Jobs:{label:"Jobs",addHint:null},Invoices:{label:"Invoices",addHint:null},More:{label:"Settings",addHint:null},Diagnostics:{label:"Diagnostics",addHint:null},Analytics:{label:"Analytics",addHint:null},Meeting:{label:"Meeting Recorder",addHint:null},VehicleCheck:{label:"Vehicle Checks",addHint:"check"},Calendar:{label:"Calendar",addHint:null},BackfillZAR:{label:"Backfill ZAR",addHint:null},Client360:{label:"Client",addHint:null},TeamDashboard:{label:"Team Dashboard",addHint:null}};const meta=SCREEN_LABELS[screen]||{label:screen,addHint:null};return <div className="flex items-center gap-2 min-w-0"><p className="text-base font-black text-slate-900 truncate">{meta.label}</p></div>;})}</div></header>
    <main className="mx-auto max-w-2xl px-3"><Suspense fallback={<DataLoadingScreen/>}>{screens[screen]||screens.Home}</Suspense></main>
    <NavDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} currentScreen={screen} onNavigate={navigate} badges={drawerBadges} userEmail={session.user.email} onLogout={logout}/>
  </div></ExportProgressProvider></ErrorBoundary>;
}
