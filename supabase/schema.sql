-- Run this in the Supabase SQL editor (https://supabase.com/dashboard/project/_/sql)

create table if not exists user_data (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  key         text        not null,
  value       jsonb       not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, key)
);

-- Row-level security: allow all operations via the anon key.
-- When proper auth is added, tighten this policy to (auth.uid()::text = user_id).
alter table user_data enable row level security;

create policy "anon full access"
  on user_data for all
  using (true)
  with check (true);

-- Enable real-time for this table so Supabase broadcasts row changes.
-- Run once; safe to re-run (ADD TABLE is idempotent in Supabase).
alter publication supabase_realtime add table user_data;
