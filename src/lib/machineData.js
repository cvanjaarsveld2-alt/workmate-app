// ─── Jack Selector — Machine Reference Data ───────────────────────────────────
// Machine specs are from published manufacturer / spec-sheet data (sources noted
// per machine). The JACK and JACKING STAND fields are intentionally BLANK — they
// are safety-critical and must be filled in by Power Works from your own product
// range. Never guess a jack rating under a machine.
//
// To add a jack recommendation: fill in `jack` and `jackStand` for a machine.
// To add a new machine: copy an entry and fill the specs.
//
// Fields:
//   brand, model      — machine identity
//   type              — haul_truck | adt | excavator | loader | dozer | grader
//   tyre              — standard tyre size (published)
//   operatingWeight   — GVW / operating weight, tonnes (published)
//   emptyWeight       — chassis/unladen weight, tonnes (published, where available)
//   axleNote          — axle config / heaviest-axle note where published (helps jack choice)
//   closedHeight      — jacking closed height (mm) — YOU fill in (site-measured)
//   jack              — recommended Power Works jack — YOU fill in
//   jackStand         — recommended jacking stand — YOU fill in
//   note              — any warning / guidance — YOU fill in
//   source            — where the machine spec came from

export const MACHINE_DATA = [
  // ── KOMATSU HAUL TRUCKS ──
  {
    brand: "Komatsu", model: "830E-5", type: "haul_truck",
    tyre: "50/80 R57", operatingWeight: 385.9, emptyWeight: 154.9,
    axleNote: "Rear (drive) axle carries the majority of GVW",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu / Wikipedia published specs",
  },
  {
    brand: "Komatsu", model: "860E-1K", type: "haul_truck",
    tyre: "50/80 R57 (opt 50/90 R57)", operatingWeight: 454.4, emptyWeight: 200.4,
    axleNote: "GVW 454t; 280 short ton payload",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu spec sheet / lectura-specs",
  },
  {
    brand: "Komatsu", model: "930E-5", type: "haul_truck",
    tyre: "53/80 R63", operatingWeight: 521.6, emptyWeight: 210.2,
    axleNote: "GVW ~522t; 320 short ton payload",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu / Wikipedia published specs",
  },

  // ── CATERPILLAR HAUL TRUCKS ──
  {
    brand: "Caterpillar", model: "777", type: "haul_truck",
    tyre: "27.00 R49", operatingWeight: 163.3, emptyWeight: 56.4,
    axleNote: "~100 ton class; loaded ~294,000 lb",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat / ritchiespecs published data",
  },
  {
    brand: "Caterpillar", model: "785", type: "haul_truck",
    tyre: "33.00 R51 (opt 36.00 R51)", operatingWeight: 249.5, emptyWeight: 85.2,
    axleNote: "Ground clearance ~1004mm; GMW 249–256t by tyre",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 785 spec sheet",
  },
  {
    brand: "Caterpillar", model: "789", type: "haul_truck",
    tyre: "37 R57 (opt 40 R57 / 42/90 R57)", operatingWeight: 324.3, emptyWeight: 102.8,
    axleNote: "Rear axle clearance ~1178mm; GMW 324t",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 789 spec sheet",
  },
  {
    brand: "Caterpillar", model: "793", type: "haul_truck",
    tyre: "40.00 R57 (opt 46/90 R57, 50/80 R57)", operatingWeight: 404.0, emptyWeight: 132.0,
    axleNote: "GMW 404t; 265 short ton payload",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 793 spec sheet",
  },

  // ── BELL ARTICULATED DUMP TRUCKS ──
  {
    brand: "Bell", model: "B30E", type: "adt",
    tyre: "23.5 R25 (opt 750/65 R25)", operatingWeight: 49.2, emptyWeight: 21.2,
    axleNote: "6x6 ADT; laden 49.2t, rated payload 28t",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B30E spec sheet",
  },
  {
    brand: "Bell", model: "B40E", type: "adt",
    tyre: "29.5 R25 (opt 875/65 R29)", operatingWeight: 71.2, emptyWeight: 32.2,
    axleNote: "Empty axle loads (published): front 16.97t, mid 7.74t, rear 7.52t",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell E-series B40E brochure",
  },
  {
    brand: "Bell", model: "B50E", type: "adt",
    tyre: "875/65 R29", operatingWeight: 81.1, emptyWeight: 35.7,
    axleNote: "Laden 81.1t; rated payload 45.4t",
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell E-series B50E brochure",
  },
];

// Machine type labels for grouping/filtering in the UI.
export const MACHINE_TYPES = {
  haul_truck: "Haul Trucks",
  adt:        "Articulated Dump Trucks",
  excavator:  "Excavators",
  loader:     "Wheel Loaders",
  dozer:      "Dozers",
  grader:     "Graders",
};

// ─── TYRE DATA (published Michelin loaded-radius specs) ───────────────────────
// Static loaded radius is the axle-centre-to-ground distance for an INFLATED
// tyre at load — a published manufacturer figure. When a tyre goes flat that
// corner drops; the worst-case drop is bounded by the sidewall height (how much
// tyre sits above the rim). We show the loaded radius as a sourced figure and
// always tell the team to MEASURE the actual clearance on site, because a flat
// varies (slow leak vs burst) and even lab tests differ from spec by ~20%.
export const TYRE_DATA = {
  "50/80 R57": { loadedRadius: 1197, source: "Michelin XDR 4 Speed MC" },
  "50/90 R57": { loadedRadius: 1272, source: "Michelin XDR3 (overall dia derived)" },
  "53/80 R63": { loadedRadius: 1300, source: "Michelin XDR3 (approx from overall dia)" },
  "40.00 R57": { loadedRadius: 1577, source: "Michelin XDR2/XDR3 E4" },
  "37 R57":    { loadedRadius: 1533, source: "Michelin XDR2 E4" },
  "33.00 R51": { loadedRadius: 1318, source: "Michelin XDC" },
  "27.00 R49": { loadedRadius: 1236, source: "Michelin XDR3" },
  // ADT sizes — loaded radius approximate from overall diameter; verify with supplier.
  "23.5 R25":  { loadedRadius: 690,  source: "Approx — confirm with tyre supplier" },
  "29.5 R25":  { loadedRadius: 820,  source: "Approx — confirm with tyre supplier" },
  "875/65 R29": { loadedRadius: 800, source: "Approx — confirm with tyre supplier" },
};

// Look up tyre data by matching the machine's tyre string against known sizes.
export function tyreInfo(tyreStr) {
  if (!tyreStr) return null;
  const s = tyreStr.toLowerCase();
  for (const size of Object.keys(TYRE_DATA)) {
    if (s.includes(size.toLowerCase())) return { size, ...TYRE_DATA[size] };
  }
  return null;
}

// ─── JACK & JACKING STAND CATALOGUE (Power Works range) ───────────────────────
// Real Powerlift / Hydralift range. Capacity options 50/100/150/200 ton apply
// across each closed-height model. Matched to machines primarily by CLOSED
// HEIGHT (must fit under the machine), with capacity as confirmation.
export const JACK_CATALOGUE = [
  {
    name: "Powerlift / Hydralift — 600mm",
    range: "Air/hydraulic, 50–200 ton",
    closedHeight: 600, stroke: 315, maxLift: 915,
    note: "Incl. 50mm swivel load cap. Stepped extension dollies: 100 / 200 / 300 / 300mm.",
  },
  {
    name: "Powerlift / Hydralift — 800mm",
    range: "Air/hydraulic, 50–200 ton",
    closedHeight: 800, stroke: 515, maxLift: 1315,
    note: "Incl. 50mm swivel load cap.",
  },
  {
    name: "Powerlift / Hydralift — 1000mm",
    range: "Air/hydraulic, 50–200 ton",
    closedHeight: 1000, stroke: 715, maxLift: 1715,
    note: "Incl. 50mm swivel load cap. Stepped extension dollies: 200 / 300 / 300mm.",
  },
  // ── Small-machine range (Cattini Yak / Mammut) — manufacturer verified ──
  {
    name: "Yak 221/N",
    range: "Air-hydraulic, 40/20 t (2-stage)",
    closedHeight: 219, stroke: 250, maxLift: 469,
    small: true, note: "Compact. Cattini spec. For light/low-clearance vehicles.",
  },
  {
    name: "Yak 142",
    range: "Air-hydraulic, 50 t",
    closedHeight: 420, stroke: 277, maxLift: 697,
    small: true, note: "For high-riding vehicles (tractors/plant). Cattini spec.",
  },
  {
    name: "Yak 330/S",
    range: "Air-hydraulic, 80/50/25 t (3-stage)",
    closedHeight: 313, stroke: 505, maxLift: 818,
    small: true, note: "High-stroke, chassis lifting. Cattini spec.",
  },
  {
    name: "Mammut M80-42",
    range: "Air-hydraulic, 80/50 t (2-stage)",
    closedHeight: 419, stroke: 405, maxLift: 824,
    small: true, note: "Mining heavy-duty (Cattini Mammut). Cattini spec.",
  },
];

// Jacking stands — Power Works range. Each closed-height comes in 50t AND 100t.
// SWL = the rated capacity (safe working load); built to a 3:1 design factor
// (a 50t stand is engineered to withstand 150t, a 100t to 300t). Matching and
// display use the SWL — the 3:1 is the built-in safety margin, not a figure the
// user works against.
export const JACK_STAND_LOAD_FACTOR = 3; // 3:1 design factor
export const JACK_STAND_CATALOGUE = [
  { name: "Jacking stand — 50t / 600mm",   capacity: 50,  closedHeight: 600,  extendedHeight: 1000, note: "Incl. 50mm load cap." },
  { name: "Jacking stand — 100t / 600mm",  capacity: 100, closedHeight: 600,  extendedHeight: 1000, note: "Incl. 50mm load cap." },
  { name: "Jacking stand — 50t / 800mm",   capacity: 50,  closedHeight: 800,  extendedHeight: 1310, note: "Incl. 50mm load cap." },
  { name: "Jacking stand — 100t / 800mm",  capacity: 100, closedHeight: 800,  extendedHeight: 1310, note: "Incl. 50mm load cap." },
  { name: "Jacking stand — 50t / 1000mm",  capacity: 50,  closedHeight: 1000, extendedHeight: 1800, note: "Incl. 50mm load cap." },
  { name: "Jacking stand — 100t / 1000mm", capacity: 100, closedHeight: 1000, extendedHeight: 1800, note: "Incl. 50mm load cap." },
];

// ─── Matching logic ───────────────────────────────────────────────────────────
// Given a machine, recommend a jack by closed height and a stand to match.
// Closed height is the deciding factor (clearance under the machine); capacity
// across the range (up to 200t) comfortably covers per-jacking-point loads for
// this fleet. For very heavy machines we add a "verify per-point load" note.
export function recommendForMachine(machine) {
  // If a machine has an explicit closed height set, match a jack at/under it.
  // Otherwise recommend the mid (800mm) as the general-purpose choice and flag
  // that the on-site clearance should be confirmed.
  const ch = parseInt(machine.closedHeight, 10);
  let jack;
  let alternatives = [];
  if (Number.isFinite(ch)) {
    // All jacks whose closed height fits under the machine, tallest first.
    const fitting = JACK_CATALOGUE.filter(j => j.closedHeight <= ch)
      .sort((a, b) => b.closedHeight - a.closedHeight);
    jack = fitting[0] || JACK_CATALOGUE.slice().sort((a,b)=>a.closedHeight-b.closedHeight)[0];
    alternatives = fitting.filter(j => j.name !== jack.name);
  } else {
    // No confirmed clearance: recommend the general-purpose 800mm and list the
    // rest as "may suit — confirm clearance on site".
    jack = JACK_CATALOGUE.find(j => j.closedHeight === 800) || JACK_CATALOGUE[0];
    alternatives = JACK_CATALOGUE.filter(j => j.name !== jack.name);
  }

  // Stand: match by closed height closest to the jack, and pick the capacity —
  // 100t for heavier machines, 50t is adequate for lighter ones. Capacity is
  // safe working load; a 3:1 design factor is built in (50t stand → 150t
  // ultimate, 100t → 300t), so SWL is what we match against.
  const wantCapacity = (machine.emptyWeight || 0) >= 100 ? 100 : 50;
  const standsByFit = [...JACK_STAND_CATALOGUE].sort((a, b) =>
    Math.abs(a.closedHeight - jack.closedHeight) - Math.abs(b.closedHeight - jack.closedHeight)
  );
  // Prefer a stand at the best height AND the wanted capacity; fall back to nearest height.
  const stand = standsByFit.find(s =>
    Math.abs(s.closedHeight - jack.closedHeight) === Math.abs(standsByFit[0].closedHeight - jack.closedHeight)
    && s.capacity === wantCapacity
  ) || standsByFit[0];

  // Heavy-machine note: if EMPTY weight is high, remind to confirm per-point load
  // (empty weight is what's actually on the jack — you jack unladen machines).
  const heavy = (machine.emptyWeight || 0) >= 130;

  return { jack, alternatives, stand, heavy, clearanceKnown: Number.isFinite(ch) };
}
