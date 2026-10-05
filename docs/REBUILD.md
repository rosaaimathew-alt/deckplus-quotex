# QuoteX on rows — setup guide (branch `rebuild/rows`)

This branch runs QuoteX on Supabase with **one row per record**, patched per
field and pushed to every device by Realtime. It is the foundation for the new
company's copy. The original QuoteX app (`main`) is untouched:
this branch is never merged into `main`; the new company's repo is created from it.

Design and rationale: the *QuoteX Rebuild Blueprint* doc.

## What changed

| Area | Before | Now |
| --- | --- | --- |
| Data | One JSON blob in Vercel KV, merged on every device | One row per record in Supabase; the database is the only authority |
| Sync | 4-second poll + client/server merge (`mergeStoreStrings`, `mergeState`) | Realtime pushes each committed row change; nothing is merged |
| Login | Env-var users + HMAC token (`api/auth/login.js`) | Supabase Auth; members and roles in `org_members` |
| Who sees what | Everyone saw everything | Row-level security: rep = own deals, PM = assigned deals, office/admin = all |
| Ids | Per-device counters (could collide) | Each session reserves a block of 1,000 ids from the database |
| Contract numbers | `EOL` + 6 digits | `org_settings.contractPrefix` + 6 digits (`DP` for the new company) |
| Deleted | Tombstone lists | `deleted_at` on the row |

Files: `supabase/schema.sql`, `src/supabase.js` (data layer), `src/store.js`
(persistence replaced; actions unchanged), `src/pages/Login.jsx`,
`src/components/AuthGuard.jsx`, `src/main.jsx`, `api/_auth.js`,
`scripts/seed-users.mjs`, `scripts/seed-new-org.mjs`. Removed: `api/store.js`,
`api/auth/login.js`.

## Setup (once per company)

1. **Supabase project** — create it under the company's own account. Copy the
   project URL, the `anon` key and the `service_role` key.
2. **Schema** — open the SQL editor, paste `supabase/schema.sql`, run it. It is
   idempotent; re-running is safe.
3. **Vercel project** — new project from the company's repo. Environment
   variables (see `.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (browser)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (API functions)
   - `COMPANY_NAME` (customer emails), `PUBLIC_HOST` (fallback host in signing links)
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN` (public signing / tracked links still use KV)
   - any integrations you use (Anthropic, Google)

   The source is company-neutral: contract templates print the company name,
   licensed GC and license number from Settings → Branding, customer emails use
   `COMPANY_NAME`, and no prior company's jobs, prices or contract wording are
   baked in. Review the warranty and HOA clauses in the contract for your own
   terms before the first real contract goes out.
4. **People** — from your machine:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ORG_NAME="New Company" \
   SEED_PASSWORD='ChangeMe123!' SEED_EMAIL_DOMAIN=example.com CONTRACT_PREFIX=DP \
   node scripts/seed-users.mjs
   ```
   Creates the org, its settings, and placeholder logins: `rep1..3`, `pm1..2`,
   `office`, `admin` at that domain. Replace emails/passwords in
   Supabase → Authentication → Users before real use, or re-run with real values.
5. **Catalog and descriptions, no prices** — export today's data from the
   current QuoteX (Settings → Export Backup), then:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ORG_NAME="New Company" \
   node scripts/seed-new-org.mjs quotex-backup-YYYY-MM-DD.json
   ```
   Writes catalog items, templates, scope templates, payment schedules, email
   templates and subcontractors with every price/rate zeroed. Never writes
   proposals, customers, expenses, todos or job costs.
6. **Sign in** as `admin@…`, set the company name and logo in Settings → Branding.

## Roles

| Membership role | App experience | Sees | Can change |
| --- | --- | --- | --- |
| `rep` | Sales | Own deals; shared catalog/templates | Own deals; can assign a PM to a deal |
| `pm` | Project Manager | Deals assigned to them | Those deals' job data |
| `office` | Manager | Every deal (Everyone / Mine toggle on the tracker) | Every deal, catalog, settings |
| `admin` | Manager | Everything | Everything, plus members |

Owner is set when a deal is created and is not reassigned (per decision); a rep
assigns a PM from the deal's ⋯ menu on the tracker.

## Local development

```bash
cp .env.example .env.local   # fill in the Supabase values
npm install
npm run dev
```

## Not yet on rows (follow-ups)

- Public signing and tracked proposal links (`api/sign/[token].js`) still use
  Vercel KV; they are self-contained and work as-is. Moving them to the
  `signing_*` / `proposal_views` tables is a later step.
- Members are added with the seed script or in the Supabase dashboard; an
  in-app members panel for admins is a later step.
- The multi-user Playwright suite from the blueprint's Testing section.
