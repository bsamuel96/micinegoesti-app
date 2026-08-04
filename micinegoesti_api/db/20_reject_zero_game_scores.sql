-- Run once after 19_fix_game_score_session_key_nullable.sql.
-- Removes invalid zero-score rows and guarantees that only positive scores
-- can be stored, even if the API is bypassed.

begin;

delete from public.game_scores
where best_score <= 0;

alter table public.game_scores
alter column best_score drop default;

alter table public.game_scores
drop constraint if exists game_scores_best_score_check;

alter table public.game_scores
add constraint game_scores_best_score_check
check (best_score > 0);

commit;

notify pgrst, 'reload schema';
