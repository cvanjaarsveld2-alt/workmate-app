import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Tailwind 4 keeps the app looking exactly as it did on Tailwind 3 through a
// few deliberate settings in src/index.css. These checks stop them from being
// dropped or bypassed by accident.
const css = fs.readFileSync("src/index.css", "utf8");
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(jsx?|tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []);

test("layouts use stack-y (Tailwind 3 spacing), not Tailwind 4's space-y", () => {
  const offenders = walk("src").filter(f => /(^|[^a-z0-9_-])space-y-\d/.test(fs.readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], "use stack-y-N: space-y-N spaces differently in Tailwind 4");
  assert.match(css, /@utility stack-y-\*/);
});

test("Tailwind 3 palette, font stack and line-heights are kept", () => {
  assert.match(css, /@import '\.\/tailwind-v3-colors\.css';/);
  assert.match(fs.readFileSync("src/tailwind-v3-colors.css", "utf8"), /--color-red-600: #dc2626;/);
  assert.match(css, /--font-sans: ui-sans-serif, system-ui, sans-serif/);
  assert.match(css, /--text-xs--line-height: 1rem;/);
  // The readable slate-400 override must come after the v3 palette import.
  assert.ok(css.indexOf("--color-slate-400: #737f92") > css.indexOf("tailwind-v3-colors.css"));
});

test("app base rules sit in the base layer so utilities still win", () => {
  const base = css.slice(css.indexOf("@layer base {\n  html, body"));
  assert.ok(base.length > 0, "html/body rules must be inside @layer base");
  assert.match(base, /input, select, textarea \{\s*font-size: 16px;/);
});
