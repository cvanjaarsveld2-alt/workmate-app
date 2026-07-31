// ─── Breakdown / Repair Report Export ────────────────────────────────────────
// Generates professional PDF and Word documents for breakdown & repair reports,
// matching the Power Works house style: red header band, PW logo top-right,
// per-item sections with photos, faults/actions, and notes.
//
//   buildReportPDF({ report, mode, company })  -> { blob, filename }
//   buildReportWord({ report, mode, company }) -> { blob, filename }
//
// Word export uses Word-compatible HTML (.doc) — opens natively in MS Word with
// embedded images. No extra npm dependency required.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import { PW_LOGO_B64 } from "./pwLogo";

const BRAND_RED = "#8B1A1A";
const RED_RGB   = [139, 26, 26];
const DARK_RGB  = [30, 30, 30];
const GREY_RGB  = [120, 120, 120];
const LIGHT_RGB = [245, 243, 243];

const SEVERITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };
const STATUS_LABEL   = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

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
function ref(mode) {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  const prefix = mode === "repair" ? "REP" : "BRK";
  return `${prefix}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Normalise item photos to an array of { url }
function itemPhotos(it) {
  if (Array.isArray(it.photos)) return it.photos.filter(p => p.url);
  if (it.photo_url) return [{ url: it.photo_url }];
  return [];
}

// Fetch an image URL → base64 data URL (for embedding). Returns null on failure.
async function fetchImageAsDataURL(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Get natural dimensions of a data URL image
function imageDims(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = dataUrl;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export async function buildReportPDF({ report, mode = "breakdown", company = {} }) {
  const isRepair = mode === "repair";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const reportRef = ref(mode);

  // Pre-fetch all photos as data URLs (so we can embed them)
  const items = Array.isArray(report.items) ? report.items : [];
  const photoCache = {};
  for (const it of items) {
    for (const p of itemPhotos(it)) {
      if (!photoCache[p.url]) {
        const dataUrl = await fetchImageAsDataURL(p.url);
        if (dataUrl) {
          const dims = await imageDims(dataUrl);
          photoCache[p.url] = { dataUrl, ...dims };
        }
      }
    }
  }

  // ── Header band ──
  function drawHeader(title) {
    doc.setFillColor(...RED_RGB);
    doc.rect(0, 0, pageWidth, 80, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(title, margin, 50);
    try {
      doc.addImage(PW_LOGO_B64, "JPEG", pageWidth - margin - 110, 10, 110, 23);
    } catch {
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      doc.text("Power Works (Pty) Ltd", pageWidth - margin - 140, 30);
    }
  }

  const headerTitle = isRepair ? "REPAIR REPORT" : "BREAKDOWN REPORT";
  drawHeader(headerTitle);

  doc.setTextColor(...DARK_RGB);

  // ── Meta block ──
  let y = 105;
  const col1 = margin, col2 = margin + 175, col3 = margin + 350;

  function metaField(label, value, x, yy) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREY_RGB);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK_RGB);
    const lines = doc.splitTextToSize(String(value || "—"), 165);
    doc.text(lines, x, yy + 14);
    return yy + 14 + lines.length * 12;
  }

  metaField("Title", report.title || "—", col1, y);
  metaField("Report date", shortDate(report.report_date), col3, y);
  y += 40;
  metaField("Equipment / Vehicle", report.equipment || "—", col1, y);
  metaField("Reference", report.reference || reportRef, col2, y);
  metaField("Location", report.location || "—", col3, y);
  y += 40;
  metaField("Client / Site", report.client_name || "—", col1, y);
  if (isRepair) {
    metaField("Status", "Repaired", col2, y);
  } else {
    metaField("Severity", SEVERITY_LABEL[report.severity] || "—", col2, y);
    metaField("Status", STATUS_LABEL[report.status] || "—", col3, y);
  }
  y += 42;

  // ── Divider ──
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // ── Items ──
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED_RGB);
  doc.text(isRepair ? "Repair Items" : "Inspection Items", margin, y);
  y += 8;

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const photos = itemPhotos(it);

    // Estimate needed height, page-break if necessary
    const estHeight = 90 + (photos.length > 0 ? 120 : 0);
    if (y + estHeight > pageHeight - 60) {
      doc.addPage();
      drawHeader(headerTitle);
      y = 100;
    }

    y += 16;

    // Item heading
    doc.setFontSize(11.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK_RGB);
    const heading = it.heading || `${isRepair ? "Repair" : "Item"} ${idx + 1}`;
    doc.text(`${idx + 1}. ${heading}`, margin, y);
    y += 6;

    // Underline accent
    doc.setDrawColor(...RED_RGB);
    doc.setLineWidth(1.5);
    doc.line(margin, y, margin + 40, y);
    y += 14;

    // Photos row
    if (photos.length > 0) {
      const photoH = 100;
      const gap = 10;
      let px = margin;
      const maxRowW = pageWidth - 2 * margin;
      for (const p of photos) {
        const cached = photoCache[p.url];
        if (!cached) continue;
        const aspect = cached.w / cached.h || 4 / 3;
        const photoW = Math.min(photoH * aspect, 150);
        if (px + photoW > margin + maxRowW) {
          // wrap to next row
          px = margin;
          y += photoH + gap;
          if (y + photoH > pageHeight - 60) {
            doc.addPage();
            drawHeader(headerTitle);
            y = 100;
          }
        }
        try {
          doc.addImage(cached.dataUrl, "JPEG", px, y, photoW, photoH, undefined, "FAST");
          doc.setDrawColor(210, 210, 210);
          doc.setLineWidth(0.5);
          doc.rect(px, y, photoW, photoH);
        } catch { /* skip broken image */ }
        px += photoW + gap;
      }
      y += photoH + 14;
    }

    // Faults (breakdown) or Action (repair)
    if (!isRepair && (it.faults || []).length > 0) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY_RGB);
      doc.text("FAULTS IDENTIFIED", margin, y);
      y += 12;
      // Fault chips as a wrapped list
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...RED_RGB);
      const faultText = it.faults.join("  •  ");
      const faultLines = doc.splitTextToSize(faultText, pageWidth - 2 * margin);
      doc.text(faultLines, margin, y);
      y += faultLines.length * 12 + 8;
    }

    if (isRepair && it.action) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY_RGB);
      doc.text("WORK DONE", margin, y);
      y += 12;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DARK_RGB);
      const actionLines = doc.splitTextToSize(it.action, pageWidth - 2 * margin);
      doc.text(actionLines, margin, y);
      y += actionLines.length * 12 + 8;
    }

    // Note
    if (it.note) {
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY_RGB);
      doc.text("NOTE", margin, y);
      y += 12;
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(80, 80, 80);
      const noteLines = doc.splitTextToSize(it.note, pageWidth - 2 * margin);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 11 + 6;
    }

    // Item divider
    doc.setDrawColor(235, 235, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;
  }

  // ── Overall summary ──
  if (report.summary) {
    if (y + 80 > pageHeight - 60) {
      doc.addPage();
      drawHeader(headerTitle);
      y = 100;
    }
    y += 18;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...RED_RGB);
    doc.text(isRepair ? "Summary" : "Summary / Recommendation", margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK_RGB);
    const sumLines = doc.splitTextToSize(report.summary, pageWidth - 2 * margin);
    doc.text(sumLines, margin, y);
    y += sumLines.length * 12 + 10;
  }

  // ── Signature block ──
  if (y + 90 > pageHeight - 40) {
    doc.addPage();
    drawHeader(headerTitle);
    y = 100;
  }
  y += 30;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + 180, y);
  doc.line(margin + 240, y, margin + 380, y);
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text("Signature", margin, y + 12);
  doc.text("Date", margin + 240, y + 12);

  // ── Footer on every page ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Power Works (Pty) Ltd  ·  ${reportRef}  ·  Generated ${shortDate(new Date().toISOString().slice(0, 10))}`,
      margin, pageHeight - 20
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin - 60, pageHeight - 20);
  }

  const blob = doc.output("blob");
  const safeTitle = (report.title || headerTitle).replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  const filename = `${isRepair ? "Repair" : "Breakdown"}-${safeTitle}-${reportRef}.pdf`;
  return { blob, filename, ref: reportRef };
}

// ═══════════════════════════════════════════════════════════════════════════
// WORD EXPORT (Word-compatible HTML .doc)
// ═══════════════════════════════════════════════════════════════════════════
export async function buildReportWord({ report, mode = "breakdown", company = {} }) {
  const isRepair = mode === "repair";
  const reportRef = ref(mode);
  const headerTitle = isRepair ? "REPAIR REPORT" : "BREAKDOWN REPORT";
  const items = Array.isArray(report.items) ? report.items : [];

  // Pre-fetch photos as data URLs so they embed in the .doc
  const photoCache = {};
  for (const it of items) {
    for (const p of itemPhotos(it)) {
      if (!photoCache[p.url]) {
        photoCache[p.url] = await fetchImageAsDataURL(p.url);
      }
    }
  }

  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const metaRows = [
    ["Title", report.title || "—"],
    ["Equipment / Vehicle", report.equipment || "—"],
    ["Reference", report.reference || reportRef],
    ["Location", report.location || "—"],
    ["Client / Site", report.client_name || "—"],
    ["Report date", shortDate(report.report_date)],
    isRepair
      ? ["Status", "Repaired"]
      : ["Severity", SEVERITY_LABEL[report.severity] || "—"],
  ];
  if (!isRepair) metaRows.push(["Status", STATUS_LABEL[report.status] || "—"]);

  const metaHTML = metaRows.map(([k, v]) => `
    <tr>
      <td style="padding:4px 12px 4px 0;color:#787878;font-size:9pt;font-weight:bold;width:150px;vertical-align:top;">${esc(k).toUpperCase()}</td>
      <td style="padding:4px 0;color:#1e1e1e;font-size:10.5pt;">${esc(v)}</td>
    </tr>`).join("");

  const itemsHTML = items.map((it, idx) => {
    const photos = itemPhotos(it);
    const heading = it.heading || `${isRepair ? "Repair" : "Item"} ${idx + 1}`;

    const photosHTML = photos.length > 0 ? `
      <div style="margin:8px 0;">
        ${photos.map(p => {
          const src = photoCache[p.url];
          if (!src) return "";
          return `<img src="${src}" style="height:140px;margin:0 8px 8px 0;border:1px solid #d2d2d2;" />`;
        }).join("")}
      </div>` : "";

    let detailHTML = "";
    if (!isRepair && (it.faults || []).length > 0) {
      detailHTML += `
        <p style="margin:6px 0 2px;color:#787878;font-size:8.5pt;font-weight:bold;">FAULTS IDENTIFIED</p>
        <p style="margin:0 0 8px;color:#8B1A1A;font-size:10pt;">${it.faults.map(esc).join("  •  ")}</p>`;
    }
    if (isRepair && it.action) {
      detailHTML += `
        <p style="margin:6px 0 2px;color:#787878;font-size:8.5pt;font-weight:bold;">WORK DONE</p>
        <p style="margin:0 0 8px;color:#1e1e1e;font-size:10pt;">${esc(it.action)}</p>`;
    }
    if (it.note) {
      detailHTML += `
        <p style="margin:6px 0 2px;color:#787878;font-size:8.5pt;font-weight:bold;">NOTE</p>
        <p style="margin:0 0 8px;color:#505050;font-size:9.5pt;font-style:italic;">${esc(it.note)}</p>`;
    }

    return `
      <div style="margin:0 0 18px;padding:0 0 12px;border-bottom:1px solid #ebebeb;">
        <p style="margin:0 0 2px;color:#1e1e1e;font-size:11.5pt;font-weight:bold;">${idx + 1}. ${esc(heading)}</p>
        <div style="width:40px;height:2px;background:#8B1A1A;margin:0 0 8px;"></div>
        ${photosHTML}
        ${detailHTML}
      </div>`;
  }).join("");

  const summaryHTML = report.summary ? `
    <h2 style="color:#8B1A1A;font-size:13pt;margin:18px 0 8px;">${isRepair ? "Summary" : "Summary / Recommendation"}</h2>
    <p style="color:#1e1e1e;font-size:10pt;line-height:1.5;">${esc(report.summary)}</p>` : "";

  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${esc(report.title || headerTitle)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: Calibri, Arial, sans-serif; color:#1e1e1e; }
</style>
</head>
<body>
  <table style="width:100%;background:#8B1A1A;margin:0 0 16px;">
    <tr>
      <td style="padding:16px 20px;">
        <span style="color:#ffffff;font-size:20pt;font-weight:bold;letter-spacing:1px;">${headerTitle}</span>
      </td>
      <td style="padding:12px 20px;text-align:right;">
        <img src="${PW_LOGO_B64}" style="height:34px;" />
      </td>
    </tr>
  </table>

  <table style="width:100%;margin:0 0 12px;border-collapse:collapse;">
    ${metaHTML}
  </table>

  <hr style="border:none;border-top:1px solid #dcdcdc;margin:14px 0;" />

  <h2 style="color:#8B1A1A;font-size:13pt;margin:0 0 10px;">${isRepair ? "Repair Items" : "Inspection Items"}</h2>
  ${itemsHTML}

  ${summaryHTML}

  <table style="width:100%;margin:36px 0 0;">
    <tr>
      <td style="width:45%;border-top:1px solid #b4b4b4;padding-top:4px;color:#828282;font-size:8pt;">Signature</td>
      <td style="width:10%;"></td>
      <td style="width:45%;border-top:1px solid #b4b4b4;padding-top:4px;color:#828282;font-size:8pt;">Date</td>
    </tr>
  </table>

  <p style="margin-top:30px;color:#969696;font-size:7.5pt;">
    Power Works (Pty) Ltd &nbsp;·&nbsp; ${reportRef} &nbsp;·&nbsp; Generated ${shortDate(new Date().toISOString().slice(0, 10))}
  </p>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const safeTitle = (report.title || headerTitle).replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
  const filename = `${isRepair ? "Repair" : "Breakdown"}-${safeTitle}-${reportRef}.doc`;
  return { blob, filename, ref: reportRef };
}
