# PowerMate Build 8 — Phase 3 Results

Date: 2026-09-18

## Fixed and merged

- Field-readiness service-worker check now accepts the current versioned cache name instead of pinning the audit to an obsolete cache version.
- Reconnect sync now waits for a bounded random 0–2 second jitter before pushing/pulling, reducing synchronized reconnect bursts.
- IndexedDB save/delete/replace failures now dispatch `powermate:local_write_failed` before rethrowing; the app surfaces a user-facing error instead of implying the write succeeded.
- Stale offline array updates are guarded for `jobs.photos`, `jobs.parts_used`, `breakdown_reports.items`, and `repair_reports.items`. When the server already has a different array, the sync refuses to overwrite it and classifies the condition as `PWR_ARRAY_CONFLICT`.
- Production database duplicate index `jobs_quote_id_unique` was removed; the canonical `jobs_quote_id_uidx` remains.
- Missing covering indexes were added for `email_quotes.matched_client_id`, `email_quotes.promoted_quote_id`, and `events.user_id`.
- Changes were merged to `main` in commit `c87a992b1b29b3d12ec731bb811424de792e827b`.

## Verification

- Supabase production verification confirmed the canonical job unique index and the three new FK indexes.
- Supabase performance advisor no longer reports the duplicate jobs index.
- Vercel reported successful deployment statuses for the Phase 3 commit.
- GitHub Actions production CI was triggered by the merge and was still queued at the time this report was written; therefore CI is not labeled as verified here.

## Remaining owner/environment decisions

### P1 — VAT / invoice tax semantics
The invoice generator still sets VAT to zero because the quote model stores `vat_inclusive` but does not store a separate VAT amount. This requires an owner decision about whether generated invoices should inherit quote VAT-inclusive/exclusive semantics and how invoices without line items should be treated. No tax assumption was invented.

### Security setting — leaked password protection
Supabase Auth's leaked-password protection remains disabled. The current Supabase project exposes this as an Auth configuration setting rather than a database schema change, so it was not changed blindly.

### Authenticated field E2E
A full authenticated browser workflow and real two-account HTTP conflict test remain unverified in this environment. Existing production CI verifies the repository's automated checks, but that is not equivalent to a real two-account field session.

### Media conflict resolution
Phase 3 now prevents silent array overwrite. It deliberately does not invent a merge/delete policy for arrays. A later phase can add explicit per-item merge or conflict-resolution UX once the desired business semantics are chosen.

### Legacy cleanup
Previously identified dead tables/buckets remain untouched pending owner confirmation. No destructive cleanup was performed.

## Field-readiness statement

PowerMate has additional protection against the most dangerous offline array overwrite case, and the production database duplicate/index issues identified during the final hardening pass have been addressed. It should still not be described as fully field-ready until authenticated critical workflows and the remaining owner-shaped P1 decisions have been verified.
