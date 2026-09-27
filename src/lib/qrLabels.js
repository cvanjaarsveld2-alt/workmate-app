// ─── QR labels for machines ───────────────────────────────────────────────────
// Each label's QR code opens the machine in the app (/?equipment=ID): its
// history, forms, and "log a breakdown". Sign-in still applies, so a label
// found by a stranger shows nothing. Printed 2 across on A4 (sticker paper or
// laminated).
export const equipmentUrl = (origin, id) => `${String(origin).replace(/\/$/, "")}/?equipment=${id}`;

export function equipmentIdFromUrl(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    const id = new URLSearchParams(search).get("equipment") || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function buildQrLabelsPDF(items, { origin, profile = {} }) {
  const QR = (await import("qrcode")).default;
  const jspdfModule = await import("jspdf");
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const pdf = new JsPDF({ unit: "mm", format: "a4" });
  const W = 210,
    cols = 2,
    labelW = 90,
    labelH = 55,
    gapX = 10,
    top = 12,
    left = (W - cols * labelW - gapX) / 2,
    perPage = 5 * cols;
  const company = profile.trading_name || profile.legal_name || "";
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    if (i > 0 && i % perPage === 0) pdf.addPage();
    const n = i % perPage,
      x = left + (n % cols) * (labelW + gapX),
      y = top + Math.floor(n / cols) * labelH;
    pdf.setDrawColor(200, 200, 200);
    pdf.roundedRect(x, y, labelW, labelH - 4, 2, 2);
    const png = await QR.toDataURL(equipmentUrl(origin, e.id), { margin: 1, width: 300, errorCorrectionLevel: "M" });
    pdf.addImage(png, "PNG", x + 3, y + 3, 44, 44);
    const tx = x + 50;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(20, 20, 20);
    pdf.text(pdf.splitTextToSize(e.name || "Machine", 37).slice(0, 2), tx, y + 9);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(80, 80, 80);
    const lines = [[e.make, e.model].filter(Boolean).join(" "), e.serial ? `S/N ${e.serial}` : "", e.client || ""].filter(Boolean);
    pdf.text(pdf.splitTextToSize(lines.join("\n"), 37).slice(0, 4), tx, y + 20);
    pdf.setFontSize(7);
    pdf.text(pdf.splitTextToSize(`Scan for history or to report a fault${company ? `\n${company}` : ""}${profile.phone ? `  ${profile.phone}` : ""}`, 37), tx, y + 38);
  }
  return pdf.output("blob");
}
