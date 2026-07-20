// ─── Vehicle Inspection PDF Generator ────────────────────────────────────────
// Builds a professional daily vehicle inspection report matching the
// expense PDF style: red brand header, Power Works identity, clean tables.
//
// Returns { blob, filename, ref }
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND_RED  = "#8B1A1A";
const RED_RGB    = [139, 26, 26];
const GREEN_RGB  = [22, 163, 74];
const AMBER_RGB  = [217, 119, 6];
const SLATE_RGB  = [100, 116, 139];

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

function shortDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function shortRef() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `VIC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Status display helpers
function statusLabel(s) {
  if (s === "ok")    return "OK";
  if (s === "issue") return "ISSUE";
  if (s === "na")    return "N/A";
  return "—";
}

function statusColor(s) {
  if (s === "ok")    return GREEN_RGB;
  if (s === "issue") return RED_RGB;
  if (s === "na")    return SLATE_RGB;
  return [200, 200, 200];
}

/**
 * Build the vehicle inspection PDF.
 *
 * @param {Object} opts
 * @param {string} opts.checkDate     ISO date string "2026-07-04"
 * @param {Object} opts.dayData       { items: { [itemName]: { status, comment } }, generalComment }
 * @param {Object} opts.settings      { vehicle, registration, driver }
 * @param {Array}  opts.checklist     The CHECKLIST constant from VehicleCheckScreen
 * @returns {Promise<{blob:Blob, filename:string, ref:string}>}
 */
export async function buildVehicleCheckPDF({ checkDate, dayData, settings, checklist }) {
  const doc        = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin     = 40;
  const ref        = shortRef();
  const generatedAt = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const items    = dayData?.items || {};
  const allItems = checklist.flatMap(s => s.items);

  // Summary counts
  const okCount    = allItems.filter(i => items[i]?.status === "ok").length;
  const issueCount = allItems.filter(i => items[i]?.status === "issue").length;
  const naCount    = allItems.filter(i => items[i]?.status === "na").length;
  const totalItems = allItems.length;
  const allClear   = issueCount === 0 && okCount + naCount === totalItems;

  // ─── PAGE 1: COVER ──────────────────────────────────────────────────────
  // Red header bar
  doc.setFillColor(...RED_RGB);
  doc.rect(0, 0, pageWidth, 80, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("VEHICLE INSPECTION REPORT", margin, 50);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  // Power Works logo — right side of the header bar
  try {
    doc.addImage(PW_LOGO_B64, "JPEG", pageWidth - margin - 110, 10, 110, 23);
  } catch {
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    doc.setTextColor(255, 255, 255);
    doc.text("Power Works (Pty) Ltd", margin, 68);
  }

  doc.setTextColor(30, 30, 30);

  // Meta block — 3 columns
  let y = 110;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(120, 120, 120);
  doc.text("REFERENCE",   margin,       y);
  doc.text("DATE",        margin + 180, y);
  doc.text("INSPECTED BY", margin + 360, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(ref,                           margin,       y + 16);
  doc.text(fmtDate(checkDate),            margin + 180, y + 16, { maxWidth: 160 });
  doc.text(settings?.driver || "—",       margin + 360, y + 16);

  // Vehicle block
  y = 160;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(120, 120, 120);
  doc.text("VEHICLE",      margin,       y);
  doc.text("REGISTRATION", margin + 280, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text(settings?.vehicle || "—",       margin,       y + 16, { maxWidth: 220 });
  doc.text(settings?.registration || "—",  margin + 280, y + 16);

  // Overall result banner
  y = 210;
  const bannerColor = issueCount > 0 ? [254, 226, 226] : [220, 252, 231];
  const bannerBorder = issueCount > 0 ? RED_RGB : GREEN_RGB;
  doc.setFillColor(...bannerColor);
  doc.rect(margin, y, pageWidth - 2 * margin, 72, "F");
  doc.setDrawColor(...bannerBorder);
  doc.setLineWidth(1.5);
  doc.rect(margin, y, pageWidth - 2 * margin, 72);
  doc.setLineWidth(0.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...bannerBorder);
  doc.text("OVERALL RESULT", margin + 16, y + 22);

  doc.setFontSize(24);
  doc.text(
    issueCount > 0
      ? `${issueCount} ISSUE${issueCount !== 1 ? "S" : ""} FOUND`
      : "ALL CLEAR",
    margin + 16, y + 54
  );

  // Stats row on the right side of the banner
  const statsX = pageWidth - margin - 200;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  const statsY = y + 20;
  const statItems = [
    { label: "OK",    val: okCount,    color: GREEN_RGB },
    { label: "Issues", val: issueCount, color: RED_RGB },
    { label: "N/A",   val: naCount,    color: SLATE_RGB },
    { label: "Total",  val: totalItems, color: [30, 30, 30] },
  ];
  statItems.forEach((s, i) => {
    const sx = statsX + i * 50;
    doc.setTextColor(...s.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(String(s.val), sx, statsY + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(s.label, sx, statsY + 36);
  });

  // ─── ISSUES SUMMARY (if any) ─────────────────────────────────────────────
  if (issueCount > 0) {
    y = 310;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("ISSUES REQUIRING ATTENTION", margin, y);

    const issueRows = allItems
      .filter(item => items[item]?.status === "issue")
      .map(item => {
        const section = checklist.find(s => s.items.includes(item))?.section || "—";
        return [section, item, items[item]?.comment || "No description provided"];
      });

    autoTable(doc, {
      startY: y + 10,
      head: [["Section", "Item", "Description"]],
      body: issueRows,
      margin: { left: margin, right: margin },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      headStyles: { fillColor: RED_RGB, textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 90,  fontStyle: "bold" },
        1: { cellWidth: 140 },
        2: { cellWidth: "auto" },
      },
      theme: "striped",
    });
  }

  // General comments
  const gc = dayData?.generalComment?.trim();
  if (gc) {
    const gcY = issueCount > 0
      ? (doc.lastAutoTable?.finalY || 310) + 20
      : 310;

    if (gcY > pageHeight - 120) doc.addPage();
    const useY = gcY > pageHeight - 120 ? 60 : gcY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text("ADDITIONAL COMMENTS", margin, useY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    const wrapped = doc.splitTextToSize(gc, pageWidth - 2 * margin);
    doc.text(wrapped, margin, useY + 16);
  }

  // Footer on page 1
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Ref ${ref}`, margin, pageHeight - 20);
  doc.text(`Generated ${generatedAt}`, pageWidth - margin, pageHeight - 20, { align: "right" });

  // ─── PAGE 2+: FULL CHECKLIST TABLE ──────────────────────────────────────
  doc.addPage();

  // Section header
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Full Inspection Checklist", margin, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`${settings?.vehicle || ""}  ${settings?.registration || ""}  ·  ${shortDate(checkDate)}`, margin, 66);

  // Build table rows — one row per item, grouped by section
  const tableRows = [];
  checklist.forEach(({ section, items: sectionItems }) => {
    // Section header row (styled differently via willDrawCell)
    tableRows.push({ isSection: true, section, item: "", status: "", comment: "" });
    sectionItems.forEach(item => {
      const d = items[item] || {};
      tableRows.push({
        isSection: false,
        section: "",
        item,
        status: d.status || null,
        comment: d.comment || "",
      });
    });
  });

  autoTable(doc, {
    startY: 80,
    head: [["Section / Item", "Status", "Notes"]],
    body: tableRows.map(r => [
      r.isSection ? r.section : `    ${r.item}`,
      r.isSection ? "" : statusLabel(r.status),
      r.isSection ? "" : r.comment,
    ]),
    margin: { left: margin, right: margin },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: RED_RGB, textColor: 255, fontStyle: "bold", fontSize: 9.5 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 50,  halign: "center", fontStyle: "bold" },
      2: { cellWidth: 160 },
    },
    theme: "striped",
    willDrawCell: (data) => {
      // Style section header rows with a light red background
      const row = tableRows[data.row.index];
      if (row?.isSection) {
        data.cell.styles.fillColor  = [247, 243, 243];
        data.cell.styles.textColor  = RED_RGB;
        data.cell.styles.fontStyle  = "bold";
        data.cell.styles.fontSize   = 9.5;
      }
      // Colour the status cell by result
      if (!row?.isSection && data.column.index === 1) {
        const s = row?.status;
        if (s === "ok")    data.cell.styles.textColor = GREEN_RGB;
        if (s === "issue") data.cell.styles.textColor = RED_RGB;
        if (s === "na")    data.cell.styles.textColor = SLATE_RGB;
      }
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Ref ${ref}`, margin, pageHeight - 20);
      doc.text(`Generated ${generatedAt}`, pageWidth - margin, pageHeight - 20, { align: "right" });
    },
  });

  // ─── DECLARATION BLOCK ───────────────────────────────────────────────────
  const declY = Math.min((doc.lastAutoTable?.finalY || 600) + 30, pageHeight - 100);
  if (declY > pageHeight - 80) doc.addPage();
  const dY = declY > pageHeight - 80 ? 60 : declY;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, dY, pageWidth - margin, dY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "I confirm that the above inspection was carried out and the information recorded is accurate to the best of my knowledge.",
    margin, dY + 16, { maxWidth: pageWidth - 2 * margin }
  );

  // Signature line
  const sigY = dY + 46;
  doc.line(margin, sigY, margin + 180, sigY);
  doc.line(margin + 230, sigY, margin + 380, sigY);
  doc.setFontSize(8);
  doc.setTextColor(130);
  doc.text("Signature", margin, sigY + 10);
  doc.text("Date", margin + 230, sigY + 10);

  // Pre-fill name if available
  if (settings?.driver) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text(settings.driver, margin, sigY - 6);
  }

  const blob     = doc.output("blob");
  const filename = `Vehicle-Inspection-${checkDate}-${ref}.pdf`;
  return { blob, filename, ref };
}
