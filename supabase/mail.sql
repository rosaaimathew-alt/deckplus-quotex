-- ── Connected mailboxes ──────────────────────────────────────────────────────
-- Each team member connects their own sending mailbox in Settings (address +
-- app password, tested before it is saved). Quotes and reminders they send go
-- out from that address; one mailbox per company can be marked as the company
-- mailbox for emails no one person sends (signing codes).
--
-- The password is encrypted by the API before it reaches the database
-- (AES-256-GCM, key derived from ESIGN_DB_SECRET), and the table is closed to
-- the public and signed-in API keys. Only the server can read or write it,
-- through the functions below, which require the server secret every time.
--
-- server_vault holds other server-only secrets (the Google sign-in token).

create table if not exists public.mail_accounts (
  user_id         uuid primary key,
  org_id          uuid,
  email           text not null,
  provider        text,
  host            text not null,
  port            integer not null default 587,
  username        text not null,
  secret_enc      text not null,
  company_default boolean not null default false,
  updated_at      timestamptz not null default now()
);
alter table public.mail_accounts enable row level security;
revoke all on public.mail_accounts from public, anon, authenticated;

create table if not exists public.server_vault (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);
alter table public.server_vault enable row level security;
revoke all on public.server_vault from public, anon, authenticated;

create or replace function public.server_secret_ok(s text)
returns boolean language sql stable security definer set search_path = public as $$
  select s is not null and exists (select 1 from public.app_secrets where name = 'esign' and value = s)
$$;
revoke all on function public.server_secret_ok(text) from public, anon, authenticated;

-- One mailbox by its owner.
create or replace function public.mail_account_get_s(p_user uuid, s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select to_jsonb(m) from public.mail_accounts m where m.user_id = p_user and m.secret_enc <> '');
end $$;

-- The mailbox of the team member with this email address (who sent a contract).
create or replace function public.mail_account_by_email_s(p_email text, s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select to_jsonb(m) from public.mail_accounts m
          left join public.org_members om on om.user_id = m.user_id
          where m.secret_enc <> '' and (lower(m.email) = lower(p_email) or lower(om.email) = lower(p_email))
          order by m.updated_at desc limit 1);
end $$;

-- The company mailbox: the one marked for company emails, else an office /
-- admin member's, else the most recently connected one. p_org null = any.
create or replace function public.mail_account_company_s(p_org uuid, s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select to_jsonb(m) from public.mail_accounts m
          left join public.org_members om on om.user_id = m.user_id
          where m.secret_enc <> '' and (p_org is null or m.org_id = p_org)
          order by m.company_default desc, (om.role in ('office', 'admin')) desc nulls last, m.updated_at desc
          limit 1);
end $$;

create or replace function public.mail_account_set_s(
  p_user uuid, p_org uuid, p_email text, p_provider text, p_host text, p_port integer,
  p_username text, p_secret_enc text, p_company_default boolean, s text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_company_default then
    update public.mail_accounts set company_default = false
     where company_default and user_id <> p_user and (org_id = p_org or (org_id is null and p_org is null));
  end if;
  insert into public.mail_accounts (user_id, org_id, email, provider, host, port, username, secret_enc, company_default, updated_at)
  values (p_user, p_org, p_email, p_provider, p_host, p_port, p_username, p_secret_enc, coalesce(p_company_default, false), now())
  on conflict (user_id) do update set
    org_id = excluded.org_id, email = excluded.email, provider = excluded.provider, host = excluded.host,
    port = excluded.port, username = excluded.username, secret_enc = excluded.secret_enc,
    company_default = excluded.company_default, updated_at = now();
end $$;

-- Disconnect: wipe the saved login. Rows with an empty secret count as not connected.
create or replace function public.mail_account_clear_s(p_user uuid, s text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.mail_accounts set secret_enc = '', username = '', company_default = false, updated_at = now() where user_id = p_user;
end $$;

create or replace function public.vault_get_s(k text, s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  return (select value from public.server_vault where key = k);
end $$;

create or replace function public.vault_set_s(k text, v jsonb, s text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.server_secret_ok(s) then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.server_vault (key, value, updated_at) values (k, v, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- The API reaches these with the public key; the secret check inside is the lock.
revoke all on function public.mail_account_get_s(uuid, text) from public;
revoke all on function public.mail_account_by_email_s(text, text) from public;
revoke all on function public.mail_account_company_s(uuid, text) from public;
revoke all on function public.mail_account_set_s(uuid, uuid, text, text, text, integer, text, text, boolean, text) from public;
revoke all on function public.mail_account_clear_s(uuid, text) from public;
revoke all on function public.vault_get_s(text, text) from public;
revoke all on function public.vault_set_s(text, jsonb, text) from public;
grant execute on function public.mail_account_get_s(uuid, text)          to anon, authenticated;
grant execute on function public.mail_account_by_email_s(text, text)     to anon, authenticated;
grant execute on function public.mail_account_company_s(uuid, text)      to anon, authenticated;
grant execute on function public.mail_account_set_s(uuid, uuid, text, text, text, integer, text, text, boolean, text) to anon, authenticated;
grant execute on function public.mail_account_clear_s(uuid, text)        to anon, authenticated;
grant execute on function public.vault_get_s(text, text)                 to anon, authenticated;
grant execute on function public.vault_set_s(text, jsonb, text)          to anon, authenticated;
