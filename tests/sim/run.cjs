// Builds the app, serves it locally and runs the browser simulation for the
// master account (every screen + all flows) and the field account (all flows).
// Exits non-zero on any failed flow, crashed screen, console error or schema
// violation. Usage: npm run test:sim   (SIM_ONLY=master for one account)
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
const DIST = path.join(OUT, "dist");
const PORT = process.env.SIM_PORT || "4179";
const SCREENS = "Home,Clients,Contacts,Followups,Notes,Equipment,Quotes,Expenses,More,Planner,ColdCall,JackSelector,Meeting,Breakdown,Repair,Diagnostics,BackfillZAR,Analytics,Leads,Team,VehicleCheck,Notifications,SharedInbox,Jobs,Invoices,CompanyProfile,Help,Platform,AuditLog,Products,Timesheets,ServicePlans,Schedule,Client360,Calendar,TeamDashboard";
const ACCOUNTS = [
  { name: "master", uid: "431dcb72-ea3f-43ed-9f73-74384e862300", email: "cvanjaarsveld2@icloud.com", screens: SCREENS },
  { name: "field", uid: "dc4e613a-ef56-472a-b700-66365f67f258", email: "christo@pwrstart.com", screens: "Home" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch {} await sleep(500); }
  throw new Error(`preview server did not start at ${url}`);
}
function runFlows(account) {
  return runScript("flows.cjs", account);
}
function runScript(script, account) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      cwd: ROOT, stdio: "inherit",
      env: { ...process.env, SIM_UID: account.uid, SIM_EMAIL: account.email, SIM_OUT: account.name, SIM_SCREENS: account.screens, SIM_APP_URL: `http://localhost:${PORT}` },
    });
    child.on("exit", code => resolve(code === 0));
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  // The URL only needs to match what the harness intercepts; nothing is contacted.
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    cwd: ROOT, stdio: "inherit",
    env: { ...process.env, VITE_SUPABASE_URL: "https://hrqzqyfvbfzrfnuxovvr.supabase.co", VITE_SUPABASE_ANON_KEY: "sim-key" },
  });
  const server = spawn("npx", ["vite", "preview", "--outDir", DIST, "--port", PORT, "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: true });
  let ok = true;
  try {
    await waitFor(`http://localhost:${PORT}/`);
    // SIM_ONLY=master runs just that account's flows (quicker while working).
    for (const account of ACCOUNTS.filter(a => !process.env.SIM_ONLY || a.name === process.env.SIM_ONLY)) {
      console.log(`\n=== ${account.name} account ===`);
      if (!(await runFlows(account))) ok = false;
      const screens = JSON.parse(fs.readFileSync(path.join(OUT, account.name, "screens.json"), "utf8"));
      for (const [screen, r] of Object.entries(screens)) {
        // Realtime websockets are expected to fail: the harness does not emulate them.
        const errors = [...r.pageErrors, ...r.consoleErrors].filter(e => !/WebSocket|realtime/i.test(e));
        if (r.boundary || r.loginShown || errors.length) { ok = false; console.error(`FAIL screen ${screen}: ${r.boundary ? "crashed " : ""}${r.loginShown ? "logged out " : ""}${errors.slice(0, 2).join(" | ")}`); }
      }
      const flows = JSON.parse(fs.readFileSync(path.join(OUT, account.name, "flows.json"), "utf8"));
      if (flows.violations.length) { ok = false; console.error("FAIL schema violations:", JSON.stringify(flows.violations.slice(0, 5))); }
    }
    console.log("\n=== visual audit: contrast, wrapped numbers, overflow (light + dark) ===");
    if (!(await runScript("visual-audit.cjs", { ...ACCOUNTS[0], name: "visual" }))) ok = false;
    console.log("\n=== company sign-up (a person with no company) ===");
    if (!(await runScript("onboarding.cjs", { name: "onboarding", uid: "7d0c1b52-6a55-4d49-9a3f-0f5e2f0a9b11", email: "owner@acme.test", screens: "" }))) ok = false;
    console.log("\n=== offline app shell (service worker on) ===");
    if (!(await runScript("offline-shell.cjs", { ...ACCOUNTS[0], name: "offline" }))) ok = false;
  } finally {
    try { process.kill(-server.pid); } catch {}
  }
  console.log(ok ? "\nSIMULATION PASSED" : "\nSIMULATION FAILED");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
