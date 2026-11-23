-- ── A signed job goes to its PM by the kind of work ─────────────────────────
-- The owner's rule:
--   any job that builds a new porch (on its own, or with a deck or hardscape)
--     → the new-porch PM (Bill)
--   any other mix of deck, hardscape and porch remodel (a conversion)
--     → the deck / hardscape PM (Vitoria)
-- Applied by the app (src/lib/pmAssign.js, src/store.js) and by the e-sign
-- server when the last party signs (api/sign/[token].js), only to a job with
-- no PM yet. Who is who lives in pm_rules, one row per kind of work.

create table if not exists public.pm_rules (
  org_id  uuid not null,
  kind    text not null check (kind in ('new_porch', 'other')),
  user_id uuid not null,
  primary key (org_id, kind)
);
alter table public.pm_rules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pm_rules' and policyname = 'pm_rules_read') then
    create policy pm_rules_read on public.pm_rules for select to authenticated using (org_id = (select public.auth_org()));
  end if;
end $$;

-- 'new_porch', 'other', or null when the job says nothing about its work
create or replace function public.pm_work_kind(d jsonb) returns text
language sql immutable as $$
  with t as (
    select coalesce(array_agg(lower(x)), '{}') ty from (
      select jsonb_array_elements_text(case when jsonb_typeof(d->'projectTypes') = 'array' then d->'projectTypes' else '[]' end) x
      union all select jsonb_array_elements_text(case when jsonb_typeof(d->'contractDraft'->'projectTypes') = 'array' then d->'contractDraft'->'projectTypes' else '[]' end)
      union all select jsonb_array_elements_text(case when jsonb_typeof(d->'jobData'->'projectTypeOverrides') = 'array' then d->'jobData'->'projectTypeOverrides' else '[]' end)
      union all select d->'jobData'->>'projectTypeOverride' where coalesce(d->'jobData'->>'projectTypeOverride', '') <> ''
    ) s
  ), l as (
    select coalesce(array_agg(coalesce(x->'builder'->>'tool', case when x ? 'porchBuild' then 'porchbuild' end)) filter (where x->'builder' ? 'tool' or x ? 'porchBuild'), '{}') tools
      from jsonb_array_elements(case when jsonb_typeof(d->'lines') = 'array' then d->'lines' else '[]' end) x
  )
  select case
    -- a new porch: built in the Porch Builder, or a porch type that is built new
    when 'porchbuild' = any(l.tools)
      or t.ty && array['screen porches', 'open porches', 'sunrooms', 'ground level porch', 'ground level porch + windows', 'porch over deck', 'porch over deck + windows']
      or ('eze-breeze porches' = any(t.ty) and not (t.ty && array['porch conversions', 'porch conversion']))
      then 'new_porch'
    when cardinality(t.ty) > 0 or cardinality(l.tools) > 0 then 'other'
  end
  from t, l
$$;

-- Deck Plus: new porches → Bill, everything else → Vitoria
insert into public.pm_rules (org_id, kind, user_id) values
  ('b6900cbe-924c-497a-b713-00165cd5c421', 'new_porch', '145278f7-207b-4eb3-a887-4f1ca3da835d'),
  ('b6900cbe-924c-497a-b713-00165cd5c421', 'other', '6b9782c3-3a99-4062-8e9a-ef1e20ac3d53')
on conflict (org_id, kind) do nothing;
