import test from "node:test";
import assert from "node:assert/strict";
import { VAT_RATE, roundMoney, calculateVat, reconcileMoney } from "../src/lib/finance.js";

test("VAT rate is the configured South African standard rate", () => {
  assert.equal(VAT_RATE, 0.15);
});

test("roundMoney rounds to cents", () => {
  assert.equal(roundMoney(86.95652173913044), 86.96);
  assert.equal(roundMoney(123.454), 123.45);
  assert.equal(roundMoney(123.455), 123.46);
});

test("inclusive VAT preserves quoted total", () => {
  const result = calculateVat(100, true);
  assert.deepEqual(result, { subtotal: 86.96, vat: 13.04, total: 100 });
  assert.equal(reconcileMoney(result.subtotal, result.vat), result.total);
});

test("exclusive VAT produces a cent-rounded total", () => {
  const result = calculateVat(100, false);
  assert.deepEqual(result, { subtotal: 100, vat: 15, total: 115 });
  assert.equal(reconcileMoney(result.subtotal, result.vat), result.total);
});

test("inclusive VAT reconciles repeating decimal cases", () => {
  const result = calculateVat(999.99, true);
  assert.equal(reconcileMoney(result.subtotal, result.vat), result.total);
  assert.equal(result.total, 999.99);
});

test("exclusive VAT reconciles cents without floating point residue", () => {
  const result = calculateVat(86.95, false);
  assert.equal(reconcileMoney(result.subtotal, result.vat), result.total);
  assert.equal(result.total, 99.99);
});

test("zero and invalid inputs are safe", () => {
  assert.deepEqual(calculateVat(0, true), { subtotal: 0, vat: 0, total: 0 });
  assert.deepEqual(calculateVat("not-a-number", true), { subtotal: 0, vat: 0, total: 0 });
});

test("negative values are rounded deterministically", () => {
  assert.equal(roundMoney(-12.345), -12.34);
});
