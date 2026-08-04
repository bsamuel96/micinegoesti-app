-- Run once if saving a score fails with PostgreSQL 23502:
-- null value in column "session_key" violates not-null constraint.
--
-- Account-owned scores intentionally use user_id and keep session_key null.
-- Safe repair: preserves every score, user, and voucher row.

begin;

alter table public.game_scores
alter column session_key drop not null;

commit;

notify pgrst, 'reload schema';
