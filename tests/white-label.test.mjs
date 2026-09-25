import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULES, offeredModules, unavailableScreens } from "../src/lib/modules.js";

const files = dir =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(jsx?|md)$/.test(e.name) ? [p] : [];
  });

test("no company, person or domain is hard-coded in what users see", () => {
  const offenders = [];
  for (const f of files("src")) {
    fs.readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (/Power Works|pwrstart|Renita|\bVicky\b|PW_LOGO/.test(code)) offenders.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("modules map to real screens and switch them off", () => {
  const app = fs.readFileSync("src/App.jsx", "utf8");
  for (const m of MODULES) for (const s of m.screens) assert.match(app, new RegExp(`"${s}"`), `${m.key}: ${s}`);
  assert.deepEqual(unavailableScreens(["jack_selector"]), ["JackSelector"]);
  assert.deepEqual(unavailableScreens([]), []);
  assert.ok(unavailableScreens(["quotes_invoicing"]).includes("Invoices"));
  // Core screens are never part of a module.
  const all = MODULES.flatMap(m => m.screens);
  for (const core of ["Home", "Clients", "Contacts", "More", "Team", "CompanyProfile"]) assert.ok(!all.includes(core), core);
});

test("the database only accepts known modules", () => {
  const sql = fs.readFileSync("supabase/migrations/20260926120000_team_profiles_modules.sql", "utf8");
  for (const m of MODULES) assert.ok(sql.includes(`'${m.key}'`), m.key);
});

test("Jack Selector is only offered to a company that already has it", () => {
  assert.ok(offeredModules([]).some(m => m.key === "jack_selector"));
  assert.ok(!offeredModules(["jack_selector"]).some(m => m.key === "jack_selector"));
  assert.equal(offeredModules(["jack_selector"]).length, MODULES.length - 1);
});
