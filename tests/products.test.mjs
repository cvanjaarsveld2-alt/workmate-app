import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isLowStock,
  linePrice,
  margin,
  normaliseParts,
  parseCsv,
  partLabel,
  partsForSave,
  partsToLines,
  productLine,
  productPart,
  productsCsv,
  productsFromCsv,
  searchProducts,
  csvNumber,
} from "../src/lib/products.js";
import { invoiceLines } from "../src/lib/accountingExport.js";
import { jobToCard, parseItems } from "../src/lib/documentData.js";

const filter = { id: "p1", part_number: "HF-100", name: "Hydraulic filter", category: "Filters", sell_price: 200, cost_price: 120, supplier_code: "SUP-9", track_stock: true, stock_on_hand: 2, reorder_level: 3, unit: "each" };
const hose = { id: "p2", part_number: "HS-12", name: "High pressure hose 1m", sell_price: 350, cost_price: 0, active: false };

test("search matches part number, name and supplier code; hides inactive items", () => {
  assert.deepEqual(searchProducts([filter, hose], "hf-100").map(p => p.id), ["p1"]);
  assert.deepEqual(searchProducts([filter, hose], "sup-9 filter").map(p => p.id), ["p1"]);
  assert.deepEqual(searchProducts([filter, hose], "hose").map(p => p.id), []);
  assert.deepEqual(searchProducts([filter, hose], "hose", { includeInactive: true }).map(p => p.id), ["p2"]);
});

test("low stock, margin and VAT-aware line prices", () => {
  assert.equal(isLowStock(filter), true);
  assert.equal(isLowStock({ ...filter, stock_on_hand: 5 }), false);
  assert.equal(isLowStock({ ...filter, track_stock: false }), false);
  assert.deepEqual(margin(filter), { amount: 80, percent: 40 });
  assert.equal(linePrice(filter, { vatInclusive: true, vatRegistered: true }), 230);
  assert.equal(linePrice(filter, { vatInclusive: false, vatRegistered: true }), 200);
  assert.equal(linePrice(filter, { vatInclusive: true, vatRegistered: false }), 200);
  const line = productLine(filter, { vatInclusive: true });
  assert.equal(line.product_id, "p1");
  assert.equal(line.part_number, "HF-100");
  assert.equal(line.unitPrice, "230");
  // Saved quote lines keep the part number through to the documents.
  assert.equal(parseItems(JSON.stringify([line]))[0].code, "HF-100");
});

test("job parts: old text parts still work, catalogue parts keep their product", () => {
  const parts = normaliseParts(["Seal kit", { ...productPart(filter), quantity: 2 }]);
  assert.equal(parts[0].description, "Seal kit");
  assert.equal(parts[1].product_id, "p1");
  assert.equal(partLabel(parts[1]), "HF-100 Hydraulic filter × 2");
  const saved = partsForSave(parts);
  assert.equal(saved[0], "Seal kit");
  assert.deepEqual({ ...saved[1] }, { description: "Hydraulic filter", quantity: 2, product_id: "p1", part_number: "HF-100", unit: "each", unit_price: 200, cost_price: 120 });
  assert.deepEqual(normaliseParts("Hose, Clamp").map(p => p.description), ["Hose", "Clamp"]);
  const lines = partsToLines(saved, { vatInclusive: false });
  assert.deepEqual(lines.map(l => [l.part_number, l.qty, l.unitPrice]), [["HF-100", 2, 200]]);
  const card = jobToCard({ id: "j1", parts_used: saved });
  assert.deepEqual(card.parts[1], { code: "HF-100", description: "Hydraulic filter", qty: 2 });
});

test("CSV import understands common headings, quotes and semicolons", () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n'), [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  const csv = "\uFEFFPart No;Description;Cost;Selling Price;Qty on hand;Supplier\nHF-100;Hydraulic filter;120;R 200,00;4;Acme\n;;;;;\nHS-12;Hose;50;99.5;;\n";
  const { rows, columns } = productsFromCsv(csv);
  assert.deepEqual(columns.sort(), ["cost_price", "name", "part_number", "sell_price", "stock_on_hand", "supplier"].sort());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Hydraulic filter");
  assert.equal(rows[0].stock_on_hand, "4");
  assert.equal(rows[0].sell_price, "200");
  assert.equal(rows[1].sell_price, "99.5");
  assert.equal(rows[1].stock_on_hand, undefined);
});

test("spreadsheet amounts with decimal commas or thousands separators", () => {
  assert.equal(csvNumber("R 1 250,50"), 1250.5);
  assert.equal(csvNumber("1,250.50"), 1250.5);
  assert.equal(csvNumber("1,250"), 1250);
  assert.equal(csvNumber("abc"), 0);
});

test("CSV export guards against formulas", () => {
  const out = productsCsv([{ ...filter, name: "=HYPERLINK(1)", description: "a, b" }]);
  assert.match(out.split("\r\n")[0], /^Part number,Name,Description/);
  assert.match(out, /'=HYPERLINK\(1\)/);
  assert.match(out, /"a, b"/);
});

test("accounting export puts the part number in the description", () => {
  const inv = { id: "i1", invoice_number: "INV-00001", issue_date: "2026-09-01", total: 230, line_items: [productLine(filter, { vatInclusive: false })] };
  const [line] = invoiceLines([inv], { profile: { vat_registered: true } });
  assert.equal(line.description, "HF-100 Hydraulic filter");
  assert.equal(line.unitEx, 200);
});

test("the products migration keeps stock changes on the server", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260927090000_products_and_stock.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke update on public\.products from authenticated/);
  assert.doesNotMatch(sql.match(/grant update \(([^)]*)\)/)[1], /stock_on_hand/);
  assert.match(sql, /revoke insert, update, delete on public\.stock_movements from authenticated/);
  assert.match(sql, /create trigger jobs_stock_sync after insert or update of status, parts_used on public\.jobs/);
  assert.match(sql, /'stock_movements','products'/);
});
