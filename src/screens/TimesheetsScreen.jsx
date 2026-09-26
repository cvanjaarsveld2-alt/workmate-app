// ─── Timesheets ───────────────────────────────────────────────────────────────
// Clock in and out (with or without a job), travel time, the week's hours per
// day, corrections, and a CSV for payroll. The master account and admins pick
// any teammate; everyone else sees their own time.
import React, { useEffect, useMemo, useState } from "react";
import { Car, ChevronLeft, ChevronRight, Download, Plus, Square, Timer } from "lucide-react";
import { offlineGetAll } from "../offline/offlineDb";
import { BottomSheet } from "../components/BottomSheet";
import { Btn, Card, Field, PageHeader } from "../components/ui";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useCompanyProfile } from "../lib/companyProfile";
import { genId } from "../lib/helpers";
import { useTimeEntries } from "../lib/useTimeEntries";
import {
  byDay,
  entryMinutes,
  fmtMinutes,
  hours,
  inRange,
  localDay,
  newEntry,
  timesheetCsv,
  totals,
  weekStart,
} from "../lib/timesheets";

const rand = n => `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hhmm = iso => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const dayLabel = key =>
  new Date(key + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "short" });
const at = (day, time) => new Date(`${day}T${time || "00:00"}:00`);

export function TimesheetsScreen({ userId, teamId, setData, teamMembers = [], isManager = false }) {
  const online = useOnlineStatus();
  const profile = useCompanyProfile(teamId);
  const time = useTimeEntries({ userId, teamId, online, setData });
  const [week, setWeek] = useState(() => weekStart());
  const [person, setPerson] = useState(userId);
  const [jobs, setJobs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    offlineGetAll("jobs")
      .then(rows => setJobs(rows || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!time.running) return;
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, [time.running]);

  const people = useMemo(() => {
    const m = new Map(teamMembers.map(t => [t.user_id, t.full_name || t.email || "Teammate"]));
    if (!m.has(userId)) m.set(userId, "Me");
    return m;
  }, [teamMembers, userId]);
  const jobNames = useMemo(() => new Map(jobs.map(j => [j.id, [j.job_number, j.title].filter(Boolean).join(" · ")])), [jobs]);
  const weekEnd = useMemo(() => {
    const e = new Date(week);
    e.setDate(e.getDate() + 7);
    return e;
  }, [week]);
  const mine = useMemo(
    () => time.entries.filter(e => (person === "all" ? true : e.user_id === person)),
    [time.entries, person],
  );
  const shown = useMemo(() => inRange(mine, week, weekEnd), [mine, week, weekEnd]);
  const t = totals(shown);
  const days = byDay(shown);
  const canEdit = e => e.user_id === userId || isManager;

  function shiftWeek(n) {
    const d = new Date(week);
    d.setDate(d.getDate() + 7 * n);
    setWeek(d);
  }

  function exportCsv() {
    const csv = timesheetCsv(shown, { people, jobs: jobNames });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${localDay(week.toISOString())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const running = time.running;
  const runningJob = running?.job_id ? jobNames.get(running.job_id) : "";

  return (
    <div className="stack-y-4">
      <PageHeader title="Timesheets" subtitle="Clock in and out, per job or for the day" />

      {running ? (
        <Card className="p-4 flex items-center gap-3">
          <Timer size={22} className="text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900">
              {running.kind === "travel" ? "Travelling" : "Clocked in"} · {fmtMinutes(entryMinutes(running))}
            </p>
            <p className="text-xs text-slate-500 truncate">
              Since {hhmm(running.started_at)}
              {runningJob ? ` · ${runningJob}` : ""}
            </p>
          </div>
          <Btn size="sm" variant="warning" onClick={() => time.clockOut()}>
            <Square size={13} /> {running.kind === "travel" ? "Stop" : "Clock out"}
          </Btn>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => time.clockIn()}>
            <Timer size={16} /> Clock in
          </Btn>
          <Btn variant="secondary" onClick={() => time.clockIn({ kind: "travel" })}>
            <Car size={16} /> Start travel
          </Btn>
        </div>
      )}
      {!online && <p className="text-sm text-amber-700">Offline: time is saved on this phone and syncs later.</p>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className="p-3 rounded-xl border border-slate-200 min-h-[48px]">
          <ChevronLeft size={16} />
        </button>
        <p className="flex-1 text-center text-sm font-bold text-slate-700">
          {week.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} –{" "}
          {new Date(weekEnd.getTime() - 86400000).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
        </p>
        <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className="p-3 rounded-xl border border-slate-200 min-h-[48px]">
          <ChevronRight size={16} />
        </button>
      </div>

      {isManager && people.size > 1 && (
        <select
          value={person}
          onChange={e => setPerson(e.target.value)}
          aria-label="Whose time"
          className="w-full rounded-xl border-2 border-slate-100 bg-white px-4 py-3 text-base min-h-[52px]"
        >
          {[...people].map(([id, name]) => (
            <option key={id} value={id}>
              {id === userId ? `${name} (me)` : name}
            </option>
          ))}
          <option value="all">Everyone</option>
        </select>
      )}

      <Card className="p-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-black text-slate-900">{fmtMinutes(t.work)}</p>
          <p className="text-[11px] text-slate-500">Work</p>
        </div>
        <div>
          <p className="text-lg font-black text-slate-900">{fmtMinutes(t.travel)}</p>
          <p className="text-[11px] text-slate-500">Travel</p>
        </div>
        <div>
          <p className="text-lg font-black text-slate-900">{fmtMinutes(t.billable)}</p>
          <p className="text-[11px] text-slate-500">Billable</p>
        </div>
        {isManager && (Number(profile.labour_rate) > 0 || Number(profile.labour_cost) > 0) && (
          <p className="col-span-3 text-xs text-slate-500 pt-1 border-t border-slate-100">
            {Number(profile.labour_rate) > 0 ? `Billable value ${rand(hours(t.billable) * profile.labour_rate)}` : ""}
            {Number(profile.labour_rate) > 0 && Number(profile.labour_cost) > 0 ? " · " : ""}
            {Number(profile.labour_cost) > 0 ? `Labour cost ${rand(hours(t.all) * profile.labour_cost)}` : ""}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Btn
          size="sm"
          variant="secondary"
          onClick={() =>
            setEditing({ ...newEntry({ id: genId(), userId, teamId, now: new Date() }), ended_at: new Date().toISOString(), _new: true })
          }
        >
          <Plus size={14} /> Add time
        </Btn>
        <Btn size="sm" variant="secondary" onClick={exportCsv} disabled={!shown.length}>
          <Download size={14} /> Export CSV
        </Btn>
      </div>

      {days.size === 0 ? (
        <Card className="p-6 text-center text-slate-500">No time recorded this week.</Card>
      ) : (
        [...days].map(([day, list]) => (
          <div key={day} className="stack-y-2">
            <div className="flex justify-between text-xs font-black text-slate-500 uppercase tracking-wider">
              <span>{dayLabel(day)}</span>
              <span>{fmtMinutes(totals(list).all)}</span>
            </div>
            {list.map(e => (
              <Card key={e.id} className="p-3" onClick={canEdit(e) ? () => setEditing({ ...e }) : undefined}>
                <div className="flex items-center gap-3">
                  {e.kind === "travel" ? <Car size={16} className="text-slate-400" /> : <Timer size={16} className="text-slate-400" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">
                      {hhmm(e.started_at)} – {e.ended_at ? hhmm(e.ended_at) : "now"}
                      {person === "all" ? ` · ${people.get(e.user_id) || "Teammate"}` : ""}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {[e.kind === "travel" ? "Travel" : "Work", jobNames.get(e.job_id), e.note].filter(Boolean).join(" · ")}
                      {e.sync_status === "pending" ? " · waiting to sync" : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black text-slate-700">{fmtMinutes(entryMinutes(e))}</span>
                </div>
              </Card>
            ))}
          </div>
        ))
      )}

      <EntrySheet
        entry={editing}
        jobs={jobs}
        onClose={() => setEditing(null)}
        onSave={async e => {
          const { _new, ...clean } = e;
          await time.save({ ...clean, updated_at: new Date().toISOString() }, _new ? "insert" : "update");
          setEditing(null);
        }}
        onDelete={async e => {
          if (!window.confirm("Delete this time entry?")) return;
          await time.remove(e);
          setEditing(null);
        }}
      />
    </div>
  );
}

function EntrySheet({ entry, jobs, onClose, onSave, onDelete }) {
  const [f, setF] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!entry) return setF(null);
    setF({
      day: localDay(entry.started_at),
      start: hhmm(entry.started_at),
      end: entry.ended_at ? hhmm(entry.ended_at) : "",
      kind: entry.kind || "work",
      job_id: entry.job_id || "",
      billable: entry.billable !== false,
      note: entry.note || "",
    });
  }, [entry]);
  if (!entry || !f) return <BottomSheet open={false} onClose={onClose} />;
  const set = k => v => setF(x => ({ ...x, [k]: v }));

  function submit() {
    const start = at(f.day, f.start);
    let end = f.end ? at(f.day, f.end) : null;
    if (Number.isNaN(start.getTime())) return setError("Enter a start time.");
    if (end && end <= start) end = new Date(end.getTime() + 86400000); // past midnight
    if (end && end - start > 86400000) return setError("An entry can't be longer than 24 hours.");
    if (!end && entry.ended_at) return setError("Enter an end time.");
    const job = jobs.find(j => j.id === f.job_id);
    onSave({
      ...entry,
      started_at: start.toISOString(),
      ended_at: end ? end.toISOString() : null,
      kind: f.kind,
      job_id: f.job_id || null,
      client_id: job?.client_id || entry.client_id || null,
      billable: f.kind === "work" && f.billable,
      note: f.note.trim() || null,
    });
  }

  const input = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base min-h-[52px]";
  return (
    <BottomSheet open={!!entry} onClose={onClose} title={entry._new ? "Add time" : "Edit time"} maxHeight="92vh">
      <div className="stack-y-3">
        <label className="block text-sm font-bold text-slate-500">
          Date
          <input type="date" value={f.day} onChange={e => set("day")(e.target.value)} className={input + " mt-1"} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-bold text-slate-500">
            Start
            <input type="time" value={f.start} onChange={e => set("start")(e.target.value)} className={input + " mt-1"} />
          </label>
          <label className="block text-sm font-bold text-slate-500">
            End
            <input type="time" value={f.end} onChange={e => set("end")(e.target.value)} className={input + " mt-1"} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["work", "Work"],
            ["travel", "Travel"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => set("kind")(k)}
              className={`rounded-xl py-3 font-bold min-h-[48px] ${f.kind === k ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block text-sm font-bold text-slate-500">
          Job
          <select value={f.job_id} onChange={e => set("job_id")(e.target.value)} className={input + " mt-1"}>
            <option value="">No job</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>
                {[j.job_number, j.title].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        {f.kind === "work" && (
          <label className="flex items-center justify-between rounded-xl bg-slate-50 p-3 min-h-[52px]">
            <span className="text-sm font-bold text-slate-700">Billable to the customer</span>
            <input type="checkbox" checked={f.billable} onChange={e => set("billable")(e.target.checked)} className="h-5 w-5" />
          </label>
        )}
        <Field label="Note" value={f.note} onChange={set("note")} maxLength={500} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Btn className="w-full" onClick={submit}>
          Save
        </Btn>
        {!entry._new && (
          <Btn className="w-full" variant="ghost" size="sm" onClick={() => onDelete(entry)}>
            Delete
          </Btn>
        )}
      </div>
    </BottomSheet>
  );
}
