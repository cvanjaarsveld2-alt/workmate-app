// Company sign-up: a signed-in person who isn't in a company yet gets the
// setup step, creates a company (accepting the terms), works through the
// setup wizard, and lands in the app as that company's master account.
// Usage: see run.cjs (runs as a user with no company).
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const H = require("./harness.cjs");

const OUT = path.join(__dirname, "out", process.env.SIM_OUT || "onboarding");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (flow, status, detail) => { results.push({ flow, status, detail }); console.log(status.padEnd(4), flow, "—", detail); };

(async () => {
  const browser = await chromium.launch();
  const context = await H.newSimContext(browser);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message).slice(0, 200)));
  try {
    await page.goto(`${H.APP}/?screen=Home`, { waitUntil: "load" });
    await page.waitForTimeout(5000);
    const offered = (await page.getByText("Set up my company").count()) > 0;
    await page.screenshot({ path: path.join(OUT, "setup-choose.png") });
    await page.getByText("Set up my company").click();
    await page.locator('label:text-is("Company name") + input').fill("Acme Hydraulics (Pty) Ltd");
    const termsBox = page.getByRole("checkbox").first();
    const termsShown = (await termsBox.count()) > 0;
    if (termsShown) await termsBox.check();
    await page.getByRole("button", { name: "Create company" }).click();
    await page.waitForTimeout(1500);
    const team = H.db.teams.find(t => t.name === "Acme Hydraulics (Pty) Ltd");
    // Step 1: company details.
    await page.locator('label:text-is("Registered name") + input').fill("Acme Hydraulics (Pty) Ltd");
    await page.locator('label:text-is("VAT no.") + input').fill("4999999999");
    await page.getByRole("button", { name: "Save & continue" }).click(); await page.waitForTimeout(800);
    // Steps 2–5: skip.
    for (let i = 0; i < 4; i++) { await page.getByRole("button", { name: "Skip" }).click(); await page.waitForTimeout(300); }
    const inviteText = await page.locator("div.font-mono").innerText().catch(() => "");
    await page.screenshot({ path: path.join(OUT, "setup-invite.png") });
    await page.getByRole("button", { name: /Finish/ }).click();
    await page.waitForTimeout(4000);
    const inApp = (await page.getByText("Set up my company").count()) === 0 && (await page.getByText("Something went wrong").count()) === 0;
    await page.screenshot({ path: path.join(OUT, "setup-done.png") });
    const profile = (H.db.team_profiles || []).find(p => team && p.team_id === team.id) || {};
    const terms = H.log.writes.some(w => w.fn === "accept_terms");
    rec("onboarding: set up a new company",
      offered && termsShown && terms && team && profile.legal_name === "Acme Hydraulics (Pty) Ltd" && profile.vat_no === "4999999999" && /\?join=NEWCO2345678$/.test(inviteText.trim()) && inApp && !errors.length ? "PASS" : "FAIL",
      `offered=${offered}; terms shown=${termsShown} recorded=${terms}; company created=${!!team}; details saved=${profile.legal_name}/${profile.vat_no}; invite link=${inviteText.trim()}; in app after finish=${inApp}; errors=${JSON.stringify(errors)}`);
  } catch (e) {
    rec("onboarding: set up a new company", "FAIL", "script error: " + String(e.message).split("\n")[0]);
    await page.screenshot({ path: path.join(OUT, "setup-error.png") }).catch(() => {});
  }
  fs.writeFileSync(path.join(OUT, "onboarding.json"), JSON.stringify({ results, violations: H.log.violations }, null, 1));
  await browser.close();
  process.exit(results.some(r => r.status === "FAIL") || H.log.violations.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
