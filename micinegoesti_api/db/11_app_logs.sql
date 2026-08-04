-- Run after 10_game_score_admin_names.sql.
-- Stores admin-visible runtime logs for serverless deployments such as Vercel.

begin;

create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  level text not null check (level in ('debug', 'info', 'warn', 'error')),
  event text not null,
  context jsonb not null default '{}'::jsonb
);

create index if not exists idx_app_logs_created_at on public.app_logs(created_at desc);
create index if not exists idx_app_logs_level on public.app_logs(level);
create index if not exists idx_app_logs_event on public.app_logs(event);

alter table public.app_logs enable row level security;

drop policy if exists "Service role manages app logs" on public.app_logs;
create policy "Service role manages app logs"
on public.app_logs
for all
to service_role
using (true)
with check (true);

commit;
