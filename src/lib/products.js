// ─── Products & stock ─────────────────────────────────────────────────────────
// The company's catalogue (supabase/migrations/*_products_and_stock.sql): part
// numbers, prices (excluding VAT) and stock. The list is cached per company so
// it can be picked from on quotes and jobs without a connection. Stock only
// changes on the server (adjust_stock, CSV import, completed jobs).
import { useEffect, useState } from "react";
import { neutralizeFormula } from "./csv.js";

const CACHE_PREFIX = "pm_products_";
const EVENT = "pm:products";
const VAT_RATE = 0.15;

const num = v => {
  const n = Number(String(v ?? "").replace(/[\sR,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// Spreadsheet amounts: "R 1 250,50" (decimal comma), "1,250.50", "99.5".
export function csvNumber(v) {
  let s = String(v ?? "").replace(/[\sR\u00a0]/g, "");
  if (s.includes(",") && !s.includes(".") && /,\d{1,2}$/.test(s)) s = s.replace(/,(?=\d{1,2}$)/, ".");
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export function readCachedProducts(teamId) {
  if (!teamId) return [];
  try {
    const list = JSON.parse(localStorage.getItem(CACHE_PREFIX + teamId) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCache(teamId, list) {
  try {
    localStorage.setItem(CACHE_PREFIX + teamId, JSON.stringify(list));
  } catch {
    // Storage full: the catalogue still works while online.
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { teamId } }));
  } catch {
    // Not in a browser (tests).
  }
}

export async function loadProducts(supabase, teamId) {
  if (!teamId) return [];
  const all = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("team_id", teamId)
      .order("name")
      .range(from, from + 999);
    if (error) throw error;
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  writeCache(teamId, all);
  return all;
}

// Keeps the cache in step after a save without reloading everything.
export function cacheProduct(teamId, product, { remove = false } = {}) {
  const list = readCachedProducts(teamId).filter(p => p.id !== product.id);
  if (!remove) list.push(product);
  list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  writeCache(teamId, list);
  return list;
}

// The cached catalogue for a company, refreshed from the server when online.
export function useProducts(supabase, teamId, { refresh = true } = {}) {
  const [products, setProducts] = useState(() => readCachedProducts(teamId));
  useEffect(() => {
    setProducts(readCachedProducts(teamId));
    const onChange = e => {
      if (!e.detail?.teamId || e.detail.teamId === teamId) setProducts(readCachedProducts(teamId));
    };
    window.addEventListener(EVENT, onChange);
    if (refresh && teamId && supabase && navigator.onLine) loadProducts(supabase, teamId).catch(() => {});
    return () => window.removeEventListener(EVENT, onChange);
  }, [teamId, supabase, refresh]);
  return products;
}

export function searchProducts(list, query, { includeInactive = false } = {}) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return (list || []).filter(p => {
    if (!includeInactive && p.active === false) return false;
    if (!words.length) return true;
    const hay = [p.part_number, p.name, p.description, p.category, p.supplier, p.supplier_code, p.barcode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

export const isLowStock = p => !!p?.track_stock && p.active !== false && num(p.stock_on_hand) <= num(p.reorder_level);

export function margin(p) {
  const sell = num(p?.sell_price),
    cost = num(p?.cost_price);
  if (!sell) return { amount: r2(-cost), percent: null };
  return { amount: r2(sell - cost), percent: Math.round(((sell - cost) / sell) * 1000) / 10 };
}

// Selling price as it should appear on a quote line: prices are kept
// excluding VAT, so on a VAT-inclusive quote from a VAT-registered company
// the line price includes VAT.
export function linePrice(p, { vatInclusive = true, vatRegistered = true } = {}) {
  const ex = num(p?.sell_price);
  return vatRegistered && vatInclusive && p?.vat_applicable !== false ? r2(ex * (1 + VAT_RATE)) : r2(ex);
}

export function productLine(p, opts = {}) {
  return {
    id: `li_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    product_id: p.id,
    part_number: p.part_number || "",
    description: p.name,
    qty: "1",
    unitPrice: String(linePrice(p, opts)),
  };
}

// ── Parts on a job ──
// parts_used holds plain strings (older jobs) or objects; objects with a
// product_id come off stock when the job is completed.
export function normaliseParts(raw) {
  let list = raw;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = list.split(",");
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((p, i) =>
      p && typeof p === "object"
        ? {
            ...p,
            id: p.id || `part_${i}`,
            description: String(p.description ?? p.name ?? "").trim(),
            quantity: num(p.quantity ?? p.qty ?? 1) || 1,
          }
        : { id: `part_${i}`, description: String(p ?? "").trim(), quantity: 1 },
    )
    .filter(p => p.description || p.product_id);
}

export function productPart(p) {
  return {
    id: `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    product_id: p.id,
    part_number: p.part_number || "",
    description: p.name,
    unit: p.unit || "each",
    quantity: 1,
    unit_price: num(p.sell_price),
    cost_price: num(p.cost_price),
  };
}

// What's saved to jobs.parts_used: loose parts stay as plain text so older
// app versions and exports keep reading them.
export function partsForSave(parts) {
  return normaliseParts(parts).map(p => {
    if (!p.product_id && p.quantity === 1 && !p.unit_price) return p.description;
    const out = { description: p.description, quantity: p.quantity };
    for (const k of ["product_id", "part_number", "unit", "unit_price", "cost_price"]) if (p[k] !== undefined && p[k] !== "") out[k] = p[k];
    return out;
  });
}

export function partLabel(p) {
  const code = p.part_number ? `${p.part_number} ` : "";
  const qty = p.quantity && p.quantity !== 1 ? ` × ${p.quantity}` : "";
  return `${code}${p.description}${qty}`.trim();
}

// Priced catalogue parts on a job → invoice lines (VAT treatment as linePrice).
export function partsToLines(parts, opts = {}) {
  return normaliseParts(parts)
    .filter(p => p.product_id && num(p.unit_price) > 0)
    .map(p => ({
      description: p.description,
      part_number: p.part_number || "",
      product_id: p.product_id,
      qty: p.quantity,
      unitPrice: linePrice({ sell_price: p.unit_price }, opts),
    }));
}

// ── CSV ──
export function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  // The separator is whichever of , ; or tab the heading row uses most
  // (Excel in South Africa often saves with ; and decimal commas).
  const head = s.split(/\r?\n/, 1)[0];
  const sep = [",", ";", "\t"].map(c => [c, head.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(x => String(x).trim()));
}

const HEADERS = {
  part_number: ["part number", "part no", "part #", "partnumber", "part_number", "sku", "code", "item code", "itemcode", "stock code"],
  name: ["name", "item", "item name", "product", "product name", "title"],
  description: ["description", "details", "long description"],
  category: ["category", "group", "type"],
  unit: ["unit", "uom", "unit of measure"],
  sell_price: ["sell price", "selling price", "price", "sell_price", "sales price", "unit price", "retail"],
  cost_price: ["cost price", "cost", "cost_price", "buy price", "purchase price"],
  supplier: ["supplier", "vendor"],
  supplier_code: ["supplier code", "supplier part number", "supplier_code", "vendor code"],
  stock_on_hand: ["stock", "stock on hand", "qty on hand", "quantity", "on hand", "stock_on_hand", "qty"],
  reorder_level: ["reorder level", "reorder", "min stock", "minimum", "reorder_level"],
};

export function productsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { rows: [], columns: [] };
  const header = rows[0].map(h =>
    String(h)
      .trim()
      .toLowerCase()
      .replace(/[*_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const index = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    const at = header.findIndex(h => names.includes(h) || names.includes(h.replace(/ /g, "_")));
    if (at >= 0) index[key] = at;
  }
  // Only a description column: use it as the name.
  if (index.name === undefined && index.description !== undefined) {
    index.name = index.description;
    delete index.description;
  }
  const out = rows.slice(1).map(r => {
    const o = {};
    for (const [key, at] of Object.entries(index)) {
      const v = String(r[at] ?? "").trim();
      if (!v) continue;
      o[key] = ["sell_price", "cost_price", "stock_on_hand", "reorder_level"].includes(key) ? String(csvNumber(v)) : v;
    }
    return o;
  });
  return { rows: out.filter(o => o.name), columns: Object.keys(index) };
}

const EXPORT_COLUMNS = [
  ["part_number", "Part number"],
  ["name", "Name"],
  ["description", "Description"],
  ["category", "Category"],
  ["unit", "Unit"],
  ["cost_price", "Cost price"],
  ["sell_price", "Sell price"],
  ["supplier", "Supplier"],
  ["supplier_code", "Supplier code"],
  ["stock_on_hand", "Stock on hand"],
  ["reorder_level", "Reorder level"],
];

export function productsCsv(list) {
  const cell = v => {
    const s = neutralizeFormula(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [EXPORT_COLUMNS.map(([, h]) => h).join(",")];
  for (const p of list || []) lines.push(EXPORT_COLUMNS.map(([k]) => cell(p[k])).join(","));
  return lines.join("\r\n");
}
