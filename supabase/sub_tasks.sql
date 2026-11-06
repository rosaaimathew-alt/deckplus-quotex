-- ── Sub tasks: a subcontractor booked for one service on one job ────────────
-- Applied after books.sql (idempotent: safe to re-run; re-run it after
-- re-running schema.sql or books.sql, which rewrite record_tables()).
--
-- One row per booking, the record in `data` (src/lib/subTasks.js documents
-- the shape). Kept apart from the job's proposal row on purpose: a sub's own
-- login will later get only the rows booked for them, never the proposal with
-- its prices and contract.
--
-- Who can reach it today: the project managers and the office / admin. Reps
-- and the paint PM get nothing.

-- 1. Join the record-table list so patch_record / delete_record accept it.
create or replace function record_tables() returns text[] language sql immutable as $$
  select array[
    'proposals','catalog_items','templates','scope_templates','payment_schedules',
    'email_templates','finance_cards','subcontractors','standalone_change_orders',
    'planned_projects','todos','checklists','expenses','job_costs',
    'vendors','purchases','bills','invoices',
    'sub_tasks'
  ]
$$;
alter function record_tables() set search_path = public;

-- 2. The table (same shape as every record table)
create table if not exists public.sub_tasks (
  id         text not null,
  org_id     uuid not null references public.orgs(id) on delete cascade,
  owner_id   uuid,          -- the sub's login (data.subUserId), once they have one
  pm_id      uuid,          -- the PM who booked it (data.pmId)
  status     text,          -- booked | started | near | done
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (org_id, id)
);
create index if not exists sub_tasks_org_updated_idx on public.sub_tasks (org_id, updated_at);
create index if not exists sub_tasks_owner_idx on public.sub_tasks (org_id, owner_id);
alter table public.sub_tasks enable row level security;
alter table public.sub_tasks replica identity full;

drop trigger if exists sub_tasks_updated_at on public.sub_tasks;
create trigger sub_tasks_updated_at before update on public.sub_tasks
  for each row execute function set_updated_at();

-- Copy the queryable columns out of `data` (like proposals' sync trigger).
create or replace function public.sync_sub_task_cols() returns trigger
language plpgsql set search_path = public as $$
begin
  new.owner_id = case when new.data->>'subUserId' ~ '^[0-9a-f-]{36}$' then (new.data->>'subUserId')::uuid end;
  new.pm_id    = case when new.data->>'pmId'      ~ '^[0-9a-f-]{36}$' then (new.data->>'pmId')::uuid end;
  new.status   = new.data->>'status';
  return new;
end $$;
revoke execute on function public.sync_sub_task_cols() from public, anon;
drop trigger if exists sub_tasks_sync_cols on public.sub_tasks;
create trigger sub_tasks_sync_cols before insert or update on public.sub_tasks
  for each row execute function public.sync_sub_task_cols();

-- 3. Project managers and the office
drop policy if exists sub_tasks_org_all on public.sub_tasks;
create policy sub_tasks_org_all on public.sub_tasks for all
  using (org_id = auth_org() and auth_role() in ('pm','office','admin'))
  with check (org_id = auth_org() and auth_role() in ('pm','office','admin'));

-- 4. Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sub_tasks') then
    alter publication supabase_realtime add table public.sub_tasks;
  end if;
end $$;
