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

const { rebrand } = require("./demo-data.cjs");

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
