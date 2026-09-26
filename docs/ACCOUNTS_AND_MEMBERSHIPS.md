# How accounts, companies and memberships work

## The four kinds of account

| Account | Who | What they can do |
|---|---|---|
| **Platform owner** | You (cvanjaarsveld2@icloud.com), and anyone you add later | **Settings → Platform**. You see every company using the app: its people, how many clients, quotes and invoices it has, when it was last used, and its plan. You can change a company's plan, extend a trial, suspend or reactivate it, and answer support messages. You also decide who may sign up. You **do not** see inside other companies' clients, quotes or invoices. The database blocks it, and the two-company test checks it. |
| **Master account** (company owner) | The person who created the company (for Power Works, you) | Everything in their company, plus what only they can do: <br>• Company Details: logo, bank details, VAT, terms, invoice numbering, labour rate<br>• expense account codes, reminders, modules on or off<br>• connect PayFast and Xero, require two-step login<br>• make someone an admin, give a member whole-team view, remove people<br>• new invite link, download all company data, ask for deletion |
| **Admin** | Trusted office staff (now Greg and Christo) | Sees all the company's records. Manages products and stock, service plans, the schedule, everyone's timesheets, the activity log, "Sync now" to Xero. Can't change Company Details or connections. |
| **Member** | Technicians, sales reps (now Juan) | Sees and works on **their own** clients, quotes, jobs, notes and expenses, plus anything shared with them. They can ask for **whole-team view**, and the master account approves it. They can read the product catalogue and clock their own time. |

A person belongs to one company. Everything a company creates carries its company tag. The
database, not just the app, keeps each company's records to itself.

## How a new company joins

1. **They sign up** on the app's first screen, if they're allowed to (see below). They confirm
   their email and accept the terms.
2. **The setup wizard** asks for the company name, details, logo and bank details. The person
   who does this becomes the company's **master account**. Jack Selector starts switched off,
   because it's only for Power Works.
3. **Their trial starts:** 14 days of full use.
4. **They invite their team** with the invite link in the wizard or Team screen. People who
   join through it are **members**. The master account can make any of them an admin.

### Who may sign up (Settings → Platform → Sign-up)

- **Restricted** (now): only emails on your allowed domains (`pwrstart.com`), people with a
  company's invite link, or people with a **sign-up code** you create and give to a prospect.
- **Open**: anyone. Switch to this when you're ready to sell openly.

## Memberships (plans)

| Plan / status | What the company can do |
|---|---|
| **Trial** (14 days) | Full use |
| Trial ended, or **past due** | **Read-only**: they can look and export, but not add or change |
| **Starter / Pro / Enterprise**, active | Full use |
| **Free**, active | Full use, never expires (Power Works is on this) |
| **Suspended** or **cancelled** | No access. Their data is kept. |

The plan names are yours to price. The app doesn't limit features or seats by plan yet.

### What happens by itself (daily at 07:05)

- **3 days before a trial ends**, the company's master account gets a message in the app.
- **When a paid plan's "paid until" date passes**, they get a "payment due" message.
- **7 days later**, if still unpaid, the company becomes **past due** (read-only) until you
  record the payment.

### What you do when a company pays

1. Settings → **Platform** → tap the company.
2. Set the plan (e.g. Pro), status **active**, and **paid until** (e.g. a month from today).
3. Save. They have full use again straight away.

For card or debit-order billing of your subscriptions (instead of invoicing companies yourself),
see `LAUNCH_CHECKLIST.md`, section 2.

## Keeping it safe

- **Two-step login**: turn it on for your own account (Settings → Two-step login). Your
  account can see every company, so it matters most. Then, in Company Details → Security,
  require it for owners and admins.
- **Leaving staff**: Team → the person → Remove. Their work is handed to someone else and they
  can't log in any more.
- **Everything is logged**: Activity log (Settings) shows who added, changed or deleted what.

## Expenses into Sage (or Xero / QuickBooks)

1. **Once:** Company Details → **Expense account codes**. Enter your Sage account for each kind
   of expense (ask your bookkeeper; blanks use the defaults shown).
2. **Each month:** Expenses → Select → tick the expenses → **Sage**. You get a CSV file of
   purchase invoices, one per expense. Each has:
   - supplier, the supplier's VAT number, date and reference;
   - account, amount excluding VAT, VAT (15%, or "No VAT" for entertainment and when you're not
     VAT registered) and total.

   Foreign receipts are in rand at the rate saved with the expense.
3. **In Sage:** Purchases → Quick entries → Import. Choose the file.
   - **The first time**, download Sage's own template from that screen and compare its column
     headings with the file.
   - **If they differ** (Sage's layout varies by product and country), send the template to the
     app developer and the export will be matched to it exactly.
   - **Sage 50 / Pastel** has its own import, so check the same way.
