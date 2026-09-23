// Timing rules for server-sent reminders (supabase/functions/send-reminders/schedule.ts).
// These are what make reminders arrive at the right local time with the app closed.
import test from "node:test";
import assert from "node:assert/strict";
import {
  localToUtc, localDate, followupFireAt, planReminders, dueNow, validTz,
} from "../supabase/functions/send-reminders/schedule.ts";

const iso = d => d.toISOString();
const at = s => new Date(s);
const JHB = "Africa/Johannesburg";
const tzOf = map => id => map[id] || JHB;
const fu = (over = {}) => ({
  id: "f1", user_id: "u1", assigned_to_user_id: null, title: "Call Ausco", client: "Ausco",
  date: "2026-09-23", time: "10:00", reminder: "15_before", completed: false, ...over,
});
const none = { followups: [], equipment: [], notes: [] };

test("local wall-clock time converts to UTC per timezone, including DST changes", () => {
  assert.equal(iso(localToUtc("2026-09-23", "09:00", JHB)), "2026-09-23T07:00:00.000Z");
  assert.equal(iso(localToUtc("2026-03-28", "09:00", "Europe/London")), "2026-03-28T09:00:00.000Z");
  assert.equal(iso(localToUtc("2026-03-29", "09:00", "Europe/London")), "2026-03-29T08:00:00.000Z"); // BST
  assert.equal(iso(localToUtc("2026-09-23", "09:00", "America/New_York")), "2026-09-23T13:00:00.000Z");
  assert.equal(localDate(JHB, at("2026-09-22T22:30:00Z")), "2026-09-23"); // already tomorrow in SA
  assert.equal(validTz("Not/AZone"), JHB);
});

test("every reminder option the app offers maps to the right fire time", () => {
  const f = r => iso(followupFireAt("2026-09-23", "10:00", r, JHB));
  assert.equal(f("on_time"), "2026-09-23T08:00:00.000Z");
  assert.equal(f("15_before"), "2026-09-23T07:45:00.000Z");
  assert.equal(f("30_before"), "2026-09-23T07:30:00.000Z");
  assert.equal(f("30_min"), "2026-09-23T07:30:00.000Z"); // legacy code still in data
  assert.equal(f("1h_before"), "2026-09-23T07:00:00.000Z");
  assert.equal(f("1d_before"), "2026-09-22T07:00:00.000Z"); // 09:00 the day before
  assert.equal(f("morning"), "2026-09-23T05:00:00.000Z"); // 07:00 on the day
  assert.equal(followupFireAt("2026-09-23", "10:00", "none", JHB), null);
  assert.equal(iso(followupFireAt("2026-09-23", null, "on_time", JHB)), "2026-09-23T07:00:00.000Z"); // no time = 09:00
});

test("a follow-up reminder is planned once, for the assignee, inside its window", () => {
  const plan = (from, to, over) => planReminders({ ...none, followups: [fu(over)] }, tzOf({}), at(from), at(to));
  const r = plan("2026-09-23T07:40:00Z", "2026-09-23T07:45:00Z").filter(x => x.kind === "followup");
  assert.equal(r.length, 1);
  assert.equal(r[0].userId, "u1");
  assert.equal(r[0].tag, "fu_f1");
  assert.equal(r[0].body, "Due at 10:00 — Ausco");
  assert.equal(plan("2026-09-23T07:40:00Z", "2026-09-23T07:44:59Z").filter(x => x.kind === "followup").length, 0);
  assert.equal(plan("2026-09-23T07:40:00Z", "2026-09-23T07:45:00Z", { completed: true }).length, 0);
  assert.equal(plan("2026-09-23T07:40:00Z", "2026-09-23T07:45:00Z", { assigned_to_user_id: "u2" })[0].userId, "u2");
});

test("each person's reminders follow their own timezone", () => {
  const r = planReminders({ ...none, followups: [fu({ user_id: "ny" })] }, tzOf({ ny: "America/New_York" }),
    at("2026-09-23T13:40:00Z"), at("2026-09-23T13:50:00Z"));
  assert.equal(iso(r.find(x => x.kind === "followup").fireAt), "2026-09-23T13:45:00.000Z"); // 09:45 in New York
});

test("7am digest counts today's open follow-ups and is keyed per person per day", () => {
  const followups = [fu(), fu({ id: "f2", reminder: "none" }), fu({ id: "f3", completed: true }), fu({ id: "f4", date: "2026-09-24" })];
  const r = planReminders({ ...none, followups }, tzOf({}), at("2026-09-23T04:55:00Z"), at("2026-09-23T05:00:00Z"))
    .filter(x => x.kind === "digest");
  assert.equal(r.length, 1);
  assert.equal(r[0].body, "You have 2 follow-ups today.");
  assert.equal(r[0].key, "digest:u1:2026-09-23");
  // A 48-hour preview finds the digest on each day that has follow-ups.
  const preview = planReminders({ ...none, followups }, tzOf({}), at("2026-09-22T06:00:00Z"), at("2026-09-24T06:00:00Z"))
    .filter(x => x.kind === "digest").map(x => x.key);
  assert.deepEqual(preview, ["digest:u1:2026-09-23", "digest:u1:2026-09-24"]);
});

test("equipment service and unresolved notes remind at 09:00 local", () => {
  const equipment = [{ id: "e1", user_id: "u1", assigned_to_user_id: null, name: "Jack 50T", make: "Enerpac", model: "X", service_due: "2026-09-26" }];
  const notes = [
    { id: "n1", user_id: "u1", assigned_to_user_id: null, client: "Ausco", note: "Hose leak", urgency: "Urgent", resolve_by: "2026-09-23", resolved: false },
    { id: "n2", user_id: "u1", assigned_to_user_id: null, client: "Ausco", note: "Done", urgency: null, resolve_by: "2026-09-23", resolved: true },
  ];
  const r = planReminders({ followups: [], equipment, notes }, tzOf({}), at("2026-09-23T06:59:00Z"), at("2026-09-23T07:00:00Z"));
  assert.deepEqual(r.map(x => x.key).sort(), ["eq-warn:e1:2026-09-26", "note:n1:2026-09-23"]);
  assert.equal(r.find(x => x.kind === "note").title, "⚠️ Unresolved Note: Ausco");
  const dueDay = planReminders({ followups: [], equipment, notes: [] }, tzOf({}), at("2026-09-26T06:59:00Z"), at("2026-09-26T07:00:00Z"));
  assert.equal(dueDay[0].key, "eq-due:e1:2026-09-26");
  assert.equal(dueDay[0].tag, "ed_e1"); // same tag as the on-device reminder
});

test("a late run still sends date-based reminders but not stale timed ones", () => {
  const r = planReminders({ ...none, followups: [fu()] }, tzOf({}), at("2026-09-23T04:00:00Z"), at("2026-09-23T08:00:00Z"));
  const kinds = now => dueNow(r, at(now)).map(x => x.kind).sort();
  assert.deepEqual(kinds("2026-09-23T06:00:00Z"), ["digest"]); // digest (05:00Z) 1 h late: still useful
  assert.deepEqual(kinds("2026-09-23T07:50:00Z"), ["followup"]); // 5 min late; digest now 2 h 50 late
  assert.deepEqual(kinds("2026-09-23T07:56:00Z"), []); // follow-up 11 min late: past its time, skipped
  assert.deepEqual(kinds("2026-09-23T07:44:00Z"), []); // follow-up not due yet
});
