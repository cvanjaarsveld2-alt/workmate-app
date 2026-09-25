// ─── Invoices for accounting packages ─────────────────────────────────────────
// CSV exports shaped for the import screens of Xero, Sage Business Cloud
// Accounting and QuickBooks Online. Lines come from invoiceToDocument, so the
// figures match the invoice PDFs exactly. Amounts are exclusive of VAT, with
// the VAT treatment per line (15% standard, or none for a company that isn't
// VAT registered).
import { invoiceToDocument } from "./documentData.js";
import { chargesVat } from "./documentPDF.js";
import { toCsv } from "./companyExport.js";

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
      const qty = Number(item.qty) || 0;
      const gross = Number(item.unitPrice) || 0;
      const unitEx = vatOn && doc.vatInclusive ? gross / 1.15 : gross;
      const lineEx = r2(unitEx * qty);
      const vat = vatOn ? r2(lineEx * 0.15) : 0;
      return {
        customer: doc.client.name || "Customer",
        email: doc.client.email || "",
        number: doc.number,
        reference: doc.reference || "",
        date: doc.date,
        due: doc.dueDate,
        description: item.description || "Services",
        qty,
        unitEx: r2(unitEx),
        lineEx,
        vat,
        total: r2(lineEx + vat),
        vatOn,
      };
    });
  });
}

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
        "*AccountCode": "200",
        "*TaxType": l.vatOn ? "Standard Rate Sales" : "No VAT",
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
        "VAT Type": l.vatOn ? "Standard Rate (15%)" : "No VAT",
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
        ItemRate: l.unitEx,
        ItemAmount: l.lineEx,
        ItemTaxCode: l.vatOn ? "15.0% S" : "Exempt",
      })),
  },
};

export function accountingCsv(format, invoices, ctx) {
  return toCsv(FORMATS[format].rows(invoiceLines(invoices, ctx)));
}
