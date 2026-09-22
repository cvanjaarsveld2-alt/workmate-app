-- Exported from production supabase_migrations.schema_migrations (20260915115733).
-- Harden legacy policies that were unnecessarily granted to the public role.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'public' = ANY (roles)
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I TO authenticated',
      p.policyname, p.schemaname, p.tablename
    );
  END LOOP;
END $$;

-- Normalize legacy/unknown client source values before the database check
-- constraint runs. This keeps old offline queue records from becoming
-- permanently unsyncable while preserving the record itself.
CREATE OR REPLACE FUNCTION public.normalize_client_source()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS NOT NULL
     AND NEW.source NOT IN (
       'Cold call', 'contact_promotion', 'client', 'field_note',
       'followup', 'meeting_recording', 'note', 'quote', 'equipment',
       'Manual entry', 'manual', 'n/a'
     ) THEN
    NEW.source := 'manual';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_client_source ON public.clients;
CREATE TRIGGER trg_normalize_client_source
BEFORE INSERT OR UPDATE OF source ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.normalize_client_source();

-- Keep modification timestamps authoritative even when an offline client
-- omits updated_at or sends an old value.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients','contacts','followups','quotes','notes','equipment','expenses',
    'leads','vehicle_checks','activities','breakdown_reports','repair_reports',
    'custom_faults','company_documents'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='updated_at'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t);
    END IF;
  END LOOP;
END $$;

-- Useful composite indexes for the team's most common list/reconciliation
-- access patterns. IF NOT EXISTS keeps this migration safe to re-run.
CREATE INDEX IF NOT EXISTS idx_clients_team_updated ON public.clients (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_team_updated ON public.contacts (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_team_updated ON public.notes (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_team_updated ON public.equipment (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_team_updated ON public.followups (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_team_updated ON public.quotes (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_team_updated ON public.leads (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_team_updated ON public.activities (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_breakdown_team_updated ON public.breakdown_reports (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_team_updated ON public.repair_reports (team_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_faults_team_updated ON public.custom_faults (team_id, updated_at DESC);

-- Remove a duplicate single-column client index; the remaining index covers
-- direct user lookups and the composite team index covers team reconciliation.
DROP INDEX IF EXISTS public.idx_clients_user_id;
