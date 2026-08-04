-- Read-only Supabase game-score state report.
-- Run this single SELECT in the production Supabase SQL Editor and paste the
-- one JSON result back into the conversation.

select jsonb_pretty(
  jsonb_build_object(
    'generatedAt', now(),
    'databaseVersion', current_setting('server_version'),

    'quickChecks', jsonb_build_object(
      'sessionKeyIsNullable', coalesce((
        select c.is_nullable = 'YES'
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = 'game_scores'
          and c.column_name = 'session_key'
      ), false),
      'fullUserUniqueIndexExists', exists (
        select 1
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'game_scores'
          and i.indexdef ilike 'CREATE UNIQUE INDEX%'
          and i.indexdef ilike '%(user_id)%'
          and i.indexdef not ilike '% WHERE %'
      ),
      'positiveScoreConstraintExists', exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.game_scores'::regclass
          and c.contype = 'c'
          and regexp_replace(
            pg_get_constraintdef(c.oid),
            '[[:space:]()]',
            '',
            'g'
          ) ilike '%best_score>0%'
      ),
      'voucherEventUniqueIndexExists', exists (
        select 1
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename = 'vouchers'
          and i.indexname = 'idx_vouchers_game_record_event'
          and i.indexdef ilike 'CREATE UNIQUE INDEX%'
      ),
      'activeGameRecordRuleCount', (
        select count(*)
        from public.voucher_rules r
        where r.trigger_type = 'game_record'
          and r.is_active = true
      ),
      'targetAdminIsActiveAndNamed', exists (
        select 1
        from public.users u
        where u.id = 'c67919cc-b681-41d9-b93f-d450e8b983dc'
          and u."isActive" = true
          and nullif(btrim(u.name), '') is not null
      )
    ),

    'targetAdmin', coalesce((
      select jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'role', u.role,
        'isActive', u."isActive"
      )
      from public.users u
      where u.id = 'c67919cc-b681-41d9-b93f-d450e8b983dc'
      limit 1
    ), 'null'::jsonb),

    'gameState', (
      select jsonb_build_object(
        'savedScoreCount', count(*),
        'zeroOrNegativeScoreCount', count(*) filter (
          where s.best_score <= 0
        ),
        'globalBestScore', coalesce(max(s.best_score), 0)
      )
      from public.game_scores s
    ),

    'topScores', coalesce((
      select jsonb_agg(to_jsonb(top_score))
      from (
        select
          s.id,
          s.user_id as "userId",
          s.player_name as "playerName",
          s.best_score as "bestScore",
          s.updated_at as "updatedAt"
        from public.game_scores s
        order by s.best_score desc, s.updated_at asc
        limit 10
      ) top_score
    ), '[]'::jsonb),

    'gameRecordVoucherRules', coalesce((
      select jsonb_agg(to_jsonb(rule_state))
      from (
        select
          r.id,
          r.name,
          r.trigger_type as "triggerType",
          r.is_active as "isActive",
          r.requires_approval as "requiresApproval",
          r.discount_type as "discountType",
          r.discount_value as "discountValue",
          r.validity_days as "validityDays",
          r.code_prefix as "codePrefix"
        from public.voucher_rules r
        where r.trigger_type = 'game_record'
        order by r.is_active desc, r.updated_at desc
      ) rule_state
    ), '[]'::jsonb),

    'gameRecordVoucherState', (
      select jsonb_build_object(
        'count', count(*),
        'pending', count(*) filter (where v.status = 'pending'),
        'active', count(*) filter (where v.status = 'active'),
        'redeemed', count(*) filter (where v.status = 'redeemed')
      )
      from public.vouchers v
      where v.source_type = 'game_record'
    ),

    'relevantColumns', coalesce((
      select jsonb_agg(to_jsonb(column_state))
      from (
        select
          c.table_name as "table",
          c.column_name as "column",
          c.data_type as "type",
          c.is_nullable as "nullable",
          c.column_default as "default"
        from information_schema.columns c
        where c.table_schema = 'public'
          and (
            (
              c.table_name = 'game_scores'
              and c.column_name in (
                'id',
                'session_key',
                'user_id',
                'player_name',
                'best_score'
              )
            )
            or (
              c.table_name = 'vouchers'
              and c.column_name in (
                'id',
                'rule_id',
                'user_id',
                'session_key',
                'game_score_id',
                'source_score',
                'status',
                'source_type'
              )
            )
          )
        order by c.table_name, c.ordinal_position
      ) column_state
    ), '[]'::jsonb),

    'relevantConstraints', coalesce((
      select jsonb_agg(to_jsonb(constraint_state))
      from (
        select
          c.conrelid::regclass::text as "table",
          c.conname as "name",
          c.contype::text as "type",
          pg_get_constraintdef(c.oid) as "definition"
        from pg_constraint c
        where c.conrelid in (
          'public.game_scores'::regclass,
          'public.vouchers'::regclass,
          'public.voucher_rules'::regclass
        )
        order by c.conrelid::regclass::text, c.conname
      ) constraint_state
    ), '[]'::jsonb),

    'relevantIndexes', coalesce((
      select jsonb_agg(to_jsonb(index_state))
      from (
        select
          i.tablename as "table",
          i.indexname as "name",
          i.indexdef as "definition"
        from pg_indexes i
        where i.schemaname = 'public'
          and i.tablename in (
            'game_scores',
            'vouchers',
            'voucher_rules'
          )
        order by i.tablename, i.indexname
      ) index_state
    ), '[]'::jsonb),

    'gameScoreTriggers', coalesce((
      select jsonb_agg(to_jsonb(trigger_state))
      from (
        select
          t.tgname as "name",
          t.tgenabled::text as "enabled",
          pg_get_triggerdef(t.oid) as "definition"
        from pg_trigger t
        where t.tgrelid = 'public.game_scores'::regclass
          and not t.tgisinternal
        order by t.tgname
      ) trigger_state
    ), '[]'::jsonb),

    'relevantFunctions', coalesce((
      select jsonb_agg(to_jsonb(function_state))
      from (
        select
          p.oid::regprocedure::text as "signature",
          p.prosecdef as "securityDefiner"
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'customer_first_name',
            'set_game_score_customer_first_name',
            'issue_game_record_voucher',
            'save_game_score_with_reward'
          )
        order by p.oid::regprocedure::text
      ) function_state
    ), '[]'::jsonb)
  )
) as supabase_game_score_state;
