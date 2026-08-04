-- Native delivery-zone rows covering a maximum radius of 20 km from Negoești,
-- Călărași. Run after db/08_runtime_users_settings.sql.
--
-- Each row appears in Admin > Zone livrare, where its price can be changed
-- independently. The backend separately checks the customer's pin distance.
-- Set these values in the server environment so that check uses the same limit:
--
--   STORE_LATITUDE=44.380758
--   STORE_LONGITUDE=26.167395
--   MAX_DELIVERY_RADIUS_KM=20
--
-- Initial prices (subsequent runs preserve dashboard-edited values):
--   0-5 km:   7 lei
--   5-10 km: 10 lei
--   10-15 km: 15 lei
--   15-20 km: 20 lei

begin;

-- Keep old rows for historical order references, but remove them from the
-- active checkout choices when they are not part of this 20 km configuration.
update public.delivery_zones
set "isActive" = false,
    "updatedAt" = now()
where id not in (
  'negoiesti-0-5-km',
  'negoiesti-5-10-km',
  'negoiesti-10-15-km',
  'negoiesti-15-20-km'
);

insert into public.delivery_zones (
  id,
  name,
  price,
  "isActive",
  "sortOrder",
  description,
  "updatedAt"
)
values
  (
    'negoiesti-0-5-km',
    'Negoești și împrejurimi (0–5 km)',
    7,
    true,
    0,
    'Adresă aflată la cel mult 5 km de restaurant.',
    now()
  ),
  (
    'negoiesti-5-10-km',
    'Zona 5–10 km',
    10,
    true,
    1,
    'Adresă aflată la peste 5 km și la cel mult 10 km de restaurant.',
    now()
  ),
  (
    'negoiesti-10-15-km',
    'Zona 10–15 km',
    15,
    true,
    2,
    'Adresă aflată la peste 10 km și la cel mult 15 km de restaurant.',
    now()
  ),
  (
    'negoiesti-15-20-km',
    'Zona 15–20 km',
    20,
    true,
    3,
    'Adresă aflată la peste 15 km și la cel mult 20 km de restaurant.',
    now()
  )
on conflict (id) do update
set "isActive" = true,
    "updatedAt" = now();

-- Global minimum product subtotal for delivery. Zero means disabled. The value
-- can be changed later in Admin > Zone livrare without rerunning SQL.
insert into public.settings (key, value, "isSecret")
values ('minimumDeliveryOrderAmount', '0', false)
on conflict (key) do nothing;

commit;

select id, name, price, "isActive", "sortOrder", description
from public.delivery_zones
where "isActive" = true
order by "sortOrder", name;

select key, value
from public.settings
where key = 'minimumDeliveryOrderAmount';
