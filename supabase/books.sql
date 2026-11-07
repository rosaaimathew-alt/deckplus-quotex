-- ── Books: vendors, purchase orders, bills, invoices ────────────────────────
-- Applied after schema.sql, invites.sql, designs.sql, paint_role.sql and
-- permissions.sql
-- (idempotent: safe to re-run; re-run it after re-running schema.sql, whose
-- org-wide policy loop would otherwise open these tables to every role).
--
-- Same row model as every other collection: one row per record, the record in
-- `data` (src/lib/books.js documents the shapes). Money stays with the office:
-- only office and admin logins read or write these tables. Reps, project
-- managers and the paint PM get nothing (the app hides the Money pages from
-- them too).

-- 1. The new tables join the record-table list, so patch_record /
--    delete_record accept them and the loops below cover them.
create or replace function record_tables() returns text[] language sql immutable as $$
  select array[
    'proposals','catalog_items','templates','scope_templates','payment_schedules',
    'email_templates','finance_cards','subcontractors','standalone_change_orders',
    'planned_projects','todos','checklists','expenses','job_costs',
    'vendors','purchases','bills','invoices'
  ]
$$;
alter function record_tables() set search_path = public;

-- 2. Tables, indexes, triggers, realtime, office-only policies
do $$
declare t text;
begin
  foreach t in array array['vendors','purchases','bills','invoices'] loop
    execute format($f$
      create table if not exists public.%I (
        id         text not null,
        org_id     uuid not null references public.orgs(id) on delete cascade,
        owner_id   uuid,
        pm_id      uuid,
        status     text,
        data       jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        primary key (org_id, id)
      )$f$, t);
    execute format('create index if not exists %I on public.%I (org_id, updated_at)', t || '_org_updated_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I replica identity full', t);

    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function set_updated_at()', t || '_updated_at', t);

    -- Bills and purchase orders are what jobs cost: also refused to someone
    -- whose "Job money & profit" switch is off (auth_can, permissions.sql).
    execute format('drop policy if exists %I on public.%I', t || '_org_all', t);
    execute format($p$create policy %I on public.%I for all
      using (org_id = auth_org() and auth_role() in ('office','admin') and (%L = false or auth_can('job.money')))
      with check (org_id = auth_org() and auth_role() in ('office','admin') and (%L = false or auth_can('job.money')))$p$,
      t || '_org_all', t, t in ('bills','purchases'), t in ('bills','purchases'));

    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
