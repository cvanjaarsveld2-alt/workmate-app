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

### What each plan includes (Settings → Platform → Plans)

You set the name, monthly price, number of users and features of each paid plan. The
starting values:

| | Starter | Pro | Enterprise |
|---|---|---|---|
| Price per month | R 499 | R 1 299 | R 2 999 |
| Users | 3 | 10 | Unlimited |
| Clients, quotes, jobs, invoices, expenses, reports | ✓ | ✓ | ✓ |
| Products & stock, Schedule, Service plans, Timesheets | | ✓ | ✓ |
| Automatic reminders, customers pay online (PayFast) | | ✓ | ✓ |
| Xero sync | | | ✓ |

- **Trial and Free include everything**, with no user limit.
- A company's own user limit (Platform → Companies → tap it → *Users*) overrides its plan's.
  Use this for a deal, e.g. Starter with 5 users.
- **Locked features**: they stay in the menu with a padlock. Opening one shows "isn't in your
  plan". The master account gets a **See plans** button; other people are told to ask them.
- **The database enforces it**, not only the app:
  - adding products, service plans or time entries is refused;
  - reminders, service jobs, online payments and Xero stop for that company;
  - a new person can't join once the user limit is reached ("This company's plan allows 3
    users…").
- **Downgrading never deletes anything.** Existing products, timesheets and so on stay
  visible. They just can't add new ones.
- **Changing prices** affects new subscriptions only. PayFast keeps charging existing
  subscribers what they signed up for. To move someone to a new price, ask them to cancel
  and choose again.

### What happens by itself (daily at 07:05)

- **3 days before a trial ends**, the company's master account gets a message in the app.
- **When a paid plan's "paid until" date passes**, they get a "payment due" message.
- **7 days later**, if still unpaid, the company becomes **past due** (read-only) until you
  record the payment.

### Companies pay you by themselves (PayFast subscriptions)

Every company's master account has **Settings → Plan & billing**. It shows:

- their plan and users (e.g. "3 users of 3");
- the three plans with prices and what's included;
- a **Choose** button that takes them to PayFast to pay by card or debit order.

Each month PayFast charges them and tells the app. The app then:

1. sets the plan, status *active* and *paid until* one month further;
2. records the payment (they see it under Payments);
3. sends them a "Payment received" message.

**Cancel monthly payments** stops PayFast. Their plan runs until *paid until*, and then
the daily check makes them read-only as usual.

**One-time setup:**

1. Open a PayFast merchant account for **your** business, not a customer's.
2. Ask PayFast to switch on **recurring billing (subscriptions)**.
3. In PayFast → Settings → Integration, set a **passphrase**.
4. In the app: Settings → **Platform → Billing**. Enter the merchant ID, merchant key and
   passphrase. Leave **Test mode** ticked.
5. Tap **Switch paying in the app on**.
6. Test it with PayFast's sandbox buyer account from a test company.
7. Then untick Test mode.

Until billing is switched on, Plan & billing shows the prices with an **Ask for …** button
that opens Help.

A payment for less than the plan's current price, e.g. after you raised prices, is recorded
but doesn't upgrade. It shows in the events log as `billing_underpaid`.

### Doing it by hand (EFT, deals)

1. Settings → **Platform** → tap the company.
2. Set the plan (e.g. Pro), status **active**, and **paid until** (e.g. a month from today).
3. Save. They have full use again straight away.

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
