// ─── Invoices for accounting packages ─────────────────────────────────────────
// CSV exports shaped for the import screens of Xero, Sage Business Cloud
// Accounting and QuickBooks Online. Lines come from invoiceToDocument, so the
// figures match the invoice PDFs exactly. Amounts are exclusive of VAT, with
// the VAT treatment per line (15% standard, zero-rated or exempt, or none for
// a company that isn't VAT registered) and each line's discount.
import { invoiceToDocument } from "./documentData.js";
import { chargesVat } from "./documentPDF.js";
import { toCsv } from "./companyExport.js";
import { lineAmounts, vatCode } from "./lineTotals.js";

const dmy = iso => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

// One row per invoice line, shared by every format.
export function invoiceLines(invoices, { clients = [], quotes = [], profile = {} } = {}) {
  const vatOn = chargesVat(profile);
  return invoices.flatMap(inv => {
    const doc = invoiceToDocument(inv, "invoice", { clients, quotes, profile });
    return doc.items.map(item => {
      const a = lineAmounts(item, { vatInclusive: doc.vatInclusive, vatRegistered: vatOn });
      const code = vatOn ? vatCode(item) : "none";
      return {
        customer: doc.client.name || "Customer",
        email: doc.client.email || "",
        number: doc.number,
        reference: doc.reference || "",
        date: doc.date,
        due: doc.dueDate,
        // The part number goes in the description: an item code the accounting
        // package doesn't know would make the import fail.
        description: [item.code, item.description || "Services"].filter(Boolean).join(" "),
        qty: a.qty,
        // Unit price excluding VAT, before the line's discount.
        unitEx: r2(vatOn && doc.vatInclusive ? a.price / (1 + a.rate) : a.price),
        discount: a.discount,
        lineEx: a.net,
        vat: a.vat,
        total: a.gross,
        vatOn,
        code,
      };
    });
  });
}

const TAX = {
  xero: { standard: "Standard Rate Sales", zero: "Zero Rated", exempt: "Exempt Sales", none: "No VAT" },
  sage: { standard: "Standard Rate (15%)", zero: "Zero Rated", exempt: "Exempt", none: "No VAT" },
  quickbooks: { standard: "15.0% S", zero: "0.0% Z", exempt: "Exempt", none: "Exempt" },
};

export const FORMATS = {
  xero: {
    label: "Xero",
    rows: lines =>
      lines.map(l => ({
        "*ContactName": l.customer,
        EmailAddress: l.email,
        "*InvoiceNumber": l.number,
        Reference: l.reference,
        "*InvoiceDate": dmy(l.date),
        "*DueDate": dmy(l.due),
        "*Description": l.description,
        "*Quantity": l.qty,
        "*UnitAmount": l.unitEx,
        Discount: l.discount || "",
        "*AccountCode": "200",
        "*TaxType": TAX.xero[l.code],
        TaxAmount: l.vat,
        Currency: "ZAR",
      })),
  },
  sage: {
    label: "Sage",
    rows: lines =>
      lines.map(l => ({
        "Customer Name": l.customer,
        "Document Number": l.number,
        "Document Date": dmy(l.date),
        "Due Date": dmy(l.due),
        Reference: l.reference,
        Description: l.description,
        Quantity: l.qty,
        "Unit Price (Excl)": l.unitEx,
        "Discount %": l.discount || "",
        "VAT Type": TAX.sage[l.code],
        "VAT Amount": l.vat,
        "Line Total (Incl)": l.total,
      })),
  },
  quickbooks: {
    label: "QuickBooks",
    rows: lines =>
      lines.map(l => ({
        InvoiceNo: l.number,
        Customer: l.customer,
        InvoiceDate: dmy(l.date),
        DueDate: dmy(l.due),
        Memo: l.reference,
        ItemDescription: l.description,
        ItemQuantity: l.qty,
        // No line discounts in QuickBooks' import: the rate is after discount.
        ItemRate: l.qty ? r2(l.lineEx / l.qty) : l.lineEx,
        ItemAmount: l.lineEx,
        ItemTaxCode: TAX.quickbooks[l.code],
      })),
  },
};

export function accountingCsv(format, invoices, ctx) {
  return toCsv(FORMATS[format].rows(invoiceLines(invoices, ctx)));
}
