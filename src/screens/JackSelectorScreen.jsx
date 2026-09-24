// ─── Jack Selector ────────────────────────────────────────────────────────────
// A field lookup for the sales team: pick a machine → see its tyre size, weight,
// axle info, and the recommended Power Works jack + jacking stand.
//
// Machine specs are from published data. Jack/stand/closed-height come from the
// MACHINE_DATA file and are filled in by Power Works (safety-critical — never
// guessed). If a machine has no jack specified yet, the screen says so clearly
// rather than showing a blank or a guess.
import React, { useState, useEffect, useMemo } from "react";
import { Wrench, Search, ChevronRight, ChevronDown, AlertTriangle, Truck, X, Pencil } from "lucide-react";
import { BRAND } from "../lib/constants";
import { Card, PageHeader, Empty, Btn, Field, Toast } from "../components/ui";
import { MACHINE_DATA, MACHINE_TYPES, JACK_CATALOGUE, recommendForMachine, tyreInfo } from "../lib/machineData";
import { fetchJackConfirmations, saveJackConfirmation, deleteJackConfirmation, applyConfirmation, keyFor } from "../lib/jackConfirmations";

export function JackSelectorScreen({ userId, teamId }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  // Brand sections and, inside them, category sections are independently
  // collapsible — both start collapsed. Keys: brand name, and `${brand}::${type}`.
  const [openBrands, setOpenBrands] = useState(() => new Set());
  const [openCats, setOpenCats] = useState(() => new Set());
  // Site-confirmed jack data from Supabase (see lib/jackConfirmations.js) —
  // merged on top of the static catalogue below so a confirmed fit always
  // wins over the automatic estimate, for everyone on the team, without a
  // code change or redeploy.
  const [confirmations, setConfirmations] = useState({});
  const refreshConfirmations = () => fetchJackConfirmations().then(setConfirmations);
  useEffect(() => { refreshConfirmations(); }, []);

  const toggleBrand = brand => setOpenBrands(prev => {
    const next = new Set(prev);
    next.has(brand) ? next.delete(brand) : next.add(brand);
    return next;
  });
  const toggleCat = key => setOpenCats(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // Filter, then group brand → category → machines, sorted smallest to
  // biggest (by operating weight) within each category.
  const { brandNames, grouped, totalShown } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = MACHINE_DATA
      .filter(m => !q || `${m.brand} ${m.model}`.toLowerCase().includes(q) || (m.tyre || "").toLowerCase().includes(q))
      .map(m => applyConfirmation(m, confirmations[keyFor(m.brand, m.model)]));
    const byBrand = {};
    for (const m of filtered) {
      const byType = (byBrand[m.brand] = byBrand[m.brand] || {});
      (byType[m.type] = byType[m.type] || []).push(m);
    }
    for (const brand of Object.keys(byBrand)) {
      for (const type of Object.keys(byBrand[brand])) {
        byBrand[brand][type].sort((a, b) => (Number(a.operatingWeight) || 0) - (Number(b.operatingWeight) || 0));
      }
    }
    return {
      brandNames: Object.keys(byBrand).sort((a, b) => a.localeCompare(b)),
      grouped: byBrand,
      totalShown: filtered.length,
    };
  }, [search, confirmations]);

  // While actively searching, force everything open so matches are never
  // hidden behind a collapsed toggle — clearing the search restores whatever
  // the user had manually expanded.
  const isSearching = search.trim().length > 0;

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

      {/* Brand → category → machine list, collapsed by default */}
      {brandNames.map(brand => {
        const cats = grouped[brand];
        const catTypes = Object.keys(MACHINE_TYPES).filter(t => cats[t]?.length);
        const brandCount = catTypes.reduce((s, t) => s + cats[t].length, 0);
        const brandOpen = isSearching || openBrands.has(brand);
        return (
          <div key={brand}>
            <button
              onClick={() => toggleBrand(brand)}
              className="w-full flex items-center justify-between rounded-xl bg-white border border-slate-200 px-4 py-3 active:bg-slate-50">
              <span className="text-sm font-black text-slate-800">{brand}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">{brandCount}</span>
                <ChevronDown
                  size={16}
                  className="text-slate-400 transition-transform"
                  style={{ transform: brandOpen ? "rotate(180deg)" : "none" }} />
              </span>
            </button>

            {brandOpen && (
              <div className="pl-2 mt-1.5 space-y-1.5">
                {catTypes.map(type => {
                  const machines = cats[type];
                  const catKey = `${brand}::${type}`;
                  const catOpen = isSearching || openCats.has(catKey);
                  return (
                    <div key={type}>
                      <button
                        onClick={() => toggleCat(catKey)}
                        className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 active:bg-slate-50">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                          {MACHINE_TYPES[type]}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-300">{machines.length}</span>
                          <ChevronDown
                            size={14}
                            className="text-slate-300 transition-transform"
                            style={{ transform: catOpen ? "rotate(180deg)" : "none" }} />
                        </span>
                      </button>

                      {catOpen && (
                        <Card className="overflow-hidden divide-y divide-slate-100">
                          {machines.map(m => (
                            <button
                              key={`${m.brand}-${m.model}`}
                              onClick={() => setSelected(m)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  {m.brand} {m.model}
                                  {m._confirmation && (
                                    <span title="Jack fit confirmed on site" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#16A34A" }} />
                                  )}
                                </p>
                                <p className="text-xs text-slate-400">{m.tyre} · {m.emptyWeight}t empty</p>
                              </div>
                              <ChevronRight size={16} className="text-slate-300 shrink-0" />
                            </button>
                          ))}
                        </Card>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Detail modal */}
      {selected && (
        <MachineDetail
          machine={selected}
          onClose={() => setSelected(null)}
          userId={userId}
          teamId={teamId}
          onSaved={refreshConfirmations}
        />
      )}
    </div>
  );
}


// ── Machine detail: jacks (primary + as many alternates as the machine
//    provides — usually 1, sometimes more for a manual override list),
//    stands (nr1+nr2), and the honest max-clearance-loss line. Nothing else. ──
function MachineDetail({ machine: m, onClose, userId, teamId, onSaved }) {
  const rec = recommendForMachine(m);
  const t = tyreInfo(m.tyre);
  const jackSub = j => `${j.capacity ? j.capacity + "t · " : ""}Closed ${j.closedHeight}mm · max lift ${j.maxLift}mm`;
  const tracked = /tracked/i.test(m.tyre || "");

  // ── Confirm-fit editor: anyone on the team can confirm site-measured jack
  //    data straight from the app — saved to Supabase, no code change needed.
  //    See lib/jackConfirmations.js for how this merges onto the catalogue.
  const [editing, setEditing] = useState(false);
  const [closedHeight, setClosedHeight] = useState(m.closedHeight ?? "");
  const [selJacks, setSelJacks] = useState(Array.isArray(m.jackOverrides) ? [...m.jackOverrides] : []);
  const [jackStand, setJackStand] = useState(m.jackStand || "");
  const [note, setNote] = useState(m.note || "");
  // Cancel must discard unsaved edits, or reopening the editor shows them again.
  function cancelEdit() {
    setClosedHeight(m.closedHeight ?? "");
    setSelJacks(Array.isArray(m.jackOverrides) ? [...m.jackOverrides] : []);
    setJackStand(m.jackStand || "");
    setNote(m.note || "");
    setEditing(false);
  }
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const toggleJack = name => setSelJacks(prev =>
    prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
  );

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await saveJackConfirmation({
        id: m._confirmation?.id,
        userId, teamId,
        brand: m.brand, model: m.model,
        closedHeight, jackOverrides: selJacks, jackStand, note,
      });
      setToast("Saved — this jack fit is now confirmed for the whole team.");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setToast("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!m._confirmation?.id) return;
    setSaving(true);
    try {
      await deleteJackConfirmation(m._confirmation.id);
      setToast("Reverted to the automatic estimate.");
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setToast("Couldn't revert — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const Line = ({ n, name, sub }) => (
    <div className="rounded-2xl border px-4 py-3 mb-2" style={{ borderColor: "rgba(139,26,26,0.2)" }}>
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-black text-white shrink-0" style={{ background: n === 1 ? BRAND.primary : "#737F92" }}>{n}</span>
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

        {/* Published clearances where available; otherwise a clear on-site prompt.
            This is machine clearance, NOT the jacking closed-height. */}
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5 mt-3">Clearance</p>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 mb-1">
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-slate-500">Ground clearance</span>
            <span className="text-sm font-black" style={{ color: m.groundClearance ? "#0F172A" : "#737F92" }}>
              {m.groundClearance ? `${m.groundClearance} mm` : "Measure on site"}
            </span>
          </div>
          {m.rearAxleClearance && (
            <div className="flex items-center justify-between py-1 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-500">Rear axle clearance</span>
              <span className="text-sm font-black text-slate-800">{m.rearAxleClearance} mm</span>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-1.5">Published machine clearance — confirm the actual jacking-point gap on site before lifting.</p>
        </div>

        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Jack</p>
        {rec.jackLoad != null && (
          <p className="text-xs text-slate-500 mb-1.5">
            Est. load on jack: <span className="font-bold text-slate-700">~{rec.jackLoad}t</span> (≈50% of {m.emptyWeight}t empty — confirm on site)
          </p>
        )}
        <Line n={1} name={rec.jack.name} sub={jackSub(rec.jack)} />
        {(rec.alternatives || []).map((alt, i) => (
          <Line key={alt.name} n={i + 2} name={alt.name} sub={jackSub(alt)} />
        ))}
        {m.note && <p className="text-xs text-slate-500 -mt-1 mb-2 pl-1">{m.note}</p>}
        {rec.overCapacity && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-3 mt-2 flex gap-2.5">
            <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">
              <span className="font-bold">Load exceeds jack rating.</span> The estimated jack load (~{rec.jackLoad}t) is above the recommended jack's capacity ({rec.jack.capacity}t). Do not lift — use a higher-rated jack or split the lift. Confirm the actual point load before proceeding.
            </p>
          </div>
        )}

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

        {/* Confirm-fit editor — anyone on the team can lock in a site-measured
            jack fit here; it saves to Supabase and shows up for everyone
            immediately, no code change or redeploy required. */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          {!editing ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                {m._confirmation ? (
                  <p className="text-xs text-slate-500">
                    <span className="font-bold" style={{ color: "#16A34A" }}>✓ Confirmed on site</span>
                    {m._confirmation.updated_at && ` · ${new Date(m._confirmation.updated_at).toLocaleDateString()}`}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Jack above is an automatic estimate — not yet confirmed on site.</p>
                )}
              </div>
              {userId && (
                <button
                  onClick={() => setEditing(true)}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-bold rounded-xl px-3 py-2 min-h-[40px]"
                  style={{ color: BRAND.primary, background: BRAND.light }}>
                  <Pencil size={13} /> {m._confirmation ? "Edit" : "Confirm fit"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Confirm jack fit</p>

              <Field
                label="Measured closed height (mm)"
                type="number"
                value={closedHeight}
                onChange={setClosedHeight}
                placeholder="e.g. 800" />

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-500">Jacks that fit (tap to select, in order)</label>
                <div className="space-y-1.5">
                  {JACK_CATALOGUE.map(j => {
                    const order = selJacks.indexOf(j.name);
                    const checked = order !== -1;
                    return (
                      <button
                        key={j.name}
                        type="button"
                        onClick={() => toggleJack(j.name)}
                        className="w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
                        style={{ borderColor: checked ? BRAND.primary : "#F1F5F9", background: checked ? BRAND.light : "#F8FAFC" }}>
                        <span
                          className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-black shrink-0"
                          style={{ background: checked ? BRAND.primary : "#E2E8F0", color: checked ? "#fff" : "#737F92" }}>
                          {checked ? order + 1 : ""}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-slate-800">{j.name}</span>
                          <span className="block text-[11px] text-slate-400">{j.capacity ? j.capacity + "t · " : ""}Closed {j.closedHeight}mm</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Leave nothing selected to let the automatic estimate keep using the closed height above.</p>
              </div>

              <Field label="Jacking stand note (optional)" value={jackStand} onChange={setJackStand} placeholder="e.g. 100t / 800mm" />
              <Field label="Note for the team (optional)" value={note} onChange={setNote} multiline placeholder="Anything the next person jacking this machine should know" />

              <div className="flex gap-2">
                <Btn variant="ghost" size="sm" onClick={cancelEdit} className="flex-1">Cancel</Btn>
                {m._confirmation && (
                  <Btn variant="outline" size="sm" onClick={handleRevert} disabled={saving} className="flex-1">Revert</Btn>
                )}
                <Btn variant="solid" size="sm" onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? "Saving…" : "Save"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        // Wrapped in its own fixed, higher-z layer — the modal backdrop above
        // is z-[120], which would otherwise sit in front of Toast's own z-50
        // and hide it.
        <div className="fixed inset-0 z-[200] pointer-events-none">
          <Toast message={toast} type={toast.startsWith("Couldn't") ? "error" : "success"} onDone={() => setToast("")} />
        </div>
      )}
    </div>
  );
}
