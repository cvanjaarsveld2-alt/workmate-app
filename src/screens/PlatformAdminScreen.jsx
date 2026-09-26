// ─── Platform console (product owner only) ────────────────────────────────────
// Companies using the product (usage, plan, trial, suspend), the price list
// and what each plan includes, the PayFast account companies pay into, who
// may sign up, and the support inbox. Everything goes through admin-only database
// functions; nobody else can call them.
import React, { useEffect, useState } from "react";
import { Building2, CreditCard, KeyRound, LayoutDashboard, LifeBuoy, RefreshCw, Tags } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, Field, PageHeader, Toast } from "../components/ui";
import { FEATURES, PAID_PLANS } from "../lib/plan";
import { GROUPS, companyGroup, platformSummary } from "../lib/platformDashboard";

const PLANS = ["trial", "starter", "pro", "enterprise", "free"];
const STATUSES = ["active", "past_due", "suspended", "cancelled"];
const ACCESS_STYLE = {
  full: "bg-green-50 text-green-800",
  read_only: "bg-amber-50 text-amber-900",
  suspended: "bg-red-50 text-red-800",
};
const fmt = d => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—");
const newCode = () => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return "TRIAL-" + Array.from(b, x => a[x % 32]).join("");
};

function Select({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
      <select value={value || ""} onChange={e => onChange(e.target.value)} className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-base min-h-[48px]">
        {options.map(o => (
          <option key={o} value={o}>
            {o.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}

const addMonths = (from, n) => {
  const d = new Date(Math.max(Date.now(), from ? new Date(from).getTime() : 0));
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
const daysUntil = d => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);
const PLAN_LABEL = { trial: "Trial", free: "Full access (free)", starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

function CompanyCard({ c, onSave, onDelete, catalogue }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ plan: c.plan, status: c.status, paid_until: c.paid_until || "", seats: c.seats ?? "", notes: c.notes || "" });
  const set = k => v => setEdit(e => ({ ...e, [k]: v }));
  const trialLeft = c.plan === "trial" ? daysUntil(c.trial_ends_at) : null;
  const planName = catalogue?.[c.plan]?.name || PLAN_LABEL[c.plan] || c.plan || "Trial";
  function fullAccess() {
    if (window.confirm(`Give ${c.name} full access to everything, with no end date and no payments?`))
      onSave(c.id, { plan: "free", status: "active", trial_ends_at: null, paid_until: null });
  }
  return (
    <Card className="p-4 stack-y-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full text-left">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-black text-slate-900 truncate">{c.name}</p>
            <p className="text-xs text-slate-500 truncate">{c.owner_email || "no owner"} · since {fmt(c.created_at)}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${ACCESS_STYLE[c.access] || ""}`}>
            {planName}
            {c.access !== "full" ? ` · ${String(c.access).replace("_", " ")}` : ""}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {c.members}
          {c.seat_limit ? ` of ${c.seat_limit}` : ""} users · {c.clients} clients · {c.quotes} quotes · {c.jobs ?? 0} jobs · {c.invoices} invoices · last active{" "}
          {fmt(c.last_active)}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          {trialLeft !== null && `Trial: ${trialLeft > 0 ? `${trialLeft} day${trialLeft === 1 ? "" : "s"} left` : "ended"} · `}
          {c.paid_until && `Paid until ${fmt(c.paid_until)} · `}
          {c.billing_status === "active" && "Pays monthly by PayFast · "}
          {c.billing_status === "cancelled" && "PayFast cancelled · "}
          {Number(c.paid_total) > 0 && `R ${Number(c.paid_total).toLocaleString("en-ZA")} paid so far`}
        </p>
        {c.deletion_requested_at && (
          <p className="mt-1 text-xs font-bold text-red-700">Asked for its data to be deleted on {fmt(c.deletion_requested_at)}</p>
        )}
        {c.notes && !open && <p className="mt-1 text-xs text-slate-500 italic truncate">{c.notes}</p>}
      </button>
      {open && (
        <div className="stack-y-2 pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500">QUICK ACTIONS</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn size="sm" onClick={fullAccess} disabled={c.plan === "free" && c.status === "active"}>
              Give full access
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => onSave(c.id, { status: "active", paid_until: addMonths(c.paid_until, 1), plan: c.plan === "trial" || !c.plan ? "pro" : c.plan })}>
              +1 month paid
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => onSave(c.id, { trial_ends_at: new Date(Math.max(Date.now(), new Date(c.trial_ends_at || 0).getTime()) + 14 * 86400000).toISOString(), plan: "trial", status: "active" })}>
              +14 days trial
            </Btn>
            <Btn size="sm" variant={c.status === "suspended" ? "secondary" : "danger"} onClick={() => onSave(c.id, { status: c.status === "suspended" ? "active" : "suspended" })}>
              {c.status === "suspended" ? "Reactivate" : "Suspend"}
            </Btn>
          </div>
          <p className="text-xs font-bold text-slate-500 pt-2">OR SET IT EXACTLY</p>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Plan" value={edit.plan} options={PLANS} onChange={set("plan")} />
            <Select label="Status" value={edit.status} options={STATUSES} onChange={set("status")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Paid until" type="date" value={edit.paid_until} onChange={set("paid_until")} />
            <Field label="Users (empty = plan's)" type="number" value={edit.seats} onChange={v => set("seats")(v.replace(/\D/g, "").slice(0, 5))} />
          </div>
          <Field label="Notes (only you see these)" value={edit.notes} onChange={set("notes")} multiline maxLength={2000} />
          <Btn size="sm" onClick={() => onSave(c.id, { ...edit, paid_until: edit.paid_until || null, seats: edit.seats === "" ? null : Number(edit.seats) })}>
            Save
          </Btn>
          {c.deletion_requested_at && (
            <Btn size="sm" variant="danger" onClick={() => onDelete(c)}>
              Delete this company's data
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

function Tile({ label, value, onClick, tone = "text-slate-900" }) {
  return (
    <button type="button" onClick={onClick} className="rounded-2xl bg-white border border-slate-100 p-3 text-left min-h-[72px]">
      <p className={`text-2xl font-black ${tone}`}>{value}</p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
    </button>
  );
}

function Overview({ companies, catalogue, openTickets, onFilter, onOpenCompany, onSupport }) {
  const s = platformSummary(companies, catalogue);
  return (
    <div className="stack-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Monthly income (paying plans)" value={`R ${s.monthly.toLocaleString("en-ZA")}`} tone="text-green-700" onClick={() => onFilter("paying")} />
        <Tile label="Companies" value={s.total} onClick={() => onFilter("all")} />
        <Tile label="Paying" value={s.paying} onClick={() => onFilter("paying")} />
        <Tile label="On trial" value={s.trial} onClick={() => onFilter("trial")} />
        <Tile label="Full access (free)" value={s.free} onClick={() => onFilter("free")} />
        <Tile label="Read-only" value={s.readOnly} tone={s.readOnly ? "text-amber-700" : "text-slate-900"} onClick={() => onFilter("read_only")} />
        <Tile label="Suspended" value={s.suspended} tone={s.suspended ? "text-red-700" : "text-slate-900"} onClick={() => onFilter("suspended")} />
        <Tile label="Users in all companies" value={s.users} onClick={() => onFilter("all")} />
      </div>
      <p className="text-xs text-slate-500 px-1">
        {s.newThisMonth} new in the last 30 days · {s.activeThisWeek} used the app this week
      </p>
      <Card className="p-4 stack-y-2">
        <p className="text-base font-black text-slate-800">Needs you</p>
        {openTickets > 0 && (
          <button type="button" onClick={onSupport} className="w-full text-left text-sm min-h-[44px] flex justify-between gap-2 items-center">
            <span className="font-bold text-slate-800">Support inbox</span>
            <span className="text-slate-600">{openTickets} open message{openTickets === 1 ? "" : "s"}</span>
          </button>
        )}
        {s.attention.map(({ c, why }, i) => (
          <button key={c.id + i} type="button" onClick={() => onOpenCompany(c)} className="w-full text-left text-sm min-h-[44px] flex justify-between gap-2 items-center border-t border-slate-100">
            <span className="font-bold text-slate-800 truncate">{c.name}</span>
            <span className="text-slate-600 text-right">{why}</span>
          </button>
        ))}
        {!openTickets && s.attention.length === 0 && <p className="text-sm text-slate-500">Nothing right now.</p>}
      </Card>
    </div>
  );
}

function CompanyList({ companies, catalogue, filter, setFilter, search, setSearch, onSave, onDelete }) {
  const [sort, setSort] = useState("newest");
  const q = search.trim().toLowerCase();
  const list = companies
    .filter(c => filter === "all" || companyGroup(c) === filter)
    .filter(c => !q || `${c.name} ${c.owner_email || ""} ${c.notes || ""}`.toLowerCase().includes(q))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "active"
          ? new Date(b.last_active || 0) - new Date(a.last_active || 0)
          : sort === "users"
            ? b.members - a.members
            : new Date(b.created_at) - new Date(a.created_at),
    );
  return (
    <div className="stack-y-3">
      <Field label="Search company, email or notes" value={search} onChange={setSearch} />
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GROUPS.map(([key, label]) => {
          const n = key === "all" ? companies.length : companies.filter(c => companyGroup(c) === key).length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold min-h-[36px] ${filter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {label} ({n})
            </button>
          );
        })}
      </div>
      <Select label="Sort" value={sort} options={["newest", "active", "name", "users"]} onChange={setSort} />
      {list.length === 0 && <Card className="p-6 text-center text-slate-500">No companies match.</Card>}
      {list.map(c => (
        <CompanyCard key={`${c.id}:${c.plan}:${c.status}:${c.paid_until}:${c.seats}:${c.notes}`} c={c} catalogue={catalogue} onSave={onSave} onDelete={onDelete} />
      ))}
    </div>
  );
}

// The price list: name, monthly price, users and features per paid plan.
function PlansEditor({ onToast }) {
  const [plans, setPlans] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    supabase.rpc("plan_catalogue").then(({ data }) => setPlans(data || {}), () => setPlans({}));
  }, []);
  if (!plans) return null;
  const set = (key, k, v) => setPlans(p => ({ ...p, [key]: { ...p[key], [k]: v } }));
  const toggle = (key, f) => {
    const has = (plans[key].features || []).includes(f);
    set(key, "features", has ? plans[key].features.filter(x => x !== f) : [...(plans[key].features || []), f]);
  };
  async function save() {
    setSaving(true);
    const clean = Object.fromEntries(
      PAID_PLANS.filter(k => plans[k]).map(k => [
        k,
        { ...plans[k], price: Number(plans[k].price), seats: plans[k].seats === "" || plans[k].seats == null ? null : Number(plans[k].seats) },
      ]),
    );
    const { error } = await supabase.rpc("admin_set_plans", { p_plans: clean });
    setSaving(false);
    onToast(error ? error.message : "Prices saved. New subscriptions use them; existing ones keep their price.");
  }
  return (
    <div className="stack-y-3">
      <p className="text-xs text-slate-500 px-1">
        Trial and Free include everything. A company's own user limit (Companies tab) overrides its plan's. Existing PayFast subscriptions keep the
        price they started on.
      </p>
      {PAID_PLANS.filter(k => plans[k]).map(key => (
        <Card key={key} className="p-4 stack-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Name" value={plans[key].name} onChange={v => set(key, "name", v)} maxLength={40} />
            <Field label="R / month" type="number" value={plans[key].price} onChange={v => set(key, "price", v)} />
            <Field label="Users (empty = no limit)" type="number" value={plans[key].seats ?? ""} onChange={v => set(key, "seats", v.replace(/\D/g, "").slice(0, 5))} />
          </div>
          {Object.entries(FEATURES).map(([f, x]) => (
            <label key={f} className="flex items-center gap-3 min-h-[40px] cursor-pointer">
              <input type="checkbox" checked={(plans[key].features || []).includes(f)} onChange={() => toggle(key, f)} className="h-5 w-5" />
              <span className="text-sm text-slate-700">{x.label}</span>
            </label>
          ))}
        </Card>
      ))}
      <Btn onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save prices and plans"}
      </Btn>
    </div>
  );
}

// The PayFast account companies pay their subscriptions into.
function BillingSettings({ onToast }) {
  const [b, setB] = useState(null);
  const [form, setForm] = useState({ merchant_id: "", merchant_key: "", passphrase: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    supabase.rpc("admin_get_billing").then(({ data }) => {
      setB(data || {});
      setForm(f => ({ ...f, merchant_id: data?.merchant_id || "" }));
    });
  }, []);
  if (!b) return null;
  async function save(patch = {}) {
    setSaving(true);
    const next = { sandbox: b.sandbox, enabled: b.enabled, ...patch };
    const { data, error } = await supabase.rpc("admin_set_billing", {
      p_merchant_id: form.merchant_id,
      p_merchant_key: form.merchant_key,
      p_passphrase: form.passphrase,
      p_sandbox: next.sandbox,
      p_enabled: next.enabled,
    });
    setSaving(false);
    if (error) return onToast(error.message);
    setB(data);
    setForm(f => ({ ...f, merchant_key: "", passphrase: "" }));
    onToast("Saved");
  }
  return (
    <Card className="p-4 stack-y-3">
      <p className="text-base font-black text-slate-800">Your PayFast account</p>
      <p className="text-xs text-slate-500">
        Companies pay their plan monthly into this account (card or debit order). Find these in PayFast under Settings → Integration. Subscriptions need
        a passphrase set there, and "Recurring billing" switched on for your account.
      </p>
      <Field label="Merchant ID" value={form.merchant_id} onChange={v => setForm(f => ({ ...f, merchant_id: v.trim() }))} maxLength={12} />
      <Field
        label={b.has_key ? "Merchant key (saved; type to replace)" : "Merchant key"}
        value={form.merchant_key}
        onChange={v => setForm(f => ({ ...f, merchant_key: v.trim() }))}
        maxLength={40}
      />
      <Field
        label={b.has_passphrase ? "Passphrase (saved; type to replace)" : "Passphrase"}
        type="password"
        value={form.passphrase}
        onChange={v => setForm(f => ({ ...f, passphrase: v }))}
        maxLength={100}
      />
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input type="checkbox" checked={!!b.sandbox} onChange={e => save({ sandbox: e.target.checked })} className="h-5 w-5" />
        <span className="text-sm text-slate-700">Test mode (PayFast sandbox; no real money)</span>
      </label>
      <Btn size="sm" variant="secondary" onClick={() => save()} disabled={saving}>
        Save details
      </Btn>
      <Btn size="sm" variant={b.enabled ? "danger" : "solid"} onClick={() => save({ enabled: !b.enabled })} disabled={saving}>
        {b.enabled ? "Switch paying in the app off" : "Switch paying in the app on"}
      </Btn>
      <p className="text-xs text-slate-500">
        {b.enabled
          ? `On${b.sandbox ? " (test mode)" : ""}: master accounts can choose and pay for a plan in Plan & billing.`
          : "Off: Plan & billing shows the prices and a \"contact us\" button instead."}
      </p>
    </Card>
  );
}

export function PlatformAdminScreen() {
  const [tab, setTab] = useState("overview");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [catalogue, setCatalogue] = useState({});
  const [companies, setCompanies] = useState([]);
  const [settings, setSettings] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [replies, setReplies] = useState({});
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [c, s, t, p] = await Promise.all([
      supabase.rpc("admin_list_companies"),
      supabase.rpc("get_platform_settings"),
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.rpc("plan_catalogue"),
    ]);
    setCatalogue(p.data || {});
    if (c.error) setError(c.error.message);
    setCompanies(c.data || []);
    setSettings(s.data || null);
    setTickets(t.data || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function savePlan(teamId, patch) {
    const { error: e } = await supabase.rpc("admin_update_plan", { p_team_id: teamId, p_patch: patch });
    if (e) return setToast(e.message);
    setToast("Saved");
    load();
  }
  async function deleteCompany(c) {
    const typed = window.prompt(`This permanently deletes every record of ${c.name}. Type the company name to confirm:`);
    if (typed === null) return;
    const { data, error: e } = await supabase.rpc("admin_delete_company", { p_team_id: c.id, p_confirm_name: typed });
    if (e) return setToast(e.message);
    setToast(`Deleted ${data?.records_deleted ?? 0} records. Remove its files in Storage next.`);
    load();
  }
  async function saveSetting(key, value) {
    const { error: e } = await supabase.rpc("set_platform_setting", { p_key: key, p_value: value });
    if (e) return setToast(e.message);
    setToast("Saved");
    load();
  }
  async function answer(t, status) {
    const { error: e } = await supabase.rpc("admin_answer_ticket", { p_id: t.id, p_status: status, p_reply: replies[t.id] || "" });
    if (e) return setToast(e.message);
    setToast(status === "answered" ? "Reply sent" : "Updated");
    load();
  }

  const openTickets = tickets.filter(t => t.status === "open").length;
  const tabs = [
    ["overview", LayoutDashboard, "Overview"],
    ["companies", Building2, `Companies (${companies.length})`],
    ["plans", Tags, "Plans"],
    ["billing", CreditCard, "Billing"],
    ["signup", KeyRound, "Sign-up"],
    ["support", LifeBuoy, `Support${openTickets ? ` (${openTickets})` : ""}`],
  ];

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <PageHeader title="Platform" subtitle="Companies, plans, billing, sign-up and support — only you see this" />
        <Btn size="sm" variant="secondary" onClick={load}>
          <RefreshCw size={14} />
        </Btn>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-1 min-h-[44px] ${tab === key ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

      {tab === "overview" && (
        <Overview
          companies={companies}
          catalogue={catalogue}
          openTickets={openTickets}
          onFilter={g => {
            setFilter(g);
            setSearch("");
            setTab("companies");
          }}
          onOpenCompany={c => {
            setFilter("all");
            setSearch(c.name);
            setTab("companies");
          }}
          onSupport={() => setTab("support")}
        />
      )}
      {tab === "companies" && (
        <CompanyList
          companies={companies}
          catalogue={catalogue}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          onSave={savePlan}
          onDelete={deleteCompany}
        />
      )}

      {tab === "plans" && <PlansEditor onToast={setToast} />}
      {tab === "billing" && <BillingSettings onToast={setToast} />}

      {tab === "signup" && settings && (
        <Card className="p-4 stack-y-3">
          <p className="text-base font-black text-slate-800">Who can sign up</p>
          {["restricted", "open"].map(m => (
            <label key={m} className="flex items-start gap-3 cursor-pointer">
              <input type="radio" name="signup_mode" checked={settings.signup_mode === m} onChange={() => saveSetting("signup_mode", m)} className="mt-1 h-5 w-5" />
              <span>
                <span className="block font-bold text-slate-800">{m === "open" ? "Open" : "Restricted"}</span>
                <span className="block text-xs text-slate-500">
                  {m === "open" ? "Anyone can create an account and start a trial." : "Only allowed email domains, a company's invite code, or a sign-up code below."}
                </span>
              </span>
            </label>
          ))}
          <Field
            label="Allowed email domains (comma separated)"
            value={(settings.allowed_domains || []).join(", ")}
            onChange={v => setSettings(s => ({ ...s, allowed_domains: v.split(",").map(x => x.trim().toLowerCase()).filter(Boolean) }))}
          />
          <Btn size="sm" variant="secondary" onClick={() => saveSetting("allowed_domains", settings.allowed_domains || [])}>
            Save domains
          </Btn>
          <p className="text-sm font-bold text-slate-700 pt-2">Sign-up codes for new companies</p>
          {(settings.signup_codes || []).map(code => (
            <div key={code} className="flex items-center gap-2">
              <span className="flex-1 font-mono text-sm">{code}</span>
              <button type="button" className="text-xs font-bold text-red-700 min-h-[36px]" onClick={() => saveSetting("signup_codes", settings.signup_codes.filter(c => c !== code))}>
                Remove
              </button>
            </div>
          ))}
          <Btn size="sm" onClick={() => saveSetting("signup_codes", [...(settings.signup_codes || []), newCode()])}>
            Create a sign-up code
          </Btn>
        </Card>
      )}

      {tab === "support" &&
        (tickets.length === 0 ? (
          <Card className="p-6 text-center text-slate-500">No messages yet.</Card>
        ) : (
          tickets.map(t => (
            <Card key={t.id} className="p-4 stack-y-2">
              <div className="flex justify-between gap-2">
                <p className="font-black text-slate-900">{t.subject}</p>
                <span className="text-xs font-bold text-slate-500">{t.status}</span>
              </div>
              <p className="text-xs text-slate-500">
                {t.email} · {new Date(t.created_at).toLocaleString("en-ZA")} {t.screen ? `· on ${t.screen}` : ""}
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{t.message}</p>
              {t.admin_reply && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-900 whitespace-pre-line">{t.admin_reply}</p>}
              <Field label="Reply" value={replies[t.id] || ""} onChange={v => setReplies(r => ({ ...r, [t.id]: v }))} multiline maxLength={5000} />
              <div className="grid grid-cols-2 gap-2">
                <Btn size="sm" onClick={() => answer(t, "answered")} disabled={!(replies[t.id] || "").trim()}>
                  Send reply
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => answer(t, "closed")}>
                  Close
                </Btn>
              </div>
            </Card>
          ))
        ))}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
