-- A one-person account (an invoice with no company) passes the finance
-- manager check, but credit notes are numbered per company (the counter is on
-- team_profiles and credit_notes.team_id is required). Say so plainly instead
-- of failing on the NOT NULL constraint. Voiding still works for them.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.create_credit_note(uuid, numeric, text)'::regprocedure);
  if position('numbered per company' in d) = 0 then
    d := replace(d,
      E'  perform private.require_finance_manager(i.team_id, i.user_id);\n',
      E'  perform private.require_finance_manager(i.team_id, i.user_id);\n'
      || E'  if i.team_id is null then\n'
      || E'    raise exception ''Credit notes are numbered per company. Set up your company in Company Details first, or void the invoice instead.'' using errcode = ''P0001'';\n'
      || E'  end if;\n');
    if position('numbered per company' in d) = 0 then raise exception 'create_credit_note patch did not apply'; end if;
    execute d;
  end if;
end $$;
