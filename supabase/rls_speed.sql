-- ── Access rules checked once per request, not once per row ─────────────────
-- Applied LAST, after every other file (idempotent: safe to re-run; re-run it
-- after re-running any file that creates policies).
--
-- The row-level rules ask "which company is this person in, what is their
-- role, may they see job money" through auth_org(), auth_role(), auth_can()
-- and auth.uid(). Written bare, Postgres runs those lookups again for every
-- row it reads: opening the app re-asked them about 20,000 times (5,800
-- purchases, 3,000 invoices and 1,700 proposals, once per page), which was
-- most of the load time. Wrapped as (select …) the answer is worked out once
-- per request and reused for every row.
--
-- This changes how the rules are evaluated, not what they allow: each call is
-- replaced by a sub-select of the very same call. None of them depends on the
-- row, so the answer is the same.
do $$
declare p record; new_using text; new_check text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ 'auth_role\(\)|auth_org\(\)|auth\.uid\(\)|auth_can\('
      and coalesce(qual, '') || ' ' || coalesce(with_check, '') !~* 'select\s+(public\.)?auth'   -- already done
  loop
    new_using := regexp_replace(regexp_replace(regexp_replace(regexp_replace(p.qual,
      'auth_can\((''[a-z_.]+''::text)\)', '(select public.auth_can(\1))', 'g'),
      'auth_role\(\)', '(select public.auth_role())', 'g'),
      'auth_org\(\)',  '(select public.auth_org())', 'g'),
      'auth\.uid\(\)', '(select auth.uid())', 'g');
    new_check := regexp_replace(regexp_replace(regexp_replace(regexp_replace(p.with_check,
      'auth_can\((''[a-z_.]+''::text)\)', '(select public.auth_can(\1))', 'g'),
      'auth_role\(\)', '(select public.auth_role())', 'g'),
      'auth_org\(\)',  '(select public.auth_org())', 'g'),
      'auth\.uid\(\)', '(select auth.uid())', 'g');
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || case when new_using is not null then format(' using (%s)', new_using) else '' end
      || case when new_check is not null then format(' with check (%s)', new_check) else '' end;
  end loop;
end $$;
