// ─── Custom forms & checklists ────────────────────────────────────────────────
// Templates a company builds (form_templates) and forms filled in on a job or
// a machine (form_submissions). Filled-in forms are saved on the phone first
// and sent when there's signal, so a technician underground can still sign
// off a job. Tests: tests/forms.test.mjs.

export const FIELD_TYPES = {
  yesno: "Yes / No / N/A",
  text: "Short answer",
  textarea: "Long answer",
  number: "Number",
  choice: "Pick one",
  date: "Date",
  heading: "Section heading",
};

const id = () => `f_${Math.random().toString(36).slice(2, 10)}`;
export const newField = (type = "yesno") => ({ id: id(), type, label: "", required: type !== "heading", ...(type === "choice" ? { options: ["", ""] } : {}) });

const yesno = (label, required = true) => ({ id: id(), type: "yesno", label, required });
export const STARTER_TEMPLATES = [
  {
    name: "Pre-start safety checklist",
    description: "Before work starts on site.",
    applies_to: "job",
    require_signature: true,
    fields: [
      { id: id(), type: "heading", label: "Site", required: false },
      yesno("Site induction done"),
      yesno("Work permit issued"),
      yesno("Area barricaded"),
      yesno("Machine isolated and locked out"),
      { id: id(), type: "heading", label: "People & equipment", required: false },
      yesno("Correct PPE worn"),
      yesno("Tools and lifting gear inspected"),
      { id: id(), type: "textarea", label: "Hazards found and how they're controlled", required: false },
    ],
  },
  {
    name: "Machine inspection",
    description: "General condition check.",
    applies_to: "equipment",
    require_signature: true,
    fields: [
      { id: id(), type: "number", label: "Hour meter", required: false },
      yesno("No oil or hydraulic leaks"),
      yesno("Hoses and fittings in good condition"),
      yesno("Guards and covers in place"),
      yesno("Safety devices working"),
      { id: id(), type: "choice", label: "Overall condition", required: true, options: ["Good", "Needs attention", "Unsafe: do not use"] },
      { id: id(), type: "textarea", label: "Notes", required: false },
    ],
  },
  {
    name: "Job completion sign-off",
    description: "The customer confirms the work is done.",
    applies_to: "job",
    require_signature: true,
    fields: [
      yesno("Work completed as requested"),
      yesno("Machine tested and working"),
      yesno("Site left clean"),
      { id: id(), type: "text", label: "Customer's name", required: true },
      { id: id(), type: "textarea", label: "Customer comments", required: false },
    ],
  },
];

// Problems with a template, as messages (empty = fine to save).
export function templateProblems(t) {
  const out = [];
  if (!String(t?.name || "").trim()) out.push("Give the form a name");
  const fields = t?.fields || [];
  if (!fields.some(f => f.type !== "heading")) out.push("Add at least one question");
  fields.forEach((f, i) => {
    if (!String(f.label || "").trim()) out.push(`Question ${i + 1} needs a label`);
    if (f.type === "choice" && (f.options || []).filter(o => String(o).trim()).length < 2) out.push(`"${f.label || `Question ${i + 1}`}" needs at least two choices`);
  });
  if (fields.length > 80) out.push("A form can have up to 80 questions");
  return out;
}

export function cleanTemplate(t) {
  return {
    name: String(t.name || "").trim().slice(0, 120),
    description: String(t.description || "").trim().slice(0, 1000) || null,
    applies_to: ["any", "job", "equipment"].includes(t.applies_to) ? t.applies_to : "any",
    require_signature: t.require_signature !== false,
    active: t.active !== false,
    fields: (t.fields || []).slice(0, 80).map(f => ({
      id: f.id || id(),
      type: FIELD_TYPES[f.type] ? f.type : "text",
      label: String(f.label || "").trim().slice(0, 200),
      required: f.type === "heading" ? false : !!f.required,
      ...(f.type === "choice" ? { options: (f.options || []).map(o => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 20) } : {}),
    })),
  };
}

// Required questions not answered yet (labels).
export function missingAnswers(fields, answers) {
  return (fields || [])
    .filter(f => f.required && f.type !== "heading")
    .filter(f => {
      const v = answers?.[f.id];
      return v === undefined || v === null || String(v).trim() === "";
    })
    .map(f => f.label);
}

// "No" answers on yes/no questions: things that need attention.
export function failedChecks(fields, answers) {
  return (fields || []).filter(f => f.type === "yesno" && answers?.[f.id] === "no").map(f => f.label);
}

export function answerText(f, v) {
  if (v === undefined || v === null || v === "") return "—";
  if (f.type === "yesno") return v === "yes" ? "Yes" : v === "no" ? "No" : "N/A";
  return String(v);
}

// ── Offline outbox ──
const OUTBOX = "pm_form_outbox";
const readOutbox = () => {
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const writeOutbox = list => {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(list));
  } catch {
    // Storage full: the form stays in memory until sent.
  }
};
export const pendingForms = () => readOutbox();

// Saves on the phone, then tries to send. Returns "sent" or "saved".
export async function submitForm(supabase, row) {
  writeOutbox([...readOutbox().filter(r => r.id !== row.id), row]);
  const left = await flushForms(supabase);
  return left.some(r => r.id === row.id) ? "saved" : "sent";
}

// Sends what's waiting; returns what's still waiting. A form the database
// already has (sent before the phone lost signal) counts as sent.
export async function flushForms(supabase) {
  const waiting = readOutbox();
  if (!waiting.length || (typeof navigator !== "undefined" && navigator.onLine === false)) return waiting;
  const still = [];
  for (const row of waiting) {
    const { _error, ...clean } = row;
    const { error } = await supabase.from("form_submissions").insert(clean);
    if (error && error.code !== "23505") still.push({ ...row, _error: error.message });
  }
  writeOutbox(still);
  return still;
}

// Templates kept on the phone, for filling in forms without signal.
const TEMPLATES = teamId => `pm_form_templates__${teamId}`;
export function cachedTemplates(teamId) {
  try {
    const list = JSON.parse(localStorage.getItem(TEMPLATES(teamId)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
export async function loadTemplates(supabase, teamId) {
  const { data, error } = await supabase.from("form_templates").select("*").eq("team_id", teamId).order("name");
  if (error) return cachedTemplates(teamId);
  try {
    localStorage.setItem(TEMPLATES(teamId), JSON.stringify(data || []));
  } catch {}
  return data || [];
}
