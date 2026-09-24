// Visual audit: opens every screen (and the nav drawer) in light and dark mode
// and flags
//   - text whose contrast against its actual background is below WCAG 3:1
//     (bold/large text minimum; body text should really be 4.5:1),
//   - numbers/amounts that wrap onto a second line,
//   - anything wider than the phone screen (horizontal overflow).
// Writes <out>/visual-audit.json and screenshots. Usage: see run.cjs.
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const H = require("./harness.cjs");

const OUT = path.join(__dirname, "out", process.env.SIM_OUT || "visual");
fs.mkdirSync(OUT, { recursive: true });
const screens = (process.env.SIM_SCREENS || "Home").split(",").filter(Boolean);
const themes = (process.env.SIM_THEMES || "light,dark").split(",");

// Runs in the page. Returns issues for everything currently rendered.
function auditPage() {
  const parse = c => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (top, bottom) => ({
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  });
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  // Background actually behind an element: composite ancestor backgrounds
  // (a gradient counts as its first colour) down to the page.
  function backgroundOf(el) {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== "none" && /gradient/.test(img)) {
        const first = parse(img);
        if (first) { layers.push({ ...first, a: 1 }); break; }
      }
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const rootBg = parse(getComputedStyle(document.body).backgroundColor);
    if (rootBg && rootBg.a > 0) base = rootBg;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.35) return false;
    }
    return r.bottom > 0 && r.top < innerHeight * 3;
  };
  const describe = el => {
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 6).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  };

  const issues = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.replace(/\s+/g, " ").trim();
    // Skip separators ("·", "—") and emoji-only text: no letters or digits to read.
    if (!/[\p{L}\p{N}]/u.test(text)) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || !visible(el) || el.closest("svg, [aria-hidden='true']")) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const bg = backgroundOf(el);
    const color = over(fg, bg);
    const r = ratio(color, bg);
    if (r < 3 && !el.disabled && !el.closest("input, textarea, select")) {
      issues.push({ kind: "contrast", ratio: Math.round(r * 100) / 100, text: text.slice(0, 50), fg: hex(color), bg: hex(bg), el: describe(el) });
    }
    // Amounts/numbers must stay on one line.
    if (/^[A-Z$€£]{0,3}\s?-?[\d\s,.]+%?$/.test(text) && /\d{3}/.test(text.replace(/[\s,.]/g, ""))) {
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const h = el.getBoundingClientRect().height;
      if (h > lh * 1.6 && el.getClientRects().length >= 1) {
        const range = document.createRange(); range.selectNodeContents(t);
        const lines = new Set([...range.getClientRects()].map(q => Math.round(q.top))).size;
        if (lines > 1) issues.push({ kind: "wrapped-number", text, el: describe(el) });
      }
    }
  }
  // Horizontal overflow of the page or of individual elements.
  if (document.documentElement.scrollWidth > innerWidth + 1)
    issues.push({ kind: "page-overflow", width: document.documentElement.scrollWidth, viewport: innerWidth });
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.right <= innerWidth + 1 || !visible(el)) continue;
    let clipped = false;
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const o = getComputedStyle(n).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") { clipped = true; break; }
    }
    if (!clipped && getComputedStyle(el).position !== "fixed")
      issues.push({ kind: "element-overflow", right: Math.round(r.right), el: describe(el), text: (el.innerText || "").slice(0, 40) });
  }
  return issues;
}

(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const theme of themes) {
    const context = await H.newSimContext(browser);
    await context.addInitScript(t => { try { localStorage.setItem("pm_theme", t); } catch {} }, theme);
    const page = await context.newPage();
    await page.goto(`${H.APP}/?screen=Home`, { waitUntil: "load" });
    await page.waitForTimeout(5000);
    const targets = [...screens.map(s => ({ name: s, screen: s })), { name: "NavDrawer", screen: "Home", drawer: true }];
    for (const t of targets) {
      await page.goto(`${H.APP}/?screen=${t.screen}`, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      if (t.drawer) {
        await page.getByRole("button", { name: /menu/i }).first().click().catch(() => {});
        await page.waitForTimeout(800);
      }
      const issues = await page.evaluate(auditPage);
      report[`${theme}/${t.name}`] = issues;
      await page.screenshot({ path: path.join(OUT, `${theme}-${t.name}.png`), fullPage: true });
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "visual-audit.json"), JSON.stringify(report, null, 1));
  let total = 0;
  for (const [key, issues] of Object.entries(report)) {
    if (!issues.length) continue;
    total += issues.length;
    const by = issues.reduce((m, i) => ((m[i.kind] = (m[i.kind] || 0) + 1), m), {});
    console.log(`${key}: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    if (process.env.SIM_VERBOSE) for (const i of issues) console.log("   ", JSON.stringify(i));
  }
  console.log(`visual audit: ${total} issue(s) across ${Object.keys(report).length} views`);
  process.exit(total ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
