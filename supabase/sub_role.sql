-- ── Sub role ('sub'): a subcontractor's own phone login ─────────────────────
-- Applied after sub_tasks.sql (idempotent: safe to re-run; re-run it after
-- re-running schema.sql, books.sql or paint_role.sql, which rewrite the
-- policies below).
--
-- A sub is not staff. Their login reaches exactly this:
--   sub_tasks      read the tasks booked for them (owner_id = their login),
--                  or, as an outside company's crew member, the ones their
--                  company's PM put them on (crew_id);
--                  update only a task's status / statusDates, and add (never
--                  remove) job photos (trigger below).
--   storage        their own tasks' job photos (sub_photos.sql)
--                  No inserts, no deletes, never another sub's task.
--   org_settings   read (company name, logo, colors) — like every login
--   org_members    read — like every login (names on the team)
--   everything else  nothing: proposals, prices, contracts, catalog, subs,
--                  money tables, designs, todos, checklists, round robin.
--
-- How a login gets tied to a sub: the office presses "Invite to the sub app"
-- on the sub (Money › Vendors). create_sub_invite() saves that email on the
-- sub as data.appEmail and creates a one-time 'sub' invite. When the sub
-- claims it, link_sub_login() puts their login id on the sub (data.userId)
-- and on every task already booked for that sub (data.subUserId).

-- 1. The role itself
alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members add constraint org_members_role_check
  check (role in ('rep','pm','paint','office','admin','sub'));
alter table public.org_invites drop constraint if exists org_invites_role_check;
alter table public.org_invites add constraint org_invites_role_check
  check (role in ('rep','pm','paint','office','admin','sub'));

-- 2. Staff-only tables: the generic org-wide policies leave out paint AND sub
do $$
declare t text;
begin
  foreach t in array array['catalog_items','templates','scope_templates','payment_schedules',
                           'email_templates','subcontractors','standalone_change_orders',
                           'planned_projects','todos','checklists'] loop
    execute format('drop policy if exists %I on public.%I', t || '_org_all', t);
    execute format($p$create policy %I on public.%I for all
      using (org_id = auth_org() and auth_role() not in ('paint','sub'))
      with check (org_id = auth_org() and auth_role() not in ('paint','sub'))$p$, t || '_org_all', t);
  end loop;
end $$;

-- A to-do's owner always reaches it; a sub never owns one.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'todos' and policyname = 'todos_owner_only') then
    alter policy todos_owner_only on public.todos
      using (owner_id = auth.uid() and auth_role() is distinct from 'sub')
      with check (owner_id = auth.uid() and auth_role() is distinct from 'sub');
  end if;
end $$;

-- Proposals: select / update already list the roles that may (sub isn't one);
-- insert only left out paint.
drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for insert with check (
  org_id = auth_org()
  and auth_role() not in ('paint','sub')
  and (auth_role() in ('office','admin') or nullif(data->>'ownerId','')::uuid = auth.uid())
);

-- Saved design layouts (designs.sql)
alter policy proposal_designs_select on public.proposal_designs
  using (org_id = auth_org() and auth_role() not in ('paint','sub')
         and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id));
alter policy proposal_designs_insert on public.proposal_designs
  with check (org_id = auth_org() and auth_role() not in ('paint','sub')
              and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id));
alter policy proposal_designs_update on public.proposal_designs
  using (org_id = auth_org() and auth_role() not in ('paint','sub')
         and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id))
  with check (org_id = auth_org());

-- 3. Sub tasks: a sub reads and updates their own. An outside company with
--    its own crew (an electrical company): the task is booked with the
--    company, so its PM's login owns it (owner_id); the crew member the
--    company's PM puts on it (crew_id) sees and updates it too.
drop policy if exists sub_tasks_sub_select on public.sub_tasks;
create policy sub_tasks_sub_select on public.sub_tasks for select using (
  org_id = auth_org() and auth_role() = 'sub' and (owner_id = auth.uid() or crew_id = auth.uid()) and deleted_at is null
);
drop policy if exists sub_tasks_sub_update on public.sub_tasks;
create policy sub_tasks_sub_update on public.sub_tasks for update
  using (org_id = auth_org() and auth_role() = 'sub' and (owner_id = auth.uid() or crew_id = auth.uid()) and deleted_at is null)
  with check (org_id = auth_org() and auth_role() = 'sub' and (owner_id = auth.uid() or crew_id = auth.uid()));

-- Is p_member on the crew of the company p_lead runs?
create or replace function public.is_crew_of(p_lead uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subcontractors s, jsonb_array_elements(case when jsonb_typeof(s.data->'crew') = 'array' then s.data->'crew' else '[]'::jsonb end) c
    where s.org_id = public.auth_org() and s.deleted_at is null and coalesce((s.data->>'hasCrew')::boolean, false)
      and s.data->>'userId' = p_lead::text and c->>'userId' = p_member::text
  )
$$;
revoke all on function public.is_crew_of(uuid, uuid) from public, anon;
grant execute on function public.is_crew_of(uuid, uuid) to authenticated;

-- A sub may only move their task along (status, statusDates) and add job
-- photos: the photos list may grow, never lose an entry. The company's PM
-- (the task's owner) may also put one of their own crew on it, or take them
-- off (crewUserId / crewName); a crew member can't. The one other
-- change let through is subUserId set to the sub's own login: that's
-- link_sub_login() tying their booked tasks to them as they sign up (it runs
-- inside their claim). RLS already keeps a sub to rows that are theirs. The
-- message starts with "permission denied" so the app's write queue drops a
-- refused write instead of retrying it forever.
create or replace function public.sub_guard_task() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if auth_role() is distinct from 'sub' then return new; end if;
  if new.deleted_at is distinct from old.deleted_at or new.org_id is distinct from old.org_id or new.id is distinct from old.id then
    raise exception 'permission denied: a sub can only update the status of their own task' using errcode = '42501';
  end if;
  -- Photos are mandatory: a status change needs a photo from today (the
  -- office is in Charlotte; a day's slack covers phones in other zones).
  if (new.data->>'status') is distinct from (old.data->>'status') and not exists (
       select 1 from jsonb_array_elements(case when jsonb_typeof(new.data->'photos') = 'array' then new.data->'photos' else '[]'::jsonb end) p
       where p->>'date' >= to_char((now() at time zone 'America/New_York')::date - 1, 'YYYY-MM-DD')) then
    raise exception 'permission denied: send today''s job photos before changing the status' using errcode = '42501';
  end if;
  for k in select jsonb_object_keys(old.data || new.data) loop
    continue when (old.data->k) is not distinct from (new.data->k);
    continue when k in ('status', 'statusDates');
    continue when k = 'photos' and jsonb_typeof(new.data->k) = 'array'
      and (new.data->k) @> coalesce(case when jsonb_typeof(old.data->k) = 'array' then old.data->k end, '[]'::jsonb);
    continue when k = 'subUserId' and new.data->>k = auth.uid()::text;
    continue when k in ('crewUserId', 'crewName') and old.owner_id = auth.uid()
      and (nullif(new.data->>'crewUserId', '') is null
           or public.is_crew_of(auth.uid(), (new.data->>'crewUserId')::uuid));
    raise exception 'permission denied: a sub can only update the status of their own task' using errcode = '42501';
  end loop;
  return new;
end $$;
revoke execute on function public.sub_guard_task() from public, anon;
drop trigger if exists sub_tasks_sub_guard on public.sub_tasks;
create trigger sub_tasks_sub_guard before update on public.sub_tasks
  for each row execute function public.sub_guard_task();

-- 4. Inviting a sub (office / admin): saves the email on the sub, then a
--    one-time 'sub' invite for it.
create or replace function public.create_sub_invite(p_sub_id text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); e text := lower(trim(p_email)); s public.subcontractors; c text; r public.org_invites;
begin
  if my_org is null or public.auth_role() not in ('admin','office') then
    raise exception 'Only an admin or the office can invite a sub' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  select * into s from public.subcontractors where org_id = my_org and id = p_sub_id and deleted_at is null;
  if not found then raise exception 'That sub is not on your vendor list' using errcode = '22023'; end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = my_org and lower(u.email) = e) then
    raise exception 'That email already has an account on your team' using errcode = '23505';
  end if;
  update public.subcontractors set data = data || jsonb_build_object('appEmail', e) where org_id = my_org and id = p_sub_id;
  c := replace(gen_random_uuid()::text, '-', '');
  insert into public.org_invites (code, org_id, email, role, display_name, invited_by)
  values (c, my_org, e, 'sub', nullif(trim(s.data->>'name'), ''), auth.uid())
  returning * into r;
  return jsonb_build_object('code', r.code, 'email', r.email, 'role', r.role, 'display_name', r.display_name, 'expires_at', r.expires_at);
end $$;
revoke all on function public.create_sub_invite(text, text) from public, anon;
grant execute on function public.create_sub_invite(text, text) to authenticated;

-- 5. A 'sub' login joins the team → tie it to the sub with that app email,
--    and to every task already booked for that sub.
create or replace function public.link_sub_login() returns trigger
language plpgsql security definer set search_path = public as $$
declare e text; sid text;
begin
  if new.role is distinct from 'sub' then return new; end if;
  e := lower(coalesce(nullif(new.email, ''), (select email from auth.users where id = new.user_id)));
  if e is null then return new; end if;
  for sid in
    select id from public.subcontractors
    where org_id = new.org_id and deleted_at is null and lower(data->>'appEmail') = e
  loop
    update public.subcontractors set data = data || jsonb_build_object('userId', new.user_id)
      where org_id = new.org_id and id = sid;
    update public.sub_tasks set data = data || jsonb_build_object('subUserId', new.user_id)
      where org_id = new.org_id and data->>'subId' = sid and deleted_at is null;
  end loop;
  -- A crew member of an outside company: their login goes on their crew entry.
  update public.subcontractors s
     set data = jsonb_set(s.data, '{crew}', (
       select jsonb_agg(case when lower(c->>'email') = e then c || jsonb_build_object('userId', new.user_id) else c end)
       from jsonb_array_elements(s.data->'crew') c))
   where s.org_id = new.org_id and s.deleted_at is null and jsonb_typeof(s.data->'crew') = 'array'
     and exists (select 1 from jsonb_array_elements(s.data->'crew') c where lower(c->>'email') = e);
  return new;
end $$;
revoke execute on function public.link_sub_login() from public, anon, authenticated;
drop trigger if exists org_members_link_sub on public.org_members;
create trigger org_members_link_sub after insert or update of role, email on public.org_members
  for each row execute function public.link_sub_login();

-- 5b. An outside company's PM and their crew. The office ticks "has its own
--     crew" on the sub (data.hasCrew); the company's PM (the sub login on
--     that record) then invites their own people. Each joins as a 'sub'
--     login listed on the company (data.crew = [{ name, email, userId }]),
--     never on a task until the company's PM puts them on one.
create or replace function public.my_crew() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('hasCrew', true, 'company', s.data->>'name',
      'crew', coalesce((select jsonb_agg(jsonb_build_object('name', c->>'name', 'email', c->>'email', 'userId', c->>'userId'))
                        from jsonb_array_elements(case when jsonb_typeof(s.data->'crew') = 'array' then s.data->'crew' else '[]'::jsonb end) c), '[]'::jsonb))
    from public.subcontractors s
    where s.org_id = public.auth_org() and s.deleted_at is null and public.auth_role() = 'sub'
      and coalesce((s.data->>'hasCrew')::boolean, false) and s.data->>'userId' = auth.uid()::text
    limit 1), jsonb_build_object('hasCrew', false))
$$;
revoke all on function public.my_crew() from public, anon;
grant execute on function public.my_crew() to authenticated;

create or replace function public.create_crew_invite(p_email text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); e text := lower(trim(p_email)); n text := nullif(trim(p_name), ''); s public.subcontractors; c text; r public.org_invites;
begin
  if my_org is null or public.auth_role() is distinct from 'sub' then
    raise exception 'Only a company''s PM can invite their crew' using errcode = '42501';
  end if;
  select * into s from public.subcontractors
    where org_id = my_org and deleted_at is null and coalesce((data->>'hasCrew')::boolean, false) and data->>'userId' = auth.uid()::text limit 1;
  if not found then raise exception 'Only a company''s PM can invite their crew' using errcode = '42501'; end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if n is null then raise exception 'Enter their name' using errcode = '22023'; end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = my_org and lower(u.email) = e) then
    raise exception 'That email already has an account' using errcode = '23505';
  end if;
  update public.subcontractors set data = jsonb_set(data, '{crew}',
      (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(data->'crew') = 'array' then data->'crew' else '[]'::jsonb end) x
        where lower(x->>'email') <> e) || jsonb_build_array(jsonb_build_object('name', n, 'email', e, 'invitedAt', now())))
    where org_id = my_org and id = s.id;
  c := replace(gen_random_uuid()::text, '-', '');
  insert into public.org_invites (code, org_id, email, role, display_name, invited_by)
  values (c, my_org, e, 'sub', n, auth.uid())
  returning * into r;
  return jsonb_build_object('code', r.code, 'email', r.email, 'display_name', r.display_name, 'expires_at', r.expires_at);
end $$;
revoke all on function public.create_crew_invite(text, text) from public, anon;
grant execute on function public.create_crew_invite(text, text) to authenticated;

-- 6. Changing someone's role (Settings › Team): same rules, plus 'sub'.
create or replace function public.set_member_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.org_members; target public.org_members;
begin
  select * into me from public.org_members where user_id = auth.uid();
  if not found or me.role not in ('admin','office') then
    raise exception 'Only an admin or the office can change roles.' using errcode = '42501';
  end if;
  if p_role not in ('rep','pm','paint','office','admin','sub') then
    raise exception 'Unknown role.' using errcode = '22023';
  end if;
  select * into target from public.org_members where user_id = p_user and org_id = me.org_id;
  if not found then raise exception 'That person is not on your team.' using errcode = '42501'; end if;
  if target.user_id = me.user_id then raise exception 'You can''t change your own role.' using errcode = '42501'; end if;
  if me.role <> 'admin' and (target.role = 'admin' or p_role = 'admin') then
    raise exception 'Only an admin can change an admin''s role or make someone an admin.' using errcode = '42501';
  end if;
  if target.role = 'admin' and p_role <> 'admin'
     and (select count(*) from public.org_members where org_id = me.org_id and role = 'admin') <= 1 then
    raise exception 'The team needs at least one admin.' using errcode = '42501';
  end if;
  update public.org_members set role = p_role where user_id = p_user and org_id = me.org_id;
  return jsonb_build_object('ok', true, 'user_id', p_user, 'role', p_role);
end $$;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;
