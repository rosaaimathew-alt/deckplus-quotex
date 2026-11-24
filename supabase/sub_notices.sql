-- ── Notices to every sub ─────────────────────────────────────────────────────
-- A message from the office to all subcontractors and painters ("invoices are
-- due a day early this week"). It shows on their app's home and Invoices
-- screens until it expires (src/sub/SubNotice.jsx), and goes to their phones
-- (a pop-up for those with alerts on, an email for the rest) at each time in
-- send_at: the database's scheduler (pg_cron, every 5 minutes) asks the app's
-- server to send what's due (api/_notice.js), with the run key in app_kv.

create table if not exists public.sub_notices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  title       text not null,
  body        text not null,
  title_es    text,
  body_es     text,
  expires_at  timestamptz not null,
  send_at     timestamptz[] not null default '{}',
  sent_at     timestamptz[] not null default '{}',
  results     jsonb not null default '[]',
  created_by  text,
  created_at  timestamptz not null default now()
);
create index if not exists sub_notices_org on public.sub_notices (org_id, expires_at);
alter table public.sub_notices enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sub_notices' and policyname = 'sub_notices_read') then
    create policy sub_notices_read on public.sub_notices for select to authenticated
      using (org_id = (select public.auth_org()) and expires_at > now());
  end if;
end $$;

-- The sends that are due, marked sent in the same step (so two runs can't send twice)
create or replace function public.notice_claim_due() returns setof public.sub_notices
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.sub_notices n
     set sent_at = n.sent_at || array(select t from unnest(n.send_at) t where t <= now() and t > now() - interval '2 hours' and not (t = any(n.sent_at)))
   where n.expires_at > now()
     and exists (select 1 from unnest(n.send_at) t where t <= now() and t > now() - interval '2 hours' and not (t = any(n.sent_at)))
  returning n.*;
end $$;
revoke all on function public.notice_claim_due() from public, anon, authenticated;
grant execute on function public.notice_claim_due() to service_role;

-- Every 5 minutes: when a send is due, ask the app's server to send it
create or replace function public.notice_tick() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if not exists (select 1 from public.sub_notices n, unnest(n.send_at) t
                  where n.expires_at > now() and t <= now() and t > now() - interval '2 hours' and not (t = any(n.sent_at))) then
    return;
  end if;
  select value #>> '{}' into k from public.app_kv where key = 'notice:runkey';
  if k is null then return; end if;
  perform net.http_post(
    url := 'https://www.deckplus.app/api/email',
    body := jsonb_build_object('action', 'notice-run'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notice-key', k),
    timeout_milliseconds := 60000);
end $$;
revoke all on function public.notice_tick() from public, anon, authenticated;
