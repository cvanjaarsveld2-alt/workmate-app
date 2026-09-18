// ─── Finance / Money utilities ───────────────────────────────────────────────
// Single source of truth for VAT and cent-safe monetary arithmetic.
export const VAT_RATE = 0.15;
export const VAT_PERCENT = VAT_RATE * 100;

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateVat(total, vatInclusive = true) {
  const amount = roundMoney(total);
  if (vatInclusive) {
    const subtotal = roundMoney(amount / (1 + VAT_RATE));
    const vat = roundMoney(amount - subtotal);
    return { subtotal, vat, total: amount };
  }
  const subtotal = roundMoney(amount);
  const vat = roundMoney(subtotal * VAT_RATE);
  const finalTotal = roundMoney(subtotal + vat);
  return { subtotal, vat, total: finalTotal };
}

export function reconcileMoney(subtotal, vat) {
  return roundMoney(roundMoney(subtotal) + roundMoney(vat));
}
