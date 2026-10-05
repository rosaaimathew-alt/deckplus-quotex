-- ── Invite-only sign-up ─────────────────────────────────────────────────────
-- Applied after schema.sql. An admin (or the office, for non-admin roles)
-- creates an invite for an email + role; the person opens /signup?code=… and
-- sets their own name and password. claim_invite() then adds them to the team
-- — only if their login email matches the invite. Without an invite, a new
-- login has no team and sees nothing.

create table if not exists public.org_invites (
  code         text primary key,
  org_id       uuid not null references public.orgs(id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('rep','pm','office','admin')),
  display_name text,
  invited_by   uuid,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '14 days',
  used_at      timestamptz,
  used_by      uuid,
  revoked_at   timestamptz
);
create index if not exists org_invites_email on public.org_invites (lower(email));
alter table public.org_invites enable row level security;
revoke all on public.org_invites from anon, authenticated;

create or replace function public.create_invite(p_email text, p_role text, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_role text := public.auth_role(); my_org uuid := public.auth_org(); c text; e text := lower(trim(p_email)); r public.org_invites;
begin
  if my_org is null or my_role not in ('admin','office') then
    raise exception 'Only an admin or the office can invite people' using errcode = '42501';
  end if;
  if p_role = 'admin' and my_role <> 'admin' then
    raise exception 'Only an admin can invite another admin' using errcode = '42501';
  end if;
  if e is null or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = my_org and lower(u.email) = e) then
    raise exception 'That email already has an account on your team' using errcode = '23505';
  end if;
  c := replace(gen_random_uuid()::text, '-', '');
  if c is not null then
    insert into public.org_invites (code, org_id, email, role, display_name, invited_by)
    values (c, my_org, e, p_role, nullif(trim(p_display_name), ''), auth.uid())
    returning * into r;
  end if;
  return jsonb_build_object('code', r.code, 'email', r.email, 'role', r.role, 'display_name', r.display_name, 'expires_at', r.expires_at);
end $$;

create or replace function public.list_invites()
returns setof public.org_invites language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_role() not in ('admin','office') then
    raise exception 'Only an admin or the office can see invites' using errcode = '42501';
  end if;
  return query select * from public.org_invites
    where org_id = public.auth_org() and used_at is null and revoked_at is null and expires_at > now()
    order by created_at desc;
end $$;

create or replace function public.revoke_invite(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() not in ('admin','office') then
    raise exception 'Only an admin or the office can cancel invites' using errcode = '42501';
  end if;
  if p_code is not null then
    update public.org_invites set revoked_at = now()
      where code = p_code and org_id = public.auth_org() and used_at is null;
  end if;
end $$;

-- Public: what an invite link is for (the code itself is the secret).
create or replace function public.invite_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r public.org_invites; org_name text;
begin
  select * into r from public.org_invites where code = p_code;
  if not found then return jsonb_build_object('valid', false, 'reason', 'This invite link is not valid.'); end if;
  if r.revoked_at is not null then return jsonb_build_object('valid', false, 'reason', 'This invite was cancelled. Ask the office for a new one.'); end if;
  if r.used_at is not null then return jsonb_build_object('valid', false, 'reason', 'This invite has already been used. Sign in instead.'); end if;
  if r.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'This invite has expired. Ask the office for a new one.'); end if;
  select name into org_name from public.orgs where id = r.org_id;
  return jsonb_build_object('valid', true, 'email', r.email, 'role', r.role, 'display_name', r.display_name, 'org', org_name);
end $$;

-- Signed-in person with no team yet: join the team their invite is for.
create or replace function public.claim_invite(p_code text default null, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); my_email text; meta_name text; r public.org_invites; existing public.org_members;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into existing from public.org_members where user_id = uid limit 1;
  if found then return jsonb_build_object('joined', true, 'org_id', existing.org_id, 'role', existing.role); end if;
  select lower(email), raw_user_meta_data->>'display_name' into my_email, meta_name from auth.users where id = uid;
  select * into r from public.org_invites
    where lower(email) = my_email and used_at is null and revoked_at is null and expires_at > now()
      and (p_code is null or code = p_code)
    order by created_at desc limit 1;
  if not found then return jsonb_build_object('joined', false); end if;
  if r.code is not null then
    insert into public.org_members (user_id, org_id, role, display_name, email)
    values (uid, r.org_id, r.role,
            coalesce(nullif(trim(p_name), ''), nullif(trim(meta_name), ''), r.display_name, split_part(my_email, '@', 1)),
            my_email);
    update public.org_invites set used_at = now(), used_by = uid where code = r.code;
  end if;
  return jsonb_build_object('joined', true, 'org_id', r.org_id, 'role', r.role);
end $$;

revoke all on function public.create_invite(text, text, text) from public, anon;
revoke all on function public.list_invites() from public, anon;
revoke all on function public.revoke_invite(text) from public, anon;
revoke all on function public.claim_invite(text, text) from public, anon;
grant execute on function public.create_invite(text, text, text) to authenticated;
grant execute on function public.list_invites() to authenticated;
grant execute on function public.revoke_invite(text) to authenticated;
grant execute on function public.claim_invite(text, text) to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
