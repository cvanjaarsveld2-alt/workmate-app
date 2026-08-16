// ─── Power Works text wordmark ───────────────────────────────────────────────
// A text-based brand mark that replaces the logo image. Echoes the logo's look:
// bold italic "POWER" + "WORKS" with the "(PTY) LTD" tag. Works on light and
// dark backgrounds via the `variant` prop.
//
//   <Wordmark />                 → dark text (for light backgrounds)
//   <Wordmark variant="light" /> → white text (for dark/red backgrounds)
//   <Wordmark size="lg" />       → larger sizing
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import { BRAND } from "../lib/constants";

export function Wordmark({ variant = "dark", size = "md", className = "" }) {
  const onDark = variant === "light";
  // "light" variant is always white (used on the red drawer). The "dark" variant
  // is dark text on light backgrounds — but must flip to light in dark mode, so
  // it uses a CSS variable (--pm-wordmark, defined in darkMode.css) rather than
  // a hardcoded near-black that would vanish on a dark background.
  const powerColor = onDark ? "#FFFFFF" : "var(--pm-wordmark, #111111)";
  const worksColor = BRAND.primary; // brand red
  const tagColor = onDark ? "rgba(255,255,255,0.75)" : "var(--pm-wordmark-tag, #6B7280)";

  const sizes = {
    sm: { power: "1rem",    works: "1rem",    tag: "0.5rem",  gap: "0.28rem" },
    md: { power: "1.5rem",  works: "1.5rem",  tag: "0.6rem",  gap: "0.35rem" },
    lg: { power: "2.1rem",  works: "2.1rem",  tag: "0.72rem", gap: "0.45rem" },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className={`inline-flex items-baseline ${className}`} style={{ gap: s.gap, lineHeight: 1 }}>
      <span
        style={{
          fontStyle: "italic",
          fontWeight: 900,
          fontSize: s.power,
          color: powerColor,
          letterSpacing: "-0.02em",
        }}>
        POWER
      </span>
      <span
        style={{
          fontStyle: "italic",
          fontWeight: 800,
          fontSize: s.works,
          color: worksColor,
          letterSpacing: "-0.01em",
        }}>
        WORKS
      </span>
      <span
        style={{
          fontWeight: 700,
          fontSize: s.tag,
          color: tagColor,
          letterSpacing: "0.04em",
          transform: "translateY(-0.15em)",
        }}>
        (PTY) LTD
      </span>
    </div>
  );
}
