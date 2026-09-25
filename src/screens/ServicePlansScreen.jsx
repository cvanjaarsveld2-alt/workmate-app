// ─── Service plans ────────────────────────────────────────────────────────────
// Planned maintenance: "service this client's machine every 3 months". The
// job for each service is made by itself (a set number of days before it's
// due), assigned and announced to the technician. The master account and
// admins manage plans; everyone else can see them.
import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { BottomSheet } from "../components/BottomSheet";
import { Btn, Card, ClientSelector, Field, FilterPills, PageHeader } from "../components/ui";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import {
  FREQUENCIES,
  annualValue,
  daysUntil,
  dueStatus,
  frequencyKey,
  frequencyLabel,
  planFromForm,
} from "../lib/servicePlans";

const rand = n => `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = d => new Date(String(d) + "T12:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const STATUS = {
  overdue: ["Overdue", "bg-red-100 text-red-700"],
  due: ["Job made", "bg-amber-100 text-amber-800"],
  later: ["Planned", "bg-emerald-50 text-emerald-700"],
  paused: ["Paused", "bg-slate-100 text-slate-500"],
};

export function ServicePlansScreen({ teamId, canManage = false, clients = [], equipment = [], teamMembers = [] }) {
  const online = useOnlineStatus();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("Active");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.company])), [clients]);
  const machineName = useMemo(
    () => new Map(equipment.map(e => [e.id, [e.name, e.make, e.model].filter(Boolean).join(" ")])),
    [equipment],
  );
  const people = useMemo(() => new Map(teamMembers.map(m => [m.user_id, m.full_name || m.email])), [teamMembers]);

  async function load() {
    if (!teamId) return;
    if (!online) {
      setLoading(false);
      return setError("Service plans need an internet connection.");
    }
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.from("service_plans").select("*").eq("team_id", teamId).order("next_due");
    if (e) setError(e.message);
    setPlans(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [teamId, online]);

  const visible = plans.filter(p =>
    filter === "Active" ? p.active !== false : filter === "Due" ? ["overdue", "due"].includes(dueStatus(p)) : p.active === false,
  );

  async function save(form) {
    const { row, error: problem } = planFromForm(form, teamId);
    if (problem) return problem;
    setBusy(true);
    const { error: e } = form.id
      ? await supabase.from("service_plans").update(row).eq("id", form.id)
      : await supabase.from("service_plans").insert(row);
    setBusy(false);
    if (e) return e.message;
    setEditing(null);
    setMessage(form.id ? "Plan saved." : "Plan added. Its jobs are made automatically before each service.");
    load();
    return "";
  }

  async function makeNow(plan) {
    setBusy(true);
    const { data, error: e } = await supabase.rpc("create_service_job_now", { p_plan_id: plan.id });
    setBusy(false);
    setEditing(null);
    if (e) return setMessage(e.message);
    setMessage(data ? "Job made. It's on the Jobs screen." : "The job for this service already exists.");
    load();
  }

  async function remove(plan) {
    if (!window.confirm(`Delete the plan "${plan.title}"? Jobs already made stay.`)) return;
    setBusy(true);
    const { error: e } = await supabase.from("service_plans").delete().eq("id", plan.id);
    setBusy(false);
    if (e) return setMessage(e.message);
    setEditing(null);
    load();
  }

  const active = plans.filter(p => p.active !== false);
  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <PageHeader title="Service plans" subtitle="Planned maintenance that books its own jobs" />
        </div>
        <Btn size="sm" variant="secondary" onClick={load} disabled={!online}>
          <RefreshCw size={14} />
        </Btn>
      </div>

      {canManage && (
        <Btn
          className="w-full"
          onClick={() =>
            setEditing({
              title: "",
              client_id: "",
              equipment_id: "",
              description: "",
              location: "",
              frequency: "3m",
              every_days: 30,
              next_due: iso(new Date(Date.now() + 30 * 86400000)),
              lead_days: 7,
              assigned_to_user_id: "",
              value: "",
              ends_on: "",
              active: true,
            })
          }
          disabled={!online}
        >
          <Plus size={16} /> New service plan
        </Btn>
      )}

      {active.length > 0 && (
        <Card className="p-4 grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-lg font-black text-slate-900">{active.length}</p>
            <p className="text-[11px] text-slate-500">Active plans</p>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900">{rand(annualValue(active))}</p>
            <p className="text-[11px] text-slate-500">Planned work per year (excl. VAT)</p>
          </div>
        </Card>
      )}

      <FilterPills options={["Active", "Due", "Paused"]} value={filter} onChange={setFilter} />
      {error && <p className="text-sm text-amber-700">{error}</p>}
      {message && <p className="text-sm text-slate-700">{message}</p>}

      {loading ? (
        <Card className="p-6 text-center text-slate-500">Loading…</Card>
      ) : visible.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          <CalendarClock size={22} className="mx-auto mb-2 text-slate-300" />
          {plans.length ? "Nothing here." : "No service plans yet. Add one for each client machine you service regularly."}
        </Card>
      ) : (
        visible.map(p => {
          const st = dueStatus(p);
          const d = daysUntil(p.next_due);
          return (
            <Card key={p.id} className="p-3" onClick={canManage ? () => setEditing(toForm(p)) : undefined}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.title}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[clientName.get(p.client_id), machineName.get(p.equipment_id)].filter(Boolean).join(" · ") || "No client"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {frequencyLabel(p)}
                    {p.assigned_to_user_id ? ` · ${people.get(p.assigned_to_user_id) || "Technician"}` : ""}
                    {Number(p.value) > 0 ? ` · ${rand(p.value)} a visit` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[st][1]}`}>{STATUS[st][0]}</span>
                  <p className="text-xs font-bold text-slate-700 mt-1">{fmtDate(p.next_due)}</p>
                  <p className="text-[11px] text-slate-500">{d === 0 ? "today" : d > 0 ? `in ${d} days` : `${-d} days ago`}</p>
                </div>
              </div>
            </Card>
          );
        })
      )}

      <PlanSheet
        form={editing}
        busy={busy}
        clients={clients}
        equipment={equipment}
        teamMembers={teamMembers}
        onClose={() => setEditing(null)}
        onSave={save}
        onMakeNow={makeNow}
        onDelete={remove}
      />
    </div>
  );
}

function toForm(p) {
  return {
    ...p,
    frequency: frequencyKey(p),
    every_days: p.every_days || 30,
    equipment_id: p.equipment_id || "",
    assigned_to_user_id: p.assigned_to_user_id || "",
    description: p.description || "",
    location: p.location || "",
    value: p.value ? String(p.value) : "",
    ends_on: p.ends_on || "",
  };
}

function PlanSheet({ form, busy, clients, equipment, teamMembers, onClose, onSave, onMakeNow, onDelete }) {
  const [f, setF] = useState(form);
  const [error, setError] = useState("");
  useEffect(() => {
    setF(form);
    setError("");
  }, [form]);
  if (!form || !f) return <BottomSheet open={false} onClose={onClose} />;
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  const machines = equipment.filter(e => !f.client_id || e.client_id === f.client_id);
  const input = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base min-h-[52px] mt-1";
  return (
    <BottomSheet open={!!form} onClose={onClose} title={f.id ? "Edit service plan" : "New service plan"} maxHeight="92vh">
      <div className="stack-y-3">
        <Field label="Name" value={f.title} onChange={set("title")} placeholder="e.g. Quarterly service – LH410" required maxLength={200} />
        <ClientSelector label="Client" value={f.client_id} onChange={v => setF(x => ({ ...x, client_id: v, equipment_id: "" }))} clients={clients} />
        <label className="block text-sm font-bold text-slate-500">
          Machine (optional)
          <select value={f.equipment_id} onChange={e => set("equipment_id")(e.target.value)} className={input}>
            <option value="">No specific machine</option>
            {machines.map(m => (
              <option key={m.id} value={m.id}>
                {[m.name, m.make, m.model, m.serial].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-slate-500">
          How often
          <select value={f.frequency} onChange={e => set("frequency")(e.target.value)} className={input}>
            {FREQUENCIES.map(x => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        {f.frequency === "days" && <Field label="Every how many days" type="number" value={String(f.every_days)} onChange={set("every_days")} />}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-bold text-slate-500">
            Next service
            <input type="date" value={f.next_due} onChange={e => set("next_due")(e.target.value)} className={input} />
          </label>
          <Field label="Make the job (days before)" type="number" value={String(f.lead_days)} onChange={set("lead_days")} />
        </div>
        <label className="block text-sm font-bold text-slate-500">
          Technician
          <select value={f.assigned_to_user_id} onChange={e => set("assigned_to_user_id")(e.target.value)} className={input}>
            <option value="">Not assigned</option>
            {teamMembers.map(m => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </label>
        <Field label="What to do" value={f.description} onChange={set("description")} multiline maxLength={4000} />
        <Field label="Site / location" value={f.location} onChange={set("location")} maxLength={300} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Price per visit (R, excl. VAT)" type="number" value={f.value} onChange={set("value")} />
          <label className="block text-sm font-bold text-slate-500">
            Contract ends (optional)
            <input type="date" value={f.ends_on} onChange={e => set("ends_on")(e.target.value)} className={input} />
          </label>
        </div>
        {f.id && (
          <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3 min-h-[52px]">
            <span className="text-sm font-bold text-slate-700">Active</span>
            <input type="checkbox" checked={f.active !== false} onChange={e => set("active")(e.target.checked)} className="h-5 w-5" />
          </label>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Btn className="w-full" disabled={busy} onClick={async () => setError(await onSave(f))}>
          {busy ? "Saving…" : "Save"}
        </Btn>
        {f.id && (
          <div className="grid grid-cols-2 gap-2">
            <Btn size="sm" variant="secondary" disabled={busy || f.active === false} onClick={() => onMakeNow(f)}>
              Make the job now
            </Btn>
            <Btn size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(f)}>
              Delete
            </Btn>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
