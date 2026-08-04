-- Run after 23_fix_voucher_code_generation.sql.
--
-- Adds timed game campaigns with separate leaderboards and three prizes:
-- first place, second place, and third place. The existing instant-record
-- reward remains available through game_reward_settings.mode.

begin;

create table if not exists public.game_reward_settings (
  id boolean primary key default true check (id = true),
  mode text not null default 'instant_record'
    check (mode in ('campaign', 'instant_record')),
  updated_by_user_id text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.game_reward_settings (id, mode)
values (true, 'instant_record')
on conflict (id) do nothing;

create table if not exists public.game_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'finished', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  first_prize_percent numeric(5,2) not null default 15
    check (first_prize_percent > 0 and first_prize_percent <= 100),
  second_prize_percent numeric(5,2) not null default 10
    check (second_prize_percent > 0 and second_prize_percent <= 100),
  third_prize_percent numeric(5,2) not null default 5
    check (third_prize_percent > 0 and third_prize_percent <= 100),
  maximum_discount numeric(12,2)
    check (maximum_discount is null or maximum_discount >= 0),
  minimum_subtotal numeric(12,2) not null default 0
    check (minimum_subtotal >= 0),
  validity_days integer check (validity_days is null or validity_days > 0),
  code_prefix text not null default 'CAMPANIE'
    check (code_prefix ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  created_by_user_id text references public.users(id) on delete set null,
  finished_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_campaigns_time_range_check check (ends_at > starts_at),
  constraint game_campaigns_prize_order_check check (
    first_prize_percent >= second_prize_percent
    and second_prize_percent >= third_prize_percent
  )
);

create unique index if not exists idx_game_campaigns_one_live
on public.game_campaigns ((true))
where status in ('scheduled', 'active');

create index if not exists idx_game_campaigns_status_time
on public.game_campaigns(status, starts_at, ends_at);

create table if not exists public.game_campaign_scores (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.game_campaigns(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  player_name text not null
    check (
      player_name = btrim(player_name)
      and char_length(player_name) > 0
    ),
  best_score integer not null check (best_score > 0),
  best_score_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, user_id)
);

alter table public.game_campaign_scores
add column if not exists best_score_at timestamptz not null default now();

create index if not exists idx_game_campaign_scores_rank
on public.game_campaign_scores(
  campaign_id,
  best_score desc,
  best_score_at asc
);

alter table public.vouchers
add column if not exists campaign_id uuid
references public.game_campaigns(id) on delete set null;

alter table public.vouchers
add column if not exists campaign_score_id uuid
references public.game_campaign_scores(id) on delete set null;

alter table public.vouchers
add column if not exists campaign_rank smallint;

alter table public.vouchers
drop constraint if exists vouchers_campaign_rank_check;

alter table public.vouchers
add constraint vouchers_campaign_rank_check
check (campaign_rank is null or campaign_rank between 1 and 3);

alter table public.vouchers
drop constraint if exists vouchers_source_type_check;

alter table public.vouchers
add constraint vouchers_source_type_check
check (source_type in ('manual', 'game_record', 'game_campaign'));

create unique index if not exists idx_vouchers_game_campaign_rank
on public.vouchers(campaign_id, campaign_rank)
where source_type = 'game_campaign'
  and campaign_id is not null
  and campaign_rank is not null;

drop trigger if exists trg_game_reward_settings_updated_at
on public.game_reward_settings;
create trigger trg_game_reward_settings_updated_at
before update on public.game_reward_settings
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_campaigns_updated_at
on public.game_campaigns;
create trigger trg_game_campaigns_updated_at
before update on public.game_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists trg_game_campaign_scores_updated_at
on public.game_campaign_scores;
create trigger trg_game_campaign_scores_updated_at
before update on public.game_campaign_scores
for each row execute function public.set_updated_at();

alter table public.game_reward_settings enable row level security;
alter table public.game_campaigns enable row level security;
alter table public.game_campaign_scores enable row level security;

drop policy if exists "Service role manages game reward settings"
on public.game_reward_settings;
create policy "Service role manages game reward settings"
on public.game_reward_settings
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages game campaigns"
on public.game_campaigns;
create policy "Service role manages game campaigns"
on public.game_campaigns
for all to service_role using (true) with check (true);

drop policy if exists "Service role manages game campaign scores"
on public.game_campaign_scores;
create policy "Service role manages game campaign scores"
on public.game_campaign_scores
for all to service_role using (true) with check (true);

create or replace function public.save_game_campaign_score(
  p_user_id text,
  p_score integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text;
  v_campaign public.game_campaigns%rowtype;
  v_user public.users%rowtype;
  v_saved public.game_campaign_scores%rowtype;
  v_player_name text;
begin
  if p_user_id is null then
    raise exception 'Autentifică-te pentru a salva scorul.';
  end if;

  if p_score is null or p_score <= 0 then
    raise exception 'Scorul trebuie să fie mai mare decât 0.';
  end if;

  select mode
  into v_mode
  from public.game_reward_settings
  where id = true;

  if coalesce(v_mode, 'instant_record') <> 'campaign' then
    raise exception 'Modul campanie nu este activ.';
  end if;

  select *
  into v_campaign
  from public.game_campaigns
  where status in ('scheduled', 'active')
    and starts_at <= now()
    and ends_at > now()
  order by starts_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Nu există o campanie activă în acest moment.';
  end if;

  if v_campaign.status = 'scheduled' then
    update public.game_campaigns
    set status = 'active'
    where id = v_campaign.id;
  end if;

  select *
  into v_user
  from public.users
  where id = p_user_id
    and "isActive" = true;

  if not found then
    raise exception 'Contul utilizatorului nu există sau nu este activ.';
  end if;

  v_player_name := public.customer_first_name(v_user.name);
  if v_player_name is null then
    raise exception 'Completează numele contului înainte de a salva scorul.';
  end if;

  insert into public.game_campaign_scores (
    campaign_id,
    user_id,
    player_name,
    best_score
  )
  values (
    v_campaign.id,
    v_user.id,
    v_player_name,
    p_score
  )
  on conflict (campaign_id, user_id)
  do update
  set player_name = excluded.player_name,
      best_score = greatest(
        public.game_campaign_scores.best_score,
        excluded.best_score
      ),
      best_score_at = case
        when excluded.best_score > public.game_campaign_scores.best_score
          then now()
        else public.game_campaign_scores.best_score_at
      end
  returning * into v_saved;

  return jsonb_build_object(
    'bestScore', v_saved.best_score,
    'playerName', v_saved.player_name,
    'isNewGlobalRecord', false,
    'reward', null,
    'campaign', jsonb_build_object(
      'id', v_campaign.id,
      'name', v_campaign.name,
      'startsAt', v_campaign.starts_at,
      'endsAt', v_campaign.ends_at,
      'status', 'active'
    )
  );
end;
$$;

create or replace function public.finalize_game_campaign(
  p_campaign_id uuid,
  p_actor_user_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.game_campaigns%rowtype;
  v_winner record;
  v_discount numeric(5,2);
  v_issued_count integer := 0;
begin
  select *
  into v_campaign
  from public.game_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campania nu există.';
  end if;

  if v_campaign.status = 'cancelled' then
    raise exception 'Campania este anulată.';
  end if;

  if v_campaign.ends_at > now() then
    raise exception 'Campania nu s-a încheiat încă.';
  end if;

  if v_campaign.status = 'finished' then
    return jsonb_build_object(
      'campaignId', v_campaign.id,
      'status', 'finished',
      'issuedCount', (
        select count(*)
        from public.vouchers
        where campaign_id = v_campaign.id
          and source_type = 'game_campaign'
      )
    );
  end if;

  for v_winner in
    select
      ranked.id,
      ranked.user_id,
      ranked.player_name,
      ranked.best_score,
      ranked.rank
    from (
      select
        score.*,
        row_number() over (
          order by score.best_score desc, score.best_score_at asc
        ) as rank
      from public.game_campaign_scores score
      where score.campaign_id = v_campaign.id
    ) ranked
    where ranked.rank <= 3
    order by ranked.rank
  loop
    v_discount := case v_winner.rank
      when 1 then v_campaign.first_prize_percent
      when 2 then v_campaign.second_prize_percent
      else v_campaign.third_prize_percent
    end;

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
      campaign_id,
      campaign_score_id,
      campaign_rank,
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
      null,
      public.generate_voucher_code(v_campaign.code_prefix),
      v_campaign.name || ' - Locul ' || v_winner.rank,
      'Premiu acordat la finalul campaniei de joc.',
      'pending',
      'game_campaign',
      v_winner.user_id,
      null,
      null,
      v_campaign.id,
      v_winner.id,
      v_winner.rank,
      v_winner.best_score,
      null,
      'percentage',
      v_discount,
      v_campaign.maximum_discount,
      v_campaign.minimum_subtotal,
      now(),
      case
        when v_campaign.validity_days is null then null
        else now() + make_interval(days => v_campaign.validity_days)
      end,
      1,
      p_actor_user_id,
      null,
      null
    )
    on conflict (campaign_id, campaign_rank)
      where source_type = 'game_campaign'
        and campaign_id is not null
        and campaign_rank is not null
    do nothing;

    if found then
      v_issued_count := v_issued_count + 1;
    end if;
  end loop;

  update public.game_campaigns
  set status = 'finished',
      finished_at = coalesce(finished_at, now())
  where id = v_campaign.id;

  return jsonb_build_object(
    'campaignId', v_campaign.id,
    'status', 'finished',
    'issuedCount', v_issued_count
  );
end;
$$;

create or replace function public.finalize_due_game_campaigns()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign_id uuid;
  v_count integer := 0;
begin
  for v_campaign_id in
    select id
    from public.game_campaigns
    where status in ('scheduled', 'active')
      and ends_at <= now()
    order by ends_at
  loop
    perform public.finalize_game_campaign(v_campaign_id, null);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.create_game_campaign(
  p_name text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_first_prize_percent numeric,
  p_second_prize_percent numeric,
  p_third_prize_percent numeric,
  p_maximum_discount numeric,
  p_minimum_subtotal numeric,
  p_validity_days integer,
  p_code_prefix text,
  p_actor_user_id text
)
returns public.game_campaigns
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.game_campaigns%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtext('public.game_campaigns.admin')
  );
  perform public.finalize_due_game_campaigns();

  if p_ends_at <= now() then
    raise exception 'Data de final trebuie să fie în viitor.';
  end if;

  if exists (
    select 1
    from public.game_campaigns
    where status in ('scheduled', 'active')
  ) then
    raise exception 'Există deja o campanie programată sau activă.';
  end if;

  insert into public.game_campaigns (
    name,
    status,
    starts_at,
    ends_at,
    first_prize_percent,
    second_prize_percent,
    third_prize_percent,
    maximum_discount,
    minimum_subtotal,
    validity_days,
    code_prefix,
    created_by_user_id
  )
  values (
    btrim(p_name),
    case when p_starts_at <= now() then 'active' else 'scheduled' end,
    p_starts_at,
    p_ends_at,
    p_first_prize_percent,
    p_second_prize_percent,
    p_third_prize_percent,
    p_maximum_discount,
    p_minimum_subtotal,
    p_validity_days,
    p_code_prefix,
    p_actor_user_id
  )
  returning * into v_campaign;

  update public.game_reward_settings
  set mode = 'campaign',
      updated_by_user_id = p_actor_user_id
  where id = true;

  return v_campaign;
end;
$$;

create or replace function public.cancel_game_campaign(
  p_campaign_id uuid,
  p_actor_user_id text
)
returns public.game_campaigns
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_campaign public.game_campaigns%rowtype;
begin
  update public.game_campaigns
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_campaign_id
    and status in ('scheduled', 'active')
  returning * into v_campaign;

  if v_campaign.id is null then
    raise exception 'Campania nu poate fi anulată.';
  end if;

  return v_campaign;
end;
$$;

create or replace function public.set_game_reward_mode(
  p_mode text,
  p_actor_user_id text
)
returns public.game_reward_settings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_settings public.game_reward_settings%rowtype;
begin
  if p_mode not in ('campaign', 'instant_record') then
    raise exception 'Modul de recompensă nu este valid.';
  end if;

  perform public.finalize_due_game_campaigns();

  if p_mode = 'instant_record'
    and exists (
      select 1
      from public.game_campaigns
      where status in ('scheduled', 'active')
    ) then
    raise exception 'Anulează sau finalizează campania curentă înainte de a activa recordul instant.';
  end if;

  update public.game_reward_settings
  set mode = p_mode,
      updated_by_user_id = p_actor_user_id
  where id = true
  returning * into v_settings;

  return v_settings;
end;
$$;

create or replace function public.sync_game_score_customer_first_name()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.name is distinct from old.name then
    update public.game_scores
    set player_name = public.customer_first_name(new.name)
    where user_id = new.id;

    update public.game_campaign_scores
    set player_name = public.customer_first_name(new.name)
    where user_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.save_game_campaign_score(text, integer)
from public;
revoke all on function public.finalize_game_campaign(uuid, text)
from public;
revoke all on function public.finalize_due_game_campaigns()
from public;
revoke all on function public.create_game_campaign(
  text,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  text,
  text
) from public;
revoke all on function public.cancel_game_campaign(uuid, text)
from public;
revoke all on function public.set_game_reward_mode(text, text)
from public;

grant execute on function public.save_game_campaign_score(text, integer)
to service_role;
grant execute on function public.finalize_game_campaign(uuid, text)
to service_role;
grant execute on function public.finalize_due_game_campaigns()
to service_role;
grant execute on function public.create_game_campaign(
  text,
  timestamptz,
  timestamptz,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  text,
  text
) to service_role;
grant execute on function public.cancel_game_campaign(uuid, text)
to service_role;
grant execute on function public.set_game_reward_mode(text, text)
to service_role;

commit;

notify pgrst, 'reload schema';
