-- Paste this file into the Supabase SQL editor after running 00_setup.sql through 03_product_images.sql.
-- It imports the local Prisma/SQLite catalog into the simpler Supabase product schema.
-- Safe to rerun: products/categories are upserted and images for these products are replaced.

begin;

drop table if exists _migrate_categories;
create temp table _migrate_categories (
  slug text primary key,
  name text not null,
  sort_order integer not null default 99,
  is_active boolean not null default true
);

insert into _migrate_categories (slug, name, sort_order, is_active)
values
  ('specialitatea-casei', 'Specialitatea Casei', 0, true),
  ('grill', 'Grill', 1, true),
  ('meniuri', 'Meniuri', 2, true),
  ('ciorbe', 'Ciorbe', 3, true),
  ('garnituri', 'Garnituri', 4, true),
  ('salate', 'Salate', 5, true),
  ('platouri', 'Platouri', 6, true),
  ('peste', 'Pește', 7, true),
  ('desert', 'Desert', 8, true),
  ('racoritoare', 'Răcoritoare', 9, true),
  ('bere', 'Bere', 10, true),
  ('vin', 'Vin', 11, true),
  ('cafea', 'Cafea', 12, true),
  ('1-metru-de-bere', '1 metru de BERE', 99, true),
  ('bauturi-alcoolice', 'Bãuturi Alcoolice', 99, true),
  ('sosuri', 'Sosuri', 99, true),
  ('toping', 'Toping', 99, true);

drop table if exists _migrate_products;
create temp table _migrate_products (
  slug text primary key,
  name text not null,
  description text,
  price numeric(12,2) not null,
  currency text not null default 'RON',
  category_slug text,
  in_stock boolean not null default true,
  stock_qty integer not null default 0,
  is_active boolean not null default true,
  image_url text,
  image_alt text,
  image_sort integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

insert into _migrate_products (
  slug, name, description, price, currency, category_slug, in_stock, stock_qty, is_active, image_url, image_alt, image_sort, metadata
)
values
  ('mici-porc-vita', 'Mici porc-vita', '70g', 6, 'RON', 'specialitatea-casei', true, 0, true, '/uploads/products/296-mici-porc-vita.png', 'Mici porc-vita', 0, '{"external_id":296,"short_description":"70g","sort_order":0,"category_slugs":["specialitatea-casei","grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/17.png"}'::jsonb),
  ('mici-porc-vita-oaie', 'Mici porc-vita-oaie', null, 8, 'RON', 'specialitatea-casei', true, 0, true, '/uploads/products/298-mici-porc-vita-oaie.png', 'Mici porc-vita-oaie', 0, '{"external_id":298,"short_description":"90g","sort_order":1,"category_slugs":["specialitatea-casei","grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/16.png"}'::jsonb),
  ('carnacior-afumat', 'Carnacior afumat', 'Porția include 70g, plus pâine inclusă', 7, 'RON', 'grill', true, 0, true, '/uploads/products/299-carnacior-afumat.png', 'Carnacior afumat', 0, '{"external_id":299,"short_description":"Porția include 70g, plus pâine inclusă","sort_order":2,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/5.png","attributes":[{"name":"picant","values":["nepicant","picant"]}]}'::jsonb),
  ('carnat-oaie', 'Carnat oaie', 'Poția de cârnat de oaie are 120g plus paine inclusă', 10, 'RON', 'grill', true, 0, true, '/uploads/products/300-carnat-oaie.png', 'Carnat oaie', 0, '{"external_id":300,"short_description":"Poția de cârnat de oaie are 120g plus paine inclusă","sort_order":3,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/25.png"}'::jsonb),
  ('carnat-cu-cascaval', 'Carnat cu cascaval', 'Porția are 140g, include pâine', 10, 'RON', 'grill', true, 0, true, '/uploads/products/301-carnat-cu-cascaval.png', 'Carnat cu cascaval', 0, '{"external_id":301,"short_description":"Porția are 140g, include pâine","sort_order":4,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/23.png"}'::jsonb),
  ('ceafa-porc', 'Ceafa porc', 'Ceafă de porc, 300g, include pâine', 23, 'RON', 'grill', true, 0, true, '/uploads/products/302-ceafa-porc.png', 'Ceafa porc', 0, '{"external_id":302,"short_description":"Ceafă de porc, 300g, include pâine","sort_order":5,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/22.png"}'::jsonb),
  ('pastrama-oaie', 'Pastrama oaie', '15 lei la 100g, include pâine', 15, 'RON', 'grill', true, 0, true, '/uploads/products/303-pastrama-oaie.png', 'Pastrama oaie', 0, '{"external_id":303,"short_description":"15 lei la 100g, include pâine","sort_order":6,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/21.png"}'::jsonb),
  ('piept-pui', 'Piept pui', 'Piept de pui la 300g, include pâine', 23, 'RON', 'grill', true, 0, true, '/uploads/products/304-piept-pui.png', 'Piept pui', 0, '{"external_id":304,"short_description":"Piept de pui la 300g, include pâine","sort_order":7,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/20.png"}'::jsonb),
  ('pulpa-dezosata', 'Pulpa dezosata', 'Pulpă dezosată de pui, 300g, include pâine', 21, 'RON', 'grill', true, 0, true, '/uploads/products/305-pulpa-dezosata.png', 'Pulpa dezosata', 0, '{"external_id":305,"short_description":"Pulpă dezosată de pui, 300g, include pâine","sort_order":8,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/19.png"}'::jsonb),
  ('scarita', 'Scăriță', 'Portia de scăriță are 300g - include pâine', 23, 'RON', 'grill', true, 0, true, '/uploads/products/306-scarita.png', 'Scăriță', 0, '{"external_id":306,"short_description":"Portia de scăriță are 300g - include pâine","sort_order":9,"category_slugs":["grill"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/18.png"}'::jsonb),
  ('ciorba-burta', 'Ciorba burta', 'Ciorbă românească de burtă, cremoasă și aromată, dreasă cu smântână și ou, servită cu usturoi și ardei iute.', 29, 'RON', 'ciorbe', true, 0, true, '/uploads/products/308-ciorba-burta.jpeg', 'Ciorba burta', 0, '{"external_id":308,"short_description":"Ciorbă românească de burtă, cremoasă și aromată, dreasă cu smântână și ou, servită cu usturoi și ardei iute.","sort_order":10,"category_slugs":["ciorbe"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-01-28-at-09.12.52.jpeg"}'::jsonb),
  ('ciorba-perisoare', 'Ciorba perișoare', 'include paine, smantana si ardei', 24, 'RON', 'ciorbe', true, 0, true, '/uploads/products/309-ciorba-perisoare.jpeg', 'Ciorba perișoare', 0, '{"external_id":309,"short_description":"include paine, smantana si ardei","sort_order":11,"category_slugs":["ciorbe"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/WhatsApp-Image-2026-01-27-at-16.08.42.jpeg"}'::jsonb),
  ('ardei-iute', 'Ardei iute', null, 1, 'RON', 'toping', true, 0, true, '/uploads/products/310-ardei-iute.png', 'Ardei iute', 0, '{"external_id":310,"sort_order":12,"category_slugs":["toping"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/80.png"}'::jsonb),
  ('smantana', 'Smântână', '60g', 3, 'RON', 'toping', true, 0, true, '/uploads/products/312-smantana.png', 'Smântână', 0, '{"external_id":312,"short_description":"60g","sort_order":13,"category_slugs":["toping"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/81.png"}'::jsonb),
  ('branza-rasa', 'Brânza rasa', '40g', 4, 'RON', 'toping', true, 0, true, '/uploads/products/313-branza-rasa.png', 'Brânza rasa', 0, '{"external_id":313,"short_description":"40g","sort_order":14,"category_slugs":["toping"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/79.png"}'::jsonb),
  ('paine', 'Pâine', '200g', 2, 'RON', 'toping', true, 0, true, '/uploads/products/314-paine.png', 'Pâine', 0, '{"external_id":314,"short_description":"200g","sort_order":15,"category_slugs":["toping"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/78.png"}'::jsonb),
  ('mustar', 'Mustar', '60g', 2, 'RON', 'sosuri', true, 0, true, '/uploads/products/315-mustar.png', 'Mustar', 0, '{"external_id":315,"short_description":"60g","sort_order":16,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/77.png"}'::jsonb),
  ('mujdei', 'Mujdei', '60g', 4, 'RON', 'sosuri', true, 0, true, '/uploads/products/316-mujdei.png', 'Mujdei', 0, '{"external_id":316,"short_description":"60g","sort_order":17,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/76.png"}'::jsonb),
  ('maioneza-simpla-picanta-cu-usturoi', 'Maioneza simpla/picanta/cu usturoi', '60g', 4, 'RON', 'sosuri', true, 0, true, '/uploads/products/317-maioneza-simpla-picanta-cu-usturoi.png', 'Maioneza simpla/picanta/cu usturoi', 0, '{"external_id":317,"short_description":"60g","sort_order":18,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/75.png"}'::jsonb),
  ('ketchup', 'Ketchup', '60 g', 4, 'RON', 'sosuri', true, 0, true, '/uploads/products/319-ketchup.png', 'Ketchup', 0, '{"external_id":319,"short_description":"60g","sort_order":19,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/74.png"}'::jsonb),
  ('sos-barbeque', 'Sos Barbeque', '60g', 5, 'RON', 'sosuri', true, 0, true, '/uploads/products/321-sos-barbeque.png', 'Sos Barbeque', 0, '{"external_id":321,"short_description":"60g","sort_order":20,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/73.png"}'::jsonb),
  ('sos-sweet-chilli', 'Sos Sweet Chilli', '60g', 6, 'RON', 'sosuri', true, 0, true, '/uploads/products/322-sos-sweet-chilli.png', 'Sos Sweet Chilli', 0, '{"external_id":322,"short_description":"60g","sort_order":21,"category_slugs":["sosuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/72.png"}'::jsonb),
  ('cartofi-prajti', 'Cartofi prajti', '250g', 10, 'RON', 'garnituri', true, 0, true, '/uploads/products/324-cartofi-prajti.png', 'Cartofi prajti', 0, '{"external_id":324,"short_description":"250g","sort_order":22,"category_slugs":["garnituri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/1.png"}'::jsonb),
  ('mamaliga', 'Mãmãligã', '200g', 5, 'RON', 'garnituri', true, 0, true, '/uploads/products/325-mamaliga.png', 'Mãmãligã', 0, '{"external_id":325,"short_description":"200g","sort_order":23,"category_slugs":["garnituri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/2.png"}'::jsonb),
  ('salata-ardei-jalapenos', 'Salatã ardei jalapenos', '100g', 5, 'RON', 'salate', true, 0, true, '/uploads/products/326-salata-ardei-jalapenos.png', 'Salatã ardei jalapenos', 0, '{"external_id":326,"short_description":"100g","sort_order":24,"category_slugs":["salate"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/3.png"}'::jsonb),
  ('salata-varza', 'Salatã varzã', '200g', 9, 'RON', 'salate', true, 0, true, '/uploads/products/327-salata-varza.png', 'Salatã varzã', 0, '{"external_id":327,"short_description":"200g","sort_order":25,"category_slugs":["salate"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/6.png"}'::jsonb),
  ('salata-varza-murata', 'Salatã varzã murată', '200g', 9, 'RON', 'salate', true, 0, true, '/uploads/products/328-salata-varza-murata.png', 'Salatã varzã murată', 0, '{"external_id":328,"short_description":"200g","sort_order":26,"category_slugs":["salate"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/7.png"}'::jsonb),
  ('salata-muraturi', 'Salatã murãturi', '200g', 9, 'RON', 'salate', true, 0, true, '/uploads/products/329-salata-muraturi.png', 'Salatã murãturi', 0, '{"external_id":329,"short_description":"200g","sort_order":27,"category_slugs":["salate"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/5.png"}'::jsonb),
  ('salata-de-vara', 'Salatã de varã', '200g', 12, 'RON', 'salate', true, 0, true, '/uploads/products/330-salata-de-vara.png', 'Salatã de varã', 0, '{"external_id":330,"short_description":"200g","sort_order":28,"category_slugs":["salate"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/4.png"}'::jsonb),
  ('papanasi', 'Papanași', '250g', 23, 'RON', 'desert', true, 0, true, '/uploads/products/331-papanasi.png', 'Papanași', 0, '{"external_id":331,"short_description":"250g","sort_order":29,"category_slugs":["desert"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/14.png"}'::jsonb),
  ('portie-clatite', 'Portie clatite', '200g', 21, 'RON', 'desert', true, 0, true, '/uploads/products/332-portie-clatite.png', 'Portie clatite', 0, '{"external_id":332,"short_description":"200g","sort_order":30,"category_slugs":["desert"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/15.png"}'::jsonb),
  ('meniu-crispy-l', 'Meniu Crispy  L', '5 crispy + cartofi + sos', 33, 'RON', 'meniuri', true, 0, true, '/uploads/products/341-meniu-crispy-l.png', 'Meniu Crispy  L', 0, '{"external_id":341,"short_description":"5 crispy + cartofi + sos","sort_order":31,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/10.png","attributes":[{"name":"picant","values":["nepicant","picant"]}]}'::jsonb),
  ('meniu-crispy-xl', 'Meniu Crispy  XL', '8 crispy + cartofi + sos', 45, 'RON', 'meniuri', true, 0, true, '/uploads/products/342-meniu-crispy-xl.png', 'Meniu Crispy  XL', 0, '{"external_id":342,"short_description":"8 crispy + cartofi + sos","sort_order":32,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/11.png","attributes":[{"name":"picant","values":["nepicant","picant"]}]}'::jsonb),
  ('meniu-aripioare-l', 'Meniu Aripioare  L', '6 aripioare + cartofi + sos', 29, 'RON', 'meniuri', true, 0, true, '/uploads/products/343-meniu-aripioare-l.png', 'Meniu Aripioare  L', 0, '{"external_id":343,"short_description":"6 aripioare + cartofi + sos","sort_order":33,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/8.png","attributes":[{"name":"picant","values":["nepicant","picant"]}]}'::jsonb),
  ('meniu-aripioare-xl', 'Meniu Aripioare  XL', '9 aripioare + cartofi + sos', 39, 'RON', 'meniuri', true, 0, true, '/uploads/products/344-meniu-aripioare-xl.png', 'Meniu Aripioare  XL', 0, '{"external_id":344,"short_description":"9 aripioare + cartofi + sos","sort_order":34,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/9.png","attributes":[{"name":"picant","values":["nepicant","picant"]}]}'::jsonb),
  ('meniu-snitel', 'Meniu Snitel', 'Snitel + cartofi + sos', 33, 'RON', 'meniuri', true, 0, true, '/uploads/products/345-meniu-snitel.png', 'Meniu Snitel', 0, '{"external_id":345,"short_description":"Snitel + cartofi + sos","sort_order":35,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/12.png"}'::jsonb),
  ('meniu-dublu-cheeseburger', 'Meniu Dublu Cheeseburger', 'Dublu Cheesburger + cartofi + sos + suc doză', 44, 'RON', 'meniuri', true, 0, true, '/uploads/products/346-meniu-dublu-cheeseburger.png', 'Meniu Dublu Cheeseburger', 0, '{"external_id":346,"short_description":"Dublu Cheesburger + cartofi + sos + suc doză","sort_order":36,"category_slugs":["meniuri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/03/13.png"}'::jsonb),
  ('platou-porc-pui-2-pers', 'Platou Porc - Pui (2 pers)', 'Scarita, Ceafa, Piept de pui, pulpa de pui, carnati, cartofi, muraturi', 99, 'RON', 'platouri', true, 0, true, '/uploads/products/347-platou-porc-pui-2-pers.png', 'Platou Porc - Pui (2 pers)', 0, '{"external_id":347,"short_description":"Scarita, Ceafa, Piept de pui, pulpa de pui, carnati, cartofi, muraturi","sort_order":37,"category_slugs":["platouri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/61.png"}'::jsonb),
  ('platou-porc-oaie-2-pers', 'Platou Porc - Oaie (2 pers)', 'Scarita, Ceafa, Cotlet, pastrama, carnati, cartofi, muraturi', 129, 'RON', 'platouri', true, 0, true, '/uploads/products/348-platou-porc-oaie-2-pers.png', 'Platou Porc - Oaie (2 pers)', 0, '{"external_id":348,"short_description":"Scarita, Ceafa, Cotlet, pastrama, carnati, cartofi, muraturi","sort_order":38,"category_slugs":["platouri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/64.png"}'::jsonb),
  ('platou-porc-pui-oaie-2-pers', 'Platou Porc - Pui - Oaie (2 pers)', 'Scarita, Ceafa, Cotlet, Piept de pui, pulpa de pui, pastrama, carnati, cartofi, muraturi', 149, 'RON', 'platouri', true, 0, true, null, 'Platou Porc - Pui - Oaie (2 pers)', 0, '{"external_id":349,"short_description":"Scarita, Ceafa, Cotlet, Piept de pui, pulpa de pui, pastrama, carnati, cartofi, muraturi","sort_order":39,"category_slugs":["platouri"]}'::jsonb),
  ('platou-porc-pui-4-pers', 'Platou Porc - Pui (4 pers)', 'Scarita, Ceafa, Piept de pui, pulpa de pui, carnati, cartofi, muraturi', 198, 'RON', 'platouri', true, 0, true, '/uploads/products/350-platou-porc-pui-4-pers.png', 'Platou Porc - Pui (4 pers)', 0, '{"external_id":350,"short_description":"Scarita, Ceafa, Piept de pui, pulpa de pui, carnati, cartofi, muraturi","sort_order":40,"category_slugs":["platouri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/62.png"}'::jsonb),
  ('platou-porc-oaie-4-pers', 'Platou Porc - Oaie (4 pers)', 'Scarita, Ceafa, Cotlet, pastrama, carnati, cartofi, muraturi', 258, 'RON', 'platouri', true, 0, true, '/uploads/products/351-platou-porc-oaie-4-pers.png', 'Platou Porc - Oaie (4 pers)', 0, '{"external_id":351,"short_description":"Scarita, Ceafa, Cotlet, pastrama, carnati, cartofi, muraturi","sort_order":41,"category_slugs":["platouri"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/63.png"}'::jsonb),
  ('platou-porc-pui-oaie-4-pers', 'Platou Porc - Pui - Oaie (4 pers)', 'Scarita, Ceafa, Cotlet, Piept de pui, pulpa de pui, pastrama, carnati, cartofi, muraturi', 298, 'RON', 'platouri', true, 0, true, null, 'Platou Porc - Pui - Oaie (4 pers)', 0, '{"external_id":352,"short_description":"Scarita, Ceafa, Cotlet, Piept de pui, pulpa de pui, pastrama, carnati, cartofi, muraturi","sort_order":42,"category_slugs":["platouri"]}'::jsonb),
  ('hamsii', 'Hamsii', null, 26, 'RON', 'peste', true, 0, true, '/uploads/products/353-hamsii.jpg', 'Hamsii', 0, '{"external_id":353,"sort_order":43,"category_slugs":["peste"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/hamsii.jpg","attributes":[{"name":"include","values":["lamaie","mujdei"]}]}'::jsonb),
  ('macrou', 'Macrou', null, 50, 'RON', 'peste', true, 0, true, '/uploads/products/354-macrou.jpg', 'Macrou', 0, '{"external_id":354,"sort_order":44,"category_slugs":["peste"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/macrou.jpg","attributes":[{"name":"include","values":["lamaie","mamaliga","mujdei"]}]}'::jsonb),
  ('energizant-hell', 'Energizant HELL', '330ml', 9, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1016-energizant-hell.png', 'Energizant HELL', 0, '{"external_id":1016,"short_description":"330ml","sort_order":45,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/28-2.png"}'::jsonb),
  ('energizant-red-bull', 'Energizant RED BULL', '330ml', 13, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1017-energizant-red-bull.png', 'Energizant RED BULL', 0, '{"external_id":1017,"short_description":"330ml","sort_order":46,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/29-2.png"}'::jsonb),
  ('apa-minerala', 'Apa Minerală', '500ml', 7, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1018-apa-minerala.png', 'Apa Minerală', 0, '{"external_id":1018,"short_description":"500ml","sort_order":47,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/70-1.png"}'::jsonb),
  ('apa-plata', 'Apa Plată', '750ml', 9, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1019-apa-plata.png', 'Apa Plată', 0, '{"external_id":1019,"short_description":"750ml","sort_order":48,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/71-1.png"}'::jsonb),
  ('fresh-portocale', 'Fresh Portocale', null, 15, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1020-fresh-portocale.png', 'Fresh Portocale', 0, '{"external_id":1020,"sort_order":49,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/69.png"}'::jsonb),
  ('limonada-fresh-fructul-pasiunii-menta', 'Limonadă  Fresh / Fructul pasiunii / Mentă', null, 15, 'RON', 'racoritoare', true, 0, true, '/uploads/products/1021-limonada-fresh-fructul-pasiunii-menta.png', 'Limonadă  Fresh / Fructul pasiunii / Mentă', 0, '{"external_id":1021,"sort_order":50,"category_slugs":["racoritoare"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/68.png"}'::jsonb),
  ('bere-draft-neumarkt', 'Bere DRAFT Neumarkt', null, 8, 'RON', 'bauturi-alcoolice', true, 0, true, '/uploads/products/1022-bere-draft-neumarkt.png', 'Bere DRAFT Neumarkt', 0, '{"external_id":1022,"sort_order":51,"category_slugs":["bauturi-alcoolice"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/44.png"}'::jsonb),
  ('bere-draft-ciuc', 'Bere DRAFT Ciuc', null, 9, 'RON', 'bauturi-alcoolice', true, 0, true, '/uploads/products/1023-bere-draft-ciuc.png', 'Bere DRAFT Ciuc', 0, '{"external_id":1023,"sort_order":52,"category_slugs":["bauturi-alcoolice"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/43.png"}'::jsonb),
  ('neumarkt-0-33', 'Neumarkt 0,33', null, 7, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1025-neumarkt-0-33.png', 'Neumarkt 0,33', 0, '{"external_id":1025,"sort_order":53,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/36-1.png"}'::jsonb),
  ('amstel-0-33', 'Amstel 0,33', null, 8, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1026-amstel-0-33.png', 'Amstel 0,33', 0, '{"external_id":1026,"sort_order":54,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/35-1.png"}'::jsonb),
  ('ciuc-0-33', 'Ciuc 0,33', null, 9, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1027-ciuc-0-33.png', 'Ciuc 0,33', 0, '{"external_id":1027,"sort_order":55,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/34-2.png"}'::jsonb),
  ('heineken-0-33', 'Heineken 0,33', null, 12, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1028-heineken-0-33.png', 'Heineken 0,33', 0, '{"external_id":1028,"sort_order":56,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/65.png"}'::jsonb),
  ('corona-0-33', 'Corona 0,33', null, 12, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1029-corona-0-33.png', 'Corona 0,33', 0, '{"external_id":1029,"sort_order":57,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/33-2.png"}'::jsonb),
  ('birra-moretti-0-33', 'Birra Moretti 0,33', null, 10, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1030-birra-moretti-0-33.png', 'Birra Moretti 0,33', 0, '{"external_id":1030,"sort_order":58,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/31-2.png"}'::jsonb),
  ('birra-moretti-0-alcool-0-33', 'Birra Moretti 0% Alcool 0,33', null, 10, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1031-birra-moretti-0-alcool-0-33.png', 'Birra Moretti 0% Alcool 0,33', 0, '{"external_id":1031,"sort_order":59,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/32-2.png"}'::jsonb),
  ('ciuc-radler-0-5', 'Ciuc Radler 0,5', null, 9, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1032-ciuc-radler-0-5.png', 'Ciuc Radler 0,5', 0, '{"external_id":1032,"sort_order":60,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/30-2.png"}'::jsonb),
  ('heineken-0-alcool-0-33', 'Heineken 0% Alcool 0,33', null, 12, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1033-heineken-0-alcool-0-33.png', 'Heineken 0% Alcool 0,33', 0, '{"external_id":1033,"sort_order":61,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/27-1.png"}'::jsonb),
  ('strongbow', 'Strongbow', null, 10, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1034-strongbow.png', 'Strongbow', 0, '{"external_id":1034,"sort_order":62,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/26-1.png"}'::jsonb),
  ('captain-morgan-havana', 'Captain Morgan / Havana', '50ml', 9, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1035-captain-morgan-havana.png', 'Captain Morgan / Havana', 0, '{"external_id":1035,"short_description":"50ml","sort_order":63,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/22-1.png"}'::jsonb),
  ('bumbu', 'Bumbu', '50ml', 20, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1036-bumbu.png', 'Bumbu', 0, '{"external_id":1036,"short_description":"50ml","sort_order":64,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/21.png"}'::jsonb),
  ('vodka-absolut-finlandia', 'Vodka Absolut / Finlandia', '50ml', 8, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1037-vodka-absolut-finlandia.png', 'Vodka Absolut / Finlandia', 0, '{"external_id":1037,"short_description":"50ml","sort_order":65,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/19.png"}'::jsonb),
  ('vodka-stalinskaya', 'Vodka Stalinskaya', '50ml', 7, 'RON', '1-metru-de-bere', true, 0, true, null, 'Vodka Stalinskaya', 0, '{"external_id":1038,"short_description":"50ml","sort_order":66,"category_slugs":["1-metru-de-bere"]}'::jsonb),
  ('coniac-alexandrion-metaxa', 'Coniac Alexandrion / Metaxa', '50ml', 8, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1039-coniac-alexandrion-metaxa.png', 'Coniac Alexandrion / Metaxa', 0, '{"external_id":1039,"short_description":"50ml","sort_order":67,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/17.png"}'::jsonb),
  ('judvei-vin-ars', 'Judvei Vin Ars', '50ml', 11, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1040-judvei-vin-ars.png', 'Judvei Vin Ars', 0, '{"external_id":1040,"short_description":"50ml","sort_order":68,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/15.png"}'::jsonb),
  ('palinca', 'Pălincă', '50ml', 7, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1042-palinca.png', 'Pălincă', 0, '{"external_id":1042,"short_description":"50ml","sort_order":69,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/14.png"}'::jsonb),
  ('gin-wembley', 'Gin Wembley', '50ml', 8, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1043-gin-wembley.png', 'Gin Wembley', 0, '{"external_id":1043,"short_description":"50ml","sort_order":70,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/13-1.png"}'::jsonb),
  ('jack-daniels', 'Jack Daniels', '50ml', 13, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1044-jack-daniels.png', 'Jack Daniels', 0, '{"external_id":1044,"short_description":"50ml","sort_order":71,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/12-2.png"}'::jsonb),
  ('j-b', 'J&B', '50ml', 9, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1045-j-b.png', 'J&B', 0, '{"external_id":1045,"short_description":"50ml","sort_order":72,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/11-2.png"}'::jsonb),
  ('red-label', 'Red Label', '50ml', 11, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1046-red-label.png', 'Red Label', 0, '{"external_id":1046,"short_description":"50ml","sort_order":73,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/10-1.png"}'::jsonb),
  ('jagermeister', 'Jagermeister', '50ml', 10, 'RON', '1-metru-de-bere', true, 0, true, '/uploads/products/1047-jagermeister.png', 'Jagermeister', 0, '{"external_id":1047,"short_description":"50ml","sort_order":74,"category_slugs":["1-metru-de-bere"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/9-2.png"}'::jsonb),
  ('castel-huniade-alb-rose', 'Castel Huniade Alb/Rose', '750ml', 50, 'RON', 'vin', true, 0, true, '/uploads/products/1048-castel-huniade-alb-rose.png', 'Castel Huniade Alb/Rose', 0, '{"external_id":1048,"short_description":"750ml","sort_order":75,"category_slugs":["vin"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/7-4.png"}'::jsonb),
  ('purcari-alb-rose', 'Purcari Alb/Rose', '750ml', 70, 'RON', 'vin', true, 0, true, '/uploads/products/1049-purcari-alb-rose.png', 'Purcari Alb/Rose', 0, '{"external_id":1049,"short_description":"750ml","sort_order":76,"category_slugs":["vin"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/5-4.png"}'::jsonb),
  ('muse', 'Muse', '750ml', 135, 'RON', 'vin', true, 0, true, '/uploads/products/1050-muse.png', 'Muse', 0, '{"external_id":1050,"short_description":"750ml","sort_order":77,"category_slugs":["vin"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/4-4.png"}'::jsonb),
  ('espresso-espresso-lung-americano-ristretto', 'Espresso /Espresso lung / Americano / Ristretto', null, 7, 'RON', 'cafea', true, 0, true, '/uploads/products/1051-espresso-espresso-lung-americano-ristretto.png', 'Espresso /Espresso lung / Americano / Ristretto', 0, '{"external_id":1051,"sort_order":78,"category_slugs":["cafea"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/1-3.png"}'::jsonb),
  ('cafee-latte', 'Cafee Latte', null, 9, 'RON', 'cafea', true, 0, true, '/uploads/products/1052-cafee-latte.png', 'Cafee Latte', 0, '{"external_id":1052,"sort_order":79,"category_slugs":["cafea"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/37.png"}'::jsonb),
  ('capuccino', 'Capuccino', null, 11, 'RON', 'cafea', true, 0, true, '/uploads/products/1053-capuccino.png', 'Capuccino', 0, '{"external_id":1053,"sort_order":80,"category_slugs":["cafea"],"legacy_image_url":"https://micinegoesti.ro/wp-content/uploads/2026/02/4.png"}'::jsonb);

insert into public.categories (slug, name, sort_order, is_active)
select slug, name, sort_order, is_active
from _migrate_categories
on conflict (slug) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.products (
  slug, name, description, price, currency, category_id, in_stock, stock_qty, is_active, metadata
)
select
  p.slug,
  p.name,
  p.description,
  p.price,
  p.currency,
  c.id,
  p.in_stock,
  p.stock_qty,
  p.is_active,
  p.metadata
from _migrate_products p
left join public.categories c on c.slug = p.category_slug
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  currency = excluded.currency,
  category_id = excluded.category_id,
  in_stock = excluded.in_stock,
  stock_qty = excluded.stock_qty,
  is_active = excluded.is_active,
  metadata = excluded.metadata;

delete from public.product_images pi
using public.products p
join _migrate_products mp on mp.slug = p.slug
where pi.product_id = p.id;

insert into public.product_images (product_id, url, alt, sort_order)
select
  p.id,
  mp.image_url,
  coalesce(mp.image_alt, mp.name),
  mp.image_sort
from _migrate_products mp
join public.products p on p.slug = mp.slug
where mp.image_url is not null and mp.image_url <> '';

commit;
