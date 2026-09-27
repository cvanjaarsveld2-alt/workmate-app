-- Two-company isolation test. The test lives in the database as
-- private.tenant_isolation_test() (supabase/migrations/20260926085900_*).
-- Run it with the Supabase SQL editor or MCP execute_sql:
select private.tenant_isolation_test();
-- Expected: ERROR "ISOLATION PASS (0 failed)" followed by every check.
-- (It always raises so that the test company it creates is rolled back.)
