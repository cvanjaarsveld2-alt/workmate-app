import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { quoteToDocument } from "../src/lib/documentData.js";

const sql = fs.readFileSync("supabase/migrations/20260929090000_quote_numbers.sql", "utf8");

test("the server gives each company's quotes their own numbers, in order", () => {
  assert.match(sql, /quote_prefix text not null default 'Q-'/);
  assert.match(sql, /next_quote_number int not null default 1/);
  // The counter row is updated (and so locked) to take a number: people quoting
  // at the same moment wait their turn instead of getting the same number.
  assert.match(sql, /update public\.team_profiles\s+set next_quote_number = next_quote_number \+ 1/);
  // A later save keeps the number; an upsert of an existing quote doesn't spend one.
  assert.match(sql, /new\.quote_number := coalesce\(old\.quote_number, new\.quote_number\)/);
  assert.match(sql, /exists \(select 1 from public\.quotes where id = new\.id\)/);
  // Numbers already used are skipped if the owner sets the counter back.
  assert.match(sql, /exit when not exists \(\s*select 1 from public\.quotes where team_id = new\.team_id and quote_number = v_number\)/);
  assert.match(sql, /create unique index if not exists quotes_quote_number_team_uidx\s+on public\.quotes \(team_id, quote_number\)/);
  assert.match(sql, /before insert or update of quote_number on public\.quotes/);
});

test("a quote PDF shows its number, and says DRAFT until the number arrives", () => {
  const base = { id: "3f9a1c2b-0000-4000-8000-000000000000", team_id: "t1", description: "Pump service", value: 1000 };
  const numbered = quoteToDocument({ ...base, quote_number: "Q-00042" }, "quote", { today: "2026-09-29" });
  assert.equal(numbered.number, "Q-00042");
  assert.equal(numbered.draft, false);
  const pending = quoteToDocument(base, "quote", { today: "2026-09-29" });
  assert.equal(pending.draft, true);
  const proforma = quoteToDocument({ ...base, quote_number: "Q-00042" }, "proforma", { today: "2026-09-29" });
  assert.equal(proforma.number, "PF-Q-00042");
  assert.ok(!proforma.draft);
});

test("Company Details lets the master account set the quote prefix and next number", () => {
  const screen = fs.readFileSync("src/screens/CompanyProfileScreen.jsx", "utf8");
  assert.match(screen, /label="Quote prefix"/);
  assert.match(screen, /label="Next quote no\."/);
  const quotes = fs.readFileSync("src/screens/QuotesScreen.jsx", "utf8");
  assert.match(quotes, /\[q\.client_name, q\.description, q\.quote_number\]/);
});
