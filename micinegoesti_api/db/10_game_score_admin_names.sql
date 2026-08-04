-- Run after 09_orders_runtime_supabase.sql.
-- Keeps score tags compatible with the backend and reserves name edits for admin API calls.

begin;

update public.game_scores
set player_name = nullif(
  left(
    regexp_replace(
      upper(translate(coalesce(player_name, ''), 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaissttAAISSTT')),
      '[^A-Z]',
      '',
      'g'
    ),
    5
  ),
  ''
)
where player_name is not null;

alter table if exists public.game_scores
  drop constraint if exists game_scores_player_name_check;

alter table if exists public.game_scores
  add constraint game_scores_player_name_check
  check (player_name is null or player_name ~ '^[A-Z]{1,5}$');

commit;
