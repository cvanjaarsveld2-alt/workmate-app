import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto, createHash } from "node:crypto";

// Behavioural test of the real PIN helpers: slice them out of PINScreens.jsx
// and run them against an in-memory localStorage.
function loadPinHelpers() {
  const src = fs.readFileSync("src/auth/PINScreens.jsx", "utf8");
  const body = src.slice(src.indexOf("async function _digestHex"), src.indexOf("export function getPINHash"));
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const scopedPinKey = (k, uid) => `${k}:${uid}`;
  const PIN_KEY = "pin";
  const fn = new Function(
    "crypto", "localStorage", "scopedPinKey", "PIN_KEY", "TextEncoder",
    `${body}\nreturn { savePINHash, verifyPIN, PIN_PBKDF2_ITERATIONS };`,
  );
  return { store, ...fn(webcrypto, localStorage, scopedPinKey, PIN_KEY, TextEncoder) };
}
const sha = s => createHash("sha256").update(s).digest("hex");

test("new PINs are stored as PBKDF2 v3 and verify", async () => {
  const h = loadPinHelpers();
  await h.savePINHash("123456", "u1");
  const stored = h.store.get("pin:u1");
  assert.match(stored, new RegExp(`^v3\\$${h.PIN_PBKDF2_ITERATIONS}\\$[0-9a-f]{32}\\$[0-9a-f]{64}$`));
  assert.ok(h.PIN_PBKDF2_ITERATIONS >= 100000);
  assert.equal(await h.verifyPIN("123456", "u1"), true);
  assert.equal(await h.verifyPIN("654321", "u1"), false);
  assert.equal(await h.verifyPIN("123456", "u2"), false);
});

for (const [label, make] of [
  ["v2$ salted SHA-256", pin => `v2$${"a".repeat(32)}$${sha(pin + "a".repeat(32))}`],
  ["malformed v2 (no separators)", pin => `v2${"b".repeat(32)}${sha(pin + "b".repeat(32))}`],
  ["Build 8 static salt", pin => sha(pin + "powermate_salt_v1")],
]) {
  test(`legacy ${label} PINs still unlock and are upgraded to v3`, async () => {
    const h = loadPinHelpers();
    h.store.set("pin:u1", make("246810"));
    assert.equal(await h.verifyPIN("111111", "u1"), false);
    assert.doesNotMatch(h.store.get("pin:u1"), /^v3\$/, "a wrong PIN must not rewrite the hash");
    assert.equal(await h.verifyPIN("246810", "u1"), true);
    assert.match(h.store.get("pin:u1"), /^v3\$/);
    assert.equal(await h.verifyPIN("246810", "u1"), true);
  });
}

test("v3 hashes below the current work factor are upgraded on unlock", async () => {
  const h = loadPinHelpers();
  await h.savePINHash("135790", "u1");
  const [, , salt] = h.store.get("pin:u1").split("$");
  // Re-derive a low-iteration hash with the same helper shape.
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode("135790"), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 1000 }, key, 256);
  const hex = Buffer.from(bits).toString("hex");
  h.store.set("pin:u1", `v3$1000$${salt}$${hex}`);
  assert.equal(await h.verifyPIN("135790", "u1"), true);
  assert.match(h.store.get("pin:u1"), new RegExp(`^v3\\$${h.PIN_PBKDF2_ITERATIONS}\\$`));
});
