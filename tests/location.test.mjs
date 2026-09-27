import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { distanceM, minutesAgo, shouldSend } from "../src/lib/location.js";

test("distance between two points", () => {
  // Johannesburg CBD to Sandton: about 11 km.
  const d = distanceM({ lat: -26.2041, lng: 28.0473 }, { lat: -26.1076, lng: 28.0567 });
  assert.ok(d > 10500 && d < 11000, String(d));
  assert.equal(Math.round(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })), 0);
});

test("a position is sent first, every 3 minutes, or after moving 150 m; rough fixes are skipped", () => {
  const a = { lat: -26.2041, lng: 28.0473, accuracy: 20, at: 0 };
  assert.equal(shouldSend(null, a), true);
  assert.equal(shouldSend(a, { ...a, at: 60000 }), false);
  assert.equal(shouldSend(a, { ...a, at: 180000 }), true);
  const moved = { lat: -26.2026, lng: 28.0473, accuracy: 20 }; // ~167 m north
  assert.equal(shouldSend(a, { ...moved, at: 40000 }), true);
  assert.equal(shouldSend(a, { ...moved, at: 10000 }), false);
  assert.equal(shouldSend(null, { ...a, accuracy: 5000 }), false);
});

test("last seen", () => {
  const now = Date.parse("2026-10-06T10:00:00Z");
  assert.equal(minutesAgo("2026-10-06T09:59:40Z", now), "just now");
  assert.equal(minutesAgo("2026-10-06T09:48:00Z", now), "12 min ago");
  assert.equal(minutesAgo("2026-10-06T08:30:00Z", now), "1 h 30 min ago");
});

test("POPIA: off by default, only while allowed, managers see it, deleted after 30 days", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260928120000_technician_locations.sql", import.meta.url), "utf8");
  assert.match(sql, /share_location boolean not null default false/);
  assert.match(sql, /user_id = auth\.uid\(\) and private\.location_sharing_on\(team_id\)/);
  assert.match(sql, /using \(private\.same_team\(team_id\) and \(user_id = auth\.uid\(\) or private\.is_team_manager\(team_id\)\)\)/);
  assert.match(sql, /delete from public\.tech_locations where recorded_at < now\(\) - interval '30 days'/);
  assert.match(sql, /revoke update, delete on public\.tech_locations from authenticated/);
});
