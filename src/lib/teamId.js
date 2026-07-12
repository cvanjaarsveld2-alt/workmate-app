// ─── Team ID Injection Helper ─────────────────────────────────────────────────
// Every team-owned record MUST include team_id when created.
// Previously only leads did this — clients, contacts, quotes, notes,
// equipment, and follow-ups were all created without team_id, making
// them invisible on the Team Dashboard.
//
// Usage (in every screen's save function):
//   import { withTeamId } from "../lib/teamId";
//   const item = withTeamId({ id: genId(), user_id: userId, ... }, teamId);
// ─────────────────────────────────────────────────────────────────────────────

export function withTeamId(record, teamId) {
  return {
    ...record,
    team_id: teamId || record.team_id || null,
  };
}
