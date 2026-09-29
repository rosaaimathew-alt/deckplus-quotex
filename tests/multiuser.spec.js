// Multi-user convergence suite (blueprint, "Testing and rollout").
//
// Runs against a STAGING org seeded with scripts/seed-users.mjs — never
// production. Two browser contexts sign in as different members and the
// assertions check that every change on one screen appears on the other
// within 2 s and that the office total equals the sum of the reps' totals.
//
//   BASE_URL=https://staging.example.com SEED_PASSWORD='ChangeMe123!' \
//   SEED_EMAIL_DOMAIN=example.com npx playwright test tests/multiuser.spec.js
//
// Skipped automatically when BASE_URL is not set, so `npm test` stays green
// on a machine without a staging org.
import { test, expect } from '@playwright/test'

const BASE   = process.env.BASE_URL
const PASS   = process.env.SEED_PASSWORD || 'ChangeMe123!'
const DOMAIN = process.env.SEED_EMAIL_DOMAIN || 'example.com'
const user   = (name) => ({ email: `${name}@${DOMAIN}`, password: PASS })

test.skip(!BASE, 'Set BASE_URL (and SEED_PASSWORD / SEED_EMAIL_DOMAIN) to run against a staging org')

async function signIn(browser, who) {
  const ctx  = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.getByPlaceholder('you@example.com').fill(who.email)
  await page.getByPlaceholder('••••••••').fill(who.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(`${BASE}/`)
  await expect(page.getByText('Loading your organization…')).toHaveCount(0, { timeout: 15000 })
  return { ctx, page }
}

// Reads the "Won Revenue" stat card on the tracker's analytics tab as a number.
async function wonRevenue(page) {
  await page.goto(`${BASE}/tracker`)
  await page.getByRole('button', { name: /analytics/i }).click()
  const text = await page.getByText(/Won Revenue/i).locator('..').textContent()
  return Number((text.match(/\$([\d,]+(\.\d+)?)/) || [])[1]?.replace(/,/g, '') || 0)
}

test.describe('rows architecture: two logins converge', () => {
  let rep, office

  test.beforeAll(async ({ browser }) => {
    rep    = await signIn(browser, user('rep1'))
    office = await signIn(browser, user('office'))
  })
  test.afterAll(async () => {
    await rep?.ctx.close()
    await office?.ctx.close()
  })

  test('office sees a rep status change within 2 s', async () => {
    // Precondition: rep1 has at least one deal on the tracker (create one via
    // the quote builder in a setup step, or seed a fixture deal for rep1).
    await rep.page.goto(`${BASE}/tracker`)
    const firstStatus = rep.page.locator('select').first()
    await expect(firstStatus).toBeVisible()
    const client = await rep.page.locator('tbody tr').first().locator('td').first().textContent()

    await firstStatus.selectOption('Archived')

    await office.page.goto(`${BASE}/tracker`)
    const row = office.page.locator('tbody tr', { hasText: client.trim().slice(0, 12) }).first()
    await expect(row.locator('select').first()).toHaveValue('Archived', { timeout: 2000 })
  })

  test('office won revenue equals the sum of the reps', async ({ browser }) => {
    const reps = [user('rep1'), user('rep2'), user('rep3')]
    let sum = 0
    for (const r of reps) {
      const s = await signIn(browser, r)
      sum += await wonRevenue(s.page)
      await s.ctx.close()
    }
    const total = await wonRevenue(office.page)
    expect(Math.abs(total - sum)).toBeLessThan(0.01)
  })

  test('a rep cannot see another rep\'s deals', async ({ browser }) => {
    const rep2 = await signIn(browser, user('rep2'))
    await rep.page.goto(`${BASE}/tracker`)
    await rep2.page.goto(`${BASE}/tracker`)
    const mine   = await rep.page.locator('tbody tr').allTextContents()
    const theirs = await rep2.page.locator('tbody tr').allTextContents()
    for (const row of mine) expect(theirs).not.toContain(row)
    await rep2.ctx.close()
  })

  // Remaining scenarios from the blueprint, to fill in once a fixture deal
  // exists for rep1 on the staging org:
  //   - scope edit on rep survives an office reload
  //   - rep edits scope while office changes status on the same deal: both land
  //   - delete on rep is gone on office within 2 s and stays gone after reload
  //   - rep goes offline (context.setOffline(true)), edits two deals, reconnects: both land
  //   - 500 seeded deals, four users clicking: tracker loads under 2 s
})
