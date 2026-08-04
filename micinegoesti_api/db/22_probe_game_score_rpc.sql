-- Run this one statement in the production Supabase SQL Editor.
-- It executes the positive-score and voucher path, captures the exact error,
-- and always rolls back. No score or voucher is saved.

do $diagnostic$
declare
  v_user public.users%rowtype;
  v_test_score integer;
  v_result jsonb;
  v_state text;
  v_message text;
  v_detail text;
  v_hint text;
  v_constraint text;
  v_table text;
  v_column text;
begin
  select *
  into strict v_user
  from public.users
  where id = 'c67919cc-b681-41d9-b93f-d450e8b983dc';

  select greatest(coalesce(max(best_score), 0) + 1, 1)
  into v_test_score
  from public.game_scores;

  begin
    select public.save_game_score_with_reward(
      'mdn-rpc-probe-session-20260728',
      v_user.id,
      v_test_score,
      v_user.name
    )
    into v_result;

    raise exception using
      errcode = 'P0001',
      message = '__MDN_RPC_PROBE_SUCCESS_ROLLBACK__';
  exception
    when others then
      get stacked diagnostics
        v_state = returned_sqlstate,
        v_message = message_text,
        v_detail = pg_exception_detail,
        v_hint = pg_exception_hint,
        v_constraint = constraint_name,
        v_table = table_name,
        v_column = column_name;

      if v_state = 'P0001'
        and v_message = '__MDN_RPC_PROBE_SUCCESS_ROLLBACK__' then
        raise exception using
          errcode = 'P0001',
          message = format(
            'MDN PROBE SUCCESS: positive score %s and its voucher were created, then rolled back. Result: %s',
            v_test_score,
            v_result
          );
      end if;

      raise exception using
        errcode = 'P0001',
        message = format(
          'MDN PROBE FAILURE | SQLSTATE=%s | MESSAGE=%s | CONSTRAINT=%s | TABLE=%s | COLUMN=%s',
          coalesce(v_state, ''),
          coalesce(v_message, ''),
          coalesce(v_constraint, ''),
          coalesce(v_table, ''),
          coalesce(v_column, '')
        ),
        detail = coalesce(nullif(v_detail, ''), 'none'),
        hint = coalesce(nullif(v_hint, ''), 'none');
  end;
end;
$diagnostic$;
