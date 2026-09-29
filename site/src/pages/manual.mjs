// The user manual: one page per chapter, with a contents list and
// previous/next links. Screenshots show the fictional demo company.
import { config } from "../../config.mjs";
import { esc, shot, signupUrl } from "../layout.mjs";

const P = config.product;
const ui = s => `<span class="ui">${s}</span>`;
const tip = (t, s) => `<div class="tip"><strong>${t}</strong>${s}</div>`;
const note = (t, s) => `<div class="note"><strong>${t}</strong>${s}</div>`;
const warn = (t, s) => `<div class="warn"><strong>${t}</strong>${s}</div>`;
const who = s => `<span class="who">${s}</span>`;
const onpage = items => `<nav class="onpage" aria-label="On this page"><strong>On this page</strong><ul>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join("")}</ul></nav>`;
const split = (html, img) => `<div class="split"><div>${html}</div>${img}</div>`;

export const CHAPTERS = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: `Sign up, set up your company, invite your team and put ${P} on your phone's home screen.`,
    body: () => `
${onpage([["sign-up", "Create your account"], ["setup", "Set up your company"], ["invite", "Invite your team"], ["home-screen", "Put it on your home screen"], ["find-your-way", "Find your way around"], ["pin", "PIN lock and notifications"]])}
<h2 id="sign-up">Create your account</h2>
<ol class="do">
  <li>Open <a href="${esc(signupUrl())}">${esc(config.appUrl.replace(/^https:\/\//, ""))}</a> on your phone or computer and tap ${ui("Sign Up")}.</li>
  <li>Enter your name, email and a password of at least 8 characters.</li>
  <li>If your company sent you an invite link or code, it's filled in for you. Otherwise leave it empty.</li>
  <li>Tick that you accept the terms and privacy policy, then tap ${ui("Create account")}.</li>
  <li>Open the email we send you and tap the link to confirm your address.</li>
</ol>
${note("Joining an existing company?", "Use the invite link your company sent you. You'll join their company straight away and skip the setup below.")}

<h2 id="setup">Set up your company</h2>
<p>The first person from a company sets it up and becomes its <strong>master account</strong>. The setup wizard asks for:</p>
<ul>
  <li><strong>Company</strong>: trading and registered name, registration number, VAT number, address, phone, email and website.</li>
  <li><strong>Logo and brand colour</strong>: printed on your quotes, invoices and job cards.</li>
  <li><strong>Banking details</strong>: shown on invoices so customers can pay by EFT.</li>
  <li><strong>Documents</strong>: how long quotes are valid, your payment terms, your invoice prefix and next number, and your quote and invoice terms.</li>
</ul>
<p>You can skip any step and fill it in later under ${ui("Settings")} → ${ui("Company Details")}. Your free ${config.trialDays}-day trial starts when you finish.</p>

<h2 id="invite">Invite your team</h2>
<ol class="do">
  <li>At the end of the setup, or later under ${ui("Settings")} → ${ui("Team")}, tap ${ui("Share invite link")}.</li>
  <li>Send it by WhatsApp or email. Each person signs up with it on their own phone and joins your company.</li>
  <li>Everyone who joins is a <strong>member</strong>. You can make trusted office staff <strong>admins</strong>. See <a href="/manual/team-and-settings/">Team and settings</a>.</li>
</ol>

<h2 id="home-screen">Put it on your home screen</h2>
<p>${esc(P)} runs in your phone's browser. Add it to your home screen so it opens like an app, full screen and without the address bar.</p>
<div class="table-wrap"><table>
  <thead><tr><th>Phone</th><th>How</th></tr></thead>
  <tbody>
    <tr><td>iPhone</td><td>Open it in <strong>Safari</strong>, tap the Share button, then ${ui("Add to Home Screen")}.</td></tr>
    <tr><td>Android</td><td>Open it in <strong>Chrome</strong>, tap the ⋮ menu, then ${ui("Install app")} or ${ui("Add to Home screen")}.</td></tr>
  </tbody>
</table></div>

<h2 id="find-your-way">Find your way around</h2>
${split(`<ul>
  <li><strong>Dashboard</strong>: today's schedule, what needs attention, your pipeline and this month's numbers.</li>
  <li><strong>☰ menu</strong> (top left): every screen, grouped into sales, field work, money and team.</li>
  <li><strong>+ button</strong> (bottom right): Quick Add for a client, contact, quote, note, follow-up, expense or machine from anywhere.</li>
  <li><strong>Search</strong> (top right): find any customer, quote, job or invoice.</li>
  <li><strong>Bell</strong>: notifications, such as a quote accepted online or a payment received.</li>
</ul>
<p>Screens your company doesn't use can be switched off under ${ui("Company Details")} → ${ui("Modules")}, so the menu stays short.</p>`, shot("home", "The dashboard with today's schedule and action items"))}

<h2 id="pin">PIN lock and notifications</h2>
<ul>
  <li><strong>PIN lock</strong>: set a 6-digit PIN under ${ui("Settings")} → ${ui("Security")}. The app locks itself after 15 minutes in the background. If you don't use it, at least use your phone's own screen lock.</li>
  <li><strong>Notifications</strong>: turn them on under ${ui("Settings")} → ${ui("Notifications")}. On iPhone, Apple only allows this after you've added the app to your home screen and opened it from there.</li>
</ul>`,
  },
  {
    slug: "customers",
    title: "Customers, contacts and follow-ups",
    description: "Add customers and leads, see everything about a customer in Client 360, and keep track of follow-ups and notes.",
    body: () => `
${onpage([["add", "Add a customer or lead"], ["groups", "Groups and search"], ["client-360", "Client 360"], ["followups", "Follow-ups"], ["notes", "Field notes"], ["share", "Share with a teammate"]])}
<h2 id="add">Add a customer or lead</h2>
${split(`<ol class="do">
  <li>Open ${ui("Clients")} from the menu and tap ${ui("Add Lead")}.</li>
  <li>Fill in the company name, branch or site, contact person, phone and email.</li>
  <li>Choose the pipeline stage. New customers start as "New Lead" and move forward as you work the deal.</li>
  <li>Under <strong>Invoicing details</strong>, add the customer's VAT number and billing address. They're printed on invoices.</li>
  <li>Tap save.</li>
</ol>
${tip("Tip", "Each customer card has buttons to call, WhatsApp or email them in one tap.")}`, shot("clients", "The Clients & Leads screen grouped by region"))}

<h2 id="groups">Groups and search</h2>
<p>Put customers into groups, for example by region or by expo where you met them, with ${ui("Group")}. Tap a group to open or close it. Use the search box, or ${ui("Filters")}, to find customers by name, stage or category.</p>

<h2 id="client-360">Client 360</h2>
${split(`<p>Tap ${ui("View full details →")} on a customer to see everything about them on one screen: contacts, the timeline of calls, notes and follow-ups, quotes, jobs, invoices and machines. From the top you can log a call, phone, WhatsApp, email, share the customer, or send them their <strong>portal</strong> link.</p>
<p>The <strong>customer portal</strong> is a private link where the customer sees their quotes, invoices, jobs, service plans and machines, and can pay online.</p>`, shot("client-360", "Client 360 with the customer's timeline"))}

<h2 id="followups">Follow-ups</h2>
<ol class="do">
  <li>Open ${ui("Follow-ups")}, or add one from a customer.</li>
  <li>Enter what to follow up on, the customer, a date and time. Tick ${ui("🔔 Reminder")} to get a notification.</li>
  <li>When it's done, tick it off. ${esc(P)} asks whether to schedule the next action, so nothing falls through the cracks.</li>
</ol>
<p>Today's follow-ups show on the dashboard. Overdue ones are marked in red.</p>

<h2 id="notes">Field notes</h2>
<p>Use ${ui("Field Notes")} for anything you see on site: a leak, a worn part, a request. Add photos or dictate with your voice, set how urgent it is and a resolve-by date. A note can become a follow-up with one tap.</p>

<h2 id="share">Share with a teammate</h2>
<p>Members see their own customers. To hand a customer, quote or follow-up to a colleague, use the share button on it and choose the person. It appears under ${ui("Shared with me")} on their phone.</p>`,
  },
  {
    slug: "quotes",
    title: "Quotes",
    description: "Create quotes and pro forma invoices with your logo, send them to be accepted online, and revise accepted quotes.",
    body: () => `
${onpage([["create", "Create a quote"], ["pdf", "Make the PDF"], ["accept", "Let the customer accept online"], ["statuses", "Statuses and locking"], ["revise", "Revise a quote"], ["reminders", "Reminders and expiry"]])}
<h2 id="create">Create a quote</h2>
${split(`<ol class="do">
  <li>Open ${ui("Quotes")} and tap ${ui("Add")}, or use the + button.</li>
  <li>Choose the client, describe what the quote covers, and set the value and how many days it's valid for.</li>
  <li>Save. The quote gets the next number for your company, for example Q-105. Numbers are given out by the server, so two people can never get the same number.</li>
</ol>`, shot("quotes", "The Quotes screen with accepted and pending quotes"))}

<h2 id="pdf">Make the PDF</h2>
<ol class="do">
  <li>Tap the download button (${ui("Make a PDF")}) on the quote.</li>
  <li>Choose <strong>Quotation</strong> or <strong>Pro forma invoice</strong>.</li>
  <li>Add line items with quantity and price. Pick them from your product catalogue or type your own, and choose whether the prices include VAT.</li>
  <li>For bigger jobs, open <strong>Detailed quote</strong> to add a cover page, an introduction, sections with headings, photos and exclusions (for example, "Scaffolding and crane hire are not included").</li>
  <li>Save or share the PDF by WhatsApp or email.</li>
</ol>
<p>Your logo, company details, bank details and quote terms come from ${ui("Company Details")}.</p>

<h2 id="accept">Let the customer accept online</h2>
<p>Tap ${ui("Send link to accept online")}. The customer opens the link on their phone, reads the quote and accepts with their name and signature, or declines it. You get a notification either way, and the quote shows "Accepted online by …".</p>
${tip("Accepted quotes become jobs", "When a quote is accepted, a job is created for it automatically. See <a href=\"/manual/jobs/\">Jobs</a>.")}

<h2 id="statuses">Statuses and locking</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Status</th><th>What it means</th></tr></thead>
  <tbody>
    <tr><td>Pending</td><td>Sent, waiting for the customer. You can still edit it.</td></tr>
    <tr><td>Accepted</td><td>The customer said yes. The quote is <strong>locked</strong> so the agreed price can't change by accident.</td></tr>
    <tr><td>Rejected</td><td>The customer said no, online or by telling you.</td></tr>
    <tr><td>Expired</td><td>Its valid-for days ran out with no answer. This happens automatically every night.</td></tr>
    <tr><td>Superseded</td><td>A newer version replaced it.</td></tr>
  </tbody>
</table></div>
<p>Quotes that have been invoiced are marked <strong>Invoiced</strong> and locked too.</p>

<h2 id="revise">Revise a quote</h2>
<p>To change a locked quote, tap ${ui("Revise")}. ${esc(P)} makes a new version (for example Q-105-R1), marks the old one as superseded, and moves the job over to the new version. The history is kept.</p>

<h2 id="reminders">Reminders and expiry</h2>
<p>With automatic reminders switched on (Pro and Enterprise), customers who haven't answered get a friendly reminder 3, 7 and 14 days after the quote was sent. Switch them on under ${ui("Company Details")} → ${ui("Reminders")}.</p>`,
  },
  {
    slug: "jobs",
    title: "Jobs and job cards",
    description: "Work a job from the phone: clock in, travel, notes, parts, photos, forms and signatures, then invoice it.",
    body: () => `
${onpage([["where", "Where jobs come from"], ["work", "Work a job on site"], ["message", "Message the customer"], ["forms", "Forms and sign-offs"], ["job-card", "Job card PDF"], ["invoice", "Invoice the job"]])}
<h2 id="where">Where jobs come from</h2>
<p>Accepted quotes become jobs automatically. Service plans create jobs before each service is due. Managers can also book jobs on the <a href="/manual/schedule/">Schedule</a>. Every job gets a number, for example JOB-2026-0045.</p>

<h2 id="work">Work a job on site</h2>
${split(`<ol class="do">
  <li>Open ${ui("Jobs")}. Technicians see the jobs assigned to them.</li>
  <li>Tap ${ui("Open route")} for directions to site.</li>
  <li>Tap ${ui("Travel")} when you leave and ${ui("Clock in")} when you start. Your time goes onto your timesheet and into the job's cost.</li>
  <li>Tap ${ui("Start job")}. Add your findings, the work done, the parts used and photos.</li>
  <li>Tap ${ui("Save field report")}. If there's no signal it's saved on the phone and sent later.</li>
</ol>
${tip("Parts and stock", "Parts picked from the catalogue come off stock and count in the job's profit.")}`, shot("jobs", "The Jobs screen with job actions"))}

<h2 id="message">Message the customer</h2>
${split(`<p>Tap ${ui("Message customer")} and choose <strong>Booking confirmed</strong>, <strong>On my way</strong> or <strong>Job done</strong>. The message is written for you with your company name. Change it if you like, then send it by ${ui("WhatsApp")} or ${ui("SMS")}.</p>
<p>The wording of these messages is set under ${ui("Company Details")} → ${ui("Customer messages")}.</p>`, shot("job-message", "The Message customer sheet with WhatsApp and SMS buttons"))}

<h2 id="forms">Forms and sign-offs</h2>
${split(`<p>Tap ${ui("Fill in a form")} to complete a checklist, inspection or job sign-off on site: yes/no checks, answers and the customer's signature. Forms are saved as PDFs against the job. Your master account or admin sets up the forms. See <a href="/manual/equipment-and-forms/#forms">Forms and checklists</a>.</p>`, shot("job-form", "A job completion sign-off form"))}

<h2 id="job-card">Job card PDF</h2>
<p>Tap ${ui("Job card PDF")} for a signed job card with your logo, the work done, parts, time on site and photos. You can attach it to the invoice.</p>

<h2 id="invoice">Invoice the job</h2>
<p>Tap ${ui("Create invoice")}. The invoice is filled in from the quote and the job. It starts as a draft that you can check before approving. See <a href="/manual/invoices/">Invoices and payments</a>.</p>`,
  },
  {
    slug: "schedule",
    title: "Schedule and dispatch",
    description: "Book jobs, assign technicians, and tell customers you're on your way.",
    body: () => `
${who("Master account and admins")}
${onpage([["view", "Day and week view"], ["book", "Book a job"], ["on-my-way", "On my way"]])}
<h2 id="view">Day and week view</h2>
${split(`<p>Open ${ui("Schedule")} to see each technician's jobs for the day, or switch to ${ui("Week")}. Use the arrows to move between days, and tap the date to jump back to today.</p>
<ul>
  <li><strong>Not assigned</strong>: jobs that still need a technician.</li>
  <li><strong>Past their date</strong>: jobs that should have happened already.</li>
  <li><strong>Waiting for a date</strong>: open jobs with no booking yet.</li>
</ul>`, shot("schedule", "The Schedule screen with jobs per technician"))}

<h2 id="book">Book a job</h2>
<ol class="do">
  <li>Tap a job.</li>
  <li>Choose the date, time and technician.</li>
  <li>Tap ${ui("Save booking")}. The technician sees it on their Jobs screen.</li>
</ol>
<p>To remove a booking, tap ${ui("Take off the schedule")}.</p>

<h2 id="on-my-way">On my way</h2>
<p>Tap ${ui("On my way")}, enter the minutes until you arrive, and send it by WhatsApp. The customer needs a phone number on their record. ${ui("Directions")} and ${ui("Call")} are on the same card.</p>`,
  },
  {
    slug: "invoices",
    title: "Invoices and payments",
    description: "Create, approve and send invoices, record payments, issue credit notes, and export to your accounting package.",
    body: () => `
${onpage([["create", "Create an invoice"], ["approve", "Approve: the invoice becomes final"], ["send", "Send it to the customer"], ["payments", "Record a payment"], ["fix", "Fix a mistake: credit note or void"], ["online", "Customers pay online"], ["debtors", "Aged debtors and reminders"], ["export", "Export for accounting"]])}
<h2 id="create">Create an invoice</h2>
${split(`<ol class="do">
  <li>From a job tap ${ui("Create invoice")}, or open ${ui("Invoices")} and tap ${ui("New")}.</li>
  <li>Choose the customer. The invoice date is today, and the due date follows your payment terms.</li>
  <li>Add lines with quantity, price, discount and VAT type per line: standard, zero-rated or exempt.</li>
  <li>Add the customer's order number if they need it on the invoice.</li>
</ol>
<p>A new invoice is a <strong>draft</strong>. Drafts can be changed or deleted, and print with a DRAFT watermark.</p>`, shot("invoices", "The Invoices screen with outstanding amounts"))}

<h2 id="approve">Approve: the invoice becomes final</h2>
<p>Tap ${ui("Approve")} when it's right. The invoice is <strong>locked</strong>, like in Sage or Xero: it can't be edited or deleted any more. This keeps your books and VAT returns correct.</p>
${warn("Approving needs a connection", "You can create drafts and record payments offline. Approving, crediting and voiding wait until you're back in signal.")}

<h2 id="send">Send it to the customer</h2>
<ul>
  <li>${ui("WhatsApp / SMS the invoice link")}: the customer opens the invoice on their phone and can pay online.</li>
  <li>Share the PDF. Tick ${ui("Attach job card")} to add the signed job card.</li>
</ul>

<h2 id="payments">Record a payment</h2>
<ol class="do">
  <li>Tap ${ui("Record payment")} on the invoice.</li>
  <li>Enter the amount, the date received and how it was paid.</li>
  <li>Save. The balance and status update by themselves: part-paid or paid. You can't record more than is owed.</li>
</ol>
<p>A payment can't be deleted. If it was wrong, tap ${ui("Reverse")} next to it. The reversal stays on record.</p>

<h2 id="fix">Fix a mistake: credit note or void</h2>
${who("Master account and admins")}
<ul>
  <li><strong>Credit note</strong>: for a refund, a discount after the fact, or a wrong amount. Tap ${ui("Credit note")}, choose the amount and reason. Credit notes are numbered CN-00001 and onwards, and reduce what the customer owes.</li>
  <li><strong>Void</strong>: for an invoice that should never have been issued. It stays on record, marked VOID.</li>
</ul>

<h2 id="online">Customers pay online</h2>
<p>With online payments set up (Pro and Enterprise), invoices get a <strong>Pay now</strong> button. Customers pay by card or instant EFT through PayFast into your own PayFast account, and the invoice is marked paid automatically. The master account sets this up under ${ui("Company Details")} with your PayFast merchant ID and key.</p>

<h2 id="debtors">Aged debtors and reminders</h2>
<p>${ui("Aged debtors")} on the Invoices screen shows what each customer owes: current, 1–30, 31–60, 61–90 and over 90 days, with a CSV download. With automatic reminders on, customers get a reminder 1, 7, 14 and 30 days after the due date.</p>

<h2 id="export">Export for accounting</h2>
<p>Tap ${ui("Export for accounting")}, choose the month and your package: Sage Business Cloud, Xero or QuickBooks Online. You get a CSV file for that package's invoice import, with approved invoices only. On Enterprise, invoices, payments, credit notes and voids can also sync to Xero automatically every night.</p>`,
  },
  {
    slug: "expenses",
    title: "Expenses, receipts and the email inbox",
    description: "Scan till slips, forward bills by email, let the mail agent find receipts in your inbox, and send your expense pack to finance.",
    body: () => `
${onpage([["scan", "Scan a till slip"], ["check", "Check the details"], ["no-slip", "No slip, or a payment slip"], ["inbox", "Receipts and bills by email"], ["agent", "The mail agent"], ["submit", "Send your expenses to finance"]])}
<h2 id="scan">Scan a till slip</h2>
${split(`<ol class="do">
  <li>Open ${ui("Expenses")} and tap ${ui("Scan")}. The camera opens.</li>
  <li>Take a photo of the slip, flat and in good light.</li>
  <li>The AI reads the supplier, VAT number, total, VAT and date and fills in the form. It takes a few seconds.</li>
</ol>
<p>No signal? The photo is kept and the expense can be saved. You can type the details in yourself.</p>`, shot("expenses", "The Expenses screen with the receipt inbox"))}

<h2 id="check">Check the details</h2>
<p>Always check what was read: supplier, amount, VAT, date and time. Then choose the category. The GL code for your accounting package fills in from the category and can be changed. Foreign currency receipts are converted to rand at that day's exchange rate.</p>

<h2 id="no-slip">No slip, or a payment slip</h2>
<ul>
  <li>Lost the slip? Tap ${ui("No slip")} and enter the details by hand. It's marked "No receipt".</li>
  <li>Paid by card? Add the card machine slip under <strong>Payment slip</strong>. ${esc(P)} warns you if its amount doesn't match the till slip.</li>
</ul>

<h2 id="inbox">Receipts and bills by email</h2>
<p>Your company gets its own private email address, shown at the top of the Inbox. Forward receipts and supplier invoices to it, or ask suppliers to send bills there. Each email appears under <strong>Inbox: receipts, bills &amp; email</strong>, already read by the AI. Check it and tap ${ui("Approve")} to make it an expense, or ${ui("Not needed")} to remove it.</p>
<p>Attachments it reads: PDF, photos (including iPhone HEIC), Word, Excel and CSV files.</p>

<h2 id="agent">The mail agent</h2>
<p>Instead of forwarding, you can connect your mailbox under ${ui("Connect a mailbox")}: Microsoft 365 or Outlook, Gmail, or iCloud and other mailboxes with an app password. Every 5 minutes the agent looks for business email and sorts it:</p>
<div class="table-wrap"><table>
  <thead><tr><th>It finds</th><th>It becomes</th></tr></thead>
  <tbody>
    <tr><td>Receipts and supplier bills</td><td>An expense, with the file attached</td></tr>
    <tr><td>Customers asking for a quote</td><td>A new lead</td></tr>
    <tr><td>Other mail from customers</td><td>A note on the customer's timeline</td></tr>
    <tr><td>Supplier quotes and delivery notes</td><td>A note on the purchase order</td></tr>
  </tbody>
</table></div>
<p>Personal mail and newsletters are skipped and never stored. The agent can only <strong>read</strong> mail: it can't send, move or delete anything. Everything waits for you to check it, unless the master account switches on ${ui("File sure items by itself")}. Then items the agent is sure about are filed and listed under "Filed by the agent this week".</p>

<h2 id="submit">Send your expenses to finance</h2>
<p>Near month-end ${esc(P)} reminds you to submit. Tap ${ui("PDF")} for your expense pack: a summary with every slip attached, ready for your finance team. Select expenses to mark them as submitted.</p>`,
  },
  {
    slug: "timesheets",
    title: "Timesheets",
    description: "Clock in and out per job, record travel, add time afterwards and export timesheets.",
    body: () => `
${onpage([["clock", "Clock in and out"], ["add", "Add or fix time"], ["team", "The whole team's time"]])}
<h2 id="clock">Clock in and out</h2>
${split(`<ol class="do">
  <li>Open ${ui("Timesheets")}, or clock in from a job.</li>
  <li>Tap ${ui("Clock in")} when you start work, or ${ui("Start travel")} when you drive to site.</li>
  <li>Tap ${ui("Clock out")} (or ${ui("Stop")} for travel) when you finish.</li>
</ol>
<p>The week shows your work, travel and billable hours, plus the billable value and labour cost from your company's rates.</p>`, shot("timesheets", "The Timesheets screen with a week of work"))}

<h2 id="add">Add or fix time</h2>
<p>Forgot to clock in? Tap ${ui("Add time")} and enter the date, start and end, the job, and whether it's billable to the customer. Tap any entry to change or delete it.</p>

<h2 id="team">The whole team's time</h2>
${who("Master account and admins")}
<p>Choose a person under <strong>Whose time</strong>, or ${ui("Everyone")}. Tap ${ui("Export CSV")} for payroll.</p>`,
  },
  {
    slug: "stock-and-purchasing",
    title: "Stock, purchasing and job profit",
    description: "Keep a product catalogue with stock levels, order from suppliers with purchase orders, and see what each job earned.",
    body: () => `
${onpage([["products", "Products and stock"], ["import", "Import a price list"], ["suppliers", "Suppliers and purchase orders"], ["receive", "Receive an order"], ["profit", "Job profit"]])}
<h2 id="products">Products and stock</h2>
${split(`<ol class="do">
  <li>Open ${ui("Products & stock")} and tap ${ui("Add")}.</li>
  <li>Enter the part number, name, unit (each, m, litre, hour), cost price and sell price excluding VAT.</li>
  <li>Add the supplier and their code if you order from them.</li>
  <li>Tick ${ui("Keep track of stock")} and set the reorder level. Items at or below it are flagged.</li>
</ol>
<p>Labour can be a product too (unit: hour), so it's quick to add to quotes.</p>`, shot("products", "The Products & stock screen with a reorder warning"))}

<h2 id="import">Import a price list</h2>
<p>Tap ${ui("Import")} and choose a CSV file, for example a supplier's price list. Items whose part number is already in the catalogue are updated, and new ones are added. ${ui("Export")} downloads the whole catalogue.</p>

<h2 id="suppliers">Suppliers and purchase orders</h2>
${who("Master account and admins")}
${split(`<ol class="do">
  <li>Open ${ui("Suppliers & orders")} and add your suppliers with the email address that orders go to.</li>
  <li>Tap ${ui("New purchase order")}, choose the supplier, and link it to a job if the parts are for one. It then counts in that job's profit.</li>
  <li>Add items from the catalogue or type them in.</li>
  <li>Tap ${ui("Save draft")}, or ${ui("Place order")} to send it. ${ui("PDF")} gives you the order to print or email.</li>
</ol>
<p>${ui("Running low")} lists items at their reorder level, so you can order them in one go.</p>`, shot("purchasing", "Suppliers & orders with purchase orders"))}

<h2 id="receive">Receive an order</h2>
<p>When the delivery arrives, tap ${ui("Receive")} and enter what came. Stock goes up by that amount. When you place an order, you can also update the catalogue's cost prices to the order's prices.</p>

<h2 id="profit">Job profit</h2>
${who("Master account and admins")}
${split(`<p>${ui("Job profit")} sets what each job earned against what it cost: labour from timesheets, parts, purchase orders and expenses. See revenue, costs, profit and margin for this month, last month or the last 90 days, by <strong>Jobs</strong>, <strong>Clients</strong> or <strong>Technicians</strong>.</p>
<p>Tick <strong>Only jobs that need a look</strong> to see jobs that lost money, weren't invoiced, or have no time recorded.</p>`, shot("job-profit", "Job profit with revenue, costs and margin"))}`,
  },
  {
    slug: "equipment-and-forms",
    title: "Equipment, forms and service plans",
    description: "Keep a register of customers' machines with QR labels, build your own checklists, and set up service contracts that book themselves.",
    body: () => `
${onpage([["equipment", "Equipment register"], ["qr", "QR labels"], ["forms", "Forms and checklists"], ["service-plans", "Service plans"]])}
<h2 id="equipment">Equipment register</h2>
${split(`<ol class="do">
  <li>Open ${ui("Equipment")} and tap ${ui("Add")}.</li>
  <li>Enter the machine's name, type, make, model and serial number, the customer and site, and the next service date. Add photos.</li>
</ol>
<p>Machines due for a service in 14 days, or overdue, are flagged at the top. From a machine you can fill in a form, report a breakdown, or see its history.</p>`, shot("equipment", "The Equipment screen with overdue services"))}

<h2 id="qr">QR labels</h2>
<p>Tap ${ui("QR labels")} to print a sticker for each machine. Scanning the sticker with a phone opens that machine in ${esc(P)}, with its history and a button to report a breakdown.</p>
${note("Before printing", "QR labels point at your app's web address. Print them only once that address is final.")}

<h2 id="forms">Forms and checklists</h2>
${who("Master account and admins make the forms")}
${split(`<ol class="do">
  <li>Open ${ui("Forms & checklists")} and tap ${ui("New form")}, or ${ui("Start from an example")}.</li>
  <li>Give it a name and choose where it's used: on jobs, on machines, or both.</li>
  <li>Add questions: Yes / No / N/A checks, short and long answers, numbers, dates and pick-one choices, with section headings. Mark the ones that must be answered.</li>
  <li>Tick ${ui("Needs a signature")} for sign-offs.</li>
</ol>
<p>Anyone can then tap ${ui("Fill in a form")} from a job, a machine, or this screen. Filled-in forms are saved as PDFs. Forms filled in without signal are sent later.</p>`, shot("forms", "The Forms & checklists screen"))}

<h2 id="service-plans">Service plans</h2>
${who("Master account and admins")}
<p>A service plan is a contract for regular work, for example a quarterly service on a loader.</p>
<ol class="do">
  <li>Open ${ui("Service plans")} and tap ${ui("New service plan")}.</li>
  <li>Choose the client and, optionally, the machine. Set how often, the next service date, and how many days before it the job should be made.</li>
  <li>Choose the technician, what to do, and the price per visit.</li>
</ol>
${split(`<p>${esc(P)} creates the job by itself before each service and books it for the technician. ${ui("Make the job now")} creates the next one straight away. The screen shows the planned work for the year.</p>`, shot("service-plans", "The Service plans screen"))}`,
  },
  {
    slug: "team-and-settings",
    title: "Team, roles and settings",
    description: "Who can see and do what, inviting and removing people, company details, modules, security, your plan and your data.",
    body: () => `
${onpage([["roles", "Roles"], ["people", "Invite, promote and remove people"], ["company", "Company Details"], ["security", "Security"], ["plan", "Plan and billing"], ["data", "Your company's data"], ["help", "Getting help"]])}
<h2 id="roles">Roles</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Role</th><th>Who</th><th>What they can do</th></tr></thead>
  <tbody>
    <tr><td><strong>Master account</strong></td><td>The person who set up the company</td><td>Everything, plus Company Details, connections (PayFast, Xero), modules, making admins, removing people, the plan, and downloading all data.</td></tr>
    <tr><td><strong>Admin</strong></td><td>Trusted office staff</td><td>Sees all the company's records. Manages products, service plans, the schedule, suppliers, job profit and everyone's timesheets.</td></tr>
    <tr><td><strong>Member</strong></td><td>Technicians and sales reps</td><td>Works on their own customers, quotes, jobs, notes and expenses, plus anything shared with them. Can ask for whole-team view.</td></tr>
  </tbody>
</table></div>
<p>Expenses always stay private to the person and to the managers who approve them.</p>

<h2 id="people">Invite, promote and remove people</h2>
${split(`<ul>
  <li><strong>Invite</strong>: ${ui("Settings")} → ${ui("Team")} → ${ui("Share")} the invite link.</li>
  <li><strong>Make an admin</strong>: the master account taps the crown next to the person.</li>
  <li><strong>Whole-team view</strong>: a member taps ${ui("Request access")}, and the master account approves it (the eye icon).</li>
  <li><strong>Someone leaves</strong>: tap ${ui("Remove")}. Choose who their customers, quotes, jobs and follow-ups go to, and tick ${ui("Block their login")}. They're signed out everywhere.</li>
</ul>`, shot("team", "The Team screen with members and the invite code"))}

<h2 id="company">Company Details</h2>
${who("Master account")}
<p>${ui("Settings")} → ${ui("Company Details")} holds what's printed on every quote, pro forma and invoice, and how the company works:</p>
<ul>
  <li><strong>Logo, company and banking details</strong>.</li>
  <li><strong>Documents</strong>: numbering, validity, payment terms, and your terms and conditions.</li>
  <li><strong>Expense account codes</strong> for your accounting package.</li>
  <li><strong>Reminders</strong>: automatic reminders for overdue invoices, unanswered quotes and services due.</li>
  <li><strong>Customer messages</strong>: the wording of WhatsApp and SMS messages.</li>
  <li><strong>Technician locations</strong>: whether managers can see where technicians are.</li>
  <li><strong>Modules</strong>: switch off screens you don't use.</li>
  <li><strong>Online payments</strong> (PayFast) and <strong>Xero</strong>.</li>
</ul>

<h2 id="security">Security</h2>
<ul>
  <li><strong>Two-step login</strong>: the master account can require it for managers under ${ui("Company Details")} → ${ui("Security")}. You then sign in with a code from an authenticator app as well as your password.</li>
  <li><strong>PIN lock</strong> on each phone. See <a href="/manual/getting-started/#pin">Getting started</a>.</li>
  <li>Each company's data is kept apart by the database itself.</li>
</ul>

<h2 id="plan">Plan and billing</h2>
${who("Master account")}
${split(`<p>${ui("Settings")} → ${ui("Plan & billing")} shows your plan, users and what's included. Tap ${ui("Choose")} to pay monthly by card or debit order through PayFast. ${ui("Cancel monthly payments")} stops the payments, and your plan runs until the end of the month you paid for.</p>
<p>If a trial or payment runs out, the account becomes read-only: you can still look and export, but not add or change. Nothing is deleted.</p>`, shot("plan", "Plan & billing with the three plans"))}

<h2 id="data">Your company's data</h2>
<p>Under ${ui("Company Details")} → ${ui("Your company's data")}, the master account can download everything the company has in ${esc(P)}, or ask for the company to be deleted.</p>

<h2 id="help">Getting help</h2>
<p>Open ${ui("Settings")} → ${ui("Help")} to send us a question or report a problem. We see which screen you were on and your app version, and our reply appears in the same place. For common problems, see <a href="/manual/faq/">Troubleshooting</a>.</p>`,
  },
  {
    slug: "offline",
    title: "Working offline",
    description: `How ${P} works underground and in dead zones, and what waits for signal.`,
    body: () => `
${onpage([["works", "What works without signal"], ["waits", "What waits for signal"], ["sync", "Syncing"], ["tips", "Tips"]])}
<p class="intro">${esc(P)} is built for mines, plants and remote sites. Once it's been opened on a phone with signal, it keeps working without it.</p>
<h2 id="works">What works without signal</h2>
<ul>
  <li>Opening every screen, customer, quote, job, invoice and machine.</li>
  <li>Adding and changing customers, notes, follow-ups, quotes and expenses.</li>
  <li>Job cards: clocking in, notes, parts, photos and signatures.</li>
  <li>Filling in forms and checklists.</li>
  <li>Recording payments and drafting invoices.</li>
  <li>Taking receipt photos. The AI reads them once you're back in signal, or you type the details in.</li>
</ul>

<h2 id="waits">What waits for signal</h2>
<ul>
  <li>Approving, crediting and voiding invoices, so the books stay right.</li>
  <li>Sending WhatsApp and SMS messages and emails.</li>
  <li>Customers accepting quotes and paying online, which happens on their side anyway.</li>
</ul>

<h2 id="sync">Syncing</h2>
<p>Everything you do offline is kept on the phone and sent by itself as soon as there's signal, even if you close the app. Records not sent yet show <strong>Not synced</strong>. ${ui("Settings")} → <strong>Sync Status</strong> shows what's waiting. "All data synced to cloud" means everything is safe.</p>
${warn("Don't clear your browser data while items are waiting", "Anything not synced yet is only on that phone. Get back into signal and let it sync first.")}

<h2 id="tips">Tips</h2>
<ul>
  <li>Open the app once with signal at the start of the day, so it has the latest jobs.</li>
  <li>Add it to your home screen. See <a href="/manual/getting-started/#home-screen">Getting started</a>.</li>
  <li>After an update, the app downloads every screen in the background, so all screens open offline.</li>
</ul>`,
  },
  {
    slug: "faq",
    title: "Troubleshooting and questions",
    description: "Fixes for common problems: signing in, the app not loading, the camera, syncing, and invoices you can't change.",
    body: () => `
<h2 id="cant-sign-up">I can't sign up</h2>
<p>If sign-up says your email isn't allowed, ask your company for its invite link. New companies can ask us for a sign-up code.</p>
<h2 id="password">I forgot my password</h2>
<p>On the sign-in screen, tap ${ui("Forgot password?")} and follow the link we email you. If your company added you, tap ${ui("Already added by your company? Email me a link to set my password")}.</p>
<h2 id="not-loading">The app doesn't load</h2>
<ol class="do">
  <li>Check your signal. The very first time, the app needs a connection to download.</li>
  <li>Close the app completely and open it again.</li>
  <li>Still stuck? Open the address in a private browser tab. If it loads there, your phone has an old copy saved. On iPhone, go to Settings → Apps → Safari → Advanced → Website Data, find the app's address and delete it, then open the app again. <strong>Only do this once everything has synced.</strong></li>
</ol>
<h2 id="camera">The camera doesn't open</h2>
<p>Make sure the browser may use the camera. On iPhone go to Settings → Apps → Safari → Camera, and choose Ask or Allow. On Android, tap the lock icon next to the address, then Permissions. You can always choose ${ui("Use a photo from my gallery instead")}.</p>
<h2 id="not-synced">Something shows "Not synced"</h2>
<p>It's saved on your phone and will send when you have signal. If items stay stuck while you have signal, look at ${ui("Settings")} → <strong>Sync Status</strong>, and send us a message through ${ui("Help")}.</p>
<h2 id="cant-edit-invoice">I can't change or delete an invoice</h2>
<p>Approved invoices are final, as in any accounting package. Use a <a href="/manual/invoices/#fix">credit note or void</a> instead. Drafts can still be changed or deleted.</p>
<h2 id="cant-edit-quote">I can't change a quote</h2>
<p>Accepted quotes are locked. Tap ${ui("Revise")} to make a new version. See <a href="/manual/quotes/#revise">Revise a quote</a>.</p>
<h2 id="locked-screen">A screen has a padlock</h2>
<p>It isn't in your company's plan. The master account can see the plans under ${ui("Settings")} → ${ui("Plan & billing")}.</p>
<h2 id="read-only">Everything is read-only</h2>
<p>The trial or the monthly payment has run out. The master account can choose a plan under ${ui("Plan & billing")}. Your data is all still there.</p>
<h2 id="cant-see">I can't see a colleague's customer</h2>
<p>Members see their own records. Ask the colleague to share it with you, or ask for whole-team view under ${ui("Team")}.</p>
<h2 id="notifications">I don't get notifications on iPhone</h2>
<p>Add the app to your home screen, open it from the icon, and turn on notifications under ${ui("Settings")} → ${ui("Notifications")}. Apple only allows web app notifications this way.</p>`,
  },
];

export const manualIndex = {
  path: "/manual/",
  title: "User manual",
  description: `How to use ${P}: getting started, customers, quotes, jobs, schedule, invoices, expenses, timesheets, stock, equipment, team settings and working offline.`,
  body: () => `
<section class="hero">
  <div class="wrap">
    <span class="eyebrow">User manual</span>
    <h1>How to use ${esc(P)}</h1>
    <p class="lede">Step-by-step guides for owners, office staff and technicians. New here? Start with <a href="/manual/getting-started/">Getting started</a>.</p>
  </div>
</section>
<section style="padding-top:16px">
  <div class="wrap grid-cards">
    ${CHAPTERS.map((c, i) => `<a class="card" href="/manual/${c.slug}/"><h2 style="font-size:1.15rem;margin-bottom:6px">${i + 1}. ${esc(c.title)}</h2><p>${esc(c.description)}</p></a>`).join("")}
  </div>
</section>`,
};

export function chapterPage(i) {
  const c = CHAPTERS[i];
  const prev = CHAPTERS[i - 1],
    next = CHAPTERS[i + 1];
  const toc = CHAPTERS.map((x, j) => `<li><a href="/manual/${x.slug}/"${j === i ? ' aria-current="page"' : ""}>${j + 1}. ${esc(x.title)}</a></li>`).join("");
  return {
    path: `/manual/${c.slug}/`,
    title: c.title,
    description: c.description,
    body: () => `
<div class="wrap manual">
  <aside class="toc"><details class="toc-narrow"><summary>All chapters</summary><ol>${toc}</ol></details><nav class="toc-wide" aria-label="Manual"><strong>Manual</strong><ol>${toc}</ol></nav></aside>
  <article class="doc">
    <p class="breadcrumb"><a href="/manual/">Manual</a> › ${esc(c.title)}</p>
    <h1>${esc(c.title)}</h1>
    <p class="intro">${esc(c.description)}</p>
    ${c.body()}
    <nav class="pager" aria-label="Chapters">
      ${prev ? `<a href="/manual/${prev.slug}/"><small>Previous</small>${esc(prev.title)}</a>` : ""}
      ${next ? `<a class="next" href="/manual/${next.slug}/"><small>Next</small>${esc(next.title)}</a>` : ""}
    </nav>
  </article>
</div>`,
    jsonld: [{
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: `${c.title}: ${P} manual`,
      description: c.description,
      url: `${config.siteUrl}/manual/${c.slug}/`,
      isPartOf: { "@type": "WebSite", name: P, url: config.siteUrl + "/" },
    }],
  };
}
