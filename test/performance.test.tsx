import { definePlugin, type RequestTrace, type User } from '@otw/sdk'
import { createTestKernel, type TestKernel } from '@otw/testing'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import performance from '../src'
import { RequestPage, RequestsPage } from '../src/admin'

// A page that runs the same query once per item: the N+1 the bar should point out. Plain SQL,
// not drizzle's sql``: the CMS's packages are linked from a checkout, with a drizzle of their own.
const catalog = definePlugin({
  id: 'catalog',
  version: '1.0.0',
  setup(cms) {
    cms.routes.page({
      name: 'list',
      path: '/catalog',
      load: async () => {
        for (let item = 0; item < 3; item++) await cms.db.execute('SELECT 1 AS id')
        return {}
      },
      component: () => null,
    })
  },
})

let site: TestKernel | undefined
afterEach(() => site?.close())

const boot = async () =>
  (site = await createTestKernel({ plugins: [performance, catalog], tracing: true }))

type BarProps = { traceId: string | null; endpoint: string; available: boolean; historyUrl: string }

/** Renders the site's footer as a page would, inside a request, and returns the bar's props. */
async function footer(harness: TestKernel, user: User | null, path = '/catalog') {
  let element: ReactElement<BarProps> | null = null
  const id = await harness.inRequest(path, async () => {
    await harness.kernel.resolvePage(path)
    const [Fill] = harness.kernel.slot('site.footer')
    element = (await Fill!({ user })) as ReactElement<BarProps> | null
  })
  return { id, bar: element as ReactElement<BarProps> | null }
}

describe('the performance bar', () => {
  it('records requests once active, and shows the bar only to people who may see it', async () => {
    const harness = await boot()
    expect(harness.traces!.enabled).toBe(true)
    const admin = await harness.signIn()
    const customer = await harness.signIn('customer')

    expect((await footer(harness, null)).bar).toBeNull()
    expect((await footer(harness, customer.user)).bar).toBeNull()
    const { id, bar } = await footer(harness, admin.user)
    expect(bar!.props).toEqual({
      traceId: id,
      endpoint: '/api/p/performance/traces',
      available: true,
      historyUrl: '/admin/performance',
    })
  })

  it('keeps the trace of a request it was shown on, with its repeated queries', async () => {
    const harness = await boot()
    const admin = await harness.signIn()
    const { id } = await footer(harness, admin.user)

    const response = await harness.request('GET', `/api/p/performance/traces/${id}`, {
      cookie: admin.cookie,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const trace = (await response.json()) as RequestTrace
    expect(trace).toMatchObject({ id, method: 'GET', path: '/catalog' })
    expect(trace.duration).toBeGreaterThan(0)
    const queries = trace.spans.filter((span) => span.kind === 'query' && span.plugin === 'catalog')
    expect(queries).toHaveLength(3)

    const html = renderToStaticMarkup(<RequestPage trace={trace} />)
    expect(html).toContain('Repeated queries')
    expect(html).toContain('SELECT 1 AS id')
    expect(html).toContain('× 3')
  })

  it('doesn’t keep requests nobody looked at', async () => {
    const harness = await boot()
    const admin = await harness.signIn()
    const { id } = await footer(harness, null)
    expect(
      (await harness.request('GET', `/api/p/performance/traces/${id}`, { cookie: admin.cookie }))
        .status,
    ).toBe(404)
  })
})

describe('the traces API', () => {
  it('answers only people who may see performance, and only for kept traces', async () => {
    const harness = await boot()
    const admin = await harness.signIn()
    const customer = await harness.signIn('customer')
    const { id } = await footer(harness, admin.user)
    const path = `/api/p/performance/traces/${id}`

    expect((await harness.request('GET', path)).status).toBe(401)
    expect((await harness.request('GET', path, { cookie: customer.cookie })).status).toBe(403)
    expect(
      (
        await harness.request('GET', '/api/p/performance/traces/not-an-id', {
          cookie: admin.cookie,
        })
      ).status,
    ).toBe(404)
    expect((await harness.request('GET', path, { cookie: admin.cookie })).status).toBe(200)
  })
})

describe('the admin pages', () => {
  it('list recent requests and show each in full', async () => {
    const harness = await boot()
    const admin = await harness.signIn()
    const { id } = await footer(harness, admin.user)

    const list = await harness.kernel.resolveAdminPage('/admin/performance', {}, admin.user)
    expect(list.kind).toBe('page')
    const traces = harness.traces!.list().filter((trace) => trace.duration !== null)
    const html = renderToStaticMarkup(
      <RequestsPage traces={traces} detailUrl={(trace) => `/t/${trace}`} />,
    )
    expect(html).toContain(`href="/t/${id}"`)
    expect(html).toContain('GET /catalog')

    const detail = await harness.kernel.resolveAdminPage(
      `/admin/performance/requests/${id}`,
      {},
      admin.user,
    )
    expect(detail.kind).toBe('page')
    const missing = await harness.kernel.resolveAdminPage(
      '/admin/performance/requests/nope',
      {},
      admin.user,
    )
    expect(missing.kind).toBe('not-found')
    const customer = await harness.signIn('customer')
    expect(
      (await harness.kernel.resolveAdminPage('/admin/performance', {}, customer.user)).kind,
    ).toBe('forbidden')
  })
})
