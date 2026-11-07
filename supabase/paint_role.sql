-- ── Paint PM role ('paint') ─────────────────────────────────────────────────
-- Applied after schema.sql, invites.sql and designs.sql (idempotent: safe to
-- re-run). The paint project manager uses the phone Field mode's paint screens
-- and nothing else (src/field). What they can reach in the database:
--
--   proposals      read + update every won / imported job in their org
--                  (status 'Won' or 'Imported'); never a Draft / Sent / Lost
--                  proposal. Updates may only touch the paint side of the job:
--                  jobData.paint, .touchUps, .paymentsReceived, .dailyLogs,
--                  .stageDates.paint and the 'paint' entry of
--                  .completedStages (trigger below). No inserts, no deletes.
--   org_members    read (names on jobs) — same as everyone on the team
--   org_settings   read (branding, job types) — same as everyone on the team
--   everything else  nothing: catalog, templates, subs, checklists, todos,
--                  money tables, designs, round robin, mail, invites.

-- 1. The role itself
alter table public.org_members drop constraint if exists org_members_role_check;
alter table public.org_members add constraint org_members_role_check
  check (role in ('rep','pm','paint','office','admin'));
alter table public.org_invites drop constraint if exists org_invites_role_check;
alter table public.org_invites add constraint org_invites_role_check
  check (role in ('rep','pm','paint','office','admin'));

-- 2. Proposals: paint sees and edits won / imported jobs only
drop policy if exists proposals_select on public.proposals;
drop policy if exists proposals_insert on public.proposals;
drop policy if exists proposals_update on public.proposals;

create policy proposals_select on public.proposals for select using (
  org_id = auth_org() and (
       auth_role() in ('office','admin')
    or (auth_role() = 'rep'   and owner_id = auth.uid())
    or (auth_role() = 'pm'    and pm_id    = auth.uid())
    or (auth_role() = 'paint' and status in ('Won','Imported') and deleted_at is null)
  )
);
create policy proposals_insert on public.proposals for insert with check (
  org_id = auth_org()
  and auth_role() is distinct from 'paint'
  and (auth_role() in ('office','admin') or nullif(data->>'ownerId','')::uuid = auth.uid())
);
create policy proposals_update on public.proposals for update using (
  org_id = auth_org() and (
       auth_role() in ('office','admin')
    or (auth_role() = 'rep'   and owner_id = auth.uid())
    or (auth_role() = 'pm'    and pm_id    = auth.uid())
    or (auth_role() = 'paint' and status in ('Won','Imported') and deleted_at is null)
  )
) with check (
  org_id = auth_org()
  and (auth_role() is distinct from 'paint' or status in ('Won','Imported'))
);

-- Paint may change only the paint side of a job. Writes from the app are
-- shallow patches of the record (patch_record), so a paint write replaces
-- data.jobData as a whole; this compares it key by key with what was there.
-- The message starts with "permission denied" so the app's write queue
-- drops a refused write instead of retrying it forever.
create or replace function public.paint_guard_proposal() returns trigger
language plpgsql set search_path = public as $$
declare
  o  jsonb := case when jsonb_typeof(old.data->'jobData') = 'object' then old.data->'jobData' else '{}'::jsonb end;
  n  jsonb := case when jsonb_typeof(new.data->'jobData') = 'object' then new.data->'jobData' else '{}'::jsonb end;
  os jsonb; ns jsonb; oc jsonb; nc jsonb;
  k  text;
  msg constant text := 'permission denied: the paint PM can only change paint details on a job';
begin
  if auth_role() is distinct from 'paint' then return new; end if;

  if (old.data - 'jobData') is distinct from (new.data - 'jobData')
     or new.deleted_at is distinct from old.deleted_at
     or new.org_id is distinct from old.org_id
     or new.id is distinct from old.id then
    raise exception '%', msg using errcode = '42501';
  end if;

  for k in select jsonb_object_keys(o || n) loop
    continue when (o->k) is not distinct from (n->k);
    continue when k in ('paint', 'touchUps', 'paymentsReceived', 'dailyLogs');
    if k = 'stageDates' then
      os := case when jsonb_typeof(o->k) = 'object' then o->k else '{}'::jsonb end;
      ns := case when jsonb_typeof(n->k) = 'object' then n->k else '{}'::jsonb end;
      continue when (os - 'paint') = (ns - 'paint');
    elsif k = 'completedStages' then
      oc := case when jsonb_typeof(o->k) = 'array' then o->k else '[]'::jsonb end;
      nc := case when jsonb_typeof(n->k) = 'array' then n->k else '[]'::jsonb end;
      continue when not exists (
        select 1 from (
          (select jsonb_array_elements_text(oc) except select jsonb_array_elements_text(nc))
          union
          (select jsonb_array_elements_text(nc) except select jsonb_array_elements_text(oc))
        ) d(v) where v <> 'paint'
      );
    end if;
    raise exception '%', msg using errcode = '42501';
  end loop;
  return new;
end $$;

drop trigger if exists proposals_paint_guard on public.proposals;
create trigger proposals_paint_guard before update on public.proposals
  for each row execute function public.paint_guard_proposal();

-- 3. Every other record table: nothing for paint
alter policy catalog_items_org_all on public.catalog_items
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy templates_org_all on public.templates
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy scope_templates_org_all on public.scope_templates
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy payment_schedules_org_all on public.payment_schedules
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy email_templates_org_all on public.email_templates
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy subcontractors_org_all on public.subcontractors
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy standalone_change_orders_org_all on public.standalone_change_orders
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy planned_projects_org_all on public.planned_projects
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy todos_org_all on public.todos
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
alter policy checklists_org_all on public.checklists
  using (org_id = auth_org() and auth_role() is distinct from 'paint')
  with check (org_id = auth_org() and auth_role() is distinct from 'paint');
-- expenses / finance_cards (office, admin) and job_costs (office, admin, pm)
-- already leave paint out (invites.sql).

-- Saved design layouts (designs.sql): not part of the paint screens.
alter policy proposal_designs_select on public.proposal_designs
  using (org_id = auth_org() and auth_role() is distinct from 'paint'
         and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id));
alter policy proposal_designs_insert on public.proposal_designs
  with check (org_id = auth_org() and auth_role() is distinct from 'paint'
              and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id));
alter policy proposal_designs_update on public.proposal_designs
  using (org_id = auth_org() and auth_role() is distinct from 'paint'
         and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id))
  with check (org_id = auth_org());

-- 4. Changing someone's role (Settings › Team)
-- Admin: anyone but themselves, any role (never the last admin away).
-- Office: non-admins only, to a non-admin role (same rule as invites).
create or replace function public.set_member_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.org_members; target public.org_members;
begin
  select * into me from public.org_members where user_id = auth.uid();
  if not found or me.role not in ('admin','office') then
    raise exception 'Only an admin or the office can change roles.' using errcode = '42501';
  end if;
  if p_role not in ('rep','pm','paint','office','admin') then
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

revoke execute on function public.paint_guard_proposal() from public, anon;
