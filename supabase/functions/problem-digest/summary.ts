// Builds the one-line problem summary. Kept free of imports so the unit tests
// (tests/problem-digest.test.mjs) can load it with Node's type stripping.
export const PROBLEMS: Record<string, { one: string; many: string }> = {
  sync_failed: { one: "sync failure", many: "sync failures" },
  screen_crashed: { one: "screen crash", many: "screen crashes" },
  app_crashed: { one: "app crash", many: "app crashes" },
  window_error: { one: "app error", many: "app errors" },
  unhandled_rejection: { one: "background error", many: "background errors" },
  storage_not_persistent: { one: "phone that may lose offline data", many: "phones that may lose offline data" },
};

export type Ev = { name: string; user_id: string | null; data: Record<string, unknown> | null };

// "3 sync failures (2 people) · 1 screen crash on Quotes"
export function summarise(events: Ev[]): { total: number; text: string } {
  const byName = new Map<string, { n: number; users: Set<string>; screens: Set<string> }>();
  for (const e of events) {
    const k = byName.get(e.name) || { n: 0, users: new Set(), screens: new Set() };
    // A sync_failed event covers a batch; count the records that failed.
    const n = e.name === "sync_failed" ? Math.max(1, Number(e.data?.count) || 1) : 1;
    k.n += n;
    if (e.user_id) k.users.add(e.user_id);
    if (typeof e.data?.screen === "string") k.screens.add(e.data.screen as string);
    byName.set(e.name, k);
  }
  const parts: string[] = [];
  let total = 0;
  for (const [name, label] of Object.entries(PROBLEMS)) {
    const k = byName.get(name);
    if (!k) continue;
    total += k.n;
    let part = `${k.n} ${k.n === 1 ? label.one : label.many}`;
    if (k.users.size > 1) part += ` (${k.users.size} people)`;
    if (k.screens.size) part += ` on ${[...k.screens].slice(0, 3).join(", ")}`;
    parts.push(part);
  }
  return { total, text: parts.join(" · ") };
}
