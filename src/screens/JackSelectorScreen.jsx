// ─── Jack Selector ────────────────────────────────────────────────────────────
// A field lookup for the sales team: pick a machine → see its tyre size, weight,
// axle info, and the recommended Power Works jack + jacking stand.
//
// Machine specs are from published data. Jack/stand/closed-height come from the
// MACHINE_DATA file and are filled in by Power Works (safety-critical — never
// guessed). If a machine has no jack specified yet, the screen says so clearly
// rather than showing a blank or a guess.
import React, { useState, useMemo } from "react";
import { Wrench, Search, ChevronRight, AlertTriangle, Truck } from "lucide-react";
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

function SpecRow({ label, value, strong }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wide shrink-0">{label}</span>
      <span className={`text-right ${strong ? "text-base font-black text-slate-900" : "text-sm font-semibold text-slate-700"}`}>{value}</span>
    </div>
  );
}

function MachineDetail({ machine: m, onClose }) {
  const rec = recommendForMachine(m);
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center"
      style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(2px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md m-3 rounded-3xl bg-white p-5 max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: BRAND.light }}>
            <Truck size={18} style={{ color: BRAND.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-black text-slate-900 leading-tight">{m.brand} {m.model}</p>
            <p className="text-xs text-slate-400">{MACHINE_TYPES[m.type] || m.type}</p>
          </div>
        </div>

        {/* Machine specs (published) — EMPTY weight leads, since you jack unladen machines */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">Machine specs</p>
        <div className="rounded-2xl bg-slate-50 px-4 py-1 mb-4">
          <SpecRow label="Tyre size" value={m.tyre} strong />
          <SpecRow label="Empty weight (jacking)" value={m.emptyWeight ? `${m.emptyWeight} t` : "— confirm —"} strong />
          <SpecRow label="Loaded weight (ref only)" value={m.operatingWeight ? `${m.operatingWeight} t` : ""} />
          <SpecRow label="Axle / lift note" value={m.axleNote} />
        </div>

        {/* Tyre / flat-tyre clearance */}
        {(() => {
          const t = tyreInfo(m.tyre);
          if (!t) return null;
          return (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 mb-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">Tyre & clearance</p>
              <SpecRow label="Loaded radius (inflated)" value={`${t.loadedRadius} mm`} />
              <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2.5">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-bold">Flat tyre = less clearance.</span> A deflated tyre drops this corner, so the gap under the jacking point is smaller than normal. Always <span className="font-bold">measure the actual clearance on site</span> before choosing the jack — a flat varies (slow leak vs burst).
                </p>
              </div>
              <p className="text-[10px] text-slate-300 mt-1.5">Tyre spec: {t.source}</p>
            </div>
          );
        })()}

        {/* Recommended jack + stand */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">Recommended equipment</p>
        <div className="rounded-2xl border-2 px-4 py-3 mb-3" style={{ borderColor: "rgba(139,26,26,0.2)" }}>
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Jack</p>
          <p className="text-base font-black text-slate-900">{rec.jack.name}</p>
          <p className="text-xs text-slate-500">{rec.jack.range}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Closed {rec.jack.closedHeight}mm · stroke {rec.jack.stroke}mm · max lift {rec.jack.maxLift}mm
          </p>
          {rec.jack.note && <p className="text-[11px] text-slate-400 mt-1">{rec.jack.note}</p>}

          {rec.alternatives && rec.alternatives.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1.5">
                {rec.clearanceKnown ? "Also suitable" : "May also suit (confirm clearance)"}
              </p>
              <div className="space-y-1">
                {rec.alternatives.map(alt => (
                  <div key={alt.name} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600">{alt.name}</span>
                    <span className="text-[11px] text-slate-400">closed {alt.closedHeight}mm · lift {alt.maxLift}mm</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-slate-100 my-3" />

          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Jacking stand</p>
          <p className="text-base font-black text-slate-900">{rec.stand.name}</p>
          <p className="text-xs text-slate-500">
            Closed {rec.stand.closedHeight}mm · extends to {rec.stand.extendedHeight}mm · {rec.stand.capacity}t SWL (3:1 factor)
          </p>
          {rec.stand.note && <p className="text-[11px] text-slate-400 mt-1">{rec.stand.note}</p>}
        </div>

        {/* Safety flags */}
        {!rec.clearanceKnown && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-2 flex gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">Confirm clearance on site.</span> The exact closed height for this machine isn't set — measure the jacking-point clearance and choose the jack whose closed height fits under it.
            </p>
          </div>
        )}
        {rec.heavy && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-2 flex gap-2.5">
            <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">Heavy machine ({m.emptyWeight}t empty).</span> The 200-ton jack range covers per-point loads for this fleet, but confirm the actual load on the jacking point before lifting.
            </p>
          </div>
        )}

        {m.note && (
          <div className="rounded-xl bg-slate-50 p-3 mb-3">
            <p className="text-xs text-slate-600"><span className="font-bold">Note: </span>{m.note}</p>
          </div>
        )}

        {m.source && <p className="text-[10px] text-slate-300 mb-3">Spec source: {m.source}</p>}

        <button onClick={onClose}
          className="w-full min-h-[48px] rounded-2xl font-bold text-white" style={{ background: BRAND.primary }}>
          Close
        </button>
      </div>
    </div>
  );
}
