import test from "node:test";
import assert from "node:assert/strict";
import { addDays, assignment, lanes, mondayOf, onMyWayMessage, overdue, unscheduled, weekDays, weekGrid } from "../src/lib/schedule.js";

const members = [
  { user_id: "u1", full_name: "Thabo" },
  { user_id: "u2", email: "sipho@example.com" },
];
const jobs = [
  { id: "a", title: "Pump", status: "scheduled", scheduled_date: "2026-10-06", scheduled_time: "13:00:00", assigned_to_user_id: "u1" },
  { id: "b", title: "Jack", status: "in_progress", scheduled_date: "2026-10-06", scheduled_time: "08:00:00", assigned_to_user_id: "u1" },
  { id: "c", title: "Hose", status: "scheduled", scheduled_date: "2026-10-06", assigned_to_user_id: "someone-who-left" },
  { id: "d", title: "Unbooked", status: "scheduled", scheduled_date: null },
  { id: "e", title: "Late", status: "scheduled", scheduled_date: "2026-10-01" },
  { id: "f", title: "Done", status: "completed", scheduled_date: "2026-10-01" },
  { id: "g", title: "Cancelled", status: "cancelled", scheduled_date: "2026-10-06" },
];

test("days and weeks", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(mondayOf("2026-10-08"), "2026-10-05");
  assert.equal(mondayOf("2026-10-11"), "2026-10-05");
  assert.deepEqual(weekDays("2026-10-05").slice(-1), ["2026-10-11"]);
});

test("a lane per technician, sorted by time; leavers' jobs show as not assigned", () => {
  const l = lanes(jobs, members, "2026-10-06");
  assert.deepEqual(l.map(x => x.name), ["Not assigned", "Thabo", "sipho@example.com"]);
  assert.deepEqual(l[1].jobs.map(j => j.id), ["b", "a"]);
  assert.deepEqual(l[0].jobs.map(j => j.id), ["c"]);
  assert.equal(l[2].jobs.length, 0);
  const g = weekGrid(jobs, members, "2026-10-05");
  assert.deepEqual(g.map(x => x.days[1].length), [1, 2, 0]);
});

test("waiting and late jobs", () => {
  assert.deepEqual(unscheduled(jobs).map(j => j.id), ["d"]);
  assert.deepEqual(overdue(jobs, "2026-10-05").map(j => j.id), ["e"]);
});

test("booking a job", () => {
  const b = assignment({ id: "d", status: "draft" }, { date: "2026-10-07", time: "09:30", userId: "u2", members });
  assert.deepEqual([b.scheduled_date, b.scheduled_time, b.assigned_to_user_id, b.assigned_to, b.status], ["2026-10-07", "09:30:00", "u2", "sipho@example.com", "scheduled"]);
  const off = assignment(b, { date: "", time: "09:30", userId: "", members });
  assert.deepEqual([off.scheduled_date, off.scheduled_time, off.assigned_to_user_id, off.assigned_to], [null, null, null, ""]);
});

test("on my way message", () => {
  assert.equal(
    onMyWayMessage({ contact: "Jan", company: "Acme Hydraulics", technician: "Thabo", job: { title: "pump service" }, minutes: 25 }),
    "Hi Jan, this is Thabo from Acme Hydraulics. I'm on my way for pump service. I should be there in about 25 minutes.",
  );
  assert.equal(onMyWayMessage({}), "Hi there, this is your technician from us. I'm on my way.");
});
