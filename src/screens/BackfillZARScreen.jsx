// ─── Backfill ZAR ─────────────────────────────────────────────────────────────
// Finds expenses saved without a ZAR figure (typically foreign-currency
// receipts saved before the historical-rate fallback existed, or while the
// API key wasn't yet configured) and lets the user fix them — either by
// running the real historical-rate lookup now, or by typing in the actual
// amount from their bank statement (which is the most accurate number
// there is, since it's literally what they were charged).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo } from "react";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, Btn } from "../components/ui";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "../lib/sync";
import { genId, smartDate } from "../lib/helpers";
import { convertToZAR } from "../lib/exchangeRate";

function fmtMoney(amount, currency = "ZAR") {
  const sym = currency === "ZAR" ? "R" : currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : "";
  const n = parseFloat(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sym ? `${sym}${n}` : `${n} ${currency}`;
}

export function BackfillZARScreen({ data, setData, userId, onBack }) {
  const expenses = data.expenses || [];

  // Anything in a foreign currency with no ZAR figure recorded.
  const missing = useMemo(() =>
    expenses.filter(e => e.currency && e.currency !== "ZAR" && (!e.amount_zar || e.amount_zar <= 0)),
    [expenses]
  );

  const [statuses, setStatuses] = useState({}); // id -> "working" | "done" | "failed" | "manual"
  const [manualValues, setManualValues] = useState({}); // id -> string being typed
  const [runningAll, setRunningAll] = useState(false);

  function applyZar(expense, zarInfo) {
    const updated = {
      ...expense,
      amount_zar:    zarInfo.zar,
      exchange_rate: zarInfo.rate,
      rate_date:     zarInfo.rateDate,
      rate_source:   zarInfo.source,
      sync_status:   "pending",
    };
    setData(d => ({
      ...d,
      expenses: (d.expenses || []).map(e => e.id === expense.id ? updated : e),
      syncQueue: [
        {
          id: genId(), table: "expenses", action: "update",
          data: {
            id: updated.id,
            amount_zar: updated.amount_zar,
            exchange_rate: updated.exchange_rate,
            rate_date: updated.rate_date,
            rate_source: updated.rate_source,
            sync_status: "pending",
          },
          status: "pending", created_at: new Date().toISOString(),
        },
        ...(d.syncQueue || []),
      ],
    }));
    offlineSave("expenses", updated);
  }

  async function fixOne(expense) {
    setStatuses(s => ({ ...s, [expense.id]: "working" }));
    const result = await convertToZAR(expense.amount, expense.currency, expense.expense_date || undefined);
    if (result) {
      applyZar(expense, result);
      setStatuses(s => ({ ...s, [expense.id]: "done" }));
    } else {
      setStatuses(s => ({ ...s, [expense.id]: "failed" }));
    }
  }

  async function fixAll() {
    setRunningAll(true);
    for (const e of missing) {
      if (statuses[e.id] === "done") continue; // already fixed this session
      await fixOne(e);
    }
    setRunningAll(false);
    triggerImmediateSync();
  }

  function saveManual(expense) {
    const val = parseFloat(manualValues[expense.id]);
    if (isNaN(val) || val <= 0) return;
    applyZar(expense, {
      zar: val,
      rate: parseFloat(expense.amount) > 0 ? val / parseFloat(expense.amount) : 0,
      rateDate: expense.expense_date || new Date().toISOString().slice(0, 10),
      source: "Manual entry",
    });
    setStatuses(s => ({ ...s, [expense.id]: "done" }));
    triggerImmediateSync();
  }

  const fixedCount = Object.values(statuses).filter(s => s === "done").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center">
          <ArrowLeft size={20} />
        </button>
        <div>
          <p className="text-2xl font-black text-slate-900">Backfill ZAR</p>
          <p className="text-sm text-slate-500">{missing.length} expense{missing.length !== 1 ? "s" : ""} missing a ZAR amount{fixedCount > 0 ? ` · ${fixedCount} fixed this session` : ""}</p>
        </div>
      </div>

      {missing.length === 0 ? (
        <Card className="p-6 text-center">
          <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
          <p className="text-base font-bold text-slate-700">Nothing to fix</p>
          <p className="text-sm text-slate-400 mt-1">Every foreign-currency expense already has a ZAR amount.</p>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <Btn onClick={fixAll} disabled={runningAll} className="w-full">
              <RefreshCw size={14} className={runningAll ? "animate-spin" : ""} />
              {runningAll ? "Converting…" : `Try to fix all ${missing.length} automatically`}
            </Btn>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Uses the real historical rate for each expense's actual date. Anything it can't
              resolve (e.g. the API key isn't set, or that date has no data) stays in the list
              below for you to enter manually from your bank statement.
            </p>
          </Card>

          <div className="space-y-2">
            {missing.map(e => {
              const status = statuses[e.id];
              return (
                <Card key={e.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{e.vendor || "Unknown vendor"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmtMoney(e.amount, e.currency)} · {e.expense_date ? smartDate(e.expense_date) : "No date"}
                      </p>
                    </div>
                    {status === "done" && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-green-600">
                        <CheckCircle2 size={14} /> Fixed
                      </span>
                    )}
                  </div>

                  {status !== "done" && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                      {status === "failed" && (
                        <p className="text-xs text-amber-700 flex items-center gap-1.5">
                          <AlertCircle size={12} /> No rate found for that date — enter the real amount below.
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Btn size="sm" variant="secondary" onClick={() => fixOne(e)} disabled={status === "working"}>
                          <RefreshCw size={12} className={status === "working" ? "animate-spin" : ""} />
                          {status === "working" ? "…" : "Try auto"}
                        </Btn>
                        <span className="text-xs text-slate-400">or</span>
                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="text-sm font-bold text-slate-500">R</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="from bank statement"
                            value={manualValues[e.id] || ""}
                            onChange={ev => setManualValues(v => ({ ...v, [e.id]: ev.target.value.replace(",", ".") }))}
                            className="flex-1 rounded-lg border-2 border-slate-100 bg-white px-2.5 py-2 text-sm outline-none focus:border-red-300 min-h-[40px]"
                          />
                          <Btn size="sm" onClick={() => saveManual(e)} disabled={!manualValues[e.id]}>Save</Btn>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
