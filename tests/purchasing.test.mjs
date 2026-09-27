import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cleanLines, lowStockOrders, outstanding, poToDocument, poTotals, productLine } from "../src/lib/purchasing.js";
import { documentTitle } from "../src/lib/documentPDF.js";

const seal = { id: "p1", name: "Seal kit", part_number: "SK-1", supplier_code: "HYD-99", supplier: "Hydraulic Supplies", cost_price: 120.5, track_stock: true, stock_on_hand: 1, reorder_level: 3 };

test("a catalogue item becomes an order line at cost, with the supplier's code", () => {
  assert.deepEqual(productLine(seal, 4), { product_id: "p1", part_number: "HYD-99", description: "Seal kit", qty: 4, unit_cost: 120.5, received_qty: 0 });
});

test("blank and zero-quantity lines are dropped; totals add 15% VAT only when VAT registered", () => {
  const lines = [productLine(seal, 2), { description: "", qty: 1, unit_cost: 9 }, { description: "Freight", qty: 1, unit_cost: 150 }, { description: "Nothing", qty: 0, unit_cost: 5 }];
  assert.equal(cleanLines(lines).length, 2);
  assert.deepEqual(poTotals(lines), { subtotal: 391, vat: 58.65, total: 449.65 });
  assert.deepEqual(poTotals(lines, { vatRegistered: false }), { subtotal: 391, vat: 0, total: 391 });
});

test("what's still to come", () => {
  assert.equal(outstanding({ lines: [{ description: "a", qty: 4, unit_cost: 1, received_qty: 3 }, { description: "b", qty: 2, unit_cost: 1, received_qty: 2 }] }), 1);
});

test("low stock becomes draft orders per supplier, topping up to twice the reorder level", () => {
  const products = [
    seal,
    { ...seal, id: "p2", name: "O-ring", supplier: "hydraulic supplies ", stock_on_hand: 0, reorder_level: 10 },
    { ...seal, id: "p3", name: "Bolt", supplier: "Bolts Inc", stock_on_hand: 50, reorder_level: 10 },
    { ...seal, id: "p4", name: "Untracked", track_stock: false },
    { ...seal, id: "p5", name: "No level", reorder_level: 0 },
  ];
  const orders = lowStockOrders(products, [{ id: "s1", name: "Hydraulic Supplies" }]);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].supplier_id, "s1");
  assert.deepEqual(orders[0].lines.map(l => [l.description, l.qty]), [["Seal kit", 5], ["O-ring", 20]]);
});

test("the PDF is a purchase order to the supplier, with our account number", () => {
  const doc = poToDocument(
    { po_number: "PO-0007", order_date: "2026-10-01", expected_date: "2026-10-05", lines: [productLine(seal, 2)], notes: "Deliver to site" },
    { supplier: { name: "Hydraulic Supplies", account_no: "PW001", email: "orders@hs.example" }, job: { job_number: "JOB-12", title: "Pump" } },
  );
  assert.equal(doc.kind, "purchase_order");
  assert.equal(documentTitle(doc.kind), "PURCHASE ORDER");
  assert.equal(doc.client.name, "Hydraulic Supplies");
  assert.equal(doc.reference, "JOB-12 · Pump");
  assert.equal(doc.vatInclusive, false);
  assert.deepEqual(doc.items, [{ description: "HYD-99  Seal kit", qty: 2, unitPrice: 120.5 }]);
  assert.match(doc.notes, /Our account no: PW001\nDeliver to site/);
});

test("receiving goes through the database (stock movements), and only managers order", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260928090000_purchasing_and_job_profit.sql", import.meta.url), "utf8");
  assert.match(sql, /revoke update on public\.purchase_orders from authenticated/);
  assert.doesNotMatch(sql.match(/grant update \(([^)]+)\) on public\.purchase_orders/)[1], /received_at/);
  assert.match(sql, /insert into public\.stock_movements \(team_id, product_id, qty_change, reason, job_id, note\)/);
  assert.match(sql, /private\.is_team_manager\(v_po\.team_id\) then raise exception 'Only the master account or an admin can receive stock'/);
  assert.match(sql, /'PO-' \|\| lpad\(n::text, 4, '0'\)/);
});
