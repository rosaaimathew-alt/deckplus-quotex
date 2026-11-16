-- ── Pop-up alerts on a phone (Web Push) ─────────────────────────────────────
-- Applied after mail.sql (idempotent: safe to re-run).
--
-- A phone that turned alerts on (src/lib/push.js) is one row here: the push
-- service address the phone's browser gave it, and the two keys only that
-- phone can read messages with. The server (api/_push.js) looks up the phones
-- of the people an alert goes to and posts an encrypted message to each.
--
--   anyone signed in   add or remove their own phone, through the two
--                      functions below; nobody reads the table directly
--   the server         reads phones by email and drops dead ones, with the
--                      server secret (mail.sql → server_secret_ok)

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  org_id     uuid not null,
  user_id    uuid not null,
  p256dh     text not null,
  auth       text not null,
  lang       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

-- This phone, for the signed-in person. Only a real push service's address
-- is accepted. A phone that changes hands moves to whoever signed in last.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_lang text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); my_org uuid := public.auth_org();
begin
  if uid is null or my_org is null then return false; end if;
  if p_endpoint is null or length(p_endpoint) > 1000
     or p_endpoint !~* '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/'
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,40}$' then
    return false;
  end if;
  insert into public.push_subscriptions (endpoint, org_id, user_id, p256dh, auth, lang)
  values (p_endpoint, my_org, uid, p_p256dh, p_auth, left(p_lang, 5))
  on conflict (endpoint) do update set org_id = excluded.org_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, lang = excluded.lang, updated_at = now();
  -- a person keeps their ten most recent phones
  delete from public.push_subscriptions where user_id = uid and endpoint not in (
    select endpoint from public.push_subscriptions where user_id = uid order by updated_at desc limit 10);
  return true;
end $$;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

create or replace function public.push_unsubscribe(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
  return true;
end $$;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_unsubscribe(text) to authenticated;

-- Server only: the phones of the team members with these email addresses.
create or replace function public.push_subs_s(p_emails text[], s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('email', lower(m.email), 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth, 'lang', ps.lang)), '[]'::jsonb)
          from public.push_subscriptions ps
          join public.org_members m on m.user_id = ps.user_id and m.org_id = ps.org_id
          where lower(m.email) = any (select lower(e) from unnest(p_emails) e));
end $$;

-- Server only: a phone whose push service says it is gone.
create or replace function public.push_drop_s(p_endpoint text, s text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end $$;

-- Server only: keep a vault value only if there is none yet, and hand back
-- what is kept (the app's push key pair is made once, whoever asks first).
create or replace function public.vault_init_s(k text, v jsonb, s text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.server_vault (key, value, updated_at) values (k, v, now()) on conflict (key) do nothing;
  return (select value from public.server_vault where key = k);
end $$;

-- Server only: the email of the team member who made a proposal (its owner),
-- so the server can tell them when their customer opens it.
create or replace function public.proposal_owner_email_s(p_proposal_id text, s text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select lower(m.email) from public.proposals p
          join public.org_members m on m.user_id = p.owner_id and m.org_id = p.org_id
          where p.id = p_proposal_id and p.deleted_at is null and coalesce(m.email, '') <> '' limit 1);
end $$;
revoke all on function public.proposal_owner_email_s(text, text) from public;
grant execute on function public.proposal_owner_email_s(text, text) to anon, authenticated;

-- The API reaches these with the public key; the secret check inside is the lock.
revoke all on function public.push_subs_s(text[], text) from public;
revoke all on function public.push_drop_s(text, text) from public;
revoke all on function public.vault_init_s(text, jsonb, text) from public;
grant execute on function public.push_subs_s(text[], text) to anon, authenticated;
grant execute on function public.push_drop_s(text, text) to anon, authenticated;
grant execute on function public.vault_init_s(text, jsonb, text) to anon, authenticated;
