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
    const parts = page.getByPlaceholder("Other parts (comma separated)");
    if (!(await parts.count())) { rec("jobs: save field report with parts", "INFO", `job status is "${job?.status}", field report only editable when scheduled/in progress`); await shot("jobs"); return; }
    await parts.first().fill("Hose, Clamp"); await parts.first().press("Enter");
    await page.getByText("Save field report").first().click(); await page.waitForTimeout(3000);
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
  await safe("contacts: business card photo shows", async () => {
    await go("Contacts");
    await page.getByText("Contact 0", { exact: true }).first().click(); await page.waitForTimeout(2500);
    const img = page.getByAltText(/business card$/).first();
    const shown = (await img.count()) ? await img.evaluate(el => ({ src: el.currentSrc || el.src, ok: el.complete && el.naturalWidth > 0 })) : null;
    await shot("contact-card");
    rec("contacts: business card photo shows", shown?.ok && /\/object\/sign\//.test(shown.src) ? "PASS" : "FAIL", `image loaded=${!!shown?.ok}; via fresh signed link=${/\/object\/sign\//.test(shown?.src || "")}`);
    await page.keyboard.press("Escape").catch(() => {});
  });
  await safe("contacts: unreadable card photo leaves no gap", async () => {
    // A teammate's scan: storage refuses to sign it, so the section must be left out.
    await go("Contacts");
    await page.getByText("Contact 4", { exact: true }).first().click(); await page.waitForTimeout(2500);
    const heading = await page.getByText(/Business card · tap to enlarge/i).count();
    const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).length);
    await shot("contact-card-unavailable");
    rec("contacts: unreadable card photo leaves no gap", heading === 0 && broken === 0 ? "PASS" : "FAIL", `card section shown=${heading > 0}; broken images=${broken}`);
    await page.keyboard.press("Escape").catch(() => {});
  });
  await safe("sync: background pull fetches only changes", async () => {
    // Another device edits a client; bringing the app back to the foreground
    // must show it, and the background pull must ask only for changed rows.
    await go("Clients", 6000);
    const target = db.clients.find(c => !/SIM/.test(c.company));
    target.company = "SIM Remote Edit Co";
    target.updated_at = new Date().toISOString();
    const from = log.reads.length;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(4000);
    // Clients are shown in collapsed groups, so check the device's stored copy.
    const shown = await page.evaluate(id => new Promise(res => {
      const uid = JSON.parse(localStorage.getItem("sb-hrqzqyfvbfzrfnuxovvr-auth-token")).user.id;
      const r = indexedDB.open("powermate_offline_" + uid);
      r.onsuccess = () => { const g = r.result.transaction("clients").objectStore("clients").get(id); g.onsuccess = () => res(g.result?.company === "SIM Remote Edit Co"); g.onerror = () => res(false); };
      r.onerror = () => res(false);
    }), target.id);
    const clientReads = log.reads.slice(from).filter(r => r.table === "clients");
    const incremental = clientReads.length > 0 && clientReads.every(r => /updated_at=gt\./.test(r.search));
    const incTables = ["clients", "followups", "quotes", "contacts", "notes", "equipment", "expenses", "leads", "vehicle_checks", "activities", "breakdown_reports", "repair_reports", "custom_faults", "jobs", "invoices", "payments", "email_quotes"];
    const full = log.reads.slice(from).filter(r => incTables.includes(r.table) && !/updated_at=gt\./.test(r.search)).length;
    rec("sync: background pull fetches only changes", shown && incremental && full === 0 ? "PASS" : "FAIL", `remote edit stored on device=${shown}; clients reads=${clientReads.length} incremental=${incremental}; full-table reads=${full}`);
  });
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

  // 13. Auto-lock after 15 minutes in the background, without losing a half-typed note.
  await safe("pin: auto-lock after background keeps unsaved work", async () => {
    const crypto = require("crypto");
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync("135790", salt, 600000, 32, "sha256").toString("hex");
    await go("Notes");
    await page.getByRole("button", { name: "Add", exact: true }).first().click(); await page.waitForTimeout(600);
    await page.getByPlaceholder("Type your visit note…").fill("SIM draft kept");
    await page.evaluate(({ uid, stored }) => {
      localStorage.setItem(`pm_pin_hash__${uid}`, stored);
      localStorage.removeItem(`pm_pin_disabled__${uid}`);
      localStorage.setItem(`pm_pin_hidden_at__${uid}`, String(Date.now() - 16 * 60 * 1000));
      document.dispatchEvent(new Event("visibilitychange"));
    }, { uid: H.UID, stored: `v3$600000$${salt}$${hash}` });
    await page.waitForTimeout(800);
    const locked = (await page.getByText("Enter your PIN to open PowerMate").count()) > 0;
    for (const d of "135790") { await page.getByRole("button", { name: new RegExp(`^${d}`) }).first().click(); await page.waitForTimeout(120); }
    await page.waitForTimeout(3000);
    const unlocked = (await page.getByText("Enter your PIN to open PowerMate").count()) === 0;
    const draft = await page.getByPlaceholder("Type your visit note…").inputValue().catch(() => "");
    await page.evaluate(uid => localStorage.setItem(`pm_pin_disabled__${uid}`, "1"), H.UID);
    await shot("pin-relock");
    rec("pin: auto-lock after background keeps unsaved work", locked && unlocked && draft === "SIM draft kept" ? "PASS" : "FAIL", `locked after 16 min away=${locked}; unlocked with PIN=${unlocked}; draft kept="${draft}"`);
  });

  // 13b. Each teammate chooses what shows in their own menu; it is saved to their user record.
  await safe("menu: hide a screen from my menu", async () => {
    await go("Home");
    const openMenu = async () => { await page.getByRole("button", { name: /menu/i }).first().click(); await page.waitForTimeout(700); };
    const drawerHas = label => page.locator("div.fixed.z-71 button", { hasText: new RegExp(`^\\s*${label}\\s*$`) }).count();
    await openMenu();
    const before = await drawerHas("Invoices");
    await page.getByRole("button", { name: "Customise menu" }).click(); await page.waitForTimeout(400);
    const homeLocked = await page.getByLabel("Show Dashboard").isDisabled();
    await page.getByLabel("Show Invoices").uncheck();
    await page.getByRole("button", { name: "Done", exact: true }).click(); await page.waitForTimeout(1200);
    const after = await drawerHas("Invoices");
    const call = log.writes.find(w => w.fn === "set_my_hidden_screens");
    await shot("menu-custom");
    // Survives a reload (read back from the user record), then restore it.
    await go("Home"); await openMenu();
    const afterReload = await drawerHas("Invoices");
    await page.getByRole("button", { name: "Customise menu" }).click(); await page.waitForTimeout(300);
    await page.getByLabel("Show Invoices").check();
    await page.getByRole("button", { name: "Done", exact: true }).click(); await page.waitForTimeout(1200);
    const restored = await drawerHas("Invoices");
    const me = H.db.users.find(u => u.id === H.UID);
    rec("menu: hide a screen from my menu", before === 1 && homeLocked && after === 0 && afterReload === 0 && restored === 1 && JSON.stringify(call?.body?.p_screens) === '["Invoices"]' && me?.hidden_screens?.length === 0 ? "PASS" : "FAIL",
      `shown before=${before}; Dashboard locked=${homeLocked}; hidden after Done=${after === 0}; still hidden after reload=${afterReload === 0}; saved=${JSON.stringify(call?.body?.p_screens)}; restored=${restored === 1}`);
  });

  // 13c. Phones: form fields are at least 16px so iPhone Safari does not zoom in on focus.
  await safe("touch: form fields never trigger iPhone zoom", async () => {
    await go("Notes");
    await page.getByRole("button", { name: "Add", exact: true }).first().click(); await page.waitForTimeout(600);
    const sizes = await page.evaluate(() => [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")].filter(e => e.getBoundingClientRect().width > 0).map(e => parseFloat(getComputedStyle(e).fontSize)));
    const small = sizes.filter(x => x < 16);
    rec("touch: form fields never trigger iPhone zoom", sizes.length > 0 && small.length === 0 ? "PASS" : "FAIL", `${sizes.length} visible fields; under 16px: ${small.length}`);
  });

  // 13d. Company details: only the master account edits them; documents use them.
  await safe("documents: company details and invoice PDF", async () => {
    const isOwner = H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300";
    await go("CompanyProfile", 3500);
    if (!isOwner) {
      const locked = await page.getByText("Only the master account can change these details").count();
      const inputs = await page.locator("main input:not([type=hidden])").count();
      await shot("company-profile-member");
      rec("documents: company details and invoice PDF", locked > 0 && inputs === 0 ? "PASS" : "FAIL", `read-only notice=${locked > 0}; editable fields=${inputs}`);
      return;
    }
    const field = label => page.locator(`label:text-is("${label}") + input, label:text-is("${label}") + textarea`).first();
    await field("VAT no.").fill("4123456789");
    await field("Bank").fill("FNB");
    await field("Account number").fill("62812345678");
    await field("Quotes valid for (days)").fill("14");
    await page.getByRole("button", { name: "Save", exact: true }).click(); await page.waitForTimeout(1500);
    const saved = H.db.team_profiles.find(p => p.team_id === H.TEAM) || {};
    await shot("company-profile");
    // Invoice PDF from the Invoices screen.
    await go("Invoices", 3500);
    const hasInvoice = (await page.getByRole("button", { name: /Invoice PDF/ }).count()) > 0;
    let file = "", size = 0;
    if (hasInvoice) {
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: /Invoice PDF/ }).first().click()]);
      file = dl.suggestedFilename();
      const p = await dl.path(); size = p ? fs.statSync(p).size : 0;
    }
    // Quote → pro forma.
    await go("Quotes", 3000);
    await page.getByRole("button", { name: "Make a PDF" }).first().click(); await page.waitForTimeout(300);
    const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: "Pro forma invoice" }).first().click()]);
    const pf = dl2.suggestedFilename();
    rec("documents: company details and invoice PDF",
      saved.vat_no === "4123456789" && saved.bank_name === "FNB" && saved.quote_validity_days === 14 && (!hasInvoice || (/^Tax_Invoice_/.test(file) && size > 2000)) && /^Pro_Forma_Invoice_PF-/.test(pf) ? "PASS" : "FAIL",
      `saved VAT=${saved.vat_no} bank=${saved.bank_name} validity=${saved.quote_validity_days}; invoice PDF=${hasInvoice ? file + " " + size + "B" : "no invoice seeded"}; pro forma=${pf}`);
  });

  // 13e. Detailed quote: write-up, a section with a photo, cover page, validity.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("quotes: detailed quote with photo and PDF", async () => {
    await go("Quotes", 3000);
    const edit = page.locator("button:has(svg[class*='lucide-pen']), button:has(svg[class*='lucide-edit']), button:has(svg[class*='square-pen'])").first();
    await edit.click(); await page.waitForTimeout(800);
    const panel = page.getByTestId("quote-details");
    await panel.locator("summary").click(); await page.waitForTimeout(300);
    await page.getByLabel("Include a cover page").check();
    await page.locator('label:text-is("Quote title") + input').fill("Shaft 2 jack service");
    await page.locator('label:text-is("Introduction") + textarea').fill("Following our site visit we propose the work below.");
    await page.getByRole("button", { name: "+ Site findings" }).click(); await page.waitForTimeout(300);
    const section = page.getByTestId("quote-section").first();
    await section.locator('label:text-is("Text") + textarea').fill("Two cylinders leak at the gland seal.");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await section.locator("input[type=file][multiple]").setInputFiles({ name: "leak.png", mimeType: "image/png", buffer: png });
    await page.waitForTimeout(800);
    await section.getByLabel("Photo caption").first().fill("Leaking gland seal");
    await page.locator('label:text-is("Valid for (days)") + input').fill("21");
    await page.getByRole("button", { name: "Update", exact: true }).last().click(); await page.waitForTimeout(5000);
    const row = H.db.quotes.find(q => q.details && q.details.title === "Shaft 2 jack service");
    const photo = row?.details?.sections?.[0]?.photos?.[0];
    const leaked = JSON.stringify(row?.details || {}).includes("data:image");
    const expectedExpiry = row?.sent_date ? new Date(new Date(row.sent_date + "T12:00:00").getTime() + 21 * 86400000).toISOString().slice(0, 10) : null;
    await shot("quote-detailed");
    // Quotation PDF of that quote.
    await go("Quotes", 3000);
    const card = page.locator("div.rounded-2xl, div[class*='rounded']", { hasText: row?.client_name || "" }).filter({ has: page.getByRole("button", { name: "Make a PDF" }) }).last();
    await card.getByRole("button", { name: "Make a PDF" }).first().click(); await page.waitForTimeout(300);
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: "Quotation", exact: true }).first().click()]);
    const pth = await dl.path(); const size = pth ? fs.statSync(pth).size : 0;
    rec("quotes: detailed quote with photo and PDF",
      row && row.details.cover === true && photo?.storage_path && photo.caption === "Leaking gland seal" && !leaked && row.expiry_date === expectedExpiry && /^Quotation_/.test(dl.suggestedFilename()) && size > 5000 ? "PASS" : "FAIL",
      `saved=${!!row}; cover=${row?.details?.cover}; photo path=${photo?.storage_path ? "yes" : "no"}; caption=${photo?.caption}; base64 on server=${leaked}; expiry=${row?.expiry_date} (want ${expectedExpiry}); pdf=${dl.suggestedFilename()} ${size}B`);
  });

  // 13f. Job cards: on their own from Jobs, and attached to an invoice.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("documents: job card PDFs", async () => {
    await go("Jobs", 3500);
    const btn = page.getByRole("button", { name: /Job card PDF/ }).first();
    if (!(await btn.count())) { rec("documents: job card PDFs", "FAIL", "no Job card PDF button on Jobs"); return; }
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), btn.click()]);
    const alone = dl.suggestedFilename();
    await go("Invoices", 3500);
    const plain = page.getByRole("button", { name: /Invoice PDF/ }).first();
    const [d1] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), plain.click()]);
    const s1 = fs.statSync(await d1.path()).size;
    const box = page.getByLabel("Attach job card").first();
    const hasBox = (await box.count()) > 0;
    let s2 = 0;
    if (hasBox) {
      await box.check();
      const [d2] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), plain.click()]);
      s2 = fs.statSync(await d2.path()).size;
    }
    rec("documents: job card PDFs", /^Job_Card_/.test(alone) && hasBox && s2 > s1 ? "PASS" : "FAIL",
      `job card=${alone}; attach option shown=${hasBox}; invoice ${s1}B → with job card ${s2}B`);
  });

  // 13f2. Products & stock: add an item, receive stock, pick it on a job.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("products: add item, receive stock, use on job", async () => {
    await go("Products", 3000);
    const lowShown = (await page.getByText(/at or below the reorder level/).count()) > 0;
    await page.getByRole("button", { name: "Add", exact: true }).first().click(); await page.waitForTimeout(600);
    await page.locator('label:text-is("Part number") + input').fill("SIM-77");
    await page.locator('label:has-text("Name") + input').first().fill("Sim grease cartridge");
    await page.locator('label:text-is("Cost price (R)") + input').fill("40");
    await page.locator('label:text-is("Sell price excl. VAT (R)") + input').fill("65");
    const marginShown = (await page.getByText(/Margin R 25\.00 \(38\.5%\)/).count()) > 0;
    await page.getByText("Keep track of stock").click();
    await page.getByRole("button", { name: "Save", exact: true }).last().click(); await page.waitForTimeout(1500);
    const row = H.db.products.find(p => p.part_number === "SIM-77");
    await page.getByRole("button", { name: /0 each in stock/ }).first().click(); await page.waitForTimeout(800);
    await page.locator('label:text-is("Quantity") + input').fill("12");
    await page.getByRole("button", { name: "Update stock" }).click(); await page.waitForTimeout(1500);
    await shot("products-stock");
    const stocked = row && Number(row.stock_on_hand) === 12 && H.db.stock_movements.some(m => m.product_id === row.id && m.reason === "receive");
    await go("Jobs", 3500);
    const pick = page.getByRole("button", { name: "Add from catalogue" }).first();
    let saved = null;
    if (await pick.count()) {
      await pick.click(); await page.waitForTimeout(600);
      await page.getByPlaceholder("Part number, name or supplier code").fill("SIM-77");
      await page.getByRole("button", { name: /Sim grease cartridge/ }).first().click(); await page.waitForTimeout(400);
      await page.getByText("Save field report").first().click(); await page.waitForTimeout(3000);
      saved = H.db.jobs.flatMap(j => (Array.isArray(j.parts_used) ? j.parts_used : [])).find(p => p && p.product_id === row?.id);
    }
    rec("products: add item, receive stock, use on job", lowShown && marginShown && stocked && saved?.part_number === "SIM-77" && saved?.unit_price === 65 ? "PASS" : "FAIL",
      `low-stock banner=${lowShown}; margin shown=${marginShown}; saved=${!!row}; stock=${row?.stock_on_hand}; job part=${JSON.stringify(saved)}`);
  });

  // 13f3. Timesheets: clock in on a job, see it running, clock out.
  await safe("timesheets: clock in on a job and out", async () => {
    await go("Jobs", 3500);
    const clockIn = page.getByRole("button", { name: "Clock in", exact: true }).first();
    if (!(await clockIn.count())) { rec("timesheets: clock in on a job and out", "FAIL", "no Clock in button on an open job"); return; }
    await clockIn.click(); await page.waitForTimeout(2500);
    const row = (H.db.time_entries || []).find(e => e.user_id === H.UID && !e.ended_at);
    const onJob = !!row?.job_id && H.db.jobs.some(j => j.id === row.job_id);
    const outBtn = (await page.getByRole("button", { name: /Clock out/ }).count()) > 0;
    await go("Timesheets", 3000);
    const running = (await page.getByText(/Clocked in · /).count()) > 0;
    await shot("timesheets-running");
    await page.getByRole("button", { name: /Clock out/ }).first().click(); await page.waitForTimeout(2500);
    const after = (H.db.time_entries || []).find(e => e.id === row?.id);
    const listed = (await page.getByText(/ – \d\d:\d\d/).count()) > 0;
    rec("timesheets: clock in on a job and out", onJob && outBtn && running && !!after?.ended_at && listed ? "PASS" : "FAIL",
      `entry on job=${onJob}; clock-out button on job=${outBtn}; running shown=${running}; ended=${after?.ended_at || null}; listed in week=${listed}; schema errors=${JSON.stringify(log.violations.slice(-3))}`);
  });

  // 13f4. Service plans: add a quarterly plan, then make its job now.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("service plans: add plan and make its job", async () => {
    await go("ServicePlans", 3000);
    await page.getByRole("button", { name: /New service plan/ }).click(); await page.waitForTimeout(600);
    await page.locator('label:has-text("Name") + input').first().fill("Sim quarterly service");
    const client = H.db.clients.find(c => c.team_id === H.TEAM && c.company) || H.db.clients[0];
    await page.getByRole("button", { name: "Select client…" }).click(); await page.waitForTimeout(300);
    await page.getByPlaceholder("Search clients…").fill(client.company.slice(0, 12));
    await page.getByRole("button", { name: new RegExp(client.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
    await page.locator('label:text-is("Price per visit (R, excl. VAT)") + input').fill("4500");
    await page.getByRole("button", { name: "Save", exact: true }).last().click(); await page.waitForTimeout(2000);
    const plan = (H.db.service_plans || []).find(p => p.title === "Sim quarterly service");
    const listed = (await page.getByText("Sim quarterly service").count()) > 0;
    const worth = (await page.getByText(/R 18.000\.00/).count()) > 0;
    await shot("service-plans");
    let job = null;
    if (listed) {
      await page.getByText("Sim quarterly service").first().click(); await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Make the job now" }).click(); await page.waitForTimeout(1500);
      job = H.db.jobs.find(j => j.service_plan_id === plan?.id);
    }
    rec("service plans: add plan and make its job", plan?.every_months === 3 && plan?.client_id === client.id && Number(plan?.value) === 4500 && listed && worth && !!job ? "PASS" : "FAIL",
      `saved=${!!plan} (every ${plan?.every_months} months, client ok=${plan?.client_id === client.id}); listed=${listed}; yearly value shown=${worth}; job made=${!!job}; schema errors=${JSON.stringify(log.violations.slice(-3))}`);
  });

  // 13f5. Schedule: book a job for a time and a technician.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("schedule: book a job for a technician", async () => {
    const job = H.db.jobs.find(j => j.title === "Sim quarterly service") || H.db.jobs.find(j => !["completed", "cancelled"].includes(j.status));
    await page.goto(`${H.APP}/?screen=Schedule`, { waitUntil: "load" }); await page.waitForTimeout(3000);
    if (job.scheduled_date) {
      await page.getByRole("button", { name: "Week" }).click(); await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Day" }).click();
    }
    const chip = page.getByRole("button", { name: new RegExp(job.title) }).first();
    const shown = (await chip.count()) > 0;
    if (!shown) { await shot("schedule"); rec("schedule: book a job for a technician", "FAIL", `job "${job.title}" (${job.scheduled_date}) not on the board`); return; }
    await chip.click(); await page.waitForTimeout(600);
    const tech = H.db.team_members.find(m => m.user_id !== H.UID) || H.db.team_members[0];
    await page.locator('label:has-text("Date") input').fill("2026-10-06");
    await page.locator('label:has-text("Time") input').fill("09:30");
    await page.locator('label:has-text("Technician") select').selectOption(tech.user_id);
    await page.getByRole("button", { name: "Save booking" }).click(); await page.waitForTimeout(2500);
    const after = H.db.jobs.find(j => j.id === job.id);
    await page.getByRole("button", { name: "Week" }).click(); await page.waitForTimeout(500);
    await shot("schedule-week");
    rec("schedule: book a job for a technician", after.scheduled_date === "2026-10-06" && String(after.scheduled_time).startsWith("09:30") && after.assigned_to_user_id === tech.user_id ? "PASS" : "FAIL",
      `date=${after.scheduled_date}; time=${after.scheduled_time}; technician ok=${after.assigned_to_user_id === tech.user_id}; schema errors=${JSON.stringify(log.violations.slice(-3))}`);
  });

  // 13g. Help: send a message to support; the platform console lists companies.
  await safe("support: send a message from Help", async () => {
    await go("Help", 2500);
    await page.locator('label:text-is("Subject") + input').fill("Invoice PDF question");
    await page.locator('label:text-is("Message") + textarea').fill("How do I change the invoice prefix?");
    await page.getByRole("button", { name: /Send/ }).first().click(); await page.waitForTimeout(1500);
    const row = (H.db.support_tickets || []).find(t => t.subject === "Invoice PDF question");
    const shown = (await page.getByText("Sent. We'll reply here.").count()) > 0;
    let consoleOk = true;
    if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") {
      await go("Platform", 2500);
      consoleOk = (await page.getByText("cvanjaarsveld2@icloud.com").count()) > 0;
    }
    rec("support: send a message from Help", row && row.user_id === H.UID && (row.status ?? "open") === "open" && shown && consoleOk ? "PASS" : "FAIL",
      `ticket saved=${!!row} (status ${row?.status ?? "open (database default)"}); confirmation=${shown}; platform console lists companies=${consoleOk}`);
  });

  // 13h. A customer accepts a quote online: link → page → name, signature, order no.
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("quotes: customer accepts online", async () => {
    await go("Quotes", 3000);
    await page.getByRole("button", { name: "Make a PDF" }).first().click(); await page.waitForTimeout(300);
    await page.evaluate(() => { try { navigator.share = undefined; } catch {} try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }); } catch {} });
    await page.getByRole("button", { name: "Send link to accept online" }).first().click(); await page.waitForTimeout(1200);
    const q = H.db.quotes.find(x => x.share_token);
    await page.goto(`${H.APP}/?quote=${q.share_token}`, { waitUntil: "load" }); await page.waitForTimeout(2500);
    const shown = (await page.getByText(/QUOTATION/).count()) > 0;
    await page.getByLabel("Your full name").fill("Jan Buyer");
    await page.getByLabel("Order number").fill("PO-778");
    const pad = page.getByLabel("Sign here"); const box = await pad.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 40); await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 }); await page.mouse.move(box.x + 220, box.y + 30, { steps: 8 }); await page.mouse.up();
    await page.getByRole("button", { name: "Accept quote" }).click(); await page.waitForTimeout(1500);
    const thanks = (await page.getByText("Quote accepted — thank you!").count()) > 0;
    await shot("quote-accepted-online");
    rec("quotes: customer accepts online", shown && thanks && q.status === "Accepted" && q.accepted_by_name === "Jan Buyer" && q.accepted_po === "PO-778" && /^data:image\/png;base64,/.test(q.accepted_signature || "") ? "PASS" : "FAIL",
      `page shown=${shown}; thanks=${thanks}; status=${q.status}; by=${q.accepted_by_name}; po=${q.accepted_po}; signature=${(q.accepted_signature || "").slice(0, 22)}`);
  });

  // 14. Master account removes a teammate and hands their work over (runs last: it changes the team).
  if (H.UID === "431dcb72-ea3f-43ed-9f73-74384e862300") await safe("team: remove teammate hands over work", async () => {
    const GREG = "f16f3dd1-c87c-4066-8a38-750d7bc31d65";
    const gregBefore = H.db.clients.filter(c => c.user_id === GREG && c.team_id === H.TEAM).length;
    await go("Team", 4000);
    const row = page.locator("div", { hasText: "greg@pwrstart.com" }).filter({ has: page.locator("svg.lucide-user-minus") }).last();
    await row.locator("button:has(svg.lucide-user-minus)").click(); await page.waitForTimeout(600);
    const sheet = (await page.getByText("Hand their work to").count()) > 0;
    const blockDefault = await page.locator("input[type=checkbox]").first().isChecked().catch(() => null);
    await page.getByRole("button", { name: "Remove", exact: true }).last().click(); await page.waitForTimeout(2500);
    const stillMember = H.db.team_members.some(m => m.user_id === GREG);
    const gregAfter = H.db.clients.filter(c => c.user_id === GREG && c.team_id === H.TEAM).length;
    const call = log.writes.find(w => w.fn === "remove_team_member");
    const toast = await page.getByText(/greg@pwrstart\.com removed · \d+ records? moved to you/).count();
    await shot("team-remove");
    rec("team: remove teammate hands over work", sheet && blockDefault === true && !stillMember && gregBefore > 0 && gregAfter === 0 && call?.body?.p_block_login === true && toast > 0 ? "PASS" : "FAIL",
      `sheet=${sheet}; block login default=${blockDefault}; still member=${stillMember}; Greg's team clients ${gregBefore}→${gregAfter}; toast=${toast > 0}`);
  });

  fs.writeFileSync(path.join(OUT, "flows.json"), JSON.stringify({ results, violations: log.violations, errors4xx: log.errors4xx, unhandled: [...new Set(log.unhandled)], functions: log.functions, writes: log.writes }, null, 1));
  await S.browser.close();
  const failed = results.filter(r => r.status === "FAIL");
  if (failed.length) { console.error(`${failed.length} flow(s) failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
