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
--               take a task past its agreed amount, a carpenter's with no amount set (unless the office exempted that sub), a second live one for
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

-- 4. A sub's invoice must be sent Monday–Wednesday and add up. A carpenter's draw stays inside
--    the agreed amount, which the office sets first unless it exempted that sub (once a
--    week per job either way); any other trade sends one invoice per job.
--    (Runs as the table owner so it can see every invoice on the task.)
create or replace function public.check_sub_draw() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; f jsonb; t public.sub_tasks; amt numeric; drawn numeric; agreed numeric; total numeric := 0; seen text[] := '{}';
  bad constant text := 'permission denied: ';
begin
  if auth_role() is distinct from 'sub' then return new; end if;
  if tg_op = 'UPDATE' then
    -- The app re-saving the same invoice it just sent is fine; a change isn't.
    if new.data is not distinct from old.data and new.deleted_at is not distinct from old.deleted_at then return new; end if;
    raise exception '%a sent invoice can''t be changed', bad using errcode = '42501';
  end if;
  -- Subs send invoices Monday 12:00 AM through Wednesday 11:59 PM, Charlotte time.
  if (extract(isodow from (now() at time zone 'America/New_York')) > 3 or public.invoice_day_closed(new.org_id))
     -- the office can open the window for one sub until a set time (subcontractors.data.invoiceOpenUntil)
     and not exists (select 1 from public.subcontractors sc where sc.org_id = new.org_id and sc.deleted_at is null
                     and sc.data->>'userId' = auth.uid()::text and coalesce(sc.data->>'invoiceOpenUntil', '') ~ '^\d{4}-\d{2}-\d{2}T'
                     and (sc.data->>'invoiceOpenUntil')::timestamptz > now()) then
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
    amt := case when (l->>'amount') ~ '^\d+(\.\d{1,2})?$' then (l->>'amount')::numeric end;
    if amt is null or amt <= 0 then raise exception '%each amount must be more than $0', bad using errcode = '42501'; end if;
    if coalesce(t.data->>'trade', '') ~* 'carpent|framing' then
      -- Carpenters draw: once a week per job, up to the agreed amount.
      if exists (select 1 from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
                 where d.org_id = new.org_id and d.owner_id = auth.uid() and d.deleted_at is null
                   and d.data->>'status' <> 'rejected' and d.data->>'weekOf' = new.data->>'weekOf'
                   and x->>'taskId' = t.id) then
        raise exception '%"%" was already invoiced this week', bad, t.data->>'title' using errcode = '42501';
      end if;
      select coalesce(sum((x->>'amount')::numeric), 0) into drawn
        from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
        where d.org_id = new.org_id and d.deleted_at is null and d.data->>'status' <> 'rejected' and x->>'taskId' = t.id;
      -- The office sets the agreed amount first. A sub the office has let
      -- invoice without one (set_sub_invoice_free below) may send an invoice
      -- on a booking that has no amount; one that has an amount is held to it.
      agreed := coalesce((select nullif(m.data->>'agreedAmount', '')::numeric from public.sub_task_terms m
                          where m.org_id = new.org_id and m.id = t.id and m.deleted_at is null), 0);
      if agreed > 0 then
        if drawn + amt > agreed then
          raise exception '%that''s more than is left on "%"', bad, t.data->>'title' using errcode = '42501';
        end if;
      elsif not coalesce((select (om.permissions->>'invoice.noAmount')::boolean from public.org_members om
                          where om.org_id = new.org_id and om.user_id = auth.uid()), false) then
        raise exception '%the office hasn''t set the amount for "%" yet', bad, t.data->>'title' using errcode = '42501';
      end if;
    else
      -- Every other trade: one invoice per stage of the job (a sent-back one can
      -- be sent again; a sub sent back for the next stage invoices that stage).
      if coalesce(l->>'stage', '1') is distinct from coalesce(t.data->>'stage', '1') then
        raise exception '%that isn''t the stage "%" is on', bad, t.data->>'title' using errcode = '42501';
      end if;
      if exists (select 1 from public.sub_draws d, jsonb_array_elements(d.data->'lines') x
                 where d.org_id = new.org_id and d.deleted_at is null
                   and d.data->>'status' <> 'rejected' and x->>'taskId' = t.id
                   and coalesce(x->>'stage', '1') = coalesce(t.data->>'stage', '1')) then
        raise exception '%"%" already has an invoice for this stage', bad, t.data->>'title' using errcode = '42501';
      end if;
    end if;
    total := total + amt;
  end loop;
  if abs(total - coalesce(nullif(new.data->>'total', '')::numeric, -1)) > 0.004 then
    raise exception '%the total doesn''t add up', bad using errcode = '42501';
  end if;
  -- The invoice itself (photo or PDF, optional), stored beside that job's photos.
  if new.data->'files' is null or jsonb_typeof(new.data->'files') = 'null' then new.data := jsonb_set(new.data, '{files}', '[]'::jsonb); end if;
  if jsonb_typeof(new.data->'files') is distinct from 'array' then
    raise exception '%the invoice files aren''t a list', bad using errcode = '42501';
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

-- 4b. The office lets one sub invoice a booking that has no agreed amount
--     (Settings › Team). Kept on that sub's own team row, which they can read
--     and only an admin's functions can change.
create or replace function public.set_sub_invoice_free(p_user uuid, p_free boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.org_members; perms jsonb;
begin
  select * into me from public.org_members where user_id = auth.uid();
  if not found or me.role not in ('admin', 'office') then
    raise exception 'Only the office can change how a sub invoices.' using errcode = '42501';
  end if;
  update public.org_members
     set permissions = case when p_free then coalesce(permissions, '{}'::jsonb) || jsonb_build_object('invoice.noAmount', true)
                            else coalesce(permissions, '{}'::jsonb) - 'invoice.noAmount' end
   where user_id = p_user and org_id = me.org_id and role = 'sub'
   returning permissions into perms;
  if not found then raise exception 'That sub is not on your team.' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'user_id', p_user, 'permissions', perms);
end $$;
revoke all on function public.set_sub_invoice_free(uuid, boolean) from public, anon;
grant execute on function public.set_sub_invoice_free(uuid, boolean) to authenticated;

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

-- 5. The office opening the window for one sub until a set time: the sub's own app asks when.
create or replace function public.my_invoice_open_until() returns timestamptz
language sql stable security definer set search_path = public as $$
  select max((sc.data->>'invoiceOpenUntil')::timestamptz)
  from public.subcontractors sc
  where sc.org_id = public.auth_org() and sc.deleted_at is null
    and sc.data->>'userId' = auth.uid()::text
    and coalesce(sc.data->>'invoiceOpenUntil', '') ~ '^\d{4}-\d{2}-\d{2}T'
$$;
revoke all on function public.my_invoice_open_until() from public, anon;
grant execute on function public.my_invoice_open_until() to authenticated;

-- 6. Days the office closed for a holiday ("invoices due a day early this week"):
--    app_kv 'invoice:closed:<org id>' holds the dates ('2026-11-25'). On those
--    days the database refuses a sub's invoice like any day outside Monday–Wednesday
--    (the office can still open the window for one sub), and the sub's app says so.
create or replace function public.invoice_day_closed(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_kv k, jsonb_array_elements_text(case when jsonb_typeof(k.value) = 'array' then k.value else '[]'::jsonb end) d
                  where k.key = 'invoice:closed:' || p_org::text
                    and d = to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'))
$$;
revoke all on function public.invoice_day_closed(uuid) from public, anon, authenticated;

create or replace function public.my_invoice_closed_today() returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_org() is not null and public.invoice_day_closed(public.auth_org())
$$;
revoke all on function public.my_invoice_closed_today() from public, anon;
grant execute on function public.my_invoice_closed_today() to authenticated;
