// Draws the iPhone/Android app icons and splash screens from the app's logo
// (public/icon.svg) with the Chromium that Playwright uses.
//   node scripts/native-assets.cjs
// Re-run after changing the logo, then `npx cap sync`.
const fs = require("fs"),
  path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(ROOT, "public/icon.svg"), "utf8");
const BRAND = (svg.match(/fill="(#[0-9A-Fa-f]{6})"/) || [, "#8B1A1A"])[1];
// The white symbol without the red tile, for Android's adaptive icon.
const glyph = svg.replace(/<rect[^>]*\/>/, "");

const page = (w, h, body, bg = "transparent") =>
  `<html><body style="margin:0;width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">${body}</body></html>`;
const sized = (markup, px) => markup.replace("<svg ", `<svg width="${px}" height="${px}" `);

(async () => {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" });
  const shot = async (file, w, h, html, omitBackground = false) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(html);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground });
    await p.close();
  };
  const res = path.join(ROOT, "android/app/src/main/res");
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    const icon = Math.round(48 * k),
      fg = Math.round(108 * k);
    await shot(`${res}/mipmap-${d}/ic_launcher.png`, icon, icon, page(icon, icon, sized(svg, icon)), true);
    await shot(`${res}/mipmap-${d}/ic_launcher_round.png`, icon, icon, page(icon, icon, `<div style="width:${icon}px;height:${icon}px;border-radius:50%;overflow:hidden;background:${BRAND}">${sized(svg, icon)}</div>`), true);
    // Adaptive icon: the symbol inside the 66% safe zone, on the brand colour.
    await shot(`${res}/mipmap-${d}/ic_launcher_foreground.png`, fg, fg, page(fg, fg, sized(glyph, Math.round(fg * 0.62))), true);
  }
  fs.writeFileSync(
    `${res}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`,
  );
  // Splash: the logo in the middle of a white screen.
  const splashes = {
    "drawable/splash.png": [480, 320],
    "drawable-land-mdpi/splash.png": [480, 320],
    "drawable-land-hdpi/splash.png": [800, 480],
    "drawable-land-xhdpi/splash.png": [1280, 720],
    "drawable-land-xxhdpi/splash.png": [1600, 960],
    "drawable-land-xxxhdpi/splash.png": [1920, 1280],
    "drawable-port-mdpi/splash.png": [320, 480],
    "drawable-port-hdpi/splash.png": [480, 800],
    "drawable-port-xhdpi/splash.png": [720, 1280],
    "drawable-port-xxhdpi/splash.png": [960, 1600],
    "drawable-port-xxxhdpi/splash.png": [1280, 1920],
  };
  for (const [f, [w, h]] of Object.entries(splashes)) await shot(`${res}/${f}`, w, h, page(w, h, sized(svg, Math.round(Math.min(w, h) * 0.3)), "#FFFFFF"));
  // iOS: one 1024 px icon, square and opaque (iOS rounds the corners).
  const ios = path.join(ROOT, "ios/App/App/Assets.xcassets");
  const square = svg.replace(/rx="\d+"/, 'rx="0"');
  await shot(`${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, 1024, 1024, page(1024, 1024, sized(square, 1024), BRAND));
  for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"])
    await shot(`${ios}/Splash.imageset/${f}`, 2732, 2732, page(2732, 2732, sized(svg, 640), "#FFFFFF"));
  await browser.close();
  console.log("Icons and splash screens drawn.");
})();
