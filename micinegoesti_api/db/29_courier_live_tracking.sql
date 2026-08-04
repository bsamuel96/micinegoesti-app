-- Run after 28_delivery_zones_20km_negoiesti.sql.
-- Stores only the courier's latest position so assigned customers can see a
-- live delivery marker without retaining a full location history.

begin;

alter table public.orders
  add column if not exists delivery_started_at timestamptz,
  add column if not exists courier_arrived_at timestamptz;

create table if not exists public.courier_locations (
  deliverer_id text primary key references public.users(id) on delete cascade,
  active_order_id bigint references public.orders(id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  heading double precision check (heading is null or heading between 0 and 360),
  speed_mps double precision check (speed_mps is null or speed_mps >= 0),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_courier_locations_active_order
  on public.courier_locations(active_order_id);

create index if not exists idx_courier_locations_recorded_at
  on public.courier_locations(recorded_at desc);

drop trigger if exists trg_courier_locations_updated_at on public.courier_locations;
create trigger trg_courier_locations_updated_at
before update on public.courier_locations
for each row execute function public.set_updated_at();

alter table public.courier_locations enable row level security;

drop policy if exists "Service role manages courier locations" on public.courier_locations;
create policy "Service role manages courier locations" on public.courier_locations
for all to service_role using (true) with check (true);

commit;
