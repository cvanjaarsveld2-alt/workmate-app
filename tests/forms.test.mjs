import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { STARTER_TEMPLATES, answerText, cleanTemplate, failedChecks, flushForms, missingAnswers, newField, pendingForms, submitForm, templateProblems } from "../src/lib/forms.js";
import { equipmentIdFromUrl, equipmentUrl } from "../src/lib/qrLabels.js";

// A tiny localStorage for the outbox.
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

test("the example forms are valid", () => {
  for (const t of STARTER_TEMPLATES) assert.deepEqual(templateProblems(t), [], t.name);
});

test("a form needs a name, labelled questions and two choices on pick-one", () => {
  assert.deepEqual(templateProblems({ name: "", fields: [] }), ["Give the form a name", "Add at least one question"]);
  const choice = { ...newField("choice"), label: "Condition", options: ["Good", " "] };
  assert.deepEqual(templateProblems({ name: "X", fields: [{ ...newField("yesno"), label: "" }, choice] }), [
    "Question 1 needs a label",
    '"Condition" needs at least two choices',
  ]);
});

test("cleaning: unknown types become text, headings are never required, blank choices dropped", () => {
  const t = cleanTemplate({ name: " Check ", applies_to: "nope", fields: [{ id: "a", type: "weird", label: "Q", required: true }, { id: "b", type: "heading", label: "H", required: true }, { id: "c", type: "choice", label: "C", options: ["A", "", "B"] }] });
  assert.equal(t.name, "Check");
  assert.equal(t.applies_to, "any");
  assert.equal(t.fields[0].type, "text");
  assert.equal(t.fields[1].required, false);
  assert.deepEqual(t.fields[2].options, ["A", "B"]);
});

test("required answers, and 'No' checks that need attention", () => {
  const fields = [
    { id: "a", type: "yesno", label: "Isolated", required: true },
    { id: "b", type: "text", label: "Name", required: true },
    { id: "c", type: "heading", label: "H", required: false },
    { id: "d", type: "yesno", label: "Guards on", required: false },
  ];
  assert.deepEqual(missingAnswers(fields, { a: "yes", b: "  " }), ["Name"]);
  assert.deepEqual(failedChecks(fields, { a: "no", d: "no" }), ["Isolated", "Guards on"]);
  assert.equal(answerText(fields[0], "na"), "N/A");
  assert.equal(answerText(fields[1], ""), "—");
});

test("forms filled without signal wait on the phone and are sent later, once", async () => {
  store.clear();
  let online = false;
  const sent = [];
  const fake = { from: () => ({ insert: async row => (online ? (sent.some(s => s.id === row.id) ? { error: { code: "23505" } } : (sent.push(row), { error: null })) : { error: { code: "NET", message: "offline" } }) }) };
  assert.equal(await submitForm(fake, { id: "s1", template_name: "Pre-start" }), "saved");
  assert.equal(pendingForms().length, 1);
  online = true;
  assert.deepEqual(await flushForms(fake), []);
  assert.equal(sent.length, 1);
  assert.equal("_error" in sent[0], false);
  // Sent before the phone knew: the database already has it, so it's done.
  store.set("pm_form_outbox", JSON.stringify([{ id: "s1", template_name: "Pre-start" }]));
  assert.deepEqual(await flushForms(fake), []);
  assert.equal(sent.length, 1);
});

test("a QR label opens the machine; anything else in the link is ignored", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.equal(equipmentUrl("https://app.example.com/", id), `https://app.example.com/?equipment=${id}`);
  assert.equal(equipmentIdFromUrl(`?equipment=${id}`), id);
  assert.equal(equipmentIdFromUrl("?equipment=../../etc"), null);
  assert.equal(equipmentIdFromUrl(""), null);
});

test("filled-in forms are a record: only managers delete, nobody edits", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20260928110000_forms_and_checklists.sql", import.meta.url), "utf8");
  assert.match(sql, /grant select, insert, delete on public\.form_submissions to authenticated/);
  assert.match(sql, /create policy form_submissions_insert on public\.form_submissions for insert to authenticated\s+with check \(private\.same_team\(team_id\) and user_id = auth\.uid\(\)\)/);
  assert.match(sql, /create policy form_submissions_delete[\s\S]*?private\.is_team_manager\(team_id\)/);
  assert.match(sql, /create policy form_templates_insert[\s\S]*?private\.is_team_manager\(team_id\)/);
});
