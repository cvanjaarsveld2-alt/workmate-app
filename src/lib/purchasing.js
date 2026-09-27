// ─── Suppliers & purchase orders ──────────────────────────────────────────────
// Pure helpers for the Purchasing screen (tables in
// supabase/migrations/*_purchasing_and_job_profit.sql). Prices exclude VAT.
// Tests: tests/purchasing.test.mjs.
const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = v => Math.round(n(v) * 100) / 100;

export const PO_STATUS = {
  draft: { label: "Draft", style: "bg-slate-100 text-slate-700" },
  sent: { label: "Ordered", style: "bg-blue-50 text-blue-800" },
  partial: { label: "Part received", style: "bg-amber-50 text-amber-900" },
  received: { label: "Received", style: "bg-green-50 text-green-800" },
  cancelled: { label: "Cancelled", style: "bg-red-50 text-red-800" },
};

// A line from a catalogue item: its cost price, and its supplier code as reference.
export function productLine(p, qty = 1) {
  return {
    product_id: p.id,
    part_number: p.supplier_code || p.part_number || "",
    description: p.name,
    qty: n(qty) || 1,
    unit_cost: r2(p.cost_price),
    received_qty: 0,
  };
}

export const blankLine = () => ({ description: "", qty: 1, unit_cost: 0, received_qty: 0 });

export function cleanLines(lines) {
  return (lines || [])
    .map(l => ({
      ...(l.product_id ? { product_id: l.product_id } : {}),
      ...(l.part_number ? { part_number: String(l.part_number).slice(0, 60) } : {}),
      description: String(l.description || "").trim().slice(0, 300),
      qty: Math.max(0, n(l.qty)),
      unit_cost: Math.max(0, r2(l.unit_cost)),
      received_qty: Math.max(0, n(l.received_qty)),
    }))
    .filter(l => l.description && l.qty > 0);
}

export function poTotals(lines, { vatRegistered = true } = {}) {
  const subtotal = r2(cleanLines(lines).reduce((s, l) => s + l.qty * l.unit_cost, 0));
  const vat = vatRegistered ? r2(subtotal * 0.15) : 0;
  return { subtotal, vat, total: r2(subtotal + vat) };
}

// How much of the order is still to come.
export function outstanding(po) {
  return cleanLines(po.lines).reduce((s, l) => s + Math.max(0, l.qty - l.received_qty), 0);
}

// Catalogue items at or below their reorder level, grouped by supplier, as
// ready-made order lines (enough to bring stock back to twice the reorder level).
export function lowStockOrders(products, suppliers = []) {
  const bySupplier = new Map();
  const find = name => suppliers.find(s => s.name.trim().toLowerCase() === String(name || "").trim().toLowerCase());
  for (const p of products || []) {
    if (!p.track_stock || p.active === false || !(n(p.reorder_level) > 0) || n(p.stock_on_hand) > n(p.reorder_level)) continue;
    const qty = Math.max(1, Math.ceil(n(p.reorder_level) * 2 - n(p.stock_on_hand)));
    const s = find(p.supplier);
    const key = s ? s.id : `name:${String(p.supplier || "").trim().toLowerCase()}`;
    if (!bySupplier.has(key)) bySupplier.set(key, { supplier_id: s?.id || null, supplier_name: s?.name || p.supplier || "", lines: [] });
    bySupplier.get(key).lines.push(productLine(p, qty));
  }
  return [...bySupplier.values()];
}

// For the PDF (lib/documentPDF.js, kind "purchase_order").
export function poToDocument(po, { supplier = null, job = null, vatRegistered = true } = {}) {
  return {
    kind: "purchase_order",
    number: po.po_number || "Draft",
    date: po.order_date,
    dueDate: po.expected_date || null,
    reference: job ? `${job.job_number || "Job"}${job.title ? ` · ${job.title}` : ""}` : po.supplier_ref || "",
    client: {
      name: supplier?.name || po.supplier_name || "Supplier",
      contact: supplier?.contact_name || "",
      address: supplier?.address || "",
      phone: supplier?.phone || "",
      email: supplier?.email || "",
      vat: supplier?.vat_number || "",
    },
    items: cleanLines(po.lines).map(l => ({
      description: l.part_number ? `${l.part_number}  ${l.description}` : l.description,
      qty: l.qty,
      unitPrice: l.unit_cost,
    })),
    vatInclusive: false,
    vatRegistered,
    notes: [supplier?.account_no ? `Our account no: ${supplier.account_no}` : "", po.notes || ""].filter(Boolean).join("\n"),
  };
}
