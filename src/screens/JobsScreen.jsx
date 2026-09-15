import React, { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { Card, Btn, PageHeader } from "../components/ui";
import { MapPin, Play, CheckCircle2, Clock, RefreshCw } from "lucide-react";

const STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];

export function JobsScreen({ userId, teamId }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    if (!userId) return;
    setLoading(true); setError("");
    const { data, error: e } = await supabase.from("jobs").select("*").order("scheduled_date", { ascending: true }).order("scheduled_time", { ascending: true });
    if (e) setError(e.message); else setJobs(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, teamId]);

  async function setStatus(job, status) {
    setSaving(job.id); setError("");
    const patch = { status };
    if (status === "in_progress" && !job.started_at) patch.started_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    const { data, error: e } = await supabase.from("jobs").update(patch).eq("id", job.id).select("*").single();
    if (e) setError(e.message); else setJobs(rows => rows.map(r => r.id === job.id ? data : r));
    setSaving(null);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Jobs" subtitle="Technician jobs & field work" />
      {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
      <div className="flex justify-end"><Btn size="sm" variant="secondary" onClick={load}><RefreshCw size={14}/> Refresh</Btn></div>
      {loading ? <Card className="p-6 text-center text-slate-400">Loading jobs…</Card> : jobs.length === 0 ? (
        <Card className="p-6 text-center"><p className="font-bold text-slate-700">No jobs yet</p><p className="text-sm text-slate-400 mt-1">Jobs created from accepted quotes will appear here.</p></Card>
      ) : jobs.map(job => (
        <Card key={job.id} className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0"><p className="font-black text-slate-900 truncate">{job.job_number || "Job"} · {job.title}</p><p className="text-sm text-slate-500">{job.description || "Field service"}</p></div>
            <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">{job.status.replace("_", " ")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Clock size={13}/>{job.scheduled_date || "Unscheduled"}{job.scheduled_time ? ` · ${job.scheduled_time}` : ""}</span>
            <span className="flex items-center gap-1 truncate"><MapPin size={13}/>{job.location || "No location"}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {job.location && <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}>Open route</a>}
            {job.status === "scheduled" && <Btn size="sm" onClick={() => setStatus(job, "in_progress")} disabled={saving === job.id}><Play size={13}/> Start job</Btn>}
            {job.status === "in_progress" && <Btn size="sm" onClick={() => setStatus(job, "completed")} disabled={saving === job.id}><CheckCircle2 size={13}/> Complete</Btn>}
          </div>
        </Card>
      ))}
    </div>
  );
}
