// Phone screenshots of the app for the website and the user manual, taken with
// the fictional demo company (Acme Hydraulics), never real customer data.
//   node tests/sim/site-shots.cjs        → site/img/app-*.webp
// Builds the app, serves it, opens each screen at iPhone size and saves it.
// Needs ffmpeg for the WebP files: pip install imageio-ffmpeg
const { execSync, spawn } = require("child_process");
const fs = require("fs"),
  path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const DIST = path.join(__dirname, "out", "shots-dist");
const PORT = "4182";
const RAW = path.join(__dirname, "out", "shots");
const IMG = path.join(ROOT, "site", "img");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// [file name, screen, what to do on the screen before the picture]
const SHOTS = [
  ["home", "Home"],
  ["clients", "Clients"],
  ["client-360", "Clients", async page => {
    await page.getByRole("button", { name: /View full details/ }).first().click();
    await page.waitForTimeout(1800);
  }],
  ["quotes", "Quotes"],
  ["jobs", "Jobs"],
  ["job-message", "Jobs", async page => {
    await page.getByRole("button", { name: "Message customer" }).first().click();
    await page.waitForTimeout(900);
    // The link would point at this test server; the picture shows the message without it.
    const box = page.locator("textarea").last();
    await box.fill((await box.inputValue()).replace(/\s*https?:\/\/\S+/g, ""));
  }],
  ["job-form", "Jobs", async page => {
    await page.getByRole("button", { name: "Fill in a form" }).first().click();
    await page.waitForTimeout(900);
    for (const b of await page.getByRole("button", { name: "Yes", exact: true }).all()) await b.click().catch(() => {});
  }],
  ["schedule", "Schedule"],
  ["invoices", "Invoices"],
  ["expenses", "Expenses"],
  ["timesheets", "Timesheets"],
  ["products", "Products"],
  ["purchasing", "Purchasing"],
  ["job-profit", "JobProfit"],
  ["equipment", "Equipment"],
  ["forms", "Forms"],
  ["service-plans", "ServicePlans"],
  ["team", "Team"],
  ["company-profile", "CompanyProfile"],
  ["more", "More"],
  ["plan", "Plan"],
  ["help", "Help"],
];

async function capture() {
  process.env.SIM_OUT = "shots";
  process.env.SIM_SCREENS = "Home";
  process.env.SIM_EMAIL = "anna@acme-hydraulics.example";
  process.env.SIM_NAME = "Anna Venter";
  const { chromium } = require("playwright");
  const H = require("./harness.cjs");
  const { rebrand } = require("./demo-data.cjs");
  rebrand(H.db);
  const browser = await chromium.launch();
  const context = await H.newSimContext(browser);
  const page = await context.newPage();
  const only = (process.env.SHOTS || "").split(",").filter(Boolean);
  const failed = [];
  for (const [name, screen, act] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    try {
      await page.goto(`${H.APP}/?screen=${screen}`, { waitUntil: "load" });
      await page.waitForTimeout(2200);
      if (act) await act(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(RAW, `${name}.png`) });
      console.log("shot", name);
    } catch (e) {
      failed.push(name);
      console.log("FAILED", name, String(e.message || e).split("\n")[0]);
    }
  }
  await browser.close();
  return failed;
}

// The picture WhatsApp, LinkedIn and Facebook show when the website is shared:
// 1200 × 630, the product name and two app screens.
async function linkPreview() {
  const { chromium } = require("playwright");
  const img = n => `data:image/png;base64,${fs.readFileSync(path.join(RAW, `${n}.png`)).toString("base64")}`;
  const html = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;overflow:hidden;background:#8B1A1A;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff;display:flex;align-items:center">
    <div style="padding:0 0 0 72px;width:560px">
      <div style="font-size:30px;font-weight:800;opacity:.85;margin-bottom:22px">${process.env.PRODUCT_NAME || "PowerMate"}</div>
      <div style="font-size:58px;font-weight:800;line-height:1.08;letter-spacing:-1.5px">Quotes, jobs and invoices in your pocket.</div>
      <div style="font-size:26px;margin-top:22px;color:#f3dede">Field service app for South African teams. Works offline.</div>
    </div>
    <div style="display:flex;gap:26px;margin-left:auto;padding-right:56px;transform:translateY(90px)">
      ${["home", "jobs"].map(n => `<div style="background:#16181d;padding:9px;border-radius:34px;box-shadow:0 20px 50px rgba(0,0,0,.35)"><img src="${img(n)}" style="width:250px;border-radius:26px;display:block"></div>`).join("")}
    </div></body></html>`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: path.join(IMG, "og.png") });
  await browser.close();
  console.log("Saved site/img/og.png");
}

(async () => {
  if (process.env.OG_ONLY) return linkPreview();
  fs.mkdirSync(RAW, { recursive: true });
  fs.mkdirSync(IMG, { recursive: true });
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, VITE_SUPABASE_URL: "https://hrqzqyfvbfzrfnuxovvr.supabase.co", VITE_SUPABASE_ANON_KEY: "sim-key" },
  });
  const server = spawn("npx", ["vite", "preview", "--outDir", DIST, "--port", PORT, "--strictPort"], { cwd: ROOT, stdio: "ignore", detached: true });
  let failed = [];
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
      } catch {}
      await sleep(500);
    }
    process.env.SIM_APP_URL = `http://localhost:${PORT}`;
    failed = await capture();
  } finally {
    try {
      process.kill(-server.pid);
    } catch {}
  }
  const ffmpeg = process.env.FFMPEG || execSync(`python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"`).toString().trim();
  for (const f of fs.readdirSync(RAW).filter(f => f.endsWith(".png"))) {
    const out = path.join(IMG, `app-${f.replace(/\.png$/, ".webp")}`);
    // 390 px wide at 2x: sharp on phones and retina screens, about 40-90 KB each.
    execSync(`"${ffmpeg}" -y -loglevel error -i "${path.join(RAW, f)}" -c:v libwebp -quality 80 "${out}"`);
  }
  console.log(`Saved ${fs.readdirSync(IMG).filter(f => f.startsWith("app-")).length} screenshots to site/img`);
  await linkPreview();
  if (failed.length) {
    console.error("Not captured: " + failed.join(", "));
    process.exit(1);
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
