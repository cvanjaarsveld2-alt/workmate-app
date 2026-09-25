// PowerMate browser simulation: drives the built app against an in-memory
// PostgREST / Storage / Functions emulator seeded with synthetic data shaped
// like production (tests/sim/synth.cjs). No request leaves the machine; every
// write is validated against the production schema (tests/sim/schema.json) so
// unknown columns, bad types and missing NOT NULL values fail like they would live.
// Run with: npm run test:sim
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");

const DIR = __dirname;
const OUT = path.join(DIR, "out", process.env.SIM_OUT || "run");
fs.mkdirSync(OUT, { recursive: true });
const SUPA = "https://hrqzqyfvbfzrfnuxovvr.supabase.co";
const APP = process.env.SIM_APP_URL || "http://localhost:4173";
const UID = process.env.SIM_UID || "431dcb72-ea3f-43ed-9f73-74384e862300";
const EMAIL = process.env.SIM_EMAIL || "cvanjaarsveld2@icloud.com";

const schema = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(DIR, "schema.json"), "utf8"))).map(([t, s]) => [t, Object.fromEntries(s.split(",").map(c => { const [n, ty] = c.split(":"); return [n, { type: ty.replace("!", ""), required: ty.endsWith("!") }]; }))]));
const real = require("./synth.cjs")();
const RPC = real._rpc;
const TEAM = RPC.current_team_id;

// ─── Synthetic personal data, shaped like production (see report) ───────────
const uuid = () => crypto.randomUUID();
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const ITEMS = ["Body / Frame","Windshield","Tyres / Wheels (incl. Spare)","Fluids — Engine Oil","Battery","Headlight — Low Beam","Seat Belts","Fire Extinguisher","First Aid Kit","Hooter"];
const vc = Array.from({ length: 20 }, (_, i) => {
  const date = day(i + 1);
  const items = Object.fromEntries(ITEMS.map((k, j) => [k, { status: (i + j) % 9 === 0 ? "issue" : "ok", comment: (i + j) % 9 === 0 ? "Needs attention" : "" }]));
  const dayData = { items, generalComment: i % 5 === 0 ? "All good" : "", ...(i % 7 === 0 ? { submitted: true } : {}) };
  // 85 of 90 production rows store data as a JSON *string*; mirror that ratio.
  return { id: `vehicle_check_${UID}_${date}`, user_id: UID, check_date: date, vehicle: "Toyota Hilux", registration: "SIM 123 GP", driver: "Sim Driver", data: i < 18 ? JSON.stringify(dayData) : dayData, sync_status: "synced", created_at: date + "T06:00:00Z", updated_at: date + "T06:00:00Z", team_id: TEAM };
});
const CATS = ["Other","Other","Meals & Entertainment","Fuel","Fuel","Travel","Accommodation","Tools & Equipment","Office"];
const expenses = Array.from({ length: 40 }, (_, i) => {
  const cur = i < 34 ? "ZAR" : i < 39 ? "GHS" : "USD";
  const amount = Math.round((150 + i * 37.5) * 100) / 100;
  const rate = cur === "ZAR" ? 1 : cur === "GHS" ? 1.62 : 18.1;
  return { id: uuid(), user_id: UID, vendor: `Sim Vendor ${i}`, amount, vat_amount: Math.round(amount * 0.13 * 100) / 100, currency: cur, expense_date: day(i * 2), expense_time: "10:15", category: CATS[i % CATS.length], payment_method: i % 3 ? "Card" : "Cash", notes: i % 4 ? "" : "Site visit", receipt_url: i === 5 || i === 9 ? null : `receipts/${UID}/receipts/${uuid()}.jpg`, status: i % 2 ? "submitted" : "unsubmitted", ai_extracted: i % 3 === 0, sync_status: "synced", created_at: day(i * 2) + "T10:00:00Z", updated_at: day(i * 2) + "T10:00:00Z", amount_zar: Math.round(amount * rate * 100) / 100, exchange_rate: rate, rate_date: day(i * 2), rate_source: cur === "ZAR" ? null : "frankfurter", payment_slip_url: i % 4 === 0 ? `receipts/${UID}/payment-slips/${uuid()}.jpg` : null, client_id: null, client_name: null, no_receipt: i === 5 || i === 9, team_id: TEAM, gl_code: i % 9 === 0 ? "5200" : null, vat_number: null, gr_code: null };
});
const client0 = real.clients[0];
const job0 = real.jobs[0];
const equipment = [0, 1, 2].map(i => ({ id: uuid(), user_id: UID, client_id: real.clients[i]?.id || null, name: `Sim Loader ${i}`, model: "LH410", notes: "", created_at: day(30) + "T08:00:00Z", type: "LHD", make: "Sandvik", serial: `SN-${i}00`, location: "Shaft 2", client: real.clients[i]?.company || "", service_due: day(i * 20 - 15), media: [], sync_status: "synced", team_id: TEAM, assigned_to_user_id: null, assigned_to: null, updated_at: day(30) + "T08:00:00Z" }));
const leads = ["New","Qualified","Proposal","Won"].map((stage, i) => ({ id: uuid(), user_id: UID, team_id: TEAM, title: `Sim lead ${i}`, description: "Brake reline", categories: i % 2 ? "jacks,tyres" : "ausco", client_id: client0?.id || null, client_name: client0?.company || "", contact_id: null, contact_name: "", captured_by: EMAIL, assigned_to: null, stage, estimated_value: 25000 * (i + 1), lead_date: day(10 + i), follow_up_date: day(-3 - i), closed_date: stage === "Won" ? day(1) : null, notes: "", outcome_notes: "", sync_status: "synced", created_at: day(10 + i) + "T09:00:00Z", updated_at: day(10 + i) + "T09:00:00Z", assigned_to_user_id: null }));
const photo = { id: uuid(), url: `${SUPA}/storage/v1/object/sign/powermate-media/sim/photo.jpg?token=t`, storage_path: "sim/photo.jpg" };
const breakdown_reports = [0, 1].map(i => ({ id: uuid(), user_id: UID, team_id: TEAM, client_id: client0?.id || null, client_name: client0?.company || "", title: `Sim breakdown ${i}`, reference: `BD-${100 + i}`, equipment: "LH410", location: "Shaft 2", status: i ? "closed" : "open", severity: i ? "Low" : "High", summary: "Hydraulic leak", items: [{ id: uuid(), fault: "Hydraulic hose burst", notes: "Replaced", photos: [photo] }], engineering: {}, breakdown_datetime: day(3 + i) + "T09:00", reported_by: "Sim", report_date: day(3 + i), assigned_to_user_id: null, assigned_to: null, sync_status: "synced", created_at: day(3 + i) + "T09:00:00Z", updated_at: day(3 + i) + "T09:00:00Z" }));
const repair_reports = [{ id: uuid(), user_id: UID, team_id: TEAM, client_id: client0?.id || null, client_name: client0?.company || "", title: "Sim repair", reference: "RP-1", equipment: "LH410", location: "Workshop", status: "completed", summary: "Hose replaced", linked_breakdown_id: breakdown_reports[0].id, items: [{ id: uuid(), task: "Replace hose", photos: [photo] }], report_date: day(2), assigned_to_user_id: null, assigned_to: null, sync_status: "synced", created_at: day(2) + "T09:00:00Z", updated_at: day(2) + "T09:00:00Z" }];
const invoices = job0 ? [{ id: uuid(), user_id: UID, team_id: TEAM, client_id: job0.client_id, quote_id: job0.quote_id, job_id: job0.id, invoice_number: "INV-2026-000001", status: "partially_paid", issue_date: day(5), due_date: day(-25), subtotal: 10000, vat: 1500, total: 11500, amount_paid: 5000, balance_due: 6500, line_items: [{ description: "Service", qty: 1, unitPrice: 10000 }], notes: "", pdf_url: null, created_at: day(5) + "T09:00:00Z", updated_at: day(5) + "T09:00:00Z", sync_status: "synced" }] : [];
const payments = invoices.map(inv => ({ id: uuid(), user_id: UID, team_id: TEAM, invoice_id: inv.id, amount: 5000, payment_date: day(2), method: "EFT", reference: "SIM-PAY", notes: "", created_at: day(2) + "T09:00:00Z", updated_at: day(2) + "T09:00:00Z", sync_status: "synced", idempotency_key: uuid() }));
const activities = Array.from({ length: 5 }, (_, i) => ({ id: uuid(), user_id: UID, team_id: TEAM, client_id: real.clients[i]?.id || null, client_name: real.clients[i]?.company || "", activity_type: ["call","visit","email","meeting","call"][i], summary: "Sim activity", outcome: "positive", duration_mins: 15 + i * 5, sync_status: "synced", created_at: day(i) + "T09:00:00Z", assigned_to_user_id: null, updated_at: day(i) + "T09:00:00Z" }));
const email_quotes = [0, 1, 2].map(i => ({ id: uuid(), user_id: UID, gmail_message_id: `sim-${i}`, direction: "sent", to_address: "buyer@example.com", from_address: "quotes@example.com", subject: `Quote Q-${900 + i}`, snippet: "Please find attached", sent_at: day(i) + "T08:00:00Z", extracted_client_name: client0?.company || "Sim", extracted_amount: 18450 + i, extracted_currency: "ZAR", extracted_quote_ref: `Q-${900 + i}`, extraction_confidence: ["high","medium","low"][i], matched_client_id: null, status: "new", promoted_quote_id: null, sync_status: "synced", created_at: day(i) + "T08:00:00Z", updated_at: day(i) + "T08:00:00Z" }));
const team_notifications = real.quotes.slice(0, 2).map((q, i) => ({ id: uuid(), team_id: TEAM, from_user_id: RPC.get_team_member_emails.find(m => m.user_id !== UID)?.user_id, to_user_id: UID, record_type: "quote", record_id: q.id, record_title: q.client_name || "Quote", message: "Please follow up", read: i === 1, created_at: day(i) + "T08:00:00Z", accepted: null, accepted_at: null, copied_record_id: null }));
const machine_jack_confirmations = [{ id: uuid(), user_id: UID, team_id: TEAM, brand: "Sandvik", model: "LH410", closed_height: 250, jack_overrides: ["J-30T"], jack_stand: "Stand A", note: "", created_at: day(4) + "T08:00:00Z", updated_at: day(4) + "T08:00:00Z" }];

const db = { ...Object.fromEntries(Object.keys(schema).map(t => [t, []])), ...Object.fromEntries(Object.entries(real).filter(([k]) => k !== "_rpc")),
  vehicle_checks: vc, expenses, equipment, leads, breakdown_reports, repair_reports, invoices, payments, activities, email_quotes, team_notifications, machine_jack_confirmations, custom_faults: [{ id: uuid(), user_id: UID, team_id: TEAM, label: "Sim fault", fault_group: "Hydraulics", sync_status: "synced", created_at: day(9) + "T08:00:00Z", updated_at: day(9) + "T08:00:00Z" }] };
if (!db.team_members.length) db.team_members = RPC.get_team_member_emails.map(m => ({ id: uuid(), team_id: TEAM, user_id: m.user_id, role: m.role, joined_at: m.joined_at }));

// ─── Emulator ────────────────────────────────────────────────────────────────
const log = { writes: [], violations: [], errors4xx: [], unhandled: [], functions: [], storage: [], reads: [] };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(table, row) {
  const cols = schema[table];
  if (!cols) return null;
  for (const [k, v] of Object.entries(row)) {
    const c = cols[k];
    if (!c) return { code: "PGRST204", message: `Could not find the '${k}' column of '${table}' in the schema cache` };
    if (v === null || v === undefined) continue;
    if (c.type === "uuid" && !UUID_RE.test(String(v))) return { code: "22P02", message: `invalid input syntax for type uuid: "${v}" (${table}.${k})` };
    if (c.type === "date" && !/^\d{4}-\d{2}-\d{2}/.test(String(v))) return { code: "22007", message: `invalid input syntax for type date: "${v}" (${table}.${k})` };
    if (["numeric", "integer", "bigint"].includes(c.type) && (v === "" || Number.isNaN(Number(v)))) return { code: "22P02", message: `invalid input syntax for type ${c.type}: "${v}" (${table}.${k})` };
    if (c.type === "time" && v !== "" && !/^\d{2}:\d{2}/.test(String(v))) return { code: "22007", message: `invalid time "${v}" (${table}.${k})` };
    if (c.type === "time" && v === "") return { code: "22007", message: `invalid input syntax for type time: "" (${table}.${k})` };
  }
  if (!validate.insert) return null;
  for (const [k, c] of Object.entries(cols)) if (c.required && (row[k] === null || row[k] === undefined) && k !== "id") return { code: "23502", message: `null value in column "${k}" of relation "${table}" violates not-null constraint` };
  return null;
}
function parseVal(v) { if (v === "null") return null; if (v === "true") return true; if (v === "false") return false; return v; }
function matchFilter(row, col, expr) {
  const neg = expr.startsWith("not."); if (neg) expr = expr.slice(4);
  const i = expr.indexOf("."); const op = expr.slice(0, i); const raw = decodeURIComponent(expr.slice(i + 1));
  const val = row[col]; let r;
  switch (op) {
    case "eq": r = String(val) === String(parseVal(raw)); break;
    case "neq": r = String(val) !== String(parseVal(raw)); break;
    case "is": r = parseVal(raw) === null ? val === null || val === undefined : val === parseVal(raw); break;
    case "in": r = raw.replace(/^\(|\)$/g, "").split(",").map(s => s.replace(/^"|"$/g, "")).includes(String(val)); break;
    case "gt": case "gte": case "lt": case "lte": {
      const a = Date.parse(val), b = Date.parse(raw), dates = /\d{4}-\d{2}-\d{2}T/.test(String(raw)) && Number.isFinite(a) && Number.isFinite(b);
      const x = dates ? a : val, y = dates ? b : raw;
      r = op === "gt" ? x > y : op === "gte" ? x >= y : op === "lt" ? x < y : x <= y; break;
    }
    case "ilike": case "like": { const re = new RegExp("^" + raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$", op === "ilike" ? "i" : ""); r = re.test(String(val ?? "")); break; }
    default: log.unhandled.push(`filter op ${op} on ${col}`); r = true;
  }
  return neg ? !r : r;
}
function query(table, url) {
  let rows = [...(db[table] || [])];
  const p = url.searchParams;
  for (const [k, v] of p) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(k)) continue;
    if (k === "or") { log.unhandled.push(`or filter on ${table}`); continue; }
    if (schema[table] && !schema[table][k]) { log.violations.push({ screen: screenTag, table, method: "GET", code: "42703", message: `column ${table}.${k} does not exist` }); return { error: { code: "42703", message: `column ${table}.${k} does not exist` } }; }
    rows = rows.filter(r => matchFilter(r, k, v));
  }
  const order = p.get("order");
  if (order) for (const part of order.split(",").reverse()) { const [c, dir] = part.split("."); rows.sort((a, b) => { const x = a[c] ?? "", y = b[c] ?? ""; return (x > y ? 1 : x < y ? -1 : 0) * (dir === "desc" ? -1 : 1); }); }
  const total = rows.length;
  const off = +p.get("offset") || 0; const lim = p.get("limit") ? +p.get("limit") : Infinity;
  rows = rows.slice(off, off + lim);
  const sel = p.get("select");
  if (sel && sel !== "*" && !sel.includes("(")) { const cols = sel.split(",").map(s => s.split(":").pop().trim()); rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]]))); }
  return { rows, total };
}
const json = (route, status, body, headers = {}) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", ...headers }, body: body === undefined ? "" : JSON.stringify(body) });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const JWT = b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: UID, email: EMAIL, role: "authenticated", aud: "authenticated", exp, session_id: "sim" }) + ".sig";
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: EMAIL, email_confirmed_at: day(90) + "T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: { full_name: "Christo van Jaarsveld" }, created_at: day(90) + "T00:00:00Z" };
let screenTag = "boot";

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const m = req.method(); const p = url.pathname;
  if (process.env.SIM_TRACE) console.log('REQ', screenTag, m, p, url.search.slice(0,120));
  if (m === "GET" && p.startsWith("/rest/v1/")) log.reads.push({ table: p.split("/").pop(), search: url.search });
  if (m === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
  if (p.startsWith("/auth/v1/")) {
    if (p.endsWith("/user")) return json(route, 200, USER);
    if (p.endsWith("/token")) return json(route, 200, { access_token: JWT, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "sim", user: USER });
    if (p.endsWith("/logout")) return json(route, 204);
    return json(route, 200, {});
  }
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.split("/").pop();
    const OWNER = "431dcb72-ea3f-43ed-9f73-74384e862300";
    const me = (db.team_members || []).find(m => m.user_id === UID) || {};
    const access = { team_id: TEAM, owner_user_id: OWNER, is_owner: UID === OWNER, role: me.role || "member", can_view_team: UID === OWNER || !!me.can_view_team, request_pending: (db.team_notifications || []).some(n => n.from_user_id === UID && n.record_type === "team_view_request" && !n.read) };
    let body = {}; try { body = req.postDataJSON() || {}; } catch {}
    if (fn === "set_member_access") { if (UID !== OWNER) return json(route, 400, { code: "P0001", message: "Only the master account can change roles or access" }); const row = db.team_members.find(m => m.user_id === body.p_user_id); if (row) { if (body.p_role) row.role = body.p_role; if (body.p_can_view_team !== null && body.p_can_view_team !== undefined) row.can_view_team = body.p_can_view_team; } log.writes.push({ screen: screenTag, kind: "rpc", fn, body }); return json(route, 200, null); }
    if (fn === "remove_team_member") {
      // Mirrors private.remove_team_member: owner only; team work moves to the chosen teammate.
      if (UID !== OWNER) return json(route, 400, { code: "P0001", message: "Only the master account can remove a teammate" });
      if (body.p_user_id === OWNER) return json(route, 400, { code: "P0001", message: "The master account cannot be removed" });
      if (!db.team_members.some(m => m.user_id === body.p_reassign_to) || body.p_reassign_to === body.p_user_id) return json(route, 400, { code: "P0001", message: "Choose a teammate to take over their work" });
      let moved = 0, assigned = 0;
      for (const t of ["clients", "contacts", "followups", "quotes", "notes", "equipment", "leads", "activities", "jobs", "breakdown_reports", "repair_reports"])
        for (const r of db[t] || []) {
          if (r.team_id !== TEAM) continue;
          if (r.user_id === body.p_user_id) { r.user_id = body.p_reassign_to; r.updated_at = new Date().toISOString(); moved++; }
          if (r.assigned_to_user_id === body.p_user_id) { r.assigned_to_user_id = body.p_reassign_to; r.updated_at = new Date().toISOString(); assigned++; }
        }
      db.team_members = db.team_members.filter(m => m.user_id !== body.p_user_id);
      log.writes.push({ screen: screenTag, kind: "rpc", fn, body });
      return json(route, 200, { records_moved: moved, assignments_moved: assigned, login_blocked: body.p_block_login !== false });
    }
    // Company sign-up: a person with no company creates one or joins with a code.
    if (fn === "create_team_for_user") { const team = { id: uuid(), name: body.p_name, invite_code: "NEWCO2345678", created_at: new Date().toISOString(), owner_user_id: UID }; db.teams.push(team); db.team_members.push({ id: uuid(), team_id: team.id, user_id: UID, role: "admin", joined_at: team.created_at, can_view_team: true }); (db.team_profiles ||= []).push({ id: uuid(), team_id: team.id, trading_name: body.p_name, quote_validity_days: 30, payment_terms_days: 30, invoice_prefix: "INV-", next_invoice_number: 1, brand_color: "#8B1A1A", vat_registered: true }); log.writes.push({ screen: screenTag, kind: "rpc", fn, body }); return json(route, 200, team); }
    if (fn === "join_team_by_code") { const team = db.teams.find(t => String(t.invite_code).toUpperCase() === String(body.p_invite_code).toUpperCase()); if (!team) return json(route, 400, { code: "P0001", message: "Invalid invite code" }); db.team_members.push({ id: uuid(), team_id: team.id, user_id: UID, role: "member", joined_at: new Date().toISOString(), can_view_team: false }); log.writes.push({ screen: screenTag, kind: "rpc", fn, body }); return json(route, 200, team); }
    if (fn === "accept_terms") { log.writes.push({ screen: screenTag, kind: "rpc", fn, body }); return json(route, 200, null); }
    if (fn === "set_my_hidden_screens") { const bad = (body.p_screens || []).some(x => !/^[A-Za-z0-9]{1,40}$/.test(x)); if (bad) return json(route, 400, { code: "P0001", message: "Invalid screen name" }); const me = (db.users || []).find(u => u.id === UID); if (me) me.hidden_screens = [...new Set(body.p_screens)].sort(); log.writes.push({ screen: screenTag, kind: "rpc", fn, body }); return json(route, 200, null); }
    if (fn === "request_team_view") { db.team_notifications.push({ id: uuid(), team_id: TEAM, from_user_id: UID, to_user_id: OWNER, record_type: "team_view_request", record_id: UID, record_title: "Whole-team view", message: "asked", read: false, accepted: false, created_at: new Date().toISOString() }); log.writes.push({ screen: screenTag, kind: "rpc", fn }); return json(route, 200, null); }
    const map = { current_team_id: TEAM, get_my_effective_role: RPC.get_my_effective_role, get_team_member_emails: RPC.get_team_member_emails, get_my_team_access: access, set_my_timezone: null, regenerate_invite_code: "SIMNEWCODE234", my_team_plan: { plan: "free", status: "active", trial_ends_at: null, paid_until: null, access: "full" }, is_platform_admin: UID === OWNER, admin_list_companies: UID === OWNER ? [{ id: TEAM, name: "Power Works", created_at: day(90) + "T08:00:00Z", owner_email: "cvanjaarsveld2@icloud.com", members: 3, last_active: new Date().toISOString(), clients: 40, quotes: 12, invoices: 1, plan: "free", status: "active", trial_ends_at: null, paid_until: null, seats: null, notes: null, access: "full" }] : null, get_platform_settings: UID === OWNER ? { signup_mode: "restricted", allowed_domains: ["pwrstart.com"], signup_codes: [] } : null, admin_update_plan: null, set_platform_setting: null, admin_answer_ticket: null };
    if (!(fn in map)) log.writes.push({ screen: screenTag, kind: "rpc", fn, body: req.postDataJSON?.() });
    return json(route, 200, fn in map ? map[fn] : null);
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.split("/")[3];
    if (!schema[table]) { log.errors4xx.push({ screen: screenTag, table, m, reason: "unknown table" }); return json(route, 404, { code: "42P01", message: `relation "public.${table}" does not exist` }); }
    if (m === "GET" || m === "HEAD") {
      const q = query(table, url);
      if (q.error) return json(route, 400, q.error);
      const { rows, total } = q;
      const headers = { "content-range": `0-${Math.max(0, rows.length - 1)}/${total}` };
      if ((req.headers()["accept"] || "").includes("vnd.pgrst.object")) { if (rows.length !== 1) return json(route, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }); return json(route, 200, rows[0], headers); }
      return m === "HEAD" ? route.fulfill({ status: 200, headers: { ...headers, "access-control-allow-origin": "*" } }) : json(route, 200, rows, headers);
    }
    let body = null; try { body = req.postDataJSON(); } catch {}
    const rowsIn = Array.isArray(body) ? body : body ? [body] : [];
    if (m === "POST" || m === "PATCH") {
      validate.insert = m === "POST";
      for (const row of rowsIn) {
        const v = validate(table, row);
        if (v) { log.violations.push({ screen: screenTag, table, method: m, ...v }); return json(route, 400, v); }
      }
      if (m === "PATCH") { const { rows } = query(table, url); rows.forEach(r => { const live = db[table].find(x => x.id === r.id); Object.assign(live, body); }); log.writes.push({ screen: screenTag, kind: "update", table, n: rows.length, keys: Object.keys(body || {}) }); }
      else for (const row of rowsIn) { const key = url.searchParams.get("on_conflict") || "id"; const i = db[table].findIndex(x => row[key] && x[key] === row[key]); if (i >= 0) db[table][i] = { ...db[table][i], ...row }; else db[table].push({ id: row.id || uuid(), ...row }); log.writes.push({ screen: screenTag, kind: url.searchParams.get("on_conflict") || (req.headers()["prefer"] || "").includes("merge") ? "upsert" : "insert", table, id: row.id, keys: Object.keys(row) }); }
      const ret = (req.headers()["prefer"] || "").includes("return=representation");
      return json(route, m === "POST" ? 201 : 200, ret ? rowsIn : undefined);
    }
    if (m === "DELETE") { const { rows } = query(table, url); db[table] = db[table].filter(r => !rows.includes(r) && !rows.some(x => x.id === r.id)); log.writes.push({ screen: screenTag, kind: "delete", table, n: rows.length }); return json(route, 204); }
  }
  if (p.startsWith("/storage/v1/")) {
    log.storage.push({ screen: screenTag, m, p: p.replace(/[0-9a-f-]{36}/g, "<id>") });
    if (p.includes("/object/sign/")) {
      const objPath = p.split("/object/sign/")[1];
      if (m === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
      if (/\/no-receipt$|\/undefined$|\/null$|\/not-mine\//.test(objPath)) { log.errors4xx.push({ screen: screenTag, storage: "sign", path: objPath.split("/").slice(1).join("/"), status: 400 }); return json(route, 400, { statusCode: "400", error: "invalid", message: "Object not found" }); }
      let body = {}; try { body = req.postDataJSON() || {}; } catch {}
      if (body.paths) return json(route, 200, body.paths.map(x => ({ path: x, signedURL: `/object/sign/${objPath}/${x}?token=sim`, error: null })));
      return json(route, 200, { signedURL: `/object/sign/${objPath}?token=sim` });
    }
    // Every PowerMate bucket is private: like production, public links are refused.
    if (p.includes("/object/public/")) { log.storage.push({ screen: screenTag, refusedPublic: true }); return json(route, 400, { statusCode: "400", error: "Bucket not found", message: "Bucket not found" }); }
    if (m === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    if (m === "POST" || m === "PUT") return json(route, 200, { Key: p.split("/object/")[1], Id: uuid() });
    if (m === "DELETE") return json(route, 200, []);
    return json(route, 200, {});
  }
  if (p.startsWith("/functions/v1/")) {
    const fn = p.split("/").pop(); log.functions.push({ screen: screenTag, fn });
    const canned = { "technician-assist": { mode: "fallback", advice: { diagnosis: "Check hydraulic pressure", checks: ["Inspect hoses"], safety: "Isolate machine" } }, "polish-sales-email": { ok: true, mode: "fallback", email: { subject: "Sim", body: "Sim body" } }, "historical-rate": { rate: 1.62, date: day(1), source: "sim" }, "send-notifications": { ok: true, sent: 0 } };
    return json(route, 200, canned[fn] || { ok: true });
  }
  if (p.startsWith("/realtime/")) return route.abort();
  log.unhandled.push(`${m} ${p}`); return json(route, 404, {});
}

async function newSimContext(browser, { serviceWorkers = "block" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers, colorScheme: process.env.SIM_DARK ? "dark" : "light" });
  await context.route(`${SUPA}/**`, handle);
  await context.route("https://api.frankfurter.app/**", r => json(r, 200, { amount: 1, base: "GHS", date: day(1), rates: { ZAR: 1.62 } }));
  await context.route(/^https:\/\/(?!localhost)/, r => { if (r.request().url().startsWith(SUPA)) return handle(r); log.unhandled.push("external " + new URL(r.request().url()).host); return r.abort(); });
  await context.addInitScript(({ UID, session }) => {
    try {
      if (!localStorage.getItem("__sim_seeded")) {
        localStorage.setItem("sb-hrqzqyfvbfzrfnuxovvr-auth-token", JSON.stringify(session));
        localStorage.setItem(`pm_pin_disabled__${UID}`, "1");
        localStorage.setItem(`pm_onboarded_${UID}`, "1");
        localStorage.setItem("__sim_seeded", "1");
      }
    } catch {}
  }, { UID, session: { access_token: JWT, refresh_token: "sim", expires_at: exp, expires_in: 86400, token_type: "bearer", user: USER } });
  return context;
}

async function run() {
  const browser = await chromium.launch();
  const context = await newSimContext(browser);

  const page = await context.newPage();
  const perScreen = {};
  const cur = () => (perScreen[screenTag] ||= { pageErrors: [], consoleErrors: [], boundary: false, text: 0 });
  page.on("pageerror", e => cur().pageErrors.push(String(e.message).slice(0, 300)));
  page.on("console", msg => { if (msg.type() === "error") cur().consoleErrors.push(msg.text().slice(0, 300)); });

  const screens = process.env.SIM_SCREENS ? process.env.SIM_SCREENS.split(",").filter(Boolean) : ["Home","Clients","Contacts","Followups","Notes","Equipment","Quotes","Expenses","More","Planner","ColdCall","JackSelector","Meeting","Breakdown","Repair","Diagnostics","BackfillZAR","Analytics","Leads","Team","VehicleCheck","Notifications","SharedInbox","Jobs","Invoices","Client360","Calendar","TeamDashboard"];
  screenTag = "boot";
  await page.goto(`${APP}/?screen=Home`, { waitUntil: "load" });
  await page.waitForTimeout(6000); // first pull + IndexedDB hydrate
  for (const s of screens) {
    screenTag = s;
    await page.goto(`${APP}/?screen=${s}`, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    const r = cur();
    r.boundary = (await page.getByText("Something went wrong").count()) > 0;
    r.text = (await page.evaluate(() => document.body.innerText.length));
    r.loginShown = (await page.getByText("Field service CRM").count()) > 0;
    await page.screenshot({ path: path.join(OUT, `${s}.png`) });
  }
  fs.writeFileSync(path.join(OUT, "screens.json"), JSON.stringify(perScreen, null, 1));
  fs.writeFileSync(path.join(OUT, "log.json"), JSON.stringify(log, null, 1));
  // hand the live objects to the flows script
  return { browser, context, page, perScreen, log, db, setTag: t => { screenTag = t; } };
}
module.exports = { run, newSimContext, db, log, UID, TEAM, APP };
if (require.main === module) run().then(async ({ browser }) => { await browser.close(); console.log("done"); }).catch(e => { console.error(e); process.exit(1); });
