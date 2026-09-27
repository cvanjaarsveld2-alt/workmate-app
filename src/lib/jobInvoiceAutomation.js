import { supabase } from "../supabase";
import { offlineGetAll, offlineSave } from "../offline/offlineDb";
import { saveAndSync } from "./sync";
import { withTeamId } from "./teamId";
import { genId } from "./helpers";
import { lineTotals, parseLines as parseStoredLines } from "./lineTotals";
import { addDays, todayISO } from "./dates";
import { readCachedProfile } from "./companyProfile";
import { partsToLines } from "./products";

// Lines worth billing: something described or priced.
const parseLines = raw => parseStoredLines(raw).filter(l => l.description || Number(l.unitPrice ?? l.unit_price ?? l.price));

const onlineNow = value =>
  value !== undefined ? value : typeof navigator !== "undefined" ? navigator.onLine : true;

export async function createJobFromAcceptedQuote(
  quote,
  userId,
  teamId = null,
  setData = null,
  isOnline = onlineNow(),
) {
  if (!quote?.id || quote.status !== "Accepted" || !userId) return { ok: false, reason: "not-accepted" };
  const localJobs = await offlineGetAll("jobs").catch(() => []);
  const localExisting = localJobs.find(job => job.quote_id === quote.id);
  if (localExisting) return { ok: true, job: localExisting, created: false, local: true };
  if (isOnline) {
    const { data: existing, error } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("quote_id", quote.id)
      .maybeSingle();
    if (!error && existing) return { ok: true, job: existing, created: false };
  }
  const item = withTeamId(
    {
      id: genId(),
      user_id: userId,
      client_id: quote.client_id || null,
      quote_id: quote.id,
      job_number: `JOB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      title: quote.description || "Service Job",
      description: quote.notes || quote.description || "Accepted quote",
      status: "scheduled",
      priority: "normal",
      scheduled_date: null,
      scheduled_time: null,
      location: "",
      assigned_to_user_id: quote.assigned_to_user_id || null,
      assigned_to: "",
      technician_notes: "",
      work_done: "",
      parts_used: [],
      photos: [],
      created_at: new Date().toISOString(),
      sync_status: "pending",
    },
    teamId || quote.team_id || null,
  );
  if (setData)
    return {
      ok: true,
      job: await saveAndSync(item, "jobs", "insert", setData, isOnline),
      created: true,
      local: !isOnline,
    };
  if (!isOnline) {
    await offlineSave("jobs", item);
    return { ok: true, job: item, created: true, local: true };
  }
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

export async function createInvoiceFromJob(
  job,
  userId,
  teamId = null,
  setData = null,
  isOnline = onlineNow(),
) {
  if (!job?.id || !userId) return { ok: false, reason: "missing-job" };
  // A voided invoice no longer holds the job (the server frees it), so the
  // job can be invoiced again.
  const localInvoices = await offlineGetAll("invoices").catch(() => []);
  const localExisting = localInvoices.find(invoice => invoice.job_id === job.id && invoice.status !== "cancelled");
  if (localExisting) return { ok: true, invoice: localExisting, created: false, local: true };
  if (isOnline) {
    const { data: existing, error } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("job_id", job.id)
      .neq("status", "cancelled")
      .maybeSingle();
    if (!error && existing) return { ok: true, invoice: existing, created: false };
  }
  let quoteVatInclusive = job._quoteVatInclusive ?? job.vat_inclusive ?? true;
  let total = Number(job._quoteValue ?? job.quote_value ?? 0);
  let quoteLines = parseLines(job._quoteLines);
  let quoteText = job._quoteDescription || "";
  let billedQuoteId = job.quote_id || null;
  if (job.quote_id && isOnline) {
    // Online, bill the quote as the server has it, following any revision
    // (Q-00012 → Q-00012-R1) to the newest version.
    let quote = null;
    for (let id = job.quote_id, n = 0; id && n < 20; n++) {
      const { data } = await supabase
        .from("quotes")
        .select("id, value, vat_inclusive, line_items, description, superseded_by")
        .eq("id", id)
        .maybeSingle();
      quote = data;
      id = data?.superseded_by;
    }
    if (quote) {
      total = Number(quote.value || 0);
      quoteLines = parseLines(quote.line_items);
      quoteText = quote.description || quoteText;
      if (quote.vat_inclusive !== undefined && quote.vat_inclusive !== null) quoteVatInclusive = quote.vat_inclusive !== false;
      billedQuoteId = quote.id;
    }
  }
  const profile = readCachedProfile(teamId || job.team_id);
  const vatRegistered = profile.vat_registered !== false;
  // An invoice carries its own lines, so it stays the same whatever later
  // happens to the quote: the quote's lines (or one line for its value), else
  // the parts and labour used on the job.
  let lines;
  if (total) {
    lines = quoteLines.length
      ? quoteLines
      : [{ description: (quoteText || job.title || "Services rendered").split("\n")[0].slice(0, 200), qty: 1, unitPrice: total }];
  } else {
    lines = [...partsToLines(job.parts_used, { vatInclusive: false }), ...(job._labourLines || [])];
    quoteVatInclusive = false;
  }
  const money = lineTotals(lines, { vatInclusive: quoteVatInclusive, vatRegistered });
  const terms = profile.payment_terms_days ?? 30;
  const today = todayISO();
  const item = withTeamId(
    {
      id: genId(),
      user_id: userId,
      client_id: job.client_id || null,
      quote_id: billedQuoteId,
      job_id: job.id,
      invoice_number: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      status: "draft",
      issue_date: today,
      due_date: addDays(today, terms),
      subtotal: money.subtotal,
      vat: money.vat,
      total: money.total,
      amount_paid: 0,
      balance_due: money.total,
      line_items: lines,
      vat_inclusive: quoteVatInclusive,
      notes: job.work_done || "",
      created_at: new Date().toISOString(),
      sync_status: "pending",
    },
    teamId || job.team_id || null,
  );
  if (setData)
    return {
      ok: true,
      invoice: await saveAndSync(item, "invoices", "insert", setData, isOnline),
      created: true,
      local: !isOnline,
    };
  if (!isOnline) {
    await offlineSave("invoices", item);
    return { ok: true, invoice: item, created: true, local: true };
  }
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

export async function ensureJobsForAcceptedQuotes(
  quotes,
  userId,
  teamId = null,
  setData = null,
  isOnline = onlineNow(),
) {
  const accepted = (quotes || []).filter(q => q.status === "Accepted" && q.user_id === userId);
  const results = [];
  for (const quote of accepted)
    results.push(await createJobFromAcceptedQuote(quote, userId, teamId, setData, isOnline));
  return results;
}
