import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { FEATURES, cheapestPlanWith, featureForScreen, hasFeature, lockedScreens } from "../src/lib/planFeatures.js";
import { apiSignatureString, paramString, subscriptionFields } from "../supabase/functions/billing/payfast.js";

const md5 = s => crypto.createHash("md5").update(s).digest("hex");
const read = f => fs.readFileSync(new URL(f, import.meta.url), "utf8");

const CATALOGUE = {
  starter: { name: "Starter", price: 499, seats: 3, features: [] },
  pro: { name: "Pro", price: 1299, seats: 10, features: ["products", "schedule", "service_plans", "timesheets", "reminders", "online_payments"] },
  enterprise: { name: "Enterprise", price: 2999, seats: null, features: Object.keys(FEATURES) },
};

test("features match the database's list", () => {
  const sql = read("../supabase/migrations/20260927180000_plan_features_and_seats.sql");
  const list = sql.match(/all_features\(\)[\s\S]*?array\[([^\]]+)\]/)[1].match(/'([a-z_]+)'/g).map(x => x.slice(1, -1));
  assert.deepEqual(Object.keys(FEATURES).sort(), list.sort());
});

test("no feature list (older cached plan) locks nothing; a list locks what's missing", () => {
  assert.equal(hasFeature(null, "products"), true);
  assert.equal(hasFeature({ plan: "trial" }, "xero"), true);
  assert.deepEqual(lockedScreens({ features: Object.keys(FEATURES) }), []);
  assert.deepEqual(lockedScreens({ features: [] }).sort(), ["Products", "Schedule", "ServicePlans", "Timesheets"]);
  assert.deepEqual(lockedScreens({ features: CATALOGUE.pro.features }), []);
  assert.equal(hasFeature({ features: CATALOGUE.pro.features }, "xero"), false);
  assert.equal(featureForScreen("ServicePlans"), "service_plans");
  assert.equal(featureForScreen("Quotes"), null);
});

test("the cheapest plan with a feature", () => {
  assert.equal(cheapestPlanWith(CATALOGUE, "products").key, "pro");
  assert.equal(cheapestPlanWith(CATALOGUE, "xero").key, "enterprise");
  assert.equal(cheapestPlanWith({}, "xero"), null);
});

test("the billing function's PayFast helpers are the same file as the invoice one", () => {
  assert.equal(read("../supabase/functions/billing/payfast.js"), read("../supabase/functions/payfast/payfast.js"));
});

test("a monthly subscription: PayFast's order, same amount each month, until cancelled", () => {
  const pairs = subscriptionFields(
    { merchant_id: "10000100", merchant_key: "46f0cd694581a", amount: 1299, plan: "pro", plan_name: "Pro", team_id: "t-1", company: "Acme", email: "boss@acme.co.za" },
    { returnUrl: "https://app.example.com/?screen=Plan&paid=1", cancelUrl: "https://app.example.com/?screen=Plan", notifyUrl: "https://db.example.com/functions/v1/billing", today: new Date("2026-10-01T08:00:00Z") },
  );
  assert.deepEqual(pairs.map(([k]) => k), [
    "merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url", "email_address", "m_payment_id", "amount", "item_name",
    "item_description", "custom_str1", "custom_str2", "subscription_type", "billing_date", "recurring_amount", "frequency", "cycles",
  ]);
  const get = k => pairs.find(([x]) => x === k)[1];
  assert.equal(get("amount"), "1299.00");
  assert.equal(get("recurring_amount"), "1299.00");
  assert.equal(get("frequency"), "3");
  assert.equal(get("cycles"), "0");
  assert.equal(get("billing_date"), "2026-10-01");
  assert.equal(get("custom_str1"), "t-1");
  assert.equal(get("custom_str2"), "pro");
  assert.match(paramString(pairs, "pass phrase"), /&item_name=Pro\+plan\+%28monthly%29&.*&passphrase=pass\+phrase$/);
});

test("PayFast API signature: every value sorted by name, passphrase included", () => {
  const s = apiSignatureString({ "merchant-id": "10000100", version: "v1", timestamp: "2026-10-01T08:00:00+00:00" }, "secret");
  assert.equal(s, "merchant-id=10000100&passphrase=secret&timestamp=2026-10-01T08%3A00%3A00%2B00%3A00&version=v1");
  assert.equal(md5(s).length, 32);
});

test("billing: price from the platform, master account only, payments recorded once", () => {
  const fn = read("../supabase/functions/billing/index.ts");
  assert.match(fn, /rpc\("plan_catalogue"\)/);
  assert.match(fn, /amount: plan\.price/);
  assert.doesNotMatch(fn, /body\.amount|body\.price/);
  assert.match(fn, /rpc\("billing_context"\)/);
  assert.match(fn, /query\/validate/);
  const sql = read("../supabase/migrations/20260927180100_platform_billing.sql");
  assert.match(sql, /pf_payment_id text not null unique/);
  assert.match(sql, /p_amount \+ 0\.01 < v_price/);
  assert.match(sql, /where t\.owner_user_id = auth\.uid\(\)/);
  assert.match(sql, /revoke execute on function public\.%s from public, anon, authenticated/);
  assert.match(read("../supabase/config.toml"), /\[functions\.billing\](\n#[^\n]*)*\nverify_jwt = false/);
});

test("the database enforces plans, not just the menu", () => {
  const sql = read("../supabase/migrations/20260927180000_plan_features_and_seats.sql");
  assert.match(sql, /create trigger team_members_seat_limit before insert on public\.team_members/);
  assert.match(sql, /as restrictive for insert to authenticated/);
  for (const f of ["daily_reminders", "customer_reminder_batch", "generate_service_jobs", "portal_can_pay", "payfast_checkout_data", "xero_can_sync", "xero_connected_teams", "xero_start"])
    assert.ok(sql.includes(f), f);
});

test("the app shows locked screens as an upgrade page, and Plan & billing is reachable", () => {
  const app = read("../src/App.jsx");
  assert.match(app, /planLocked\.includes\(screen\)/);
  assert.match(app, /"Plan",/);
  assert.match(read("../src/screens/MoreScreen.jsx"), /setScreen\("Plan"\)/);
  assert.match(read("../src/screens/PlanScreen.jsx"), /functions\.invoke\("billing"/);
});
