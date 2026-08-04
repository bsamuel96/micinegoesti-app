create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product_id on public.product_images(product_id);

alter table public.product_images enable row level security;

drop policy if exists "Public read product images" on public.product_images;
create policy "Public read product images"
on public.product_images
for select
to anon, authenticated
using (true);