// ─── Team view ───────────────────────────────────────────────────────────────
// Screens list records the signed-in user created or is assigned. A member the
// master account has granted "whole-team view" (team_members.can_view_team, set
// only via set_member_access) also sees teammates' records; the master always
// can. Permitted users can still switch back to "only mine" on the Team screen.
import { createContext, useCallback, useContext } from "react";

export const TEAM_VIEW_KEY = "pm_team_view_on";
export const TeamViewContext = createContext({ teamId: null, showTeam: false });

export function readTeamViewPref() {
  try { return localStorage.getItem(TEAM_VIEW_KEY) !== "0"; } catch { return true; }
}

export function writeTeamViewPref(on) {
  try { localStorage.setItem(TEAM_VIEW_KEY, on ? "1" : "0"); } catch {}
  window.dispatchEvent(new CustomEvent("powermate:team-view", { detail: { on } }));
}

// Records the user personally owns or is assigned — used where the answer must
// not widen with team view (e.g. which follow-ups remind *this* person).
export function isOwnRecord(record, userId) {
  return !!record && (record.user_id === userId || record.assigned_to_user_id === userId);
}

export function useIsMine(userId) {
  const { teamId, showTeam } = useContext(TeamViewContext);
  return useCallback(
    record => isOwnRecord(record, userId) || (showTeam && !!teamId && record?.team_id === teamId),
    [userId, teamId, showTeam],
  );
}
