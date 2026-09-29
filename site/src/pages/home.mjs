import { config } from "../../config.mjs";
import { contactButtons, esc, rand, shot, signupUrl } from "../layout.mjs";

const P = config.product;

const FEATURES = [
  {
    id: "quotes",
    img: ["quotes", "The Quotes screen with accepted and pending quotes and their values"],
    title: "Quotes your customers accept online",
    text: "Send a professional quote with your logo, bank details and terms in minutes, from site or the office.",
    ticks: ["Customers accept and sign on their phone, from a link", "Accepted quotes lock and become jobs automatically", "Change your mind? Revise makes version R1 and keeps the history", "Unanswered quotes get automatic reminders after 3, 7 and 14 days"],
  },
  {
    id: "jobs",
    img: ["jobs", "The Jobs screen with job cards, route, forms and invoice buttons"],
    title: "Job cards on the phone, not on paper",
    text: "Technicians see their jobs, clock in, add notes, parts and photos, and get the customer's signature on site.",
    ticks: ["One tap for directions to site", "Safety checklists and sign-offs filled in on the spot", "Parts used come off stock", "Turn the job card into an invoice with one tap"],
  },
  {
    id: "schedule",
    img: ["schedule", "The Schedule screen showing today's jobs per technician"],
    title: "Schedule and dispatch",
    text: "See every technician's day at a glance, book jobs and let the customer know you're on your way.",
    ticks: ["Day and week view per technician", "Unassigned and overdue jobs stand out", "“On my way” WhatsApp with the time you'll arrive", "Service plans book repeat work by themselves"],
    flip: true,
  },
  {
    id: "invoices",
    img: ["invoices", "The Invoices screen with outstanding amounts and a Record payment button"],
    title: "Invoices that get paid",
    text: "Accounting-standard invoicing: approved invoices lock, mistakes are fixed with a credit note, and balances are always right.",
    ticks: ["Customers pay by card or EFT from the invoice link (PayFast)", "Automatic reminders at 1, 7, 14 and 30 days overdue", "Aged debtors report with CSV export", "Export for Sage, Xero or QuickBooks, or sync to Xero"],
  },
  {
    id: "expenses",
    img: ["expenses", "The Expenses screen with the receipt inbox and the Scan button"],
    title: "Receipts done for you",
    text: "Snap a till slip and the AI reads the supplier, VAT, total and date. Forward bills by email, or let the mail agent find them in your inbox.",
    ticks: ["Receipts, bills and quote requests pulled in from email", "Reads PDFs, photos, Word and Excel attachments", "Nothing is filed without your say-so, unless you allow it", "Month-end expense pack as a PDF for finance"],
    flip: true,
  },
  {
    id: "profit",
    img: ["job-profit", "The Job profit screen showing revenue, costs, profit and margin"],
    title: "Know which jobs make money",
    text: "Labour from timesheets, parts from stock and purchase orders, and expenses, set against what you invoiced.",
    ticks: ["Profit and margin per job, customer and technician", "Spot jobs that weren't invoiced or lost money", "Timesheets with work, travel and billable hours", "Purchase orders sent to suppliers and received into stock"],
  },
  {
    id: "equipment",
    img: ["equipment", "The Equipment screen listing machines with service due dates"],
    title: "Every machine on record",
    text: "Keep each customer's machines with serial numbers, photos, service history and the next service date.",
    ticks: ["Print QR labels: scan one to see the machine's history", "Report a breakdown from the machine itself", "Overdue services flagged and reminded", "Inspections and forms saved against the machine"],
    flip: true,
  },
];

const FAQ = [
  ["Does it work without signal?", `Yes. ${P} keeps working underground, on remote sites and in dead zones. Everything you do is saved on the phone and sent as soon as there's signal again. Approving and voiding invoices wait for a connection, so the books stay right.`],
  ["Do I need to install anything?", `No. ${P} runs in the browser on any phone, tablet or computer. On a phone, add it to your home screen and it opens like an app.`],
  ["Can my technicians see each other's customers?", "Only if you allow it. Members see their own customers and jobs. Admins and the master account see the whole company. A member can ask for whole-team view, and the master account decides."],
  ["Is my data safe and POPIA compliant?", "Each company's data is kept apart by the database itself, not just the app, and this is tested automatically. Owners and admins can require two-step login. You can download all your data at any time."],
  ["Does it work with my accounting package?", "Invoices and expenses export to CSV files for Sage, Xero and QuickBooks. The Enterprise plan also syncs invoices, payments and credit notes to Xero automatically."],
  ["What happens after the free trial?", `You get ${config.trialDays} days of everything, with no card needed. Then choose a plan. If you don't, your account becomes read-only: nothing is deleted, and you can still export your data.`],
  ["Can I cancel?", "Yes. Plans are month to month. Cancel the monthly payment in the app and your plan runs until the end of the month you paid for."],
];

export const meta = {
  path: "/",
  title: `${P}: job cards, quotes and invoices for field service teams`,
  description: `${P} is the phone app for industrial service teams in South Africa: quotes customers accept online, job cards with photos and signatures, invoices paid by card or EFT, and it works offline. Try it free for ${config.trialDays} days.`,
};

export function body() {
  const from = Math.min(...config.plans.map(p => p.price));
  return `
<section class="hero">
  <div class="wrap hero-grid">
    <div>
      <span class="eyebrow">Built in South Africa for service teams</span>
      <h1>Quotes, jobs and invoices in your pocket. Even underground.</h1>
      <p class="lede">${esc(P)} runs your whole service business from one phone app: customers, quotes, job cards, schedule, stock, invoices and expenses. It keeps working where there's no signal.</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="${esc(signupUrl())}">Start your free ${config.trialDays}-day trial</a>
        <a class="btn btn-ghost" href="/manual/">See how it works</a>
      </div>
      <p class="fineprint">No card needed. Plans from ${rand(from)} a month.</p>
    </div>
    <div class="hero-phones">
      ${shot("home", `The ${P} dashboard with today's schedule and won revenue`, { eager: true })}
      ${shot("jobs", "A technician's job list with Clock in and Fill in a form buttons", { eager: true })}
    </div>
  </div>
</section>

<section class="section-tight">
  <div class="wrap proof">
    <div><strong>Works offline</strong><span>Underground, on site, in dead zones. Syncs itself later.</span></div>
    <div><strong>Accounting-standard</strong><span>Locked invoices, credit notes and aged debtors, like Sage and Xero.</span></div>
    <div><strong>Paid faster</strong><span>Customers pay by card or EFT from the invoice link.</span></div>
    <div><strong>Your data kept apart</strong><span>Every company's records separated by the database. POPIA-ready.</span></div>
  </div>
</section>

<section id="features">
  <div class="wrap">
    <div class="section-head">
      <h2>Everything a service business runs on</h2>
      <p>From the first phone call to the paid invoice, without paper, spreadsheets or typing things up twice.</p>
    </div>
    ${FEATURES.map(f => `
    <article class="feature${f.flip ? " flip" : ""}" id="${f.id}">
      <div>
        <h3>${esc(f.title)}</h3>
        <p class="muted">${esc(f.text)}</p>
        <ul class="ticks">${f.ticks.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
      ${shot(f.img[0], f.img[1])}
    </article>`).join("")}
  </div>
</section>

<section class="dark" id="offline">
  <div class="wrap feature">
    <div>
      <h2>Made for places without signal</h2>
      <p>Mines, plants, basements and farms: most field apps stop working when the signal drops. ${esc(P)} doesn't.</p>
      <ul class="ticks">
        <li>Open any screen, customer or job without a connection</li>
        <li>Fill in job cards, forms and signatures offline</li>
        <li>Take photos and scan receipts offline</li>
        <li>Everything syncs by itself when you're back in signal</li>
      </ul>
    </div>
    ${shot("job-form", "A job completion sign-off form being filled in on site")}
  </div>
</section>

<section class="section-alt">
  <div class="wrap">
    <div class="section-head">
      <h2>More in the box</h2>
      <p>The tools your office and your technicians use every day.</p>
    </div>
    <div class="grid-cards">
      <div class="card"><h3>Customer 360</h3><p>Every customer's quotes, jobs, invoices, machines, contacts and notes on one screen.</p></div>
      <div class="card"><h3>WhatsApp and SMS</h3><p>“Booking confirmed”, “On my way” and “Job done” messages in one tap, with the invoice link.</p></div>
      <div class="card"><h3>Products and stock</h3><p>Part numbers, cost and sell prices, reorder levels and stock that updates as parts are used.</p></div>
      <div class="card"><h3>Service plans</h3><p>Quarterly or annual contracts that create the job, assign it and remind you.</p></div>
      <div class="card"><h3>Forms and checklists</h3><p>Build your own inspections and sign-offs. Filled in on site, saved as a PDF.</p></div>
      <div class="card"><h3>Customer portal</h3><p>Customers see their quotes, invoices and machines, and pay online, from one link.</p></div>
      <div class="card"><h3>Team roles</h3><p>Master account, admins and members, each seeing what they should. Two-step login for managers.</p></div>
      <div class="card"><h3>Your branding</h3><p>Your logo, colours, bank details and terms on every quote, invoice and job card.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="section-head">
      <h2>Up and running in an afternoon</h2>
    </div>
    <div class="steps">
      <div class="card"><h3>Set up your company</h3><p>Add your logo, VAT number, bank details and terms. Quotes and invoices use them straight away.</p></div>
      <div class="card"><h3>Invite your team</h3><p>Share one link. Technicians join your company from their own phones.</p></div>
      <div class="card"><h3>Send your first quote</h3><p>Add a customer, quote, and when they accept it becomes a job for your team.</p></div>
    </div>
    <p class="center" style="margin-top:28px"><a href="/manual/getting-started/">Read the getting-started guide →</a></p>
  </div>
</section>

<section class="section-alt" id="pricing">
  <div class="wrap">
    <div class="section-head">
      <h2>Simple monthly pricing</h2>
      <p>Every plan starts with a free ${config.trialDays}-day trial of everything. No contract.</p>
    </div>
    <div class="plans">
      ${config.plans.map(p => `
      <div class="plan${p.popular ? " popular" : ""}">
        <h3>${esc(p.name)}</h3>
        <p class="price">${rand(p.price)} <small>/ month</small></p>
        <p class="users">${esc(p.users)}</p>
        <p class="muted">${esc(p.blurb)}</p>
        <a class="btn ${p.popular ? "btn-primary" : "btn-ghost"}" href="${esc(signupUrl())}">Start free trial</a>
      </div>`).join("")}
    </div>
    <p class="center" style="margin-top:24px"><a href="/pricing/">Compare what each plan includes →</a></p>
  </div>
</section>

<section id="faq">
  <div class="wrap">
    <div class="section-head"><h2>Questions</h2></div>
    <div class="faq">
      ${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="cta">
      <h2>Get off paper this week</h2>
      <p>Try ${esc(P)} free for ${config.trialDays} days with your own customers and team.</p>
      <div class="btn-row">
        <a class="btn btn-primary" href="${esc(signupUrl())}">Start free trial</a>
        ${contactButtons("btn btn-ghost")}
      </div>
    </div>
  </div>
</section>
`;
}

export function jsonld() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: P,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web browser: iPhone, Android, Windows, Mac",
      description: meta.description,
      url: config.siteUrl + "/",
      offers: config.plans.map(p => ({ "@type": "Offer", name: p.name, price: String(p.price), priceCurrency: "ZAR" })),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}
