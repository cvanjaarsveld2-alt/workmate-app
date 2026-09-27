// ─── Filled-in form → PDF ─────────────────────────────────────────────────────
// Company header, what the form was for (job, machine, customer), every
// answer (a "No" on a check stands out), and the signature.
import { answerText, failedChecks } from "./forms.js";

const hexToRgb = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  const n = m ? parseInt(m[1], 16) : 0x8b1a1a;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const fmt = iso =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

export async function buildFormPDF(sub, { profile = {}, job = null, equipment = null, client = null, filledBy = "" } = {}) {
  const jspdfModule = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const JsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const autoTable = autoTableModule.autoTable || autoTableModule.default;
  const pdf = new JsPDF({ unit: "mm", format: "a4", compress: true });
  const W = pdf.internal.pageSize.getWidth(),
    M = 15;
  const brand = hexToRgb(profile.brand_color);
  pdf.setFillColor(...brand);
  pdf.rect(0, 0, W, 8, "F");
  if (profile.logo_data) {
    try {
      const p = pdf.getImageProperties(profile.logo_data);
      const s = Math.min(45 / p.width, 18 / p.height);
      pdf.addImage(profile.logo_data, p.fileType || "PNG", M, 12, p.width * s, p.height * s);
    } catch {
      // No logo in the PDF rather than no PDF.
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(90, 90, 90);
  pdf.text(profile.trading_name || profile.legal_name || "", W - M, 16, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.text([profile.phone, profile.email].filter(Boolean).join("  ·  "), W - M, 21, { align: "right" });
  let y = 38;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(20, 20, 20);
  pdf.text(sub.template_name, M, y);
  y += 7;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(70, 70, 70);
  const meta = [
    client ? `Customer: ${client.company || client.contact || ""}` : "",
    job ? `Job: ${[job.job_number, job.title].filter(Boolean).join(" · ")}` : "",
    equipment ? `Machine: ${[equipment.name, equipment.make, equipment.model, equipment.serial ? `S/N ${equipment.serial}` : ""].filter(Boolean).join(" · ")}` : "",
    `Filled in ${fmt(sub.filled_at)}${filledBy ? ` by ${filledBy}` : ""}`,
  ].filter(Boolean);
  for (const line of meta) {
    pdf.text(line, M, y);
    y += 5;
  }
  const fails = failedChecks(sub.fields, sub.answers);
  if (fails.length) {
    y += 2;
    pdf.setTextColor(185, 28, 28);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${fails.length} check${fails.length === 1 ? "" : "s"} answered "No"`, M, y);
    y += 3;
  }
  const rows = [];
  for (const f of sub.fields || []) {
    if (f.type === "heading") rows.push([{ content: f.label, colSpan: 2, styles: { fontStyle: "bold", fillColor: [245, 243, 243] } }]);
    else rows.push([f.label, answerText(f, sub.answers?.[f.id])]);
  }
  autoTable(pdf, {
    startY: y + 3,
    margin: { left: M, right: M },
    head: [["Question", "Answer"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.2, textColor: [30, 30, 30] },
    headStyles: { fillColor: brand, textColor: 255 },
    columnStyles: { 0: { cellWidth: 110 } },
    didParseCell: d => {
      if (d.section === "body" && d.column.index === 1 && d.cell.raw === "No") {
        d.cell.styles.textColor = [185, 28, 28];
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = pdf.lastAutoTable.finalY + 10;
  if (sub.signature) {
    if (y > 250) {
      pdf.addPage();
      y = 20;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    pdf.text("Signed", M, y);
    try {
      pdf.addImage(sub.signature, "PNG", M, y + 2, 60, 22);
    } catch {
      // Unreadable signature image: the name below still shows.
    }
    pdf.setFont("helvetica", "normal");
    pdf.text(sub.signed_by || "", M, y + 29);
  }
  const name = `${sub.template_name} ${String(sub.filled_at || "").slice(0, 10)}`.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
  return { blob: pdf.output("blob"), filename: `${name}.pdf` };
}
