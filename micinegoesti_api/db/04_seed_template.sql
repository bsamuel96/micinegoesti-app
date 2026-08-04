-- Replace these values with your old DB data.

insert into public.categories (slug, name)
values
  ('default', 'Default')
on conflict (slug) do nothing;

insert into public.products (slug, name, description, price, currency, category_id, in_stock, stock_qty, is_active)
values
  (
    'sample-product',
    'Sample Product',
    'Imported from old database',
    99.99,
    'RON',
    (select id from public.categories where slug = 'default'),
    true,
    10,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  currency = excluded.currency,
  category_id = excluded.category_id,
  in_stock = excluded.in_stock,
  stock_qty = excluded.stock_qty,
  is_active = excluded.is_active;

-- optional image
insert into public.product_images (product_id, url, alt, sort_order)
select p.id, 'https://example.com/image.jpg', 'Sample image', 0
from public.products p
where p.slug = 'sample-product'
on conflict do nothing;