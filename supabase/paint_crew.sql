-- ── The paint PM's painters ──────────────────────────────────────────────────
-- Applied after sub_role.sql, sub_photos.sql and sub_job_sheet.sql (idempotent).
--
-- The paint PM adds their painters from inside the paint app. Each painter
-- gets their own login to the sub app, where they see only the paint jobs the
-- paint PM put them on: the address, the colors, the open touch-ups and the
-- job checklist. They send the daily photos and move their job along. No
-- prices, no other jobs.
--
-- How it's stored (so everything the sub app already does keeps working):
--   subcontractors   one record per company marked data.paintCrew; its
--                    data.crew = [{ name, email, phone, userId }] is the list
--                    of painters. link_sub_login() (sub_role.sql) puts a
--                    painter's login on their entry when they sign up.
--   sub_tasks        one per painter per job, marked data.paint, with the
--                    painter as its crew member (crewUserId). Several
--                    painters on a job = several of these.
--
-- The paint PM can't read subcontractors (staff-only), so the list comes from
-- paint_crew() and invites from create_paint_crew_invite().

-- 1. The list of painters
create or replace function public.paint_crew() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); s public.subcontractors;
begin
  if my_org is null or public.auth_role() not in ('paint','pm','office','admin') then
    raise exception 'Only the paint PM or the office can see the painters' using errcode = '42501';
  end if;
  select * into s from public.subcontractors
    where org_id = my_org and deleted_at is null and coalesce((data->>'paintCrew')::boolean, false) order by created_at limit 1;
  if not found then return jsonb_build_object('id', null, 'crew', '[]'::jsonb); end if;
  return jsonb_build_object('id', s.id, 'name', s.data->>'name',
    'crew', coalesce((select jsonb_agg(jsonb_build_object('name', c->>'name', 'email', c->>'email', 'phone', c->>'phone', 'userId', c->>'userId'))
                      from jsonb_array_elements(case when jsonb_typeof(s.data->'crew') = 'array' then s.data->'crew' else '[]'::jsonb end) c), '[]'::jsonb));
end $$;
revoke all on function public.paint_crew() from public, anon;
grant execute on function public.paint_crew() to authenticated;

-- 2. Add a painter: puts them on the list and makes a one-time invite link
create or replace function public.create_paint_crew_invite(p_email text, p_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); e text := lower(trim(p_email)); n text := nullif(trim(p_name), ''); ph text := nullif(trim(coalesce(p_phone, '')), '');
  s public.subcontractors; sid text; c text; r public.org_invites;
begin
  if my_org is null or public.auth_role() not in ('paint','office','admin') then
    raise exception 'Only the paint PM or the office can add a painter' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if n is null then raise exception 'Enter their name' using errcode = '22023'; end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = my_org and lower(u.email) = e) then
    raise exception 'That email already has an account' using errcode = '23505';
  end if;
  select * into s from public.subcontractors
    where org_id = my_org and deleted_at is null and coalesce((data->>'paintCrew')::boolean, false) order by created_at limit 1 for update;
  if not found then
    sid := public.reserve_ids()::text;
    insert into public.subcontractors (id, org_id, data)
    values (sid, my_org, jsonb_build_object('id', sid::bigint, 'name', 'Paint crew', 'trade', 'Painting', 'paintCrew', true, 'hasCrew', true,
                                            'active', true, 'crew', '[]'::jsonb, 'createdAt', now()));
  else
    sid := s.id;
  end if;
  update public.subcontractors set data = jsonb_set(data, '{crew}',
      (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(data->'crew') = 'array' then data->'crew' else '[]'::jsonb end) x
        where lower(x->>'email') <> e)
      || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('name', n, 'email', e, 'phone', ph, 'invitedAt', now()))))
    where org_id = my_org and id = sid;
  c := replace(gen_random_uuid()::text, '-', '');
  insert into public.org_invites (code, org_id, email, role, display_name, invited_by)
  values (c, my_org, e, 'sub', n, auth.uid())
  returning * into r;
  return jsonb_build_object('code', r.code, 'email', r.email, 'display_name', r.display_name, 'expires_at', r.expires_at, 'crewId', sid);
end $$;
revoke all on function public.create_paint_crew_invite(text, text, text) from public, anon;
grant execute on function public.create_paint_crew_invite(text, text, text) to authenticated;

-- 3. Paint jobs for painters: the paint PM books, changes and removes them
drop policy if exists sub_tasks_paint_all on public.sub_tasks;
create policy sub_tasks_paint_all on public.sub_tasks for all
  using (org_id = auth_org() and auth_role() = 'paint' and coalesce((data->>'paint')::boolean, false))
  with check (org_id = auth_org() and auth_role() = 'paint' and coalesce((data->>'paint')::boolean, false));

-- 4. Their photos: the paint PM sees (and can add to) the photos on paint jobs
create or replace function public.paint_task_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sub_tasks t
    where t.org_id = public.auth_org()
      and t.org_id::text = split_part(p_name, '/', 1)
      and t.id = split_part(p_name, '/', 2)
      and coalesce((t.data->>'paint')::boolean, false)
      and t.deleted_at is null
  )
$$;
revoke all on function public.paint_task_path(text) from public, anon;
grant execute on function public.paint_task_path(text) to authenticated;

drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);

drop policy if exists job_photos_add on storage.objects;
create policy job_photos_add on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);

-- 5. What a painter needs to know about the job: the colors, the notes for
--    the painter and the open touch-ups, next to the electrical answers and
--    the checklist the sub app already gets (with the dates set for stages
--    still to come, so a sub can see when their part is due). Still no prices.
create or replace function public.sub_job_sheet(p_task_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); t public.sub_tasks; p public.proposals; d jsonb; vals jsonb; jd jsonb; pt jsonb;
begin
  if my_org is null or r is null then return null; end if;
  select * into t from public.sub_tasks where org_id = my_org and id = p_task_id and deleted_at is null;
  if not found then return null; end if;
  if r = 'sub' and t.owner_id is distinct from auth.uid() and t.crew_id is distinct from auth.uid() then return null; end if;
  if r = 'paint' and not coalesce((t.data->>'paint')::boolean, false) then return null; end if;
  select * into p from public.proposals where org_id = my_org and id = (t.data->>'proposalId') and deleted_at is null;
  if not found then return null; end if;
  d := coalesce(p.data->'contractDraft', '{}'::jsonb);
  jd := case when jsonb_typeof(p.data->'jobData') = 'object' then p.data->'jobData' else '{}'::jsonb end;
  pt := case when jsonb_typeof(jd->'paint') = 'object' then jd->'paint' else '{}'::jsonb end;
  vals := case when jsonb_typeof(d->'dp'->'values') = 'object' then d->'dp'->'values' else '{}'::jsonb end;
  return jsonb_build_object(
    'electrical', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(vals) where key like 'elecQty\_%' or key like 'elecOther%'),
    'completedStages', coalesce(jd->'completedStages', '[]'::jsonb),
    'stageDates', case when jsonb_typeof(jd->'stageDates') = 'object' then jd->'stageDates' else '{}'::jsonb end,
    'projectTypeOverride', jd->'projectTypeOverride',
    'projectTypes', coalesce(d->'projectTypes', '[]'::jsonb),
    'hasWindows', (coalesce(d->'scopeBullets', '[]'::jsonb)::text || coalesce(d->'scopeLines', '[]'::jsonb)::text) ~* 'window|glass|enclos',
    'paint', case when coalesce((t.data->>'paint')::boolean, false) then jsonb_build_object(
        'colors', coalesce(pt->'colors', '[]'::jsonb), 'product', pt->'product', 'color', pt->'color', 'sheen', pt->'sheen', 'areas', pt->'areas',
        'notes', pt->'notes', 'date', jd->'stageDates'->'paint',
        'touchUps', coalesce((select jsonb_agg(jsonb_build_object('text', x->>'text'))
                              from jsonb_array_elements(case when jsonb_typeof(jd->'touchUps') = 'array' then jd->'touchUps' else '[]'::jsonb end) x
                              where not coalesce((x->>'done')::boolean, false)), '[]'::jsonb))
      else null end
  );
end $$;
revoke all on function public.sub_job_sheet(text) from public, anon;
grant execute on function public.sub_job_sheet(text) to authenticated;
