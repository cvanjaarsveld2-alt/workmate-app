// ─── Breakdown fault library ─────────────────────────────────────────────────
// Common faults grouped by discipline. Used to populate the per-photo dropdown.
// Users can also add their own free-text fault via the note field.
// ─────────────────────────────────────────────────────────────────────────────

export const FAULT_GROUPS = [
  {
    group: "Hydraulic",
    faults: [
      "Hydraulic leak",
      "Burst hose",
      "Cylinder seal failure",
      "Low hydraulic pressure",
      "Contaminated oil",
      "Pump failure",
      "Valve stuck / blocked",
      "Fitting loose / weeping",
    ],
  },
  {
    group: "Mechanical",
    faults: [
      "Bearing failure",
      "Cracked / broken weld",
      "Worn bushing / pin",
      "Gearbox failure",
      "Coupling worn",
      "Excessive play / backlash",
      "Seized component",
      "Structural crack",
      "Bolt / fastener sheared",
      "Excessive wear",
    ],
  },
  {
    group: "Electrical",
    faults: [
      "Blown fuse",
      "Tripped breaker",
      "Burnt / damaged cable",
      "Loose connection",
      "Corroded terminal",
      "Faulty sensor",
      "Motor failure",
      "Short circuit",
      "Earth fault",
      "Control fault / no signal",
    ],
  },
  {
    group: "Pneumatic",
    faults: [
      "Air leak",
      "Compressor fault",
      "Regulator failure",
      "Blocked / kinked line",
      "Cylinder not actuating",
    ],
  },
  {
    group: "Vehicle / Fleet",
    faults: [
      "Engine won't start",
      "Overheating",
      "Brake fault",
      "Tyre damage / puncture",
      "Battery flat / faulty",
      "Warning light active",
      "Fluid leak (oil / coolant / fuel)",
      "Suspension damage",
      "Clutch / transmission fault",
      "Lights / electrical fault",
    ],
  },
  {
    group: "Wear & Consumables",
    faults: [
      "Filter blocked",
      "Belt worn / broken",
      "Fluid low / empty",
      "Component past service life",
      "Guard / cover missing",
    ],
  },
  {
    group: "General",
    faults: [
      "Physical damage / impact",
      "Corrosion / rust",
      "Overloaded",
      "Misalignment",
      "Contamination / ingress",
      "Operator error",
      "Needs further inspection",
      "Other (see note)",
    ],
  },
];

// Flat list for quick search
export const ALL_FAULTS = FAULT_GROUPS.flatMap(g => g.faults);

export const SEVERITY_OPTIONS = [
  { value: "low",      label: "Low",      color: "#16A34A" },
  { value: "medium",   label: "Medium",   color: "#D97706" },
  { value: "high",     label: "High",     color: "#DC2626" },
  { value: "critical", label: "Critical", color: "#7F1D1D" },
];

export const STATUS_OPTIONS = [
  { value: "open",        label: "Open",        color: "#DC2626" },
  { value: "in_progress", label: "In progress", color: "#D97706" },
  { value: "resolved",    label: "Resolved",    color: "#16A34A" },
];
