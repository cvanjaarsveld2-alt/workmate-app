// ─── Customer documents (PDF) ─────────────────────────────────────────────────
// One layout for every document a customer receives: quotation, pro forma
// invoice and (tax) invoice. Company details, logo, colour, bank details and
// terms come from the team's company profile (src/lib/companyProfile.js), so
// each company that uses the app gets its own branded documents.
// Built entirely on the device (jspdf), so it works with no signal.
//
//   const blob = await buildDocumentPDF({ kind: "invoice", number, date, client, items, ... }, profile);
//   await shareDocumentPDF(blob, documentFilename(doc));

export const VAT_RATE = 15;

export const chargesVat = profile => profile?.vat_registered !== false;

export function documentTitle(kind, profile = {}) {
  if (kind === "quote") return "QUOTATION";
  if (kind === "proforma") return "PRO FORMA INVOICE";
  if (kind === "jobcard") return "JOB CARD";
  return chargesVat(profile) && profile.vat_no ? "TAX INVOICE" : "INVOICE";
}

// "R 12 345.67" built by hand: locale formatting can use narrow no-break
// spaces that the PDF's standard fonts can't draw.
export const money = v => {
  const n = Number(v) || 0;
  const [whole, cents] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}R ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${cents}`;
};

// Line totals and VAT. Prices are entered VAT-inclusive or exclusive per document.
export function documentTotals(
  items = [],
  { vatInclusive = true, vatRate = VAT_RATE, amountPaid = 0, vatRegistered = true } = {},
) {
  const gross = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0), 0);
  const r = vatRegistered ? vatRate / 100 : 0;
  const subtotal = vatInclusive ? gross / (1 + r) : gross;
  const vat = vatInclusive ? gross - subtotal : gross * r;
  const total = subtotal + vat;
  const round = n => Math.round(n * 100) / 100;
  return {
    subtotal: round(subtotal),
    vat: round(vat),
    total: round(total),
    paid: round(Number(amountPaid) || 0),
    balance: round(total - (Number(amountPaid) || 0)),
  };
}

export function addDays(isoDate, days) {
  const d = new Date((isoDate || new Date().toISOString().slice(0, 10)) + "T12:00:00");
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

const fmtDate = iso => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
};

const hexToRgb = hex => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [139, 26, 26];
};

export function documentFilename(doc, profile = {}) {
  const title = documentTitle(doc.kind, profile)
    .toLowerCase()
    .replace(/(^|\s)\w/g, c => c.toUpperCase())
    .replace(/\s+/g, "_");
  const safe = s =>
    String(s || "")
      .replace(/[^A-Za-z0-9-]+/g, "_")
      .replace(/^_+|_+$/g, "");
  return [title, safe(doc.number), safe(doc.client?.name)].filter(Boolean).join("_") + ".pdf";
}

export async function buildDocumentPDF(doc, profile = {}) {
  const jspdfModule = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default;
  const autoTable = autoTableModule.autoTable || autoTableModule.default;
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = pdf.internal.pageSize.getWidth(),
    H = pdf.internal.pageSize.getHeight(),
    M = 15,
    FOOT = 16;
  const brand = hexToRgb(profile.brand_color);
  const ink = [30, 30, 30],
    grey = [110, 110, 110];
  const kind = doc.kind || "invoice";
  const title = documentTitle(kind, profile);
  const companyName = profile.trading_name || profile.legal_name || "Your company";
  const text = (s, x, y, opts) => pdf.text(String(s ?? ""), x, y, opts);
  const right = W - M;
  let y = M;

  const ensureSpace = need => {
    if (y + need > H - FOOT - 4) {
      pdf.addPage();
      y = M;
    }
  };

  // ── Cover page (detailed quotes) ──
  if (doc.cover) {
    pdf.setFillColor(...brand);
    pdf.rect(0, 0, W, 10, "F");
    let cy = 45;
    if (profile.logo_data) {
      try {
        const props = pdf.getImageProperties(profile.logo_data);
        const scale = Math.min(110 / props.width, 40 / props.height);
        pdf.addImage(
          profile.logo_data,
          props.fileType || "PNG",
          M,
          cy,
          props.width * scale,
          props.height * scale,
        );
        cy += props.height * scale + 25;
      } catch {
        cy += 10;
      }
    } else {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(...brand);
      text(companyName, M, cy + 10);
      cy += 35;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(...grey);
    text(title, M, cy);
    cy += 10;
    pdf.setFontSize(24);
    pdf.setTextColor(...ink);
    const heading = pdf.splitTextToSize(doc.title || title, right - M);
    text(heading, M, cy);
    cy += heading.length * 10 + 8;
    pdf.setDrawColor(...brand);
    pdf.setLineWidth(1.2);
    pdf.line(M, cy, M + 40, cy);
    cy += 14;
    const cc = doc.client || {};
    const rows = [
      ["Prepared for", [cc.name, cc.contact ? `Attn: ${cc.contact}` : ""].filter(Boolean).join("\n")],
      ["Quote no.", doc.number || ""],
      ["Date", fmtDate(doc.date)],
      doc.validUntil ? ["Valid until", fmtDate(doc.validUntil)] : null,
      doc.preparedBy ? ["Prepared by", doc.preparedBy] : null,
    ].filter(r => r && r[1]);
    for (const [k, v] of rows) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...grey);
      text(k, M, cy);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(...ink);
      const lines = String(v).split("\n");
      text(lines, M + 38, cy);
      cy += 6 + (lines.length - 1) * 5;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(...grey);
    const contact = [
      profile.legal_name || companyName,
      String(profile.address || "").replace(/\s*\n\s*/g, ", "),
      [profile.phone, profile.email, profile.website].filter(Boolean).join("  ·  "),
    ].filter(Boolean);
    contact.forEach((l, i) => text(pdf.splitTextToSize(l, right - M)[0], M, H - FOOT - 18 + i * 4.5));
    pdf.addPage();
    y = M;
  }

  const drawHeader = () => {
    // ── Header: logo left, company details right ──
    let logoH = 0;
    let hasLogo = false;
    if (profile.logo_data) {
      try {
        const props = pdf.getImageProperties(profile.logo_data);
        const scale = Math.min(70 / props.width, 26 / props.height);
        const w = props.width * scale,
          h = props.height * scale;
        pdf.addImage(profile.logo_data, props.fileType || "PNG", M, y, w, h);
        logoH = h;
        hasLogo = true;
      } catch {
        logoH = 0;
      }
    }
    if (!logoH) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.setTextColor(...brand);
      const lines = pdf.splitTextToSize(companyName, 90);
      text(lines, M, y + 6);
      logoH = 6 + lines.length * 6;
    }
    let ry = y + 3;
    // The name is already the big heading when there's no logo.
    if (hasLogo) {
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      text(companyName, right, ry, { align: "right" });
      ry += 4.5;
    }
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...grey);
    const companyLines = [
      profile.legal_name && profile.legal_name !== companyName ? profile.legal_name : "",
      profile.registration_no ? `Reg. No: ${profile.registration_no}` : "",
      chargesVat(profile) && profile.vat_no ? `VAT No: ${profile.vat_no}` : "",
      ...String(profile.address || "")
        .split(/\n/)
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(l => pdf.splitTextToSize(l, 85))
        .slice(0, 5),
      [profile.phone, profile.email].filter(Boolean).join("  ·  "),
      profile.website || "",
    ].filter(Boolean);
    for (const l of companyLines) {
      text(l, right, ry, { align: "right" });
      ry += 3.8;
    }
    y = Math.max(y + logoH, ry) + 3;
    pdf.setDrawColor(...brand);
    pdf.setLineWidth(0.8);
    pdf.line(M, y, right, y);
    y += 9;
  };
  drawHeader();

  // Photos two per row (one photo: wider), captions underneath.
  const drawPhotos = all => {
    const photos = (all || []).filter(p => p && p.data);
    const gap = 6,
      cw = photos.length === 1 ? Math.min(right - M, 125) : (right - M - gap) / 2,
      maxH = photos.length === 1 ? 95 : 68;
    for (let i = 0; i < photos.length; i += photos.length === 1 ? 1 : 2) {
      const row = photos.slice(i, i + (photos.length === 1 ? 1 : 2)).map(p => {
        let props = null;
        try {
          props = pdf.getImageProperties(p.data);
        } catch {}
        const ratio = props ? props.height / props.width : 0.75;
        let w = cw,
          h = cw * ratio;
        if (h > maxH) {
          h = maxH;
          w = h / ratio;
        }
        pdf.setFontSize(8);
        const caption = p.caption ? pdf.splitTextToSize(p.caption, cw) : [];
        return { p, props, w, h, caption };
      });
      const rowH = Math.max(...row.map(r => r.h + (r.caption.length ? 2 + r.caption.length * 3.6 : 0))) + 5;
      ensureSpace(rowH);
      row.forEach((r, j) => {
        const x = M + j * (cw + gap);
        try {
          pdf.addImage(r.p.data, r.props?.fileType || "JPEG", x, y, r.w, r.h);
        } catch {
          pdf.setDrawColor(220, 220, 220);
          pdf.rect(x, y, r.w, r.h);
        }
        if (r.caption.length) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(...grey);
          text(r.caption, x, y + r.h + 4);
        }
      });
      y += rowH;
    }
    if (photos.length < (all || []).length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...grey);
      text("Some photos couldn't be included (not available on this device).", M, y);
      y += 5;
    }
  };

  const section = (heading, body, size = 8.5) => {
    if (!body) return;
    const lines = pdf.splitTextToSize(String(body), right - M);
    ensureSpace(10);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...brand);
    text(heading, M, y);
    y += 4.8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...ink);
    for (const line of lines) {
      ensureSpace(4.2);
      text(line, M, y);
      y += size * 0.45;
    }
    y += 4;
  };

  if (kind !== "jobcard") {
    // ── Title and document details ──
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(...brand);
    text(title, M, y);
    if (doc.draft) {
      pdf.setFontSize(9);
      pdf.setTextColor(200, 120, 0);
      text("DRAFT · number is assigned once synced", right, y, { align: "right" });
    }
    y += 8;
    if (doc.title) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(...ink);
      const lines = pdf.splitTextToSize(doc.title, right - M);
      text(lines, M, y - 1);
      y += lines.length * 5.5 + 2;
    }

    const meta = [
      [
        kind === "quote" ? "Quote no." : kind === "proforma" ? "Pro forma no." : "Invoice no.",
        doc.number || "—",
      ],
      ["Date", fmtDate(doc.date)],
      kind === "quote" && doc.validUntil ? ["Valid until", fmtDate(doc.validUntil)] : null,
      kind !== "quote" && doc.dueDate ? ["Payment due", fmtDate(doc.dueDate)] : null,
      doc.reference ? ["Reference", doc.reference] : null,
      doc.orderNumber ? ["Order no.", doc.orderNumber] : null,
      kind === "quote" && doc.preparedBy ? ["Prepared by", doc.preparedBy] : null,
    ].filter(Boolean);

    const c = doc.client || {};
    const billTo = [
      c.name,
      c.contact ? `Attn: ${c.contact}` : "",
      ...String(c.address || "")
        .split(/\n/)
        .map(s => s.trim())
        .filter(Boolean),
      [c.phone, c.email].filter(Boolean).join("  ·  "),
      c.vat ? `VAT No: ${c.vat}` : "",
    ].filter(Boolean);

    const colW = (right - M) / 2 - 4;
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...grey);
    text(kind === "quote" ? "PREPARED FOR" : "BILL TO", M, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...ink);
    pdf.setFontSize(9.5);
    let ly = y + 5;
    billTo.forEach((l, i) => {
      pdf.setFont("helvetica", i === 0 ? "bold" : "normal");
      const lines = pdf.splitTextToSize(l, colW);
      text(lines, M, ly);
      ly += lines.length * 4.4;
    });
    let my = y;
    const mx = M + colW + 8;
    pdf.setFontSize(9);
    for (const [k, v] of meta) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...grey);
      text(k, mx, my);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...ink);
      text(v, right, my, { align: "right" });
      my += 5;
    }
    y = Math.max(ly, my) + 4;

    // ── Introduction / scope (optional) ──
    if (doc.intro) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(...ink);
      for (const line of pdf.splitTextToSize(doc.intro, right - M)) {
        ensureSpace(5);
        text(line, M, y);
        y += 4.4;
      }
      y += 3;
    }

    // ── Write-up sections with photos (detailed quotes) ──
    const sections = (doc.sections || []).filter(sec => sec && (sec.title || sec.body || sec.photos?.length));
    for (const sec of sections) {
      ensureSpace(16);
      if (sec.title) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11.5);
        pdf.setTextColor(...brand);
        text(sec.title, M, y);
        y += 6;
      }
      if (sec.body) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(...ink);
        for (const line of pdf.splitTextToSize(sec.body, right - M)) {
          ensureSpace(5);
          text(line, M, y);
          y += 4.4;
        }
        y += 2;
      }
      drawPhotos(sec.photos || []);
      y += 3;
    }
    if (sections.length) {
      ensureSpace(24);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11.5);
      pdf.setTextColor(...brand);
      text("Pricing", M, y);
      y += 4;
    }

    // ── Line items ──
    const items = (doc.items || []).filter(i => i && (i.description || Number(i.unitPrice)));
    // A code column only when some line carries a part number.
    const codes = items.some(i => i.code);
    autoTable(pdf, {
      startY: y,
      head: [codes ? ["#", "Code", "Description", "Qty", "Unit price", "Amount"] : ["#", "Description", "Qty", "Unit price", "Amount"]],
      body: items.map((i, n) => {
        const qty = Number(i.qty) || 0,
          price = Number(i.unitPrice) || 0;
        const row = [n + 1, i.description || "", qty % 1 ? qty.toFixed(2) : qty, money(price), money(qty * price)];
        if (codes) row.splice(1, 0, i.code || "");
        return row;
      }),
      margin: { left: M, right: M, bottom: FOOT + 4 },
      styles: { fontSize: 9, cellPadding: 2.6, textColor: ink, lineColor: [230, 230, 230], lineWidth: 0.1 },
      headStyles: { fillColor: brand, textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: codes
        ? {
            0: { cellWidth: 9, halign: "center" },
            1: { cellWidth: 26, fontSize: 8 },
            3: { cellWidth: 14, halign: "center" },
            4: { cellWidth: 28, halign: "right" },
            5: { cellWidth: 30, halign: "right" },
          }
        : {
            0: { cellWidth: 9, halign: "center" },
            2: { cellWidth: 14, halign: "center" },
            3: { cellWidth: 30, halign: "right" },
            4: { cellWidth: 32, halign: "right" },
          },
    });
    y = pdf.lastAutoTable.finalY + 6;

    // ── Totals ──
    const vatOn = chargesVat(profile);
    const t = documentTotals(items, {
      vatInclusive: doc.vatInclusive !== false,
      amountPaid: doc.amountPaid,
      vatRegistered: vatOn,
    });
    const rows = vatOn
      ? [
          ["Subtotal (excl. VAT)", money(t.subtotal)],
          [`VAT (${VAT_RATE}%)`, money(t.vat)],
          ["Total (incl. VAT)", money(t.total), true],
        ]
      : [["Total", money(t.total), true]];
    if (kind === "invoice" && t.paid > 0) {
      rows.push(["Paid", money(t.paid)]);
      rows.push(["Balance due", money(t.balance), true]);
    }
    ensureSpace(rows.length * 6 + 4);
    for (const [k, v, bold] of rows) {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(bold ? 11 : 9.5);
      pdf.setTextColor(...(bold ? ink : grey));
      text(k, right - 42, y, { align: "right" });
      pdf.setTextColor(...ink);
      text(v, right, y, { align: "right" });
      y += bold ? 6.5 : 5.2;
    }
    y += 3;

    section("Notes", doc.notes, 9);
    section("Exclusions", doc.exclusions, 8.5);
    if (kind === "proforma")
      section(
        "Please note",
        chargesVat(profile)
          ? "This is a pro forma invoice and not a tax invoice. A tax invoice will be issued once payment is received or the goods or services are supplied."
          : "This is a pro forma invoice. An invoice will be issued once payment is received or the goods or services are supplied.",
      );

    // ── Banking details (what the customer pays into) ──
    const bank = [
      profile.bank_name ? ["Bank", profile.bank_name] : null,
      profile.bank_account_name ? ["Account name", profile.bank_account_name] : null,
      profile.bank_account_no ? ["Account number", profile.bank_account_no] : null,
      profile.bank_account_type ? ["Account type", profile.bank_account_type] : null,
      profile.bank_branch_code ? ["Branch code", profile.bank_branch_code] : null,
      profile.bank_swift ? ["SWIFT", profile.bank_swift] : null,
      ["Payment reference", doc.number || ""],
    ].filter(Boolean);
    if (kind !== "quote" && bank.length > 1) {
      const boxH = 7 + bank.length * 4.6;
      ensureSpace(boxH + 4);
      pdf.setFillColor(248, 246, 246);
      pdf.setDrawColor(230, 225, 225);
      pdf.roundedRect(M, y - 4, right - M, boxH, 2, 2, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...brand);
      text("Banking details", M + 4, y + 1);
      let by = y + 6;
      pdf.setFontSize(8.5);
      for (const [k, v] of bank) {
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...grey);
        text(k, M + 4, by);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...ink);
        text(v, M + 40, by);
        by += 4.6;
      }
      y += boxH + 4;
    }

    section("Terms and conditions", kind === "invoice" ? profile.invoice_terms : profile.quote_terms, 7.8);

    // ── Acceptance (quotes) ──
    if (kind === "quote") {
      ensureSpace(30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...brand);
      text("Acceptance", M, y);
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.setTextColor(...ink);
      text("I accept this quotation and its terms and conditions.", M, y);
      y += 10;
      pdf.setDrawColor(160, 160, 160);
      pdf.setLineWidth(0.2);
      const cols = ["Name", "Signature", "Date", "Order no."];
      const cw = (right - M - 9) / 4;
      cols.forEach((label, i) => {
        const x = M + i * (cw + 3);
        pdf.line(x, y, x + cw, y);
        pdf.setTextColor(...grey);
        pdf.setFontSize(7.5);
        text(label, x, y + 4);
      });
      y += 8;
    }
  }

  // ── Job cards: one per page, after the document (or on their own) ──
  (doc.jobCards || []).forEach((jc, i) => {
    if (kind !== "jobcard" || i > 0) {
      pdf.addPage();
      y = M;
      drawHeader();
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(...brand);
    text("JOB CARD", M, y);
    pdf.setFontSize(11);
    pdf.setTextColor(...ink);
    text(jc.number || "", right, y, { align: "right" });
    y += 7;
    if (jc.title) {
      pdf.setFontSize(12);
      const lines = pdf.splitTextToSize(jc.title, right - M);
      text(lines, M, y);
      y += lines.length * 5.5 + 1;
    }
    const facts = [
      ["Customer", jc.customer],
      ["Site / location", jc.location],
      ["Scheduled", jc.scheduled],
      ["Started", jc.started],
      ["Completed", jc.completed],
      ["Technician", jc.technician],
      ["Status", jc.status],
      ["Reference", jc.reference],
    ].filter(([, v]) => v);
    if (facts.length) {
      autoTable(pdf, {
        startY: y,
        body: facts,
        margin: { left: M, right: M, bottom: FOOT + 4 },
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 1.8, textColor: ink },
        columnStyles: { 0: { cellWidth: 38, textColor: grey }, 1: { fontStyle: "bold" } },
      });
      y = pdf.lastAutoTable.finalY + 5;
    }
    section("Job description", jc.description, 9);
    section("Findings / technician notes", jc.notes, 9);
    section("Work done", jc.workDone, 9);
    if (jc.parts?.length) {
      ensureSpace(14);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...brand);
      text("Parts used", M, y);
      autoTable(pdf, {
        startY: y + 2,
        head: [["#", "Code", "Part", "Qty"]],
        body: jc.parts.map((part, n) =>
          typeof part === "string" ? [n + 1, "", part, 1] : [n + 1, part.code || "", part.description, part.qty ?? 1],
        ),
        margin: { left: M, right: M, bottom: FOOT + 4 },
        styles: { fontSize: 9, cellPadding: 2, textColor: ink },
        headStyles: { fillColor: brand, textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 10, halign: "center" }, 1: { cellWidth: 28, fontSize: 8 }, 3: { cellWidth: 14, halign: "center" } },
      });
      y = pdf.lastAutoTable.finalY + 6;
    }
    if (jc.photos?.length) {
      ensureSpace(12);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(...brand);
      text("Photos", M, y);
      y += 4;
      drawPhotos(jc.photos);
    }
    // Sign-off
    ensureSpace(28);
    y += 4;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...brand);
    text("Sign-off", M, y);
    y += 12;
    pdf.setDrawColor(160, 160, 160);
    pdf.setLineWidth(0.2);
    const cw = (right - M - 6) / 2;
    [
      ["Technician", "Name / signature / date"],
      ["Customer", "Name / signature / date"],
    ].forEach(([who, hint], j) => {
      const x = M + j * (cw + 6);
      pdf.line(x, y, x + cw, y);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(...ink);
      text(who, x, y + 4);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...grey);
      text(hint, x + 22, y + 4);
    });
    y += 10;
  });

  // ── Footer on every page ──
  const pages = pdf.getNumberOfPages();
  const footer = [
    profile.legal_name || companyName,
    profile.registration_no ? `Reg. No ${profile.registration_no}` : "",
    chargesVat(profile) && profile.vat_no ? `VAT No ${profile.vat_no}` : "",
    chargesVat(profile) ? "" : "Not registered for VAT",
  ]
    .filter(Boolean)
    .join("  ·  ");
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(225, 225, 225);
    pdf.setLineWidth(0.2);
    pdf.line(M, H - FOOT + 4, right, H - FOOT + 4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...grey);
    text(footer, M, H - FOOT + 9);
    text(`${title} ${doc.number || ""} · Page ${p} of ${pages}`, right, H - FOOT + 9, { align: "right" });
    if (doc.draft) {
      try {
        pdf.setGState(new pdf.GState({ opacity: 0.12 }));
      } catch {}
      pdf.setTextColor(200, 120, 0);
      pdf.setFontSize(90);
      pdf.setFont("helvetica", "bold");
      text("DRAFT", W / 2, H / 2 + 20, { align: "center", angle: 35 });
      try {
        pdf.setGState(new pdf.GState({ opacity: 1 }));
      } catch {}
    }
  }
  return pdf.output("blob");
}

// Native share sheet on phones (WhatsApp, email…), download elsewhere.
export async function shareDocumentPDF(blob, filename, title = filename) {
  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return "shared";
      }
    } catch (e) {
      if (e?.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return "downloaded";
}
