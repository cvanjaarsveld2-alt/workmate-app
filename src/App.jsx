import React, { useEffect, useMemo, useState, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "./supabase";

import { useOnlineStatus } from "./hooks/useOnlineStatus";
import SyncStatusBadge from "./components/SyncStatusBadge";

import {
  Bell,
  Briefcase,
  Calendar,
  Camera,
  ChevronRight,
  ChevronLeft,
  Clipboard,
  File as FileIcon,
  Home,
  LogOut,
  Mail,
  Mic,
  Phone,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  Users,
  Wrench,
  Eye,
  EyeOff,
  BarChart2,
  RefreshCw,
  WifiOff,
  Wifi,
  Check,
  AlertTriangle,
  Settings,
  X,
} from "lucide-react";

// ─── Brand colours ────────────────────────────────────────────────────────────
const BRAND = {
  primary: "#8B1A1A",
  primaryDark: "#6B1414",
  charcoal: "#1C1C1C",
  light: "#F5F0F0",
  accent: "#B22222",
  logo: "https://powerstart.eu/wp-content/uploads/2021/10/Power-Works-Logo.png",
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  "New Lead",
  "Contacted",
  "Quoted",
  "Active",
  "Won",
  "Lost",
];

const STAGE_COLORS = {
  "New Lead": "bg-slate-100 text-slate-700",
  Contacted: "bg-blue-100 text-blue-700",
  Quoted: "bg-amber-100 text-amber-700",
  Active: "bg-purple-100 text-purple-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
};

const QUOTE_STATUSES = [
  "Pending",
  "Accepted",
  "Rejected",
  "Expired",
];

const QUOTE_STATUS_COLORS = {
  Pending: "bg-amber-100 text-amber-800",
  Accepted: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
  Expired: "bg-slate-100 text-slate-600",
};

const OFFLINE_KEY = "powerworks_offline_queue";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function niceDate(d) {
  if (!d) d = new Date();

  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function daysSince(ds) {
  if (!ds) return 999;

  return Math.max(
    0,
    Math.floor(
      (new Date(todayISO() + "T12:00:00") -
        new Date(ds + "T12:00:00")) /
        86400000
    )
  );
}

function workingDaysSince(ds) {
  if (!ds) return 0;

  let count = 0;

  const d = new Date(ds + "T12:00:00");
  const today = new Date(todayISO() + "T12:00:00");

  while (d < today) {
    d.setDate(d.getDate() + 1);

    if (d.getDay() !== 0 && d.getDay() !== 6) {
      count++;
    }
  }

  return count;
}

function smartDate(dateStr) {
  if (!dateStr) return "";

  const date = new Date(dateStr + "T12:00:00");
  const today = new Date(todayISO() + "T12:00:00");

  const diff = Math.round((date - today) / 86400000);

  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  if (diff > 1 && diff <= 7) {
    return date.toLocaleDateString("en-GB", {
      weekday: "long",
    });
  }

  if (diff < -1 && diff >= -7) {
    return `${Math.abs(diff)} days ago`;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: diff < -365 || diff > 365 ? "numeric" : undefined,
  });
}

function formatCurrency(v) {
  return (
    "R " +
    parseFloat(v || 0).toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
    })
  );
}

// ─── Basic UI Components ──────────────────────────────────────────────────────
function Card({ children, className = "" }) {
  return <div className={`bg-white ${className}`}>{children}</div>;
}

function CC({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function Btn({
  children,
  onClick,
  disabled,
  variant = "solid",
  className = "",
  type = "button",
}) {
  const styles = {
    solid: {
      background: BRAND.primary,
      color: "#fff",
    },

    outline: {
      background: "#fff",
      color: BRAND.primary,
      border: `1px solid ${BRAND.primary}`,
    },

    danger: {
      background: "#dc2626",
      color: "#fff",
    },

    secondary: {
      background: BRAND.light,
      color: BRAND.primary,
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition disabled:opacity-50 ${className}`}
      style={styles[variant] || styles.solid}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  multiline = false,
}) {
  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-semibold text-slate-800">
          {label}
        </label>
      )}

      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none"
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-base outline-none"
        />
      )}
    </div>
  );
}

function Empty({ title, text }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
      <p className="text-lg font-bold text-slate-900">
        {title}
      </p>

      <p className="mt-2 text-sm text-slate-500">
        {text}
      </p>
    </div>
  );
}

function ProgressBar({
  value = 0,
  max = 100,
  color = BRAND.primary,
}) {
  const pct =
    max > 0
      ? Math.min(
          100,
          Math.round(
            (Number(value || 0) / Number(max || 1)) * 100
          )
        )
      : 0;

  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: color,
        }}
      />
    </div>
  );
}
function NavTab({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-xs font-bold"
    >
      <Icon
        size={20}
        style={{
          color: active ? BRAND.primary : "#64748b",
        }}
      />

      <span
        style={{
          color: active ? BRAND.primary : "#64748b",
        }}
      >
        {label}
      </span>

      {!!badge && (
        <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function BigAction({
  icon: Icon,
  title,
  text,
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left"
    >
      <Card className="rounded-3xl shadow-sm">
        <CC className="flex items-center gap-4 p-4">
          <div
            className="rounded-2xl p-3 text-white"
            style={{
              background: BRAND.primary,
            }}
          >
            <Icon size={22} />
          </div>

          <div className="flex-1">
            <p className="font-bold text-slate-900">
              {title}
            </p>

            {text && (
              <p className="text-sm text-slate-500">
                {text}
              </p>
            )}
          </div>

          <ChevronRight
            size={18}
            className="text-slate-400"
          />
        </CC>
      </Card>
    </button>
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.light,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "4px solid #e2e8f0",
          borderTopColor: BRAND.primary,
          animation: "spin 1s linear infinite",
        }}
      />

      <style>
        {`
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error("PowerMate error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
          style={{
            background: BRAND.light,
          }}
        >
          <div className="max-w-sm w-full space-y-4 rounded-3xl bg-white p-8 shadow-sm">
            <div
              className="rounded-2xl p-4 text-2xl text-white"
              style={{
                background: BRAND.primary,
              }}
            >
              ⚠️
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              Something went wrong
            </h2>

            <p className="text-sm text-slate-500">
              The app encountered an error.
              Please refresh and try again.
            </p>

            <button
              onClick={() => {
                this.setState({
                  hasError: false,
                  error: null,
                });

                window.location.reload();
              }}
              className="w-full rounded-2xl py-3 font-bold text-white"
              style={{
                background: BRAND.primary,
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen() {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);

  const [msg, setMsg] = useState({
    text: "",
    type: "error",
  });

  async function login() {
    if (!email || !password) {
      setMsg({
        text: "Please enter email and password.",
        type: "error",
      });

      return;
    }

    setLoading(true);

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      setMsg({
        text: error.message,
        type: "error",
      });
    }

    setLoading(false);
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{
        background: BRAND.light,
      }}
    >
      <motion.div
        initial={{
          opacity: 0,
          y: 20,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex flex-col items-center">
          <img
            src={BRAND.logo}
            alt="Power Works"
            className="mb-4 h-16 object-contain"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />

          <h1
            className="text-2xl font-black"
            style={{
              color: BRAND.primary,
            }}
          >
            PowerMate
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Power Works Field Service App
          </p>
        </div>

        <Card className="rounded-3xl shadow-sm">
          <CC className="space-y-4 p-6">
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@powerworks.com"
              type="email"
            />

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-800">
                Password
              </label>

              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 pr-12 text-base outline-none"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPw(!showPw)
                  }
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPw ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>
                        {msg.text && (
              <div
                className={`rounded-2xl p-3 text-sm font-medium ${
                  msg.type === "success"
                    ? "bg-green-50 text-green-700"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {msg.text}
              </div>
            )}

            <Btn
              className="w-full py-4 text-base"
              onClick={login}
              disabled={loading}
            >
              {loading ? "Please wait…" : "Log in"}
            </Btn>
          </CC>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2026 Power Works (Pty) Ltd
        </p>
      </motion.div>
    </div>
  );
}

// ─── Dashboard / Home ────────────────────────────────────────────────────────
function HomeScreen({
  data,
  setScreen,
}) {
  const today = todayISO();

  const todaysFollowups =
    data.followups?.filter(
      (f) => f.date === today
    ) || [];

  const pendingQuotes =
    data.quotes?.filter(
      (q) => q.status === "Pending"
    ) || [];

  const overdueFollowups =
    data.followups?.filter(
      (f) => f.date < today && !f.completed
    ) || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Dashboard
        </h1>

        <p className="text-sm text-slate-500">
          {niceDate()}
        </p>
      </div>

      <div
        className="rounded-3xl p-5 text-white shadow-sm"
        style={{
          background: BRAND.primary,
        }}
      >
        <p className="text-sm opacity-80">
          Sales CRM + Field Reporting
        </p>

        <h2 className="mt-1 text-2xl font-black">
          PowerMate Offline CRM
        </h2>

        <p className="mt-2 text-sm opacity-80">
          Offline foundation active.
          Client data, notes and reports will
          now be moved into local-first sync.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-3xl shadow-sm">
          <CC className="p-4">
            <p className="text-xs text-slate-500">
              Today Follow-ups
            </p>

            <p
              className="text-3xl font-black"
              style={{
                color: BRAND.primary,
              }}
            >
              {todaysFollowups.length}
            </p>
          </CC>
        </Card>

        <Card className="rounded-3xl shadow-sm">
          <CC className="p-4">
            <p className="text-xs text-slate-500">
              Pending Quotes
            </p>

            <p
              className="text-3xl font-black"
              style={{
                color: BRAND.primary,
              }}
            >
              {pendingQuotes.length}
            </p>
          </CC>
        </Card>
      </div>

      {overdueFollowups.length > 0 && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
          ⚠️ {overdueFollowups.length} overdue follow-up
          {overdueFollowups.length !== 1 ? "s" : ""}
        </div>
      )}

      <div className="space-y-3">
        <BigAction
          icon={Users}
          title="Companies & Branches"
          text="Group clients by company, branch, mine, site or division."
          onClick={() => setScreen("Clients")}
        />

        <BigAction
          icon={Calendar}
          title="Follow-ups"
          text="Offline-ready follow-up tracking."
          onClick={() => setScreen("Followups")}
        />

        <BigAction
          icon={FileIcon}
          title="Quotes"
          text="Track pending, accepted and rejected quotes."
          onClick={() => setScreen("Quotes")}
        />

        <BigAction
          icon={Clipboard}
          title="Field Notes"
          text="Visit notes and reports."
          onClick={() => setScreen("Notes")}
        />
      </div>
    </div>
  );
}

// ─── Clients / Company Groups ────────────────────────────────────────────────
function ClientsScreen({
  data,
  setData,
  userId,
}) {
  const [company, setCompany] = useState("");
  const [branch, setBranch] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");

  const clients = data.clients || [];

  async function addClient() {
    if (!company.trim()) {
      alert("Please enter company name.");
      return;
    }

    const item = {
      id: `local_${Date.now()}`,
      user_id: userId,
      company: company.trim(),
      branch: branch.trim(),
      contact: contact.trim(),
      phone: phone.trim(),
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };

    setData((current) => ({
      ...current,
      clients: [
        item,
        ...(current.clients || []),
      ],
      syncQueue: [
        {
          id: `sync_${Date.now()}`,
          table: "clients",
          action: "insert",
          data: item,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        ...(current.syncQueue || []),
      ],
    }));

    setCompany("");
    setBranch("");
    setContact("");
    setPhone("");
  }

  const grouped = clients.reduce((acc, c) => {
    const key = c.company || "Unknown Company";

    if (!acc[key]) {
      acc[key] = [];
    }

    acc[key].push(c);

    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Companies & Branches
        </h1>

        <p className="text-sm text-slate-500">
          Group branches, mines, sites and divisions
          under the main company.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <Field
            label="Company"
            value={company}
            onChange={setCompany}
            placeholder="e.g. Anglo American"
          />

          <Field
            label="Branch / Mine / Site / Division"
            value={branch}
            onChange={setBranch}
            placeholder="e.g. Mogalakwena Mine"
          />

          <Field
            label="Contact Person"
            value={contact}
            onChange={setContact}
            placeholder="Contact name"
          />

          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="Phone number"
          />

          <Btn
            className="w-full"
            onClick={addClient}
          >
            <Plus size={18} />
            Add Client / Branch
          </Btn>
        </CC>
      </Card>

      {Object.keys(grouped).length === 0 && (
        <Empty
          title="No companies yet"
          text="Add your first company and branch."
        />
      )}
            <div className="space-y-4">
        {Object.entries(grouped).map(
          ([companyName, branches]) => (
            <Card
              key={companyName}
              className="rounded-3xl shadow-sm"
            >
              <CC className="p-4">
                <h2 className="text-lg font-black text-slate-900">
                  {companyName}
                </h2>

                <p className="text-xs text-slate-500">
                  {branches.length} branch/site
                  {branches.length !== 1 ? "s" : ""}
                </p>

                <div className="mt-3 space-y-2">
                  {branches.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-2xl bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-800">
                            {c.branch ||
                              c.division ||
                              "Main Branch"}
                          </p>

                          {c.contact && (
                            <p className="text-sm text-slate-500">
                              {c.contact}
                            </p>
                          )}

                          {c.phone && (
                            <p className="text-sm text-slate-400">
                              {c.phone}
                            </p>
                          )}
                        </div>

                        {c.sync_status === "pending" && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                            Not synced
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CC>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

// ─── Follow-ups ───────────────────────────────────────────────────────────────
function FollowupsScreen({
  data,
  setData,
  userId,
}) {
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [date, setDate] = useState(todayISO());

  const followups = data.followups || [];

  function addFollowup() {
    if (!title.trim()) {
      alert("Please enter follow-up title.");
      return;
    }

    const item = {
      id: `local_${Date.now()}`,
      user_id: userId,
      title: title.trim(),
      client: client.trim(),
      date,
      completed: false,
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };

    setData((current) => ({
      ...current,
      followups: [
        item,
        ...(current.followups || []),
      ],
      syncQueue: [
        {
          id: `sync_${Date.now()}`,
          table: "followups",
          action: "insert",
          data: item,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        ...(current.syncQueue || []),
      ],
    }));

    setTitle("");
    setClient("");
    setDate(todayISO());
  }

  function toggleDone(id) {
    setData((current) => ({
      ...current,
      followups: (current.followups || []).map((f) =>
        f.id === id
          ? {
              ...f,
              completed: !f.completed,
              sync_status: "pending",
            }
          : f
      ),
      syncQueue: [
        {
          id: `sync_${Date.now()}`,
          table: "followups",
          action: "update",
          data: {
            id,
            completed: !(
              (current.followups || []).find(
                (f) => f.id === id
              )?.completed
            ),
          },
          status: "pending",
          created_at: new Date().toISOString(),
        },
        ...(current.syncQueue || []),
      ],
    }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Follow-ups
        </h1>

        <p className="text-sm text-slate-500">
          Offline-ready reminders and sales tasks.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <Field
            label="Follow-up"
            value={title}
            onChange={setTitle}
            placeholder="e.g. Call mine buyer"
          />

          <Field
            label="Client"
            value={client}
            onChange={setClient}
            placeholder="Company / branch"
          />

          <Field
            label="Date"
            type="date"
            value={date}
            onChange={setDate}
          />

          <Btn
            className="w-full"
            onClick={addFollowup}
          >
            <Plus size={18} />
            Add Follow-up
          </Btn>
        </CC>
      </Card>

      {followups.length === 0 && (
        <Empty
          title="No follow-ups"
          text="Add your first follow-up."
        />
      )}

      <div className="space-y-3">
        {followups.map((f) => (
          <Card
            key={f.id}
            className="rounded-3xl shadow-sm"
          >
            <CC className="flex items-center gap-3 p-4">
              <button
                onClick={() => toggleDone(f.id)}
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  f.completed
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <Check size={18} />
              </button>

              <div className="flex-1">
                <p
                  className={`font-bold ${
                    f.completed
                      ? "text-slate-400 line-through"
                      : "text-slate-900"
                  }`}
                >
                  {f.title}
                </p>

                <p className="text-xs text-slate-500">
                  {f.client || "No client"} •{" "}
                  {smartDate(f.date)}
                </p>
              </div>

              {f.sync_status === "pending" && (
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                  Not synced
                </span>
              )}
            </CC>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Quotes ───────────────────────────────────────────────────────────────────
function QuotesScreen({
  data,
  setData,
  userId,
}) {
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");

  const quotes = data.quotes || [];

  function addQuote() {
    if (!description.trim()) {
      alert("Please enter quote description.");
      return;
    }

    const item = {
      id: `local_${Date.now()}`,
      user_id: userId,
      client_name: client.trim(),
      description: description.trim(),
      value: parseFloat(value || 0),
      status: "Pending",
      sent_date: todayISO(),
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };

    setData((current) => ({
      ...current,
      quotes: [
        item,
        ...(current.quotes || []),
      ],
      syncQueue: [
        {
          id: `sync_${Date.now()}`,
          table: "quotes",
          action: "insert",
          data: item,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        ...(current.syncQueue || []),
      ],
    }));

    setClient("");
    setDescription("");
    setValue("");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Quotes
        </h1>

        <p className="text-sm text-slate-500">
          Quote tracker with offline queue.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <Field
            label="Client"
            value={client}
            onChange={setClient}
            placeholder="Client / branch"
          />

          <Field
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What the quote covers"
            multiline
          />

          <Field
            label="Value"
            type="number"
            value={value}
            onChange={setValue}
            placeholder="0.00"
          />

          <Btn
            className="w-full"
            onClick={addQuote}
          >
            <Plus size={18} />
            Add Quote
          </Btn>
        </CC>
      </Card>

      {quotes.length === 0 && (
        <Empty
          title="No quotes"
          text="Add your first quote."
        />
      )}

      <div className="space-y-3">
        {quotes.map((q) => (
          <Card
            key={q.id}
            className="rounded-3xl shadow-sm"
          >
            <CC className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    {q.client_name || "Unknown client"}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {q.description}
                  </p>

                  <p
                    className="mt-2 text-lg font-black"
                    style={{
                      color: BRAND.primary,
                    }}
                  >
                    {formatCurrency(q.value)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                    {q.status}
                  </span>

                  {q.sync_status === "pending" && (
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">
                      Not synced
                    </span>
                  )}
                </div>
              </div>
            </CC>
          </Card>
        ))}
      </div>
    </div>
  );
}
// ─── Notes / Visit Reports ───────────────────────────────────────────────────
function NotesScreen({
  data,
  setData,
  userId,
}) {
  const [client, setClient] = useState("");
  const [note, setNote] = useState("");

  const notes = data.notes || [];

  function addNote() {
    if (!note.trim()) {
      alert("Please enter a note.");
      return;
    }

    const item = {
      id: `local_${Date.now()}`,
      user_id: userId,
      client: client.trim(),
      note: note.trim(),
      created_at: new Date().toISOString(),
      sync_status: "pending",
    };

    setData((current) => ({
      ...current,
      notes: [
        item,
        ...(current.notes || []),
      ],
      syncQueue: [
        {
          id: `sync_${Date.now()}`,
          table: "notes",
          action: "insert",
          data: item,
          status: "pending",
          created_at: new Date().toISOString(),
        },
        ...(current.syncQueue || []),
      ],
    }));

    setClient("");
    setNote("");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          Notes / Visit Reports
        </h1>

        <p className="text-sm text-slate-500">
          Offline-ready customer visit notes.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <Field
            label="Client / Branch"
            value={client}
            onChange={setClient}
            placeholder="Client name"
          />

          <Field
            label="Note"
            value={note}
            onChange={setNote}
            placeholder="Type your visit note..."
            multiline
          />

          <Btn
            className="w-full"
            onClick={addNote}
          >
            <Plus size={18} />
            Add Note
          </Btn>
        </CC>
      </Card>

      {notes.length === 0 && (
        <Empty
          title="No notes yet"
          text="Add your first visit note."
        />
      )}

      <div className="space-y-3">
        {notes.map((n) => (
          <Card
            key={n.id}
            className="rounded-3xl shadow-sm"
          >
            <CC className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">
                    {n.client || "General Note"}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {n.note}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    {n.created_at
                      ? new Date(n.created_at).toLocaleString()
                      : ""}
                  </p>
                </div>

                {n.sync_status === "pending" && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                    Not synced
                  </span>
                )}
              </div>
            </CC>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── More / Settings ─────────────────────────────────────────────────────────
function MoreScreen({
  data,
  onLogout,
}) {
  const pendingCount = (data.syncQueue || []).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">
          More
        </h1>

        <p className="text-sm text-slate-500">
          Settings, sync status and employee tools.
        </p>
      </div>

      <Card className="rounded-3xl shadow-sm">
        <CC className="space-y-3 p-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">
              Pending Sync Items
            </p>

            <p
              className="text-3xl font-black"
              style={{
                color: pendingCount > 0 ? "#b45309" : BRAND.primary,
              }}
            >
              {pendingCount}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Items saved offline will sync to Supabase in the next phase.
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-bold text-slate-900">
              Phase 1 Offline Foundation
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Online/offline detection, local pending status and CRM structure are active.
              Auto-sync will be added in the next step.
            </p>
          </div>

          <Btn
            variant="danger"
            className="w-full"
            onClick={onLogout}
          >
            <LogOut size={18} />
            Log out
          </Btn>
        </CC>
      </Card>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function PowerWorksApp() {
  const onlineStatus = useOnlineStatus();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("Home");

  const [data, setData] = useState({
    clients: [],
    followups: [],
    quotes: [],
    notes: [],
    syncQueue: [],
  });

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: sessionData } =
        await supabase.auth.getSession();

      if (mounted) {
        setSession(sessionData.session || null);
        setLoading(false);
      }
    }

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("powermate_phase1_data");

      if (saved) {
        const parsed = JSON.parse(saved);

        setData((current) => ({
          ...current,
          ...parsed,
        }));
      }
    } catch (e) {
      console.warn("Could not load local app data", e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        "powermate_phase1_data",
        JSON.stringify(data)
      );
    } catch (e) {
      console.warn("Could not save local app data", e);
    }
  }, [data]);

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  const pendingCount = (data.syncQueue || []).length;

  const flaggedQuotes =
    (data.quotes || []).filter(
      (q) => q.status === "Pending"
    ).length || 0;

  if (loading) {
    return <Spinner />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  let content = null;

  if (screen === "Home") {
    content = (
      <HomeScreen
        data={data}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "Clients") {
    content = (
      <ClientsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
      />
    );
  }

  if (screen === "Followups") {
    content = (
      <FollowupsScreen
        data={data}
        setData={setData}
        userId={session.user.id}
      />
    );
  }

  if (screen === "Quotes") {
    content = (
      <QuotesScreen
        data={data}
        setData={setData}
        userId={session.user.id}
      />
    );
  }

  if (screen === "Notes") {
    content = (
      <NotesScreen
        data={data}
        setData={setData}
        userId={session.user.id}
      />
    );
  }

  if (screen === "More") {
    content = (
      <MoreScreen
        data={data}
        onLogout={logout}
      />
    );
  }

  return (
    <ErrorBoundary>
      <div
        className="min-h-screen pb-24"
        style={{
          background: BRAND.light,
        }}
      >
        <main className="mx-auto max-w-2xl p-4">
          {content}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <div className="mx-auto grid max-w-2xl grid-cols-5 gap-1">
            <NavTab
              icon={Home}
              label="Home"
              active={screen === "Home"}
              onClick={() => setScreen("Home")}
            />

            <NavTab
              icon={Users}
              label="Clients"
              active={screen === "Clients"}
              onClick={() => setScreen("Clients")}
            />

            <NavTab
              icon={Calendar}
              label="Follow"
              active={screen === "Followups"}
              onClick={() => setScreen("Followups")}
            />

            <NavTab
              icon={FileIcon}
              label="Quotes"
              active={screen === "Quotes"}
              onClick={() => setScreen("Quotes")}
              badge={flaggedQuotes}
            />

            <NavTab
              icon={Settings}
              label="More"
              active={screen === "More"}
              onClick={() => setScreen("More")}
              badge={pendingCount}
            />
          </div>
        </nav>

        <SyncStatusBadge
          isOnline={onlineStatus}
          pendingCount={pendingCount}
        />
      </div>
    </ErrorBoundary>
  );
}
