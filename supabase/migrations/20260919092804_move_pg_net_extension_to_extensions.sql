-- pg_net is non-relocatable. Supabase recommends recreating it in the
-- extensions schema after confirming the request queue is empty.
create schema if not exists extensions;
drop extension pg_net;
create extension pg_net with schema extensions;
