// PayFast request building and checking, shared by the edge function
// (index.ts) and the unit tests (tests/payfast.test.mjs). No Deno or Node
// APIs here; the MD5 is passed in.

// PHP urlencode, which PayFast signs with: spaces as +, and !'()*~ encoded.
export const pfEncode = v =>
  encodeURIComponent(String(v ?? "").trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// "key=value&..." in the given order, skipping blanks, then the passphrase.
export function paramString(pairs, passphrase) {
  const parts = pairs.filter(([k, v]) => k !== "signature" && String(v ?? "").trim() !== "").map(([k, v]) => `${k}=${pfEncode(v)}`);
  if (passphrase) parts.push(`passphrase=${pfEncode(passphrase)}`);
  return parts.join("&");
}

export const hosts = sandbox => (sandbox ? "sandbox.payfast.co.za" : "www.payfast.co.za");

// The form fields for paying an invoice, in the order PayFast requires.
export function checkoutFields(d, { returnUrl, cancelUrl, notifyUrl }) {
  const pairs = [
    ["merchant_id", d.merchant_id],
    ["merchant_key", d.merchant_key],
    ["return_url", returnUrl],
    ["cancel_url", cancelUrl],
    ["notify_url", notifyUrl],
    ["email_address", d.email || ""],
    ["m_payment_id", d.invoice_id],
    ["amount", Number(d.amount).toFixed(2)],
    ["item_name", `Invoice ${d.invoice_number || ""}`.trim().slice(0, 100)],
    ["item_description", (d.company ? `Payment to ${d.company}` : "").slice(0, 255)],
  ].filter(([, v]) => String(v ?? "").trim() !== "");
  return pairs;
}

// A PayFast notification body (x-www-form-urlencoded), keeping its order.
export function parseNotification(body) {
  return String(body || "")
    .split("&")
    .filter(Boolean)
    .map(kv => {
      const i = kv.indexOf("=");
      const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, " "));
      const v = i < 0 ? "" : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " "));
      return [k, v];
    });
}

// Only https (or localhost while developing) return addresses.
export function safeReturnUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.hostname === "localhost" ? u.toString() : null;
  } catch {
    return null;
  }
}
