-- ── Sub draw invoices ───────────────────────────────────────────────────────
-- Applied after sub_photos.sql (idempotent: safe to re-run; re-run it after
-- re-running schema.sql, books.sql or sub_tasks.sql, which rewrite
-- record_tables()).
--
-- A sub invoices the office for part of the agreed amount on a job, answering
-- the office's Google Form questions plus a photo / PDF of the invoice
-- (src/lib/subDraws.js documents the record). Who reaches what:
--
--   sub_draws   office / admin: everything (approve or send back)
--               sub: read their own; send (insert) a new one; never edit or
--               delete one. The checks below refuse an invoice that would
--               take a task past its agreed amount, a second live one for
--               the same job in the same week, or one without the invoice
--               file, date or work type.
--               PMs, reps, paint PM: nothing (money stays with the office).
--   sub_task_terms  the agreed amount on each booking (id = the task's id).
--               office / admin: set it. The sub the task is booked with
--               (an outside company: its PM) reads it. Nobody else — not
--               PMs, and not an outside company's crew, who can see the
--               task itself but never what their company is paid.

-- 1. Join the record-table list so patch_record / delete_record accept it.
create or replace function record_tables() returns text[] language sql immutable as $$
  select array[
    'proposals','catalog_items','templates','scope_templates','payment_schedules',
    'email_templates','finance_cards','subcontractors','standalone_change_orders',
    'planned_projects','todos','checklists','expenses','job_costs',
    'vendors','purchases','bills','invoices',
    'sub_tasks','sub_draws','sub_task_terms'
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

-- 2b. Agreed amounts, apart from the task so a crew member can't read them
create table if not exists public.sub_task_terms (
  id         text not null,   -- the sub task's id
  org_id     uuid not null references public.orgs(id) on delete cascade,
  owner_id   uuid, pm_id uuid, status text,
  data       jsonb not null default '{}'::jsonb,   -- { id, agreedAmount }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (org_id, id)
);
create index if not exists sub_task_terms_org_updated_idx on public.sub_task_terms (org_id, updated_at);
alter table public.sub_task_terms enable row level security;
alter table public.sub_task_terms replica identity full;
drop trigger if exists sub_task_terms_updated_at on public.sub_task_terms;
create trigger sub_task_terms_updated_at before update on public.sub_task_terms
  for each row execute function set_updated_at();

drop policy if exists sub_task_terms_office on public.sub_task_terms;
create policy sub_task_terms_office on public.sub_task_terms for all
  using (org_id = auth_org() and auth_role() in ('office','admin'))
  with check (org_id = auth_org() and auth_role() in ('office','admin'));
drop policy if exists sub_task_terms_sub_select on public.sub_task_terms;
create policy sub_task_terms_sub_select on public.sub_task_terms for select using (
  org_id = auth_org() and auth_role() = 'sub' and deleted_at is null
  and exists (select 1 from public.sub_tasks t where t.org_id = sub_task_terms.org_id and t.id = sub_task_terms.id
              and t.owner_id = auth.uid() and t.deleted_at is null)
);

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

-- 4. A sub's invoice must be sent Monday–Wednesday, add up, and stay inside the agreed amounts.
--    (Runs as the table owner so it can see every invoice on the task.)
create or replace function public.check_sub_draw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; f jsonb; t public.sub_tasks; amt numeric; drawn numeric; total numeric := 0; seen text[] := '{}';
  bad constant text := 'permission denied: ';
begin
  if auth_role() is distinct from 'sub' then return new; end if;
  if tg_op = 'UPDATE' then
    -- The app re-saving the same invoice it just sent is fine; a change isn't.
    if new.data is not distinct from old.data and new.deleted_at is not distinct from old.deleted_at then return new; end if;
    raise exception '%a sent invoice can''t be changed', bad using errcode = '42501';
  end if;
  -- Subs send invoices Monday 12:00 AM through Wednesday 11:59 PM, Charlotte time.
  if extract(isodow from (now() at time zone 'America/New_York')) > 3 then
    raise exception '%invoices can only be sent Monday through Wednesday', bad using errcode = '42501';
  end if;
  if new.data->>'status' is distinct from 'submitted' then
    raise exception '%a new invoice must be submitted for review', bad using errcode = '42501';
  end if;
  if coalesce(new.data->>'weekOf', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '%the invoice needs its week', bad using errcode = '42501';
  end if;
  if coalesce(new.data->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '%the invoice needs its date', bad using errcode = '42501';
  end if;
  if jsonb_typeof(new.data->'workTypes') is distinct from 'array' or jsonb_array_length(new.data->'workTypes') = 0 then
    raise exception '%pick the work type', bad using errcode = '42501';
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
    if exists (select 1 from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
               where d.org_id = new.org_id and d.owner_id = auth.uid() and d.deleted_at is null
                 and d.data->>'status' <> 'rejected' and d.data->>'weekOf' = new.data->>'weekOf'
                 and x->>'taskId' = t.id) then
      raise exception '%"%" was already invoiced this week', bad, t.data->>'title' using errcode = '42501';
    end if;
    amt := case when (l->>'amount') ~ '^\d+(\.\d{1,2})?$' then (l->>'amount')::numeric end;
    if amt is null or amt <= 0 then raise exception '%each amount must be more than $0', bad using errcode = '42501'; end if;
    select coalesce(sum((x->>'amount')::numeric), 0) into drawn
      from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
      where d.org_id = new.org_id and d.deleted_at is null and d.data->>'status' <> 'rejected' and x->>'taskId' = t.id;
    if drawn + amt > coalesce((select nullif(m.data->>'agreedAmount', '')::numeric from public.sub_task_terms m
                               where m.org_id = new.org_id and m.id = t.id and m.deleted_at is null), 0) then
      raise exception '%that''s more than is left on "%"', bad, t.data->>'title' using errcode = '42501';
    end if;
    total := total + amt;
  end loop;
  if abs(total - coalesce(nullif(new.data->>'total', '')::numeric, -1)) > 0.004 then
    raise exception '%the total doesn''t add up', bad using errcode = '42501';
  end if;
  -- The invoice itself (photo or PDF), stored beside that job's photos.
  if jsonb_typeof(new.data->'files') is distinct from 'array' or jsonb_array_length(new.data->'files') = 0 then
    raise exception '%add a photo or PDF of the invoice', bad using errcode = '42501';
  end if;
  if jsonb_array_length(new.data->'files') > 10 then
    raise exception '%up to 10 files per invoice', bad using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(new.data->'files') loop
    if split_part(f->>'path', '/', 1) <> new.org_id::text or not (split_part(f->>'path', '/', 2) = any(seen))
       or split_part(f->>'path', '/', 3) <> 'invoices' then
      raise exception '%an invoice file isn''t on this job', bad using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke execute on function public.check_sub_draw() from public, anon, authenticated;
drop trigger if exists sub_draws_check on public.sub_draws;
create trigger sub_draws_check before insert or update on public.sub_draws
  for each row execute function public.check_sub_draw();

-- 5. (Agreed amounts used to live on the task; they're in sub_task_terms now.)
drop trigger if exists sub_tasks_agreed_guard on public.sub_tasks;
drop function if exists public.guard_agreed_amount();

-- 6. Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sub_draws') then
    alter publication supabase_realtime add table public.sub_draws;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sub_task_terms') then
    alter publication supabase_realtime add table public.sub_task_terms;
  end if;
end $$;
