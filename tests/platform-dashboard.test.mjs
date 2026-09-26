import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { companyGroup, platformSummary } from "../src/lib/platformDashboard.js";

const NOW = new Date("2026-10-10T08:00:00Z").getTime();
const day = n => new Date(NOW + n * 86400000).toISOString();
const CAT = { starter: { price: 499 }, pro: { price: 1299 }, enterprise: { price: 2999 } };
const co = (name, x) => ({ id: name, name, members: 2, created_at: day(-60), access: "full", status: "active", ...x });

const companies = [
  co("Paying Pro", { plan: "pro", members: 10, seat_limit: 10, billing_status: "active", last_active: day(-1) }),
  co("Paying Starter", { plan: "starter", billing_status: "cancelled", paid_until: day(10).slice(0, 10) }),
  co("Trial ending", { plan: "trial", trial_ends_at: day(2), created_at: day(-12) }),
  co("Trial fresh", { plan: "trial", trial_ends_at: day(12), created_at: day(-2) }),
  co("Power Works", { plan: "free", members: 4 }),
  co("Overdue", { plan: "pro", status: "past_due", access: "read_only" }),
  co("On hold", { plan: "pro", status: "suspended", access: "suspended", deletion_requested_at: day(-3) }),
];

test("each company lands in one bucket", () => {
  assert.deepEqual(companies.map(companyGroup), ["paying", "paying", "trial", "trial", "free", "read_only", "suspended"]);
  assert.equal(companyGroup({ access: "full" }), "trial");
});

test("totals, monthly income only from paying companies with full access", () => {
  const s = platformSummary(companies, CAT, NOW);
  assert.equal(s.total, 7);
  assert.equal(s.paying, 2);
  assert.equal(s.trial, 2);
  assert.equal(s.free, 1);
  assert.equal(s.readOnly, 1);
  assert.equal(s.suspended, 1);
  assert.equal(s.monthly, 1299 + 499);
  assert.equal(s.users, 10 + 2 + 2 + 2 + 4 + 2 + 2);
  assert.equal(s.newThisMonth, 2);
  assert.equal(s.activeThisWeek, 1);
});

test("what needs the platform owner", () => {
  const why = platformSummary(companies, CAT, NOW).attention.map(a => `${a.c.name}: ${a.why}`);
  assert.ok(why.includes("Trial ending: Trial ends in the next 3 days"));
  assert.ok(!why.some(w => w.startsWith("Trial fresh")));
  assert.ok(why.includes("Overdue: Payment overdue (read-only)"));
  assert.ok(why.some(w => w.startsWith("Paying Starter: Cancelled PayFast")));
  assert.ok(why.includes("Paying Pro: At its user limit (10 of 10)"));
  assert.ok(why.includes("On hold: Asked for its data to be deleted"));
  assert.ok(!why.some(w => w.startsWith("Power Works")));
});

test("the console gives full access in one tap, and the list has what the dashboard needs", () => {
  const ui = fs.readFileSync(new URL("../src/screens/PlatformAdminScreen.jsx", import.meta.url), "utf8");
  assert.match(ui, /plan: "free", status: "active", trial_ends_at: null, paid_until: null/);
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927190000_platform_dashboard.sql", import.meta.url), "utf8");
  for (const f of ["billing_status", "seat_limit", "paid_total", "last_payment_at", "as jobs"]) assert.ok(sql.includes(f), f);
  assert.match(sql, /if not private\.is_platform_admin\(\) then raise exception 'Not authorized'/);
});
