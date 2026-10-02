-- ── E-sign evidence protection ──────────────────────────────────────────────
-- Applied after schema.sql. Signing records (contracts and change orders) are
-- legal evidence, so:
--   • they never expire and can never be deleted, by anyone, through the API;
--   • a signature, once saved, can't be changed or removed, and the signed
--     document content can't change after the link was created;
--   • only the serverless API can read or write them (it holds the e-sign
--     secret, stored in app_secrets) — the public anon key can't;
--   • every signing event (opened, consent, email code, signed, completed) is
--     written to esign_events, an append-only, hash-chained log: no row can be
--     updated or deleted, and each row's hash covers the previous row's, so any
--     tampering breaks the chain (see esign_verify_chain).
--
-- The secret itself is inserted separately (never committed):
--   insert into public.app_secrets (name, value) values ('esign', '<ESIGN_DB_SECRET>');
-- and enforcement is switched on with:
--   insert into public.app_secrets (name, value) values ('esign_enforce', 'on');

create table if not exists public.app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

create or replace function public.esign_protected_key(k text)
returns boolean language sql immutable as $$
  select k like 'sign:%' or k like 'link:%' or k like 'sign-by-contract:%'
      or k like 'co:%' or k like 'co-link:%' or k like 'otp:%'
$$;

create or replace function public.esign_secret_ok(s text)
returns boolean language sql stable security definer set search_path = public as $$
  select s is not null and exists (select 1 from public.app_secrets where name = 'esign' and value = s)
$$;

create or replace function public.esign_enforced()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_secrets where name = 'esign_enforce')
$$;

revoke all on function public.esign_secret_ok(text) from public, anon, authenticated;
revoke all on function public.esign_enforced() from public, anon, authenticated;

-- ── KV functions (replace the schema.sql versions) ──────────────────────────
drop function if exists public.kv_get(text);
drop function if exists public.kv_set(text, jsonb, integer);
drop function if exists public.kv_del(text);

create or replace function public.kv_get(k text, s text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; exp timestamptz;
begin
  if public.esign_protected_key(k) then
    if public.esign_enforced() and not public.esign_secret_ok(s) then
      raise exception 'Protected e-sign record' using errcode = '42501';
    end if;
    select value into v from public.app_kv where key = k;
    return v;   -- e-sign records never expire
  end if;
  select value, expires_at into v, exp from public.app_kv where key = k;
  if not found then return null; end if;
  if exp is not null and exp < now() then
    delete from public.app_kv where key = k;
    return null;
  end if;
  return v;
end $$;

create or replace function public.kv_set(k text, v jsonb, ttl_seconds integer default null, s text default null)
returns void language plpgsql security definer set search_path = public as $$
declare old jsonb;
begin
  if public.esign_protected_key(k) then
    if public.esign_enforced() and not public.esign_secret_ok(s) then
      raise exception 'Protected e-sign record' using errcode = '42501';
    end if;
    select value into old from public.app_kv where key = k for update;
    if found and old is not null then
      if k like 'link:%' or k like 'co-link:%' then
        if v is distinct from old then
          raise exception 'E-sign links are permanent and cannot be changed' using errcode = '42501';
        end if;
      elsif k like 'sign:%' or k like 'co:%' then
        if (old ? 'contractData') and (v -> 'contractData') is distinct from (old -> 'contractData') then
          raise exception 'The signed document cannot be changed' using errcode = '42501';
        end if;
        if (old ? 'coData') and (v -> 'coData') is distinct from (old -> 'coData') then
          raise exception 'The signed document cannot be changed' using errcode = '42501';
        end if;
        if (old ? 'docHash') and (v -> 'docHash') is distinct from (old -> 'docHash') then
          raise exception 'The document hash cannot be changed' using errcode = '42501';
        end if;
        if coalesce(old -> 'signatures', '{}'::jsonb) <> '{}'::jsonb
           and not (coalesce(v -> 'signatures', '{}'::jsonb) @> (old -> 'signatures')) then
          raise exception 'Signatures cannot be changed or removed' using errcode = '42501';
        end if;
      end if;
    end if;
    -- e-sign records never get an expiry, whatever the caller asks for
    insert into public.app_kv (key, value, expires_at, updated_at)
    values (k, v, null, now())
    on conflict (key) do update set value = excluded.value, expires_at = null, updated_at = now();
    return;
  end if;
  insert into public.app_kv (key, value, expires_at, updated_at)
  values (k, v, case when ttl_seconds is null then null else now() + make_interval(secs => ttl_seconds) end, now())
  on conflict (key) do update
    set value = excluded.value, expires_at = excluded.expires_at, updated_at = now();
end $$;

create or replace function public.kv_del(k text, s text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.esign_protected_key(k) then
    raise exception 'E-sign records cannot be deleted' using errcode = '42501';
  end if;
  delete from public.app_kv where key = k;
end $$;

revoke all on function public.kv_get(text, text) from public;
revoke all on function public.kv_set(text, jsonb, integer, text) from public;
revoke all on function public.kv_del(text, text) from public;
grant execute on function public.kv_get(text, text) to anon, authenticated, service_role;
grant execute on function public.kv_set(text, jsonb, integer, text) to anon, authenticated, service_role;
grant execute on function public.kv_del(text, text) to anon, authenticated, service_role;

-- Belt and braces at the table level: no API role can touch e-sign rows
-- directly, and even the owner can't delete them or give them an expiry.
create or replace function public.app_kv_protect()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if public.esign_protected_key(old.key) then
      raise exception 'E-sign records cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if public.esign_protected_key(new.key) then new.expires_at := null; end if;
  return new;
end $$;
drop trigger if exists app_kv_protect on public.app_kv;
create trigger app_kv_protect before insert or update or delete on public.app_kv
  for each row execute function public.app_kv_protect();

-- Records written before this existed had a 60/90-day expiry: clear it.
update public.app_kv set expires_at = null where public.esign_protected_key(key) and expires_at is not null;

-- ── Append-only, hash-chained signing audit log ─────────────────────────────
create table if not exists public.esign_events (
  id           bigint generated always as identity primary key,
  seq          bigint not null unique,
  record_type  text not null check (record_type in ('contract', 'change_order')),
  record_id    text not null,
  role         text,
  event        text not null,
  at_ms        bigint not null,          -- server clock, milliseconds since epoch
  ip           text,                     -- the signer's own address (first hop)
  ip_chain     text,                     -- the full forwarded-for chain
  user_agent   text,
  device       jsonb,                    -- platform, screen, language, time zone…
  geo          jsonb,                    -- city / region / country from the edge
  signer_name  text,
  signer_email text,
  doc_hash     text,                     -- SHA-256 of the document at that moment
  detail       jsonb,
  prev_hash    text not null,
  event_hash   text not null unique
);
create index if not exists esign_events_record on public.esign_events (record_type, record_id, seq);
alter table public.esign_events enable row level security;
revoke all on public.esign_events from anon, authenticated;

create or replace function public.esign_event_digest(prev text, e public.esign_events)
returns text language sql immutable as $$
  select encode(sha256(convert_to(prev || '|' || e.seq::text || '|' || jsonb_build_object(
    'record_type', e.record_type, 'record_id', e.record_id, 'role', e.role, 'event', e.event,
    'at_ms', e.at_ms, 'ip', e.ip, 'ip_chain', e.ip_chain, 'user_agent', e.user_agent,
    'device', e.device, 'geo', e.geo, 'signer_name', e.signer_name, 'signer_email', e.signer_email,
    'doc_hash', e.doc_hash, 'detail', e.detail)::text, 'UTF8')), 'hex')
$$;

-- The server stamps the time, the sequence and the chain — never the caller.
create or replace function public.esign_events_chain()
returns trigger language plpgsql as $$
declare prev text; last_seq bigint;
begin
  perform pg_advisory_xact_lock(hashtext('esign_events_chain'));
  select seq, event_hash into last_seq, prev from public.esign_events order by seq desc limit 1;
  new.seq       := coalesce(last_seq, 0) + 1;
  new.at_ms     := floor(extract(epoch from clock_timestamp()) * 1000);
  new.prev_hash := coalesce(prev, repeat('0', 64));
  new.event_hash := public.esign_event_digest(new.prev_hash, new);
  return new;
end $$;
drop trigger if exists esign_events_chain on public.esign_events;
create trigger esign_events_chain before insert on public.esign_events
  for each row execute function public.esign_events_chain();

create or replace function public.esign_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'The e-sign audit log is append-only' using errcode = '42501';
end $$;
drop trigger if exists esign_events_no_update on public.esign_events;
create trigger esign_events_no_update before update or delete on public.esign_events
  for each row execute function public.esign_events_immutable();
drop trigger if exists esign_events_no_truncate on public.esign_events;
create trigger esign_events_no_truncate before truncate on public.esign_events
  for each statement execute function public.esign_events_immutable();

create or replace function public.esign_log(
  s text, p_record_type text, p_record_id text, p_role text, p_event text,
  p_ip text default null, p_ip_chain text default null, p_user_agent text default null,
  p_device jsonb default null, p_geo jsonb default null, p_signer_name text default null,
  p_signer_email text default null, p_doc_hash text default null, p_detail jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.esign_events;
begin
  if not public.esign_secret_ok(s) then
    raise exception 'Not authorized to write the e-sign log' using errcode = '42501';
  end if;
  insert into public.esign_events (seq, record_type, record_id, role, event, at_ms, ip, ip_chain, user_agent,
                                   device, geo, signer_name, signer_email, doc_hash, detail, prev_hash, event_hash)
  values (0, p_record_type, p_record_id, p_role, p_event, 0, p_ip, p_ip_chain, left(p_user_agent, 1000),
          p_device, p_geo, p_signer_name, p_signer_email, p_doc_hash, p_detail, '', '')
  returning * into r;
  return jsonb_build_object('seq', r.seq, 'at_ms', r.at_ms, 'event_hash', r.event_hash);
end $$;

create or replace function public.esign_events_for(s text, p_record_type text, p_record_id text)
returns setof public.esign_events language plpgsql stable security definer set search_path = public as $$
begin
  if not public.esign_secret_ok(s) then
    raise exception 'Not authorized to read the e-sign log' using errcode = '42501';
  end if;
  return query select * from public.esign_events
    where record_type = p_record_type and record_id = p_record_id order by seq;
end $$;

-- Re-computes every row's hash and link. ok = false names the first bad row.
create or replace function public.esign_verify_chain(s text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.esign_events; prev text := repeat('0', 64); n bigint := 0; expect_seq bigint := 1;
begin
  if not public.esign_secret_ok(s) then
    raise exception 'Not authorized to read the e-sign log' using errcode = '42501';
  end if;
  for e in select * from public.esign_events order by seq loop
    n := n + 1;
    if e.seq <> expect_seq or e.prev_hash <> prev or e.event_hash <> public.esign_event_digest(prev, e) then
      return jsonb_build_object('ok', false, 'checked', n, 'first_bad_seq', e.seq);
    end if;
    prev := e.event_hash;
    expect_seq := expect_seq + 1;
  end loop;
  return jsonb_build_object('ok', true, 'checked', n, 'head', prev);
end $$;

revoke all on function public.esign_log(text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, jsonb) from public;
revoke all on function public.esign_events_for(text, text, text) from public;
revoke all on function public.esign_verify_chain(text) from public;
grant execute on function public.esign_log(text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.esign_events_for(text, text, text) to anon, authenticated, service_role;
grant execute on function public.esign_verify_chain(text) to anon, authenticated, service_role;
