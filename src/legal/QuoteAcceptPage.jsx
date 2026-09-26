// ─── Quote for the customer (/?quote=TOKEN) ───────────────────────────────────
// Opens without signing in. Shows the quote with the company's branding and
// lets the customer accept it (name, signature, optional order number) or
// decline it. Everything goes through get_shared_quote /
// respond_to_shared_quote, which check the link's token.
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { buildDocumentPDF, documentFilename, documentTotals, money, shareDocumentPDF } from "../lib/documentPDF";
import { parseItems } from "../lib/documentData";

export function sharedQuoteTokenFromUrl() {
  try {
    const t = new URLSearchParams(window.location.search).get("quote") || "";
    return /^[0-9a-f]{48}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}

function SignaturePad({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = ref.current;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
  }, []);
  const pos = e => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = e => {
    drawing.current = true;
    ref.current.setPointerCapture?.(e.pointerId);
    const ctx = ref.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(...pos(e));
  };
  const move = e => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext("2d");
    ctx.lineTo(...pos(e));
    ctx.stroke();
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(null);
  };
  return (
    <div>
      <canvas
        ref={ref}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        aria-label="Sign here"
        className="w-full h-36 rounded-xl border-2 border-dashed border-slate-300 bg-white touch-none"
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{empty ? "Sign with your finger or mouse" : "Signed"}</span>
        <button type="button" onClick={clear} className="font-bold underline">
          Clear
        </button>
      </div>
    </div>
  );
}

export function QuoteAcceptPage({ token }) {
  const [data, setData] = useState(undefined);
  const [name, setName] = useState("");
  const [po, setPo] = useState("");
  const [signature, setSignature] = useState(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    supabase.rpc("get_shared_quote", { p_token: token }).then(
      ({ data: d }) => setData(d || null),
      () => setData(null),
    );
  }, [token]);

  if (data === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-slate-600">
        This link has expired or isn't valid. Please ask for a new one.
      </div>
    );

  const q = data.quote;
  const co = data.company || {};
  const items = parseItems(q.line_items);
  const lines = items.length ? items : [{ description: q.description || "Quotation", qty: 1, unitPrice: Number(q.value) || 0 }];
  const vatOn = co.vat_registered !== false;
  const t = documentTotals(lines, { vatInclusive: q.vat_inclusive !== false, vatRegistered: vatOn });
  const color = co.brand_color || "#8B1A1A";
  const answered = q.accepted_at || q.declined_at || done;

  async function respond(accept) {
    setBusy(true);
    setError("");
    const { data: r, error: e } = await supabase.rpc("respond_to_shared_quote", {
      p_token: token,
      p_accept: accept,
      p_name: name,
      p_signature: signature,
      p_po: po,
      p_reason: reason,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setDone(r?.status === "Accepted" ? "accepted" : "declined");
  }

  async function downloadPdf() {
    const doc = {
      kind: "quote",
      number: q.number,
      date: q.date,
      validUntil: q.expiry_date,
      client: { name: data.client },
      items: lines,
      vatInclusive: q.vat_inclusive !== false,
      title: q.title,
      intro: q.intro,
      exclusions: q.exclusions,
      notes: items.length && !q.intro ? q.description : "",
    };
    const profile = { trading_name: co.name, legal_name: co.legal_name, logo_data: co.logo_data, brand_color: co.brand_color, vat_no: co.vat_no, vat_registered: co.vat_registered, phone: co.phone, email: co.email, quote_terms: co.quote_terms };
    const blob = await buildDocumentPDF(doc, profile);
    await shareDocumentPDF(blob, documentFilename(doc, profile), `Quotation ${q.number}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="h-2" style={{ background: color }} />
      <div className="mx-auto max-w-2xl px-4 py-6 stack-y-4">
        <div className="flex items-center justify-between gap-3">
          {co.logo_data ? <img src={co.logo_data} alt={co.name} className="max-h-14 max-w-[200px] object-contain" /> : <p className="text-xl font-black" style={{ color }}>{co.name}</p>}
          <div className="text-right text-xs text-slate-500">
            {co.phone && <p>{co.phone}</p>}
            {co.email && <p>{co.email}</p>}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200 p-5 stack-y-3">
          <p className="text-xs font-bold tracking-widest" style={{ color }}>QUOTATION {q.number}</p>
          {q.title && <h1 className="text-xl font-black text-slate-900">{q.title}</h1>}
          <p className="text-sm text-slate-600">
            For <b>{data.client}</b> · {new Date(q.date).toLocaleDateString("en-ZA")}
            {q.expiry_date ? ` · valid until ${new Date(q.expiry_date).toLocaleDateString("en-ZA")}` : ""}
          </p>
          {q.intro && <p className="text-sm text-slate-700 whitespace-pre-line">{q.intro}</p>}
          <table className="w-full text-sm">
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 pr-2">{l.description}</td>
                  <td className="py-2 px-2 text-right text-slate-500 whitespace-nowrap">× {l.qty}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{money(l.qty * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm text-right stack-y-1">
            {vatOn && <p className="text-slate-500">Subtotal {money(t.subtotal)} · VAT {money(t.vat)}</p>}
            <p className="text-lg font-black text-slate-900">Total {money(t.total)}</p>
          </div>
          {q.exclusions && (
            <p className="text-xs text-slate-600 whitespace-pre-line">
              <b>Exclusions:</b> {q.exclusions}
            </p>
          )}
          {co.quote_terms && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-bold">Terms and conditions</summary>
              <p className="mt-2 whitespace-pre-line">{co.quote_terms}</p>
            </details>
          )}
          <button type="button" onClick={downloadPdf} className="text-sm font-bold underline" style={{ color }}>
            Download PDF
          </button>
        </div>

        {answered ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-5 text-center">
            <p className="text-lg font-black text-slate-900">
              {done === "accepted" || q.accepted_at ? "Quote accepted — thank you!" : "Quote declined"}
            </p>
            <p className="text-sm text-slate-500 mt-1">{co.name} has been notified.</p>
          </div>
        ) : declining ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-5 stack-y-3">
            <p className="font-black text-slate-900">Decline this quote</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={1000} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-base" />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeclining(false)} className="rounded-xl border border-slate-300 py-3 font-bold min-h-[48px]">Back</button>
              <button type="button" onClick={() => respond(false)} disabled={busy} className="rounded-xl bg-slate-800 text-white py-3 font-bold min-h-[48px]">Decline</button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 p-5 stack-y-3">
            <p className="font-black text-slate-900">Accept this quote</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" maxLength={120} aria-label="Your full name" className="w-full rounded-xl border border-slate-200 p-3 text-base" />
            <input value={po} onChange={e => setPo(e.target.value)} placeholder="Order number (optional)" maxLength={60} aria-label="Order number" className="w-full rounded-xl border border-slate-200 p-3 text-base" />
            <SignaturePad onChange={setSignature} />
            <p className="text-xs text-slate-500">By accepting you agree to this quotation and its terms and conditions.</p>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="button" onClick={() => respond(true)} disabled={busy || !name.trim() || !signature} className="w-full rounded-xl py-3.5 font-black text-white min-h-[52px] disabled:opacity-50" style={{ background: color }}>
              {busy ? "Sending…" : "Accept quote"}
            </button>
            <button type="button" onClick={() => setDeclining(true)} className="w-full text-sm font-bold text-slate-500 min-h-[44px]">
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
