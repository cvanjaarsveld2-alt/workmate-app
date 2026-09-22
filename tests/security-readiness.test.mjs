import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = p => fs.readFileSync(p, "utf8");

test("production security headers are defined", () => {
  const config = JSON.parse(read("vercel.json"));
  const headers = config.headers?.[0]?.headers || [];
  const values = new Map(headers.map(h => [h.key.toLowerCase(), h.value]));
  for (const key of [
    "strict-transport-security","x-content-type-options","referrer-policy",
    "permissions-policy","content-security-policy","cross-origin-opener-policy",
    "cross-origin-resource-policy",
  ]) assert.ok(values.has(key), key);
  assert.match(values.get("content-security-policy"), /object-src 'none'/);
  assert.match(values.get("content-security-policy"), /base-uri 'none'/);
  assert.match(values.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("client source contains no server-side secret material", () => {
  const root = path.join(process.cwd(), "src");
  const files = [];
  const walk = dir => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else if (/\.(js|jsx|ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(root);
  const forbidden = [/service_role/i, /SUPABASE_SERVICE_ROLE_KEY/i, /sk-[A-Za-z0-9_-]{20,}/];
  for (const file of files) {
    const source = read(file);
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, file);
  }
});

test("service worker does not cache Supabase/API responses", () => {
  const sw = read("public/service-worker.js");
  assert.match(sw, /url\.hostname\.includes\("supabase"\)/);
});

test("CSV exports neutralize spreadsheet formulas but keep numbers numeric", async () => {
  const { neutralizeFormula } = await import("../src/lib/csv.js");
  assert.equal(neutralizeFormula("=HYPERLINK(\"http://x\")"), "'=HYPERLINK(\"http://x\")");
  assert.equal(neutralizeFormula("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(neutralizeFormula("+27 82 000"), "'+27 82 000");
  assert.equal(neutralizeFormula("-12.50"), "-12.50");
  assert.equal(neutralizeFormula("Engen Garage"), "Engen Garage");
  assert.equal(neutralizeFormula(null), "");
  for (const file of ["src/components/BackupExport.jsx", "src/ReportExport.jsx", "src/screens/ExpensesScreen.jsx"]) {
    assert.match(read(file), /neutralizeFormula\(/, file);
  }
});

test("receipt scanner verifies the session instead of trusting JWT claims", () => {
  const source = read("supabase/functions/scan-receipt/index.ts");
  assert.match(source, /auth\/v1\/user/);
  assert.doesNotMatch(source, /JSON\.parse\(atob/);
  assert.doesNotMatch(source, /detail: (storageText|errText)/);
  assert.match(source, /MAX_IMAGE_BASE64_CHARS/);
});

test("production build does not publish source maps", () => {
  assert.match(read("vite.config.js"), /sourcemap:\s*false/);
});

test("notification clicks only open same-origin pages", () => {
  assert.match(read("public/service-worker.js"), /safeNotificationUrl\(e\.notification\.data\?\.url\)/);
});

test("password reset never reveals whether an account exists", () => {
  const source = read("src/auth/AuthScreen.jsx");
  assert.match(source, /resetPasswordForEmail/);
  assert.match(source, /If that email has a PowerMate account/);
  assert.match(read("src/App.jsx"), /PASSWORD_RECOVERY/);
});
