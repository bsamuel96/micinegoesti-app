-- Adds persistent category visibility and drag-and-drop ordering.
-- Safe to run more than once in the Supabase SQL editor.

begin;

alter table public.categories
  add column if not exists sort_order integer,
  add column if not exists is_active boolean;

with ranked_categories as (
  select
    id,
    case slug
      when 'specialitatea-casei' then 0
      when 'grill' then 1
      when 'meniuri' then 2
      when 'ciorbe' then 3
      when 'toping' then 4
      when 'sosuri' then 5
      when 'garnituri' then 6
      when 'salate' then 7
      when 'platouri' then 8
      when 'peste' then 9
      when 'desert' then 10
      when 'racoritoare' then 11
      when 'cafea' then 12
      when 'bere' then 13
      when 'vin' then 14
      when 'bauturi-alcoolice' then 15
      when '1-metru-de-bere' then 16
      else 100 + row_number() over (order by name, id)::integer
    end as initial_sort_order
  from public.categories
)
update public.categories as category
set
  sort_order = coalesce(category.sort_order, ranked.initial_sort_order),
  is_active = coalesce(category.is_active, true)
from ranked_categories as ranked
where ranked.id = category.id;

alter table public.categories
  alter column sort_order set default 99,
  alter column sort_order set not null,
  alter column is_active set default true,
  alter column is_active set not null;

create index if not exists idx_categories_menu_order
on public.categories (is_active, sort_order, name);

commit;
