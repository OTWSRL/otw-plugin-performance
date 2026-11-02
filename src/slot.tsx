import type { PluginContext, User } from '@otw/sdk'
import { LazyPerformanceBar } from './lazy-bar'

/** A trace id, as OpenTelemetry writes it: 32 lowercase hex digits. */
export const TRACE_ID = /^[0-9a-f]{32}$/

/**
 * The bar, for people who may see it, at the end of the site's pages and the admin's screens; it
 * keeps this request's trace so the bar can fetch it.
 */
export function performanceSlot(cms: PluginContext) {
  return function PerformanceSlot({ user }: { user: User | null }) {
    if (!cms.auth.can(user, 'performance.view')) return null
    const traceId = cms.traces.currentId() ?? null
    if (traceId) cms.traces.keep(traceId)
    return (
      <LazyPerformanceBar
        traceId={traceId}
        endpoint={cms.routes.apiUrl('/traces')}
        available={cms.traces.available}
        // By path: the site's pages don't load the admin entry, where its pages are named.
        historyUrl={cms.admin.url('/')}
      />
    )
  }
}
