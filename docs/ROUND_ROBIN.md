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
4. **Google Calendar** — see the next section.

## Connecting the reps' Google Calendars (Google Workspace)

The booking app uses a **service account**: a Google account for software, not
a person. Nobody logs into it and it has no inbox. Your Workspace admin gives
it permission to read and add events on your company's calendars, and the app
then checks each rep's calendar *as that rep*. The reps don't do anything.

Once it's set up, every booking-page load and every "Book My Estimate" click checks
the rep's live Google Calendar, so any meeting, call or blocked time they add
hides that slot. Events marked "Show as: Free" (all-day events by default)
and declined invites don't block anything.

**A. Create the service account** (Google Cloud — about 10 minutes, any admin):
1. Go to https://console.cloud.google.com and sign in with your company
   Google account. Create a project, e.g. "Booking Calendar".
2. APIs & Services → Library → search **Google Calendar API** → Enable.
3. IAM & Admin → Service Accounts → **Create service account**. Name it
   e.g. "booking-calendar". Skip the optional role/access steps → Done.
4. Open the new service account → **Keys** → Add key → Create new key →
   **JSON**. A file downloads. Treat it like a password: don't email it or
   commit it to Git.
5. On the service account's Details tab, copy the **Unique ID** (a long
   number; Google also calls it the Client ID).

   If Google blocks key creation ("iam.disableServiceAccountKeyCreation"),
   a Google Cloud organization admin has to allow it for this project under
   IAM & Admin → Organization Policies.

**B. Give it permission** (Google Workspace Admin Console — 5 minutes, needs a
Workspace super admin):
1. Go to https://admin.google.com → Security → Access and data control →
   API controls → **Manage Domain Wide Delegation** → Add new.
2. Client ID: the Unique ID from step A5.
   OAuth scopes: `https://www.googleapis.com/auth/calendar`
3. Authorize. It usually works within minutes but can take up to 24 hours.

**C. Plug it into the app:**
1. Vercel → your project → Settings → Environment Variables → add
   `GOOGLE_SERVICE_ACCOUNT_JSON` and paste the **entire contents** of the
   JSON file. Redeploy.
2. In `rr_reps`, each rep's `email` must be their Workspace address.
   (`google_calendar_id` is only needed if it differs from that email.)
3. Run the check (from a computer with the repo and a `.env` holding
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `GOOGLE_SERVICE_ACCOUNT_JSON`):
   ```
   node scripts/check-calendar.mjs
   ```
   It prints OK or FAIL per rep, with what to fix. It only reads calendars.
4. Make one test booking yourself: the event should appear on the rep's
   calendar, and the lead's email should receive a Google invite.

What happens on a booking: the event is created on the rep's calendar with
the customer's address as the location, and the customer is added as a
guest, so Google sends them a real invite from the rep. We also send a
branded confirmation email.

**Not on one Workspace?** Set `GOOGLE_CALENDAR_MODE=shared` and have each rep
share their calendar with the service account's email ("Make changes to
events") instead of step B. Customers then get an emailed .ics instead of a
Google invite.

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
