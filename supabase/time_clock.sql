-- ── Painters' time clock ─────────────────────────────────────────────────────
-- Applied after paint_crew.sql (idempotent).
--
-- A painter (a sub login put on paint jobs by the paint PM) clocks in and out
-- in the sub app. Every punch carries the phone's location, and the database
-- itself decides whether they are at the job:
--
--   clock in    only within tc_settings.radius_m of one of their paint jobs
--               (the nearest one is the job they clocked in at)
--   location    while clocked in, the app sends the phone's location every
--               30 minutes, and whenever the app is opened again
--   clock out   only at the job; a clock out away from it is refused (and
--               kept, so the office sees the attempt)
--   4:30        a shift still open at the end of its day is closed at 4:30 PM
--               (tc_settings.day_end), marked auto_out
--
-- Hours go to the office (Money › Time clock) by pay week: Wednesday through
-- Tuesday, emailed on Wednesday morning to tc_settings.payroll_to
-- (api/_timeclock.js, from the daily cron).
--
-- Where each job is: job_sites, one point per job, found from the job's
-- address by the server (api/_timeclock.js). Nobody can type a job's location
-- in, so a painter can't move the job to where they are.
--
-- No one writes these tables directly: only the functions below (security
-- definer) and the server (service key).

create table if not exists public.tc_settings (
  org_id      uuid primary key references public.orgs(id) on delete cascade,
  payroll_to  text[] not null default '{}',
  radius_m    integer not null default 300 check (radius_m between 50 and 2000),
  max_acc_m   integer not null default 200 check (max_acc_m between 20 and 2000),
  day_end     time not null default '16:30',
  tz          text not null default 'America/New_York',
  last_payroll_week date,
  updated_at  timestamptz not null default now()
);

create table if not exists public.job_sites (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  proposal_id text not null,
  address     text not null,
  lat         double precision,
  lng         double precision,
  source      text,             -- 'census' | 'osm' | null when the address wasn't found
  found_at    timestamptz not null default now(),
  primary key (org_id, proposal_id)
);

create table if not exists public.time_shifts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  user_id      uuid not null,
  worker       text,
  proposal_id  text not null,
  task_id      text,
  client       text,
  address      text,
  clock_in_at  timestamptz not null default now(),
  in_lat double precision, in_lng double precision, in_acc double precision, in_dist_m double precision,
  clock_out_at timestamptz,
  out_lat double precision, out_lng double precision, out_acc double precision, out_dist_m double precision,
  auto_out     boolean not null default false,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists time_shifts_org_in on public.time_shifts (org_id, clock_in_at);
create index if not exists time_shifts_user_open on public.time_shifts (user_id) where clock_out_at is null;
-- One open shift per person
create unique index if not exists time_shifts_one_open on public.time_shifts (user_id) where clock_out_at is null;

create table if not exists public.time_pings (
  id        bigserial primary key,
  org_id    uuid not null references public.orgs(id) on delete cascade,
  user_id   uuid not null,
  shift_id  uuid references public.time_shifts(id) on delete cascade,
  kind      text not null check (kind in ('in', 'ping', 'out', 'auto_out', 'in_refused', 'out_refused')),
  at        timestamptz not null default now(),
  lat double precision, lng double precision, acc double precision,
  dist_m    double precision,
  on_site   boolean,
  proposal_id text
);
create index if not exists time_pings_shift on public.time_pings (shift_id, at);
create index if not exists time_pings_org_at on public.time_pings (org_id, at);

alter table public.tc_settings enable row level security;
alter table public.job_sites   enable row level security;
alter table public.time_shifts enable row level security;
alter table public.time_pings  enable row level security;

drop policy if exists tc_settings_read on public.tc_settings;
create policy tc_settings_read on public.tc_settings for select
  using (org_id = auth_org() and auth_role() in ('office', 'admin', 'paint'));
drop policy if exists job_sites_read on public.job_sites;
create policy job_sites_read on public.job_sites for select
  using (org_id = auth_org() and auth_role() in ('office', 'admin', 'pm', 'paint'));
drop policy if exists time_shifts_read on public.time_shifts;
create policy time_shifts_read on public.time_shifts for select
  using (org_id = auth_org() and (user_id = auth.uid() or auth_role() in ('office', 'admin', 'paint')));
drop policy if exists time_pings_read on public.time_pings;
create policy time_pings_read on public.time_pings for select
  using (org_id = auth_org() and (user_id = auth.uid() or auth_role() in ('office', 'admin', 'paint')));
revoke insert, update, delete on public.tc_settings, public.job_sites, public.time_shifts, public.time_pings from anon, authenticated;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.tc_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null else
    2 * 6371000 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) end
$$;

create or replace function public.tc_cfg(p_org uuid) returns public.tc_settings
language plpgsql stable security definer set search_path = public as $$
declare s public.tc_settings;
begin
  select * into s from public.tc_settings where org_id = p_org;
  if not found then s.org_id := p_org; s.payroll_to := '{}'; s.radius_m := 300; s.max_acc_m := 200; s.day_end := '16:30'; s.tz := 'America/New_York'; end if;
  return s;
end $$;
revoke all on function public.tc_cfg(uuid) from public, anon, authenticated;

-- A shift still open after the day it started is closed at the day's end
-- (4:30 PM), or at its own start if it started after that. p_user null = the
-- whole company. Returns how many were closed.
create or replace function public.tc_close_stale(p_org uuid, p_user uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare c public.tc_settings := public.tc_cfg(p_org); n integer;
begin
  with closed as (
    update public.time_shifts s
       set clock_out_at = greatest(s.clock_in_at, (((s.clock_in_at at time zone c.tz)::date + c.day_end) at time zone c.tz)),
           auto_out = true
     where s.org_id = p_org and s.clock_out_at is null
       and (p_user is null or s.user_id = p_user)
       and (s.clock_in_at at time zone c.tz)::date < (now() at time zone c.tz)::date
    returning s.*
  )
  insert into public.time_pings (org_id, user_id, shift_id, kind, at, proposal_id)
  select org_id, user_id, id, 'auto_out', clock_out_at, proposal_id from closed;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.tc_close_stale(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tc_close_stale(uuid, uuid) to service_role;   -- the daily cron

-- The painter's paint jobs, each with where it is and how far the phone is.
create or replace function public.tc_my_jobs(p_lat double precision default null, p_lng double precision default null)
returns table (task_id text, proposal_id text, client text, address text, lat double precision, lng double precision, mapped boolean, dist_m double precision)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct on (t.data->>'proposalId') t.id, t.data->>'proposalId' as pid, t.data->>'client' as client, t.data->>'address' as address
    from public.sub_tasks t
    where t.org_id = public.auth_org() and t.deleted_at is null
      and coalesce((t.data->>'paint')::boolean, false)
      and (t.crew_id = auth.uid() or t.owner_id = auth.uid())
      and nullif(t.data->>'proposalId', '') is not null
    order by t.data->>'proposalId', t.updated_at desc
  )
  select m.id, m.pid, m.client, coalesce(js.address, m.address), js.lat, js.lng, js.lat is not null,
         public.tc_distance_m(p_lat, p_lng, js.lat, js.lng)
  from mine m left join public.job_sites js on js.org_id = public.auth_org() and js.proposal_id = m.pid
$$;
revoke all on function public.tc_my_jobs(double precision, double precision) from public, anon, authenticated;

create or replace function public.tc_shift_json(s public.time_shifts) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', s.id, 'proposalId', s.proposal_id, 'client', s.client, 'address', s.address,
    'in', s.clock_in_at, 'out', s.clock_out_at, 'autoOut', s.auto_out, 'inDist', round(s.in_dist_m), 'outDist', round(s.out_dist_m),
    'hours', round((extract(epoch from (coalesce(s.clock_out_at, now()) - s.clock_in_at)) / 3600)::numeric, 2))
$$;

-- Only a painter: a sub login on at least one paint job.
create or replace function public.tc_need_painter() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.auth_org() is null or public.auth_role() is distinct from 'sub' then
    raise exception 'Only painters use the time clock' using errcode = '42501';
  end if;
end $$;
revoke all on function public.tc_need_painter() from public, anon, authenticated;

-- ── What the painter's screen shows ─────────────────────────────────────────
create or replace function public.timeclock_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); c public.tc_settings; o public.time_shifts; last_at timestamptz; today date;
begin
  perform public.tc_need_painter();
  c := public.tc_cfg(my_org);
  perform public.tc_close_stale(my_org, auth.uid());
  today := (now() at time zone c.tz)::date;
  select * into o from public.time_shifts where user_id = auth.uid() and clock_out_at is null limit 1;
  select max(at) into last_at from public.time_pings where user_id = auth.uid() and shift_id = o.id;
  return jsonb_build_object(
    'open', case when o.id is null then null else public.tc_shift_json(o) end,
    'lastPing', last_at,
    'today', coalesce((select jsonb_agg(public.tc_shift_json(s) order by s.clock_in_at) from public.time_shifts s
                        where s.user_id = auth.uid() and (s.clock_in_at at time zone c.tz)::date = today), '[]'::jsonb),
    'week', coalesce((select round(sum(extract(epoch from (coalesce(s.clock_out_at, now()) - s.clock_in_at)) / 3600)::numeric, 2)
                      from public.time_shifts s where s.user_id = auth.uid()
                        and (s.clock_in_at at time zone c.tz)::date >= today - ((extract(dow from today)::int - 3 + 7) % 7)), 0),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('proposalId', j.proposal_id, 'client', j.client, 'address', j.address, 'mapped', j.mapped)) from public.tc_my_jobs() j), '[]'::jsonb),
    'radius', c.radius_m, 'dayEnd', to_char(c.day_end, 'HH24:MI'));
end $$;
revoke all on function public.timeclock_me() from public, anon;
grant execute on function public.timeclock_me() to authenticated;

-- ── Clock in: at the nearest of their paint jobs, or not at all ─────────────
create or replace function public.timeclock_in(p_lat double precision, p_lng double precision, p_acc double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); c public.tc_settings; j record; o public.time_shifts; s public.time_shifts; nm text; unmapped integer;
begin
  perform public.tc_need_painter();
  c := public.tc_cfg(my_org);
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    return jsonb_build_object('ok', false, 'reason', 'no_location');
  end if;
  if p_acc is null or p_acc > c.max_acc_m then
    return jsonb_build_object('ok', false, 'reason', 'weak_gps', 'acc', round(p_acc));
  end if;
  perform public.tc_close_stale(my_org, auth.uid());
  select * into o from public.time_shifts where user_id = auth.uid() and clock_out_at is null limit 1;
  if o.id is not null then return jsonb_build_object('ok', true, 'already', true, 'shift', public.tc_shift_json(o)); end if;

  select * into j from public.tc_my_jobs(p_lat, p_lng) where mapped order by dist_m limit 1;
  select count(*) into unmapped from public.tc_my_jobs() where not mapped;
  if j.proposal_id is null or j.dist_m - least(p_acc, 100) > c.radius_m then
    insert into public.time_pings (org_id, user_id, kind, lat, lng, acc, dist_m, on_site, proposal_id)
    values (my_org, auth.uid(), 'in_refused', p_lat, p_lng, p_acc, j.dist_m, false, j.proposal_id);
    return jsonb_build_object('ok', false, 'reason', case when j.proposal_id is null and unmapped > 0 then 'not_mapped'
                                                         when j.proposal_id is null then 'no_jobs' else 'off_site' end,
      'distance', round(j.dist_m), 'client', j.client, 'unmapped', unmapped);
  end if;

  select display_name into nm from public.org_members where org_id = my_org and user_id = auth.uid();
  insert into public.time_shifts (org_id, user_id, worker, proposal_id, task_id, client, address, in_lat, in_lng, in_acc, in_dist_m)
  values (my_org, auth.uid(), nm, j.proposal_id, j.task_id, j.client, j.address, p_lat, p_lng, p_acc, j.dist_m)
  returning * into s;
  insert into public.time_pings (org_id, user_id, shift_id, kind, lat, lng, acc, dist_m, on_site, proposal_id)
  values (my_org, auth.uid(), s.id, 'in', p_lat, p_lng, p_acc, j.dist_m, true, j.proposal_id);
  return jsonb_build_object('ok', true, 'shift', public.tc_shift_json(s));
end $$;
revoke all on function public.timeclock_in(double precision, double precision, double precision) from public, anon;
grant execute on function public.timeclock_in(double precision, double precision, double precision) to authenticated;

-- ── The location check while clocked in (every 30 minutes) ───────────────────
create or replace function public.timeclock_ping(p_lat double precision, p_lng double precision, p_acc double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); c public.tc_settings; o public.time_shifts; js public.job_sites; d double precision; last_at timestamptz; here boolean;
begin
  perform public.tc_need_painter();
  c := public.tc_cfg(my_org);
  perform public.tc_close_stale(my_org, auth.uid());
  select * into o from public.time_shifts where user_id = auth.uid() and clock_out_at is null limit 1;
  if o.id is null then return jsonb_build_object('ok', false, 'reason', 'not_clocked_in'); end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return jsonb_build_object('ok', false, 'reason', 'no_location'); end if;
  -- At most one every 10 minutes (opening the app over and over adds nothing)
  select max(at) into last_at from public.time_pings where shift_id = o.id;
  if last_at > now() - interval '10 minutes' then return jsonb_build_object('ok', true, 'skipped', true, 'lastPing', last_at); end if;
  select * into js from public.job_sites where org_id = my_org and proposal_id = o.proposal_id;
  d := public.tc_distance_m(p_lat, p_lng, js.lat, js.lng);
  here := case when d is null then null else d - least(coalesce(p_acc, 0), 100) <= c.radius_m end;
  insert into public.time_pings (org_id, user_id, shift_id, kind, lat, lng, acc, dist_m, on_site, proposal_id)
  values (my_org, auth.uid(), o.id, 'ping', p_lat, p_lng, p_acc, d, here, o.proposal_id);
  return jsonb_build_object('ok', true, 'onSite', here, 'distance', round(d), 'lastPing', now());
end $$;
revoke all on function public.timeclock_ping(double precision, double precision, double precision) from public, anon;
grant execute on function public.timeclock_ping(double precision, double precision, double precision) to authenticated;

-- ── Clock out: only at the job ──────────────────────────────────────────────
create or replace function public.timeclock_out(p_lat double precision, p_lng double precision, p_acc double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); c public.tc_settings; o public.time_shifts; js public.job_sites; d double precision;
begin
  perform public.tc_need_painter();
  c := public.tc_cfg(my_org);
  perform public.tc_close_stale(my_org, auth.uid());
  select * into o from public.time_shifts where user_id = auth.uid() and clock_out_at is null limit 1;
  if o.id is null then return jsonb_build_object('ok', false, 'reason', 'not_clocked_in'); end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return jsonb_build_object('ok', false, 'reason', 'no_location'); end if;
  if p_acc is null or p_acc > c.max_acc_m then return jsonb_build_object('ok', false, 'reason', 'weak_gps', 'acc', round(p_acc)); end if;
  select * into js from public.job_sites where org_id = my_org and proposal_id = o.proposal_id;
  d := public.tc_distance_m(p_lat, p_lng, js.lat, js.lng);
  if d is null or d - least(p_acc, 100) > c.radius_m then
    insert into public.time_pings (org_id, user_id, shift_id, kind, lat, lng, acc, dist_m, on_site, proposal_id)
    values (my_org, auth.uid(), o.id, 'out_refused', p_lat, p_lng, p_acc, d, false, o.proposal_id);
    return jsonb_build_object('ok', false, 'reason', 'off_site', 'distance', round(d), 'client', o.client, 'dayEnd', to_char(c.day_end, 'HH24:MI'));
  end if;
  update public.time_shifts set clock_out_at = now(), out_lat = p_lat, out_lng = p_lng, out_acc = p_acc, out_dist_m = d
   where id = o.id returning * into o;
  insert into public.time_pings (org_id, user_id, shift_id, kind, lat, lng, acc, dist_m, on_site, proposal_id)
  values (my_org, auth.uid(), o.id, 'out', p_lat, p_lng, p_acc, d, true, o.proposal_id);
  return jsonb_build_object('ok', true, 'shift', public.tc_shift_json(o));
end $$;
revoke all on function public.timeclock_out(double precision, double precision, double precision) from public, anon;
grant execute on function public.timeclock_out(double precision, double precision, double precision) to authenticated;

-- ── The office: one pay week (Wednesday through Tuesday) ────────────────────
-- p_start: any day in the week. Shifts, every location point, the job sites.
create or replace function public.timeclock_week(p_start date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); c public.tc_settings; d0 date; d1 date;
begin
  if my_org is null or public.auth_role() not in ('office', 'admin', 'paint') then
    raise exception 'Only the office can see the time clock' using errcode = '42501';
  end if;
  c := public.tc_cfg(my_org);
  perform public.tc_close_stale(my_org);
  d0 := coalesce(p_start, (now() at time zone c.tz)::date);
  d0 := d0 - ((extract(dow from d0)::int - 3 + 7) % 7);   -- back to Wednesday
  d1 := d0 + 6;
  return jsonb_build_object('start', d0, 'end', d1, 'tz', c.tz, 'radius', c.radius_m, 'dayEnd', to_char(c.day_end, 'HH24:MI'),
    'payrollTo', case when public.auth_role() in ('office', 'admin') then to_jsonb(c.payroll_to) else '[]'::jsonb end,
    'shifts', coalesce((select jsonb_agg(public.tc_shift_json(s) || jsonb_build_object('userId', s.user_id, 'worker', coalesce(m.display_name, s.worker, 'Painter'),
        'day', (s.clock_in_at at time zone c.tz)::date, 'inLat', s.in_lat, 'inLng', s.in_lng, 'outLat', s.out_lat, 'outLng', s.out_lng,
        'pings', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'at', p.at, 'lat', p.lat, 'lng', p.lng, 'acc', round(p.acc), 'dist', round(p.dist_m), 'onSite', p.on_site) order by p.at)
                           from public.time_pings p where p.shift_id = s.id), '[]'::jsonb))
        order by coalesce(m.display_name, s.worker), s.clock_in_at)
      from public.time_shifts s left join public.org_members m on m.org_id = s.org_id and m.user_id = s.user_id
      where s.org_id = my_org and (s.clock_in_at at time zone c.tz)::date between d0 and d1), '[]'::jsonb),
    'refused', coalesce((select jsonb_agg(jsonb_build_object('userId', p.user_id, 'worker', coalesce(m.display_name, 'Painter'), 'kind', p.kind, 'at', p.at,
        'lat', p.lat, 'lng', p.lng, 'dist', round(p.dist_m)) order by p.at)
      from public.time_pings p left join public.org_members m on m.org_id = p.org_id and m.user_id = p.user_id
      where p.org_id = my_org and p.kind = 'in_refused' and (p.at at time zone c.tz)::date between d0 and d1), '[]'::jsonb),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('proposalId', js.proposal_id, 'address', js.address, 'lat', js.lat, 'lng', js.lng))
      from public.job_sites js where js.org_id = my_org and js.proposal_id in (select proposal_id from public.time_shifts s where s.org_id = my_org
        and (s.clock_in_at at time zone c.tz)::date between d0 and d1)), '[]'::jsonb));
end $$;
revoke all on function public.timeclock_week(date) from public, anon;
grant execute on function public.timeclock_week(date) to authenticated;

-- The office: who gets the hours every Wednesday.
create or replace function public.timeclock_set_payroll_to(p_emails text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); clean text[];
begin
  if my_org is null or public.auth_role() not in ('office', 'admin') then
    raise exception 'Only the office can change this' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct lower(trim(e))), '{}') into clean from unnest(coalesce(p_emails, '{}')) e
   where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if array_length(clean, 1) > 10 then raise exception 'Ten addresses at most' using errcode = '22023'; end if;
  insert into public.tc_settings (org_id, payroll_to) values (my_org, clean)
  on conflict (org_id) do update set payroll_to = excluded.payroll_to, updated_at = now();
  return to_jsonb(clean);
end $$;
revoke all on function public.timeclock_set_payroll_to(text[]) from public, anon;
grant execute on function public.timeclock_set_payroll_to(text[]) to authenticated;

-- Deck Plus: the hours go to Ellen.
-- insert into public.tc_settings (org_id, payroll_to) values ('<org id>', array['ellen@deck.plus']) on conflict (org_id) do nothing;
