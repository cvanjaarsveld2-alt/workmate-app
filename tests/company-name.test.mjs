import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The header shows the company's name from the cached profile of the active
// company. On start-up the active company is cleared, then set again once the
// team loads; the header must hear about it or it keeps the product name.
test("changing the active company tells the header", () => {
  const src = fs.readFileSync("src/lib/companyProfile.js", "utf8");
  const fn = src.slice(src.indexOf("export function setActiveTeamId"), src.indexOf("export function activeTeamId"));
  assert.match(fn, /changed = \(localStorage\.getItem\(ACTIVE_TEAM_KEY\) \|\| null\) !== \(teamId \|\| null\)/);
  assert.match(fn, /if \(changed[^)]*\)\s*window\.dispatchEvent\(new CustomEvent\("pm:company-profile"/);
  const wordmark = fs.readFileSync("src/components/Wordmark.jsx", "utf8");
  assert.match(wordmark, /addEventListener\("pm:company-profile", refresh\)/);
});
