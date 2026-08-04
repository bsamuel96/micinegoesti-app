alter table public.product_images add column if not exists storage_path text;
alter table public.product_images add column if not exists width integer;
alter table public.product_images add column if not exists height integer;
alter table public.product_images add column if not exists file_size integer;
alter table public.product_images add column if not exists mime_type text;
alter table public.product_images add column if not exists updated_at timestamptz not null default now();
create unique index if not exists idx_product_images_storage_path on public.product_images(storage_path) where storage_path is not null;
create index if not exists idx_product_images_product_sort on public.product_images(product_id, sort_order);
drop trigger if exists trg_product_images_updated_at on public.product_images;
create trigger trg_product_images_updated_at before update on public.product_images for each row execute function public.set_updated_at();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 10485760, array['image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public reads product images" on storage.objects;
create policy "Public reads product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
