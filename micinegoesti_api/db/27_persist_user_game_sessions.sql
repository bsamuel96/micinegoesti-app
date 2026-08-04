-- Persist a stable game session alongside the authenticated user for both
-- instant-record and timed-campaign score saves.
-- Run after 24_game_campaigns.sql.

begin;

alter table public.game_campaign_scores
add column if not exists session_key text;

alter table public.game_campaign_scores
drop constraint if exists game_campaign_scores_session_key_check;

alter table public.game_campaign_scores
add constraint game_campaign_scores_session_key_check
check (session_key is null or length(btrim(session_key)) between 8 and 160);

create index if not exists idx_game_campaign_scores_session_key
on public.game_campaign_scores(session_key);

-- Keep deriving the leaderboard label from the account, but no longer erase
-- the browser/game session from account-owned scores.
create or replace function public.set_game_score_customer_first_name()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_first_name text;
begin
  select *
  into v_user
  from public.users
  where id = new.user_id;

  if not found then
    raise exception 'Contul utilizatorului nu există.';
  end if;

  if not v_user."isActive" then
    raise exception 'Contul utilizatorului nu este activ.';
  end if;

  v_first_name := public.customer_first_name(v_user.name);
  if v_first_name is null then
    raise exception 'Completează numele contului înainte de a salva recordul.';
  end if;

  new.player_name := v_first_name;
  return new;
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
set search_path = pg_catalog, public
as $$
declare
  v_user public.users%rowtype;
  v_previous_record_score integer := 0;
  v_saved public.game_scores%rowtype;
  v_rule_id uuid;
  v_reward public.vouchers%rowtype;
  v_player_name text;
  v_is_new_global_record boolean := false;
begin
  if p_session_key is null
    or length(btrim(p_session_key)) < 8
    or length(btrim(p_session_key)) > 160 then
    raise exception 'Sesiunea jocului nu este validă.';
  end if;

  if p_user_id is null then
    raise exception 'Autentifică-te pentru a salva scorul.';
  end if;

  if p_score is null or p_score <= 0 then
    raise exception 'Scorul trebuie să fie mai mare decât 0.';
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

  perform pg_advisory_xact_lock(
    hashtext('public.game_scores.global_record_reward')
  );

  select coalesce(max(best_score), 0)
  into v_previous_record_score
  from public.game_scores;

  -- A session belongs to the currently authenticated account. This defensive
  -- cleanup prevents a legacy/shared-browser row from violating the existing
  -- unique session_key constraint.
  update public.game_scores
  set session_key = null
  where session_key = btrim(p_session_key)
    and user_id is distinct from p_user_id;

  insert into public.game_scores (
    session_key,
    user_id,
    player_name,
    best_score
  )
  values (
    btrim(p_session_key),
    p_user_id,
    v_player_name,
    p_score
  )
  on conflict (user_id)
  do update
  set session_key = excluded.session_key,
      player_name = excluded.player_name,
      best_score = greatest(public.game_scores.best_score, excluded.best_score)
  returning * into v_saved;

  v_is_new_global_record := p_score > v_previous_record_score;

  if v_is_new_global_record then
    select id
    into v_rule_id
    from public.voucher_rules
    where trigger_type = 'game_record'
      and is_active = true
    order by updated_at desc
    limit 1;

    if v_rule_id is null then
      raise exception 'Nu există o regulă activă pentru voucherul de record.';
    end if;

    v_reward := public.issue_game_record_voucher(
      v_rule_id,
      v_saved.id,
      p_user_id,
      null,
      p_score,
      v_previous_record_score,
      null
    );
  end if;

  return jsonb_build_object(
    'id', v_saved.id,
    'bestScore', v_saved.best_score,
    'playerName', v_saved.player_name,
    'sessionId', v_saved.session_key,
    'isNewGlobalRecord', v_is_new_global_record,
    'reward', case
      when v_reward.id is null then null
      else jsonb_build_object(
        'id', v_reward.id,
        'status', v_reward.status,
        'code', case
          when v_reward.status = 'active' then v_reward.code
          else null
        end,
        'discountType', v_reward.discount_type,
        'discountValue', v_reward.discount_value,
        'maximumDiscount', v_reward.maximum_discount,
        'minimumSubtotal', v_reward.minimum_subtotal,
        'expiresAt', v_reward.expires_at,
        'message', case
          when v_reward.status = 'active'
            then 'Felicitări! Ai primit un voucher pentru noul record.'
          else 'Felicitări! Voucherul pentru record așteaptă aprobarea administratorului.'
        end
      )
    end
  );
end;
$$;

-- Keep the old two-argument campaign RPC available during a rolling deploy.
-- The API uses this overload as soon as the new backend is deployed.
create or replace function public.save_game_campaign_score(
  p_user_id text,
  p_score integer,
  p_session_key text
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

  if p_session_key is null
    or length(btrim(p_session_key)) < 8
    or length(btrim(p_session_key)) > 160 then
    raise exception 'Sesiunea jocului nu este validă.';
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
    session_key,
    player_name,
    best_score
  )
  values (
    v_campaign.id,
    v_user.id,
    btrim(p_session_key),
    v_player_name,
    p_score
  )
  on conflict (campaign_id, user_id)
  do update
  set session_key = excluded.session_key,
      player_name = excluded.player_name,
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
    'sessionId', v_saved.session_key,
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

revoke all on function public.save_game_score_with_reward(
  text,
  text,
  integer,
  text
) from public;

revoke all on function public.save_game_campaign_score(
  text,
  integer,
  text
) from public;

grant execute on function public.save_game_score_with_reward(
  text,
  text,
  integer,
  text
) to service_role;

grant execute on function public.save_game_campaign_score(
  text,
  integer,
  text
) to service_role;

commit;
