// ─── Pick an item from the company's catalogue ────────────────────────────────
// Used on quote lines and job parts. Works offline from the cached catalogue.
import React, { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { SearchBar } from "./ui";
import { isLowStock, searchProducts } from "../lib/products";

const rand = n => `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProductPicker({ open, onClose, products = [], onPick, title = "Add from catalogue" }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchProducts(products, query).slice(0, 80), [products, query]);
  return (
    <BottomSheet open={open} onClose={onClose} title={title} subtitle="Prices exclude VAT">
      <div className="stack-y-2">
        <SearchBar value={query} onChange={setQuery} placeholder="Part number, name or supplier code" />
        {results.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {products.length ? "Nothing matches." : "No products yet. Add them under Products & stock."}
          </p>
        ) : (
          results.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onPick(p);
                setQuery("");
              }}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left min-h-[56px] active:bg-slate-50"
            >
              <Package size={18} className="text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {[p.part_number, p.category].filter(Boolean).join(" · ") || "No part number"}
                  {p.track_stock ? ` · ${Number(p.stock_on_hand)} ${p.unit || ""} in stock` : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-slate-800">{rand(p.sell_price)}</p>
                {isLowStock(p) && <p className="text-[10px] font-bold text-red-600">Low stock</p>}
              </div>
            </button>
          ))
        )}
      </div>
    </BottomSheet>
  );
}
