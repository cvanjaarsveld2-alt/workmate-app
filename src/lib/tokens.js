// ─── Design Tokens ───────────────────────────────────────────────────────────
// Single source of truth for the visual language. Import from here instead of
// hardcoding hex values, so a brand change is one edit and the app stays
// visually consistent as it grows.
// ─────────────────────────────────────────────────────────────────────────────

// ── Colour ──────────────────────────────────────────────────────────────────
export const COLORS = {
  // Brand
  primary:      "#8B1A1A",
  primaryDark:  "#6B1414",
  primaryLight: "#F7F3F3",
  primaryTint:  "#FBEAEA",   // subtle background wash

  // Semantic — used for status, feedback, actions
  success:      "#16A34A",
  successBg:    "#F0FDF4",
  successText:  "#15803D",

  warning:      "#D97706",
  warningBg:    "#FFFBEB",
  warningText:  "#B45309",

  danger:       "#DC2626",
  dangerBg:     "#FFF1F2",
  dangerText:   "#BE123C",

  info:         "#2563EB",
  infoBg:       "#EFF6FF",
  infoText:     "#1D4ED8",

  accent:       "#7C3AED",   // purple — used for "active"/highlights
  accentBg:     "#FAF5FF",
  accentText:   "#7E22CE",

  // Neutrals (slate scale — matches Tailwind slate)
  ink:          "#0F172A",   // slate-900 — primary text
  inkSoft:      "#334155",   // slate-700
  muted:        "#64748B",   // slate-500 — secondary text
  faint:        "#94A3B8",   // slate-400 — hints/placeholders
  line:         "#E2E8F0",   // slate-200 — borders
  lineSoft:     "#F1F5F9",   // slate-100 — dividers
  surface:      "#FFFFFF",
  canvas:       "#F8FAFC",   // slate-50 — page background
};

// ── Type scale ──────────────────────────────────────────────────────────────
// A disciplined 6-step scale. Use these class strings instead of ad-hoc sizes.
export const TYPE = {
  display: "text-2xl font-black tracking-tight",  // screen titles
  title:   "text-lg font-black",                  // section titles / sheet headers
  body:    "text-sm font-bold",                   // primary content
  bodyReg: "text-sm font-medium",                 // secondary content
  label:   "text-xs font-black uppercase tracking-wider", // eyebrow labels
  caption: "text-xs font-medium",                 // hints, metadata
};

// ── Spacing / radius / motion ───────────────────────────────────────────────
export const RADIUS = {
  sm:  "rounded-lg",
  md:  "rounded-xl",
  lg:  "rounded-2xl",
  xl:  "rounded-3xl",
  full:"rounded-full",
};

// Standard tap target — never smaller than 44px (Apple HIG)
export const TAP = "min-h-[44px]";
export const TAP_LG = "min-h-[52px]";

// One spring, used everywhere sheets/modals animate, so motion feels coherent
export const SHEET_SPRING = { type: "spring", damping: 28, stiffness: 300 };
export const SHEET_ANIM = {
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
  },
  panel: {
    initial: { y: "100%" },
    animate: { y: 0 },
    exit:    { y: "100%" },
    transition: { type: "spring", damping: 28, stiffness: 300 },
  },
};

// Status → colour set resolver (for pills, badges)
export function statusColor(kind) {
  switch (kind) {
    case "success": return { bg: COLORS.successBg, text: COLORS.successText };
    case "warning": return { bg: COLORS.warningBg, text: COLORS.warningText };
    case "danger":  return { bg: COLORS.dangerBg,  text: COLORS.dangerText };
    case "info":    return { bg: COLORS.infoBg,    text: COLORS.infoText };
    case "accent":  return { bg: COLORS.accentBg,  text: COLORS.accentText };
    default:        return { bg: COLORS.lineSoft,  text: COLORS.muted };
  }
}
