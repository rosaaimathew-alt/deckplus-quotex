-- ── Alerts: who is told when something happens on a sub's job ────────────────
-- The server (api/_notify.js) asks this function, as the signed-in person,
-- who an alert goes to and what it is about. The person asking can't choose
-- the recipients or the wording: both come from the booking itself, and the
-- function answers only for someone who is part of that booking.
--
--   kind                 who may ask                      who is told
--   booked               Deck Plus PM / office / paint PM   the sub (and the technician, if one is on it)
--   changed              Deck Plus PM / office / paint PM   the sub and the technician
--   inspection           Deck Plus PM / office              the sub and the technician
--   inspection_result    Deck Plus PM / office              the sub and the technician of that trade
--                        (the booking carries only its own trade's results: src/lib/subInspections.js)
--   assigned             the sub company's PM, or staff     the technician / painter put on the job
--   done                 the sub or the technician          the Deck Plus PM on the job
--   invoice_submitted    the sub                            office and admin (those who get alert emails)
--   invoice_decision     office / admin                     the sub
--   message              whoever wrote it (job chat)        the other side: the sub's manager, or the PM on the job
--
-- Run once in the Supabase SQL editor. Safe to re-run.

-- A staff member's phone, so a technician can call their PM and alerts can
-- be texted. Set by the person themself or by the office.
alter table public.org_members add column if not exists phone text;

create or replace function public.set_member_phone(p_user uuid, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); v text := nullif(btrim(left(regexp_replace(coalesce(p_phone, ''), '[^0-9+() .x-]', '', 'g'), 30)), '');
begin
  if my_org is null or r is null then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_user is distinct from auth.uid() and r not in ('office', 'admin') then
    raise exception 'permission denied: only the office can change someone else''s phone' using errcode = '42501';
  end if;
  update public.org_members set phone = v where org_id = my_org and user_id = p_user;
  if not found then raise exception 'not on this team' using errcode = '42501'; end if;
  return v;
end $$;
revoke all on function public.set_member_phone(uuid, text) from public, anon;
grant execute on function public.set_member_phone(uuid, text) to authenticated;

create or replace function public.notify_targets(p_kind text, p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  my_org uuid := public.auth_org(); r text := public.auth_role(); uid uuid := auth.uid();
  t public.sub_tasks; d public.sub_draws; s public.subcontractors; msg public.sub_messages;
  me public.org_members; pm public.org_members; owner public.org_members; tech public.org_members;
  staff boolean; is_paint boolean; crew jsonb; who jsonb := '[]'::jsonb; sender jsonb;
begin
  if my_org is null or r is null or uid is null then return null; end if;
  select * into me from public.org_members where org_id = my_org and user_id = uid;

  -- ── Weekly invoices ────────────────────────────────────────────────────────
  if p_kind in ('invoice_submitted', 'invoice_decision') then
    select * into d from public.sub_draws where org_id = my_org and id = p_id and deleted_at is null;
    if not found then return null; end if;
    if p_kind = 'invoice_submitted' then
      if d.owner_id is distinct from uid then return null; end if;
      select coalesce(jsonb_agg(jsonb_build_object('name', m.display_name, 'email', m.email, 'phone', m.phone)), '[]'::jsonb) into who
        from public.org_members m
        where m.org_id = my_org and m.role in ('office', 'admin') and coalesce(m.email, '') <> ''
          and coalesce((m.permissions->>'email.alerts')::boolean, true);
    else
      if r not in ('office', 'admin') then return null; end if;
      select * into owner from public.org_members where org_id = my_org and user_id = d.owner_id;
      select * into s from public.subcontractors where org_id = my_org and deleted_at is null and data->>'userId' = d.owner_id::text limit 1;
      if owner.user_id is not null and coalesce(owner.email, '') <> '' then
        who := jsonb_build_array(jsonb_build_object('name', owner.display_name, 'email', owner.email, 'phone', s.data->>'phone'));
      end if;
    end if;
    return jsonb_build_object(
      'kind', p_kind,
      'by', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email),
      'sender', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email, 'phone', me.phone),
      'draw', jsonb_build_object('id', d.id, 'status', d.status, 'total', d.data->'total', 'weekOf', d.data->>'weekOf',
                                 'reason', d.data->>'reason', 'subName', coalesce(d.data->>'subName', d.data->>'submittedBy')),
      'recipients', who);
  end if;

  -- ── Job chat (supabase/sub_messages.sql): tell the other side ──────────────
  if p_kind = 'message' then
    select * into msg from public.sub_messages where org_id = my_org and id = p_id and deleted_at is null;
    if not found or msg.data->>'byId' is distinct from uid::text then return null; end if;
    -- the sub's latest booking on that job: its PM is who the sub is talking to
    select * into t from public.sub_tasks
      where org_id = my_org and deleted_at is null and data->>'proposalId' = msg.proposal_id and data->>'subId' = msg.sub_id
      order by created_at desc limit 1;
    if msg.data->>'from' = 'sub' then
      select * into pm from public.org_members where org_id = my_org and user_id = t.pm_id;
      if pm.user_id is not null and coalesce(pm.email, '') <> '' then
        who := jsonb_build_array(jsonb_build_object('name', pm.display_name, 'email', pm.email, 'phone', pm.phone));
      end if;
    else
      select * into owner from public.org_members where org_id = my_org and user_id = msg.owner_id;
      select * into s from public.subcontractors where org_id = my_org and id = msg.sub_id and deleted_at is null;
      if owner.user_id is not null and coalesce(owner.email, '') <> '' then
        who := jsonb_build_array(jsonb_build_object('name', owner.display_name, 'email', owner.email, 'phone', s.data->>'phone'));
      end if;
    end if;
    return jsonb_build_object(
      'kind', p_kind,
      'by', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email),
      'sender', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email, 'phone', me.phone),
      'senderIsStaff', msg.data->>'from' = 'pm',
      'message', jsonb_build_object('id', msg.id, 'from', msg.data->>'from', 'text', msg.data->>'text', 'client', msg.data->>'client',
                                    'proposalId', msg.proposal_id, 'subId', msg.sub_id, 'taskId', t.id),
      'recipients', who);
  end if;

  -- ── Bookings ───────────────────────────────────────────────────────────────
  if p_kind not in ('booked', 'changed', 'inspection', 'inspection_result', 'assigned', 'done') then return null; end if;
  select * into t from public.sub_tasks where org_id = my_org and id = p_id and deleted_at is null;
  if not found then return null; end if;
  is_paint := coalesce((t.data->>'paint')::boolean, false);
  staff := r in ('pm', 'office', 'admin') or (r = 'paint' and is_paint);

  if p_kind in ('booked', 'changed', 'inspection', 'inspection_result') and not staff then return null; end if;
  -- ("is not distinct from": a booking with nobody on it has no crew_id, and a plain = would be unknown, not false)
  if p_kind = 'assigned' and not (staff or t.owner_id is not distinct from uid) then return null; end if;
  if p_kind = 'done' and not (t.owner_id is not distinct from uid or t.crew_id is not distinct from uid) then return null; end if;

  select * into s from public.subcontractors where org_id = my_org and id = (t.data->>'subId') and deleted_at is null;
  select * into pm from public.org_members where org_id = my_org and user_id = t.pm_id;
  select * into owner from public.org_members where org_id = my_org and user_id = t.owner_id;
  select * into tech from public.org_members where org_id = my_org and user_id = t.crew_id;
  -- the technician's phone is on the company's crew list
  select x into crew from jsonb_array_elements(case when jsonb_typeof(s.data->'crew') = 'array' then s.data->'crew' else '[]'::jsonb end) x
    where x->>'userId' = t.crew_id::text limit 1;

  if p_kind = 'done' then
    if pm.user_id is not null and coalesce(pm.email, '') <> '' and pm.user_id <> uid then
      who := jsonb_build_array(jsonb_build_object('name', pm.display_name, 'email', pm.email, 'phone', pm.phone));
    end if;
  else
    -- the sub's own login: not on a paint job (the paint PM is the one sending) and not for "assigned"
    if p_kind <> 'assigned' and not is_paint and owner.user_id is not null and owner.user_id <> uid and coalesce(owner.email, '') <> '' then
      who := who || jsonb_build_object('name', owner.display_name, 'email', owner.email, 'phone', s.data->>'phone');
    end if;
    if tech.user_id is not null and tech.user_id <> uid and coalesce(tech.email, '') <> '' then
      who := who || jsonb_build_object('name', coalesce(tech.display_name, crew->>'name'), 'email', tech.email, 'phone', crew->>'phone');
    end if;
  end if;

  -- Alerts to a sub go out in the name of the PM on the job; "assigned" from
  -- a sub company's PM and "done" go out in the name of whoever did it.
  sender := case when p_kind in ('booked', 'changed', 'inspection', 'inspection_result') and pm.user_id is not null
    then jsonb_build_object('id', pm.user_id, 'name', pm.display_name, 'email', pm.email, 'phone', pm.phone)
    else jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email, 'phone', me.phone) end;

  return jsonb_build_object(
    'kind', p_kind,
    'by', jsonb_build_object('id', me.user_id, 'name', me.display_name, 'email', me.email),
    'sender', sender,
    'senderIsStaff', (p_kind in ('booked', 'changed', 'inspection', 'inspection_result') and pm.user_id is not null) or staff,
    'task', jsonb_build_object(
      'id', t.id, 'proposalId', t.data->>'proposalId', 'title', t.data->>'title', 'client', t.data->>'client', 'address', t.data->>'address',
      'startDate', t.data->>'startDate', 'endDate', t.data->>'endDate', 'inspectionDate', t.data->>'inspectionDate',
      'changeNote', t.data->>'changeNote', 'crewName', t.data->>'crewName', 'subName', coalesce(s.data->>'name', t.data->>'subName'), 'paint', is_paint,
      'inspections', case when jsonb_typeof(t.data->'inspections') = 'array' then t.data->'inspections' else '[]'::jsonb end),
    'recipients', who);
end $$;
revoke all on function public.notify_targets(text, text) from public, anon;
grant execute on function public.notify_targets(text, text) to authenticated;
