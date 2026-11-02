import { definePlugin, HttpError, type ApiContext, type PluginContext, type User } from '@otw/sdk'
import { RequestPage, RequestsPage } from './admin'
import { LazyPerformanceBar } from './lazy-bar'

declare module '@otw/sdk' {
  interface Capabilities {
    /** See the performance bar, and the traces of recent requests. Administrators have it. */
    'performance.view': true
  }
}

export { summarize, type TraceSummary } from './format'

const TRACE_ID = /^[0-9a-f]{32}$/
const NO_STORE = { 'cache-control': 'no-store' }

/** Answers 401 or 403 unless the request's user may see performance. */
async function requireViewer(cms: PluginContext, context: ApiContext): Promise<void> {
  const user = await context.user()
  if (!user) throw new HttpError(401, 'Sign in to see performance traces')
  if (!cms.auth.can(user, 'performance.view'))
    throw new HttpError(403, 'You may not see performance traces')
}

/** The bar, for people who may see it; it keeps this request's trace so the bar can fetch it. */
function bar(cms: PluginContext) {
  return function PerformanceSlot({ user }: { user: User | null }) {
    if (!cms.auth.can(user, 'performance.view')) return null
    const traceId = cms.traces.currentId() ?? null
    if (traceId) cms.traces.keep(traceId)
    return (
      <LazyPerformanceBar
        traceId={traceId}
        endpoint={cms.routes.apiUrl('/traces')}
        available={cms.traces.available}
        historyUrl={cms.admin.url('performance.requests')}
      />
    )
  }
}

export default definePlugin({
  id: 'performance',
  version: '0.1.0',
  name: 'Performance',
  icon: 'chart',
  description:
    'How long each request takes on the server and in the browser: queries, hooks, plugins and Web Vitals, in a bar at the bottom of every page.',
  requires: { core: '^0.1.0' },

  setup(cms) {
    cms.traces.enable()
    cms.auth.capability('performance.view', { label: 'See request performance' })

    // Last, after other plugins' fills: the bar belongs at the very end of the page.
    const Bar = bar(cms)
    cms.slots.fill('site.footer', { component: Bar, priority: 1000 })
    cms.slots.fill('admin.footer', { component: Bar, priority: 1000 })

    cms.routes.api({
      method: 'GET',
      path: '/traces/:id',
      async handler(_request, context) {
        await requireViewer(cms, context)
        const id = context.params.id ?? ''
        const trace = TRACE_ID.test(id) ? cms.traces.get(id) : undefined
        if (!trace) throw new HttpError(404, "That request's trace isn't kept")
        return Response.json(trace, { headers: NO_STORE })
      },
    })

    // Asked by PrerenderedPerformanceBar: prerendered pages can't tell who's viewing.
    cms.routes.api({
      method: 'GET',
      path: '/viewer',
      async handler(_request, context) {
        await requireViewer(cms, context)
        return Response.json(
          {
            endpoint: cms.routes.apiUrl('/traces'),
            historyUrl: cms.admin.url('performance.requests'),
          },
          { headers: NO_STORE },
        )
      },
    })

    cms.admin.page({
      name: 'requests',
      path: '/',
      title: 'Recent requests',
      capability: 'performance.view',
      menu: { label: 'Recent requests' },
      load: () => cms.traces.list().filter((trace) => trace.duration !== null),
      component: ({ data }) => (
        <RequestsPage
          traces={data}
          detailUrl={(id) => cms.admin.url('performance.request', { id })}
        />
      ),
    })
    cms.admin.page({
      name: 'request',
      path: '/requests/:id',
      capability: 'performance.view',
      load: ({ params }) =>
        TRACE_ID.test(params.id ?? '') ? (cms.traces.get(params.id!) ?? null) : null,
      title: ({ data }) => `${data.method} ${data.path ?? ''}`,
      component: ({ data }) => <RequestPage trace={data} />,
    })
  },
})
