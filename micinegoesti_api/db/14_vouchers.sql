-- Run after 13_product_images_storage_and_delivery.sql.
-- Adds voucher rules, issued vouchers, redemptions, atomic game-record rewards,
-- and checkout-time voucher redemption.

begin;

create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.voucher_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null check (trigger_type in ('manual', 'game_record')),
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount >= 0),
  minimum_subtotal numeric(12,2) not null default 0 check (minimum_subtotal >= 0),
  validity_days integer check (validity_days is null or validity_days > 0),
  code_prefix text not null default 'MICI' check (code_prefix ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  requires_approval boolean not null default true,
  is_active boolean not null default false,
  created_by_user_id text references public.users(id) on delete set null,
  updated_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voucher_rules_game_record_requires_approval
    check (trigger_type <> 'game_record' or requires_approval = true)
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.voucher_rules(id) on delete set null,
  code text not null check (code = upper(btrim(code)) and code ~ '^[A-Z0-9][A-Z0-9-]{3,39}$'),
  name text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'active', 'redeemed', 'revoked', 'expired')),
  source_type text not null check (source_type in ('manual', 'game_record')),
  user_id text references public.users(id) on delete set null,
  session_key text,
  game_score_id uuid references public.game_scores(id) on delete set null,
  source_score integer check (source_score is null or source_score >= 0),
  previous_record_score integer check (previous_record_score is null or previous_record_score >= 0),
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount >= 0),
  minimum_subtotal numeric(12,2) not null default 0 check (minimum_subtotal >= 0),
  valid_from timestamptz not null default now(),
  expires_at timestamptz,
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  created_by_user_id text references public.users(id) on delete set null,
  approved_by_user_id text references public.users(id) on delete set null,
  approved_at timestamptz,
  revoked_by_user_id text references public.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid references public.vouchers(id) on delete set null,
  order_id bigint not null references public.orders(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  voucher_code text not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_amount numeric(12,2) not null check (discount_amount >= 0),
  delivery_cost numeric(12,2) not null check (delivery_cost >= 0),
  final_total numeric(12,2) not null check (final_total >= 0),
  redeemed_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists voucher_id uuid references public.vouchers(id) on delete set null;
alter table public.orders
  add column if not exists voucher_code text;
alter table public.orders
  add column if not exists discount_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_discount_amount_nonnegative'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_discount_amount_nonnegative check (discount_amount >= 0);
  end if;
end;
$$;

create unique index if not exists idx_voucher_rules_one_active_game_record
on public.voucher_rules(trigger_type)
where trigger_type = 'game_record' and is_active = true;

create unique index if not exists idx_vouchers_code_upper
on public.vouchers(upper(code));

create unique index if not exists idx_vouchers_game_record_event
on public.vouchers(rule_id, game_score_id, source_score)
where source_type = 'game_record' and rule_id is not null and game_score_id is not null and source_score is not null;

create unique index if not exists idx_voucher_redemptions_order
on public.voucher_redemptions(order_id);

create index if not exists idx_audit_logs_actor_created_at on public.audit_logs(actor_user_id, created_at desc);
create index if not exists idx_voucher_rules_trigger_active on public.voucher_rules(trigger_type, is_active);
create index if not exists idx_vouchers_status on public.vouchers(status);
create index if not exists idx_vouchers_source_type on public.vouchers(source_type);
create index if not exists idx_vouchers_user_id on public.vouchers(user_id);
create index if not exists idx_vouchers_session_key on public.vouchers(session_key);
create index if not exists idx_vouchers_validity on public.vouchers(valid_from, expires_at);
create index if not exists idx_voucher_redemptions_voucher on public.voucher_redemptions(voucher_id, redeemed_at desc);
create index if not exists idx_orders_voucher_id on public.orders(voucher_id);

drop trigger if exists trg_audit_logs_updated_at on public.audit_logs;
drop trigger if exists trg_voucher_rules_updated_at on public.voucher_rules;
create trigger trg_voucher_rules_updated_at
before update on public.voucher_rules
for each row execute function public.set_updated_at();

drop trigger if exists trg_vouchers_updated_at on public.vouchers;
create trigger trg_vouchers_updated_at
before update on public.vouchers
for each row execute function public.set_updated_at();

alter table public.audit_logs enable row level security;
alter table public.voucher_rules enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;

drop policy if exists "Service role manages audit logs" on public.audit_logs;
create policy "Service role manages audit logs"
on public.audit_logs
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages voucher rules" on public.voucher_rules;
create policy "Service role manages voucher rules"
on public.voucher_rules
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages vouchers" on public.vouchers;
create policy "Service role manages vouchers"
on public.vouchers
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages voucher redemptions" on public.voucher_redemptions;
create policy "Service role manages voucher redemptions"
on public.voucher_redemptions
for all to service_role using (true) with check (true);

create or replace function public.normalize_voucher_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(btrim(coalesce(p_code, '')));
$$;

create or replace function public.voucher_discount_amount(
  p_discount_type text,
  p_discount_value numeric,
  p_maximum_discount numeric,
  p_minimum_subtotal numeric,
  p_subtotal numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_discount numeric(12,2) := 0;
begin
  if round(coalesce(p_subtotal, 0), 2) < round(coalesce(p_minimum_subtotal, 0), 2) then
    return 0;
  end if;

  if p_discount_type = 'percentage' then
    v_discount := round(greatest(0, coalesce(p_subtotal, 0)) * greatest(0, coalesce(p_discount_value, 0)) / 100, 2);
    if p_maximum_discount is not null then
      v_discount := least(v_discount, round(greatest(0, p_maximum_discount), 2));
    end if;
  elsif p_discount_type = 'fixed_amount' then
    v_discount := round(greatest(0, coalesce(p_discount_value, 0)), 2);
  else
    raise exception 'Tipul voucherului nu este valid.';
  end if;

  return round(least(v_discount, greatest(0, coalesce(p_subtotal, 0))), 2);
end;
$$;

create or replace function public.generate_voucher_code(p_prefix text default 'MICI')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text := regexp_replace(
    upper(coalesce(nullif(btrim(p_prefix), ''), 'MICI')),
    '[^A-Z0-9-]',
    '',
    'g'
  );
  v_code text;
begin
  if length(v_prefix) < 2 then
    v_prefix := 'MICI';
  end if;
  v_prefix := left(v_prefix, 16);

  loop
    v_code := v_prefix || '-' || upper(
      substr(
        replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        1,
        10
      )
    );
    exit when not exists (select 1 from public.vouchers where upper(code) = v_code);
  end loop;

  return v_code;
end;
$$;

create or replace function public.issue_game_record_voucher(
  p_rule_id uuid,
  p_game_score_id uuid,
  p_user_id text,
  p_session_key text,
  p_source_score integer,
  p_previous_record_score integer,
  p_created_by_user_id text default null
)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule public.voucher_rules%rowtype;
  v_voucher public.vouchers%rowtype;
  v_status text;
begin
  select * into v_rule
  from public.voucher_rules
  where id = p_rule_id and trigger_type = 'game_record' and is_active = true;

  if not found then
    raise exception 'Regula de voucher pentru record nu este activă.';
  end if;

  v_status := 'pending';

  insert into public.vouchers (
    rule_id,
    code,
    name,
    description,
    status,
    source_type,
    user_id,
    session_key,
    game_score_id,
    source_score,
    previous_record_score,
    discount_type,
    discount_value,
    maximum_discount,
    minimum_subtotal,
    valid_from,
    expires_at,
    max_redemptions,
    created_by_user_id,
    approved_by_user_id,
    approved_at
  )
  values (
    v_rule.id,
    public.generate_voucher_code(v_rule.code_prefix),
    v_rule.name,
    'Voucher emis pentru recordul all-time la Aventura Micului.',
    v_status,
    'game_record',
    p_user_id,
    case when p_user_id is null then p_session_key else null end,
    p_game_score_id,
    p_source_score,
    p_previous_record_score,
    v_rule.discount_type,
    v_rule.discount_value,
    v_rule.maximum_discount,
    v_rule.minimum_subtotal,
    now(),
    case when v_rule.validity_days is null then null else now() + make_interval(days => v_rule.validity_days) end,
    1,
    p_created_by_user_id,
    case when v_status = 'active' then p_created_by_user_id else null end,
    case when v_status = 'active' then now() else null end
  )
  on conflict (rule_id, game_score_id, source_score)
    where source_type = 'game_record' and rule_id is not null and game_score_id is not null and source_score is not null
  do nothing
  returning * into v_voucher;

  if v_voucher.id is null then
    select * into v_voucher
    from public.vouchers
    where rule_id = v_rule.id
      and game_score_id = p_game_score_id
      and source_score = p_source_score
      and source_type = 'game_record'
    limit 1;
  end if;

  return v_voucher;
end;
$$;

create or replace function public.save_game_score_with_reward(
  p_session_key text,
  p_user_id text,
  p_score integer,
  p_player_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_record_score integer := 0;
  v_user_score public.game_scores%rowtype;
  v_session_score public.game_scores%rowtype;
  v_current public.game_scores%rowtype;
  v_saved public.game_scores%rowtype;
  v_rule_id uuid;
  v_reward public.vouchers%rowtype;
  v_player_name text;
  v_best_score integer;
  v_session_can_be_claimed boolean;
  v_is_new_global_record boolean := false;
begin
  if p_session_key is null or length(btrim(p_session_key)) < 8 then
    raise exception 'Sesiunea jocului nu este validă.';
  end if;
  if p_score < 0 then
    raise exception 'Scorul nu este valid.';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.game_scores.global_record_reward'));

  select coalesce(max(best_score), 0) into v_previous_record_score
  from public.game_scores;

  if p_user_id is not null then
    update public.vouchers
    set user_id = p_user_id,
        session_key = null
    where user_id is null
      and session_key = p_session_key
      and status in ('pending', 'active')
      and redemption_count = 0;

    select * into v_user_score
    from public.game_scores
    where user_id = p_user_id;
  end if;

  select * into v_session_score
  from public.game_scores
  where session_key = p_session_key;

  v_session_can_be_claimed := v_session_score.id is null or p_user_id is null or v_session_score.user_id is null or v_session_score.user_id = p_user_id;
  if v_user_score.id is not null then
    v_current := v_user_score;
  elsif v_session_can_be_claimed and v_session_score.id is not null then
    v_current := v_session_score;
  else
    v_current := null;
  end if;
  v_best_score := greatest(coalesce(v_user_score.best_score, 0), case when v_session_can_be_claimed then coalesce(v_session_score.best_score, 0) else 0 end, p_score);
  v_player_name := upper(left(regexp_replace(coalesce(nullif(p_player_name, ''), v_current.player_name, 'MIC'), '[^[:alpha:]]', '', 'g'), 5));

  if v_player_name = '' then
    v_player_name := 'MIC';
  end if;

  if v_user_score.id is not null and v_session_score.id is not null and v_session_can_be_claimed and v_session_score.id <> v_user_score.id then
    update public.vouchers
    set game_score_id = v_user_score.id,
        user_id = p_user_id,
        session_key = null
    where game_score_id = v_session_score.id
      and user_id is null
      and status in ('pending', 'active')
      and redemption_count = 0;

    delete from public.game_scores where id = v_session_score.id;
    v_current := v_user_score;
  end if;

  if v_current.id is not null then
    update public.game_scores
    set session_key = case when v_session_can_be_claimed then p_session_key else v_current.session_key end,
        user_id = p_user_id,
        player_name = v_player_name,
        best_score = v_best_score
    where id = v_current.id
    returning * into v_saved;
  else
    insert into public.game_scores (session_key, user_id, player_name, best_score)
    values (p_session_key, p_user_id, v_player_name, v_best_score)
    returning * into v_saved;
  end if;

  v_is_new_global_record := p_score > v_previous_record_score;

  if v_is_new_global_record then
    select id into v_rule_id
    from public.voucher_rules
    where trigger_type = 'game_record'
      and is_active = true
    order by updated_at desc
    limit 1;

    if v_rule_id is not null then
      v_reward := public.issue_game_record_voucher(
        v_rule_id,
        v_saved.id,
        p_user_id,
        p_session_key,
        p_score,
        v_previous_record_score,
        null
      );
    end if;
  end if;

  return jsonb_build_object(
    'id', v_saved.id,
    'bestScore', v_saved.best_score,
    'playerName', v_saved.player_name,
    'isNewGlobalRecord', v_is_new_global_record,
    'reward', case when v_reward.id is null then null else jsonb_build_object(
      'id', v_reward.id,
      'status', v_reward.status,
      'code', case when v_reward.status = 'active' then v_reward.code else null end,
      'discountType', v_reward.discount_type,
      'discountValue', v_reward.discount_value,
      'maximumDiscount', v_reward.maximum_discount,
      'minimumSubtotal', v_reward.minimum_subtotal,
      'expiresAt', v_reward.expires_at,
      'message', case
        when v_reward.status = 'active' then 'Felicitări! Ai primit un voucher pentru noul record.'
        else 'Felicitări! Voucherul pentru record așteaptă aprobarea administratorului.'
      end
    ) end
  );
end;
$$;

create or replace function public.issue_current_game_record_voucher(p_admin_user_id text)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule_id uuid;
  v_score public.game_scores%rowtype;
  v_reward public.vouchers%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('public.game_scores.global_record_reward'));

  select id into v_rule_id
  from public.voucher_rules
  where trigger_type = 'game_record'
    and is_active = true
  order by updated_at desc
  limit 1;

  if v_rule_id is null then
    raise exception 'Nu există o regulă activă pentru voucherul de record.';
  end if;

  select * into v_score
  from public.game_scores
  order by best_score desc, updated_at asc
  limit 1;

  if v_score.id is null or v_score.best_score <= 0 then
    raise exception 'Nu există încă un record eligibil.';
  end if;

  v_reward := public.issue_game_record_voucher(
    v_rule_id,
    v_score.id,
    v_score.user_id,
    v_score.session_key,
    v_score.best_score,
    null,
    p_admin_user_id
  );

  return v_reward;
end;
$$;

drop function if exists public.create_checkout_order(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  numeric,
  numeric,
  numeric,
  text,
  text,
  jsonb,
  uuid,
  text,
  jsonb
);

create or replace function public.create_checkout_order(
  p_order_key_hash text,
  p_user_id text,
  p_contact_name text,
  p_phone text,
  p_address text,
  p_order_type text,
  p_delivery_zone_id text,
  p_map_pin_lat double precision,
  p_map_pin_lng double precision,
  p_subtotal numeric,
  p_delivery_cost numeric,
  p_total numeric,
  p_notes text,
  p_whatsapp_message text,
  p_items jsonb,
  p_cart_id uuid default null,
  p_last_session_key text default null,
  p_last_items jsonb default '[]'::jsonb,
  p_voucher_code text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_code text := public.normalize_voucher_code(p_voucher_code);
  v_voucher public.vouchers%rowtype;
  v_discount numeric(12,2) := 0;
  v_final_total numeric(12,2);
  v_next_redemption_count integer;
begin
  if v_code <> '' then
    select * into v_voucher
    from public.vouchers
    where upper(code) = v_code
    for update;

    if v_voucher.id is null then
      raise exception 'Voucherul nu a fost găsit.';
    end if;
    if v_voucher.status = 'pending' then
      raise exception 'Voucherul așteaptă aprobarea administratorului.';
    end if;
    if v_voucher.status in ('revoked', 'expired') then
      raise exception 'Voucherul nu mai este activ.';
    end if;
    if v_voucher.status = 'redeemed' or v_voucher.redemption_count >= v_voucher.max_redemptions then
      raise exception 'Voucherul a fost deja folosit.';
    end if;
    if v_voucher.status <> 'active' then
      raise exception 'Voucherul nu este activ.';
    end if;
    if now() < v_voucher.valid_from then
      raise exception 'Voucherul nu este încă activ.';
    end if;
    if v_voucher.expires_at is not null and now() > v_voucher.expires_at then
      raise exception 'Voucherul a expirat.';
    end if;
    if v_voucher.user_id is not null and v_voucher.user_id <> p_user_id then
      raise exception 'Voucherul aparține altui client.';
    end if;
    if v_voucher.user_id is null and v_voucher.session_key is not null and coalesce(p_last_session_key, '') <> v_voucher.session_key then
      raise exception 'Voucherul aparține altei sesiuni.';
    end if;
    if round(p_subtotal, 2) < round(v_voucher.minimum_subtotal, 2) then
      raise exception 'Subtotalul minim pentru voucher nu a fost atins.';
    end if;

    v_discount := public.voucher_discount_amount(
      v_voucher.discount_type,
      v_voucher.discount_value,
      v_voucher.maximum_discount,
      v_voucher.minimum_subtotal,
      p_subtotal
    );
  end if;

  v_final_total := round(greatest(0, p_subtotal - v_discount) + greatest(0, p_delivery_cost), 2);

  insert into public.orders (
    order_key_hash,
    user_id,
    assigned_deliverer_id,
    contact_name,
    phone,
    address,
    order_type,
    delivery_zone_id,
    map_pin_lat,
    map_pin_lng,
    subtotal,
    delivery_cost,
    total,
    voucher_id,
    voucher_code,
    discount_amount,
    notes,
    whatsapp_message
  )
  values (
    p_order_key_hash,
    p_user_id,
    null,
    p_contact_name,
    p_phone,
    p_address,
    p_order_type,
    p_delivery_zone_id,
    p_map_pin_lat,
    p_map_pin_lng,
    round(p_subtotal, 2),
    round(p_delivery_cost, 2),
    v_final_total,
    v_voucher.id,
    case when v_voucher.id is null then null else v_voucher.code end,
    v_discount,
    p_notes,
    p_whatsapp_message
  )
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, name, quantity, unit_price, total_price)
  select
    v_order_id,
    nullif(item->>'product_id', '')::uuid,
    item->>'name',
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    (item->>'total_price')::numeric
  from jsonb_array_elements(p_items) as item;

  insert into public.order_status_history (order_id, to_status, note)
  values (v_order_id, 'pending', 'Comandă plasată online');

  insert into public.payments (order_id, amount, method, status)
  values (v_order_id, v_final_total, 'cash', 'unpaid');

  if v_voucher.id is not null then
    insert into public.voucher_redemptions (
      voucher_id,
      order_id,
      user_id,
      voucher_code,
      subtotal,
      discount_amount,
      delivery_cost,
      final_total
    )
    values (
      v_voucher.id,
      v_order_id,
      p_user_id,
      v_voucher.code,
      round(p_subtotal, 2),
      v_discount,
      round(p_delivery_cost, 2),
      v_final_total
    );

    v_next_redemption_count := v_voucher.redemption_count + 1;

    update public.vouchers
    set redemption_count = v_next_redemption_count,
        status = case when v_next_redemption_count >= max_redemptions then 'redeemed' else status end,
        user_id = coalesce(user_id, p_user_id),
        session_key = case when user_id is null and p_user_id is not null then null else session_key end
    where id = v_voucher.id;
  end if;

  if p_last_session_key is not null then
    insert into public.last_orders (session_key, user_id, items)
    values (p_last_session_key, p_user_id, p_last_items)
    on conflict (session_key) do update set
      user_id = excluded.user_id,
      items = excluded.items,
      updated_at = now();
  end if;

  if p_cart_id is not null then
    delete from public.app_cart_items where cart_id = p_cart_id;
  end if;

  return v_order_id;
end;
$$;

grant execute on function public.normalize_voucher_code(text) to service_role;
grant execute on function public.voucher_discount_amount(text, numeric, numeric, numeric, numeric) to service_role;
grant execute on function public.generate_voucher_code(text) to service_role;
grant execute on function public.issue_game_record_voucher(uuid, uuid, text, text, integer, integer, text) to service_role;
grant execute on function public.save_game_score_with_reward(text, text, integer, text) to service_role;
grant execute on function public.issue_current_game_record_voucher(text) to service_role;

grant execute on function public.create_checkout_order(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  numeric,
  numeric,
  numeric,
  text,
  text,
  jsonb,
  uuid,
  text,
  jsonb,
  text
) to service_role;

commit;
