# Strict round-robin booking calendar

An embeddable booking page that hands out leads one at a time, in a fixed
order (Rep 1 → Rep 2 → Rep 3 → Rep 1 …), no matter who is free first.

## How "strict" works

- The visitor only ever sees **the turn-holder's** open times. They never pick a rep.
- `rr_book()` (Postgres) locks the round-robin pointer, re-checks whose turn it
  is, inserts the booking and advances the pointer in one transaction. If two
  visitors book at the same moment, exactly one gets the rep; the other sees
  "that time was just taken" and the *next* rep's times.
- A rep can't be double-booked (exclusion constraint on their bookings).
- Set a rep's `active = false` (vacation, out sick) and they're skipped until
  you turn them back on. Their place in the order is kept.
- If the turn-holder has no open times in the booking window, the page shows
  "no times are open" — the order is never broken to fill the gap.
- Cancelling a booking (`status = 'cancelled'`) frees the time slot but does
  **not** give the rep their turn back.

## What the customer must enter

First name, last name, street address (must start with a street number),
city, state, 5-digit ZIP, a 10-digit phone number and email are all required;
notes are optional. The page checks them as the visitor types, and the API
re-checks them so a booking can't be made without them. The address and phone
appear in the rep's email and as the Google Calendar event's location.

## Setup

1. **Database** — in the Supabase SQL editor run `supabase/round_robin.sql`,
   then insert your reps (template at the bottom of that file). `position`
   sets the order. Each rep's `hours` is weekday (0 = Sun … 6 = Sat) → list of
   `["HH:MM","HH:MM"]` ranges in their `timezone`.
2. **Settings** — edit the single `rr_settings` row: `meeting_title`,
   `slot_minutes`, `buffer_minutes`, `min_notice_hours`, `days_ahead`.
3. **Env vars** (Vercel): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (already used
   by QuoteX), and for emails either a connected Google account or
   `GMAIL_USER` + `GMAIL_APP_PASSWORD`. `COMPANY_NAME` is used in the email.
4. **Google Calendar (optional, recommended)** — so reps' existing meetings
   block times and new bookings land on their calendars:
   - Create a Google Cloud service account, enable the Calendar API, download
     its JSON key and paste the whole JSON into `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - Each rep shares their Google Calendar with the service account email with
     **"Make changes to events"**, and you put their calendar ID (usually their
     email) in `rr_reps.google_calendar_id`.
   - The lead gets an `.ics` invite by email (service accounts can't send
     Google invites without Workspace domain-wide delegation).

## Embedding on your website

```html
<div id="rr-booking"></div>
<script src="https://YOUR-QUOTEX-DOMAIN/embed.js" async></script>
```

The iframe resizes itself. Add `data-theme="light"` or `"dark"` to the div to
force a theme. To track conversions:

```js
window.addEventListener('rr-booked', (e) => { /* gtag / fbq etc. */ })
```

Direct link (no embed): `https://YOUR-QUOTEX-DOMAIN/book`.

## Seeing the queue

```sql
select b.turn, r.name as rep, b.starts_at, b.lead_name, b.lead_phone, b.lead_email,
       b.address_street, b.address_city, b.address_state, b.address_zip, b.status
from rr_bookings b join rr_reps r on r.id = b.rep_id order by b.turn desc;

select name as next_up from rr_next_rep();
```
