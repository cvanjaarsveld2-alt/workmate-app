// ─── Company branding on PDFs ─────────────────────────────────────────────────
// Reports (notes, expenses, vehicle checks, breakdown/repair) print the
// signed-in company's logo and name from its company profile, not a fixed one.
import { activeProfile, companyLegalName } from "./companyProfile";

// Logo on a small white panel at the right of a coloured header band, so any
// logo reads well on it. No logo → the company name in white.
export function drawBandLogo(doc, { right, top, maxW, maxH, profile = activeProfile() }) {
  if (profile.logo_data) {
    try {
      const p = doc.getImageProperties(profile.logo_data);
      const s = Math.min(maxW / p.width, maxH / p.height);
      const w = p.width * s,
        h = p.height * s,
        pad = maxH * 0.22;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(right - w - pad * 2, top - pad, w + pad * 2, h + pad * 2, pad, pad, "F");
      doc.addImage(profile.logo_data, p.fileType || "PNG", right - w - pad, top, w, h);
      return true;
    } catch {}
  }
  const name = companyLegalName(profile);
  if (name) {
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(Math.max(9, Math.min(16, maxH * 0.6)));
    doc.text(name, right, top + maxH * 0.7, { align: "right" });
  }
  return false;
}

// For HTML exports (Word/print): an <img> tag, or the company name.
export function htmlBandLogo(profile = activeProfile()) {
  const esc = s => String(s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return profile.logo_data
    ? `<span style="display:inline-block;background:#fff;padding:4px 8px;border-radius:4px;"><img src="${profile.logo_data}" style="height:30px;" /></span>`
    : `<span style="color:#fff;font-weight:bold;">${esc(companyLegalName(profile))}</span>`;
}
