// ─── Jack Selector — Machine Reference Data ───────────────────────────────────
// Machine specs are from published manufacturer / spec-sheet data (sources noted
// per machine). The JACK fields are intentionally BLANK by default — they are
// safety-critical and must be filled in by Power Works. Never guess a jack
// rating under a machine.
//
// By default the jacks shown on the Jack Selector screen are computed
// automatically by recommendForMachine() from closedHeight/groundClearance and
// estimated load (see the matching logic below) — normally just a primary +
// one alternate. Set `jackOverrides` on a machine ONLY when you want to bypass
// that automatic pick and show a specific, ordered list of catalogue jacks
// instead — e.g. because you know from experience which physical jacks the
// crew should grab, regardless of what the algorithm would otherwise rank
// highest. It's a list of one or more JACK_CATALOGUE `name` values, shown in
// the order given (first = primary/nr1, rest = alternates nr2, nr3, ...).
// Any name that doesn't match a catalogue entry is silently dropped; if none
// match, the automatic recommendation is used instead.
//
// To add a new machine: copy an entry and fill the specs.
//
// Fields:
//   brand, model      — machine identity
//   type              — haul_truck | adt | excavator | loader | dozer | grader
//   tyre              — standard tyre size (published)
//   operatingWeight   — GVW / operating weight, tonnes (published)
//   emptyWeight       — chassis/unladen weight, tonnes (published, where available)
//   axleNote          — axle config / heaviest-axle note where published (helps jack choice)
//   closedHeight      — jacking-point closed height (mm) — YOU fill in (site-measured).
//                       This can differ from groundClearance (see below) when the
//                       actual jacking point clears more/less than the published
//                       ground clearance figure.
//   jackOverrides     — OPTIONAL: array of exact JACK_CATALOGUE `name` values to
//                       show, in display order, bypassing automatic matching.
//                       Leave unset/empty to let recommendForMachine() pick
//                       automatically.
//   jackStand         — recommended jacking stand — not yet wired into the
//                       matching logic (the stand is still always auto-picked
//                       to match whichever jack is shown); reserved for future use.
//   note              — any warning / guidance for whoever edits this file next
//                       (not currently shown in the UI)
//   source            — where the machine spec came from

export const MACHINE_DATA = [
  // ── KOMATSU HAUL TRUCKS ──
  {
    brand: "Komatsu", model: "830E-5", type: "haul_truck",
    tyre: "50/80 R57", operatingWeight: 385.9, emptyWeight: 154.9,
    axleNote: "Rear (drive) axle carries the majority of GVW",
    groundClearance: 1280,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu / Wikipedia published specs",
  },
  {
    brand: "Komatsu", model: "860E-1K", type: "haul_truck",
    tyre: "50/80 R57 (opt 50/90 R57)", operatingWeight: 454.4, emptyWeight: 200.4,
    axleNote: "GVW 454t; 280 short ton payload",
    groundClearance: 1280,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu spec sheet / lectura-specs",
  },
  {
    brand: "Komatsu", model: "930E-5", type: "haul_truck",
    tyre: "53/80 R63", operatingWeight: 521.6, emptyWeight: 210.2,
    axleNote: "GVW ~522t; 320 short ton payload",
    groundClearance: 1280,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu / Wikipedia published specs",
  },
  {
    brand: "Komatsu", model: "960E-2", type: "haul_truck",
    tyre: "53/80 R63 (56/80 R63 on -2K)", operatingWeight: 576, emptyWeight: 249.5,
    axleNote: "Empty weight ~249.5t; GVW ~576t; 327t net load. Empty split ~49.5% front / 50.5% rear.",
    groundClearance: 1300,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu 960E-2 / ritchiespecs / lectura-specs",
  },

  // ── CATERPILLAR HAUL TRUCKS ──
  {
    brand: "Caterpillar", model: "777", type: "haul_truck",
    tyre: "27.00 R49", operatingWeight: 163.3, emptyWeight: 56.4,
    axleNote: "~100 ton class; loaded ~294,000 lb",
    groundClearance: 750, rearAxleClearance: 770,
    closedHeight: 800,
    jackOverrides: [
      "Powerlift / Hydralift — 600mm (100t)",
      "Powerlift / Hydralift — 600mm (150t)",
      "Powerlift / Hydralift — 800mm (100t)",
      "Powerlift / Hydralift — 800mm (150t)",
    ],
    jackStand: "",
    note: "Jacking-point clearance measured on site at 800mm+ (published ground clearance of 750mm is measured lower down, not at the jacking point). Both the 600mm and 800mm 100t/150t jacks fit; 600mm is listed first as the lower-profile option.",
    source: "Cat / ritchiespecs published data",
  },
  {
    brand: "Caterpillar", model: "785", type: "haul_truck",
    tyre: "33.00 R51 (opt 36.00 R51)", operatingWeight: 249.5, emptyWeight: 85.2,
    axleNote: "Ground clearance ~1004mm; GMW 249–256t by tyre",
    groundClearance: 1004,
    closedHeight: "",
    jackOverrides: [
      "Powerlift / Hydralift — 800mm (100t)",
      "Powerlift / Hydralift — 800mm (150t)",
    ],
    jackStand: "", note: "",
    source: "Cat 785 spec sheet",
  },
  {
    brand: "Caterpillar", model: "789", type: "haul_truck",
    tyre: "37 R57 (opt 40 R57 / 42/90 R57)", operatingWeight: 324.3, emptyWeight: 102.8,
    axleNote: "Rear axle clearance ~1178mm; GMW 324t",
    groundClearance: 1178, rearAxleClearance: 1178,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 789 spec sheet",
  },
  {
    brand: "Caterpillar", model: "793", type: "haul_truck",
    tyre: "40.00 R57 (opt 46/90 R57, 50/80 R57)", operatingWeight: 404.0, emptyWeight: 132.0,
    axleNote: "GMW 404t; 265 short ton payload",
    groundClearance: 1005, rearAxleClearance: 1128,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 793 spec sheet (ground clr 1005mm, rear axle clr 1128mm)",
  },

  // ── BELL ARTICULATED DUMP TRUCKS ──
  {
    brand: "Bell", model: "B25E", type: "adt",
    tyre: "23.5 R25", operatingWeight: 42, emptyWeight: 19.5,
    axleNote: "6x6 ADT; ~24t payload class",
    groundClearance: 500,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B25E specs",
  },
  {
    brand: "Bell", model: "B30E", type: "adt",
    tyre: "23.5 R25 (opt 750/65 R25)", operatingWeight: 49.2, emptyWeight: 21.2,
    axleNote: "6x6 ADT; laden 49.2t, rated payload 28t",
    groundClearance: 520,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B30E spec sheet",
  },
  {
    brand: "Bell", model: "B35E", type: "adt",
    tyre: "23.5 R25", operatingWeight: 56, emptyWeight: 24,
    axleNote: "6x6 ADT; ~33t payload class",
    groundClearance: 530,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B35E specs",
  },
  {
    brand: "Bell", model: "B40E", type: "adt",
    tyre: "29.5 R25 (opt 875/65 R29)", operatingWeight: 71.2, emptyWeight: 32.2,
    axleNote: "Empty axle loads (published): front 16.97t, mid 7.74t, rear 7.52t",
    groundClearance: 545, rearAxleClearance: 545,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell E-series B40E brochure",
  },
  {
    brand: "Bell", model: "B45E", type: "adt",
    tyre: "875/65 R29", operatingWeight: 76, emptyWeight: 33,
    axleNote: "6x6 ADT; ~41t payload class",
    groundClearance: 545,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B45E specs",
  },
  {
    brand: "Bell", model: "B50E", type: "adt",
    tyre: "875/65 R29", operatingWeight: 81.1, emptyWeight: 35.7,
    axleNote: "Laden 81.1t; rated payload 45.4t",
    groundClearance: 550,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell E-series B50E brochure",
  },
  {
    brand: "Bell", model: "B60E", type: "adt",
    tyre: "875/65 R29", operatingWeight: 108, emptyWeight: 48,
    axleNote: "Largest Bell ADT; 4x4, ~55t payload",
    groundClearance: 560,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Bell Equipment B60E specs",
  },

  // ── KOMATSU HD RIGID DUMP TRUCKS (smaller rigids) ──
  {
    brand: "Komatsu", model: "HD465-8", type: "haul_truck",
    tyre: "24.00 R35", operatingWeight: 99.7, emptyWeight: 43.1,
    axleNote: "55t class rigid; empty ~43t, empty split ~54% front / 46% rear",
    groundClearance: 985,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu HD465 / lectura-specs / ritchiespecs",
  },
  {
    brand: "Komatsu", model: "HD605-8", type: "haul_truck",
    tyre: "24.00 R35", operatingWeight: 100.5, emptyWeight: 44,
    axleNote: "70t class rigid; empty ~44t",
    groundClearance: 985,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu HD605 published specs",
  },
  {
    brand: "Komatsu", model: "HD785-8", type: "haul_truck",
    tyre: "33.00 R51", operatingWeight: 249, emptyWeight: 99,
    axleNote: "~91t payload rigid; empty ~99t",
    groundClearance: 780,
    closedHeight: 800,
    jackOverrides: [
      "Powerlift / Hydralift — 600mm (100t)",
      "Powerlift / Hydralift — 600mm (150t)",
      "Powerlift / Hydralift — 800mm (100t)",
      "Powerlift / Hydralift — 800mm (150t)",
    ],
    jackStand: "",
    note: "Jacking-point clearance measured on site at 800mm+ (published ground clearance of 780mm is measured lower down, not at the jacking point). Both the 600mm and 800mm 100t/150t jacks fit; 600mm is listed first as the lower-profile option.",
    source: "Komatsu HD785 published specs",
  },

  // ── VOLVO ARTICULATED HAULERS ──
  {
    brand: "Volvo", model: "A35G", type: "adt",
    tyre: "26.5 R25", operatingWeight: 62.5, emptyWeight: 28.5,
    axleNote: "6x6 ADT; payload 33.5t",
    groundClearance: 553,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Volvo A35G brochure",
  },
  {
    brand: "Volvo", model: "A40G", type: "adt",
    tyre: "29.5 R25", operatingWeight: 69.7, emptyWeight: 30.7,
    axleNote: "6x6 ADT; empty 30.7t, payload 39t",
    groundClearance: 553,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Volvo A40G brochure / ritchiespecs",
  },
  {
    brand: "Volvo", model: "A45G", type: "adt",
    tyre: "29.5 R25 (opt 875/65 R29)", operatingWeight: 71.1, emptyWeight: 30.1,
    axleNote: "6x6 ADT; empty 30.1t, payload 41t",
    groundClearance: 553,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Volvo A45G brochure",
  },
  {
    brand: "Volvo", model: "A60H", type: "adt",
    tyre: "875/65 R29", operatingWeight: 103.5, emptyWeight: 47.5,
    axleNote: "Largest Volvo ADT; payload 55t",
    groundClearance: 560,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Volvo A60H brochure",
  },

  // ── CATERPILLAR ARTICULATED DUMP TRUCKS ──
  {
    brand: "Caterpillar", model: "725", type: "adt",
    tyre: "23.5 R25", operatingWeight: 44, emptyWeight: 21.7,
    axleNote: "24t class ADT; empty ~21.7t, payload ~24t",
    groundClearance: 500,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 725 / lectura-specs",
  },
  {
    brand: "Caterpillar", model: "730", type: "adt",
    tyre: "23.5 R25", operatingWeight: 51, emptyWeight: 23.9,
    axleNote: "28t class ADT; empty axle split ~63% front",
    groundClearance: 520,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 730 / ritchiespecs",
  },
  {
    brand: "Caterpillar", model: "740", type: "adt",
    tyre: "29.5 R25", operatingWeight: 76.5, emptyWeight: 38.5,
    axleNote: "40t class ADT; empty ~38.5t, payload ~38-40t",
    groundClearance: 550,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 740 / makana specs",
  },
  {
    brand: "Caterpillar", model: "745", type: "adt",
    tyre: "29.5 R25", operatingWeight: 84, emptyWeight: 33.4,
    axleNote: "45t class ADT; payload ~41t",
    groundClearance: 555,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 745 / makana specs",
  },

  // ── KOMATSU ARTICULATED DUMP TRUCKS ──
  {
    brand: "Komatsu", model: "HM300-5", type: "adt",
    tyre: "23.5 R25", operatingWeight: 53.5, emptyWeight: 25.4,
    axleNote: "28t class ADT; empty 25.4t, GVW 53.5t",
    groundClearance: 600,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu HM300-5 spec sheet",
  },
  {
    brand: "Komatsu", model: "HM400-5", type: "adt",
    tyre: "29.5 R25", operatingWeight: 75.1, emptyWeight: 35,
    axleNote: "40t class ADT; empty 35t, GVW 75.1t",
    groundClearance: 620,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Komatsu HM400-5 spec sheet",
  },

  // ── JOHN DEERE ARTICULATED DUMP TRUCKS ──
  {
    brand: "John Deere", model: "410E", type: "adt",
    tyre: "26.5 R25", operatingWeight: 63, emptyWeight: 28.5,
    axleNote: "~37t payload ADT",
    groundClearance: 510,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "John Deere 410E published specs",
  },
  {
    brand: "John Deere", model: "460E", type: "adt",
    tyre: "29.5 R25", operatingWeight: 74, emptyWeight: 32.2,
    axleNote: "6x6 ADT; empty ~32.2t, payload ~41.8t",
    groundClearance: 540,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "John Deere 460E / ritchiespecs",
  },

  // ── WHEEL LOADERS (jacked for tyre changes) ──
  {
    brand: "Caterpillar", model: "982", type: "loader",
    tyre: "29.5-25", operatingWeight: 35, emptyWeight: 35,
    axleNote: "Wheel loader ~35t; weight per axle roughly half",
    groundClearance: 450,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "lectura-specs / Cat 982",
  },
  {
    brand: "Caterpillar", model: "988", type: "loader",
    tyre: "35/65-33 (35/65 R33)", operatingWeight: 50.8, emptyWeight: 50.8,
    axleNote: "Wheel loader ~50.8t; static loaded radius 978mm (Cat)",
    groundClearance: 466,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 988K spec sheet / lectura-specs",
  },
  {
    brand: "Caterpillar", model: "992", type: "loader",
    tyre: "45/65-45 (opt 45/65 R45)", operatingWeight: 105.4, emptyWeight: 105.4,
    axleNote: "Large wheel loader ~105t operating",
    groundClearance: 560,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 992 spec sheet",
  },

  // ── EXCAVATORS (tracked — jacked for undercarriage/track work, NOT tyres) ──
  {
    brand: "Komatsu", model: "PC1250", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 113.2, emptyWeight: 106.7,
    axleNote: "Crawler excavator — jacked for track/undercarriage work, not tyre changes",
    groundClearance: 700,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Komatsu PC1250-7 spec sheet",
  },

  // ── DOZERS (tracked) ──
  {
    brand: "Caterpillar", model: "D11", type: "dozer",
    tyre: "Tracked (no tyres)", operatingWeight: 112.7, emptyWeight: 104.8,
    axleNote: "Tracked dozer — jacked for undercarriage work, not tyre changes",
    groundClearance: 600,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Cat D11 published specs",
  },

  // ── CATERPILLAR HAUL TRUCKS — FLAGSHIP + SMALLER CLASS (added) ──
  {
    brand: "Caterpillar", model: "797F", type: "haul_truck",
    tyre: "59/80 R63", operatingWeight: 623.7, emptyWeight: 258.2,
    axleNote: "Flagship mechanical-drive mining truck; loaded ~33% front / 67% rear (rear axle carries majority of GVW); ~364t nominal payload",
    groundClearance: 786, rearAxleClearance: 947,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 797F / lectura-specs / ritchiespecs published data",
  },
  {
    brand: "Caterpillar", model: "772", type: "haul_truck",
    tyre: "21.00R33", operatingWeight: 82.1, emptyWeight: 35.5,
    axleNote: "Smaller/mid-size haul truck; empty 48% front/52% rear, loaded 34% front/66% rear",
    groundClearance: 719, rearAxleClearance: 561,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Cat 772 / ritchiespecs published data",
  },

  // ── KOMATSU HAUL TRUCKS — FLAGSHIP + SMALLER CLASS (added) ──
  {
    brand: "Komatsu", model: "980E-5", type: "haul_truck",
    tyre: "59/80 R63", operatingWeight: 628, emptyWeight: 265.1,
    axleNote: "Flagship electric-drive mining truck; empty front 127.3t/rear 137.9t, loaded front 34% (209.3t)/rear 66% (418.7t)",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Komatsu 980E-5 published specs (komatsu.com)",
  },
  {
    brand: "Komatsu", model: "HD325-8", type: "haul_truck",
    tyre: "18.00 R33", operatingWeight: 70.76, emptyWeight: 34.26,
    axleNote: "Smaller/mid-size mechanical-drive haul truck; loaded 33.7% front/66.3% rear, empty 56.5% front/43.5% rear",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Komatsu HD325-8 published specs (komatsu.com)",
  },

  // ── HITACHI HAUL TRUCKS (added — new manufacturer) ──
  {
    brand: "Hitachi", model: "EH5000AC-3", type: "haul_truck",
    tyre: "53/80 R63", operatingWeight: 500, emptyWeight: 204,
    axleNote: "Flagship electric-drive mining truck; ~296t nominal payload",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Hitachi EH5000AC-3 spec sheet (directindustry.com / hitachicm.com)",
  },
  {
    brand: "Hitachi", model: "EH3500AC-3", type: "haul_truck",
    tyre: "37.00R57", operatingWeight: 322, emptyWeight: 141,
    axleNote: "Smaller/mid-size pairing to the EH5000AC-3; empty 48% front/52% rear, loaded 33% front/67% rear; ~181t nominal payload",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Hitachi EH3500AC-3 spec sheet (directindustry.com)",
  },

  // ── LIEBHERR HAUL TRUCKS (added — new manufacturer) ──
  {
    brand: "Liebherr", model: "T284", type: "haul_truck",
    tyre: "56/80 R63", operatingWeight: 600, emptyWeight: 237,
    axleNote: "Flagship electric-drive mining truck; empty 50/50 front-rear, loaded 33% front/67% rear; ~363t nominal payload",
    groundClearance: 1240, rearAxleClearance: 1057,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Liebherr T284 official brochure",
  },
  {
    brand: "Liebherr", model: "T274", type: "haul_truck",
    tyre: "53/80 R63", operatingWeight: 528, emptyWeight: 223,
    axleNote: "Smaller/mid-size pairing to the T284; ~305t payload class",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Liebherr T274 (liebherr.com / lectura-specs)",
  },

  // ── BELAZ HAUL TRUCKS (added — new manufacturer) ──
  {
    brand: "Belaz", model: "75710", type: "haul_truck",
    tyre: "59/80R63", operatingWeight: 810, emptyWeight: 360,
    axleNote: "Flagship — one of the largest haul trucks in the world; empty 60% front/40% rear, loaded 50/50; ~450t payload",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Belaz 75710 spec sheet",
  },
  {
    brand: "Belaz", model: "75131", type: "haul_truck",
    tyre: "33.00R51", operatingWeight: 237.1, emptyWeight: 107.1,
    axleNote: "Smaller/mid-size pairing to the 75710; ~130–140t payload capacity",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Ground clearance not published — measure on site.",
    source: "Belaz official product page (belaz.by)",
  },

  // ── ADDITIONAL MINING WHEEL LOADERS (added) ──
  {
    brand: "Caterpillar", model: "994K", type: "loader",
    tyre: "58/85-57", operatingWeight: 242.6, emptyWeight: 242.6,
    axleNote: "Flagship mining wheel loader; only one weight figure published (operating, standard equipment/fluids/operator) — used for both fields",
    groundClearance: 1355,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "Cat 994K spec sheet / ritchiespecs",
  },
  {
    brand: "Komatsu", model: "WA1200-6", type: "loader",
    tyre: "60/80 R57", operatingWeight: 220.55, emptyWeight: 220.55,
    axleNote: "Flagship mining wheel loader; single published weight figure used for both fields",
    groundClearance: 552,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "Komatsu WA1200-6 (komatsu.eu) / ritchiespecs (ground clearance)",
  },
  {
    brand: "Volvo", model: "L350H", type: "loader",
    tyre: "875/65 R33", operatingWeight: 53.22, emptyWeight: 53.22,
    axleNote: "Large wheel loader; single published weight figure used for both fields",
    groundClearance: 550,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "Volvo L350H official brochure (volvoce.com)",
  },
  {
    brand: "Hitachi", model: "ZW550-6", type: "loader",
    tyre: "35/65 R33", operatingWeight: 47.57, emptyWeight: 47.57,
    axleNote: "Large wheel loader; single published weight figure used for both fields",
    groundClearance: 545,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "Hitachi ZW550-6 spec sheet (hitachicm.com)",
  },
  {
    brand: "Liebherr", model: "L586 XPower", type: "loader",
    tyre: "29.5 R25", operatingWeight: 32.6, emptyWeight: 32.6,
    axleNote: "Large wheel loader; single published weight figure used for both fields",
    groundClearance: 575,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "Liebherr L586 XPower official brochure",
  },

  // ── LETOURNEAU WHEEL LOADERS (added — new manufacturer) ──
  {
    brand: "LeTourneau", model: "L-2350", type: "loader",
    tyre: "70/70-57", operatingWeight: 262.18, emptyWeight: 262.18,
    axleNote: "One of the largest wheel loaders in the world; single published weight figure used for both fields",
    groundClearance: 460,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "LeTourneau L-2350 dealer spec sheet",
  },
  {
    brand: "LeTourneau", model: "L-1850", type: "loader",
    tyre: "58/85-57", operatingWeight: 229.52, emptyWeight: 229.52,
    axleNote: "Large mining wheel loader, smaller pairing to the L-2350; single published weight figure used for both fields",
    groundClearance: 760,
    closedHeight: "", jack: "", jackStand: "", note: "Operating weight ≈ working weight for loaders.",
    source: "LeTourneau L-1850 spec sheet",
  },

  // ── ADDITIONAL MINING EXCAVATORS (added) ──
  {
    brand: "Caterpillar", model: "6020B", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 224, emptyWeight: 224,
    axleNote: "Crawler mining excavator — jacked for track/undercarriage work, not tyre changes. Sources vary 220–230t by configuration.",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres. Ground clearance not published — measure on site.",
    source: "Cat 6020B factory spec sheet / lectura-specs",
  },
  {
    brand: "Caterpillar", model: "390F L", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 86.27, emptyWeight: 70.97,
    axleNote: "Crawler excavator — jacked for track/undercarriage work, not tyre changes. emptyWeight is Cat's published 'minimum operating weight', the closest available lower-bound figure.",
    groundClearance: 902,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Cat 390F L (ritchiespecs)",
  },
  {
    brand: "Komatsu", model: "PC3000-6", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 262, emptyWeight: 262,
    axleNote: "Crawler mining excavator — jacked for track/undercarriage work, not tyre changes. Backhoe config; front-shovel config ~258t.",
    groundClearance: 920,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Komatsu PC3000-6 brochure (komatsu.com) / ritchiespecs (ground clearance)",
  },
  {
    brand: "Hitachi", model: "EX3600-7", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 370, emptyWeight: 370,
    axleNote: "Crawler mining excavator — jacked for track/undercarriage work, not tyre changes. Backhoe config (loading-shovel config ~369t).",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres. Ground clearance not published — measure on site.",
    source: "Hitachi EX3600-7 brochure (hitachicm.com)",
  },
  {
    brand: "Hitachi", model: "EX1200-7", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 115, emptyWeight: 115,
    axleNote: "Crawler excavator — jacked for track/undercarriage work, not tyre changes. Backhoe (FCO) config; other configs 115–119t.",
    groundClearance: 1020,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Hitachi EX1200-7 spec sheet",
  },
  {
    brand: "Liebherr", model: "R 9400", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 345.5, emptyWeight: 345.5,
    axleNote: "Crawler mining excavator — jacked for track/undercarriage work, not tyre changes. Backhoe config (face-shovel config 353t).",
    groundClearance: 1049,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Liebherr R9400 (liebherr.com) / ritchiespecs (ground clearance)",
  },
  {
    brand: "Liebherr", model: "R 9800", type: "excavator",
    tyre: "Tracked (no tyres)", operatingWeight: 800, emptyWeight: 800,
    axleNote: "Crawler mining excavator — one of the largest hydraulic excavators in the world; jacked for track/undercarriage work, not tyre changes. Backhoe config (face-shovel 810t).",
    groundClearance: 1572,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Liebherr R9800 (liebherr.com) / ritchiespecs (ground clearance)",
  },

  // ── ADDITIONAL MINING DOZERS (added) ──
  {
    brand: "Komatsu", model: "D475A-8", type: "dozer",
    tyre: "Tracked (no tyres)", operatingWeight: 115.3, emptyWeight: 88.2,
    axleNote: "Tracked dozer — jacked for undercarriage work, not tyre changes. emptyWeight is Komatsu's published 'tractor weight' (base machine without blade/ripper).",
    groundClearance: 615,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Komatsu D475A-8 (komatsu.com)",
  },
  {
    brand: "Komatsu", model: "D375A-8", type: "dozer",
    tyre: "Tracked (no tyres)", operatingWeight: 74.09, emptyWeight: 56.34,
    axleNote: "Tracked dozer — jacked for undercarriage work, not tyre changes. emptyWeight is Komatsu's published 'tractor weight' (base machine without blade/ripper).",
    groundClearance: 610,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Komatsu D375A-8 (komatsu.com)",
  },
  {
    brand: "Liebherr", model: "PR776", type: "dozer",
    tyre: "Tracked (no tyres)", operatingWeight: 73.19, emptyWeight: 54.07,
    axleNote: "Tracked mining dozer — jacked for undercarriage work, not tyre changes. Figures vary 71.8–73.2t (operating) / 53.1–54.1t (tractor w/o attachments) by shoe width; upper end used here.",
    groundClearance: 703,
    closedHeight: "", jack: "", jackStand: "", note: "Tracked machine — jacking is for undercarriage, not tyres.",
    source: "Liebherr PR776 (liebherr.com)",
  },

  // ── GRADERS (added — first entries in this category) ──
  // Note: Komatsu GD955-5 was researched but no verifiable published spec sheet
  // could be found under that exact designation (searches only surface the
  // current GD955-7 generation) — deliberately left out rather than guessed.
  {
    brand: "Caterpillar", model: "24M", type: "grader",
    tyre: "29.5-29", operatingWeight: 66.1, emptyWeight: 66.1,
    axleNote: "Largest production motor grader; 3-axle (front steer + rear tandem). Cat publishes several configuration weights (62.4–66.1t) rather than one figure — upper end used here. Front axle clearance ~884mm, rear ~607mm.",
    groundClearance: "",
    closedHeight: "", jack: "", jackStand: "", note: "No single published ground clearance figure — measure on site.",
    source: "Cat 24M (ritchiespecs / constructionequipmentguide)",
  },
  {
    brand: "Volvo", model: "G990", type: "grader",
    tyre: "16.00 x 24", operatingWeight: 27.2, emptyWeight: 22.1,
    axleNote: "3-axle motor grader (articulated front steer + oscillating rear tandem). 22.1t standard operating weight; up to 27.2t with ballast.",
    groundClearance: 615,
    closedHeight: "", jack: "", jackStand: "", note: "",
    source: "Volvo G990 official spec sheet (volvoce.com)",
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
// Tyre data. maxLoss = sidewall height = (overall diameter − rim diameter) ÷ 2,
// in mm — the MAXIMUM possible clearance loss if the tyre is fully deflated (a
// tyre cannot drop more than its own sidewall). This is a true upper bound from
// published dimensions, NOT an estimate of actual flat-deflection (which varies
// and must be measured on site). Rim: R57=1448mm, R63=1600mm, R51=1295mm,
// R49=1245mm, R25=635mm, R29=737mm.
export const TYRE_DATA = {
  "50/80 R57": { overallDia: 3620, rim: 1448, source: "Michelin/Bridgestone 50/80R57" },
  "50/90 R57": { overallDia: 3825, rim: 1448, source: "Bridgestone 50/90R57" },
  "53/80 R63": { overallDia: 3980, rim: 1600, source: "Approx 53/80R63" },
  "40.00 R57": { overallDia: 3570, rim: 1448, source: "Michelin/Bridgestone 40.00R57" },
  "37 R57":    { overallDia: 3440, rim: 1448, source: "Bridgestone 37.00R57" },
  "33.00 R51": { overallDia: 2987, rim: 1295, source: "Michelin 33.00R51" },
  "27.00 R49": { overallDia: 2775, rim: 1245, source: "Michelin 27.00R49" },
  "23.5 R25":  { overallDia: 1620, rim: 635,  source: "23.5R25 published" },
  "29.5 R25":  { overallDia: 1855, rim: 635,  source: "29.5R25 published" },
  "875/65 R29": { overallDia: 1875, rim: 737, source: "875/65R29 published" },
};

// Compute sidewall (max clearance loss) for a tyre entry.
function maxLoss(t) {
  if (!t || !t.overallDia || !t.rim) return null;
  return Math.round((t.overallDia - t.rim) / 2);
}

// Look up tyre data by matching the machine's tyre string against known sizes.
export function tyreInfo(tyreStr) {
  if (!tyreStr) return null;
  const s = tyreStr.toLowerCase();
  for (const size of Object.keys(TYRE_DATA)) {
    if (s.includes(size.toLowerCase())) return { size, ...TYRE_DATA[size], maxLoss: maxLoss(TYRE_DATA[size]) };
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
    capacity: 200,
    closedHeight: 600, stroke: 315, maxLift: 915,
    note: "Incl. 50mm swivel load cap. Stepped extension dollies: 100 / 200 / 300 / 300mm.",
  },
  {
    name: "Powerlift / Hydralift — 600mm (100t)",
    range: "Air/hydraulic, 100 ton",
    capacity: 100,
    closedHeight: 600, stroke: 315, maxLift: 915,
    note: "Incl. 50mm swivel load cap. 100t variant of the 600mm range.",
  },
  {
    name: "Powerlift / Hydralift — 600mm (150t)",
    range: "Air/hydraulic, 150 ton",
    capacity: 150,
    closedHeight: 600, stroke: 315, maxLift: 915,
    note: "Incl. 50mm swivel load cap. 150t variant of the 600mm range.",
  },
  {
    name: "Powerlift / Hydralift — 800mm",
    range: "Air/hydraulic, 50–200 ton",
    capacity: 200,
    closedHeight: 800, stroke: 515, maxLift: 1315,
    note: "Incl. 50mm swivel load cap.",
  },
  {
    name: "Powerlift / Hydralift — 800mm (100t)",
    range: "Air/hydraulic, 100 ton",
    capacity: 100,
    closedHeight: 800, stroke: 515, maxLift: 1315,
    note: "Incl. 50mm swivel load cap. 100t variant of the 800mm range.",
  },
  {
    name: "Powerlift / Hydralift — 800mm (150t)",
    range: "Air/hydraulic, 150 ton",
    capacity: 150,
    closedHeight: 800, stroke: 515, maxLift: 1315,
    note: "Incl. 50mm swivel load cap. 150t variant of the 800mm range.",
  },
  {
    name: "Powerlift / Hydralift — 1000mm",
    range: "Air/hydraulic, 50–200 ton",
    capacity: 200,
    closedHeight: 1000, stroke: 715, maxLift: 1715,
    note: "Incl. 50mm swivel load cap. Stepped extension dollies: 200 / 300 / 300mm.",
  },
  // ── Small-machine range (Cattini Yak / Mammut) — manufacturer verified ──
  {
    name: "Yak 221/N",
    range: "Air-hydraulic, 40/20 t (2-stage)",
    capacity: 40,
    closedHeight: 219, stroke: 250, maxLift: 469,
    small: true, note: "Compact. Cattini spec. For light/low-clearance vehicles.",
  },
  {
    name: "Yak 142",
    range: "Air-hydraulic, 50 t",
    capacity: 50,
    closedHeight: 420, stroke: 277, maxLift: 697,
    small: true, note: "For high-riding vehicles (tractors/plant). Cattini spec.",
  },
  {
    name: "Yak 330/S",
    range: "Air-hydraulic, 80/50/25 t (3-stage)",
    capacity: 80,
    closedHeight: 313, stroke: 505, maxLift: 818,
    small: true, note: "High-stroke, chassis lifting. Cattini spec.",
  },
  {
    name: "Mammut M80-42",
    range: "Air-hydraulic, 80/50 t (2-stage)",
    capacity: 80,
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
  // Prefer an explicit jacking closed-height if set (site-measured). Otherwise
  // fall back to published ground clearance as the basis for the recommendation
  // — a real figure that approximates the working gap. Only if neither exists do
  // we use the general-purpose default.
  const ch = parseInt(machine.closedHeight, 10);
  const gc = parseInt(machine.groundClearance, 10);
  const basis = Number.isFinite(ch) ? ch : (Number.isFinite(gc) ? gc : null);

  // ── Load on the jack (tonnage check) ──
  // Conservative worst-case: assume up to 50% of the machine's EMPTY weight sits
  // on the jack (lifting a whole end). A jack must be rated at/above this. This
  // never under-rates. If empty weight is unknown we can't check capacity, so we
  // flag it rather than guess.
  const emptyWt = Number(machine.emptyWeight) || 0;
  const jackLoad = emptyWt ? Math.round(emptyWt * 0.5) : null; // tonnes on the jack (worst case)

  // A jack is capacity-adequate if its rating covers the estimated jack load.
  const capacityOK = j => jackLoad == null ? true : (j.capacity || 0) >= jackLoad;

  // ── Manual override ──
  // If this machine lists specific catalogue jacks (see the field docs at the
  // top of this file), use them directly and in that order, instead of
  // auto-matching by height/load. Names that don't match a catalogue entry are
  // dropped; if nothing in the list matches, we fall through to automatic
  // matching rather than silently showing nothing.
  const findJackByName = name => JACK_CATALOGUE.find(j => j.name === name);
  const overrideList = Array.isArray(machine.jackOverrides)
    ? machine.jackOverrides.map(findJackByName).filter(Boolean)
    : [];

  let jack;
  let alternatives = [];
  if (overrideList.length) {
    [jack, ...alternatives] = overrideList;
  } else if (basis !== null) {
    // Jacks that fit under the clearance, ranked by height band then capacity.
    const band = h => Math.round(h / 25);
    const fitsHeight = JACK_CATALOGUE.filter(j => j.closedHeight <= basis)
      .sort((a, b) => (band(b.closedHeight) - band(a.closedHeight)) || ((b.capacity || 0) - (a.capacity || 0)));
    // Prefer jacks that ALSO have adequate capacity for the load.
    const fitsBoth = fitsHeight.filter(capacityOK);
    const usable = fitsBoth.length ? fitsBoth : fitsHeight; // fall back to height-fit if none meet capacity
    jack = usable[0] || JACK_CATALOGUE.slice().sort((a,b)=>a.closedHeight-b.closedHeight)[0];
    // Only ever surface ONE automatic alternate (nr2) — the screen is meant to
    // show a short, decisive pick, not every jack that happens to fit.
    alternatives = usable.filter(j => j.name !== jack.name).slice(0, 1);
  } else {
    // No confirmed clearance: recommend the general-purpose 800mm as nr1, and
    // order alternatives by relevance — for big machines the taller 1000mm is
    // the more likely next choice, so order the big Powerlift/Hydralift jacks by
    // closeness to nr1, then the small (Yak/Mammut) jacks after. This ensures a
    // sensible nr2 (not just whatever's first in the array).
    jack = JACK_CATALOGUE.find(j => j.closedHeight === 800) || JACK_CATALOGUE[0];
    const big = JACK_CATALOGUE.filter(j => !j.small && j.name !== jack.name);
    const small = JACK_CATALOGUE.filter(j => j.small && j.name !== jack.name);
    // For haul trucks / big machines, prefer the taller 1000mm as nr2.
    const isBigMachine = ["haul_truck","loader","excavator","dozer"].includes(machine.type);
    big.sort((a, b) => isBigMachine ? (b.closedHeight - a.closedHeight) : (a.closedHeight - b.closedHeight));
    // Only ever surface ONE automatic alternate (nr2) — same reasoning as above.
    alternatives = [...big, ...small].slice(0, 1);
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
  // Alternative stand: the other capacity at the same closed height (or next best fit).
  const standAlt = JACK_STAND_CATALOGUE.find(s =>
    s.closedHeight === stand.closedHeight && s.capacity !== stand.capacity
  ) || standsByFit.find(s => s.name !== stand.name);

  // Heavy-machine note: if EMPTY weight is high, remind to confirm per-point load
  // (empty weight is what's actually on the jack — you jack unladen machines).
  const heavy = (machine.emptyWeight || 0) >= 130;

  // Does the chosen jack actually cover the load? (for the warning)
  const overCapacity = (jackLoad != null && jack && (jack.capacity || 0) < jackLoad);
  return { jack, alternatives, stand, standAlt, heavy, clearanceKnown: basis !== null, basis, jackLoad, overCapacity };
}
