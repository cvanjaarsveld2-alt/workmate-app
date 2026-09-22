-- Exported from production supabase_migrations.schema_migrations (20260916143642).
BEGIN;

-- Consolidate duplicate permissive policies where the existing policies are logically redundant.
DROP POLICY IF EXISTS "Admin conversations" ON public.conversations;
DROP POLICY IF EXISTS "Conversations own" ON public.conversations;
CREATE POLICY "conversations_access" ON public.conversations AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin documents" ON public.documents;
DROP POLICY IF EXISTS "Documents employee own admin all" ON public.documents;
DROP POLICY IF EXISTS "Documents own" ON public.documents;
CREATE POLICY "documents_access" ON public.documents AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin follow ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Follow ups own" ON public.follow_ups;
DROP POLICY IF EXISTS "Followups employee own admin all" ON public.follow_ups;
CREATE POLICY "follow_ups_access" ON public.follow_ups AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin plan items" ON public.plan_items;
DROP POLICY IF EXISTS "Plan items own" ON public.plan_items;
CREATE POLICY "plan_items_access" ON public.plan_items AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin sales reports" ON public.sales_reports;
DROP POLICY IF EXISTS "Sales reports own" ON public.sales_reports;
CREATE POLICY "sales_reports_access" ON public.sales_reports AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin service reports" ON public.service_reports;
DROP POLICY IF EXISTS "Reports employee own admin all" ON public.service_reports;
DROP POLICY IF EXISTS "Service reports own" ON public.service_reports;
CREATE POLICY "service_reports_access" ON public.service_reports AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

DROP POLICY IF EXISTS "Admin targets" ON public.targets;
DROP POLICY IF EXISTS "Targets own" ON public.targets;
CREATE POLICY "targets_access" ON public.targets AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'))
  WITH CHECK ((SELECT auth.uid()) = user_id OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.role = 'admin'));

-- Harden SECURITY DEFINER RPCs by removing implicit search_path resolution.
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT tm.team_id INTO v_team_id FROM public.team_members tm
  WHERE tm.user_id = auth.uid() ORDER BY tm.joined_at LIMIT 1;
  RETURN v_team_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_team_for_user(p_name text, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_team public.teams;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Team name is required'; END IF;
  INSERT INTO public.teams (name) VALUES (trim(p_name)) RETURNING * INTO v_team;
  INSERT INTO public.team_members (team_id, user_id, role) VALUES (v_team.id, auth.uid(), 'admin');
  RETURN row_to_json(v_team);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_team_by_code(p_invite_code text, p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_team public.teams;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_team FROM public.teams WHERE invite_code IS NOT NULL AND upper(invite_code)=upper(trim(p_invite_code)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid invite code'; END IF;
  IF EXISTS (SELECT 1 FROM public.team_members WHERE team_id=v_team.id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Already a member of this team'; END IF;
  INSERT INTO public.team_members (team_id,user_id,role) VALUES (v_team.id,auth.uid(),'member');
  RETURN row_to_json(v_team);
END;
$function$;

CREATE OR REPLACE FUNCTION public.migrate_user_data_to_team(p_user_id uuid, p_team_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not authorized for this team'; END IF;
  UPDATE public.clients SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.contacts SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.quotes SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.followups SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.notes SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.equipment SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
  UPDATE public.leads SET team_id=p_team_id WHERE user_id=auth.uid() AND team_id IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_assignment(p_to_user_id uuid,p_from_user_id uuid,p_team_id uuid,p_record_type text,p_record_id uuid,p_record_title text,p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF auth.uid() IS NULL OR p_from_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=auth.uid())
     OR NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=p_team_id AND user_id=p_to_user_id) THEN
    RAISE EXCEPTION 'Users must belong to the same team';
  END IF;
  INSERT INTO public.team_notifications(team_id,from_user_id,to_user_id,record_type,record_id,record_title,message)
  VALUES(p_team_id,auth.uid(),p_to_user_id,p_record_type,p_record_id,p_record_title,p_message);
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_shared_record(p_notification_id uuid,p_to_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_notif public.team_notifications%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_to_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_notif FROM public.team_notifications WHERE id=p_notification_id AND to_user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found'; END IF;
  IF v_notif.accepted THEN RAISE EXCEPTION 'Already accepted'; END IF;
  UPDATE public.team_notifications SET accepted=true,accepted_at=now(),read=true WHERE id=p_notification_id AND to_user_id=auth.uid();
  RETURN jsonb_build_object('ok',true,'record_type',v_notif.record_type,'record_id',v_notif.record_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_record(p_table text,p_record_id uuid,p_assigned_to_user_id uuid,p_assigned_to text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_allowed boolean; v_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_table NOT IN ('clients','contacts','followups','leads','notes','equipment') THEN RAISE EXCEPTION 'Invalid table: %',p_table; END IF;
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I r WHERE r.id=$1 AND (r.user_id=$2 OR r.assigned_to_user_id=$2 OR (r.team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id=r.team_id AND tm.user_id=$2))))',p_table)
    INTO v_allowed USING p_record_id,auth.uid();
  IF NOT v_allowed THEN RAISE EXCEPTION 'Not authorized for this record'; END IF;
  EXECUTE format('SELECT team_id FROM public.%I WHERE id=$1',p_table) INTO v_team_id USING p_record_id;
  IF v_team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=v_team_id AND user_id=auth.uid()) OR NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id=v_team_id AND user_id=p_assigned_to_user_id) THEN
      RAISE EXCEPTION 'Target user must belong to the same team';
    END IF;
  ELSIF p_assigned_to_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Cannot assign a personal record to another user'; END IF;
  EXECUTE format('UPDATE public.%I SET assigned_to_user_id=$1,assigned_to=$2 WHERE id=$3',p_table) USING p_assigned_to_user_id,p_assigned_to,p_record_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.same_team(record_team_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  RETURN auth.uid() IS NOT NULL AND record_team_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.team_members WHERE team_id=record_team_id AND user_id=auth.uid());
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_team_member_emails(p_team_id uuid)
RETURNS TABLE(user_id uuid, role text, joined_at timestamptz, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $function$
  SELECT tm.user_id,tm.role::text,tm.joined_at,u.email
  FROM public.team_members tm
  LEFT JOIN auth.users u ON u.id=tm.user_id
  WHERE tm.team_id=p_team_id
    AND EXISTS (SELECT 1 FROM public.team_members me WHERE me.team_id=p_team_id AND me.user_id=auth.uid())
  ORDER BY tm.joined_at ASC;
$function$;

COMMIT;
