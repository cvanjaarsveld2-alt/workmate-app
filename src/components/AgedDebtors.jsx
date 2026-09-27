// ─── Aged debtors (on the Invoices screen) ───────────────────────────────────
import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { AGE_BUCKETS, agedDebtors, agedDebtorsCsv } from "../lib/agedDebtors";
import { money } from "../lib/documentPDF";
import { downloadText } from "../lib/csv";
import { Btn } from "./ui";

export function AgedDebtors({ invoices = [], customerName = () => "", paymentTermsDays = 30 }) {
  const [openRow, setOpenRow] = useState(null);
  const report = useMemo(
    () => agedDebtors(invoices, { paymentTermsDays, customerName }),
    [invoices, customerName, paymentTermsDays],
  );
  const download = () => downloadText(agedDebtorsCsv(report), `Aged_debtors_${report.asAt}.csv`);
  const overdue = report.totals.total - report.totals.current;
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-3 py-2" data-testid="aged-debtors">
      <summary className="text-sm font-bold text-slate-600 cursor-pointer min-h-[40px] flex items-center justify-between gap-2">
        <span>Aged debtors</span>
        <span className={`text-xs ${overdue > 0 ? "text-red-700" : "text-slate-500"}`}>
          {overdue > 0 ? `${money(overdue)} overdue` : "Nothing overdue"}
        </span>
      </summary>
      <div className="stack-y-2 pb-2">
        <div className="grid grid-cols-5 gap-1 text-center">
          {AGE_BUCKETS.map(b => (
            <div key={b.key} className="rounded-lg bg-slate-50 p-1.5">
              <p className="text-[10px] font-bold text-slate-500 leading-tight">{b.label}</p>
              <p className={`text-xs font-black ${b.key !== "current" && report.totals[b.key] > 0 ? "text-red-700" : "text-slate-800"}`}>
                {Math.round(report.totals[b.key]).toLocaleString("en-ZA")}
              </p>
            </div>
          ))}
        </div>
        {report.rows.length === 0 ? (
          <p className="text-sm text-slate-500">No customer owes anything on an approved invoice.</p>
        ) : (
          <ul className="stack-y-1">
            {report.rows.map(r => (
              <li key={r.key} className="rounded-lg border border-slate-100">
                <button
                  type="button"
                  onClick={() => setOpenRow(o => (o === r.key ? null : r.key))}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left min-h-[44px]"
                  aria-expanded={openRow === r.key}
                >
                  <span className="text-sm font-bold text-slate-800 truncate">{r.name}</span>
                  <span className="text-sm font-black text-slate-900 shrink-0">{money(r.total)}</span>
                </button>
                {openRow === r.key && (
                  <div className="px-2.5 pb-2 stack-y-1">
                    <p className="text-xs text-slate-500">
                      {AGE_BUCKETS.filter(b => r[b.key] > 0)
                        .map(b => `${b.label}: ${money(r[b.key])}`)
                        .join(" · ")}
                    </p>
                    {r.invoices.map(i => (
                      <p key={i.id} className="text-xs text-slate-600">
                        {i.number} · due {i.due} · {money(i.owed)}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black">Total owed {money(report.totals.total)}</p>
          <Btn size="sm" variant="secondary" onClick={download} disabled={!report.rows.length}>
            <Download size={13} /> CSV
          </Btn>
        </div>
      </div>
    </details>
  );
}
