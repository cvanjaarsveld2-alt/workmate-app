import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { annualValue, daysUntil, dueStatus, frequencyKey, frequencyLabel, planFromForm, visitsPerYear } from "../src/lib/servicePlans.js";

const today = new Date("2026-09-28T09:00:00");

test("frequency labels and visits per year", () => {
  assert.equal(frequencyLabel({ every_months: 3 }), "Quarterly");
  assert.equal(frequencyLabel({ every_months: 5 }), "Every 5 months");
  assert.equal(frequencyLabel({ every_days: 7 }), "Weekly");
  assert.equal(frequencyLabel({ every_days: 45 }), "Every 45 days");
  assert.equal(frequencyKey({ every_months: 12 }), "12m");
  assert.equal(frequencyKey({ every_days: 10 }), "days");
  assert.equal(visitsPerYear({ every_months: 3 }), 4);
  assert.equal(visitsPerYear({ every_days: 73 }), 5);
  assert.equal(annualValue([{ every_months: 3, value: 4500 }, { every_months: 12, value: 1000 }, { every_months: 1, value: 999, active: false }]), 19000);
});

test("what's due", () => {
  assert.equal(daysUntil("2026-10-01", today), 3);
  assert.equal(dueStatus({ next_due: "2026-09-20", lead_days: 7 }, today), "overdue");
  assert.equal(dueStatus({ next_due: "2026-10-03", lead_days: 7 }, today), "due");
  assert.equal(dueStatus({ next_due: "2026-11-30", lead_days: 7 }, today), "later");
  assert.equal(dueStatus({ next_due: "2026-09-20", active: false }, today), "paused");
});

test("the form is checked before it reaches the database", () => {
  const base = { title: "Quarterly service", client_id: "c1", frequency: "3m", next_due: "2026-10-15", lead_days: "7", value: "4500.555" };
  const { row } = planFromForm(base, "t1");
  assert.deepEqual(
    [row.team_id, row.every_months, row.every_days, row.lead_days, row.value, row.equipment_id],
    ["t1", 3, null, 7, 4500.56, null],
  );
  assert.equal(planFromForm({ ...base, frequency: "days", every_days: "14" }).row.every_days, 14);
  assert.match(planFromForm({ ...base, title: " " }).error, /name/);
  assert.match(planFromForm({ ...base, client_id: "" }).error, /client/);
  assert.match(planFromForm({ ...base, frequency: "days", every_days: "0" }).error, /days/);
  assert.match(planFromForm({ ...base, lead_days: "120" }).error, /0 to 90/);
  assert.match(planFromForm({ ...base, ends_on: "2026-09-01" }).error, /end date/);
});

test("the database makes the jobs and keeps plans to their company", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927110000_service_plans.sql", import.meta.url), "utf8");
  assert.match(sql, /cron\.schedule\('powermate-service-plans'/);
  assert.match(sql, /on conflict \(service_plan_id, scheduled_date\)/);
  assert.match(sql, /service_plans_insert[\s\S]*is_team_manager\(team_id\)[\s\S]*c\.team_id = service_plans\.team_id/);
  assert.match(sql, /'jobs','service_plans'/);
});
