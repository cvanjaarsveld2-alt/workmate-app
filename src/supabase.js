import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://hrqzqyfvbfzrfnuxovvr.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhycXpxeWZ2YmZ6cmZudXhvdnZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NTgxNzIsImV4cCI6MjA5MzQzNDE3Mn0.GcTXpDYUTIVv31G1osYOzVORUHV6rv3K9mCGQwTH4yk"
);
