// Offline app-shell check, with the real service worker enabled (the main
// simulation blocks it). Opens the app online on Home only, the way a phone
// sees a fresh install or a new deploy, then goes offline and cold-starts
// every screen. A screen whose code was never downloaded shows the error
// boundary. Writes <SIM_OUT>/offline-shell.json. Usage: see run.cjs.
//
// "Offline" here means the web server is shut down: Playwright's setOffline
// does not cut the service worker's own fetches, so on its own it can't show
// a missing cache. It runs its own preview server for that reason.
const fs = require("fs"), path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const PORT = process.env.SIM_OFFLINE_PORT || "4180";
process.env.SIM_APP_URL = `http://localhost:${PORT}`;
const H = require("./harness.cjs");

const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(__dirname, "out", "dist");
const OUT = path.join(__dirname, "out", process.env.SIM_OUT || "offline");
fs.mkdirSync(OUT, { recursive: true });
const APP = H.APP;

async function startServer() {
  const server = spawn("npx", ["vite", "preview", "--outDir", DIST, "--port", PORT, "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: true });
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    try { if ((await fetch(`${APP}/`)).ok) return server; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error("offline-shell preview server did not start");
}
function stopServer(server) {
  try { process.kill(-server.pid); } catch {}
}
const screens = (process.env.SIM_SCREENS || "Home").split(",").filter(Boolean);

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await H.newSimContext(browser, { serviceWorkers: "allow" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message).slice(0, 300)));

  await page.goto(`${APP}/?screen=Home`, { waitUntil: "load" });
  // Wait for the service worker to install (precache) and take control.
  await Promise.race([page.evaluate(() => navigator.serviceWorker.ready), page.waitForTimeout(20000)]);
  await page.reload({ waitUntil: "load" });
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  await page.waitForTimeout(4000);

  stopServer(server);
  await new Promise(r => setTimeout(r, 1000));
  await context.setOffline(true);
  const results = {};
  for (const s of screens) {
    const before = errors.length;
    let loaded = true;
    try {
      await page.goto(`${APP}/?screen=${s}`, { waitUntil: "load", timeout: 15000 });
    } catch {
      loaded = false;
    }
    await page.waitForTimeout(1500);
    const boundary = loaded && (await page.getByText("Something went wrong").count()) > 0;
    const detail = boundary ? (await page.locator("code, pre, .font-mono").first().innerText().catch(() => "")) : "";
    results[s] = { loaded, boundary, detail: detail.slice(0, 200), pageErrors: errors.slice(before) };
    if (process.env.SIM_VERBOSE) console.log(`  ${s}: loaded=${loaded} boundary=${boundary} ${detail.slice(0, 80)}`);
    if (!loaded || boundary) await page.screenshot({ path: path.join(OUT, `offline-${s}.png`) });
  }
  const failed = Object.entries(results).filter(([, r]) => !r.loaded || r.boundary);
  fs.writeFileSync(path.join(OUT, "offline-shell.json"), JSON.stringify({ controlled, results }, null, 1));
  console.log(`offline shell: service worker controlling=${controlled}; ${screens.length - failed.length}/${screens.length} screens open offline`);
  for (const [s, r] of failed) console.log(`FAIL offline ${s}: ${r.loaded ? r.detail || "error boundary" : "page did not load"}`);
  await browser.close();
  process.exit(controlled && !failed.length ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
