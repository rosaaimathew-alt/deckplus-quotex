-- ── Inspections on a job → the Deck Plus PM on it ───────────────────────────
-- Who hears about an inspection on a job (api/_notify.js, kind
-- 'job_inspection'): the job's PM, when the office (or the county check run
-- from the office's screen) records a result, or an inspection is scheduled
-- or moved. Not the PM's own changes. The caller sends only the job's id; the
-- alert's wording is worked out from the job's own inspections, which this
-- returns (trimmed to what the alert needs), never from the caller.
create or replace function public.job_inspection_targets(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  my_org uuid := public.auth_org(); r text := public.auth_role(); uid uuid := auth.uid();
  me public.org_members; pm public.org_members; job public.proposals; who jsonb := '[]'::jsonb;
begin
  if my_org is null or uid is null or r is null or r not in ('pm', 'office', 'admin') then return null; end if;
  select * into me from public.org_members where org_id = my_org and user_id = uid;
  select * into job from public.proposals where org_id = my_org and id::text = p_id and deleted_at is null;
  if not found then return null; end if;
  select * into pm from public.org_members where org_id = my_org and user_id = job.pm_id and role not in ('sub', 'paint');
  if pm.user_id is not null and pm.user_id <> uid and coalesce(pm.email, '') <> '' then
    who := jsonb_build_array(jsonb_build_object('name', pm.display_name, 'email', pm.email, 'phone', pm.phone));
  end if;
  return jsonb_build_object(
    'kind', 'job_inspection',
    'by', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email),
    'sender', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email, 'phone', me.phone),
    'senderIsStaff', true,
    'job', jsonb_build_object('id', job.id, 'client', job.data->>'client', 'address', job.data->>'address',
      'permits', (select coalesce(jsonb_agg(jsonb_build_object(
          'record', pp->>'record',
          'upcoming', (select coalesce(jsonb_agg(jsonb_build_object('id', u->>'id', 'code', u->>'code', 'name', u->>'name', 'date', u->>'date')), '[]'::jsonb)
                       from jsonb_array_elements(case when jsonb_typeof(pp->'upcoming') = 'array' then pp->'upcoming' else '[]'::jsonb end) u),
          'completed', (select coalesce(jsonb_agg(jsonb_build_object('id', c->>'id', 'code', c->>'code', 'name', c->>'name', 'date', c->>'date', 'result', c->>'result')), '[]'::jsonb)
                        from jsonb_array_elements(case when jsonb_typeof(pp->'completed') = 'array' then pp->'completed' else '[]'::jsonb end) c))), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(job.data->'countyPermit'->'permits') = 'array' then job.data->'countyPermit'->'permits' else '[]'::jsonb end) pp),
      'office', (select coalesce(jsonb_agg(jsonb_build_object('id', o->>'id', 'code', o->>'code', 'name', o->>'name', 'date', o->>'date', 'result', o->>'result')), '[]'::jsonb)
        from jsonb_array_elements(case when jsonb_typeof(job.data->'jobData'->'officeInspections') = 'array' then job.data->'jobData'->'officeInspections' else '[]'::jsonb end) o)),
    'recipients', who);
end $$;
revoke all on function public.job_inspection_targets(text) from public, anon;
grant execute on function public.job_inspection_targets(text) to authenticated;
