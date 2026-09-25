// ─── Parts used on a job ──────────────────────────────────────────────────────
// Catalogue items (with part number, price and stock) or anything typed in.
// Catalogue items come off stock when the job is completed.
import React, { useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { ProductPicker } from "./ProductPicker";
import { productPart } from "../lib/products";

export function PartsEditor({ parts = [], onChange, products = [] }) {
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const addTyped = () => {
    const names = text
      .split(",")
      .map(x => x.trim())
      .filter(Boolean);
    if (!names.length) return;
    onChange([
      ...parts,
      ...names.map((description, i) => ({ id: `part_${Date.now()}_${i}`, description, quantity: 1 })),
    ]);
    setText("");
  };
  const setQty = (id, v) => onChange(parts.map(p => (p.id === id ? { ...p, quantity: Math.max(0, Number(v) || 0) } : p)));
  return (
    <div className="stack-y-2">
      <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Parts used</p>
      {parts.map(p => (
        <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
          <div className="min-w-0 flex-1">
            {p.part_number && <p className="text-[10px] font-bold font-mono text-slate-500">{p.part_number}</p>}
            <p className="text-sm text-slate-800 truncate">{p.description}</p>
          </div>
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={p.quantity}
            onChange={e => setQty(p.id, e.target.value)}
            aria-label={`Quantity of ${p.description}`}
            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-2 text-base text-center"
          />
          <button
            type="button"
            onClick={() => onChange(parts.filter(x => x.id !== p.id))}
            aria-label={`Remove ${p.description}`}
            className="p-2 rounded-lg text-slate-400 min-w-[40px] min-h-[40px] flex items-center justify-center"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={addTyped}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTyped();
            }
          }}
          placeholder="Other parts (comma separated)"
          className="min-w-0 flex-1 rounded-xl border p-2 text-base"
        />
        <button
          type="button"
          onClick={addTyped}
          aria-label="Add part"
          className="rounded-xl border border-slate-200 px-3 min-h-[44px] text-slate-600 flex items-center gap-1 text-sm font-bold"
        >
          <Plus size={14} /> Add
        </button>
      </div>
      {products.length > 0 && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-bold text-slate-500 min-h-[44px]"
        >
          <Package size={14} /> Add from catalogue
        </button>
      )}
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        products={products}
        onPick={p => {
          const existing = parts.find(x => x.product_id === p.id);
          onChange(
            existing
              ? parts.map(x => (x === existing ? { ...x, quantity: (Number(x.quantity) || 0) + 1 } : x))
              : [...parts, productPart(p)],
          );
          setPicking(false);
        }}
      />
    </div>
  );
}
