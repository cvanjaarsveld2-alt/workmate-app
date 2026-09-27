// ─── Quote Line Items Editor ──────────────────────────────────────────────────
// Drop-in component for the QuotesScreen form.
// Manages line items with description, qty, unit price.
// Shows running total + VAT.
//
// Usage (inside QuotesScreen form):
//   const [lineItems, setLineItems] = useState([]);
//   const [vatInclusive, setVatInclusive] = useState(true);
//   <QuoteLineItems items={lineItems} onChange={setLineItems} vatInclusive={vatInclusive} onVatToggle={setVatInclusive} />
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { supabase } from "../supabase";
import { activeTeamId } from "../lib/companyProfile";
import { productLine, useProducts } from "../lib/products";
import { ProductPicker } from "./ProductPicker";
import { BRAND } from "../lib/constants";
import { VAT_CODES, lineAmounts, lineTotals } from "../lib/lineTotals";

function emptyLine() {
  return { id: `li_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, description: "", qty: "1", unitPrice: "" };
}

export function QuoteLineItems({ items = [], onChange, vatInclusive = true, onVatToggle, vatRegistered = true }) {
  const products = useProducts(supabase, activeTeamId());
  const [picking, setPicking] = useState(false);
  function update(id, field, value) {
    onChange(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  }
  function add() { onChange([...items, emptyLine()]); }
  function remove(id) { onChange(items.filter(i => i.id !== id)); }

  const opts = { vatInclusive, vatRegistered };
  const { subtotal, vat: vatAmount, total } = lineTotals(items, opts);
  const fmt = n => `R ${Number(n || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="stack-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Line items</p>
        <div className="flex items-center gap-2">
          {vatRegistered ? (
            <button type="button" onClick={() => onVatToggle?.(!vatInclusive)}
              className="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 text-slate-500">
              VAT {vatInclusive ? "incl" : "excl"}
            </button>
          ) : (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full border border-slate-200 text-slate-500">No VAT</span>
          )}
        </div>
      </div>

      {items.map((item, idx) => (
        <div key={item.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3 stack-y-2">
          <div className="flex items-start gap-2">
            <span className="text-xs font-black text-slate-300 mt-3 w-5 shrink-0">{idx + 1}.</span>
            <div className="flex-1 min-w-0">
              {item.part_number && (
                <p className="text-[10px] font-bold text-slate-500 mb-1 font-mono">{item.part_number}</p>
              )}
              <input value={item.description} onChange={e => update(item.id, "description", e.target.value)}
                placeholder="Item description" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-hidden focus:border-red-300" />
              <div className="grid grid-cols-[72px_1fr] gap-2 mt-2">
                <div className="w-20">
                  <label className="text-[10px] font-bold text-slate-400 mb-0.5 block">Qty</label>
                  <input type="number" min="1" value={item.qty} onChange={e => update(item.id, "qty", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-hidden focus:border-red-300 text-center" />
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] font-bold text-slate-400 mb-0.5 block">Unit price (R)</label>
                  <input type="number" step="0.01" value={item.unitPrice} onChange={e => update(item.id, "unitPrice", e.target.value)}
                    placeholder="0.00" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-hidden focus:border-red-300" />
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] font-bold text-slate-400 mb-0.5 block">Discount %</label>
                  <input type="number" min="0" max="100" step="0.5" value={item.discount ?? ""} onChange={e => update(item.id, "discount", e.target.value)}
                    placeholder="0" aria-label={`Line ${idx + 1} discount`} className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-hidden focus:border-red-300 text-center" />
                </div>
                {vatRegistered ? (
                  <div className="min-w-0">
                    <label className="text-[10px] font-bold text-slate-400 mb-0.5 block">VAT</label>
                    <select value={item.vat || "standard"} onChange={e => update(item.id, "vat", e.target.value)} aria-label={`Line ${idx + 1} VAT`}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm outline-hidden focus:border-red-300">
                      {Object.entries(VAT_CODES).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                ) : <div />}
                <div className="col-span-2 flex items-center justify-between gap-2 pt-1">
                  <p className="text-sm font-black text-slate-700 truncate">{fmt(lineAmounts(item, opts).amount)}</p>
                </div>
              </div>
            </div>
            <button type="button" onClick={() => remove(item.id)}
              className="p-2 rounded-lg text-slate-300 hover:text-red-500 mt-1 min-w-[36px] min-h-[36px] flex items-center justify-center">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      <div className={products.length ? "grid grid-cols-2 gap-2" : ""}>
        <button type="button" onClick={add}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-400 hover:border-slate-300 min-h-[48px]">
          <Plus size={14} /> Add line item
        </button>
        {products.length > 0 && (
          <button type="button" onClick={() => setPicking(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-500 hover:border-slate-300 min-h-[48px]">
            <Package size={14} /> From catalogue
          </button>
        )}
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        products={products}
        onPick={p => {
          onChange([...items, productLine(p, { vatInclusive, vatRegistered })]);
          setPicking(false);
        }}
      />

      {/* Totals */}
      {items.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-100 p-3.5 stack-y-2">
          {vatRegistered && !vatInclusive && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-bold text-slate-700">{fmt(subtotal)}</span>
            </div>
          )}
          {vatRegistered && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">VAT{vatInclusive ? " incl." : ""}</span>
              <span className="font-bold text-slate-500">{fmt(vatAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base pt-1 border-t border-slate-100">
            <span className="font-black text-slate-900">Total</span>
            <span className="font-black" style={{ color: BRAND.primary }}>{fmt(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
