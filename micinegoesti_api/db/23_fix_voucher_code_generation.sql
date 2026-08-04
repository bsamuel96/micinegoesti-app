-- Fixes PostgreSQL 42883 from generate_voucher_code():
-- function gen_random_bytes(integer) does not exist.
--
-- Supabase commonly installs pgcrypto outside the function's restricted
-- search_path. PostgreSQL 17 provides gen_random_uuid() in pg_catalog, so this
-- implementation is independent of the extension schema.

begin;

create or replace function public.generate_voucher_code(
  p_prefix text default 'MICI'
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prefix text := regexp_replace(
    upper(
      coalesce(nullif(btrim(p_prefix), ''), 'MICI')
    ),
    '[^A-Z0-9-]',
    '',
    'g'
  );
  v_code text;
begin
  if length(v_prefix) < 2 then
    v_prefix := 'MICI';
  end if;

  v_prefix := left(v_prefix, 16);

  loop
    v_code := v_prefix || '-' || upper(
      substr(
        replace(pg_catalog.gen_random_uuid()::text, '-', ''),
        1,
        10
      )
    );

    exit when not exists (
      select 1
      from public.vouchers
      where upper(code) = v_code
    );
  end loop;

  return v_code;
end;
$$;

grant execute on function public.generate_voucher_code(text)
to service_role;

commit;

notify pgrst, 'reload schema';
