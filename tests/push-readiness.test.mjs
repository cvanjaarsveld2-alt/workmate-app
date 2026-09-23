// Background (app-closed) notifications on iPhone depend on these staying true.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = p => fs.readFileSync(p, "utf8");

test("sharing a record pushes via send-notifications with the recipient's id", () => {
  const modal = read("src/components/ShareToTeamModal.jsx");
  assert.match(modal, /functions\.invoke\("send-notifications",\s*\{\s*body:\s*\{\s*to_user_id: selectedId/);
  // The sender can't read a teammate's subscriptions (RLS), so it must not try.
  assert.doesNotMatch(modal, /from\("push_subscriptions"\)/);
});

test("a subscription made under an old VAPID key is replaced, not reused", () => {
  const pm = read("src/lib/pushManager.js");
  assert.match(pm, /sameKey\(sub\.options\?\.applicationServerKey/);
  assert.match(pm, /await sub\.unsubscribe\(\)/);
});

test("devices with push leave reminders to the server so they arrive app-closed, once", () => {
  const app = read("src/App.jsx");
  assert.match(app, /hasPush \? \[\] : buildNotificationItems\(/);
});

test("server reminders cover every reminder type the app used to schedule on the device", () => {
  const plan = read("supabase/functions/send-reminders/schedule.ts");
  for (const tag of ["fu_${f.id}", "morning_summary", "ew_${e.id}", "ed_${e.id}", "note_${n.id}"]) assert.ok(plan.includes(tag), tag);
  const fn = read("supabase/functions/send-reminders/index.ts");
  assert.match(fn, /reminder_deliveries/); // claimed once before sending
  assert.match(fn, /VapidPkHashMismatch/); // dead Apple subscriptions are removed
});

test("the installed iPhone app has a real PNG home-screen icon", () => {
  assert.match(read("index.html"), /rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon\.png"/);
  const png = fs.readFileSync("public/icons/apple-touch-icon.png");
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone"); // web push on iOS needs the Home Screen app
  assert.ok(manifest.icons.some(i => i.src === "/icons/icon-512.png" && i.type === "image/png"));
});
