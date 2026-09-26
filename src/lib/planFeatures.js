// ─── What the plan includes ───────────────────────────────────────────────────
// my_team_plan() lists the plan's features; the database enforces them too
// (adding products, service plans, time entries; reminders, PayFast, Xero).
// No list yet (older cached plan, or offline before the first check) means
// nothing is locked here; the database still has the final say.
export const FEATURES = {
  products: { label: "Products & stock", screens: ["Products"] },
  schedule: { label: "Schedule & dispatch", screens: ["Schedule"] },
  service_plans: { label: "Service plans", screens: ["ServicePlans"] },
  timesheets: { label: "Timesheets & clock in", screens: ["Timesheets"] },
  reminders: { label: "Automatic reminders", screens: [] },
  online_payments: { label: "Pay online (PayFast)", screens: [] },
  xero: { label: "Xero sync", screens: [] },
};

export function hasFeature(plan, feature) {
  return !Array.isArray(plan?.features) || plan.features.includes(feature);
}

// Screens the plan doesn't include (they show an upgrade page instead).
export function lockedScreens(plan) {
  return Object.entries(FEATURES).flatMap(([f, x]) => (hasFeature(plan, f) ? [] : x.screens));
}

export function featureForScreen(screen) {
  return Object.keys(FEATURES).find(f => FEATURES[f].screens.includes(screen)) || null;
}

// The cheapest paid plan that includes a feature, from the price list.
export function cheapestPlanWith(catalogue, feature) {
  return (
    Object.entries(catalogue || {})
      .filter(([, p]) => (p.features || []).includes(feature))
      .sort(([, a], [, b]) => Number(a.price) - Number(b.price))
      .map(([key, p]) => ({ key, ...p }))[0] || null
  );
}

export const PAID_PLANS = ["starter", "pro", "enterprise"];

export const fmtRand = n =>
  "R " + Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
