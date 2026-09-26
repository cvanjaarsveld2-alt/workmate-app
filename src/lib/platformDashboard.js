// ─── Platform dashboard ───────────────────────────────────────────────────────
// Groups companies (paying, trial, full access, read-only, suspended), totals
// them and lists what needs the platform owner. Input: admin_list_companies().
const fmt = d => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Which bucket a company is in, for the dashboard and the filters.
export function companyGroup(c) {
  if (c.access === "suspended") return "suspended";
  if (c.access === "read_only") return "read_only";
  if (!c.plan || c.plan === "trial") return "trial";
  if (c.plan === "free") return "free";
  return "paying";
}
export const GROUPS = [
  ["all", "All"],
  ["paying", "Paying"],
  ["trial", "On trial"],
  ["free", "Full access"],
  ["read_only", "Read-only"],
  ["suspended", "Suspended"],
];

// Totals and the things that need you, at a glance.
export function platformSummary(companies, catalogue, now = Date.now()) {
  const by = g => companies.filter(c => companyGroup(c) === g);
  const paying = by("paying");
  const monthly = paying.reduce((sum, c) => sum + Number(catalogue?.[c.plan]?.price || 0), 0);
  const day = 86400000;
  const attention = [
    ...companies
      .filter(c => companyGroup(c) === "trial" && c.trial_ends_at && new Date(c.trial_ends_at).getTime() - now < 3 * day)
      .map(c => ({ c, why: new Date(c.trial_ends_at).getTime() < now ? "Trial ended" : "Trial ends in the next 3 days" })),
    ...by("read_only").map(c => ({ c, why: c.status === "past_due" ? "Payment overdue (read-only)" : "Read-only" })),
    ...companies.filter(c => c.billing_status === "cancelled" && companyGroup(c) === "paying").map(c => ({ c, why: "Cancelled PayFast; runs out " + fmt(c.paid_until) })),
    ...companies.filter(c => c.seat_limit && c.members >= c.seat_limit && companyGroup(c) !== "suspended").map(c => ({ c, why: `At its user limit (${c.members} of ${c.seat_limit})` })),
    ...companies.filter(c => c.deletion_requested_at).map(c => ({ c, why: "Asked for its data to be deleted" })),
  ];
  return {
    total: companies.length,
    paying: paying.length,
    trial: by("trial").length,
    free: by("free").length,
    readOnly: by("read_only").length,
    suspended: by("suspended").length,
    users: companies.reduce((n, c) => n + Number(c.members || 0), 0),
    monthly,
    newThisMonth: companies.filter(c => now - new Date(c.created_at).getTime() < 30 * day).length,
    activeThisWeek: companies.filter(c => c.last_active && now - new Date(c.last_active).getTime() < 7 * day).length,
    attention,
  };
}

