// ─── Product brand ────────────────────────────────────────────────────────────
// The app's own name, separate from the company using it. Each company's name,
// logo and details come from its company profile (src/lib/companyProfile.js).
// Rename the product in one place: set VITE_PRODUCT_NAME at build time.
export const PRODUCT_NAME = import.meta.env?.VITE_PRODUCT_NAME || "PowerMate";
export const PRODUCT_TAGLINE = "Field service CRM";
export const PRODUCT_VERSION = "2.5";
