// ─── Company wordmark ─────────────────────────────────────────────────────────
// The signed-in company's name as a bold brand mark (from its company profile),
// or the product name before a company is set. Works on light and dark
// backgrounds via the `variant` prop.
//
//   <Wordmark />                 → dark text (for light backgrounds)
//   <Wordmark variant="light" /> → white text (for dark/red backgrounds)
//   <Wordmark size="lg" />       → larger sizing
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { activeProfile, companyName } from "../lib/companyProfile";
import { PRODUCT_NAME } from "../lib/brand";

export function Wordmark({ variant = "dark", size = "md", className = "" }) {
  const [profile, setProfile] = useState(activeProfile);
  useEffect(() => {
    const refresh = () => setProfile(activeProfile());
    window.addEventListener("pm:company-profile", refresh);
    return () => window.removeEventListener("pm:company-profile", refresh);
  }, []);
  const onDark = variant === "light";
  // Dark variant flips in dark mode via --pm-wordmark (darkMode.css).
  const color = onDark ? "#FFFFFF" : "var(--pm-wordmark, #111111)";
  const fontSize = { sm: "1rem", md: "1.35rem", lg: "1.9rem" }[size] || "1.35rem";
  const name = companyName(profile) || PRODUCT_NAME;
  return (
    <span
      className={`inline-block truncate max-w-[220px] align-baseline ${className}`}
      title={name}
      style={{ fontStyle: "italic", fontWeight: 900, fontSize, color, letterSpacing: "-0.02em", lineHeight: 1.1 }}
    >
      {name}
    </span>
  );
}
