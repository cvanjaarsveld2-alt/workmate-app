// ─── Products & stock ─────────────────────────────────────────────────────────
// The company's catalogue: part numbers, cost and selling prices, suppliers
// and stock levels. Everyone can look items up; the master account and admins
// add, edit, import and adjust stock. Stock changes are recorded on the server
// (supabase/migrations/*_products_and_stock.sql).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Package, Plus, RefreshCw, Upload } from "lucide-react";
import { supabase } from "../supabase";
import { BottomSheet } from "../components/BottomSheet";
import { Btn, Card, Field, FilterPills, PageHeader, SearchBar } from "../components/ui";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import {
  cacheProduct,
  isLowStock,
  linePrice,
  loadProducts,
  margin,
  productsCsv,
  productsFromCsv,
  searchProducts,
  useProducts,
} from "../lib/products";

const rand = n => `R ${(Number(n) || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = n => {
  const v = Number(n) || 0;
  return v % 1 ? v.toFixed(2) : String(v);
};
const BLANK = {
  part_number: "",
  name: "",
  description: "",
  category: "",
  unit: "each",
  cost_price: "",
  sell_price: "",
  supplier: "",
  supplier_code: "",
  barcode: "",
  track_stock: false,
  reorder_level: "",
  active: true,
};
const REASONS = { receive: "Received", count: "Stock count", adjust: "Correction", job: "Used on job", import: "Opening stock" };

function Toggle({ label, hint, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 min-h-[56px]">
      <span>
        <span className="block text-sm font-bold text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="h-5 w-5" />
    </label>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ProductsScreen({ teamId, canManage = false, vatRegistered = true }) {
  const online = useOnlineStatus();
  const products = useProducts(supabase, teamId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [importing, setImporting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fileRef = useRef(null);

  const low = useMemo(() => products.filter(isLowStock), [products]);
  const visible = useMemo(() => {
    const base =
      filter === "Low stock"
        ? low
        : filter === "Inactive"
          ? products.filter(p => p.active === false)
          : filter === "Stocked"
            ? products.filter(p => p.track_stock && p.active !== false)
            : products;
    return searchProducts(base, query, { includeInactive: filter === "Inactive" || filter === "All" });
  }, [products, low, filter, query]);
  const stockValue = useMemo(
    () => products.filter(p => p.track_stock).reduce((s, p) => s + Math.max(0, Number(p.stock_on_hand) || 0) * (Number(p.cost_price) || 0), 0),
    [products],
  );

  async function refresh() {
    if (!online) return;
    setBusy(true);
    try {
      await loadProducts(supabase, teamId);
    } catch (e) {
      setMessage(e.message);
    }
    setBusy(false);
  }

  async function save(form) {
    if (!online) return setMessage("Connect to the internet to change products.");
    if (!form.name.trim()) return setMessage("Give the item a name.");
    setBusy(true);
    setMessage("");
    const row = {
      part_number: form.part_number.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      unit: form.unit.trim() || "each",
      cost_price: Math.max(0, Number(form.cost_price) || 0),
      sell_price: Math.max(0, Number(form.sell_price) || 0),
      supplier: form.supplier.trim() || null,
      supplier_code: form.supplier_code.trim() || null,
      barcode: form.barcode.trim() || null,
      track_stock: !!form.track_stock,
      reorder_level: Math.max(0, Number(form.reorder_level) || 0),
      active: form.active !== false,
    };
    const q = form.id
      ? supabase.from("products").update(row).eq("id", form.id)
      : supabase.from("products").insert({ ...row, team_id: teamId });
    const { data, error } = await q.select("*").single();
    setBusy(false);
    if (error)
      return setMessage(
        error.code === "23505" ? `Part number ${row.part_number} is already in the catalogue.` : error.message,
      );
    cacheProduct(teamId, data);
    setEditing(null);
    setMessage(form.id ? "Saved." : `${data.name} added.`);
  }

  async function remove(p) {
    if (!online) return setMessage("Connect to the internet to change products.");
    if (!window.confirm(`Delete ${p.name}? Its stock history is deleted too. Quotes and jobs keep their text.`)) return;
    setBusy(true);
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    cacheProduct(teamId, p, { remove: true });
    setEditing(null);
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const parsed = productsFromCsv(await file.text());
    if (!parsed.rows.length)
      return setMessage("No products found. The file needs a heading row with at least a Name or Description column.");
    setImporting({ ...parsed, name: file.name });
  }

  async function runImport() {
    setBusy(true);
    let added = 0,
      updated = 0,
      skipped = 0;
    try {
      for (let i = 0; i < importing.rows.length; i += 1000) {
        const { data, error } = await supabase.rpc("import_products", {
          p_team_id: teamId,
          p_rows: importing.rows.slice(i, i + 1000),
        });
        if (error) throw error;
        added += data?.added || 0;
        updated += data?.updated || 0;
        skipped += data?.skipped || 0;
      }
      await loadProducts(supabase, teamId);
      setMessage(`Import done: ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}.`);
      setImporting(null);
    } catch (e) {
      setMessage(`Import stopped: ${e.message}${added + updated ? ` (${added} added, ${updated} updated before that)` : ""}`);
    }
    setBusy(false);
  }

  return (
    <div className="stack-y-4">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <PageHeader title="Products & stock" subtitle={`${products.length} items · prices exclude VAT`} />
        </div>
        <Btn size="sm" variant="secondary" onClick={refresh} disabled={!online || busy}>
          <RefreshCw size={14} />
        </Btn>
      </div>

      {canManage && (
        <div className="grid grid-cols-3 gap-2">
          <Btn size="sm" onClick={() => setEditing({ ...BLANK })}>
            <Plus size={14} /> Add
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={!online}>
            <Upload size={14} /> Import
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => download("products.csv", productsCsv(products))} disabled={!products.length}>
            <Download size={14} /> Export
          </Btn>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={pickFile} aria-label="Import products from a CSV file" />
        </div>
      )}

      {low.length > 0 && (
        <button
          type="button"
          onClick={() => setFilter("Low stock")}
          className="w-full flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900"
        >
          <AlertTriangle size={16} className="shrink-0" />
          {low.length} {low.length === 1 ? "item is" : "items are"} at or below the reorder level.
        </button>
      )}
      {stockValue > 0 && canManage && <p className="text-xs text-slate-500">Stock value at cost: {rand(stockValue)}</p>}

      <SearchBar value={query} onChange={setQuery} placeholder="Part number, name, supplier code" />
      <FilterPills options={["All", "Low stock", "Stocked", "Inactive"]} value={filter} onChange={setFilter} dangerValue="Low stock" />
      {!online && <p className="text-sm text-amber-700">Offline: showing the saved catalogue.</p>}
      {message && <p className="text-sm text-slate-700">{message}</p>}

      {visible.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          <Package size={22} className="mx-auto mb-2 text-slate-300" />
          {products.length
            ? "Nothing matches."
            : canManage
              ? "Add your parts, materials and services, or import them from a spreadsheet (CSV)."
              : "Your company hasn't added any products yet."}
        </Card>
      ) : (
        visible.map(p => {
          const m = margin(p);
          return (
            <Card key={p.id} className="p-3" onClick={() => (canManage ? setEditing({ ...BLANK, ...p }) : setStockFor(p))}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold font-mono text-slate-500">{p.part_number || "—"}</p>
                  <p className={`text-sm font-bold truncate ${p.active === false ? "text-slate-400 line-through" : "text-slate-800"}`}>{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {[p.category, p.supplier].filter(Boolean).join(" · ")}
                    {canManage && m.percent !== null && Number(p.cost_price) > 0 ? ` · margin ${m.percent}%` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-slate-800">{rand(p.sell_price)}</p>
                  {p.track_stock && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setStockFor(p);
                      }}
                      className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${isLowStock(p) ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {qty(p.stock_on_hand)} {p.unit || ""} in stock
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}

      <ProductForm
        product={editing}
        busy={busy}
        vatRegistered={vatRegistered}
        onClose={() => setEditing(null)}
        onSave={save}
        onDelete={remove}
        onStock={p => {
          setEditing(null);
          setStockFor(p);
        }}
      />
      <StockSheet
        product={stockFor ? products.find(p => p.id === stockFor.id) || stockFor : null}
        teamId={teamId}
        canManage={canManage}
        online={online}
        onClose={() => setStockFor(null)}
      />
      <BottomSheet open={!!importing} onClose={() => setImporting(null)} title="Import products" subtitle={importing?.name}>
        {importing && (
          <div className="stack-y-3">
            <p className="text-sm text-slate-700">
              {importing.rows.length} products found. Items whose part number is already in the catalogue are updated;
              the rest are added. Stock quantities in the file are only used for new items (as opening stock).
            </p>
            <p className="text-xs text-slate-500">Columns read: {importing.columns.map(c => c.replace(/_/g, " ")).join(", ")}</p>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 stack-y-1">
              {importing.rows.slice(0, 5).map((r, i) => (
                <p key={i} className="truncate">
                  <b>{r.part_number || "—"}</b> {r.name} {r.sell_price ? `· ${rand(r.sell_price)}` : ""}
                </p>
              ))}
              {importing.rows.length > 5 && <p>…and {importing.rows.length - 5} more</p>}
            </div>
            <Btn className="w-full" onClick={runImport} disabled={busy}>
              {busy ? "Importing…" : `Import ${importing.rows.length} products`}
            </Btn>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

function ProductForm({ product, busy, vatRegistered, onClose, onSave, onDelete, onStock }) {
  const [form, setForm] = useState(product);
  useEffect(() => setForm(product), [product]);
  if (!form) return <BottomSheet open={false} onClose={onClose} />;
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  const m = margin(form);
  return (
    <BottomSheet open={!!product} onClose={onClose} title={form.id ? "Edit product" : "New product"} maxHeight="92vh">
      <div className="stack-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Part number" value={form.part_number} onChange={set("part_number")} maxLength={60} />
          <Field label="Unit" value={form.unit} onChange={set("unit")} placeholder="each, m, litre, hour" maxLength={20} />
        </div>
        <Field label="Name" value={form.name} onChange={set("name")} required maxLength={200} />
        <Field label="Description" value={form.description} onChange={set("description")} multiline maxLength={2000} />
        <Field label="Category" value={form.category} onChange={set("category")} placeholder="Filters, Labour, Hoses…" maxLength={80} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Cost price (R)" type="number" value={form.cost_price} onChange={set("cost_price")} />
          <Field label="Sell price excl. VAT (R)" type="number" value={form.sell_price} onChange={set("sell_price")} />
        </div>
        <p className="text-xs text-slate-500">
          {vatRegistered ? `With VAT: R ${linePrice(form).toFixed(2)}. ` : ""}
          {m.percent !== null ? `Margin R ${m.amount.toFixed(2)} (${m.percent}%)` : "Set a selling price to see the margin."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Supplier" value={form.supplier} onChange={set("supplier")} maxLength={120} />
          <Field label="Supplier's code" value={form.supplier_code} onChange={set("supplier_code")} maxLength={60} />
        </div>
        <Field label="Barcode" value={form.barcode} onChange={set("barcode")} maxLength={60} />
        <Toggle label="Keep track of stock" hint="Stock goes down when the item is used on a completed job" value={form.track_stock} onChange={set("track_stock")} />
        {form.track_stock && (
          <Field label="Reorder when stock is at or below" type="number" value={form.reorder_level} onChange={set("reorder_level")} />
        )}
        {form.id && <Toggle label="Active" hint="Inactive items can't be picked on quotes and jobs" value={form.active !== false} onChange={set("active")} />}
        <Btn className="w-full" onClick={() => onSave(form)} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Btn>
        {form.id && (
          <div className="grid grid-cols-2 gap-2">
            {product.track_stock ? (
              <Btn variant="secondary" size="sm" onClick={() => onStock(product)}>
                Stock
              </Btn>
            ) : (
              <span />
            )}
            <Btn variant="ghost" size="sm" onClick={() => onDelete(product)} disabled={busy}>
              Delete
            </Btn>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function StockSheet({ product, teamId, canManage, online, onClose }) {
  const [moves, setMoves] = useState([]);
  const [mode, setMode] = useState("receive");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = product?.id;

  async function loadMoves() {
    if (!id || !online) return;
    const { data } = await supabase
      .from("stock_movements")
      .select("*")
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    setMoves(data || []);
  }
  useEffect(() => {
    setMoves([]);
    setAmount("");
    setNote("");
    setError("");
    loadMoves();
  }, [id, online]);

  async function apply() {
    const n = Number(amount);
    if (!amount || !Number.isFinite(n)) return setError("Enter a quantity.");
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("adjust_stock", { p_product_id: id, p_reason: mode, p_qty: n, p_note: note });
    if (e) setError(e.message);
    else {
      setAmount("");
      setNote("");
      await Promise.all([loadProducts(supabase, teamId).catch(() => {}), loadMoves()]);
    }
    setBusy(false);
  }

  return (
    <BottomSheet open={!!product} onClose={onClose} title={product?.name || ""} subtitle={product?.part_number || ""}>
      {product && (
        <div className="stack-y-3">
          <div className="rounded-xl bg-slate-50 p-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">In stock</span>
            <span className={`text-xl font-black ${isLowStock(product) ? "text-red-700" : "text-slate-900"}`}>
              {qty(product.stock_on_hand)} {product.unit || ""}
            </span>
          </div>
          {product.track_stock && Number(product.reorder_level) > 0 && (
            <p className="text-xs text-slate-500">Reorder at {qty(product.reorder_level)}</p>
          )}
          {!product.track_stock && <p className="text-sm text-slate-500">Stock isn't tracked for this item.</p>}
          {canManage && product.track_stock && (
            <div className="stack-y-2">
              <FilterPills
                options={["Received", "Stock count", "Correction"]}
                value={{ receive: "Received", count: "Stock count", adjust: "Correction" }[mode]}
                onChange={v => setMode({ Received: "receive", "Stock count": "count", Correction: "adjust" }[v])}
              />
              <p className="text-xs text-slate-500">
                {mode === "receive"
                  ? "How many came in."
                  : mode === "count"
                    ? "How many you counted on the shelf; stock is set to this."
                    : "Plus or minus, e.g. -2 for damaged items."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity" type="number" value={amount} onChange={setAmount} />
                <Field label="Note" value={note} onChange={setNote} placeholder="Invoice no., reason…" maxLength={300} />
              </div>
              {error && <p className="text-sm text-red-700">{error}</p>}
              <Btn className="w-full" onClick={apply} disabled={busy || !online}>
                {busy ? "Saving…" : online ? "Update stock" : "Needs internet"}
              </Btn>
            </div>
          )}
          {moves.length > 0 && (
            <div className="stack-y-1">
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">History</p>
              {moves.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-xs">
                  <span className="min-w-0 truncate text-slate-600">
                    {new Date(m.created_at).toLocaleDateString("en-ZA")} · {REASONS[m.reason] || m.reason}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                  <span className={`font-bold shrink-0 ${Number(m.qty_change) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {Number(m.qty_change) > 0 ? "+" : ""}
                    {qty(m.qty_change)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
