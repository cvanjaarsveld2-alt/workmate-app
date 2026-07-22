// ─── Quote PDF Generator ──────────────────────────────────────────────────────
// Generates a branded PDF quote with line items, VAT, and company details.
// Uses jspdf + jspdf-autotable (already in package.json).
//
// Usage:
//   import { generateQuotePDF } from "../lib/quotePDF";
//   const blob = await generateQuotePDF(quoteData);
//   // Share via native share sheet or download
// ─────────────────────────────────────────────────────────────────────────────

import { PW_LOGO_B64 } from "./pwLogo";

export async function generateQuotePDF(quote, companyInfo = {}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 15; // margin

  // ── Company defaults (Power Works) ──
  const company = {
    name:    companyInfo.name    || "Power Works (Pty) Ltd",
    address: companyInfo.address || "South Africa",
    phone:   companyInfo.phone   || "",
    email:   companyInfo.email   || "",
    vat:     companyInfo.vatNo   || "",
    ...companyInfo,
  };

  // ── Header bar ──
  doc.setFillColor(139, 26, 26);
  doc.rect(0, 0, W, 36, "F");
  // Logo left side
  try {
    doc.addImage(PW_LOGO_B64, "JPEG", M, 4, 60, 13);
  } catch {
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(company.name, M, 14);
  }
  // Contact details right side
  doc.setFontSize(7); doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 220, 220);
  const contactLine = [company.phone, company.email].filter(Boolean).join("  |  ");
  if (contactLine) doc.text(contactLine, W - M, 12, { align: "right" });
  if (company.address) doc.text(company.address, W - M, 19, { align: "right" });
  if (company.vat) doc.text(`VAT: ${company.vat}`, W - M, 26, { align: "right" });

  // ── Quote title ──
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("QUOTATION", W - M, 45, { align: "right" });

  // ── Quote meta ──
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const meta = [
    ["Quote #:", quote.quoteNumber || quote.id?.slice(0, 8).toUpperCase() || "—"],
    ["Date:", quote.date || new Date().toLocaleDateString("en-ZA")],
    ["Valid for:", quote.validDays ? `${quote.validDays} days` : "30 days"],
  ];
  let metaY = 42;
  meta.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, M, metaY);
    doc.setFont("helvetica", "normal");
    doc.text(value, M + 25, metaY);
    metaY += 5;
  });

  // ── Client details ──
  doc.setFont("helvetica", "bold");
  doc.text("TO:", M, metaY + 5);
  doc.setFont("helvetica", "normal");
  const clientLines = [
    quote.clientName || "",
    quote.clientContact || "",
    quote.clientEmail || "",
    quote.clientPhone || "",
  ].filter(Boolean);
  doc.text(clientLines, M + 10, metaY + 5);

  // ── Line items table ──
  const items = quote.line_items || quote.lineItems || [];
  const vatRate = quote.vatRate || 15;
  const vatInclusive = (quote.vat_inclusive ?? quote.vatInclusive) !== false;

  const tableBody = items.map((item, i) => {
    const qty   = parseFloat(item.qty) || 1;
    const price = parseFloat(item.unitPrice) || 0;
    const total = qty * price;
    return [
      i + 1,
      item.description || "",
      qty,
      `R ${price.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
      `R ${total.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
    ];
  });

  const subtotal = items.reduce((s, item) => s + (parseFloat(item.qty) || 1) * (parseFloat(item.unitPrice) || 0), 0);
  let vatAmount, grandTotal;
  if (vatInclusive) {
    vatAmount  = subtotal - (subtotal / (1 + vatRate / 100));
    grandTotal = subtotal;
  } else {
    vatAmount  = subtotal * (vatRate / 100);
    grandTotal = subtotal + vatAmount;
  }

  const startY = metaY + 5 + clientLines.length * 5 + 8;

  autoTable(doc, {
    startY,
    head: [["#", "Description", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [139, 26, 26], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 15, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
    alternateRowStyles: { fillColor: [250, 248, 248] },
  });

  // ── Totals ──
  let totalsY = doc.lastAutoTable.finalY + 8;
  const rCol = W - M;

  function totalRow(label, value, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.text(label, rCol - 50, totalsY, { align: "right" });
    doc.text(`R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`, rCol, totalsY, { align: "right" });
    totalsY += bold ? 7 : 5;
  }

  if (!vatInclusive) {
    totalRow("Subtotal:", subtotal);
    totalRow(`VAT (${vatRate}%):`, vatAmount);
  }
  totalRow("TOTAL:", grandTotal, true);
  if (vatInclusive) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`(Includes VAT of R ${vatAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })})`, rCol, totalsY);
    totalsY += 6;
  }

  // ── Notes ──
  if (quote.notes) {
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notes:", M, totalsY + 5);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(quote.notes, W - M * 2);
    doc.text(noteLines, M, totalsY + 10);
    totalsY += 10 + noteLines.length * 4;
  }

  // ── Footer ──
  if (company.vat) {
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`VAT Reg: ${company.vat}`, M, 285);
  }
  doc.setFontSize(7);
  doc.text("Generated by PowerMate", W - M, 285, { align: "right" });

  return doc.output("blob");
}

// ── Share/download helper ──────────────────────────────────────────────────────
export async function shareQuotePDF(quoteData, companyInfo) {
  const blob = await generateQuotePDF(quoteData, companyInfo);
  const filename = quoteData.filename || `Quote_${(quoteData.clientName || "Client").replace(/[^a-zA-Z0-9]/g,"_")}_${quoteData.date || new Date().toISOString().slice(0,10)}.pdf`;

  // Try native share first (mobile)
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Quote — ${quoteData.clientName || ""}` });
        return "shared";
      }
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
