// ─── Expense Finance PDF Generator ───────────────────────────────────────────
// Builds a professional expense claim PDF for the finance department.
// Cover page → itemised table → receipt thumbnails appendix.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "../supabase";

const BRAND_RED = "#8B1A1A";

function fmtMoney(amount, currency = "ZAR") {
  const sym = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const n = parseFloat(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

function shortRef() {
  // Date-based reference: PWR-YYYYMMDD-HHMM, easy for finance to log.
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `PWR-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Sign a private receipt path → URL valid for 14 days (long enough for finance
// to process the claim).
async function signOne(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  try {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(pathOrUrl, 60 * 60 * 24 * 14);
    return data?.signedUrl || null;
  } catch { return null; }
}

// Fetch and convert a URL to a base64 data URL so we can embed in the PDF.
async function urlToDataURL(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/**
 * Build the finance PDF and return a Blob.
 *
 * @param {Object} opts
 * @param {Array}  opts.expenses      The selected expenses to include.
 * @param {Object} opts.submitter     { name, email }
 * @param {String} opts.periodLabel   e.g. "26 May – 25 Jun 2026"
 * @returns {Promise<{blob:Blob, filename:string, ref:string}>}
 */
export async function buildExpensePDF({ expenses, submitter, periodLabel }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const ref = shortRef();

  // Pre-sign all receipt URLs (in parallel) so we can embed and link.
  const signedTills = await Promise.all(expenses.map(e => signOne(e.receipt_url)));
  const signedPays  = await Promise.all(expenses.map(e => signOne(e.payment_slip_url)));

  // ─── COVER PAGE ──────────────────────────────────────────────────────────
  doc.setFillColor(BRAND_RED);
  doc.rect(0, 0, pageWidth, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("EXPENSE CLAIM", margin, 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Power Works (Pty) Ltd", margin, 68);

  doc.setTextColor(30, 30, 30);

  // Reference & meta block
  let y = 120;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("REFERENCE", margin, y);
  doc.text("SUBMITTED BY", margin + 180, y);
  doc.text("PERIOD", margin + 360, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(ref, margin, y + 16);
  doc.text(submitter?.name || submitter?.email || "—", margin + 180, y + 16);
  doc.text(periodLabel || "—", margin + 360, y + 16);

  // Totals block
  y = 180;
  const totalZAR     = expenses.reduce((s, e) => s + parseFloat(e.amount_zar || e.amount || 0), 0);
  const totalVAT     = expenses.reduce((s, e) => s + parseFloat(e.vat_amount || 0), 0);
  const itemCount    = expenses.length;
  const submittedAt  = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // Big total banner
  doc.setFillColor(247, 243, 243);
  doc.rect(margin, y, pageWidth - 2 * margin, 70, "F");
  doc.setTextColor(BRAND_RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL CLAIM (ZAR)", margin + 16, y + 24);
  doc.setFontSize(28);
  doc.text(fmtMoney(totalZAR), margin + 16, y + 56);

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${itemCount} item${itemCount !== 1 ? "s" : ""} · VAT included: ${fmtMoney(totalVAT)}`,
    pageWidth - margin - 16, y + 56, { align: "right" });

  // Totals by category
  y = 280;
  const byCategory = {};
  expenses.forEach(e => {
    const c = e.category || "Other";
    byCategory[c] = (byCategory[c] || 0) + parseFloat(e.amount_zar || e.amount || 0);
  });
  const catRows = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([c, total]) => [c, fmtMoney(total)]);

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTALS BY CATEGORY", margin, y);

  autoTable(doc, {
    startY: y + 8,
    head: [["Category", "Amount (ZAR)"]],
    body: catRows,
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [139, 26, 26], textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
    theme: "striped",
  });

  // ─── ITEMISED TABLE PAGE(S) ──────────────────────────────────────────────
  doc.addPage();
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Itemised expenses", margin, 50);

  const rows = expenses.map((e, i) => {
    const orig = `${fmtMoney(e.amount, e.currency)}${e.currency && e.currency !== "ZAR" ? "" : ""}`;
    const zar  = e.amount_zar && e.currency !== "ZAR"
      ? fmtMoney(e.amount_zar, "ZAR")
      : (e.currency === "ZAR" ? fmtMoney(e.amount, "ZAR") : "—");
    return [
      String(i + 1),
      fmtDate(e.expense_date) + (e.expense_time ? ` ${e.expense_time}` : ""),
      e.vendor || "—",
      e.category || "Other",
      e.payment_method || "—",
      orig,
      zar,
      e.vat_amount > 0 ? fmtMoney(e.vat_amount, e.currency) : "—",
    ];
  });

  autoTable(doc, {
    startY: 70,
    head: [["#", "Date", "Vendor", "Category", "Payment", "Original", "ZAR", "VAT"]],
    body: rows,
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [139, 26, 26], textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { halign: "center", cellWidth: 22 },
      1: { cellWidth: 75 },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    theme: "striped",
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Ref ${ref}`, margin, pageHeight - 20);
      doc.text(`Generated ${submittedAt}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  // Footer total under the table
  const finalY = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(BRAND_RED);
  doc.text(`TOTAL CLAIM: ${fmtMoney(totalZAR)}`, pageWidth - margin, finalY, { align: "right" });

  // ─── RECEIPTS APPENDIX ───────────────────────────────────────────────────
  // 2 receipts per page (till + payment side-by-side), with a small caption.
  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i];
    const tillUrl = signedTills[i];
    const payUrl  = signedPays[i];
    if (!tillUrl && !payUrl) continue;

    doc.addPage();
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Receipt ${i + 1} of ${expenses.length}`, margin, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`${fmtDate(e.expense_date)}  ·  ${e.vendor || "—"}  ·  ${fmtMoney(e.amount, e.currency)}${e.currency && e.currency !== "ZAR" && e.amount_zar ? `  (≈ ${fmtMoney(e.amount_zar, "ZAR")})` : ""}`, margin, 68);

    // Embed images — half-page each, side by side.
    const imgWidth  = (pageWidth - 2 * margin - 20) / 2;
    const imgTop    = 90;
    const imgHeight = pageHeight - imgTop - 60; // leave footer space

    if (tillUrl) {
      const tillData = await urlToDataURL(tillUrl);
      if (tillData) {
        try {
          // Caption above
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("Till slip", margin, imgTop - 4);
          doc.setFont("helvetica", "normal");
          doc.addImage(tillData, "JPEG", margin, imgTop, imgWidth, imgHeight, undefined, "FAST");
        } catch (err) {
          // Image embed failed — fall back to a text URL line
          doc.text(`Till: ${tillUrl}`, margin, imgTop + 10);
        }
      }
    }

    if (payUrl) {
      const payData = await urlToDataURL(payUrl);
      if (payData) {
        try {
          doc.setFontSize(9);
          doc.setFont("helvetica", "bold");
          doc.text("Payment slip", margin + imgWidth + 20, imgTop - 4);
          doc.setFont("helvetica", "normal");
          doc.addImage(payData, "JPEG", margin + imgWidth + 20, imgTop, imgWidth, imgHeight, undefined, "FAST");
        } catch (err) {
          doc.text(`Payment: ${payUrl}`, margin + imgWidth + 20, imgTop + 10);
        }
      }
    }

    // Live link line at the bottom for high-res / verification
    doc.setFontSize(8);
    doc.setTextColor(80);
    let linkY = pageHeight - 40;
    if (tillUrl) {
      doc.textWithLink(`Open till slip (valid 14 days)`, margin, linkY, { url: tillUrl });
    }
    if (payUrl) {
      doc.textWithLink(`Open payment slip (valid 14 days)`, margin + imgWidth + 20, linkY, { url: payUrl });
    }
  }

  const blob = doc.output("blob");
  const filename = `Expense-Claim-${ref}.pdf`;
  return { blob, filename, ref };
}
