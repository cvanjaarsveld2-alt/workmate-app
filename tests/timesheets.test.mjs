import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  byDay,
  entryMinutes,
  fmtMinutes,
  inRange,
  labourLines,
  newEntry,
  runningEntry,
  stopEntry,
  timesheetCsv,
  totals,
  weekStart,
} from "../src/lib/timesheets.js";

const at = s => new Date(s);
const e = (start, end, extra = {}) => ({ id: start, user_id: "u1", started_at: at(start).toISOString(), ended_at: end ? at(end).toISOString() : null, kind: "work", billable: true, ...extra });

test("clocking in and out", () => {
  const job = { id: "j1", client_id: "c1" };
  const x = newEntry({ id: "e1", userId: "u1", teamId: "t1", job, now: at("2026-09-28T07:30:00") });
  assert.deepEqual([x.job_id, x.client_id, x.kind, x.billable, x.ended_at], ["j1", "c1", "work", true, null]);
  assert.equal(newEntry({ userId: "u1", kind: "travel" }).billable, false);
  assert.equal(runningEntry([x, e("2026-09-27T08:00:00", "2026-09-27T09:00:00")], "u1").id, "e1");
  assert.equal(runningEntry([x], "someone else"), null);
  const done = stopEntry(x, at("2026-09-28T10:15:00"));
  assert.equal(entryMinutes(done), 165);
  // Forgot to clock out for two days: capped at 24 hours.
  assert.equal(entryMinutes(stopEntry(x, at("2026-09-30T07:30:00"))), 24 * 60);
  // A phone clock behind the start never gives negative time.
  assert.equal(entryMinutes(stopEntry(x, at("2026-09-28T07:00:00"))), 0);
  assert.equal(entryMinutes(x, at("2026-09-28T08:00:00")), 30);
});

test("totals split work, travel and billable time", () => {
  const list = [
    e("2026-09-28T07:00:00", "2026-09-28T07:45:00", { kind: "travel", billable: false }),
    e("2026-09-28T08:00:00", "2026-09-28T12:00:00", { job_id: "j1" }),
    e("2026-09-28T13:00:00", "2026-09-28T14:30:00", { job_id: "j1", billable: false }),
  ];
  assert.deepEqual(totals(list), { work: 330, travel: 45, billable: 240, all: 375 });
  assert.equal(fmtMinutes(375), "6 h 15");
  assert.deepEqual(labourLines(list, "j1", 650), [{ description: "Labour (4 h)", qty: 4, unitPrice: 650, kind: "labour" }]);
  assert.deepEqual(labourLines(list, "j1", 0), []);
  assert.deepEqual(labourLines(list, "other", 650), []);
});

test("weeks start on Monday and entries group by local day", () => {
  const mon = weekStart(at("2026-10-01T15:00:00")); // a Thursday
  assert.equal(mon.getDay(), 1);
  assert.equal(mon.getDate(), 28);
  const sun = weekStart(at("2026-10-04T23:00:00"));
  assert.equal(sun.getDate(), 28);
  const end = new Date(mon);
  end.setDate(end.getDate() + 7);
  const list = [e("2026-09-27T09:00:00", "2026-09-27T10:00:00"), e("2026-09-29T09:00:00", "2026-09-29T10:00:00"), e("2026-09-29T11:00:00", "2026-09-29T12:00:00")];
  const week = inRange(list, mon, end);
  assert.equal(week.length, 2);
  assert.deepEqual([...byDay(week).keys()], ["2026-09-29"]);
});

test("payroll CSV", () => {
  const csv = timesheetCsv([e("2026-09-29T09:00:00", "2026-09-29T10:30:00", { job_id: "j1", note: "=cmd" })], {
    people: new Map([["u1", "Thabo"]]),
    jobs: new Map([["j1", "JOB-1 · Pump"]]),
  });
  const [head, row] = csv.split("\r\n");
  assert.equal(head, "Person,Date,Start,End,Hours,Type,Job,Billable,Note");
  assert.equal(row, "Thabo,2026-09-29,09:00,10:30,1.5,Work,JOB-1 · Pump,Yes,'=cmd");
});

test("timesheets sync offline like jobs, and the database limits who edits what", () => {
  const sync = fs.readFileSync(new URL("../src/lib/sync.js", import.meta.url), "utf8");
  assert.match(sync, /time_entries: \[\{ field: "job_id", pending: "sync_pending_job_id", table: "jobs" \}\]/);
  const db = fs.readFileSync(new URL("../src/offline/offlineDb.js", import.meta.url), "utf8");
  assert.match(db, /"time_entries"/);
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927100000_timesheets.sql", import.meta.url), "utf8");
  assert.match(sql, /time_entries_insert[\s\S]*with check \(user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /time_entries_order check \(ended_at is null or ended_at >= started_at\)/);
});
