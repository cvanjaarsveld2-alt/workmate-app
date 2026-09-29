// ─── Website settings ─────────────────────────────────────────────────────────
// Set these as environment variables in the website's Vercel project (or edit
// the fallbacks here). Leave a contact setting empty to hide its buttons.
const env = k => (process.env[k] || "").trim();
const vercelUrl = env("VERCEL_PROJECT_PRODUCTION_URL");

export const config = {
  product: env("PRODUCT_NAME") || "PowerMate",
  // Where this website lives, e.g. https://www.yourproduct.co.za. Used for
  // canonical links, the sitemap and link previews.
  siteUrl: (env("SITE_URL") || (vercelUrl ? `https://${vercelUrl}` : "http://localhost:4300")).replace(/\/$/, ""),
  // Where the app lives: "Sign in" and "Start free trial" go here.
  appUrl: (env("APP_URL") || "https://workmate-app-pez6.vercel.app").replace(/\/$/, ""),
  // Shown on the site when set: "Email us", "WhatsApp us".
  contactEmail: env("CONTACT_EMAIL"),
  whatsapp: env("CONTACT_WHATSAPP").replace(/[^\d]/g, ""), // international format, e.g. 27821234567
  trialDays: 14,
  // Keep in step with Settings → Platform → Plans in the app.
  plans: [
    { key: "starter", name: "Starter", price: 499, users: "Up to 3 users", blurb: "For a small team getting off paper.", features: ["Customers, leads and contacts", "Quotes with your logo, accepted online", "Jobs and job cards with photos and signatures", "Invoices, payments, credit notes and aged debtors", "Expenses with receipt scanning", "Equipment register with QR labels", "Works offline, syncs when back in signal"] },
    { key: "pro", name: "Pro", price: 1299, users: "Up to 10 users", blurb: "For service teams with technicians on the road.", popular: true, features: ["Everything in Starter", "Schedule and dispatch", "Timesheets and clock in per job", "Products, stock and purchase orders", "Service plans that make their own jobs", "Job profit per job, customer and technician", "Automatic reminders for overdue invoices and quotes", "Customers pay online by card or EFT (PayFast)", "WhatsApp and SMS to customers", "Custom forms and safety checklists", "Technician locations"] },
    { key: "enterprise", name: "Enterprise", price: 2999, users: "Unlimited users", blurb: "For larger operations that run their books in Xero.", features: ["Everything in Pro", "Xero sync for invoices, payments and credit notes", "Unlimited users"] },
  ],
};
