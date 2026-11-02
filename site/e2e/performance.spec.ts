import { expect, test, type Page } from '@playwright/test'
import { ADMIN, CUSTOMER, notice, openSection, signIn } from './helpers'

// The bar, as administrators and others see it. One site, set up by the first test; the rest
// build on it.
test.describe.configure({ mode: 'serial' })

const bar = (page: Page) => page.locator('[data-otw-perf]')
const chip = (page: Page, label: string) =>
  bar(page).getByRole('button', { name: new RegExp(`^${label}`) })

/** Collects the JavaScript the page downloads from now on, each file before the page runs it. */
async function scriptsOf(page: Page): Promise<string[]> {
  const bodies: string[] = []
  // Read on the way in: a body read from the response event is gone once the page moves on.
  await page.route(
    (url) => url.pathname.endsWith('.js'),
    async (route) => {
      const response = await route.fetch()
      bodies.push(await response.text())
      await route.fulfill({ response })
    },
  )
  return bodies
}
// A class name only the bar's code contains.
const BAR_CODE = 'otw-perf-dock'

test('the first visit sets up the administrator, who adds a customer', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL('/admin/setup')
  await page.getByLabel('Name').fill(ADMIN.name)
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password').fill(ADMIN.password)
  await page.getByRole('button', { name: 'Create administrator' }).click()
  await notice(page, 'Your site is ready.')

  await openSection(page, 'Users')
  await page.getByRole('link', { name: 'Add User' }).first().click()
  await page.getByLabel('Email').fill(CUSTOMER.email)
  await page.getByLabel('Role').selectOption({ label: 'Customer' })
  await page.getByLabel('Password').fill(CUSTOMER.password)
  await page.getByRole('button', { name: 'Add User' }).click()
  await notice(page, `Added ${CUSTOMER.email}.`)
})

test('administrators get the bar on the site, with the server’s and the browser’s timings', async ({
  page,
}) => {
  await signIn(page, ADMIN)
  await page.goto('/catalog')
  await expect(chip(page, 'Server')).toHaveText(/Server\s*\d+(\.\d+)? (ms|s)/)
  await expect(chip(page, 'TTFB')).toHaveText(/TTFB\s*\d/)
  await expect(chip(page, 'Queries')).toHaveText(/Queries\s*\d+ · /)

  await chip(page, 'Queries').click()
  const panel = bar(page).getByRole('tabpanel')
  await expect(panel).toContainText('Repeated queries')
  await expect(panel).toContainText('Values are never recorded')
  // Each query is put down to the plugin whose page ran it: the spans nest.
  const queries = panel.getByRole('row').filter({ hasText: 'SELECT 1 AS id' })
  await expect(queries.filter({ has: page.getByRole('cell', { name: 'catalog' }) })).toHaveCount(3)
  await bar(page).getByRole('tab', { name: 'Timeline' }).click()
  await expect(panel).toContainText('load catalog.list')
  await bar(page).getByRole('tab', { name: 'Browser' }).click()
  await expect(panel).toContainText('Largest Contentful Paint')
  // Rated the same, and coloured the same, as on the chip.
  const color = (element: Element) => getComputedStyle(element).color
  const onChip = await chip(page, 'TTFB').locator('span[class]').evaluate(color)
  const card = panel.locator('.otw-perf-stat').filter({ hasText: 'Time to first byte' })
  await expect(card.locator('strong span')).toHaveCSS('color', onChip)
  await page.keyboard.press('Escape')
  await expect(bar(page).getByRole('tabpanel')).toHaveCount(0)
})

test('the bar follows each admin screen opened from the menu', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(chip(page, 'Server')).toHaveText(/\d/)
  const first = await bar(page).getAttribute('data-trace')
  await openSection(page, 'Plugins')
  await expect(page).toHaveURL('/admin/plugins')
  await expect(chip(page, 'Navigations')).toHaveText(/1/)
  await expect(bar(page)).not.toHaveAttribute('data-trace', first ?? '')
  await expect(chip(page, 'Server')).toHaveText(/\d/)
})

test('visitors and customers never get it', async ({ page }) => {
  await page.goto('/catalog')
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await expect(bar(page)).toHaveCount(0)

  await signIn(page, CUSTOMER)
  await page.goto('/catalog')
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible()
  await expect(bar(page)).toHaveCount(0)
  const response = await page.request.get(
    '/api/p/performance/traces/0123456789abcdef0123456789abcdef',
  )
  expect(response.status()).toBe(403)
})

test('visitors download none of the bar’s code, on either kind of page', async ({ page }) => {
  const scripts = await scriptsOf(page)
  for (const path of ['/catalog', '/about']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  expect(scripts.filter((code) => code.includes(BAR_CODE))).toEqual([])

  // Only once it's shown.
  await signIn(page, ADMIN)
  await page.goto('/catalog')
  await expect(chip(page, 'Server')).toHaveText(/\d/)
  expect(scripts.some((code) => code.includes(BAR_CODE))).toBe(true)
})

test('Recent requests lists what administrators opened, each in full', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/catalog')
  await expect(chip(page, 'Server')).toHaveText(/\d/)
  await page.goto('/admin/performance')
  await expect(page.getByRole('heading', { name: 'Recent requests' })).toBeVisible()
  await page.getByRole('link', { name: 'GET /catalog' }).first().click()
  await expect(page.getByRole('heading', { name: 'GET /catalog' })).toBeVisible()
  await expect(page.getByRole('main')).toContainText('Where the time went')
  await expect(page.getByRole('main')).toContainText('SELECT 1 AS id')
})

test('prerendered pages show administrators the browser’s side, and visitors nothing', async ({
  page,
}) => {
  // A visitor: no bar, and not even a request to ask about one.
  const asked: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/p/performance/')) asked.push(request.url())
  })
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(bar(page)).toHaveCount(0)
  expect(asked).toEqual([])

  // The bar in the admin leaves the hint that prerendered pages look for.
  await signIn(page, ADMIN)
  await expect(chip(page, 'Server')).toHaveText(/\d/)
  await page.goto('/about')
  await expect(chip(page, 'Server')).toHaveText(/prerendered/)
  await expect(chip(page, 'TTFB')).toHaveText(/TTFB\s*\d/)
  await expect(chip(page, 'Queries')).toHaveCount(0)
  await chip(page, 'Server').click()
  await expect(bar(page).getByRole('tab')).toHaveText([
    'Server',
    'Browser',
    'Resources',
    'Navigations',
  ])
  await expect(bar(page).getByRole('tabpanel')).toContainText('layout is prerendered')
  await bar(page).getByRole('tab', { name: 'Browser' }).click()
  await expect(bar(page).getByRole('tabpanel')).toContainText('Largest Contentful Paint')
})

test('Ready is when the page could first be used, not when the bar showed up', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(chip(page, 'Server')).toHaveText(/\d/)

  // On a prerendered page the bar waits for the server's answer; the page doesn't.
  await page.route('**/api/p/performance/viewer', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto('/about')
  await chip(page, 'TTFB').click()
  const hydrated = bar(page).locator('.otw-perf-stat').filter({ hasText: 'Ready to use' })
  await expect(hydrated.locator('strong')).toHaveText(/^\d+ ms$/)
  await expect(chip(page, 'Ready')).toHaveText(/^Ready\s*\d+ ms$/)
  await page.keyboard.press('Escape')

  // And on pages rendered per request.
  await page.goto('/catalog')
  await expect(chip(page, 'Ready')).toHaveText(/^Ready\s*\d+(\.\d+)? (ms|s)$/)
  // No one can use a page before they see it.
  const ms = async (label: string) => {
    const [, value, unit] = (await chip(page, label).innerText()).match(/([\d.]+) (ms|s)$/) ?? []
    return Number(value) * (unit === 's' ? 1000 : 1)
  }
  await expect.poll(async () => (await ms('Ready')) - (await ms('FCP'))).toBeGreaterThanOrEqual(0)
})

test('the bar weighs the page, and shows its JavaScript memory', async ({ page }) => {
  await signIn(page, ADMIN)
  await page.goto('/catalog')
  const size = /^Size\s*\d+(\.\d+)? (KB|MB)$/
  await expect(chip(page, 'Size')).toHaveText(size)
  // Chromium only: other browsers don't tell a page its memory.
  await expect(chip(page, 'JS heap')).toHaveText(/^JS heap\s*\d+(\.\d+)? (KB|MB)$/)

  await chip(page, 'Size').click()
  const panel = bar(page).getByRole('tabpanel')
  await expect(panel).toContainText('Page size, compressed')
  await expect(panel).toContainText('Transferred this time')
  // Rated the same, and coloured the same, as on the chip.
  const color = (element: Element) => getComputedStyle(element).color
  const onChip = await chip(page, 'Size').locator('span[class]').evaluate(color)
  const card = panel.locator('.otw-perf-stat').filter({ hasText: 'Page size, compressed' })
  await expect(card.locator('strong span')).toHaveCSS('color', onChip)
  await page.keyboard.press('Escape')

  await page.goto('/about')
  await expect(chip(page, 'Server')).toHaveText(/prerendered/)
  await expect(chip(page, 'Size')).toHaveText(size)
})

test('the bar times each page opened with a link, from the click', async ({ page }) => {
  await signIn(page, ADMIN)
  await expect(chip(page, 'Server')).toHaveText(/\d/)
  await page.goto('/about')
  await expect(chip(page, 'Server')).toHaveText(/prerendered/)
  // By now the router has fetched the linked page, as it does once a link is in view.
  await page.waitForLoadState('networkidle')
  await page.getByRole('link', { name: 'Team' }).click()
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
  await expect(chip(page, 'Navigations')).toHaveText(/Navigations\s*1 · last \d+(\.\d+)? (ms|s)/)

  await chip(page, 'Navigations').click()
  const row = bar(page).getByRole('tabpanel').getByRole('row').filter({ hasText: '/about/team' })
  await expect(row.getByRole('cell').nth(1)).toHaveText(/^\d+(\.\d+)? (ms|s)$/)
})

test('a hint the server turns down is forgotten', async ({ page, context }) => {
  await signIn(page, CUSTOMER)
  await context.addCookies([{ name: 'performance_bar', value: '1', url: page.url() }])
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible()
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name === 'performance_bar'))
    .toBe(false)
  await expect(bar(page)).toHaveCount(0)
})
