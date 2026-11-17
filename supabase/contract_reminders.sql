-- ── Reminders to sign a contract (Contracts › Send to Client) ───────────────
-- Applied after esign.sql, mail.sql and rls_speed.sql (idempotent).
--
-- A contract sent for signature can nudge the customer by email every few
-- days until they sign. One row per job: how often, how many have gone, when
-- the last one went. The daily job on the server (api/_contractReminders.js,
-- run by the cron in vercel.json) asks which are due, sends them, and stamps
-- each one. Kept in its own table, not on the proposal, so the server's stamp
-- and someone editing the contract never overwrite each other.
--
--   office / admin         set or stop a reminder on any job
--   rep / pm               on their own jobs (the same jobs they may edit)
--   the server             reads what is due and stamps it, with the server
--                          secret (mail.sql → server_secret_ok)

create table if not exists public.contract_reminders (
  proposal_id  text primary key,
  org_id       uuid not null,
  every_days   integer not null check (every_days between 1 and 30),
  max_count    integer not null default 3 check (max_count between 1 and 10),
  sent_count   integer not null default 0,
  last_sent_at timestamptz,
  started_at   timestamptz not null default now(),
  email        text,
  set_by       uuid,
  updated_at   timestamptz not null default now()
);
alter table public.contract_reminders enable row level security;
revoke all on public.contract_reminders from public, anon, authenticated;

-- May the signed-in person change this job? (the proposals update rule)
create or replace function public.can_edit_proposal(p_proposal_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.proposals p
    where p.id = p_proposal_id and p.org_id = public.auth_org() and p.deleted_at is null
      and (public.auth_role() in ('office', 'admin')
           or (public.auth_role() = 'rep' and p.owner_id = auth.uid())
           or (public.auth_role() = 'pm' and p.pm_id = auth.uid())))
$$;
revoke all on function public.can_edit_proposal(text) from public, anon;
grant execute on function public.can_edit_proposal(text) to authenticated;

-- Turn reminders on (every N days), change them, or off (0). Turning them on
-- or changing them starts the count again from today.
create or replace function public.contract_reminder_set(p_proposal_id text, p_every_days integer, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.contract_reminders;
begin
  if not public.can_edit_proposal(p_proposal_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(p_every_days, 0) <= 0 then
    delete from public.contract_reminders where proposal_id = p_proposal_id;
    return null;
  end if;
  insert into public.contract_reminders (proposal_id, org_id, every_days, email, set_by)
  values (p_proposal_id, public.auth_org(), least(p_every_days, 30), nullif(trim(lower(p_email)), ''), auth.uid())
  on conflict (proposal_id) do update set every_days = excluded.every_days, email = coalesce(excluded.email, public.contract_reminders.email),
    set_by = excluded.set_by, sent_count = 0, last_sent_at = null, started_at = now(), updated_at = now()
  returning * into r;
  return jsonb_build_object('proposalId', r.proposal_id, 'everyDays', r.every_days, 'maxCount', r.max_count, 'sentCount', r.sent_count, 'lastSentAt', r.last_sent_at, 'email', r.email);
end $$;
revoke all on function public.contract_reminder_set(text, integer, text) from public, anon;
grant execute on function public.contract_reminder_set(text, integer, text) to authenticated;

-- The reminders on the jobs the signed-in person can see.
create or replace function public.contract_reminders_mine()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); uid uuid := auth.uid();
begin
  if my_org is null or uid is null or r is null or r not in ('office', 'admin', 'rep', 'pm') then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('proposalId', c.proposal_id, 'everyDays', c.every_days, 'maxCount', c.max_count,
                    'sentCount', c.sent_count, 'lastSentAt', c.last_sent_at, 'email', c.email)), '[]'::jsonb)
          from public.contract_reminders c
          join public.proposals p on p.id = c.proposal_id and p.org_id = my_org and p.deleted_at is null
          where c.org_id = my_org
            and (r in ('office', 'admin') or (r = 'rep' and p.owner_id = uid) or (r = 'pm' and p.pm_id = uid)));
end $$;
revoke all on function public.contract_reminders_mine() from public, anon;
grant execute on function public.contract_reminders_mine() to authenticated;

-- Server only: the reminders due today. Due = turned on, fewer sent than the
-- limit, at least every_days days since the last one (or since it was turned
-- on), the job still there, and the customer has not signed: not marked signed
-- on the job, and no client signature on the contract as it was last sent (a
-- replaced send points at the newer one). Hands back what the email needs and
-- nothing else: who to write to, the contract number, the customer's own
-- signing link token, whether they have opened it, and who made the contract.
create or replace function public.contract_reminders_due_s(s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c record; p public.proposals; d jsonb; rec jsonb; nxt jsonb; rid text; maker public.org_members; out jsonb := '[]'::jsonb; to_email text;
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  for c in select * from public.contract_reminders
           where sent_count < max_count and current_date - (coalesce(last_sent_at, started_at))::date >= every_days
           order by coalesce(last_sent_at, started_at) limit 50 loop
    select * into p from public.proposals where id = c.proposal_id and org_id = c.org_id and deleted_at is null;
    continue when not found;
    d := case when jsonb_typeof(p.data->'contractDraft') = 'object' then p.data->'contractDraft' else '{}'::jsonb end;
    continue when coalesce((d->>'signed')::boolean, false) or (d->>'signRecordId') is null;
    rid := d->>'signRecordId';
    select value into rec from public.app_kv where key = 'sign:' || rid and (expires_at is null or expires_at > now());
    for hop in 1..10 loop
      exit when rec is null or (rec->>'status') is distinct from 'superseded' or (rec->>'supersededBy') is null;
      select value into nxt from public.app_kv where key = 'sign:' || (rec->>'supersededBy') and (expires_at is null or expires_at > now());
      exit when nxt is null;
      rid := rec->>'supersededBy'; rec := nxt;
    end loop;
    continue when rec is null or (rec->>'status') in ('signed', 'superseded') or (rec->'signatures'->'client') is not null
      or (rec->'roleTokens'->>'client') is null or (rec->'contractData'->>'proposalId') is distinct from p.id;
    to_email := coalesce(nullif(c.email, ''), nullif(trim(lower(p.data->>'email')), ''));
    continue when to_email is null or to_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
    select * into maker from public.org_members m where m.org_id = c.org_id and lower(m.email) = lower(rec->>'createdBy') limit 1;
    if maker.user_id is null then select * into maker from public.org_members m where m.org_id = c.org_id and m.user_id = p.owner_id limit 1; end if;
    out := out || jsonb_build_object(
      'proposalId', c.proposal_id, 'to', to_email, 'client', coalesce(rec->'contractData'->'dp'->'values'->>'clientName', p.data->>'client'),
      'contractNum', coalesce(rec->>'contractNum', d->>'contractNum'), 'token', rec->'roleTokens'->>'client',
      'opened', exists (select 1 from public.esign_events e where e.record_type = 'contract' and e.record_id = rid and e.event = 'opened' and e.role = 'client'),
      'number', c.sent_count + 1, 'makerEmail', maker.email, 'makerName', maker.display_name, 'makerId', maker.user_id);
  end loop;
  return out;
end $$;

-- Server only: one reminder went out.
create or replace function public.contract_reminder_stamp_s(p_proposal_id text, s text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.contract_reminders set sent_count = sent_count + 1, last_sent_at = now(), updated_at = now() where proposal_id = p_proposal_id;
end $$;

-- The API reaches these with the public key; the secret check inside is the lock.
revoke all on function public.contract_reminders_due_s(text) from public;
revoke all on function public.contract_reminder_stamp_s(text, text) from public;
grant execute on function public.contract_reminders_due_s(text) to anon, authenticated;
grant execute on function public.contract_reminder_stamp_s(text, text) to anon, authenticated;
