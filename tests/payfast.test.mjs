import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { checkoutFields, hosts, paramString, parseNotification, pfEncode, safeReturnUrl } from "../supabase/functions/payfast/payfast.js";

const md5 = s => crypto.createHash("md5").update(s).digest("hex");

test("encodes like PHP urlencode, which PayFast signs with", () => {
  assert.equal(pfEncode(" Invoice INV-00012 "), "Invoice+INV-00012");
  assert.equal(pfEncode("a&b=c/d"), "a%26b%3Dc%2Fd");
  assert.equal(pfEncode("it's (ok)!*~"), "it%27s+%28ok%29%21%2A%7E");
});

test("checkout fields are in PayFast's order, blanks left out, with the passphrase last", () => {
  const pairs = checkoutFields(
    { merchant_id: "10000100", merchant_key: "46f0cd694581a", amount: 1150, invoice_id: "0f0c", invoice_number: "INV-00012", company: "Acme", email: "" },
    { returnUrl: "https://app.example.com/?portal=x&paid=1", cancelUrl: "https://app.example.com/?portal=x", notifyUrl: "https://db.example.com/functions/v1/payfast" },
  );
  assert.deepEqual(pairs.map(([k]) => k), ["merchant_id", "merchant_key", "return_url", "cancel_url", "notify_url", "m_payment_id", "amount", "item_name", "item_description"]);
  assert.equal(pairs.find(([k]) => k === "amount")[1], "1150.00");
  const s = paramString(pairs, "jt7NOE43FZPn");
  assert.match(s, /^merchant_id=10000100&merchant_key=46f0cd694581a&return_url=https%3A%2F%2Fapp\.example\.com%2F%3Fportal%3Dx%26paid%3D1&/);
  assert.match(s, /&item_name=Invoice\+INV-00012&item_description=Payment\+to\+Acme&passphrase=jt7NOE43FZPn$/);
  assert.equal(md5(s).length, 32);
});

test("a notification is checked in the order it arrived, without its signature", () => {
  const fields = [["m_payment_id", "abc"], ["pf_payment_id", "1089250"], ["payment_status", "COMPLETE"], ["item_name", "Invoice INV-1"], ["amount_gross", "1150.00"], ["amount_fee", "-26.45"], ["merchant_id", "10000100"]];
  const sig = md5(paramString(fields, "secret phrase"));
  const body = paramString([...fields, ["signature", sig]], "");
  const parsed = parseNotification(body);
  assert.equal(parsed.find(([k]) => k === "item_name")[1], "Invoice INV-1");
  assert.equal(md5(paramString(parsed, "secret phrase")), sig);
  // Any change, or the wrong passphrase, gives a different signature.
  assert.notEqual(md5(paramString(parsed.map(([k, v]) => [k, k === "amount_gross" ? "1.00" : v]), "secret phrase")), sig);
  assert.notEqual(md5(paramString(parsed, "guess")), sig);
});

test("hosts and return addresses", () => {
  assert.equal(hosts(true), "sandbox.payfast.co.za");
  assert.equal(hosts(false), "www.payfast.co.za");
  assert.equal(safeReturnUrl("javascript:alert(1)"), null);
  assert.equal(safeReturnUrl("http://evil.example.com/"), null);
  assert.equal(safeReturnUrl("https://app.example.com/?portal=x"), "https://app.example.com/?portal=x");
});

test("the edge function confirms with PayFast and records payments once", () => {
  const src = fs.readFileSync(new URL("../supabase/functions/payfast/index.ts", import.meta.url), "utf8");
  assert.match(src, /\/eng\/query\/validate/);
  assert.match(src, /expected !== get\("signature"\)/);
  assert.match(src, /get\("merchant_id"\) !== g\.merchant_id/);
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927130000_online_payments.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke all on private\.payment_gateways from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.payfast_checkout_data\(text, uuid\) to service_role/);
  assert.match(sql, /idempotency_key = v_key/);
});
