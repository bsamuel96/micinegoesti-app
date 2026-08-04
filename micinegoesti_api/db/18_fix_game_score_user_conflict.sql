-- Run once after migration 17 if saving a score fails with PostgreSQL 42P10:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Safe repair: does not delete or update scores, users, or vouchers.

begin;

create unique index if not exists idx_game_scores_user_id_account_unique
on public.game_scores(user_id);

commit;

-- Refresh the Supabase PostgREST schema cache.
notify pgrst, 'reload schema';
