// Interactive flows on top of harness.cjs. Each flow records PASS/FAIL/INFO with
// evidence; writes land in the in-memory emulator and are schema-validated.
process.env.SIM_SCREENS = process.env.SIM_SCREENS || "Home";
const fs = require("fs"), path = require("path");
const H = require("./harness.cjs");
const OUT = path.join(__dirname, "out", process.env.SIM_OUT || "run");
const results = [];
const rec = (flow, status, detail) => { results.push({ flow, status, detail }); console.log(status.padEnd(4), flow, "—", detail); };

(async () => {
  const S = await H.run();
  const { page, context, log, db, setTag } = S;
  const go = async (screen, wait = 3000) => { setTag(screen); await page.goto(`${H.APP}/?screen=${screen}`, { waitUntil: "load" }); await page.waitForTimeout(wait); };
  const shot = n => page.screenshot({ path: path.join(OUT, `flow-${n}.png`) });
  const writesFor = (table, since) => log.writes.slice(since).filter(w => w.table === table);
  const errsSince = n => log.violations.slice(n);
  const safe = async (name, fn) => { try { await fn(); } catch (e) { rec(name, "FAIL", "script error: " + String(e.message).split("\n")[0].slice(0, 200)); await shot(name.replace(/\W+/g, "_")).catch(() => {}); } };

  // 1. Historic vehicle checks render (85/90 prod rows store data as a JSON string)
  await safe("vehicle: historic day renders", async () => {
    await go("VehicleCheck");
    const d = new Date(); d.setDate(d.getDate() - 1);
    const wd = d.toLocaleDateString("en-US", { weekday: "short" });
    await page.locator("button", { hasText: new RegExp(`^\\s*${wd}\\s*${d.getDate()}\\s*$`) }).first().click();
    await page.waitForTimeout(800);
    await shot("vehicle-yesterday");
    const body = await page.evaluate(() => document.body.innerText);
    const status = (body.match(/\d+ issues? flagged|\d+ \/ \d+ checked|All good[^\n]*/i) || ["?"])[0];
    rec("vehicle: historic day renders", /2 issues flagged/.test(status) ? "PASS" : "FAIL", `yesterday shows "${status}" (seeded: 10 answered, 2 issues, stored as JSON text like 85/90 prod rows)`);
  });
  await safe("vehicle: history tab", async () => {
    await page.getByText("History", { exact: true }).click(); await page.waitForTimeout(1000);
    await shot("vehicle-history");
    const body = await page.evaluate(() => document.body.innerText);
    rec("vehicle: history tab", /Needs attention|issue|Issue|\d+\s*\/\s*\d+/.test(body) ? "PASS" : "FAIL", "history text sample: " + body.replace(/\s+/g, " ").slice(0, 160));
  });

  // 2. Two quick taps on today's check, then reload: both must survive
  await safe("vehicle: two quick taps persist", async () => {
    await go("VehicleCheck");
    const w0 = log.writes.length, v0 = log.violations.length;
    await page.getByText("Windshield", { exact: true }).first().click();
    await page.getByText("Battery", { exact: true }).first().click();
    await page.waitForTimeout(2500);
    const today = new Date().toISOString().slice(0, 10);
    const row = db.vehicle_checks.find(r => r.check_date === today);
    const data = row ? (typeof row.data === "string" ? JSON.parse(row.data) : row.data) : null;
    const serverOk = data?.items?.Windshield?.status === "ok" && data?.items?.Battery?.status === "ok";
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(3500);
    const txt = await page.locator("text=/\\d+ \\/ \\d+ checked/").first().innerText();
    await shot("vehicle-two-taps");
    rec("vehicle: two quick taps persist", serverOk && txt.startsWith("2 /") ? "PASS" : "FAIL", `server row has both=${serverOk}; after reload UI shows "${txt}"; writes=${writesFor("vehicle_checks", w0).length}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });
  await safe("vehicle: mark all OK", async () => {
    const v0 = log.violations.length;
    await page.getByText(/All Good — Mark Everything OK|All Good — Tap to re-confirm/).first().click(); await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);
    const today = new Date().toISOString().slice(0, 10);
    const row = db.vehicle_checks.find(r => r.check_date === today);
    const data = row ? (typeof row.data === "string" ? JSON.parse(row.data) : row.data) : {};
    const okCount = Object.values(data.items || {}).filter(i => i.status === "ok").length;
    rec("vehicle: mark all OK", okCount === 51 ? "PASS" : "FAIL", `server has ${okCount}/51 OK; UI "${(body.match(/All good[^\n]*|\d+ \/ \d+ checked/i) || ["?"])[0]}"; schema errors=${JSON.stringify(errsSince(v0))}`);
  });

  // 3. Add an expense through the form
  await safe("expenses: add manual expense", async () => {
    await go("Expenses");
    const w0 = log.writes.length, v0 = log.violations.length, before = db.expenses.length;
    await page.getByRole("button", { name: "No slip" }).click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("e.g. Engen Garage").fill("SIM Engen Test");
    await page.getByPlaceholder("0.00").first().fill("456.78");
    await shot("expense-form");
    await page.getByRole("button", { name: /Save Expense/ }).last().click();
    await page.waitForTimeout(3000);
    const row = db.expenses.find(e => e.vendor === "SIM Engen Test");
    rec("expenses: add manual expense", row ? "PASS" : "FAIL", `server rows ${before}→${db.expenses.length}; amount=${row?.amount} amount_zar=${row?.amount_zar} gl=${row?.gl_code}; writes=${writesFor("expenses", w0).length}; schema errors=${JSON.stringify(errsSince(v0))}`);
    await shot("expense-after");
  });

  // 4. Add a note
  await safe("notes: add note", async () => {
    await go("Notes");
    const v0 = log.violations.length, before = db.notes.length;
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Type your visit note…").fill("SIM note from simulation");
    await shot("note-form");
    await page.getByRole("button", { name: /^Add Note/ }).last().click(); await page.waitForTimeout(3000);
    const row = db.notes.find(n => n.note === "SIM note from simulation");
    rec("notes: add note", row ? "PASS" : "FAIL", `server rows ${before}→${db.notes.length}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });

  // 5. Add a follow-up
  await safe("followups: add follow-up", async () => {
    await go("Followups");
    const v0 = log.violations.length, before = db.followups.length;
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByPlaceholder("e.g. Call mine buyer re quote").fill("SIM follow-up call");
    await shot("followup-form");
    await page.getByRole("button", { name: "Add Follow-up" }).last().click(); await page.waitForTimeout(3000);
    const row = db.followups.find(f => f.title === "SIM follow-up call");
    rec("followups: add follow-up", row ? "PASS" : "FAIL", `server rows ${before}→${db.followups.length}; time=${JSON.stringify(row?.time)} reminder=${row?.reminder}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });

  // 6. Edit an existing quote (line_items stored as JSON text in prod)
  await safe("quotes: edit keeps line items", async () => {
    await go("Quotes");
    const q = db.quotes.find(x => x.line_items);
    const beforeItems = q ? (typeof q.line_items === "string" ? JSON.parse(q.line_items) : q.line_items) : null;
    const v0 = log.violations.length;
    const edit = page.locator("button:has(svg[class*='lucide-pen']), button:has(svg[class*='lucide-edit']), button:has(svg[class*='square-pen'])").first();
    if (!(await edit.count())) { rec("quotes: edit keeps line items", "FAIL", "no edit button found on Quotes list"); return; }
    await edit.click(); await page.waitForTimeout(800); await shot("quote-edit");
    await page.getByRole("button", { name: "Update", exact: true }).last().click(); await page.waitForTimeout(3000);
    const after = db.quotes.find(x => x.id === q.id);
    const afterItems = after?.line_items ? (typeof after.line_items === "string" ? JSON.parse(after.line_items) : after.line_items) : null;
    rec("quotes: edit keeps line items", JSON.stringify(beforeItems?.length) === JSON.stringify(afterItems?.length) ? "PASS" : "FAIL", `line items ${beforeItems?.length ?? 0}→${afterItems?.length ?? 0}; value ${q?.value}→${after?.value}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });

  // 7. Jobs: save a field report with parts (the old false-conflict path)
  await safe("jobs: save field report with parts", async () => {
    await go("Jobs");
    const job = db.jobs[0]; const v0 = log.violations.length;
    const parts = page.getByPlaceholder("Parts used (comma separated)");
    if (!(await parts.count())) { rec("jobs: save field report with parts", "INFO", `job status is "${job?.status}", field report only editable when scheduled/in progress`); await shot("jobs"); return; }
    await parts.first().fill("Hose, Clamp"); await page.getByText("Save field report").first().click(); await page.waitForTimeout(3000);
    const after = db.jobs.find(x => x.id === job.id);
    const err = await page.locator("text=/changed on another device|could not sync|failed/i").count();
    rec("jobs: save field report with parts", JSON.stringify(after?.parts_used) === JSON.stringify(["Hose", "Clamp"]) && !err ? "PASS" : "FAIL", `server parts_used=${JSON.stringify(after?.parts_used)}; error banner=${err > 0}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });

  // 8. Offline capture then reconnect
  await safe("offline: capture note then sync", async () => {
    await go("Notes");
    await context.setOffline(true); await page.waitForTimeout(500);
    const before = db.notes.length;
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.waitForTimeout(600);
    await page.getByPlaceholder("Type your visit note…").fill("SIM offline note");
    await page.getByRole("button", { name: /^Add Note/ }).last().click(); await page.waitForTimeout(1500);
    const whileOffline = db.notes.length;
    await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(6000);
    const row = db.notes.find(n => n.note === "SIM offline note");
    await shot("offline-after");
    rec("offline: capture note then sync", whileOffline === before && row ? "PASS" : "FAIL", `server rows while offline ${before}→${whileOffline}; after reconnect synced=${!!row}`);
  });


  // 10. Create records on the remaining team screens
  const createFlow = async (name, screen, openName, fills, saveName, table, match) => safe(name, async () => {
    await go(screen);
    const v0 = log.violations.length, before = db[table].length;
    await page.getByRole("button", { name: openName, exact: true }).first().click(); await page.waitForTimeout(800);
    for (const [ph, val] of fills) await page.getByPlaceholder(ph).first().fill(val);
    await shot(name.replace(/\W+/g, "_"));
    await page.getByRole("button", { name: saveName, exact: true }).last().click(); await page.waitForTimeout(3500);
    const row = db[table].find(match);
    rec(name, row ? "PASS" : "FAIL", `server ${table} ${before}→${db[table].length}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });
  await createFlow("clients: add lead/client", "Clients", "Add Lead", [["e.g. Anglo American", "SIM Mining Co"], ["e.g. Mogalakwena Mine", "SIM Shaft"], ["Contact name", "Sim Person"]], "Add Lead", "clients", r => r.company === "SIM Mining Co");
  await createFlow("contacts: add contact", "Contacts", "Add", [["e.g. John Smith", "SIM Contact"], ["e.g. ACME Mining", "SIM Mining Co"]], "Add Contact", "contacts", r => r.name === "SIM Contact");
  await safe("leads: add opportunity", async () => {
    await go("Leads");
    const v0 = log.violations.length, before = db.leads.length;
    await page.getByRole("button", { name: "Add Opportunity", exact: true }).first().click(); await page.waitForTimeout(800);
    await page.getByPlaceholder("e.g. Glencore Eland — tyre handler inquiry").fill("SIM opportunity");
    await page.getByRole("button", { name: /Select client/ }).first().click(); await page.waitForTimeout(400);
    await page.locator("button", { hasText: "Sim Mine" }).first().click(); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Save Opportunity", exact: true }).last().click(); await page.waitForTimeout(3500);
    const row = db.leads.find(r => r.title === "SIM opportunity");
    rec("leads: add opportunity", row ? "PASS" : "FAIL", `server leads ${before}→${db.leads.length}; client linked=${!!row?.client_id}; schema errors=${JSON.stringify(errsSince(v0))}`);
  });
  await createFlow("equipment: register", "Equipment", "Add", [["e.g. Main Compressor Unit", "SIM Compressor"]], "Register", "equipment", r => r.name === "SIM Compressor");


  // 11. Whole-team view permission (master grants; others request)
  await safe("team view: permission flow", async () => {
    const OWNER = "431dcb72-ea3f-43ed-9f73-74384e862300";
    await go("Team", 4000);
    const body = await page.evaluate(() => document.body.innerText);
    if (H.UID === OWNER) {
      const ok = /Master account/.test(body) && (await page.locator("button:has(svg[class*='eye'])").count()) > 0;
      await go("Clients", 3000);
      const sub = await page.evaluate(() => document.body.innerText.match(/\d+ client records/)?.[0]);
      rec("team view: permission flow", ok && sub && !sub.startsWith("0 ") ? "PASS" : "FAIL", `master sees controls=${ok}; master Clients shows "${sub}" (all team records)`);
    } else {
      const before = await page.evaluate(() => 0);
      const hasBtn = await page.getByRole("button", { name: "Request access" }).count();
      if (hasBtn) await page.getByRole("button", { name: "Request access" }).click();
      await page.waitForTimeout(1500);
      const pending = await page.getByText("Your request is waiting for the master account.").count();
      const noCrown = (await page.locator("button:has(svg[class*='eye'])").count()) === 0;
      rec("team view: permission flow", hasBtn && pending && noCrown ? "PASS" : "FAIL", `request button=${hasBtn > 0}; pending shown=${pending > 0}; role controls hidden for non-master=${noCrown}; request rows=${db.team_notifications.filter(n => n.record_type === "team_view_request").length}`);
    }
  });

  // 12. Offline edit on a screen that queues directly in state survives a reload
  await safe("offline: client survives reload", async () => {
    await go("Clients");
    await context.setOffline(true); await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Add Lead", exact: true }).first().click(); await page.waitForTimeout(600);
    await page.getByPlaceholder("e.g. Anglo American").first().fill("SIM Offline Mine");
    await page.getByRole("button", { name: "Add Lead", exact: true }).last().click(); await page.waitForTimeout(1500);
    // "Close" the app while offline: the entry must already be in IndexedDB.
    const queued = await page.evaluate(() => new Promise(res => { const uid = JSON.parse(localStorage.getItem("sb-hrqzqyfvbfzrfnuxovvr-auth-token")).user.id; const r = indexedDB.open("powermate_offline_" + uid); r.onsuccess = () => { const g = r.result.transaction("syncQueue").objectStore("syncQueue").getAll(); g.onsuccess = () => res(g.result.filter(q => q.data?.company === "SIM Offline Mine").length); }; r.onerror = () => res(-1); }));
    // Reopen with signal: a fresh page load must find the entry on the device and sync it.
    await context.setOffline(false);
    await page.reload({ waitUntil: "load" }); await page.waitForTimeout(7000);
    const synced = !!db.clients.find(c => c.company === "SIM Offline Mine");
    rec("offline: client survives reload", queued > 0 && synced ? "PASS" : "FAIL", `queued on device after offline reload=${queued}; synced after reconnect=${synced}`);
  });

  // 9. Reload everything: nothing pending, no failed items
  await safe("sync: queue drains", async () => {
    await go("Home", 5000);
    const q = await page.evaluate(() => new Promise(res => { const r = indexedDB.open(Object.keys(localStorage).length ? "powermate_offline_" + JSON.parse(localStorage.getItem("sb-hrqzqyfvbfzrfnuxovvr-auth-token")).user.id : "x"); r.onsuccess = () => { try { const tx = r.result.transaction("syncQueue"); const g = tx.objectStore("syncQueue").getAll(); g.onsuccess = () => res(g.result.map(x => ({ table: x.table, status: x.status, err: x.last_error?.message }))); } catch (e) { res(String(e)); } }; r.onerror = () => res("open failed"); }));
    rec("sync: queue drains", Array.isArray(q) && q.length === 0 ? "PASS" : "FAIL", `remaining queue: ${JSON.stringify(q).slice(0, 300)}`);
  });

  fs.writeFileSync(path.join(OUT, "flows.json"), JSON.stringify({ results, violations: log.violations, errors4xx: log.errors4xx, unhandled: [...new Set(log.unhandled)], functions: log.functions, writes: log.writes }, null, 1));
  await S.browser.close();
  const failed = results.filter(r => r.status === "FAIL");
  if (failed.length) { console.error(`${failed.length} flow(s) failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
