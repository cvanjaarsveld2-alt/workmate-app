// Readability audit: opens each screen and measures every visible text element's
// font size and contrast against its real background. Writes out/<name>/text-audit.json.
const fs = require("fs"), path = require("path");
process.env.SIM_SCREENS = "Home";
const H = require("./harness.cjs");
const SCREENS = (process.env.AUDIT_SCREENS || "Home,Clients,Contacts,Followups,Notes,Equipment,Quotes,Expenses,More,Planner,ColdCall,JackSelector,Meeting,Breakdown,Repair,Analytics,Leads,Team,VehicleCheck,Notifications,SharedInbox,Jobs,Invoices,Calendar,TeamDashboard").split(",");
(async () => {
  const S = await H.run(); const { page, setTag } = S;
  const out = {};
  const dir = path.join(__dirname, "out", process.env.SIM_OUT || "audit"); fs.mkdirSync(dir, { recursive: true });
  for (const s of SCREENS) {
    setTag(s); await page.goto(`${H.APP}/?screen=${s}`, { waitUntil: "load" }); await page.waitForTimeout(2500);
    // SIM_SHOTS=1 also saves a screenshot per screen (use with SIM_DARK=1 for dark mode).
    if (process.env.SIM_SHOTS) await page.screenshot({ path: path.join(dir, `${s}.png`) });
    out[s] = await page.evaluate(() => {
      const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgElOf = el => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return e; } return null; };
      const bgOf = el => { const e = bgElOf(el); return e ? parse(getComputedStyle(e).backgroundColor) : { r: 247, g: 243, b: 243, a: 1 }; };
      const rows = [];
      for (const el of document.querySelectorAll("body *")) {
        const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(" ").trim();
        if (!own || own.length < 2) continue;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.opacity === "0") continue;
        const fg = parse(cs.color); if (!fg) continue;
        const bg = bgOf(el);
        const blend = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
        const L1 = lum(blend), L2 = lum(bg); const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const row = { text: own.slice(0, 60), size: parseFloat(cs.fontSize), weight: +cs.fontWeight, contrast: Math.round(contrast * 100) / 100, cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 120) };
        // For failures, keep the inline styles involved: inline colours are what class-based dark mode can't reach.
        if (contrast < 4.5) { row.style = el.getAttribute("style") || ""; row.bgStyle = bgElOf(el)?.getAttribute("style") || ""; }
        rows.push(row);
      }
      // Layout problems the size change could cause: page wider than the screen,
      // and pills/badges whose text now wraps onto a second line.
      const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
      const wrappedPills = [...document.querySelectorAll(".rounded-full")].filter(el => {
        const t = el.innerText.trim(); if (!t || t.length > 40) return false;
        const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
        return el.getBoundingClientRect().height > lh * 1.9 + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      }).map(el => el.innerText.trim().slice(0, 40));
      return { rows, pageOverflow, wrappedPills };
    });
  }
  fs.writeFileSync(path.join(dir, "text-audit.json"), JSON.stringify(out, null, 1));
  await S.browser.close();
})();
