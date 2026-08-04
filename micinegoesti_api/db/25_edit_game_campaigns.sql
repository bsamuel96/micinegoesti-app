-- Run after 24_game_campaigns.sql.
--
-- Allows administrators to adjust every editable campaign setting, including
-- the start/end time that drives the public countdown. Finished and cancelled
-- campaigns remain immutable so already-awarded vouchers cannot be rewritten.

begin;

create or replace function public.update_game_campaign(
  p_campaign_id uuid,
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

  select *
  into v_campaign
  from public.game_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Campania nu există.';
  end if;

  if v_campaign.status in ('finished', 'cancelled') then
    raise exception 'O campanie finalizată sau anulată nu mai poate fi modificată.';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'Finalul campaniei trebuie să fie după început.';
  end if;

  update public.game_campaigns
  set name = btrim(p_name),
      status = case
        when p_ends_at <= now() then status
        when p_starts_at <= now() then 'active'
        else 'scheduled'
      end,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      first_prize_percent = p_first_prize_percent,
      second_prize_percent = p_second_prize_percent,
      third_prize_percent = p_third_prize_percent,
      maximum_discount = p_maximum_discount,
      minimum_subtotal = p_minimum_subtotal,
      validity_days = p_validity_days,
      code_prefix = p_code_prefix
  where id = p_campaign_id
  returning * into v_campaign;

  if p_ends_at <= now() then
    perform public.finalize_game_campaign(
      p_campaign_id,
      p_actor_user_id
    );

    select *
    into v_campaign
    from public.game_campaigns
    where id = p_campaign_id;
  end if;

  return v_campaign;
end;
$$;

revoke all on function public.update_game_campaign(
  uuid,
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

grant execute on function public.update_game_campaign(
  uuid,
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

commit;

notify pgrst, 'reload schema';
