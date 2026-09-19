# PowerMate — Master Engineer Readiness Standard

This is the release gate for PowerMate, aligned with OWASP ASVS 5.0.0 and current Supabase/Vercel production guidance.

## Release gates

1. Build and automated regression suite pass.
2. Field-readiness structural checks pass.
3. Client source contains no server-side secrets.
4. Production security headers are present.
5. Supabase Security Advisor has no unreviewed high/critical finding.
6. RLS is enabled on every exposed application table and policies are tested.
7. SECURITY DEFINER RPCs have explicit authorization checks and intentional execution grants.
8. Offline writes are durable before UI success is shown.
9. Sync is serialized and retries are classified.
10. Financial operations are server-authoritative and idempotent.
11. Storage uploads are ownership-controlled and use durable storage paths.
12. Auth/PIN state is scoped to the authenticated user and logout clears session unlock state.
13. Production deployment is READY and the deployed commit is identified.
14. Authenticated browser E2E is executed against production/staging before field-readiness approval.
15. Recovery/rollback procedures are documented.

## Known owner/configuration gates

- Leaked-password protection requires enabling the Supabase Auth dashboard setting.
- pg_net is installed in public; the extension does not support SET SCHEMA, so this is tracked as infrastructure configuration.
- Authenticated E2E requires dedicated test credentials stored as CI secrets; credentials must never be committed or sent through chat.

## Approval language

Use only: FIXED + VERIFIED, FIXED BUT PARTIALLY VERIFIED, REMAINING, OWNER DECISION, NOT VERIFIABLE.

Never declare PowerMate field-ready solely from a successful build or deployment.
