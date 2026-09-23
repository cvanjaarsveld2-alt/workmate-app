// Security regressions for Edge Functions and team data access.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");

test("paid AI/API functions verify a real signed-in user, not just any JWT", () => {
  // verify_jwt also accepts the public anon key, so each must check the session itself.
  for (const fn of ["transcribe-audio", "format-meeting-minutes", "scan-business-card", "historical-rate"]) {
    const src = read(`supabase/functions/${fn}/index.ts`);
    assert.match(src, /\/auth\/v1\/user/, `${fn} checks the session`);
    assert.match(src, /if \(!\(await requireUser\(req\)\)\) return json\(\{ error: "Unauthorized" \}, 401\)/, `${fn} rejects before doing work`);
  }
  assert.doesNotMatch(read("supabase/functions/scan-business-card/index.ts"), /imageUrl/); // no server-side URL fetching
});

test("the meeting recorder sends the user's session to both functions", () => {
  const src = read("src/screens/MeetingScreen.jsx");
  assert.match(src, /headers: auth, body: formData/);
  assert.match(src, /headers: \{ \.\.\.auth, "Content-Type": "application\/json" \}/);
});

test("the email ingest secret is compared in constant time and the user must exist", () => {
  const src = read("supabase/functions/ingest-email-record/index.ts");
  assert.match(src, /secretMatches\(presented, sharedSecret\)/);
  assert.doesNotMatch(src, /presented !== sharedSecret/);
  assert.match(src, /from\("users"\)\.select\("id"\)\.eq\("id", userId\)/);
});

test("team records are gated by team visibility in the database, not only the UI", () => {
  const sql = read("supabase/migrations/20260923080000_enforce_team_visibility.sql");
  assert.match(sql, /t\.owner_user_id = auth\.uid\(\) or tm\.role = 'admin' or coalesce\(tm\.can_view_team, false\)/);
  for (const t of ["clients", "contacts", "followups", "leads", "notes", "quotes", "expenses", "equipment", "activities", "vehicle_checks"])
    assert.match(sql, new RegExp(`alter policy ${t}_sel on public\\.${t} using \\([^;]*private\\.can_see_team\\(team_id\\)`), t);
  assert.match(sql, /revoke all on all tables in schema public from anon;/);
});
