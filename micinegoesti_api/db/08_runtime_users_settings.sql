-- Run this in Supabase if the admin/runtime tables are missing.
-- Staff users are stored in public.users. Delivery zones are stored in public.delivery_zones.
-- The backend still needs DATABASE_URL pointed at this Supabase Postgres database.

begin;

create table if not exists public.users (
  id text primary key default gen_random_uuid()::text,
  phone text not null unique,
  email text,
  name text,
  role text not null default 'customer',
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.otp_challenges (
  id text primary key default gen_random_uuid()::text,
  phone text not null,
  "codeHash" text not null,
  "requesterIp" text,
  "expiresAt" timestamptz not null,
  "consumedAt" timestamptz,
  attempts integer not null default 0,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key default gen_random_uuid()::text,
  "userId" text not null references public.users(id) on delete cascade,
  "tokenHash" text not null unique,
  "expiresAt" timestamptz not null,
  "revokedAt" timestamptz,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default gen_random_uuid()::text,
  key text not null unique,
  value text not null,
  "isSecret" boolean not null default false,
  "updatedAt" timestamptz not null default now(),
  "createdAt" timestamptz not null default now()
);

create table if not exists public.delivery_zones (
  id text primary key,
  name text not null,
  price numeric(12,2) not null default 0 check (price >= 0),
  "isActive" boolean not null default true,
  "sortOrder" integer not null default 0,
  description text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_otp_challenges_phone_created_at on public.otp_challenges(phone, "createdAt");
create index if not exists idx_sessions_user_id_created_at on public.sessions("userId", "createdAt");
create index if not exists idx_delivery_zones_active_sort on public.delivery_zones("isActive", "sortOrder");

insert into public.settings (key, value, "isSecret")
values
  ('deliveryFee', '7', false),
  ('deliveryZones', '[{"id":"negoiesti","name":"Negoiești","price":7,"isActive":true,"sortOrder":0}]', false),
  ('pickupEnabled', 'true', false),
  ('deliveryEnabled', 'true', false),
  ('whatsappStoreNumber', '+40747232306', false),
  ('restaurantSchedule', '{"mondaySaturday":"09:00-21:00","sunday":"07:00-19:00"}', false),
  ('pwaInstallPrompt', 'true', false),
  ('paymentCashEnabled', 'true', false)
on conflict (key) do nothing;

insert into public.delivery_zones (id, name, price, "isActive", "sortOrder")
values ('negoiesti', 'Negoiești', 7, true, 0)
on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.delivery_zones enable row level security;

drop policy if exists "Service role manages users" on public.users;
create policy "Service role manages users"
on public.users
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages otp challenges" on public.otp_challenges;
create policy "Service role manages otp challenges"
on public.otp_challenges
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages sessions" on public.sessions;
create policy "Service role manages sessions"
on public.sessions
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages settings" on public.settings;
create policy "Service role manages settings"
on public.settings
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages delivery zones" on public.delivery_zones;
create policy "Service role manages delivery zones"
on public.delivery_zones
for all
to service_role
using (true)
with check (true);

commit;
