// ─── Quote Automation ─────────────────────────────────────────────────────────
// Hard-coded automations (no builder needed):
// 1. Quote created → auto-create "Chase quote" follow-up for +3 business days
// 2. Quote accepted → auto-advance client stage to Active + prompt lead
// 3. Quote expired (14 days, no action) → auto-flag as Expired
//
// Call runQuoteAutomations() from App.jsx after data loads or syncs.
// ─────────────────────────────────────────────────────────────────────────────
import { todayISO, genId } from "./helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "./sync";
import { withTeamId } from "./teamId";

function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ── 1. Auto-create chase follow-up when quote is first saved ──────────────────
export function autoCreateChaseFollowup(quote, userId, setData, teamId = null) {
  const today = todayISO();
  const chaseDate = addBusinessDays(quote.sent_date || today, 3);

  const item = withTeamId({
    id: genId(),
    user_id: userId,
    client_id: null,
    client: quote.client_name || "",
    branch: "",
    title: `Chase quote: ${(quote.description || "").slice(0, 60)}`,
    date: chaseDate,
    time: "09:00",
    reminder: "morning",
    notes: `Auto-created: follow up on quote (${quote.description || ""}) — R ${parseFloat(quote.value || 0).toLocaleString("en-ZA")}`,
    completed: false,
    auto_generated: true,
    created_at: new Date().toISOString(),
    sync_status: "pending",
  }, teamId);

  setData(d => ({
    ...d,
    followups: [item, ...(d.followups || [])],
    syncQueue: [{
      id: genId(), table: "followups", action: "insert",
      data: item, status: "pending", created_at: new Date().toISOString(),
    }, ...(d.syncQueue || [])],
  }));

  offlineSave("followups", item).then(() => triggerImmediateSync());
  return item;
}

// ── 2. Auto-advance client stage when quote is accepted ───────────────────────
export function autoAdvanceOnAccept(quote, clients, setData) {
  if (!quote.client_name) return;
  const client = clients.find(c =>
    c.company && quote.client_name &&
    c.company.toLowerCase() === quote.client_name.toLowerCase()
  );
  if (!client) return;
  if (client.stage === "Won" || client.stage === "Active") return;

  const updated = { ...client, stage: "Active", sync_status: "pending" };
  setData(d => ({
    ...d,
    clients: (d.clients || []).map(c => c.id === client.id ? updated : c),
    syncQueue: [{
      id: genId(), table: "clients", action: "update",
      data: updated, status: "pending", created_at: new Date().toISOString(),
    }, ...(d.syncQueue || [])],
  }));
  offlineSave("clients", updated).then(() => triggerImmediateSync());
}

// ── 3. Auto-expire stale pending quotes (14 days) ─────────────────────────────
export function autoExpireStaleQuotes(quotes, setData) {
  const today = todayISO();
  const cutoff = (() => {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - 14);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();

  const stale = quotes.filter(q =>
    q.status === "Pending" &&
    (q.sent_date || q.created_at?.slice(0,10) || "") < cutoff
  );

  if (stale.length === 0) return;

  const updates = stale.map(q => ({ ...q, status: "Expired", sync_status: "pending" }));

  setData(d => ({
    ...d,
    quotes: (d.quotes || []).map(q => {
      const upd = updates.find(u => u.id === q.id);
      return upd || q;
    }),
    syncQueue: [
      ...updates.map(u => ({
        id: genId(), table: "quotes", action: "update",
        data: u, status: "pending", created_at: new Date().toISOString(),
      })),
      ...(d.syncQueue || []),
    ],
  }));

  updates.forEach(u => offlineSave("quotes", u));
  triggerImmediateSync();
}

// ── Convenience: run all automations ──────────────────────────────────────────
// Call from App.jsx useEffect after data.quotes changes (debounced).
export function runQuoteAutomations(data, setData) {
  autoExpireStaleQuotes(data.quotes || [], setData);
}
