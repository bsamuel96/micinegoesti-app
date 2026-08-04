-- Run after 16_reset_game_records_and_use_customer_first_name.sql.
-- Temporarily allows every active, named user role to save game scores.
-- Scores remain account-owned; anonymous users are still rejected.

begin;

-- Some production databases were created with only the older partial unique
-- index from migration 07. The RPC's ON CONFLICT (user_id) needs an inferable
-- full unique index.
create unique index if not exists idx_game_scores_user_id_account_unique
on public.game_scores(user_id);

alter table public.game_scores
alter column session_key drop not null;

delete from public.game_scores
where best_score <= 0;

alter table public.game_scores
alter column best_score drop default;

alter table public.game_scores
drop constraint if exists game_scores_best_score_check;

alter table public.game_scores
add constraint game_scores_best_score_check
check (best_score > 0);

create or replace function public.set_game_score_customer_first_name()
returns trigger
language plpgsql
security definer
set search_path = public
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
  new.session_key := null;

  return new;
end;
$$;

-- Keep the existing RPC signature used by the API. p_player_name remains
-- intentionally ignored because the leaderboard name comes from users.name.
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
  v_user public.users%rowtype;
  v_previous_record_score integer := 0;
  v_saved public.game_scores%rowtype;
  v_rule_id uuid;
  v_reward public.vouchers%rowtype;
  v_player_name text;
  v_is_new_global_record boolean := false;
begin
  if p_session_key is null or length(btrim(p_session_key)) < 8 then
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

  insert into public.game_scores (
    session_key,
    user_id,
    player_name,
    best_score
  )
  values (
    null,
    p_user_id,
    v_player_name,
    p_score
  )
  on conflict (user_id)
  do update
  set session_key = null,
      player_name = excluded.player_name,
      best_score = greatest(game_scores.best_score, excluded.best_score)
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

grant execute on function public.save_game_score_with_reward(
  text,
  text,
  integer,
  text
) to service_role;

commit;
