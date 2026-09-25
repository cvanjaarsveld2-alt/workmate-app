import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync("supabase/migrations/20260926130000_two_step_login.sql", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");

test("once set up, admin actions need a session that passed the code step", () => {
  assert.match(sql, /auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2'/);
  assert.match(sql, /auth\.mfa_factors f where f\.user_id = auth\.uid\(\) and f\.status = 'verified'/);
  for (const fn of ["set_member_access", "remove_team_member", "regenerate_invite_code", "set_platform_setting"])
    assert.match(sql, new RegExp(`function public\\.${fn}[\\s\\S]*?if not private\\.mfa_ok\\(\\)`), fn);
  assert.match(sql, /team_profiles_update[\s\S]*mfa_ok/);
});

test("sign-in asks for the code, and companies can require it for admins", () => {
  assert.match(app, /twoStep\.next === "aal2" && twoStep\.current !== "aal2"/);
  assert.match(app, /companyProfile\.require_admin_mfa && twoStep\.next !== "aal2"/);
  assert.match(fs.readFileSync("src/screens/MoreScreen.jsx", "utf8"), /<TwoStepSettings \/>/);
});
