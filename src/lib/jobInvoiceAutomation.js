import { supabase } from "../supabase";
import { offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync } from "./sync";
import { withTeamId } from "./teamId";
import { genId } from "./helpers";

const onlineNow = value => value !== undefined ? value : (typeof navigator !== "undefined" ? navigator.onLine : true);

export async function createJobFromAcceptedQuote(quote, userId, teamId = null, setData = null, isOnline = onlineNow()) {
  if (!quote?.id || quote.status !== "Accepted" || !userId) return { ok: false, reason: "not-accepted" };
  const localJobs = await offlineGetAll("jobs").catch(() => []);
  const localExisting = localJobs.find(job => job.quote_id === quote.id);
  if (localExisting) return { ok: true, job: localExisting, created: false, local: true };
  if (isOnline) {
    const { data: existing, error } = await supabase.from("jobs").select("id, job_number").eq("quote_id", quote.id).maybeSingle();
    if (!error && existing) return { ok: true, job: existing, created: false };
  }
  const item = withTeamId({ id: genId(), user_id: userId, client_id: quote.client_id || null, quote_id: quote.id, job_number: `JOB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, title: quote.description || "Service Job", description: quote.notes || quote.description || "Accepted quote", status: "scheduled", priority: "normal", scheduled_date: null, scheduled_time: null, location: "", assigned_to_user_id: quote.assigned_to_user_id || null, assigned_to: "", technician_notes: "", work_done: "", parts_used: [], photos: [], created_at: new Date().toISOString(), sync_status: "pending" }, teamId || quote.team_id || null);
  if (setData) return { ok: true, job: await saveAndSync(item, "jobs", "insert", setData, isOnline), created: true, local: !isOnline };
  if (!isOnline) { await offlineSave("jobs", item); return { ok: true, job: item, created: true, local: true }; }
  const { data: job, error } = await supabase.from("jobs").insert(item).select("*").single();
  if (error) {
    // FIX (Build 8, Phase 1L) — jobs.quote_id now has a DB-level unique
    // index (one job per accepted quote), so a genuine race between two
    // devices/tabs both passing the "no existing job" check above lands
    // here as a 23505 unique_violation instead of silently creating a
    // duplicate job. That's not a failure — someone else's insert won the
    // race — so fetch and return THAT job rather than surfacing an error.
    if (error.code === "23505") {
      const { data: raced } = await supabase.from("jobs").select("*").eq("quote_id", quote.id).maybeSingle();
      if (raced) return { ok: true, job: raced, created: false };
    }
    return { ok: false, reason: "create-failed", error };
  }
  return { ok: true, job, created: true };
}

export async function createInvoiceFromJob(job, userId, teamId = null, setData = null, isOnline = onlineNow()) {
  if (!job?.id || !userId) return { ok: false, reason: "missing-job" };
  const localInvoices = await offlineGetAll("invoices").catch(() => []);
  const localExisting = localInvoices.find(invoice => invoice.job_id === job.id);
  if (localExisting) return { ok: true, invoice: localExisting, created: false, local: true };
  if (isOnline) {
    const { data: existing, error } = await supabase.from("invoices").select("id, invoice_number").eq("job_id", job.id).maybeSingle();
    if (!error && existing) return { ok: true, invoice: existing, created: false };
  }
  let total = Number(job._quoteValue ?? job.quote_value ?? 0);
  if (!total && job.quote_id && isOnline) {
    const { data: quote } = await supabase.from("quotes").select("value").eq("id", job.quote_id).maybeSingle();
    total = Number(quote?.value || 0);
  }
  const item = withTeamId({ id: genId(), user_id: userId, client_id: job.client_id || null, quote_id: job.quote_id || null, job_id: job.id, invoice_number: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`, status: "draft", issue_date: new Date().toISOString().slice(0, 10), due_date: null, subtotal: total, vat: 0, total, amount_paid: 0, balance_due: total, line_items: [], notes: job.work_done || "", created_at: new Date().toISOString(), sync_status: "pending" }, teamId || job.team_id || null);
  if (setData) return { ok: true, invoice: await saveAndSync(item, "invoices", "insert", setData, isOnline), created: true, local: !isOnline };
  if (!isOnline) { await offlineSave("invoices", item); return { ok: true, invoice: item, created: true, local: true }; }
  const { data: invoice, error } = await supabase.from("invoices").insert(item).select("*").single();
  if (error) {
    // FIX (Build 8, Phase 1M) — same race-safety as createJobFromAcceptedQuote
    // above, now that invoices.job_id has a DB-level unique index.
    if (error.code === "23505") {
      const { data: raced } = await supabase.from("invoices").select("*").eq("job_id", job.id).maybeSingle();
      if (raced) return { ok: true, invoice: raced, created: false };
    }
    return { ok: false, reason: "create-failed", error };
  }
  return { ok: true, invoice, created: true };
}

export async function ensureJobsForAcceptedQuotes(quotes, userId, teamId = null, setData = null, isOnline = onlineNow()) {
  const accepted = (quotes || []).filter(q => q.status === "Accepted" && q.user_id === userId);
  const results = [];
  for (const quote of accepted) results.push(await createJobFromAcceptedQuote(quote, userId, teamId, setData, isOnline));
  return results;
}
