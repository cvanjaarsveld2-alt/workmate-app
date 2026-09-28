-- Files that came in by email live under receipts/<user>/inbox/. The usual
-- rules (your own folder; the whole team's for the master account, admins
-- and people with the team view) left a plain member unable to open a file
-- they're allowed to see: one forwarded to the company address (stored under
-- the owner's folder), or the slip on an expense they approved from it.
-- Rule: you can open an inbox file if you can see its inbox item or an
-- expense that uses it (both checked by those tables' own row rules).
create index if not exists inbox_items_file_path_idx on public.inbox_items (file_path) where file_path is not null;
create index if not exists expenses_receipt_url_idx on public.expenses (receipt_url) where receipt_url is not null;

drop policy if exists receipts_read_inbox on storage.objects;
create policy receipts_read_inbox on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = 'receipts'
    and (storage.foldername(name))[3] = 'inbox'
    and (
      exists (select 1 from public.inbox_items i where i.file_path = objects.name)
      or exists (select 1 from public.expenses e where e.receipt_url = objects.name)
    )
  );
