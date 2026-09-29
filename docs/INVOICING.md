# Invoices, quotes and payments: how they work

The app follows the same rules as Sage and Xero, and the database enforces
them (not just the screens), so no phone, app version or teammate can get
around them.

## Invoices

| Stage | What you can do |
|---|---|
| **Draft** | Change anything, or delete it. Make a pro forma. Customers don't see drafts (not in the portal, not in Xero). |
| **Approved** ("Awaiting payment") | Final: customer, date, lines and amounts can't change and it can't be deleted. Record payments, send it, remind the customer. |
| **Paid** / **Credited** | Settled by payments and/or credit notes. |
| **Void** | Cancelled by mistake-fix. Keeps its number (no gaps in the sequence) and shows VOID on the PDF. |

- **New invoice**: Invoices → New, or "Create invoice" on a finished job (it copies
  the quote's lines, or the parts and labour used).
- **Approve**: from the draft, or "Approve & PDF". Needs a customer and an amount.
  The due date comes from your payment terms unless you set one.
- **Numbers** come from the server in order (INV-00001…), so they never repeat.
- **Lines**: each line can have a discount % and its own VAT: 15%, zero-rated or
  exempt. Prices can be entered including or excluding VAT.

## Fixing a mistake on an approved invoice

- **Credit note** (master account or admin): for all or part of what's still
  owed, with a reason. It gets its own number (CN-00001) and PDF, and reduces the
  balance. For the whole invoice it copies the invoice's lines.
- **Void** (master account or admin): only when there are no payments or credit
  notes on it. Then make a new, correct invoice.

## Payments

- **Record payment**: amount, the date the money came in, how it was paid, and
  a reference. A payment can't be more than what's owed.
- Payments can't be changed or deleted. A wrong one (e.g. a bounced EFT) is
  **reversed** by the master account or an admin, with a reason. It stays on
  record, marked reversed, and no longer counts.
- Online payments (PayFast) are recorded automatically.
- "Paid", "Owed" and the status are worked out by the server from the payments
  and credit notes.

## Quotes

- Every quote gets a number (Q-00001…) and an expiry date (your validity period).
  Pending quotes past it become **Expired** overnight.
- Once **accepted** (signed online, or marked accepted), or once it's been
  invoiced, a quote is locked. To change it, **Revise**: this makes Q-00001-R1,
  marks the old one Superseded, stops the old online link, and moves the job to
  the new version.
- A quote marked accepted by hand (not signed online) can be set back, until
  it's invoiced.

## Reports and accounting

- **Aged debtors** (Invoices screen): what each customer owes by how long it's
  been due: current, 1–30, 31–60, 61–90, 90+ days, with a CSV.
- **Export for accounting**: approved invoices for a month as a Xero, Sage or
  QuickBooks import file, with each line's VAT type and discount.
- **Xero** (if connected): approved invoices are sent every night with the same
  detail.

## Not yet

- Credit notes and voids are not sent to Xero automatically. Enter them in Xero
  by hand, or void the invoice in Xero, until that's added.
- Expenses approval and a month-end lock date are still to come.
