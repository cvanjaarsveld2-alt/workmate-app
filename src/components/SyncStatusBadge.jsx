import React from "react";

export default function SyncStatusBadge({
  isOnline,
  pendingCount = 0,
}) {
  let text = "Online";
  let bg = "#15803d";

  if (!isOnline) {
    text = "Offline";
    bg = "#b91c1c";
  }

  if (pendingCount > 0) {
    text = `${pendingCount} Pending Sync`;
    bg = "#b45309";
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        background: bg,
        color: "white",
        padding: "8px 14px",
        borderRadius: "999px",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {text}
    </div>
  );
}
