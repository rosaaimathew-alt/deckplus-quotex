# Deck Plus QuoteX — rules for every Claude session

## Shipping: never push to `main`
`main` is protected and deploys straight to deckplus.app. Every change goes
through a pull request:

1. Work on your own branch (`claude/...`).
2. Run `npm run build` (and fix anything new from `npx eslint <changed files>`).
3. Push the branch and open a pull request into `main` with a plain-English
   summary of what changes for the office and how you tested it.
4. Stop there. The gatekeeper (a scheduled Claude session, hourly) reviews,
   builds, tests and merges it, or comments on the PR with what to fix.

Don't merge your own PR, don't push to `main`, don't change branch protection.

## Standing rules from the owner
- Contract documents are lawyer-reviewed: never change a word, add or remove
  anything. Layout-only changes are allowed.
- Never touch the Ebony QuoteX repo (rosaaimathew-alt/QuoteX).
- Money (Invoices, Bills, Purchases, Vendors) keeps the Knowify layout and
  placement — the office is moving from Knowify and must not relearn it.
- One look everywhere: flat filter lines (no boxed chips), StatCard for
  headline numbers, brand-colored primary buttons, sans-serif headings,
  "Sales rep" filter on the left. Less text is better — no descriptions under
  titles.
- Headline numbers come from `src/lib/headline.js`; job cost/profit from
  `src/lib/jobCost.js`. Don't compute them another way on a page.
- Never print secrets. No model names in commits.
- Test before saying something is done (mocked UI screenshots or the live site).
- The owner doesn't want permission prompts or questions for routine work —
  act, then report.
