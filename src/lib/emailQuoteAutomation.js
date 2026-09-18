// ─── Email Quote Automation ───────────────────────────────────────────────────
// Turns a reviewed email_quotes candidate into a real quote, using the exact
// same shape QuotesScreen writes when Christo adds a quote by hand — so it
// picks up the existing chase-followup automation (autoCreateChaseFollowup)
// and shows up everywhere a normal quote does. Nothing here runs
// automatically: this only fires when Christo taps "Add to Quotes" on the
// Assistant screen, after he's had a chance to fix a wrong amount or client.
import { genId, todayISO } from "./helpers";
import { offlineSave } from "../offline/offlineDb";
import { triggerImmediateSync } from "./sync";
import { withTeamId } from "./teamId";
import { autoCreateChaseFollowup } from "./quoteAutomation";

// Best-effort match against existing clients by company name — saves Christo
// re-picking a client that's already in PowerMate. Falls through to null
// (quote just carries the extracted name as free text) rather than guessing.
export function matchClientByName(name, clients = []) {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const exact = clients.find(c => (c.company || "").trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = clients.find(c => {
    const company = (c.company || "").trim().toLowerCase();
    return company && (needle.includes(company) || company.includes(needle));
  });
  return partial || null;
}

// candidate: an email_quotes row (optionally with edits applied by the review form)
// Returns the new quote item that was written to state/IndexedDB/sync queue.
export function promoteEmailQuoteToQuote(candidate, { userId, teamId, clients = [], followups = [], setData }) {
  const matched = matchClientByName(candidate.extracted_client_name, clients);
  const sentDate = (candidate.sent_at || "").slice(0, 10) || todayISO();
  const description = candidate.extracted_quote_ref
    ? `${candidate.subject || "Quote"} (${candidate.extracted_quote_ref})`
    : (candidate.subject || "Quote sent by email");

  const quote = withTeamId({
    id: genId(),
    user_id: userId,
    client_id: matched?.id || null,
    client_name: matched ? matched.company : (candidate.extracted_client_name || "Unknown client"),
    description,
    value: Number(candidate.extracted_amount) || 0,
    status: "Pending",
    sent_date: sentDate,
    source: "email",
    created_at: new Date().toISOString(),
    sync_status: "pending",
  }, teamId);

  setData(d => ({
    ...d,
    quotes: [quote, ...(d.quotes || [])],
    syncQueue: [
      { id: genId(), table: "quotes", action: "insert", data: quote, status: "pending", created_at: new Date().toISOString() },
      ...(d.syncQueue || []),
    ],
  }));
  offlineSave("quotes", quote).then(() => triggerImmediateSync());

  // Same chase-followup automation a manually-entered quote gets — 3 business
  // days out, pre-filled with the client + amount so the reminder is useful
  // on its own without reopening the email.
  autoCreateChaseFollowup(quote, userId, setData, teamId, followups);

  return quote;
}
