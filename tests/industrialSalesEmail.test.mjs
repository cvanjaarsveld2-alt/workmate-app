import test from "node:test";
import assert from "node:assert/strict";
import { generateIndustrialSalesEmail, gapCheck } from "../src/lib/industrialSalesEmail.js";

test("industrial sales email uses known facts and a clear CTA", () => {
  const input = {
    interaction: "expo",
    metAt: "Electra Mining",
    topic: "hydraulic cylinder repairs",
    currentSituation: "repair turnaround is taking longer than the team would like",
    problem: "urgent repairs can be difficult to turn around quickly",
    impact: "maintenance scheduling",
    desiredOutcome: "faster repair turnaround",
    goal: "conversation",
  };
  const email = generateIndustrialSalesEmail({name:"David Smith",company:"ABC Mining"}, input);
  assert.match(email.subject, /Electra Mining/);
  assert.match(email.body, /hydraulic cylinder repairs/);
  assert.match(email.body, /faster repair turnaround/);
  assert.match(email.body, /short conversation/);
  assert.doesNotMatch(email.body, /R\s?\d|\$\s?\d|\d+%/);
  assert.equal(gapCheck(input, email.body).some(x => !x.pass && x.id === "evidence"), false);
});

test("gap check flags missing problem and desired outcome without inventing them", () => {
  const input = { interaction:"site", currentSituation:"equipment is being maintained", problem:"", desiredOutcome:"", goal:"conversation" };
  const email = generateIndustrialSalesEmail({name:"John",company:"Mine"}, input);
  const checks = gapCheck(input, email);
  assert.equal(checks.find(x=>x.id==="problem").pass, false);
  assert.equal(checks.find(x=>x.id==="desired").pass, false);
  assert.equal(checks.find(x=>x.id==="gap").pass, false);
  assert.match(email.body, /equipment is being maintained/);
});

test("contact details are used safely when optional company or met-at data is missing", () => {
  const input = { interaction:"site", goal:"site_visit" };
  const email = generateIndustrialSalesEmail({name:"Adele",company:""}, input);
  assert.match(email.body, /Hi Adele/);
  assert.doesNotMatch(email.body, /undefined|null/);
});
