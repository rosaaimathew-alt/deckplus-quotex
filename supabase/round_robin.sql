-- Strict round-robin booking calendar.
-- Run once in the Supabase SQL editor after schema.sql (idempotent: safe to re-run).
--
-- Model: reps sit in a fixed order (`position`). `rr_settings.last_rep_id` is
-- the rep who got the most recent lead; the next lead always goes to the next
-- active rep after them, wrapping at the end. The public booking page only ever
-- shows the turn-holder's open times, and `rr_book` re-checks the turn under a
-- row lock, so two visitors booking at the same moment can never both land on
-- the same rep or skip one. Nothing here is readable by the anon key; the
-- booking API talks to it with the service key.

create extension if not exists btree_gist with schema extensions;

-- ── Reps ────────────────────────────────────────────────────────────────────
-- hours: weekday (0 = Sunday … 6 = Saturday) → list of [start, end] in the
-- rep's own timezone, optionally [start, end, last start] to override
-- last_start for that day. A missing or empty weekday means no bookings that day.
create table if not exists rr_reps (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  email              text not null,
  position           int  not null unique,
  active             boolean not null default true,
  timezone           text not null default 'America/New_York',
  hours              jsonb not null default '{
    "1": [["08:00","17:00"]], "2": [["08:00","17:00"]], "3": [["08:00","17:00"]],
    "4": [["08:00","17:00"]], "5": [["08:00","17:00"]]
  }'::jsonb,
  google_calendar_id text,           -- usually the rep's Gmail/Workspace address
  created_at         timestamptz not null default now()
);

-- ── Settings + the round-robin pointer (single row) ─────────────────────────
create table if not exists rr_settings (
  id               boolean primary key default true check (id),
  last_rep_id      uuid references rr_reps(id) on delete set null,
  meeting_title    text not null default 'Free Estimate and Design Consultation',
  slot_minutes     int  not null default 30  check (slot_minutes between 5 and 480),
  buffer_minutes   int  not null default 0   check (buffer_minutes between 0 and 240),
  min_notice_hours int  not null default 2   check (min_notice_hours between 0 and 720),
  days_ahead       int  not null default 14  check (days_ahead between 1 and 90),
  updated_at       timestamptz not null default now()
);
insert into rr_settings (id) values (true) on conflict (id) do nothing;

-- ── Bookings ────────────────────────────────────────────────────────────────
create table if not exists rr_bookings (
  id              uuid primary key default gen_random_uuid(),
  turn            bigint generated always as identity,   -- 1, 2, 3… in assignment order
  rep_id          uuid not null references rr_reps(id),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null check (ends_at > starts_at),
  lead_name       text not null,
  lead_email      text not null,
  lead_phone      text,
  notes           text,
  status          text not null default 'booked' check (status in ('booked','cancelled')),
  google_event_id text,
  created_at      timestamptz not null default now()
);
create index if not exists rr_bookings_rep_time on rr_bookings (rep_id, starts_at);

-- Required lead details (added after the first version; safe on existing tables).
-- Why a booking's Google event or emails didn't go out (null = fine).
alter table rr_bookings add column if not exists google_error text;
alter table rr_bookings add column if not exists email_error  text;

-- Rep's direct phone, shown to the customer in their confirmation.
alter table rr_reps add column if not exists phone text;

-- Latest time an appointment may start, per rep (null = any time that fits in hours).
alter table rr_reps add column if not exists last_start text check (last_start ~ '^[0-2][0-9]:[0-5][0-9]$');
-- Per-rep appointment length and buffer kept free after each appointment (null = use rr_settings).
alter table rr_reps add column if not exists appointment_minutes  int check (appointment_minutes between 5 and 480);
alter table rr_reps add column if not exists buffer_after_minutes int check (buffer_after_minutes between 0 and 480);
-- How often start times are offered (8:00, 8:30, 9:00…).
alter table rr_settings add column if not exists start_every_minutes int not null default 30 check (start_every_minutes between 5 and 240);

alter table rr_bookings add column if not exists lead_first_name text;
alter table rr_bookings add column if not exists lead_last_name  text;
alter table rr_bookings add column if not exists address_street  text;
alter table rr_bookings add column if not exists address_city    text;
alter table rr_bookings add column if not exists address_state   text;
alter table rr_bookings add column if not exists address_zip     text;

-- A rep can never hold two live bookings that overlap.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rr_bookings_no_overlap') then
    alter table rr_bookings add constraint rr_bookings_no_overlap
      exclude using gist (rep_id with =, tstzrange(starts_at, ends_at) with &&)
      where (status = 'booked');
  end if;
end $$;

-- ── Whose turn is it? ───────────────────────────────────────────────────────
-- The first active rep positioned after the last assigned rep, wrapping around.
create or replace function rr_next_rep() returns rr_reps
language sql stable set search_path = public as $$
  with last as (
    select r.position from rr_settings s join rr_reps r on r.id = s.last_rep_id where s.id
  )
  select r.* from rr_reps r
  where r.active
  order by (r.position <= coalesce((select position from last), -2147483648)), r.position
  limit 1
$$;

-- ── Book the next lead ──────────────────────────────────────────────────────
-- p_expected_rep is the rep whose times the visitor was shown. If someone else
-- booked in between, the turn has moved on and we refuse with 'turn_changed'
-- so the page reloads the new turn-holder's times. Overlaps raise 'slot_taken'.
-- The booking API validates p_lead (all fields required except notes).
drop function if exists rr_book(uuid, timestamptz, timestamptz, text, text, text, text);
create or replace function rr_book(
  p_expected_rep uuid,
  p_start        timestamptz,
  p_end          timestamptz,
  p_lead         jsonb   -- first_name, last_name, email, phone, street, city, state, zip, notes
) returns rr_bookings
language plpgsql set search_path = public as $$
declare
  v_rep     rr_reps;
  v_booking rr_bookings;
begin
  -- Serialise every booking on the pointer row.
  perform 1 from rr_settings where id for update;

  v_rep := rr_next_rep();
  if v_rep.id is null then
    raise exception 'no_active_reps';
  end if;
  if v_rep.id is distinct from p_expected_rep then
    raise exception 'turn_changed';
  end if;

  begin
    insert into rr_bookings (
      rep_id, starts_at, ends_at,
      lead_name, lead_first_name, lead_last_name, lead_email, lead_phone,
      address_street, address_city, address_state, address_zip, notes
    ) values (
      v_rep.id, p_start, p_end,
      concat_ws(' ', p_lead->>'first_name', p_lead->>'last_name'),
      p_lead->>'first_name', p_lead->>'last_name', p_lead->>'email', p_lead->>'phone',
      p_lead->>'street', p_lead->>'city', p_lead->>'state', p_lead->>'zip', nullif(p_lead->>'notes', '')
    )
    returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_taken';
  end;

  update rr_settings set last_rep_id = v_rep.id, updated_at = now() where id;
  return v_booking;
end $$;

-- ── Access ──────────────────────────────────────────────────────────────────
-- RLS on, no anon policies: only the service key (the booking API) can write.
-- Office/admin users of QuoteX can read and manage the queue from the app.
alter table rr_reps     enable row level security;
alter table rr_settings enable row level security;
alter table rr_bookings enable row level security;

revoke execute on function rr_book(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function rr_next_rep() from public, anon, authenticated;
grant execute on function rr_book(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function rr_next_rep() to service_role;

drop policy if exists rr_reps_staff     on rr_reps;
drop policy if exists rr_settings_staff on rr_settings;
drop policy if exists rr_bookings_staff on rr_bookings;
create policy rr_reps_staff     on rr_reps     for all using (auth_role() in ('office','admin')) with check (auth_role() in ('office','admin'));
create policy rr_settings_staff on rr_settings for all using (auth_role() in ('office','admin')) with check (auth_role() in ('office','admin'));
create policy rr_bookings_staff on rr_bookings for all using (auth_role() in ('office','admin')) with check (auth_role() in ('office','admin'));

-- ── Your three reps (edit names/emails/order, then run) ─────────────────────
-- insert into rr_reps (name, email, position, timezone, google_calendar_id) values
--   ('Rep One',   'rep1@example.com', 1, 'America/New_York', 'rep1@example.com'),
--   ('Rep Two',   'rep2@example.com', 2, 'America/New_York', 'rep2@example.com'),
--   ('Rep Three', 'rep3@example.com', 3, 'America/New_York', 'rep3@example.com');

-- ── Anonymous visit tracking (booking page funnel) ──────────────────────────
-- One row per step per visit; visitor_id is a random per-browser ID, nothing personal.
create table if not exists rr_events (
  id         bigint generated always as identity primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  event      text not null check (event in ('view','day','time','form','booked')),
  page       text,
  created_at timestamptz not null default now()
);
create index if not exists rr_events_time on rr_events (created_at);
alter table rr_events enable row level security;
drop policy if exists rr_events_staff on rr_events;
create policy rr_events_staff on rr_events for select using (auth_role() in ('office','admin'));

-- Unique visitors per day (Eastern) and how far they got.
create or replace view rr_funnel_daily with (security_invoker = true) as
select (created_at at time zone 'America/New_York')::date as day,
       count(distinct visitor_id) filter (where event = 'view')   as visitors,
       count(distinct session_id) filter (where event = 'view')   as visits,
       count(distinct visitor_id) filter (where event = 'day')    as picked_day,
       count(distinct visitor_id) filter (where event = 'time')   as picked_time,
       count(distinct visitor_id) filter (where event = 'form')   as started_form,
       count(distinct visitor_id) filter (where event = 'booked') as booked
from rr_events group by 1 order by 1 desc;
