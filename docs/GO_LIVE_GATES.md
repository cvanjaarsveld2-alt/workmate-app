# PowerMate go-live gates

The remaining gates from `MASTER_ENGINEER_AUDIT_2026-09-19.md`, turned into
steps the owner can run. Each one needs a person, a real device or dashboard
access, so none of them can be closed from CI.

Status as checked on 2026-09-23 (Supabase project `powermate-app`):

| Gate | Status |
| --- | --- |
| Leaked-password protection | **Off.** Supabase security advisor flags it. |
| `reminder_deliveries` RLS | RLS on, no policies. Informational: only the service role can use it, which is what you want if the reminder functions are the only thing using it. |
| Edge functions in git | **3 of 11.** 8 deployed functions exist only in Supabase (see section 3). |
| Storage backup | Supabase database backups **do not include Storage files** (for example 241 receipts and 114 media files). |
| Authenticated E2E | Workflow exists, skipped until secrets are added. |
| Real-device offline test | Not run. |
| Restore drill | Not run. |
| Supabase plan | **Free.** No restorable backups, 1 GB file storage (198 MB used by 4 users), 5 GB/month egress. Upgrade before growing the team (section 5). |

---

## 1. Dashboard settings (about 10 minutes)

- **Leaked-password protection:** Authentication → Providers → Email (or
  Auth → Password security): turn on *Prevent use of leaked passwords*.
- **Organisation MFA:** Organization settings → Security: require MFA for
  every member who can reach the dashboard.
- **SSL enforcement:** Project settings → Database → SSL: enforce.
- **Network restrictions:** Project settings → Database → Network
  restrictions: allow only the IPs that need direct Postgres access. The app
  uses the HTTPS API, which this setting doesn't affect.
- **Session lifetime:** Authentication → Sessions: set an inactivity timeout
  and/or a time-box (for example 30 days), so a lost phone doesn't keep its
  session indefinitely. The app PIN only gates the screen on the device; it
  doesn't end the session.

Afterwards, re-run the security advisor. Leaked-password protection should
no longer be listed.

## 2. Authenticated E2E in CI

`.github/workflows/*` already contains **PowerMate Authenticated E2E**. It exits
early until these repository secrets exist (GitHub → Settings → Secrets and
variables → Actions):

- `E2E_BASE_URL`: the deployed app URL
- `E2E_EMAIL` / `E2E_PASSWORD`: a **dedicated test account** in its own
  team. Don't use a real user's login. The test writes data.

Then run the workflow once manually (Actions → PowerMate Authenticated E2E →
Run workflow). After that it runs on every push to `main`.

## 3. Restore drill (about 1–2 hours, once per quarter)

Goal: prove that a fresh project can be rebuilt from what you actually keep.

**Before the drill: close the gaps**

1. **Edge function source.** Only `polish-sales-email`, `scan-receipt` and
   `send-reminders` are in this repo. Download the rest and commit them:

   ```bash
   supabase login
   supabase link --project-ref hrqzqyfvbfzrfnuxovvr
   for f in check-reminders scan-business-card send-notifications historical-rate \
            transcribe-audio format-meeting-minutes technician-assist ingest-email-record; do
     supabase functions download "$f"
   done
   git add supabase/functions && git commit -m "chore: track all deployed edge functions"
   ```

   Also record each function's `verify_jwt` setting in `supabase/config.toml`.
   `send-reminders`, `ingest-email-record` and `polish-sales-email` run with
   `verify_jwt = false` and authenticate the caller themselves.

2. **Storage files.** Database backups contain only the `storage.objects`
   rows, not the files. Use one of:
   - the in-app **Backup Export** on the More screen, signed in as the owner
     (it only copies files that account can see). It includes Storage files with
     SHA-256 checksums in `storage_manifest.json`. Keep the ZIP off-device, or
   - an S3-compatible sync of the buckets (`receipts`, `powermate-media`,
     `powermate-files`, `company-docs`, `powermate-quotes`) to storage you
     own, on a schedule.

**The drill**

1. Create a scratch Supabase project (same region).
2. Restore the database into it: either use *Database → Backups → Restore to
   a new project*, or run `supabase db dump` against production and
   `psql` the dump into the scratch project.
3. Check row counts match production for the tables that matter:

   ```sql
   select 'clients', count(*) from clients union all
   select 'quotes', count(*) from quotes union all
   select 'invoices', count(*) from invoices union all
   select 'payments', count(*) from payments union all
   select 'expenses', count(*) from expenses union all
   select 'vehicle_checks', count(*) from vehicle_checks union all
   select 'storage.objects', count(*) from storage.objects;
   ```

4. Upload the Storage backup into the scratch buckets and spot-check 10
   receipts against the checksums in `storage_manifest.json`.
5. Deploy every function from the repo (`supabase functions deploy`) and
   set its secrets: `OPENAI_API_KEY`, `SALES_AI_MODEL`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `INGEST_SHARED_SECRET`. The secret
   *values* live only in the dashboard, so keep them in a password manager.
6. Recreate the reminder cron job (`cron.job`, one entry today) and check it
   fires.
7. Point a local build at the scratch project (`.env` →
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), sign in with the test
   account, and open a client, a quote PDF, a receipt image and a vehicle check.
8. Write down the date, how long it took and anything that was missing, then
   delete the scratch project.

## 4. Real-device offline test (about 1 hour per device)

Run this on one iPhone (home-screen install) and one Android phone (installed
PWA), each signed in with the test account.

| # | Step | Expected |
| --- | --- | --- |
| 1 | Airplane mode on. Create a client, a quote, an expense with a receipt photo, and a vehicle check with a photo. | All four save; the pending badge shows them. |
| 2 | Force-quit the app (swipe away). Reopen, still offline. | All four still there, still pending. |
| 3 | Reboot the phone. Reopen, still offline. | Same. |
| 4 | Airplane mode off. | Queue drains; receipts and photos upload; items appear on a second device. |
| 5 | Edit the same client on two devices while both are offline, then reconnect both. | No crash; one version wins and no data is silently duplicated. |
| 6 | **iOS only:** queue one change offline, then don't open the app for 7+ days. Reopen online. | The change syncs. (The app now asks for persistent storage. Check the `events` table for `storage_not_persistent` from this device.) |
| 7 | Check the `events` table. | Any `screen_crashed`, `window_error`, `unhandled_rejection` or `sync_failed` rows from the run are explained. |

Useful query for step 7:

```sql
select timestamp, name, data->>'message' as message, data->>'screen' as screen, data->>'build' as build
from events
where name in ('screen_crashed','app_crashed','window_error','unhandled_rejection','sync_failed','storage_not_persistent')
order by timestamp desc
limit 50;
```

## 5. Scaling to 20–50 people

### Upgrade Supabase to Pro first (owner, about 5 minutes)

The project is on the Free plan, which is not suitable for a business team:
no backups you can restore, 1 GB of file storage (receipts and photos
already use 198 MB with 4 users) and 5 GB of egress a month.

1. supabase.com → the **PowerMate System** organisation → **Billing**.
2. Change the plan to **Pro**. Check current prices and quotas at
   supabase.com/pricing; when this was written Pro was about US$25/month
   with daily backups, 100 GB file storage, 8 GB database and 250 GB egress.
3. Leave the project's compute size as it is (Micro is fine for 50 users).
4. Set a **spend cap** under Billing → Cost control so usage can't run up
   an unexpected bill.
5. Afterwards: Database → Backups should list daily backups. Then the
   restore drill in section 3 can use *Restore to a new project*.

### Sync load (done in code)

Phones used to re-download every table in full every 30 seconds. They now
fetch only rows changed since the last pull, every 60 seconds and whenever
the app comes back to the foreground, with a full pull on startup and at
most every 15 minutes (to pick up deletions). Realtime still delivers
changes instantly. `npm run test:sim` checks the background pull asks only
for changed rows.

### Grow in steps and watch

Add about 10 people, then check after a week before adding the rest.

Active users and their devices (last 7 days):

```sql
select count(distinct user_id) as active_users,
       count(*) filter (where name = 'sync_succeeded') as sync_batches
from events where timestamp > now() - interval '7 days';
```

Problems to look at (should be few, and each explainable):

```sql
select name, count(*) as n, count(distinct user_id) as users,
       max(timestamp) as latest
from events
where timestamp > now() - interval '7 days'
  and name in ('sync_failed','screen_crashed','app_crashed','window_error',
               'unhandled_rejection','storage_not_persistent')
group by name order by n desc;
```

Storage growth (compare with your plan's file storage quota):

```sql
select bucket_id, count(*) as files,
       round(sum((metadata->>'size')::bigint) / 1048576.0) as mb
from storage.objects group by bucket_id order by mb desc;
```

Also check **Reports → API** and **Usage** in the Supabase dashboard:
egress and request counts should grow roughly in line with the number of
people, not faster. If the team grows past about 50 active users, re-run
the performance advisor and check Database → Query performance.

## 6. Running the team

**Daily problem digest.** At 17:00 (SA time) the `problem-digest` function
checks the last 24 hours of crash and sync-failure reports. If there are
any, the master account gets a push notification and an entry under
Notifications, e.g. "3 sync failures (2 people) · 1 screen crash on
Quotes". Quiet days send nothing. Schedule: cron job
`powermate-problem-digest`.

**When someone leaves.** Team → the person's remove button (master account
only). Choose who takes over their work and leave *Block their login*
ticked. In one step their clients, contacts, follow-ups, quotes, notes,
leads, equipment, jobs and reports move to that person, they leave the
team, their sessions and push devices are cleared, and their login is
blocked. Their expenses and vehicle checks stay on record for the team.
Each removal is logged as a `member_removed` event.
To undo a blocked login: Supabase → Authentication → Users → the person →
Unban, then re-invite them to the team.

**Auto-lock.** With a PIN set, the app asks for it again after 15 minutes
in the background. Anything half-typed is still there after unlocking.

**Photos across the team.** The master account, admins and members granted
whole-team view can open teammates' business cards, note and vehicle-check
photos and receipts. Other members can only open photos they took
themselves (a business card they can't open is left out of the contact).

**Each person's own menu.** Menu → *Customise menu*: untick the screens you
don't use and tap Done. It only changes that person's menu, follows them to
any phone they sign in on (saved as `users.hidden_screens`), and works
offline (sent once back online). Dashboard and Settings & More can't be
hidden, and a hidden screen still opens from links and notifications.
Tick it again to bring it back.
