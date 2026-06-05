// ═══════════════════════════════════════════════════════════════════════════
// NotesExport.jsx
// ───────────────────────────────────────────────────────────────────────────
// Export selected field notes to PDF (detailed report) or Excel (strategy
// workbook with filters, conditional formatting, hyperlinked photos).
// Designed for client deliverables and internal strategy sessions.
// ═══════════════════════════════════════════════════════════════════════════

import jsPDF from "jspdf";
import "jspdf-autotable";
import ExcelJS from "exceljs";

const BRAND = {
  primary:   "#8B1A1A",
  primaryHex: 0x8B1A1A,
  light:     "#F7F3F3",
  text:      "#0F172A",
  textHex:   0x0F172A,
};

const URGENCY_COLORS = {
  Critical: { hex: "FFEEEE", text: "B91C1C" },
  Urgent:   { hex: "FFF5EB", text: "C2410C" },
  Normal:   { hex: "F8FAFC", text: "475569" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().slice(0, 10); }

function smartDate(ds) {
  if (!ds) return "";
  try {
    const d = new Date(ds.length === 10 ? ds + "T12:00:00" : ds);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return ds; }
}

function fileSafe(name) {
  return name.replace(/[^a-z0-9\-_]/gi, "_").slice(0, 60);
}

function autoFilename(prefix, count, customName) {
  const base = customName ? fileSafe(customName) : `PowerMate_Notes_${todayISO()}_${count}items`;
  return base;
}

// Convert a Supabase image URL to base64 data URL for embedding
async function imageUrlToBase64(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Image fetch failed:", url, e);
    return null;
  }
}

// Get image dimensions from a data URL (returns {w, h})
function getImageDims(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 200, h: 150 });
    img.src = dataUrl;
  });
}

// ─── PDF Export ──────────────────────────────────────────────────────────────
export async function exportNotesPDF(selectedNotes, options = {}) {
  const { customName = null, onProgress = () => {} } = options;

  if (!selectedNotes || selectedNotes.length === 0) {
    throw new Error("No notes selected");
  }

  onProgress({ step: "init", percent: 5 });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth  = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin     = 15;
  const contentW   = pageWidth - margin * 2;

  // ── Cover page ──
  doc.setFillColor(BRAND.primary);
  doc.rect(0, 0, pageWidth, 50, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Field Notes Report", margin, 28);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Power Works (Pty) Ltd", margin, 38);

  doc.setTextColor(BRAND.text);
  doc.setFontSize(10);
  let y = 65;
  doc.text(`Generated: ${smartDate(todayISO())}`, margin, y); y += 6;
  doc.text(`Total notes: ${selectedNotes.length}`, margin, y); y += 6;

  const critical = selectedNotes.filter(n => n.urgency === "Critical").length;
  const urgent   = selectedNotes.filter(n => n.urgency === "Urgent").length;
  const resolved = selectedNotes.filter(n => n.resolved).length;
  doc.text(`Critical: ${critical}   Urgent: ${urgent}   Resolved: ${resolved}`, margin, y);
  y += 14;

  // Summary table on cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Summary by Client", margin, y); y += 4;

  const byClient = {};
  selectedNotes.forEach(n => {
    const k = n.client || "General";
    if (!byClient[k]) byClient[k] = { total: 0, critical: 0, unresolved: 0 };
    byClient[k].total++;
    if (n.urgency === "Critical") byClient[k].critical++;
    if (!n.resolved) byClient[k].unresolved++;
  });

  doc.autoTable({
    startY: y + 2,
    head: [["Client", "Notes", "Critical", "Unresolved"]],
    body: Object.entries(byClient).map(([client, stats]) => [
      client, stats.total, stats.critical, stats.unresolved
    ]),
    theme: "grid",
    headStyles: { fillColor: [139, 26, 26], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: margin, right: margin },
  });

  onProgress({ step: "cover", percent: 15 });

  // ── Per-note pages ──
  const totalNotes = selectedNotes.length;
  for (let i = 0; i < totalNotes; i++) {
    const n = selectedNotes[i];
    doc.addPage();
    let cursorY = margin;

    // Header bar with urgency color
    const urgColor = n.urgency === "Critical" ? [220, 38, 38]
                   : n.urgency === "Urgent"   ? [234, 88, 12]
                   : [100, 116, 139];
    doc.setFillColor(...urgColor);
    doc.rect(0, 0, pageWidth, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${(n.urgency || "Normal").toUpperCase()}${n.resolved ? " · RESOLVED" : ""}`, margin, 8);
    doc.text(`Note ${i + 1} of ${totalNotes}`, pageWidth - margin, 8, { align: "right" });

    cursorY = 22;
    doc.setTextColor(BRAND.text);

    // Client name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(n.client || "General Note", margin, cursorY);
    cursorY += 8;

    // Meta line
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 130);
    const created = n.created_at ? new Date(n.created_at).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "Date unknown";
    doc.text(`Created: ${created}`, margin, cursorY);
    if (n.resolve_by) {
      doc.text(`Resolve by: ${smartDate(n.resolve_by)}`, margin + 70, cursorY);
    }
    if (n.resolved && n.resolved_at) {
      doc.text(`Resolved: ${smartDate(n.resolved_at.slice(0, 10))}`, margin + 130, cursorY);
    }
    cursorY += 8;

    // Note body
    doc.setTextColor(BRAND.text);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const noteLines = doc.splitTextToSize(n.note || "(empty)", contentW);
    doc.text(noteLines, margin, cursorY);
    cursorY += noteLines.length * 5.5 + 6;

    // Photos
    const photos = (n.media || []).filter(m => m.url && m.type !== "video");
    const videos = (n.media || []).filter(m => m.url && m.type === "video");

    if (photos.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(BRAND.text);
      doc.text(`Photos (${photos.length})`, margin, cursorY);
      cursorY += 5;

      // Layout photos 2 per row, ~80mm wide
      const photoW = 85;
      const photoMaxH = 60;
      const gap = 5;
      let col = 0;

      for (const photo of photos) {
        const dataUrl = await imageUrlToBase64(photo.url);
        if (!dataUrl) {
          // Show URL as fallback link
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(0, 100, 200);
          doc.textWithLink("[Photo unavailable — click for original]", margin, cursorY, { url: photo.url });
          cursorY += 5;
          continue;
        }

        // Get dimensions to preserve aspect ratio
        const dims = await getImageDims(dataUrl);
        const ratio = dims.w / dims.h;
        let renderW = photoW;
        let renderH = photoW / ratio;
        if (renderH > photoMaxH) {
          renderH = photoMaxH;
          renderW = photoMaxH * ratio;
        }

        const x = margin + col * (photoW + gap);

        // Page-break check
        if (cursorY + renderH > pageHeight - 15) {
          doc.addPage();
          cursorY = margin;
        }

        try {
          doc.addImage(dataUrl, "JPEG", x, cursorY, renderW, renderH, undefined, "FAST");
        } catch (e) {
          console.warn("addImage failed:", e);
        }

        col++;
        if (col >= 2) {
          col = 0;
          cursorY += renderH + gap;
        }
      }
      if (col > 0) cursorY += 65; // close out partial row
      cursorY += 4;
    }

    if (videos.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(BRAND.text);
      doc.text(`Videos (${videos.length})`, margin, cursorY);
      cursorY += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      videos.forEach((v, vi) => {
        if (cursorY > pageHeight - 20) { doc.addPage(); cursorY = margin; }
        doc.setTextColor(0, 100, 200);
        doc.textWithLink(`▶ Video ${vi + 1} — click to view`, margin, cursorY, { url: v.url });
        cursorY += 5;
      });
    }

    // Footer
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 190);
    doc.text(`PowerMate · Power Works (Pty) Ltd · Generated ${smartDate(todayISO())}`, pageWidth / 2, pageHeight - 8, { align: "center" });

    onProgress({ step: "page", percent: 15 + Math.round((i + 1) / totalNotes * 75) });
  }

  onProgress({ step: "save", percent: 95 });
  const fname = autoFilename("Notes", selectedNotes.length, customName) + ".pdf";
  doc.save(fname);
  onProgress({ step: "done", percent: 100 });
  return fname;
}

// ─── Excel Export ────────────────────────────────────────────────────────────
export async function exportNotesExcel(selectedNotes, options = {}) {
  const { customName = null, onProgress = () => {} } = options;

  if (!selectedNotes || selectedNotes.length === 0) {
    throw new Error("No notes selected");
  }

  onProgress({ step: "init", percent: 10 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "PowerMate";
  wb.lastModifiedBy = "Power Works";
  wb.created = new Date();
  wb.modified = new Date();

  // ── Sheet 1: Notes (the strategy session sheet) ──
  const ws = wb.addWorksheet("Field Notes", {
    properties: { defaultColWidth: 18 },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Define columns
  ws.columns = [
    { header: "Client",        key: "client",     width: 22 },
    { header: "Urgency",       key: "urgency",    width: 12 },
    { header: "Status",        key: "status",     width: 12 },
    { header: "Created",       key: "created",    width: 18 },
    { header: "Resolve By",    key: "resolve_by", width: 14 },
    { header: "Note",          key: "note",       width: 60 },
    { header: "Photos",        key: "photos",     width: 14 },
    { header: "Videos",        key: "videos",     width: 14 },
    { header: "Photo Links",   key: "photo_urls", width: 50 },
  ];

  // Header row styling
  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B1A1A" } };
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border    = { bottom: { style: "thin", color: { argb: "FF000000" } } };
  });

  // Sort: critical first, then urgent, then by date desc
  const urgencyRank = { Critical: 0, Urgent: 1, Normal: 2 };
  const sorted = [...selectedNotes].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    const ar = urgencyRank[a.urgency || "Normal"] ?? 2;
    const br = urgencyRank[b.urgency || "Normal"] ?? 2;
    if (ar !== br) return ar - br;
    return (b.created_at || "").localeCompare(a.created_at || "");
  });

  // Add rows
  sorted.forEach((n) => {
    const photos = (n.media || []).filter(m => m.url && m.type !== "video");
    const videos = (n.media || []).filter(m => m.url && m.type === "video");

    const row = ws.addRow({
      client:     n.client || "General",
      urgency:    n.urgency || "Normal",
      status:     n.resolved ? "Resolved" : "Open",
      created:    n.created_at ? new Date(n.created_at) : null,
      resolve_by: n.resolve_by ? new Date(n.resolve_by + "T12:00:00") : null,
      note:       n.note || "",
      photos:     photos.length,
      videos:     videos.length,
      photo_urls: photos.map((p, i) => `Photo ${i + 1}: ${p.url}`).join(" | "),
    });

    // Style based on urgency
    const urg = URGENCY_COLORS[n.urgency || "Normal"] || URGENCY_COLORS.Normal;

    row.height = 32;
    row.alignment = { vertical: "top", wrapText: true };

    // Urgency cell highlight
    const urgencyCell = row.getCell("urgency");
    urgencyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + urg.hex } };
    urgencyCell.font = { bold: true, color: { argb: "FF" + urg.text } };
    urgencyCell.alignment = { vertical: "middle", horizontal: "center" };

    // Status cell (resolved = green, open = neutral)
    const statusCell = row.getCell("status");
    if (n.resolved) {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7F8EC" } };
      statusCell.font = { color: { argb: "FF166534" } };
      // Strikethrough on the note text if resolved
      row.getCell("note").font = { color: { argb: "FF94A3B8" }, italic: true, strike: true };
    } else {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      statusCell.font = { color: { argb: "FF475569" } };
    }
    statusCell.alignment = { vertical: "middle", horizontal: "center" };

    // Date formatting
    row.getCell("created").numFmt = "dd-mmm-yyyy hh:mm";
    row.getCell("resolve_by").numFmt = "dd-mmm-yyyy";

    // Photo count cell
    const photoCell = row.getCell("photos");
    photoCell.alignment = { vertical: "middle", horizontal: "center" };
    if (photos.length > 0) photoCell.font = { bold: true };

    // Make photo_urls a multi-line cell
    row.getCell("photo_urls").alignment = { vertical: "top", wrapText: true };
    row.getCell("photo_urls").font = { size: 9, color: { argb: "FF0E7490" } };

    // Borders on every cell
    row.eachCell((cell) => {
      cell.border = {
        top:    { style: "hair", color: { argb: "FFE2E8F0" } },
        bottom: { style: "hair", color: { argb: "FFE2E8F0" } },
        left:   { style: "hair", color: { argb: "FFE2E8F0" } },
        right:  { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // Enable autofilter on header row
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: ws.columns.length },
  };

  onProgress({ step: "data", percent: 50 });

  // ── Sheet 2: Summary ──
  const sum = wb.addWorksheet("Summary", {
    properties: { defaultColWidth: 20 },
  });

  sum.mergeCells("A1:D1");
  const titleCell = sum.getCell("A1");
  titleCell.value = "Field Notes Strategy Workbook";
  titleCell.font = { bold: true, size: 16, color: { argb: "FF8B1A1A" } };
  titleCell.alignment = { horizontal: "left", vertical: "middle" };
  sum.getRow(1).height = 32;

  sum.getCell("A3").value = "Generated";
  sum.getCell("A3").font = { bold: true };
  sum.getCell("B3").value = new Date();
  sum.getCell("B3").numFmt = "dd-mmm-yyyy hh:mm";

  sum.getCell("A4").value = "Total notes";
  sum.getCell("A4").font = { bold: true };
  sum.getCell("B4").value = selectedNotes.length;

  sum.getCell("A5").value = "Critical";
  sum.getCell("A5").font = { bold: true };
  sum.getCell("B5").value = selectedNotes.filter(n => n.urgency === "Critical").length;
  sum.getCell("B5").font = { color: { argb: "FFB91C1C" }, bold: true };

  sum.getCell("A6").value = "Urgent";
  sum.getCell("A6").font = { bold: true };
  sum.getCell("B6").value = selectedNotes.filter(n => n.urgency === "Urgent").length;
  sum.getCell("B6").font = { color: { argb: "FFC2410C" }, bold: true };

  sum.getCell("A7").value = "Unresolved";
  sum.getCell("A7").font = { bold: true };
  sum.getCell("B7").value = selectedNotes.filter(n => !n.resolved).length;

  sum.getCell("A8").value = "Resolved";
  sum.getCell("A8").font = { bold: true };
  sum.getCell("B8").value = selectedNotes.filter(n => n.resolved).length;
  sum.getCell("B8").font = { color: { argb: "FF166534" } };

  // By-client breakdown
  sum.getCell("A10").value = "By Client";
  sum.getCell("A10").font = { bold: true, size: 12 };

  const headerRow = sum.getRow(11);
  headerRow.values = [null, "Client", "Total", "Critical", "Unresolved"];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8B1A1A" } };
  });

  const byClientMap = {};
  selectedNotes.forEach(n => {
    const k = n.client || "General";
    if (!byClientMap[k]) byClientMap[k] = { total: 0, critical: 0, unresolved: 0 };
    byClientMap[k].total++;
    if (n.urgency === "Critical") byClientMap[k].critical++;
    if (!n.resolved) byClientMap[k].unresolved++;
  });

  let rowIdx = 12;
  Object.entries(byClientMap).sort((a, b) => b[1].total - a[1].total).forEach(([client, stats]) => {
    sum.getRow(rowIdx).values = [null, client, stats.total, stats.critical, stats.unresolved];
    rowIdx++;
  });

  onProgress({ step: "summary", percent: 80 });

  // ── Save ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fname = autoFilename("Notes", selectedNotes.length, customName) + ".xlsx";
  a.download = fname;
  a.click();
  URL.revokeObjectURL(url);

  onProgress({ step: "done", percent: 100 });
  return fname;
}
