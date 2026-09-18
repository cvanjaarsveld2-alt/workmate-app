import test from "node:test";
import assert from "node:assert/strict";
import { VAT_RATE, roundMoney, calculateVat, reconcileMoney } from "../src/lib/finance.js";

test("VAT rate is 15%", () => assert.equal(VAT_RATE, 0.15));
test("roundMoney uses two decimal places", () => {
  assert.equal(roundMoney(86.95652173913044), 86.96);
  assert.equal(roundMoney(123.455), 123.46);
});
test("inclusive VAT preserves total and reconciles", () => {
  const r = calculateVat(100, true);
  assert.deepEqual(r, { subtotal: 86.96, vat: 13.04, total: 100 });
  assert.equal(reconcileMoney(r.subtotal, r.vat), r.total);
});
test("exclusive VAT reconciles", () => {
  const r = calculateVat(86.95, false);
  assert.equal(r.total, 99.99);
  assert.equal(reconcileMoney(r.subtotal, r.vat), r.total);
});
test("repeating and zero values remain cent-safe", () => {
  for (const [amount, inclusive] of [[999.99,true],[0,true],[0,false],[1,true],[1,false]]) {
    const r = calculateVat(amount, inclusive);
    assert.equal(reconcileMoney(r.subtotal, r.vat), r.total);
    assert.equal(Math.round(r.subtotal * 100), r.subtotal * 100);
    assert.equal(Math.round(r.vat * 100), r.vat * 100);
    assert.equal(Math.round(r.total * 100), r.total * 100);
  }
});
