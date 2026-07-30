// ─── Skeleton loaders ────────────────────────────────────────────────────────
import React from "react";

const shimmer = {
  background: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
  backgroundSize: "200% 100%",
  animation: "pm-shimmer 1.4s ease-in-out infinite",
};
if (typeof document !== "undefined" && !document.getElementById("pm-shimmer-style")) {
  const s = document.createElement("style");
  s.id = "pm-shimmer-style";
  s.textContent = "@keyframes pm-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }";
  document.head.appendChild(s);
}
export function SkeletonLine({ w = "100%", h = 14, className = "" }) {
  return <div className={`rounded-md ${className}`} style={{ ...shimmer, width: w, height: h }} />;
}
export function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white p-4 border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <SkeletonLine w="45%" h={16} />
        <SkeletonLine w="60px" h={22} className="rounded-full" />
      </div>
      <SkeletonLine w="80%" h={12} />
      <SkeletonLine w="65%" h={12} />
    </div>
  );
}
export function SkeletonList({ count = 5 }) {
  return <div className="space-y-3">{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</div>;
}
