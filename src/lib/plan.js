// ─── The company's plan ───────────────────────────────────────────────────────
// { plan, status, trial_ends_at, paid_until, access: "full"|"read_only"|"suspended" }
// from my_team_plan(). The database enforces access; this drives the banners.
// Kept on the device so the app knows its state offline.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const KEY = teamId => `pm_team_plan__${teamId}`;
const read = teamId => {
  try {
    return JSON.parse(localStorage.getItem(KEY(teamId)) || "null");
  } catch {
    return null;
  }
};

export function trialDaysLeft(plan, now = Date.now()) {
  if (!plan || plan.plan !== "trial" || !plan.trial_ends_at) return null;
  return Math.max(0, Math.ceil((new Date(plan.trial_ends_at).getTime() - now) / 86400000));
}

export function useTeamPlan(teamId, online) {
  const [plan, setPlan] = useState(() => (teamId ? read(teamId) : null));
  useEffect(() => {
    if (!teamId) return setPlan(null);
    setPlan(read(teamId));
    if (!online) return;
    let live = true;
    supabase.rpc("my_team_plan").then(
      ({ data, error }) => {
        if (!live || error || !data) return;
        setPlan(data);
        try {
          localStorage.setItem(KEY(teamId), JSON.stringify(data));
        } catch {}
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [teamId, online]);
  return plan;
}
