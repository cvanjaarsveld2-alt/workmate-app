// ─── Expenses → accounting packages ───────────────────────────────────────────
// Categories with their default ledger (GL) codes and SA VAT treatment, and
// CSV exports of expenses as supplier invoices / purchases for Sage, Xero and
// QuickBooks. Each company can set its own ledger code per category (Company
// Details → Expense account codes) so the export lands on the right accounts
// in its own chart. Tests in tests/expense-accounting.test.mjs.
import { toCsv } from "./companyExport.js";

// GL codes are sensible SA defaults; each company overrides them to match its
// own chart of accounts. vatClaim says whether input VAT can be claimed (SARS):
// entertainment can't be (s17(2)(a)); the rest can with a valid tax invoice.
export const CATEGORY_META = {
  "Fuel":                 { gl: "5200", vatClaim: true,  note: "Diesel/petrol — input VAT claimable with valid tax invoice." },
  "Accommodation":        { gl: "5210", vatClaim: true,  note: "Business travel accommodation — claimable." },
  "Subsistence (meals)":  { gl: "5220", vatClaim: true,  note: "Meals while travelling for work — claimable." },
  "Entertainment":        { gl: "5230", vatClaim: false, note: "Client/staff entertainment — input VAT NOT claimable (SARS)." },
  "Tools & Equipment":    { gl: "5300", vatClaim: true,  note: "Tools/equipment — claimable (may be capitalised if >R7,000)." },
  "Parts & Materials":    { gl: "5100", vatClaim: true,  note: "Job materials/consumables — claimable." },
  "Travel":               { gl: "5240", vatClaim: true,  note: "Flights, parking — claimable (passenger vehicle hire has restrictions)." },
  "Tolls":                { gl: "5241", vatClaim: true,  note: "SANRAL/e-toll fees — standard-rated 15%, input VAT claimable with the toll slip. Falls under Travel & motor vehicle expenses." },
  "Office":               { gl: "5400", vatClaim: true,  note: "Office consumables/admin — claimable." },
  "Other":                { gl: "5900", vatClaim: true,  note: "Uncategorised — confirm GL code with finance." },
};
export const CATEGORIES = Object.keys(CATEGORY_META);

// The company's code for a category, else the default.
export const glFor = (category, companyCodes = {}) =>
  String((companyCodes || {})[category] || (CATEGORY_META[category] || CATEGORY_META.Other).gl || "").trim();

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const dmy = iso => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

// One line per expense, in rand. Foreign-currency receipts use the rand value
// saved with the expense, and their VAT is converted at the same rate.
// Input VAT is only claimed by a VAT-registered company, on categories where
// SARS allows it, when the receipt shows VAT; otherwise the full amount is the
// cost (no VAT).
export function expenseLines(expenses, { vatRegistered = true, glCodes = {}, people = new Map() } = {}) {
  return (expenses || []).map(e => {
    const gross = Number(e.amount) || 0;
    const zar = e.currency && e.currency !== "ZAR" && Number(e.amount_zar) ? Number(e.amount_zar) : gross;
    const rate = gross ? zar / gross : 1;
    const vatOnReceipt = r2((Number(e.vat_amount) || 0) * rate);
    const meta = CATEGORY_META[e.category] || CATEGORY_META.Other;
    const claim = vatRegistered && meta.vatClaim !== false && vatOnReceipt > 0;
    const vat = claim ? vatOnReceipt : 0;
    const details = [e.category, e.client_name ? `for ${e.client_name}` : "", String(e.notes || "").replace(/\s+/g, " ").trim()]
      .filter(Boolean)
      .join(" – ")
      .slice(0, 255);
    return {
      id: e.id,
      date: e.expense_date,
      supplier: String(e.vendor || "").trim() || "Cash supplier",
      supplierVat: e.vat_number || "",
      reference: String(e.gr_code || "").trim() || `EXP-${String(e.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()}`,
      ledger: String(e.gl_code || "").trim() || glFor(e.category, glCodes),
      details: details || "Expense",
      gross: r2(zar),
      vat,
      net: r2(zar - vat),
      claim,
      paidBy: e.payment_method || "",
      person: people.get(e.user_id) || "",
      originalCurrency: e.currency && e.currency !== "ZAR" ? `${e.currency} ${r2(gross).toFixed(2)}` : "",
    };
  });
}

export const EXPENSE_FORMATS = {
  // Sage Accounting: Purchases → Quick entries → Import (purchase invoices).
  sage: {
    label: "Sage",
    hint: "Purchases → Quick entries → Import",
    rows: lines =>
      lines.map(l => ({
        Type: "Purchase Invoice",
        Reference: l.reference,
        Date: dmy(l.date),
        "Supplier Name": l.supplier,
        "Supplier VAT Number": l.supplierVat,
        "Ledger Account": l.ledger,
        Details: l.details,
        "Net Amount": l.net.toFixed(2),
        "Tax Rate": l.claim ? "Standard Rate (15%)" : "No VAT",
        "Tax Amount": l.vat.toFixed(2),
        "Total Amount": l.gross.toFixed(2),
      })),
  },
  // Xero: Business → Bills to pay → Import.
  xero: {
    label: "Xero",
    hint: "Bills to pay → Import",
    rows: lines =>
      lines.map(l => ({
        "*ContactName": l.supplier,
        "*InvoiceNumber": l.reference,
        "*InvoiceDate": dmy(l.date),
        "*DueDate": dmy(l.date),
        Description: l.details,
        "*Quantity": 1,
        "*UnitAmount": l.net.toFixed(2),
        "*AccountCode": l.ledger,
        "*TaxType": l.claim ? "Standard Rate Purchases" : "No VAT",
        TaxAmount: l.vat.toFixed(2),
        Currency: "ZAR",
      })),
  },
  // QuickBooks Online: import as bills.
  quickbooks: {
    label: "QuickBooks",
    hint: "Import data → Bills",
    rows: lines =>
      lines.map(l => ({
        "Bill No": l.reference,
        Supplier: l.supplier,
        "Bill Date": dmy(l.date),
        "Due Date": dmy(l.date),
        Account: l.ledger,
        "Line Description": l.details,
        "Line Amount": l.net.toFixed(2),
        "Line Tax Code": l.claim ? "15.0% S" : "Exempt",
        "Line Tax Amount": l.vat.toFixed(2),
      })),
  },
};

export function expenseCsv(format, expenses, ctx) {
  return toCsv(EXPENSE_FORMATS[format].rows(expenseLines(expenses, ctx)));
}
