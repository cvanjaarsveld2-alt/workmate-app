import test from "node:test";
import assert from "node:assert/strict";
import { storagePathFromSignedUrl } from "../src/lib/helpers.js";

test("extracts a durable path from a signed Supabase URL", () => {
  const url = "https://example.supabase.co/storage/v1/object/sign/powermate-media/user-1/photos/job%2F123.jpg?token=x";
  assert.equal(storagePathFromSignedUrl(url), "user-1/photos/job/123.jpg");
});
test("returns null for unrelated URLs", () => {
  assert.equal(storagePathFromSignedUrl("https://example.com/image.jpg"), null);
});
