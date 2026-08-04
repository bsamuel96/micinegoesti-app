-- Run after 00_setup.sql through 05_migrate_products.sql.
-- Server-managed app state that should not live in browser storage:
-- carts, cart items, repeat-last-order data, and game best scores.

begin;

create table if not exists public.app_carts (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.app_carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists public.last_orders (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  user_id text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  session_key text unique,
  user_id text unique,
  player_name text check (player_name is null or player_name ~ '^[[:alpha:]]{1,5}$'),
  best_score integer not null default 0 check (best_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_cart_items_cart_id on public.app_cart_items(cart_id);
create index if not exists idx_app_cart_items_product_id on public.app_cart_items(product_id);
create index if not exists idx_last_orders_session_key on public.last_orders(session_key);
create index if not exists idx_game_scores_session_key on public.game_scores(session_key);
create index if not exists idx_game_scores_best_score on public.game_scores(best_score desc);

drop trigger if exists trg_app_carts_updated_at on public.app_carts;
create trigger trg_app_carts_updated_at
before update on public.app_carts
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_cart_items_updated_at on public.app_cart_items;
create trigger trg_app_cart_items_updated_at
before update on public.app_cart_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_last_orders_updated_at on public.last_orders;
create trigger trg_last_orders_updated_at
before update on public.last_orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_scores_updated_at on public.game_scores;
create trigger trg_game_scores_updated_at
before update on public.game_scores
for each row execute function public.set_updated_at();

alter table public.app_carts enable row level security;
alter table public.app_cart_items enable row level security;
alter table public.last_orders enable row level security;
alter table public.game_scores enable row level security;

drop policy if exists "Service role manages app carts" on public.app_carts;
create policy "Service role manages app carts"
on public.app_carts
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages app cart items" on public.app_cart_items;
create policy "Service role manages app cart items"
on public.app_cart_items
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages last orders" on public.last_orders;
create policy "Service role manages last orders"
on public.last_orders
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role manages game scores" on public.game_scores;
create policy "Service role manages game scores"
on public.game_scores
for all
to service_role
using (true)
with check (true);

commit;
