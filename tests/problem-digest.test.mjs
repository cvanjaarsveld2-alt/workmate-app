import test from "node:test";
import assert from "node:assert/strict";

// Node strips the TypeScript types; the module has no imports.
const { summarise } = await import("../supabase/functions/problem-digest/summary.ts");

test("quiet day: nothing to report", () => {
  assert.deepEqual(summarise([]), { total: 0, text: "" });
  assert.equal(summarise([{ name: "sync_succeeded", user_id: "a", data: {} }]).total, 0);
});

test("counts failed records, people and screens", () => {
  const { total, text } = summarise([
    { name: "sync_failed", user_id: "a", data: { count: 2 } },
    { name: "sync_failed", user_id: "b", data: { count: 1 } },
    { name: "screen_crashed", user_id: "a", data: { screen: "Quotes" } },
  ]);
  assert.equal(total, 4);
  assert.equal(text, "3 sync failures (2 people) · 1 screen crash on Quotes");
});
