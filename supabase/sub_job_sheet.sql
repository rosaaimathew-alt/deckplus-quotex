-- ── What a sub may know about the job a task is on ───────────────────────────
-- Applied after sub_role.sql (idempotent).
--
-- A sub's login can't read proposals (prices, contract, customer contact).
-- The sub app still needs two things from the job a task is on:
--
--   electrical   the Electrical Specifications answers on the job's contract
--                (quantities of the printed items and the write-in lines),
--                so the electricians know what to install
--   checklist    which of the job's stages the PM has ticked off, so they
--                can see when their part is coming
--
-- This hands back exactly that and nothing else: no prices, no totals, no
-- contract text, no other contact details. Only for a task that is the
-- caller's own (booked with their login, or one their company's PM put them
-- on). Staff may call it too.

create or replace function public.sub_job_sheet(p_task_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); t public.sub_tasks; p public.proposals; d jsonb; vals jsonb;
begin
  if my_org is null or r is null or r = 'paint' then return null; end if;
  select * into t from public.sub_tasks where org_id = my_org and id = p_task_id and deleted_at is null;
  if not found then return null; end if;
  if r = 'sub' and t.owner_id is distinct from auth.uid() and t.crew_id is distinct from auth.uid() then return null; end if;
  select * into p from public.proposals where org_id = my_org and id = (t.data->>'proposalId') and deleted_at is null;
  if not found then return null; end if;
  d := coalesce(p.data->'contractDraft', '{}'::jsonb);
  vals := case when jsonb_typeof(d->'dp'->'values') = 'object' then d->'dp'->'values' else '{}'::jsonb end;
  return jsonb_build_object(
    'electrical', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(vals) where key like 'elecQty\_%' or key like 'elecOther%'),
    'completedStages', coalesce(p.data->'jobData'->'completedStages', '[]'::jsonb),
    'projectTypeOverride', p.data->'jobData'->'projectTypeOverride',
    'projectTypes', coalesce(d->'projectTypes', '[]'::jsonb),
    'hasWindows', (coalesce(d->'scopeBullets', '[]'::jsonb)::text || coalesce(d->'scopeLines', '[]'::jsonb)::text) ~* 'window|glass|enclos'
  );
end $$;
revoke all on function public.sub_job_sheet(text) from public, anon;
grant execute on function public.sub_job_sheet(text) to authenticated;
