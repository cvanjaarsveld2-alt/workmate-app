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

// Same as urlToDataURL, but also reports the image's natural pixel size so
// callers can fit it into a box without distorting the aspect ratio.
async function urlToDataURLWithSize(url) {
  const dataUrl = await urlToDataURL(url);
  if (!dataUrl) return null;
  try {
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, width: dims.w, height: dims.h };
  } catch {
    // Couldn't read dimensions — still return the data so we can fall back
    // to filling the box (better than nothing).
    return { dataUrl, width: null, height: null };
  }
}

// Compute the draw rect that fits an image of (imgW × imgH) inside a square
// box of `size` × `size`, preserving aspect ratio, centred (letterboxed).
function fitInsideSquare(imgW, imgH, size) {
  if (!imgW || !imgH) {
    // Unknown dimensions — fill the box as a safe fallback.
    return { x: 0, y: 0, w: size, h: size };
  }
  const scale = Math.min(size / imgW, size / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
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
  // 2×2 grid, each slip exactly 7.87cm × 7.87cm (per spec), 4 slips per A4
  // page. Till and payment slips are both counted as individual "slots" so
  // an expense with both fills 2 slots; one with only a till slip fills 1.
  const CM_TO_PT = 28.346;
  const SLOT_SIZE = 7.87 * CM_TO_PT; // ≈ 223.1pt — the fixed square per spec
  const GRID_GAP  = 16;              // gap between slots, in pt
  const CAPTION_H = 46;              // space reserved under each image for kind label + wrapped caption + link

  // Flatten every expense's slips into a single ordered list of "slots" —
  // this is what actually gets laid out 4-per-page, regardless of which
  // expense they belong to.
  const slots = [];
  for (let i = 0; i < expenses.length; i++) {
    const e = expenses[i];
    if (signedTills[i]) {
      slots.push({
        url: signedTills[i],
        kind: "Till slip",
        caption: `#${i + 1} · ${e.vendor || "—"} · ${fmtMoney(e.amount, e.currency)}`,
      });
    }
    if (signedPays[i]) {
      slots.push({
        url: signedPays[i],
        kind: "Payment slip",
        caption: `#${i + 1} · ${e.vendor || "—"}`,
      });
    }
  }

  if (slots.length > 0) {
    // Grid geometry: 2 columns × 2 rows, centred horizontally on the page.
    const gridWidth = 2 * SLOT_SIZE + GRID_GAP;
    const gridStartX = (pageWidth - gridWidth) / 2;
    const headerSpace = 50; // room for the "Receipts X–Y of N" page heading

    const positions = [
      { col: 0, row: 0 }, { col: 1, row: 0 },
      { col: 0, row: 1 }, { col: 1, row: 1 },
    ];

    for (let pageStart = 0; pageStart < slots.length; pageStart += 4) {
      doc.addPage();
      const pageSlots = slots.slice(pageStart, pageStart + 4);

      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(
        `Receipts ${pageStart + 1}–${Math.min(pageStart + pageSlots.length, slots.length)} of ${slots.length}`,
        margin, 36
      );

      for (let s = 0; s < pageSlots.length; s++) {
        const slot = pageSlots[s];
        const { col, row } = positions[s];
        const x = gridStartX + col * (SLOT_SIZE + GRID_GAP);
        const y = headerSpace + row * (SLOT_SIZE + GRID_GAP + CAPTION_H);

        // Border so empty/failed-to-load slots are still visually obvious.
        doc.setDrawColor(220, 220, 220);
        doc.rect(x, y, SLOT_SIZE, SLOT_SIZE);

        const img = await urlToDataURLWithSize(slot.url);
        if (img) {
          try {
            // Fit inside the square without distortion — preserves the
            // receipt's real aspect ratio, centred with white space top/bottom
            // (or left/right) as needed rather than stretching it.
            const fit = fitInsideSquare(img.width, img.height, SLOT_SIZE);
            doc.addImage(img.dataUrl, "JPEG", x + fit.x, y + fit.y, fit.w, fit.h, undefined, "FAST");
          } catch (err) {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text("(image failed to embed)", x + 8, y + SLOT_SIZE / 2);
          }
        } else {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text("(no image)", x + 8, y + SLOT_SIZE / 2);
        }

        // Caption block below the square: kind label, then caption (which
        // may wrap to 2 lines), then the link — each on its own Y position
        // so nothing overlaps.
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(BRAND_RED);
        doc.text(slot.kind, x, y + SLOT_SIZE + 11);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        const captionLines = doc.splitTextToSize(slot.caption, SLOT_SIZE);
        doc.text(captionLines, x, y + SLOT_SIZE + 19);

        // Link sits below the caption text, wherever that ends — wrapped
        // captions get 2 lines of ~8.5pt each before the link starts.
        const linkY = y + SLOT_SIZE + 19 + captionLines.length * 8.5;
        doc.setFontSize(7.5);
        doc.setTextColor(37, 99, 235);
        doc.textWithLink("Open full size (14 days)", x, linkY, { url: slot.url, maxWidth: SLOT_SIZE });
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Ref ${ref}`, margin, pageHeight - 20);
      doc.text(`Generated ${submittedAt}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    }
  }

  const blob = doc.output("blob");
  const filename = `Expense-Claim-${ref}.pdf`;
  return { blob, filename, ref };
}
