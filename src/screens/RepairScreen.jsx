// Repair reports use the same report engine as breakdowns, with repair-specific mode.
import React from "react";
import { BreakdownScreen } from "./BreakdownScreen";

export function RepairScreen(props) {
  return <BreakdownScreen {...props} mode="repair" />;
}
