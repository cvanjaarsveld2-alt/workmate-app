// ─── Jack Selector ────────────────────────────────────────────────────────────
// A field lookup for the sales team: pick a machine → see its tyre size, weight,
// axle info, and the recommended Power Works jack + jacking stand.
//
// Machine specs are from published data. Jack/stand/closed-height come from the
// MACHINE_DATA file and are filled in by Power Works (safety-critical — never
// guessed). If a machine has no jack specified yet, the screen says so clearly
// rather than showing a blank or a guess.
import React, { useState, useMemo } from "react";
import { Wrench, Search, ChevronRight, AlertTriangle, Truck, X } from "lucide-react";
import { BRAND } from "../lib/constants";
import { Card, PageHeader, Empty } from "../components/ui";
import { MACHINE_DATA, MACHINE_TYPES, recommendForMachine, tyreInfo } from "../lib/machineData";

export function JackSelectorScreen() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  // Filter + group machines by type.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = MACHINE_DATA.filter(m =>
      !q || `${m.brand} ${m.model}`.toLowerCase().includes(q) || (m.tyre || "").toLowerCase().includes(q)
    );
    const groups = {};
    for (const m of filtered) {
      (groups[m.type] = groups[m.type] || []).push(m);
    }
    return groups;
  }, [search]);

  const totalShown = Object.values(grouped).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="space-y-3">
      <PageHeader title="Jack Selector" subtitle="Find the right jack & stand for a machine" />

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search machine (e.g. 860E, Cat 793, Bell)…"
          className="w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 py-3 text-[15px] outline-none focus:border-slate-400"
          style={{ fontSize: 16 }} />
      </div>

      {totalShown === 0 && (
        <Empty icon={Truck} title="No machines found" text="Try a different search, or the machine may not be in the list yet." />
      )}

      {/* Grouped machine list */}
      {Object.keys(MACHINE_TYPES).map(type => {
        const machines = grouped[type];
        if (!machines || machines.length === 0) return null;
        return (
          <div key={type}>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400 px-1 mb-1.5">
              {MACHINE_TYPES[type]}
            </p>
            <Card className="overflow-hidden divide-y divide-slate-100">
              {machines.map(m => {
                return (
                  <button
                    key={`${m.brand}-${m.model}`}
                    onClick={() => setSelected(m)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800">{m.brand} {m.model}</p>
                      <p className="text-xs text-slate-400">{m.tyre} · {m.emptyWeight}t empty</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </Card>
          </div>
        );
      })}

      {/* Detail modal */}
      {selected && <MachineDetail machine={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}


// ── Machine detail: ONLY jacks (nr1+nr2), stands (nr1+nr2), and the honest
//    max-clearance-loss line. Nothing else. ──
function MachineDetail({ machine: m, onClose }) {
  const rec = recommendForMachine(m);
  const t = tyreInfo(m.tyre);
  const jack2 = rec.alternatives && rec.alternatives[0];
  const tracked = /tracked/i.test(m.tyre || "");

  const Line = ({ n, name, sub }) => (
    <div className="rounded-2xl border px-4 py-3 mb-2" style={{ borderColor: "rgba(139,26,26,0.2)" }}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-black text-white shrink-0" style={{ background: n === 1 ? BRAND.primary : "#94A3B8" }}>{n}</span>
        <span className="text-base font-black text-slate-900">{name}</span>
      </div>
      {sub && <p className="text-xs text-slate-500 mt-1 pl-8">{sub}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md m-3 rounded-3xl bg-white p-5 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>

        {/* Machine name */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: BRAND.light }}>
            <Truck size={18} style={{ color: BRAND.primary }} />
          </div>
          <p className="text-lg font-black text-slate-900 leading-tight flex-1">{m.brand} {m.model}</p>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full bg-slate-100">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {/* Published clearances (where available) — labelled honestly. NOT the
            jacking closed-height; that must be measured on site. */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5 mt-3">Clearance (published)</p>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 mb-1">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-slate-500">Ground clearance</span>
            <span className="text-sm font-black text-slate-800">{m.groundClearance ? `${m.groundClearance} mm` : "— not published —"}</span>
          </div>
          <div className="flex items-center justify-between py-1 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">Rear axle clearance</span>
            <span className="text-sm font-black text-slate-800">{m.rearAxleClearance ? `${m.rearAxleClearance} mm` : "— not published —"}</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">Published machine clearance — not the jacking-point closed height. Always measure the actual gap before selecting the jack.</p>
        </div>

        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Jack</p>
        <Line n={1} name={rec.jack.name} sub={`Closed ${rec.jack.closedHeight}mm · max lift ${rec.jack.maxLift}mm`} />
        {jack2 && <Line n={2} name={jack2.name} sub={`Closed ${jack2.closedHeight}mm · max lift ${jack2.maxLift}mm`} />}

        {/* Stands */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5 mt-3">Jacking stand</p>
        <Line n={1} name={rec.stand.name} sub={`Closed ${rec.stand.closedHeight}mm · extends ${rec.stand.extendedHeight}mm · ${rec.stand.capacity}t SWL (3:1)`} />
        {rec.standAlt && <Line n={2} name={rec.standAlt.name} sub={`Closed ${rec.standAlt.closedHeight}mm · extends ${rec.standAlt.extendedHeight}mm · ${rec.standAlt.capacity}t SWL (3:1)`} />}

        {/* Flat-tyre max clearance loss — honest upper bound, measure on site */}
        {tracked ? (
          <div className="rounded-xl bg-slate-50 p-3 mt-3">
            <p className="text-xs text-slate-600"><span className="font-bold">Tracked machine</span> — jacked for undercarriage, no tyre deflection.</p>
          </div>
        ) : t && t.maxLoss ? (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-3 flex gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">Flat tyre — max clearance loss ≈ {t.maxLoss}mm</span> ({m.tyre}, full deflation). Front & rear differ. Always measure the actual gap on site before choosing the jack.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
