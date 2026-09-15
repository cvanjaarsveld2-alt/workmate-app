import { supabase } from "../supabase";

export async function createJobFromAcceptedQuote(quote, userId, teamId = null) {
  if (!quote?.id || quote.status !== "Accepted" || !userId) return { ok: false, reason: "not-accepted" };

  const { data: existing, error: lookupError } = await supabase
    .from("jobs")
    .select("id, job_number")
    .eq("quote_id", quote.id)
    .maybeSingle();
  if (lookupError) return { ok: false, reason: "lookup-failed", error: lookupError };
  if (existing) return { ok: true, job: existing, created: false };

  const jobNumber = `JOB-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const payload = {
    user_id: userId,
    team_id: teamId || quote.team_id || null,
    client_id: quote.client_id || null,
    quote_id: quote.id,
    job_number: jobNumber,
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
  };

  const { data: job, error } = await supabase.from("jobs").insert(payload).select("*").single();
  if (error) return { ok: false, reason: "create-failed", error };
  return { ok: true, job, created: true };
}

export async function createInvoiceFromJob(job, userId, teamId = null) {
  if (!job?.id || !userId) return { ok: false, reason: "missing-job" };

  const { data: existing, error: lookupError } = await supabase
    .from("invoices")
    .select("id, invoice_number")
    .eq("job_id", job.id)
    .maybeSingle();
  if (lookupError) return { ok: false, reason: "lookup-failed", error: lookupError };
  if (existing) return { ok: true, invoice: existing, created: false };

  const total = Number(job._quoteValue || job.quote_value || 0);
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const payload = {
    user_id: userId,
    team_id: teamId || job.team_id || null,
    client_id: job.client_id || null,
    quote_id: job.quote_id || null,
    job_id: job.id,
    invoice_number: invoiceNumber,
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: null,
    subtotal: total,
    vat: 0,
    total,
    amount_paid: 0,
    balance_due: total,
    line_items: [],
    notes: job.work_done || "",
  };
  const { data: invoice, error } = await supabase.from("invoices").insert(payload).select("*").single();
  if (error) return { ok: false, reason: "create-failed", error };
  return { ok: true, invoice, created: true };
}

export async function ensureJobsForAcceptedQuotes(quotes, userId, teamId = null) {
  const accepted = (quotes || []).filter(q => q.status === "Accepted" && q.user_id === userId);
  const results = [];
  for (const quote of accepted) results.push(await createJobFromAcceptedQuote(quote, userId, teamId));
  return results;
}
