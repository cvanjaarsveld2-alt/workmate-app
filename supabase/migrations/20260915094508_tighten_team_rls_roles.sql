-- Exported from production supabase_migrations.schema_migrations (20260915094508).
-- These application tables contain business/customer data. They never need anonymous access.
-- Changing the policy role from PUBLIC to AUTHENTICATED does not change the
-- authenticated team-sharing rules; it simply prevents unauthenticated access.

ALTER POLICY activities_del ON public.activities TO authenticated;
ALTER POLICY activities_ins ON public.activities TO authenticated;
ALTER POLICY activities_sel ON public.activities TO authenticated;
ALTER POLICY activities_upd ON public.activities TO authenticated;

ALTER POLICY breakdown_reports_del ON public.breakdown_reports TO authenticated;
ALTER POLICY breakdown_reports_ins ON public.breakdown_reports TO authenticated;
ALTER POLICY breakdown_reports_sel ON public.breakdown_reports TO authenticated;
ALTER POLICY breakdown_reports_upd ON public.breakdown_reports TO authenticated;

ALTER POLICY clients_del ON public.clients TO authenticated;
ALTER POLICY clients_ins ON public.clients TO authenticated;
ALTER POLICY clients_sel ON public.clients TO authenticated;
ALTER POLICY clients_upd ON public.clients TO authenticated;

ALTER POLICY company_documents_del ON public.company_documents TO authenticated;
ALTER POLICY company_documents_ins ON public.company_documents TO authenticated;
ALTER POLICY company_documents_sel ON public.company_documents TO authenticated;
ALTER POLICY company_documents_upd ON public.company_documents TO authenticated;

ALTER POLICY contacts_del ON public.contacts TO authenticated;
ALTER POLICY contacts_ins ON public.contacts TO authenticated;
ALTER POLICY contacts_sel ON public.contacts TO authenticated;
ALTER POLICY contacts_upd ON public.contacts TO authenticated;

ALTER POLICY custom_faults_del ON public.custom_faults TO authenticated;
ALTER POLICY custom_faults_ins ON public.custom_faults TO authenticated;
ALTER POLICY custom_faults_sel ON public.custom_faults TO authenticated;
ALTER POLICY custom_faults_upd ON public.custom_faults TO authenticated;

ALTER POLICY equipment_del ON public.equipment TO authenticated;
ALTER POLICY equipment_ins ON public.equipment TO authenticated;
ALTER POLICY equipment_sel ON public.equipment TO authenticated;
ALTER POLICY equipment_upd ON public.equipment TO authenticated;

ALTER POLICY expenses_del ON public.expenses TO authenticated;
ALTER POLICY expenses_ins ON public.expenses TO authenticated;
ALTER POLICY expenses_sel ON public.expenses TO authenticated;
ALTER POLICY expenses_upd ON public.expenses TO authenticated;

ALTER POLICY followups_del ON public.followups TO authenticated;
ALTER POLICY followups_ins ON public.followups TO authenticated;
ALTER POLICY followups_sel ON public.followups TO authenticated;
ALTER POLICY followups_upd ON public.followups TO authenticated;

ALTER POLICY leads_del ON public.leads TO authenticated;
ALTER POLICY leads_ins ON public.leads TO authenticated;
ALTER POLICY leads_sel ON public.leads TO authenticated;
ALTER POLICY leads_upd ON public.leads TO authenticated;

ALTER POLICY notes_del ON public.notes TO authenticated;
ALTER POLICY notes_ins ON public.notes TO authenticated;
ALTER POLICY notes_sel ON public.notes TO authenticated;
ALTER POLICY notes_upd ON public.notes TO authenticated;

ALTER POLICY quotes_del ON public.quotes TO authenticated;
ALTER POLICY quotes_ins ON public.quotes TO authenticated;
ALTER POLICY quotes_sel ON public.quotes TO authenticated;
ALTER POLICY quotes_upd ON public.quotes TO authenticated;

ALTER POLICY repair_reports_del ON public.repair_reports TO authenticated;
ALTER POLICY repair_reports_ins ON public.repair_reports TO authenticated;
ALTER POLICY repair_reports_sel ON public.repair_reports TO authenticated;
ALTER POLICY repair_reports_upd ON public.repair_reports TO authenticated;

ALTER POLICY vehicle_checks_del ON public.vehicle_checks TO authenticated;
ALTER POLICY vehicle_checks_ins ON public.vehicle_checks TO authenticated;
ALTER POLICY vehicle_checks_sel ON public.vehicle_checks TO authenticated;
ALTER POLICY vehicle_checks_upd ON public.vehicle_checks TO authenticated;

-- Explicitly remove table DML from anon as defense-in-depth. RLS remains the
-- authoritative row-level boundary for authenticated users.
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.activities,
  public.breakdown_reports,
  public.clients,
  public.company_documents,
  public.contacts,
  public.custom_faults,
  public.equipment,
  public.expenses,
  public.followups,
  public.leads,
  public.notes,
  public.quotes,
  public.repair_reports,
  public.vehicle_checks
FROM anon;
