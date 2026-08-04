-- Run after 14_vouchers.sql.
-- Game scores originate in the browser, so game-record vouchers must always
-- remain pending until an administrator reviews and approves them.

begin;

update public.voucher_rules
set requires_approval = true
where trigger_type = 'game_record'
  and requires_approval = false;

update public.vouchers
set status = 'pending',
    approved_by_user_id = null,
    approved_at = null
where source_type = 'game_record'
  and status = 'active'
  and redemption_count = 0
  and approved_by_user_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voucher_rules_game_record_requires_approval'
      and conrelid = 'public.voucher_rules'::regclass
  ) then
    alter table public.voucher_rules
      add constraint voucher_rules_game_record_requires_approval
      check (trigger_type <> 'game_record' or requires_approval = true);
  end if;
end;
$$;

commit;
