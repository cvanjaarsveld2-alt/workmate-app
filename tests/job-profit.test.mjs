import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { groupBy, jobFlags, jobProfit, periodRange, profitCsv, totals } from "../src/lib/jobProfit.js";

const row = x => ({ id: "j1", job_number: "JOB-1", title: "Pump repair", status: "completed", client_id: "c1", assigned_to_user_id: "u1", job_date: "2026-10-05",
  invoiced: 0, quoted: null, work_minutes: 0, travel_minutes: 0, parts_cost: 0, po_cost: 0, expense_cost: 0, ...x });

test("profit = invoiced revenue minus labour, travel, parts, bought-in and expenses", () => {
  const j = jobProfit(row({ invoiced: 10000, quoted: 12000, work_minutes: 240, travel_minutes: 60, parts_cost: 2500, po_cost: 800, expense_cost: 200 }), { labourCost: 300 });
  assert.equal(j.revenue, 10000);
  assert.equal(j.source, "invoiced");
  assert.equal(j.labour, 1200);
  assert.equal(j.travel, 300);
  assert.equal(j.cost, 1200 + 300 + 2500 + 800 + 200);
  assert.equal(j.profit, 5000);
  assert.equal(j.margin, 50);
  assert.equal(j.hours, 5);
});

test("until it's invoiced, the quote is the revenue; no revenue means no margin", () => {
  assert.equal(jobProfit(row({ quoted: 4000, parts_cost: 1000 })).source, "quoted");
  assert.equal(jobProfit(row({ quoted: 4000, parts_cost: 1000 })).profit, 3000);
  const none = jobProfit(row({ parts_cost: 500 }));
  assert.equal(none.source, "none");
  assert.equal(none.margin, null);
  assert.equal(none.profit, -500);
});

test("jobs that need a look", () => {
  assert.deepEqual(jobFlags(jobProfit(row({ invoiced: 100, parts_cost: 500, work_minutes: 60 }))), ["Loss"]);
  assert.deepEqual(jobFlags(jobProfit(row({ parts_cost: 500, work_minutes: 60 }))), ["Not quoted or invoiced"]);
  assert.deepEqual(jobFlags(jobProfit(row({ quoted: 5000, work_minutes: 60 }))), ["Done, not invoiced"]);
  assert.deepEqual(jobFlags(jobProfit(row({ invoiced: 5000 }))), ["No time recorded"]);
  assert.deepEqual(jobFlags(jobProfit(row({ invoiced: 5000, work_minutes: 30, status: "completed" }))), []);
});

test("totals and grouping by client or technician", () => {
  const jobs = [
    jobProfit(row({ id: "a", invoiced: 1000, parts_cost: 400 })),
    jobProfit(row({ id: "b", invoiced: 3000, parts_cost: 1000, client_id: "c2" })),
    jobProfit(row({ id: "c", invoiced: 500, parts_cost: 900, client_id: "c2", assigned_to_user_id: null })),
  ];
  const t = totals(jobs);
  assert.deepEqual([t.jobs, t.revenue, t.cost, t.profit, t.margin], [3, 4500, 2300, 2200, 48.9]);
  const byClient = groupBy(jobs, "client_id", id => ({ c1: "Acme", c2: "Beta" })[id]);
  assert.deepEqual(byClient.map(g => [g.name, g.profit]), [["Beta", 1600], ["Acme", 600]]);
  assert.equal(groupBy(jobs, "assigned_to_user_id").find(g => g.id === "none").name, "Not set");
});

test("periods", () => {
  const now = new Date(2026, 9, 15);
  assert.deepEqual(periodRange("this_month", now), ["2026-10-01", "2026-10-15"]);
  assert.deepEqual(periodRange("last_month", now), ["2026-09-01", "2026-09-30"]);
  assert.deepEqual(periodRange("this_year", now), ["2026-01-01", "2026-10-15"]);
  assert.deepEqual(periodRange("90_days", now), ["2026-07-18", "2026-10-15"]);
});

test("CSV export is safe to open in Excel", () => {
  const csv = profitCsv([jobProfit(row({ title: "=HYPERLINK(1)", invoiced: 100 }))], { clients: new Map([["c1", "Acme, Ltd"]]) });
  assert.match(csv, /'=HYPERLINK\(1\)/);
  assert.match(csv, /"Acme, Ltd"/);
});

test("the database counts stock items once (as parts used), and only managers see profit", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260928090000_purchasing_and_job_profit.sql", import.meta.url), "utf8");
  assert.match(sql, /pr\.track_stock and pr\.id::text = l ->> 'product_id'\)\) as po_cost/);
  assert.match(sql, /private\.is_team_manager\(p_team_id\)\) then\s+raise exception 'Only the master account or an admin can see job profit'/);
  assert.match(sql, /team_has_feature\(p_team_id, 'job_profit'\)/);
});
