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
