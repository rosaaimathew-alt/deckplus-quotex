-- QuoteX rows schema — new-company instance.
-- Run once in the Supabase SQL editor (idempotent: safe to re-run).
--
-- Model: every record the app holds is one row, keyed (org_id, id). The full
-- record lives in `data` (jsonb) exactly as the app uses it, so the app's
-- store shape and every page stay unchanged. A few columns are copied out of
-- `data` by trigger (owner_id, pm_id, status) so row-level security and
-- indexes can use them. Writes are per-row patches (`patch_record`), never a
-- whole-store overwrite, and Realtime pushes every committed row to every
-- connected device. There is nothing to merge anywhere.

create extension if not exists pgcrypto;

-- ── Organizations, members, settings ────────────────────────────────────────
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists org_members (
  user_id      uuid not null references auth.users(id) on delete cascade,
  org_id       uuid not null references orgs(id) on delete cascade,
  role         text not null check (role in ('rep','pm','office','admin')),
  display_name text,
  email        text,
  created_at   timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- One row per org holding every singleton the store used to keep at top level
-- (branding, projectTypes, catalogCategories, deck/porch rates, contractPrefix…).
create table if not exists org_settings (
  org_id     uuid primary key references orgs(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Who am I, in this org?  (security definer so RLS policies can call them)
create or replace function auth_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from org_members where user_id = auth.uid() limit 1
$$;
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from org_members where user_id = auth.uid() limit 1
$$;

-- ── Record tables ───────────────────────────────────────────────────────────
-- One table per collection in the store. `id` is text so both the app's
-- numeric ids and its legacy string ids ('p-restored-…') fit unchanged.
create or replace function record_tables() returns text[] language sql immutable as $$
  select array[
    'proposals','catalog_items','templates','scope_templates','payment_schedules',
    'email_templates','finance_cards','subcontractors','standalone_change_orders',
    'planned_projects','todos','checklists','expenses','job_costs'
  ]
$$;

do $$
declare t text;
begin
  foreach t in array record_tables() loop
    execute format($f$
      create table if not exists %I (
        id         text not null,
        org_id     uuid not null references orgs(id) on delete cascade,
        owner_id   uuid,
        pm_id      uuid,
        status     text,
        data       jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        primary key (org_id, id)
      )$f$, t);
    execute format('create index if not exists %I on %I (org_id, updated_at)', t || '_org_updated_idx', t);
    execute format('alter table %I enable row level security', t);
    -- Realtime needs the full old row on UPDATE/DELETE so org filters apply.
    execute format('alter table %I replica identity full', t);
  end loop;
end $$;

create index if not exists proposals_owner_idx on proposals (org_id, owner_id, status);
create index if not exists proposals_pm_idx    on proposals (org_id, pm_id);

-- ── Triggers ────────────────────────────────────────────────────────────────
-- updated_at is set by the database on every write; no code path can forget it.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array (record_tables() || array['org_settings']) loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- Keep the queryable proposal columns in step with the record in `data`.
create or replace function sync_proposal_cols() returns trigger language plpgsql as $$
begin
  new.owner_id = nullif(new.data->>'ownerId', '')::uuid;
  new.pm_id    = nullif(new.data->>'pmId', '')::uuid;
  new.status   = new.data->>'status';
  return new;
end $$;
drop trigger if exists proposals_sync_cols on proposals;
create trigger proposals_sync_cols before insert or update on proposals
  for each row execute function sync_proposal_cols();

-- ── Write helpers (called by the app) ───────────────────────────────────────
-- Shallow-merge changed top-level keys into `data`. Two people editing
-- different fields of the same record both land; the later write to the SAME
-- field wins, decided by the database's commit order.
create or replace function patch_record(tbl text, rid text, patch jsonb) returns void
language plpgsql security invoker as $$
begin
  if not (tbl = any(record_tables())) then raise exception 'unknown table %', tbl; end if;
  execute format('update %I set data = data || $1, deleted_at = null where org_id = auth_org() and id = $2', tbl)
    using patch, rid;
end $$;

-- Soft delete: the row stays for history; the app never loads it again.
create or replace function delete_record(tbl text, rid text) returns void
language plpgsql security invoker as $$
begin
  if not (tbl = any(record_tables())) then raise exception 'unknown table %', tbl; end if;
  execute format('update %I set deleted_at = now() where org_id = auth_org() and id = $1', tbl) using rid;
end $$;

create or replace function patch_settings(patch jsonb) returns void
language sql security invoker as $$
  update org_settings set data = data || patch where org_id = auth_org()
$$;

-- Id blocks: each signed-in session reserves 1,000 ids for every counter the
-- app keeps (proposals, catalog, templates…), so two reps can never mint the
-- same number, online or offline.
create sequence if not exists id_block_seq increment by 1000 start with 1000;
create or replace function reserve_ids() returns bigint language sql as $$
  select nextval('id_block_seq')
$$;

-- ── Row-level security ──────────────────────────────────────────────────────
alter table orgs         enable row level security;
alter table org_members  enable row level security;
alter table org_settings enable row level security;

drop policy if exists orgs_read      on orgs;
drop policy if exists members_read   on org_members;
drop policy if exists members_admin  on org_members;
drop policy if exists settings_read  on org_settings;
drop policy if exists settings_write on org_settings;

create policy orgs_read     on orgs         for select using (id = auth_org());
create policy members_read  on org_members  for select using (org_id = auth_org());
create policy members_admin on org_members  for all
  using (org_id = auth_org() and auth_role() = 'admin') with check (org_id = auth_org());
create policy settings_read  on org_settings for select using (org_id = auth_org());
create policy settings_write on org_settings for all
  using (org_id = auth_org() and auth_role() in ('office','admin')) with check (org_id = auth_org());

-- Proposals: a rep sees and edits only their own deals; a PM only the deals
-- they are assigned to; office and admin see and edit every deal in the org.
-- Because the database filters the rows, a rep's dashboard is "mine" and the
-- office's is "everyone" with no filtering code in the app.
drop policy if exists proposals_select on proposals;
drop policy if exists proposals_insert on proposals;
drop policy if exists proposals_update on proposals;

create policy proposals_select on proposals for select using (
  org_id = auth_org() and (
       auth_role() in ('office','admin')
    or (auth_role() = 'rep' and owner_id = auth.uid())
    or (auth_role() = 'pm'  and pm_id    = auth.uid())
  )
);
create policy proposals_insert on proposals for insert with check (
  org_id = auth_org() and (auth_role() in ('office','admin') or nullif(data->>'ownerId','')::uuid = auth.uid())
);
create policy proposals_update on proposals for update using (
  org_id = auth_org() and (
       auth_role() in ('office','admin')
    or (auth_role() = 'rep' and owner_id = auth.uid())
    or (auth_role() = 'pm'  and pm_id    = auth.uid())
  )
) with check (org_id = auth_org());

-- Every other collection is shared across the org (catalog, templates, todos…).
do $$
declare t text;
begin
  foreach t in array record_tables() loop
    if t <> 'proposals' then
      execute format('drop policy if exists %I on %I', t || '_org_all', t);
      execute format('create policy %I on %I for all using (org_id = auth_org()) with check (org_id = auth_org())', t || '_org_all', t);
    end if;
  end loop;
end $$;

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array (record_tables() || array['org_settings','org_members']) loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
