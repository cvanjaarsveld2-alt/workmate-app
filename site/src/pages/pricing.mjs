import { config } from "../../config.mjs";
import { contactButtons, esc, rand, signupUrl } from "../layout.mjs";

const P = config.product;
const Y = "✓";

// What's in each plan. Keep in step with Settings → Platform → Plans in the app.
const ROWS = [
  ["The basics", null],
  ["Customers, leads, contacts and notes", [Y, Y, Y]],
  ["Quotes with your logo, accepted and signed online", [Y, Y, Y]],
  ["Jobs and job cards with photos and signatures", [Y, Y, Y]],
  ["Invoices, payments, credit notes, aged debtors", [Y, Y, Y]],
  ["Expenses with receipt scanning and email inbox", [Y, Y, Y]],
  ["Equipment register with QR labels", [Y, Y, Y]],
  ["Customer portal", [Y, Y, Y]],
  ["Export for Sage, Xero and QuickBooks (CSV)", [Y, Y, Y]],
  ["Works offline", [Y, Y, Y]],
  ["Running the team", null],
  ["Schedule and dispatch", ["", Y, Y]],
  ["Timesheets and clock in per job", ["", Y, Y]],
  ["Technician locations", ["", Y, Y]],
  ["Custom forms and safety checklists", ["", Y, Y]],
  ["Stock and money", null],
  ["Products, stock and reorder levels", ["", Y, Y]],
  ["Suppliers and purchase orders", ["", Y, Y]],
  ["Service plans that book themselves", ["", Y, Y]],
  ["Job profit per job, customer and technician", ["", Y, Y]],
  ["Customers", null],
  ["Automatic reminders (invoices, quotes, services)", ["", Y, Y]],
  ["Customers pay online by card or EFT (PayFast)", ["", Y, Y]],
  ["WhatsApp and SMS to customers", ["", Y, Y]],
  ["Accounting", null],
  ["Xero sync", ["", "", Y]],
];

export const meta = {
  path: "/pricing/",
  title: "Pricing",
  description: `${P} pricing: Starter ${rand(config.plans[0].price)}, Pro ${rand(config.plans[1].price)} and Enterprise ${rand(config.plans[2].price)} a month. Every plan starts with a free ${config.trialDays}-day trial. No contract.`,
};

export function body() {
  return `
<section class="hero">
  <div class="wrap center">
    <span class="eyebrow">Pricing</span>
    <h1>One price per company, not per person</h1>
    <p class="lede" style="margin:0 auto">Start with a free ${config.trialDays}-day trial of everything. No card needed, no contract, cancel any month.</p>
  </div>
</section>
<section style="padding-top:24px">
  <div class="wrap">
    <div class="plans">
      ${config.plans.map(p => `
      <div class="plan${p.popular ? " popular" : ""}">
        <h2 style="font-size:1.4rem">${esc(p.name)}</h2>
        <p class="price">${rand(p.price)} <small>/ month</small></p>
        <p class="users">${esc(p.users)}</p>
        <p class="muted">${esc(p.blurb)}</p>
        <ul class="ticks">${p.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul>
        <a class="btn ${p.popular ? "btn-primary" : "btn-ghost"}" href="${esc(signupUrl())}">Start free trial</a>
      </div>`).join("")}
    </div>
    <p class="fineprint center" style="margin-top:18px">Paid monthly by card or debit order through PayFast. Need more users on a smaller plan? Ask us.</p>
  </div>
</section>
<section class="section-alt">
  <div class="wrap">
    <div class="section-head"><h2>Compare the plans</h2></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th scope="col">Feature</th>${config.plans.map(p => `<th scope="col">${esc(p.name)}</th>`).join("")}</tr></thead>
        <tbody>
          <tr><th scope="row">Price per month</th>${config.plans.map(p => `<td><strong>${rand(p.price)}</strong></td>`).join("")}</tr>
          <tr><th scope="row">Users</th>${config.plans.map(p => `<td>${esc(p.users.replace(/^Up to /, ""))}</td>`).join("")}</tr>
          ${ROWS.map(([label, cells]) => (cells ? `<tr><td>${esc(label)}</td>${cells.map(c => `<td>${c ? `<span aria-label="Included">${c}</span>` : '<span class="muted" aria-label="Not included">–</span>'}</td>`).join("")}</tr>` : `<tr><th colspan="4" scope="rowgroup">${esc(label)}</th></tr>`)).join("")}
        </tbody>
      </table>
    </div>
  </div>
</section>
<section>
  <div class="wrap faq">
    <h2 class="center">Billing questions</h2>
    <details><summary>What happens when the trial ends?</summary><p>Choose a plan in the app under Settings → Plan &amp; billing. If you don't, the account becomes read-only: you can still see and export everything, but not add or change. Nothing is deleted.</p></details>
    <details><summary>Can I change plans later?</summary><p>Yes, any month. Moving to a smaller plan never deletes anything: features outside the plan become read-only.</p></details>
    <details><summary>How do I cancel?</summary><p>Tap Cancel monthly payments in Plan &amp; billing. Your plan runs until the end of the month you've paid for.</p></details>
    <details><summary>Who can see my company's data?</summary><p>Only your own team. Each company's records are kept apart by the database, and we test this automatically. You can download all of your data at any time.</p></details>
  </div>
</section>
<section>
  <div class="wrap"><div class="cta">
    <h2>Try it with your own team</h2>
    <p>${config.trialDays} days of everything, free.</p>
    <div class="btn-row"><a class="btn btn-primary" href="${esc(signupUrl())}">Start free trial</a>${contactButtons("btn btn-ghost")}</div>
  </div></div>
</section>
`;
}

export function jsonld() {
  return [{
    "@context": "https://schema.org",
    "@type": "Product",
    name: P,
    description: meta.description,
    offers: config.plans.map(p => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "ZAR", url: config.siteUrl + "/pricing/" })),
  }];
}
