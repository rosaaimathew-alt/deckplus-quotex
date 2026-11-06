-- ── Sub draw invoices ───────────────────────────────────────────────────────
-- Applied after sub_photos.sql (idempotent: safe to re-run; re-run it after
-- re-running schema.sql, books.sql or sub_tasks.sql, which rewrite
-- record_tables()).
--
-- Once a week a sub asks the office to draw part of the agreed amount on
-- their jobs (src/lib/subDraws.js documents the record). Who reaches what:
--
--   sub_draws   office / admin: everything (approve or send back)
--               sub: read their own; send (insert) a new one; never edit or
--               delete one. The checks below refuse an invoice that would
--               take a task past its agreed amount, or a second live one
--               for the same week.
--               PMs, reps, paint PM: nothing (money stays with the office).
--   sub_tasks   agreedAmount is set by the office / admin only.

-- 1. Join the record-table list so patch_record / delete_record accept it.
create or replace function record_tables() returns text[] language sql immutable as $$
  select array[
    'proposals','catalog_items','templates','scope_templates','payment_schedules',
    'email_templates','finance_cards','subcontractors','standalone_change_orders',
    'planned_projects','todos','checklists','expenses','job_costs',
    'vendors','purchases','bills','invoices',
    'sub_tasks','sub_draws'
  ]
$$;
alter function record_tables() set search_path = public;

-- 2. The table
create table if not exists public.sub_draws (
  id         text not null,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  owner_id   uuid,          -- the sub's login (data.subUserId)
  pm_id      uuid,          -- unused
  status     text,          -- submitted | approved | rejected
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (org_id, id)
);
create index if not exists sub_draws_org_updated_idx on public.sub_draws (org_id, updated_at);
create index if not exists sub_draws_owner_idx on public.sub_draws (org_id, owner_id);
alter table public.sub_draws enable row level security;
alter table public.sub_draws replica identity full;

drop trigger if exists sub_draws_updated_at on public.sub_draws;
create trigger sub_draws_updated_at before update on public.sub_draws
  for each row execute function set_updated_at();

create or replace function public.sync_sub_draw_cols() returns trigger
language plpgsql set search_path = public as $$
begin
  new.owner_id = case when new.data->>'subUserId' ~ '^[0-9a-f-]{36}$' then (new.data->>'subUserId')::uuid end;
  new.status   = new.data->>'status';
  return new;
end $$;
revoke execute on function public.sync_sub_draw_cols() from public, anon;
drop trigger if exists sub_draws_sync_cols on public.sub_draws;
create trigger sub_draws_sync_cols before insert or update on public.sub_draws
  for each row execute function public.sync_sub_draw_cols();

-- 3. Who may
drop policy if exists sub_draws_office on public.sub_draws;
create policy sub_draws_office on public.sub_draws for all
  using (org_id = auth_org() and auth_role() in ('office','admin'))
  with check (org_id = auth_org() and auth_role() in ('office','admin'));
drop policy if exists sub_draws_sub_select on public.sub_draws;
create policy sub_draws_sub_select on public.sub_draws for select
  using (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid() and deleted_at is null);
drop policy if exists sub_draws_sub_insert on public.sub_draws;
create policy sub_draws_sub_insert on public.sub_draws for insert
  with check (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid());
-- (Only so the app's own re-save of a just-sent invoice goes through; the
-- check below refuses any actual change.)
drop policy if exists sub_draws_sub_update on public.sub_draws;
create policy sub_draws_sub_update on public.sub_draws for update
  using (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid() and deleted_at is null)
  with check (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid());

-- 4. A sub's invoice must add up and stay inside the agreed amounts.
--    (Runs as the table owner so it can see every invoice on the task.)
create or replace function public.check_sub_draw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; t public.sub_tasks; amt numeric; drawn numeric; total numeric := 0; seen text[] := '{}';
  bad constant text := 'permission denied: ';
begin
  if auth_role() is distinct from 'sub' then return new; end if;
  if tg_op = 'UPDATE' then
    -- The app re-saving the same invoice it just sent is fine; a change isn't.
    if new.data is not distinct from old.data and new.deleted_at is not distinct from old.deleted_at then return new; end if;
    raise exception '%a sent invoice can''t be changed', bad using errcode = '42501';
  end if;
  if new.data->>'status' is distinct from 'submitted' then
    raise exception '%a new invoice must be submitted for review', bad using errcode = '42501';
  end if;
  if coalesce(new.data->>'weekOf', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '%the invoice needs its week', bad using errcode = '42501';
  end if;
  if exists (select 1 from public.sub_draws d where d.org_id = new.org_id and d.owner_id = auth.uid()
             and d.deleted_at is null and d.data->>'status' <> 'rejected' and d.data->>'weekOf' = new.data->>'weekOf') then
    raise exception '%this week''s invoice was already sent', bad using errcode = '42501';
  end if;
  if jsonb_typeof(new.data->'lines') <> 'array' or jsonb_array_length(new.data->'lines') = 0 then
    raise exception '%the invoice has no jobs on it', bad using errcode = '42501';
  end if;
  for l in select * from jsonb_array_elements(new.data->'lines') loop
    if (l->>'taskId') = any(seen) then raise exception '%a job is on the invoice twice', bad using errcode = '42501'; end if;
    seen := seen || (l->>'taskId');
    select * into t from public.sub_tasks
      where org_id = new.org_id and id = l->>'taskId' and owner_id = auth.uid() and deleted_at is null;
    if not found then raise exception '%that job isn''t booked for you', bad using errcode = '42501'; end if;
    amt := case when (l->>'amount') ~ '^\d+(\.\d{1,2})?$' then (l->>'amount')::numeric end;
    if amt is null or amt <= 0 then raise exception '%each amount must be more than $0', bad using errcode = '42501'; end if;
    select coalesce(sum((x->>'amount')::numeric), 0) into drawn
      from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
      where d.org_id = new.org_id and d.deleted_at is null and d.data->>'status' <> 'rejected' and x->>'taskId' = t.id;
    if drawn + amt > coalesce(nullif(t.data->>'agreedAmount', '')::numeric, 0) then
      raise exception '%that''s more than is left on "%"', bad, t.data->>'title' using errcode = '42501';
    end if;
    total := total + amt;
  end loop;
  if abs(total - coalesce(nullif(new.data->>'total', '')::numeric, -1)) > 0.004 then
    raise exception '%the total doesn''t add up', bad using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.check_sub_draw() from public, anon, authenticated;
drop trigger if exists sub_draws_check on public.sub_draws;
create trigger sub_draws_check before insert or update on public.sub_draws
  for each row execute function public.check_sub_draw();

-- 5. Agreed amounts on bookings: office / admin only
create or replace function public.guard_agreed_amount() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth_role() in ('office','admin') then return new; end if;
  if (tg_op = 'INSERT' and nullif(new.data->>'agreedAmount', '') is not null)
     or (tg_op = 'UPDATE' and (new.data->'agreedAmount') is distinct from (old.data->'agreedAmount')) then
    raise exception 'permission denied: only the office sets the agreed amount' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_agreed_amount() from public, anon;
drop trigger if exists sub_tasks_agreed_guard on public.sub_tasks;
create trigger sub_tasks_agreed_guard before insert or update on public.sub_tasks
  for each row execute function public.guard_agreed_amount();

-- 6. Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sub_draws') then
    alter publication supabase_realtime add table public.sub_draws;
  end if;
end $$;
