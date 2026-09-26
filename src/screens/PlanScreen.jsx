// ─── Plan & billing ───────────────────────────────────────────────────────────
// The company's plan, users and what's included; the master account picks a
// plan and pays monthly through PayFast (card or debit order). The `billing`
// edge function signs the subscription with the price from the platform's
// price list; each confirmed payment extends the plan by a month.
import React, { useEffect, useState } from "react";
import { Check, CreditCard, Lock, Users } from "lucide-react";
import { supabase } from "../supabase";
import { FEATURES, PAID_PLANS, fmtRand, trialDaysLeft } from "../lib/plan";
import { Btn, Card, PageHeader, Toast } from "../components/ui";

const fmtDate = d => (d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "");
const PLAN_NAMES = { trial: "Free trial", free: "Free" };

// PayFast's payment page takes a posted form.
function postForm(url, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  for (const [k, v] of fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

// The edge function's own message when it says no.
async function errorMessage(error, fallback) {
  try {
    const body = await error?.context?.json?.();
    return body?.message || body?.error || fallback;
  } catch {
    return fallback;
  }
}

export function PlanScreen({ teamId, plan, isOwner, onHelp, onChanged }) {
  const [catalogue, setCatalogue] = useState(null);
  const [available, setAvailable] = useState(false);
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [justPaid] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("paid") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.rpc("plan_catalogue"),
      supabase.rpc("billing_available"),
      isOwner ? supabase.from("billing_payments").select("*").eq("team_id", teamId).order("paid_at", { ascending: false }).limit(24) : null,
    ]).then(
      ([c, a, p]) => {
        if (!live) return;
        setCatalogue(c.data || {});
        setAvailable(a.data === true);
        setPayments(p?.data || []);
      },
      () => live && setCatalogue({}),
    );
    return () => {
      live = false;
    };
  }, [teamId, isOwner]);

  // Back from PayFast: the confirmation arrives a moment later.
  useEffect(() => {
    if (!justPaid) return;
    const t = setTimeout(() => onChanged?.(), 4000);
    return () => clearTimeout(t);
  }, [justPaid, onChanged]);

  async function choose(key) {
    setBusy(key);
    const back = `${window.location.origin}${window.location.pathname}?screen=Plan`;
    const { data, error } = await supabase.functions.invoke("billing", { body: { action: "checkout", plan: key, return_url: back } });
    if (error || !data?.url) {
      setBusy("");
      return setToast(await errorMessage(error, "Couldn't open PayFast. Please try again."));
    }
    postForm(data.url, data.fields);
  }

  async function cancel() {
    if (!window.confirm("Cancel the monthly payments? Your plan stays until the end of the month you've paid for.")) return;
    setBusy("cancel");
    const { error } = await supabase.functions.invoke("billing", { body: { action: "cancel" } });
    setBusy("");
    if (error) return setToast(await errorMessage(error, "Couldn't cancel. Please contact us."));
    setToast("Cancelled. No further payments will be taken.");
    onChanged?.();
  }

  const current = plan?.plan || "trial";
  const days = trialDaysLeft(plan);
  const subscribed = plan?.billing_status === "active";
  const currentName = catalogue?.[current]?.name || PLAN_NAMES[current] || current;

  return (
    <div className="stack-y-4">
      <PageHeader title="Plan & billing" subtitle="What your company's plan includes, and paying for it" />

      {justPaid && (
        <div role="status" className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-900">
          Thank you! PayFast is confirming your payment; your plan updates in a minute or two.
        </div>
      )}

      <Card className="p-4 stack-y-2">
        <p className="text-xs font-bold text-slate-500">YOUR PLAN</p>
        <p className="text-xl font-black text-slate-900">{currentName}</p>
        <p className="text-sm text-slate-600">
          {current === "trial" && days !== null && `${days} day${days === 1 ? "" : "s"} left of your free trial. Everything is included while you try it.`}
          {current === "free" && "Everything is included."}
          {PAID_PLANS.includes(current) && plan?.paid_until && `Paid until ${fmtDate(plan.paid_until)}.`}
          {subscribed && " Renews every month by PayFast."}
          {plan?.billing_status === "cancelled" && " Monthly payments cancelled; the plan ends when the paid month runs out."}
        </p>
        <p className="text-sm text-slate-600 flex items-center gap-1.5">
          <Users size={14} />
          {plan?.seats_used ?? "—"} user{plan?.seats_used === 1 ? "" : "s"}
          {plan?.seats ? ` of ${plan.seats}` : " · no user limit"}
        </p>
        {isOwner && subscribed && (
          <Btn size="sm" variant="ghost" onClick={cancel} disabled={busy === "cancel"}>
            Cancel monthly payments
          </Btn>
        )}
      </Card>

      {!isOwner && (
        <Card className="p-4 text-sm text-slate-600 flex gap-2">
          <Lock size={16} className="shrink-0 mt-0.5" />
          Only your company's master account can change the plan.
        </Card>
      )}

      {catalogue &&
        PAID_PLANS.filter(k => catalogue[k]).map(key => {
          const p = catalogue[key];
          const isCurrent = key === current && PAID_PLANS.includes(current);
          return (
            <Card key={key} className={`p-4 stack-y-3 ${isCurrent ? "ring-2 ring-green-500" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg font-black text-slate-900">{p.name}</p>
                <p className="text-lg font-black text-slate-900">
                  {fmtRand(p.price)}
                  <span className="text-xs font-bold text-slate-500"> / month</span>
                </p>
              </div>
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Users size={14} /> {p.seats ? `Up to ${p.seats} users` : "Unlimited users"}
              </p>
              <ul className="stack-y-1 text-sm">
                <li className="flex gap-2 text-slate-700">
                  <Check size={16} className="text-green-600 shrink-0" /> Clients, quotes, jobs, invoices, expenses and reports
                </li>
                {Object.entries(FEATURES).map(([f, x]) => {
                  const has = (p.features || []).includes(f);
                  return (
                    <li key={f} className={`flex gap-2 ${has ? "text-slate-700" : "text-slate-400 line-through"}`}>
                      <Check size={16} className={`shrink-0 ${has ? "text-green-600" : "text-slate-300"}`} /> {x.label}
                    </li>
                  );
                })}
              </ul>
              {isOwner &&
                (isCurrent && subscribed ? (
                  <p className="text-sm font-bold text-green-700">Your current plan</p>
                ) : available && !subscribed ? (
                  <Btn size="sm" onClick={() => choose(key)} disabled={!!busy}>
                    <CreditCard size={14} /> {busy === key ? "Opening PayFast…" : `Choose ${p.name}`}
                  </Btn>
                ) : (
                  <Btn size="sm" variant="secondary" onClick={onHelp}>
                    {subscribed ? "Change plan: contact us" : `Ask for ${p.name}`}
                  </Btn>
                ))}
            </Card>
          );
        })}

      {isOwner && available && (
        <p className="text-xs text-slate-500 px-1">
          Paid monthly by card or debit order through PayFast. Cancel any time; your plan runs to the end of the month you've paid for.
          To switch plans, cancel and choose the new one.
        </p>
      )}

      {isOwner && payments.length > 0 && (
        <Card className="p-4 stack-y-2">
          <p className="text-sm font-black text-slate-800">Payments</p>
          {payments.map(p => (
            <div key={p.id} className="flex justify-between gap-2 text-sm">
              <span className="text-slate-600">
                {fmtDate(p.paid_at)} · {catalogue?.[p.plan]?.name || p.plan}
              </span>
              <span className="font-bold text-slate-800">{fmtRand(p.amount)}</span>
            </div>
          ))}
        </Card>
      )}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
