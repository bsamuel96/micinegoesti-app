-- Run after 06_app_state.sql if you already created the app state tables.
-- Adds account-based game score names and a top-score index.

begin;

alter table if exists public.app_carts
  alter column user_id type text using user_id::text;

alter table if exists public.last_orders
  alter column user_id type text using user_id::text;

alter table if exists public.game_scores
  alter column user_id type text using user_id::text;

alter table if exists public.game_scores
  add column if not exists player_name text;

create unique index if not exists idx_game_scores_user_id_unique
on public.game_scores(user_id)
where user_id is not null;

create index if not exists idx_game_scores_best_score
on public.game_scores(best_score desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'game_scores_player_name_check'
      and conrelid = 'public.game_scores'::regclass
  ) then
    alter table public.game_scores
      add constraint game_scores_player_name_check
      check (player_name is null or player_name ~ '^[[:alpha:]]{1,5}$');
  end if;
end;
$$;

commit;
