// Records the sales demo video: the app driven like a real user, with a
// fictional company (Acme Hydraulics) and fictional customers, and captions.
// Run with: node tests/sim/demo.cjs   → docs/demo/powermate-demo.mp4
process.env.SIM_SCREENS = "Home";
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");
const H = require("./harness.cjs");
const OUT = path.join(__dirname, "out", "demo");
fs.mkdirSync(OUT, { recursive: true });

const iso = n => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const uuid = () => require("crypto").randomUUID();

// ── A believable, entirely fictional company ──
function rebrand(db) {
  const TEAM = H.TEAM;
  db.teams.forEach(t => (t.name = "Acme Hydraulics"));
  db.team_profiles.forEach(p => Object.assign(p, { trading_name: "Acme Hydraulics", legal_name: "Acme Hydraulics (Pty) Ltd", offering: "hydraulic repairs and machine servicing", phone: "011 555 0123", email: "office@acme-hydraulics.example", labour_cost: 280, labour_rate: 650, vat_no: "4999999999" }));
  const companies = ["Kopano Platinum Mine", "Rietvlei Colliery", "Mogale Aggregates", "Ukhozi Gold – Shaft 2", "Blouberg Quarry", "Sishen Iron Works", "Thabazimbi Minerals", "Highveld Steel Services", "Lephalale Power Station", "Marikana Engineering"];
  const people = ["Thandi Mokoena", "Johan Pretorius", "Lerato Nkosi", "Pieter van Wyk", "Nomsa Dube", "Sibusiso Khumalo", "Anika Botha", "Mandla Zulu", "Riaan Smit", "Palesa Molefe"];
  db.clients.forEach((c, i) => Object.assign(c, { company: companies[i % companies.length] + (i >= companies.length ? ` (${Math.floor(i / companies.length) + 1})` : ""), contact: people[i % people.length], email: `buyer${i}@example.com`, location: ["Rustenburg", "Witbank", "Krugersdorp", "Carletonville", "Polokwane"][i % 5], branch: null }));
  const byId = new Map(db.clients.map(c => [c.id, c]));
  for (const t of ["quotes", "notes", "followups", "leads", "equipment", "breakdown_reports", "repair_reports", "activities", "expenses", "invoices", "contacts"])
    for (const r of db[t] || []) {
      const c = byId.get(r.client_id);
      if (c) {
        if ("client_name" in r) r.client_name = c.company;
        if ("client" in r) r.client = c.company;
        if (t === "contacts") r.company = c.company;
      }
    }
  (db.contacts || []).forEach((c, i) => (c.name = people[(i + 3) % people.length]));
  (db.equipment || []).forEach((e, i) => Object.assign(e, { name: ["LH410 loader", "Hydraulic press 200T", "Tyre handler TH-12"][i % 3], make: ["Sandvik", "Bosch Rexroth", "Kalmar"][i % 3], model: ["LH410", "HP-200", "TH-12"][i % 3] }));
  (db.expenses || []).forEach((e, i) => (e.vendor = ["Engen Rustenburg", "Bearing Man", "Makro", "Shell Witbank", "Midas", "Builders Warehouse"][i % 6]));
  (db.leads || []).forEach((l, i) => (l.title = ["Hydraulic cylinder rebuilds", "Annual pump service contract", "Press refurbishment", "Hose management"][i % 4]));
  (db.notes || []).forEach((n, i) => (n.note = ["Leak on boom cylinder, needs seal kit", "Customer wants quote for spare pump", "Check hoses on TH-12 at next visit"][i % 3]));
  const team = [
    [H.UID, "anna@acme-hydraulics.example", "Anna Venter"],
    ["dc4e613a-ef56-472a-b700-66365f67f258", "sipho@acme-hydraulics.example", "Sipho Dlamini"],
    ["f16f3dd1-c87c-4066-8a38-750d7bc31d65", "pieter@acme-hydraulics.example", "Pieter Botha"],
  ];
  for (const m of H.RPC.get_team_member_emails || []) {
    const t = team.find(x => x[0] === m.user_id);
    if (t) Object.assign(m, { email: t[1], full_name: t[2] });
  }
  (db.users || []).forEach(u => {
    const t = team.find(x => x[0] === u.id);
    if (t) Object.assign(u, { email: t[1], full_name: t[2] });
  });

  // Jobs with money attached, so Job profit tells a story.
  const SIPHO = team[1][0],
    PIETER = team[2][0];
  const jobs = [
    ["Pump overhaul", 0, 38500, 9 * 60, 12000, SIPHO, "completed"],
    ["Boom cylinder reseal", 1, 14200, 5 * 60, 3100, PIETER, "completed"],
    ["Emergency hose repair", 2, 6800, 7 * 60, 1900, SIPHO, "completed"],
    ["Press service", 3, 22000, 6 * 60, 4200, PIETER, "completed"],
    ["Tyre handler inspection", 4, 0, 90, 0, SIPHO, "scheduled"],
  ];
  jobs.forEach(([title, ci, amount, minutes, parts, who, status], i) => {
    const client = db.clients[ci],
      id = uuid(),
      date = iso(i * 3 + 1);
    db.jobs.push({ id, user_id: H.UID, team_id: TEAM, client_id: client.id, quote_id: null, job_number: `JOB-2026-${String(41 + i).padStart(4, "0")}`, title, description: title, status, priority: "normal", scheduled_date: status === "scheduled" ? iso(0) : date, scheduled_time: "08:00:00", location: client.location, assigned_to_user_id: who, assigned_to: team.find(t => t[0] === who)[2], technician_notes: "", work_done: "", parts_used: parts ? [{ description: "Parts", quantity: 1, cost_price: parts, unit_price: parts * 1.4, product_id: null }] : [], photos: [], started_at: date + "T06:00:00Z", completed_at: status === "completed" ? date + "T15:00:00Z" : null, created_at: date + "T05:00:00Z", updated_at: date + "T15:00:00Z", sync_status: "synced" });
    if (amount) db.invoices.push({ id: uuid(), user_id: H.UID, team_id: TEAM, client_id: client.id, quote_id: null, job_id: id, invoice_number: `INV-${String(210 + i).padStart(5, "0")}`, status: i === 2 ? "overdue" : i === 1 ? "paid" : "sent", issue_date: date, due_date: iso(i * 3 - 29), subtotal: amount, vat: amount * 0.15, total: amount * 1.15, amount_paid: i === 1 ? amount * 1.15 : 0, balance_due: i === 1 ? 0 : amount * 1.15, line_items: [{ description: title, qty: 1, unitPrice: amount }], notes: "", pdf_url: null, created_at: date + "T15:00:00Z", updated_at: date + "T15:00:00Z", sync_status: "synced" });
    if (minutes) db.time_entries.push({ id: uuid(), user_id: who, team_id: TEAM, job_id: id, client_id: client.id, kind: "work", started_at: date + "T06:00:00Z", ended_at: new Date(Date.parse(date + "T06:00:00Z") + minutes * 60000).toISOString(), billable: true, created_at: date + "T06:00:00Z", updated_at: date + "T06:00:00Z", sync_status: "synced" });
  });
  // A few won quotes, so the dashboard's pipeline has something in it.
  // (The dashboard is personal: these belong to Anna, who is signed in.)
  (db.quotes || []).forEach((q, i) => i < 2 && Object.assign(q, { status: "Accepted", value: [48500, 26300][i], user_id: H.UID, sent_date: iso(3) }));
  [["Call Thandi about the pump service contract", "09:00", 0], ["Site visit: boom cylinder check", "11:30", 1], ["Send quote for spare pump", "14:00", 2]].forEach(([title, time, ci]) =>
    db.followups.push({ id: uuid(), user_id: H.UID, team_id: TEAM, title, date: iso(0), time, completed: false, reminder: false, client: db.clients[ci].company, client_id: db.clients[ci].id, created_at: iso(1) + "T08:00:00Z", updated_at: iso(1) + "T08:00:00Z", sync_status: "synced" }),
  );
  [1, 2].forEach(n => {
    const start = iso(n) + "T06:30:00Z";
    db.time_entries.push({ id: uuid(), user_id: H.UID, team_id: TEAM, job_id: db.jobs[db.jobs.length - 5].id, client_id: db.clients[0].id, kind: "work", started_at: start, ended_at: new Date(Date.parse(start) + (7 - n) * 3600000).toISOString(), billable: true, created_at: start, updated_at: start, sync_status: "synced" });
  });
  db.suppliers.push(
    { id: uuid(), team_id: TEAM, name: "Hydraulic Supplies SA", contact_name: "Kobus", phone: "011 555 0199", email: "orders@hydsupplies.example", account_no: "ACME001", active: true, created_at: iso(30) + "T08:00:00Z" },
    { id: uuid(), team_id: TEAM, name: "Bearing & Seal Centre", contact_name: "Zanele", phone: "012 555 0142", email: "sales@bearingseal.example", account_no: "AH-77", active: true, created_at: iso(30) + "T08:00:00Z" },
  );
  db.purchase_orders.push(
    { id: uuid(), team_id: TEAM, po_number: "PO-0014", supplier_id: db.suppliers[0].id, supplier_name: db.suppliers[0].name, job_id: db.jobs[db.jobs.length - 5].id, status: "sent", order_date: iso(2), expected_date: iso(-2), lines: [{ description: "Seal kit 80mm", qty: 4, unit_cost: 640, received_qty: 0 }], subtotal: 2560, vat: 384, total: 2944, created_at: iso(2) + "T08:00:00Z" },
    { id: uuid(), team_id: TEAM, po_number: "PO-0013", supplier_id: db.suppliers[1].id, supplier_name: db.suppliers[1].name, job_id: null, status: "received", order_date: iso(9), lines: [{ description: "Hydraulic filter", qty: 10, unit_cost: 118, received_qty: 10 }], subtotal: 1180, vat: 177, total: 1357, created_at: iso(9) + "T08:00:00Z" },
  );
  db.form_templates.push({ id: uuid(), team_id: TEAM, name: "Job completion sign-off", description: "The customer confirms the work is done.", applies_to: "job", require_signature: true, active: true, fields: [
    { id: "a", type: "yesno", label: "Work completed as requested", required: true },
    { id: "b", type: "yesno", label: "Machine tested and working", required: true },
    { id: "c", type: "yesno", label: "Site left clean", required: true },
    { id: "d", type: "text", label: "Customer's name", required: true },
  ] });
}

(async () => {
  rebrand(H.db);
  const browser = await chromium.launch();
  const context = await H.newSimContext(browser, { recordVideo: { dir: OUT, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  const APP = H.APP;
  const caption = async text =>
    page.evaluate(t => {
      let el = document.getElementById("__demo_caption");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_caption";
        el.style.cssText = "position:fixed;left:10px;right:10px;bottom:18px;z-index:99999;background:rgba(17,17,20,.92);color:#fff;font:600 15px/1.35 system-ui,-apple-system,sans-serif;padding:12px 14px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none";
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, text);
  const go = async (screen, text, wait = 3200) => {
    await page.goto(`${APP}/?screen=${screen}`, { waitUntil: "load" });
    await page.waitForTimeout(1400);
    await caption(text);
    await page.waitForTimeout(wait);
  };
  const scroll = async (px, wait = 1200) => {
    await page.mouse.wheel(0, px);
    await page.waitForTimeout(wait);
  };

  await page.goto(`${APP}/?screen=Home`, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await caption("PowerMate: jobs, quotes, invoices and your team, on one phone app. Even underground, with no signal.");
  await page.waitForTimeout(4200);
  await go("Clients", "Every customer, with their quotes, jobs, invoices and machines.");
  await page.locator("button, [role=button], a").filter({ hasText: "Kopano Platinum Mine" }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await caption("One tap gives you everything about a customer (Client 360).");
  await page.waitForTimeout(3200);
  await go("Quotes", "Professional quotes with your logo. Customers accept and sign online.");
  await go("Schedule", "Schedule and dispatch: who is where, and what's next.");
  await go("Jobs", "Technicians work from their phone: clock in, notes, parts and photos.", 2200);
  await page.getByRole("button", { name: "Message customer" }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await caption("One tap sends the customer a WhatsApp or SMS: booked, on my way, job done.");
  await page.waitForTimeout(3800);
  await page.keyboard.press("Escape").catch(() => {});
  await page.goto(`${APP}/?screen=Jobs`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Fill in a form" }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  await caption("Safety checklists and job sign-offs, signed on site. They send later if there's no signal.");
  for (const b of await page.getByRole("button", { name: "Yes", exact: true }).all()) {
    await b.click().catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.locator('label:has-text("Customer\'s name") input').fill("Thandi Mokoena").catch(() => {});
  const pad = page.getByLabel("Sign here");
  const box = await pad.boundingBox().catch(() => null);
  if (box) {
    await page.mouse.move(box.x + 30, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 30, { steps: 10 });
    await page.mouse.move(box.x + 150, box.y + 80, { steps: 10 });
    await page.mouse.move(box.x + 230, box.y + 40, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(1500);
  await go("Timesheets", "Clock in and out per job: timesheets and labour costs without paperwork.");
  await go("Products", "Products and stock with part numbers. Parts used on jobs come off stock.");
  await go("Purchasing", "Order parts from suppliers, send the PO, receive it into stock.");
  await go("Invoices", "Invoices with 'Pay now' by card or EFT (PayFast) and automatic reminders.");
  await go("JobProfit", "Job profit: see which jobs, customers and technicians make money.", 3800);
  await page.getByRole("button", { name: "Technicians" }).click().catch(() => {});
  await page.waitForTimeout(2600);
  await go("Equipment", "Every machine on record, with a QR code: scan it to see its history or report a breakdown.");
  await go("Expenses", "Receipts scanned into expenses, ready for Sage, Xero or QuickBooks.");
  await page.goto(`${APP}/?screen=Home`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await go("Home", "PowerMate: built in South Africa for industrial service teams. Try it free for 14 days.", 4500);

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video.path();
  fs.copyFileSync(raw, path.join(OUT, "demo.webm"));
  console.log("DEMO RECORDED " + path.join(OUT, "demo.webm"));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
