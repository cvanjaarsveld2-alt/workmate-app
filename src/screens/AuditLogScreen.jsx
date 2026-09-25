// ─── Activity log ─────────────────────────────────────────────────────────────
// Who changed what, for the company's owner and admins. Entries are written by
// the database itself (supabase/migrations/*_audit_log.sql) and can't be edited.
import React, { useEffect, useMemo, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { Btn, Card, FilterPills, PageHeader } from "../components/ui";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

const TABLES = {
  clients: "Client",
  contacts: "Contact",
  quotes: "Quote",
  invoices: "Invoice",
  payments: "Payment",
  jobs: "Job",
  team_members: "Team",
  team_profiles: "Company details",
  products: "Product",
  time_entries: "Time entry",
};
const ACTION = { insert: "added", update: "changed", delete: "deleted" };
const short = v => {
  if (v === null || v === undefined || v === "") return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

export function AuditLogScreen({ teamId, teamMembers = [] }) {
  const online = useOnlineStatus();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const who = useMemo(() => new Map(teamMembers.map(m => [m.user_id, m.full_name || m.email])), [teamMembers]);

  async function load() {
    if (!online || !teamId) return setLoading(false);
    setLoading(true);
    const { data, error: e } = await supabase
      .from("audit_log")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (e) setError(e.message);
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [teamId, online]);

  const options = ["All", ...Object.values(TABLES)];
  const visible = rows.filter(r => filter === "All" || TABLES[r.table_name] === filter);

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <PageHeader title="Activity log" subtitle="Who added, changed or deleted what" />
        <Btn size="sm" variant="secondary" onClick={load}>
          <RefreshCw size={14} />
        </Btn>
      </div>
      <FilterPills options={options} value={filter} onChange={setFilter} />
      {!online && <p className="text-sm text-amber-700">The activity log needs an internet connection.</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <Card className="p-6 text-center text-slate-500">Loading…</Card>
      ) : visible.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          <History size={22} className="mx-auto mb-2 text-slate-300" />
          Nothing recorded yet.
        </Card>
      ) : (
        visible.map(r => (
          <Card key={r.id} className="p-3 stack-y-1">
            <p className="text-sm text-slate-800">
              <b>{who.get(r.user_id) || "System"}</b> {ACTION[r.action]} {TABLES[r.table_name]?.toLowerCase() || r.table_name}{" "}
              {r.label ? <b>{r.label}</b> : null}
            </p>
            <p className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString("en-ZA")}</p>
            {r.changes &&
              Object.entries(r.changes).map(([field, v]) => (
                <p key={field} className="text-xs text-slate-600 break-words">
                  <span className="font-bold">{field.replace(/_/g, " ")}</span>:{" "}
                  {v && typeof v === "object" && "from" in v ? `${short(v.from)} → ${short(v.to)}` : short(v)}
                </p>
              ))}
          </Card>
        ))
      )}
    </div>
  );
}
