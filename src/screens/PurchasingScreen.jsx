// ─── Suppliers & purchase orders ──────────────────────────────────────────────
// Order parts from suppliers (optionally for a job), send the order as a PDF,
// and receive it: tracked items go into stock and their cost price updates.
// What's bought for a job counts in Job profit. Everyone in the company can
// see orders; the master account and admins create and receive them.
import React, { useEffect, useMemo, useState } from "react";
import { FileText, PackageCheck, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { supabase } from "../supabase";
import { useProducts, loadProducts } from "../lib/products";
import { useCompanyProfile } from "../lib/companyProfile";
import { buildDocumentPDF, documentFilename, shareDocumentPDF, money } from "../lib/documentPDF";
import { PO_STATUS, blankLine, cleanLines, lowStockOrders, outstanding, poToDocument, poTotals, productLine } from "../lib/purchasing";
import { BottomSheet } from "../components/BottomSheet";
import { ProductPicker } from "../components/ProductPicker";
import { Btn, Card, Field, PageHeader, Toast } from "../components/ui";

const today = () => new Date().toISOString().slice(0, 10);
const fmt = d => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "");

function SupplierSheet({ supplier, teamId, onClose, onSaved }) {
  const [f, setF] = useState(supplier || { name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = k => v => setF(x => ({ ...x, [k]: v }));
  async function save() {
    if (!f.name?.trim()) return setError("Give the supplier a name");
    setBusy(true);
    const row = {
      team_id: teamId,
      name: f.name.trim(),
      contact_name: f.contact_name || null,
      email: f.email || null,
      phone: f.phone || null,
      account_no: f.account_no || null,
      vat_number: f.vat_number || null,
      address: f.address || null,
      notes: f.notes || null,
    };
    const q = f.id ? supabase.from("suppliers").update(row).eq("id", f.id) : supabase.from("suppliers").insert(row);
    const { error: e } = await q;
    setBusy(false);
    if (e) return setError(e.message);
    onSaved();
  }
  return (
    <BottomSheet open onClose={onClose} title={f.id ? "Edit supplier" : "New supplier"}>
      <div className="stack-y-3">
        <Field label="Name" value={f.name} onChange={set("name")} required maxLength={160} />
        <Field label="Contact person" value={f.contact_name || ""} onChange={set("contact_name")} maxLength={120} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Email (orders go here)" type="email" value={f.email || ""} onChange={set("email")} maxLength={160} />
          <Field label="Phone" type="tel" value={f.phone || ""} onChange={set("phone")} maxLength={40} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Our account no." value={f.account_no || ""} onChange={set("account_no")} maxLength={60} />
          <Field label="Their VAT no." value={f.vat_number || ""} onChange={set("vat_number")} maxLength={30} />
        </div>
        <Field label="Address" value={f.address || ""} onChange={set("address")} multiline maxLength={500} />
        <Field label="Notes" value={f.notes || ""} onChange={set("notes")} multiline maxLength={2000} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save supplier"}
        </Btn>
      </div>
    </BottomSheet>
  );
}

function OrderSheet({ order, teamId, suppliers, jobs, products, vatRegistered, onClose, onSaved }) {
  const [po, setPo] = useState(() => order || { status: "draft", order_date: today(), lines: [blankLine()] });
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = k => v => setPo(x => ({ ...x, [k]: v }));
  const setLine = (i, k, v) => setPo(x => ({ ...x, lines: x.lines.map((l, n) => (n === i ? { ...l, [k]: v } : l)) }));
  const t = poTotals(po.lines, { vatRegistered });
  const locked = ["partial", "received", "cancelled"].includes(order?.status);

  async function save(status = po.status) {
    const lines = cleanLines(po.lines);
    if (!po.supplier_id && !po.supplier_name?.trim()) return setError("Choose a supplier");
    if (!lines.length) return setError("Add at least one item");
    setBusy(true);
    const supplier = suppliers.find(s => s.id === po.supplier_id);
    const row = {
      team_id: teamId,
      supplier_id: po.supplier_id || null,
      supplier_name: supplier?.name || po.supplier_name || null,
      job_id: po.job_id || null,
      status,
      order_date: po.order_date || today(),
      expected_date: po.expected_date || null,
      supplier_ref: po.supplier_ref || null,
      notes: po.notes || null,
      lines,
      ...poTotals(lines, { vatRegistered }),
    };
    const q = po.id ? supabase.from("purchase_orders").update(row).eq("id", po.id) : supabase.from("purchase_orders").insert(row);
    const { error: e } = await q;
    setBusy(false);
    if (e) return setError(e.message);
    onSaved(status === "sent" ? "Order placed" : "Saved");
  }

  return (
    <BottomSheet open onClose={onClose} title={po.po_number || "New purchase order"} subtitle="Prices exclude VAT" maxHeight="92vh">
      <div className="stack-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-500">Supplier</span>
          <select
            value={po.supplier_id || ""}
            onChange={e => set("supplier_id")(e.target.value || null)}
            disabled={locked}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-base min-h-[52px]"
          >
            <option value="">{po.supplier_name ? `${po.supplier_name} (not in your list)` : "Choose…"}</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-500">For a job (optional; counts in Job profit)</span>
          <select
            value={po.job_id || ""}
            onChange={e => set("job_id")(e.target.value || null)}
            disabled={locked}
            className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-base min-h-[52px]"
          >
            <option value="">Stock, not for a job</option>
            {jobs.map(j => (
              <option key={j.id} value={j.id}>
                {j.job_number || "Job"} · {j.title}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Order date" type="date" value={po.order_date || ""} onChange={set("order_date")} />
          <Field label="Deliver by" type="date" value={po.expected_date || ""} onChange={set("expected_date")} />
        </div>

        <p className="text-sm font-black text-slate-800 pt-1">Items</p>
        {po.lines.map((l, i) => (
          <div key={i} className="rounded-xl bg-slate-50 p-3 stack-y-2">
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Field label={l.part_number ? `Item · ${l.part_number}` : "Item"} value={l.description} onChange={v => setLine(i, "description", v)} maxLength={300} />
              </div>
              {!locked && (
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => setPo(x => ({ ...x, lines: x.lines.filter((_, n) => n !== i) }))}
                  className="mt-8 p-2 text-slate-400 min-h-[44px]"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Qty" type="number" value={String(l.qty ?? "")} onChange={v => setLine(i, "qty", v)} />
              <Field label="Unit cost" type="number" value={String(l.unit_cost ?? "")} onChange={v => setLine(i, "unit_cost", v)} />
              <div className="pt-7 text-right text-sm font-bold text-slate-700">{money((Number(l.qty) || 0) * (Number(l.unit_cost) || 0))}</div>
            </div>
            {Number(l.received_qty) > 0 && <p className="text-xs text-green-700">{l.received_qty} received</p>}
          </div>
        ))}
        {!locked && (
          <div className="grid grid-cols-2 gap-2">
            <Btn size="sm" variant="secondary" onClick={() => setPicking(true)}>
              <Plus size={14} /> From catalogue
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setPo(x => ({ ...x, lines: [...x.lines, blankLine()] }))}>
              <Plus size={14} /> Other item
            </Btn>
          </div>
        )}
        <div className="text-right text-sm text-slate-600">
          Subtotal {money(t.subtotal)}
          {vatRegistered ? ` · VAT ${money(t.vat)}` : ""} · <b className="text-slate-900">Total {money(t.total)}</b>
        </div>
        <Field label="Their reference / quote no." value={po.supplier_ref || ""} onChange={set("supplier_ref")} maxLength={60} />
        <Field label="Notes for the supplier (delivery address, etc.)" value={po.notes || ""} onChange={set("notes")} multiline maxLength={2000} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!locked && (
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="secondary" onClick={() => save("draft")} disabled={busy}>
              Save draft
            </Btn>
            <Btn onClick={() => save("sent")} disabled={busy}>
              <Truck size={14} /> Place order
            </Btn>
          </div>
        )}
      </div>
      <ProductPicker
        open={picking}
        onClose={() => setPicking(false)}
        products={products}
        title="Order from catalogue"
        onPick={p => {
          setPo(x => ({ ...x, lines: [...x.lines.filter(l => l.description || l.product_id), productLine(p)] }));
          setPicking(false);
        }}
      />
    </BottomSheet>
  );
}

function ReceiveSheet({ po, onClose, onDone }) {
  const lines = cleanLines(po.lines);
  const [qty, setQty] = useState(() => lines.map(l => String(Math.max(0, l.qty - l.received_qty))));
  const [updateCosts, setUpdateCosts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function receive() {
    setBusy(true);
    const { data, error: e } = await supabase.rpc("receive_purchase_order", {
      p_po_id: po.id,
      p_lines: qty.map((q, i) => ({ i, qty: Number(q) || 0 })),
      p_update_costs: updateCosts,
    });
    setBusy(false);
    if (e) return setError(e.message);
    onDone(data?.status === "received" ? "All received; stock updated" : "Received; the rest is still to come");
  }
  return (
    <BottomSheet open onClose={onClose} title={`Receive ${po.po_number || ""}`} subtitle="What arrived today">
      <div className="stack-y-3">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1 text-sm text-slate-700">
              {l.description}
              <span className="block text-xs text-slate-500">
                {l.received_qty} of {l.qty} received
              </span>
            </span>
            <div className="w-24">
              <Field label="Now" type="number" value={qty[i]} onChange={v => setQty(x => x.map((y, n) => (n === i ? v : y)))} />
            </div>
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm text-slate-700 min-h-[44px]">
          <input type="checkbox" checked={updateCosts} onChange={e => setUpdateCosts(e.target.checked)} className="h-5 w-5" />
          Update catalogue cost prices to this order's prices
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Btn onClick={receive} disabled={busy}>
          <PackageCheck size={14} /> {busy ? "Receiving…" : "Receive into stock"}
        </Btn>
      </div>
    </BottomSheet>
  );
}

export function PurchasingScreen({ teamId, canManage = false }) {
  const profile = useCompanyProfile(teamId);
  const products = useProducts(supabase, teamId);
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("open");
  const [editing, setEditing] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [receiving, setReceiving] = useState(null);
  const [toast, setToast] = useState("");
  const vatRegistered = profile.vat_registered !== false;

  async function load() {
    const [o, s, j] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("team_id", teamId).order("created_at", { ascending: false }).limit(300),
      supabase.from("suppliers").select("*").eq("team_id", teamId).order("name"),
      supabase.from("jobs").select("id, job_number, title, status").eq("team_id", teamId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(200),
    ]);
    setOrders(o.data || []);
    setSuppliers(s.data || []);
    setJobs(j.data || []);
  }
  useEffect(() => {
    if (teamId) load();
    // Loads once per company; saves reload explicitly.
  }, [teamId]);

  const low = useMemo(() => lowStockOrders(products, suppliers), [products, suppliers]);
  const shown = orders.filter(o =>
    status === "open" ? ["draft", "sent", "partial"].includes(o.status) : status === "all" ? true : o.status === status,
  );
  const saved = msg => {
    setEditing(null);
    setEditingSupplier(null);
    setReceiving(null);
    setToast(msg);
    load();
    loadProducts(supabase, teamId).catch(() => {});
  };

  async function pdf(po) {
    try {
      const doc = poToDocument(po, {
        supplier: suppliers.find(s => s.id === po.supplier_id),
        job: jobs.find(j => j.id === po.job_id),
        vatRegistered,
      });
      const blob = await buildDocumentPDF(doc, profile);
      await shareDocumentPDF(blob, documentFilename(doc, profile), `Purchase order ${po.po_number || ""}`);
    } catch (e) {
      setToast(e.message || "Couldn't make the PDF");
    }
  }
  async function cancel(po) {
    if (!window.confirm(`Cancel ${po.po_number}?`)) return;
    const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", po.id);
    if (error) return setToast(error.message);
    saved("Cancelled");
  }

  return (
    <div className="stack-y-4">
      <PageHeader title="Suppliers & orders" subtitle="Order parts, send the order, receive it into stock" />
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {[
          ["orders", `Orders (${orders.filter(o => ["draft", "sent", "partial"].includes(o.status)).length} open)`],
          ["suppliers", `Suppliers (${suppliers.length})`],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg py-2 text-xs font-bold min-h-[44px] ${tab === k ? "bg-white shadow-xs text-slate-900" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          {canManage && (
            <Btn onClick={() => setEditing({})}>
              <ShoppingCart size={16} /> New purchase order
            </Btn>
          )}
          {canManage && low.length > 0 && (
            <Card className="p-4 stack-y-2">
              <p className="text-sm font-black text-slate-800">Running low</p>
              {low.map(g => (
                <div key={g.supplier_id || g.supplier_name} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-slate-700">
                    {g.supplier_name || "No supplier set"} · {g.lines.length} item{g.lines.length === 1 ? "" : "s"}
                  </span>
                  <Btn size="sm" variant="secondary" onClick={() => setEditing({ status: "draft", order_date: today(), ...g })}>
                    Order
                  </Btn>
                </div>
              ))}
            </Card>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              ["open", "Open"],
              ["received", "Received"],
              ["cancelled", "Cancelled"],
              ["all", "All"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatus(k)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold min-h-[36px] ${status === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {shown.length === 0 && <Card className="p-6 text-center text-slate-500">No orders here.</Card>}
          {shown.map(po => {
            const st = PO_STATUS[po.status] || PO_STATUS.draft;
            const job = jobs.find(j => j.id === po.job_id);
            return (
              <Card key={po.id} className="p-4 stack-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 truncate">
                      {po.po_number || "Draft"} · {po.supplier_name || "Supplier"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {fmt(po.order_date)}
                      {po.expected_date ? ` · due ${fmt(po.expected_date)}` : ""}
                      {job ? ` · for ${job.job_number || job.title}` : ""} · {cleanLines(po.lines).length} items
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.style}`}>{st.label}</span>
                    <p className="text-sm font-bold text-slate-800 mt-1">{money(po.total)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" variant="secondary" onClick={() => pdf(po)}>
                    <FileText size={14} /> PDF
                  </Btn>
                  {canManage && ["draft", "sent", "partial"].includes(po.status) && (
                    <Btn size="sm" variant="ghost" onClick={() => setEditing(po)}>
                      {po.status === "draft" ? "Edit" : "View"}
                    </Btn>
                  )}
                  {canManage && ["sent", "partial"].includes(po.status) && outstanding(po) > 0 && (
                    <Btn size="sm" onClick={() => setReceiving(po)}>
                      <PackageCheck size={14} /> Receive
                    </Btn>
                  )}
                  {canManage && ["draft", "sent"].includes(po.status) && (
                    <Btn size="sm" variant="ghost" onClick={() => cancel(po)}>
                      Cancel
                    </Btn>
                  )}
                </div>
              </Card>
            );
          })}
        </>
      )}

      {tab === "suppliers" && (
        <>
          {canManage && (
            <Btn onClick={() => setEditingSupplier({})}>
              <Plus size={16} /> New supplier
            </Btn>
          )}
          {suppliers.length === 0 && <Card className="p-6 text-center text-slate-500">No suppliers yet.</Card>}
          {suppliers.map(s => (
            <Card key={s.id} className="p-4" onClick={canManage ? () => setEditingSupplier(s) : undefined}>
              <p className="font-black text-slate-900">{s.name}</p>
              <p className="text-xs text-slate-500">
                {[s.contact_name, s.phone, s.email, s.account_no ? `acc ${s.account_no}` : ""].filter(Boolean).join(" · ") || "No contact details"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {orders.filter(o => o.supplier_id === s.id && o.status !== "cancelled").length} orders · {money(orders.filter(o => o.supplier_id === s.id && o.status !== "cancelled").reduce((t, o) => t + Number(o.total || 0), 0))}
              </p>
            </Card>
          ))}
        </>
      )}

      {editing && (
        <OrderSheet
          order={editing.id ? editing : { status: "draft", order_date: today(), lines: [blankLine()], ...editing }}
          teamId={teamId}
          suppliers={suppliers}
          jobs={jobs}
          products={products}
          vatRegistered={vatRegistered}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {editingSupplier && (
        <SupplierSheet
          supplier={editingSupplier.id ? editingSupplier : null}
          teamId={teamId}
          onClose={() => setEditingSupplier(null)}
          onSaved={() => saved("Supplier saved")}
        />
      )}
      {receiving && <ReceiveSheet po={receiving} onClose={() => setReceiving(null)} onDone={saved} />}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
