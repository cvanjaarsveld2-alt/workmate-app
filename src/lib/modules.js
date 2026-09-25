// ─── Modules per company ──────────────────────────────────────────────────────
// Whole features a company's master account can switch off for everyone in
// the company (Settings → Company Details → Modules). Stored as
// team_profiles.disabled_modules. Screens of a switched-off module disappear
// from the menu and can't be opened.
export const MODULES = [
  { key: "sales", label: "Sales pipeline", hint: "Opportunities, call log, analytics", screens: ["Leads", "ColdCall", "Analytics"] },
  { key: "quotes_invoicing", label: "Quotes, jobs & invoices", hint: "Quotes, jobs, schedule, service plans, timesheets, invoices, products & stock", screens: ["Quotes", "Jobs", "Invoices", "Products", "Timesheets", "ServicePlans", "Schedule"] },
  { key: "field_notes", label: "Field notes", hint: "Site notes with photos and voice", screens: ["Notes"] },
  { key: "vehicle_checks", label: "Vehicle checks", hint: "Daily vehicle inspection", screens: ["VehicleCheck"] },
  { key: "reports", label: "Breakdown & repair reports", hint: "Engineering reports", screens: ["Breakdown", "Repair"] },
  { key: "equipment", label: "Equipment register", hint: "Client machines and service dates", screens: ["Equipment"] },
  // Built for Power Works only: offered just to companies that already have it.
  { key: "jack_selector", label: "Jack selector", hint: "Mining machine jacking guide", screens: ["JackSelector"], privateTo: "enabled" },
  { key: "meetings", label: "Meeting recorder", hint: "Record and summarise meetings", screens: ["Meeting"] },
  { key: "expenses", label: "Expenses", hint: "Receipts and expense claims", screens: ["Expenses", "BackfillZAR"] },
];

// Modules shown in Company Details. A private module (Jack Selector) only
// appears to a company that has it switched on.
export function offeredModules(disabled = []) {
  const off = new Set(disabled || []);
  return MODULES.filter(m => !m.privateTo || !off.has(m.key));
}

export function unavailableScreens(disabled = []) {
  const off = new Set(disabled || []);
  return MODULES.filter(m => off.has(m.key)).flatMap(m => m.screens);
}
