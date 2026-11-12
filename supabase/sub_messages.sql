-- ── Job chat: a sub's manager and the Deck Plus PM, one conversation per job ──
-- Each row is one message. A conversation is every message with the same job
-- (data.proposalId) and the same sub (data.subId). Messages are only ever
-- added: nobody edits or deletes one (the table is deliberately left out of
-- record_tables(), so patch_record / delete_record refuse it).
--
--   Deck Plus PMs, office, admin   read and write every conversation
--   A sub's manager (their login)  reads and writes only their own, and only
--                                  on a job they are booked on
--   Technicians, painters, reps    nothing
--
-- data = { id, proposalId, subId, subUserId, client, from: 'pm' | 'sub',
--          byId, byName, text, at }
--
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.sub_messages (
  id          text not null,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  owner_id    uuid,          -- the sub manager's login (data.subUserId)
  proposal_id text,          -- the job (data.proposalId)
  sub_id      text,          -- the sub company (data.subId)
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (org_id, id)
);
create index if not exists sub_messages_org_updated_idx on public.sub_messages (org_id, updated_at);
create index if not exists sub_messages_thread_idx on public.sub_messages (org_id, proposal_id, sub_id);
create index if not exists sub_messages_owner_idx on public.sub_messages (org_id, owner_id);
alter table public.sub_messages enable row level security;
alter table public.sub_messages replica identity full;

drop trigger if exists sub_messages_updated_at on public.sub_messages;
create trigger sub_messages_updated_at before update on public.sub_messages
  for each row execute function set_updated_at();

create or replace function public.sync_sub_message_cols() returns trigger
language plpgsql set search_path = public as $$
begin
  new.owner_id    = case when new.data->>'subUserId' ~ '^[0-9a-f-]{36}$' then (new.data->>'subUserId')::uuid end;
  new.proposal_id = new.data->>'proposalId';
  new.sub_id      = new.data->>'subId';
  -- a message is short text; nothing else rides along
  if length(coalesce(new.data->>'text', '')) = 0 or length(new.data->>'text') > 2000 then
    raise exception 'A message needs some text (up to 2000 characters)' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.sync_sub_message_cols() from public, anon;
drop trigger if exists sub_messages_sync_cols on public.sub_messages;
create trigger sub_messages_sync_cols before insert or update on public.sub_messages
  for each row execute function public.sync_sub_message_cols();

-- Messages are never changed once sent.
create or replace function public.sub_messages_no_edit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.data is distinct from old.data or new.deleted_at is distinct from old.deleted_at then
    raise exception 'permission denied: a sent message can''t be changed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.sub_messages_no_edit() from public, anon;
drop trigger if exists sub_messages_no_edit on public.sub_messages;
create trigger sub_messages_no_edit before update on public.sub_messages
  for each row execute function public.sub_messages_no_edit();

-- Deck Plus PMs and the office: every conversation; they write as 'pm' under their own name.
drop policy if exists sub_messages_staff_select on public.sub_messages;
create policy sub_messages_staff_select on public.sub_messages for select
  using (org_id = auth_org() and auth_role() in ('pm','office','admin'));
drop policy if exists sub_messages_staff_insert on public.sub_messages;
create policy sub_messages_staff_insert on public.sub_messages for insert
  with check (org_id = auth_org() and auth_role() in ('pm','office','admin')
              and data->>'from' = 'pm' and data->>'byId' = auth.uid()::text);
-- (the app saves with "insert, or update if it exists"; the update path is allowed
--  so a retry of the same message succeeds, and the trigger above keeps it unchanged)
drop policy if exists sub_messages_staff_update on public.sub_messages;
create policy sub_messages_staff_update on public.sub_messages for update
  using (org_id = auth_org() and auth_role() in ('pm','office','admin'))
  with check (org_id = auth_org() and auth_role() in ('pm','office','admin'));

-- A sub's manager: their own conversations, on jobs they are booked on, as themself.
drop policy if exists sub_messages_sub_select on public.sub_messages;
create policy sub_messages_sub_select on public.sub_messages for select
  using (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid() and deleted_at is null);
drop policy if exists sub_messages_sub_insert on public.sub_messages;
create policy sub_messages_sub_insert on public.sub_messages for insert
  with check (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid()
              and data->>'from' = 'sub' and data->>'byId' = auth.uid()::text
              and exists (select 1 from public.sub_tasks t
                          where t.org_id = sub_messages.org_id and t.deleted_at is null and t.owner_id = auth.uid()
                            and t.data->>'proposalId' = sub_messages.proposal_id and t.data->>'subId' = sub_messages.sub_id));
drop policy if exists sub_messages_sub_update on public.sub_messages;
create policy sub_messages_sub_update on public.sub_messages for update
  using (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid())
  with check (org_id = auth_org() and auth_role() = 'sub' and owner_id = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'sub_messages') then
    alter publication supabase_realtime add table public.sub_messages;
  end if;
end $$;
