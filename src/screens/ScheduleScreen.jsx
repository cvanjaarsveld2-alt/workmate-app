// ─── Schedule & dispatch ──────────────────────────────────────────────────────
// Who's doing what, when: a day with a lane per technician, a week grid, and
// jobs still waiting for a date. The master account and admins book and
// reassign jobs; technicians see the board and send "on my way" to the
// customer. Changes save through the sync queue, so they work offline.
import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { supabase } from "../supabase";
import { offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync } from "../lib/sync";
import { BottomSheet } from "../components/BottomSheet";
import { Btn, Card, Field, FilterPills, PageHeader } from "../components/ui";
import { formatPhone } from "../components/WhatsAppButton";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { companyName } from "../lib/companyProfile";
import { myName } from "../lib/me";
import {
  addDays,
  assignment,
  dayKey,
  isOpen,
  lanes,
  mondayOf,
  onMyWayMessage,
  overdue,
  unscheduled,
  weekDays,
  weekGrid,
} from "../lib/schedule";

const dayTitle = key => new Date(key + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
const short = key => new Date(key + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "short", day: "numeric" });
const hhmm = t => (t ? String(t).slice(0, 5) : "");

export function ScheduleScreen({ userId, teamId, setData, clients = [], teamMembers = [], canManage = false }) {
  const online = useOnlineStatus();
  const [jobs, setJobs] = useState([]);
  const [view, setView] = useState("Day");
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [open, setOpen] = useState(null);
  const [message, setMessage] = useState("");
  const today = dayKey(new Date());

  const members = useMemo(() => {
    const list = teamMembers.filter(m => m.user_id);
    return list.length ? list : [{ user_id: userId, full_name: myName() || "Me" }];
  }, [teamMembers, userId]);
  const client = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  async function load() {
    const local = await offlineGetAll("jobs").catch(() => []);
    setJobs(local || []);
    if (!online) return;
    const { data, error } = await supabase.from("jobs").select("*").order("scheduled_date").limit(3000);
    if (error) return;
    setJobs(data || []);
    await Promise.all((data || []).map(x => offlineSave("jobs", x).catch(() => {})));
  }
  useEffect(() => {
    load();
  }, [online, teamId]);

  async function save(updated) {
    setJobs(list => list.map(j => (j.id === updated.id ? { ...updated, sync_status: "pending" } : j)));
    const saved = await saveAndSync({ ...updated, sync_status: "pending" }, "jobs", "update", setData || (() => {}), online);
    if (saved) setJobs(list => list.map(j => (j.id === updated.id ? saved : j)));
  }

  const waiting = unscheduled(jobs);
  const late = overdue(jobs, today);
  const dayLanes = lanes(jobs, members, day);
  const monday = mondayOf(day);
  const grid = view === "Week" ? weekGrid(jobs, members, monday) : [];
  const days = weekDays(monday);

  const chip = job => {
    const c = client.get(job.client_id);
    return (
      <button
        key={job.id}
        type="button"
        onClick={() => setOpen(job)}
        className={`w-full text-left rounded-xl border p-2.5 min-h-[52px] ${job.status === "completed" ? "border-emerald-100 bg-emerald-50" : job.status === "in_progress" ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-white"}`}
      >
        <p className="text-xs font-bold text-slate-500">
          {hhmm(job.scheduled_time) || "Any time"} · {job.job_number || "Job"}
          {job.sync_status === "pending" ? " · saving" : ""}
        </p>
        <p className="text-sm font-bold text-slate-800 truncate">{job.title || "Job"}</p>
        {(c?.company || job.location) && <p className="text-xs text-slate-500 truncate">{[c?.company, job.location].filter(Boolean).join(" · ")}</p>}
      </button>
    );
  };

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <PageHeader title="Schedule" subtitle={canManage ? "Book and dispatch jobs" : "Who's doing what, when"} />
        </div>
        <Btn size="sm" variant="secondary" onClick={load} disabled={!online}>
          <RefreshCw size={14} />
        </Btn>
      </div>
      <FilterPills options={["Day", "Week"]} value={view} onChange={setView} />
      <div className="flex items-center gap-2">
        <button type="button" aria-label="Back" onClick={() => setDay(addDays(day, view === "Week" ? -7 : -1))} className="p-3 rounded-xl border border-slate-200 min-h-[48px]">
          <ChevronLeft size={16} />
        </button>
        <button type="button" onClick={() => setDay(today)} className="flex-1 text-center text-sm font-bold text-slate-700 min-h-[48px]">
          {view === "Week" ? `Week of ${new Date(monday + "T12:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : dayTitle(day)}
          {day !== today && <span className="block text-[11px] font-normal text-slate-400">Tap for today</span>}
        </button>
        <button type="button" aria-label="Forward" onClick={() => setDay(addDays(day, view === "Week" ? 7 : 1))} className="p-3 rounded-xl border border-slate-200 min-h-[48px]">
          <ChevronRight size={16} />
        </button>
      </div>
      {message && <p className="text-sm text-slate-700">{message}</p>}

      {view === "Day" ? (
        dayLanes
          .filter(l => l.user_id || l.jobs.length)
          .map(l => (
            <div key={l.user_id || "none"} className="stack-y-2">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider flex justify-between">
                <span>{l.user_id === userId ? `${l.name} (me)` : l.name}</span>
                <span>{l.jobs.length ? `${l.jobs.length} job${l.jobs.length > 1 ? "s" : ""}` : "Free"}</span>
              </p>
              {l.jobs.map(chip)}
            </div>
          ))
      ) : (
        <Card className="p-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left p-1 font-bold text-slate-500">Technician</th>
                {days.map(d => (
                  <th key={d} className={`p-1 font-bold ${d === today ? "text-red-700" : "text-slate-500"}`}>
                    {short(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid
                .filter(l => l.user_id || l.days.some(x => x.length))
                .map(l => (
                  <tr key={l.user_id || "none"} className="border-t border-slate-100">
                    <td className="p-1 font-bold text-slate-700 max-w-[90px] truncate">{l.name}</td>
                    {l.days.map((list, i) => (
                      <td key={i} className="p-0.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setDay(days[i]);
                            setView("Day");
                          }}
                          aria-label={`${l.name}, ${short(days[i])}: ${list.length} jobs`}
                          className={`w-full rounded-lg py-2 font-black min-h-[40px] ${list.length ? (list.length > 2 ? "bg-red-100 text-red-800" : "bg-slate-800 text-white") : "bg-slate-50 text-slate-300"}`}
                        >
                          {list.length || "·"}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}

      {late.length > 0 && (
        <div className="stack-y-2">
          <p className="text-xs font-black text-red-700 uppercase tracking-wider">Past their date ({late.length})</p>
          {late.slice(0, 20).map(chip)}
        </div>
      )}
      <div className="stack-y-2">
        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Waiting for a date ({waiting.length})</p>
        {waiting.length === 0 ? (
          <p className="text-sm text-slate-400">Every open job has a date.</p>
        ) : (
          waiting.map(chip)
        )}
      </div>

      <DispatchSheet
        job={open}
        client={open ? client.get(open.client_id) : null}
        members={members}
        canManage={canManage}
        userId={userId}
        defaultDay={day}
        onClose={() => setOpen(null)}
        onSave={async next => {
          await save(next);
          setOpen(null);
          setMessage(next.scheduled_date ? `${next.job_number || "Job"} booked for ${dayTitle(next.scheduled_date)}.` : "Saved.");
        }}
      />
    </div>
  );
}

function DispatchSheet({ job, client, members, canManage, userId, defaultDay, onClose, onSave }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [tech, setTech] = useState("");
  const [eta, setEta] = useState("30");
  useEffect(() => {
    if (!job) return;
    setDate(job.scheduled_date || defaultDay);
    setTime(hhmm(job.scheduled_time));
    setTech(job.assigned_to_user_id || "");
  }, [job, defaultDay]);
  if (!job) return <BottomSheet open={false} onClose={onClose} />;
  const phone = formatPhone(client?.phone || "");
  const mine = job.assigned_to_user_id === userId || job.user_id === userId;
  const input = "w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-base min-h-[52px] mt-1";
  const wa = () => {
    const text = onMyWayMessage({ contact: client?.contact, company: companyName(), technician: myName(), job, minutes: eta });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return (
    <BottomSheet open={!!job} onClose={onClose} title={job.title || "Job"} subtitle={[job.job_number, client?.company].filter(Boolean).join(" · ")} maxHeight="92vh">
      <div className="stack-y-3">
        {job.description && <p className="text-sm text-slate-600 whitespace-pre-line">{job.description}</p>}
        {canManage && isOpen(job) && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-bold text-slate-500">
                Date
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
              </label>
              <label className="block text-sm font-bold text-slate-500">
                Time
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className={input} />
              </label>
            </div>
            <label className="block text-sm font-bold text-slate-500">
              Technician
              <select value={tech} onChange={e => setTech(e.target.value)} className={input}>
                <option value="">Not assigned</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
            <Btn className="w-full" onClick={() => onSave(assignment(job, { date, time, userId: tech, members }))}>
              Save booking
            </Btn>
            {job.scheduled_date && (
              <Btn className="w-full" size="sm" variant="ghost" onClick={() => onSave(assignment(job, { date: "", time: "", userId: tech, members }))}>
                Take off the schedule
              </Btn>
            )}
          </>
        )}
        {(mine || canManage) && isOpen(job) && (
          <div className="stack-y-2 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-700">On my way</p>
            {phone ? (
              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <Field label="Minutes away" type="number" value={eta} onChange={setEta} />
                <Btn size="sm" variant="success" onClick={wa}>
                  <MessageCircle size={14} /> WhatsApp
                </Btn>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Add a phone number to the client to send this.</p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {job.location ? (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.location)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 min-h-[48px]"
            >
              <MapPin size={14} /> Directions
            </a>
          ) : (
            <span />
          )}
          {client?.phone ? (
            <a href={`tel:${client.phone}`} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-700 min-h-[48px]">
              <Phone size={14} /> Call
            </a>
          ) : (
            <span />
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
