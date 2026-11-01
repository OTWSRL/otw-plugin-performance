import { ListTable } from '@otw/admin-ui'
import type { RequestTrace } from '@otw/sdk'
import { formatBytes, formatMs, summarize } from './format'
import {
  DatabasePanel,
  HooksPanel,
  PluginsPanel,
  Rated,
  ServerPanel,
  TimelinePanel,
} from './panels'
import { CSS } from './styles'

const time = (epochMs: number) => new Date(epochMs).toISOString().slice(11, 19)

/** Performance › Recent requests: the requests kept for people who can see the bar. */
export function RequestsPage({
  traces,
  detailUrl,
}: {
  traces: RequestTrace[]
  detailUrl: (id: string) => string
}) {
  return (
    <>
      <p>
        The last 100 requests made by people who can see the performance bar, kept for ten minutes
        in this server's memory. Times are UTC.
      </p>
      <ListTable
        caption="Recent requests"
        rows={traces}
        rowKey={(trace) => trace.id}
        columns={[
          {
            key: 'request',
            label: 'Request',
            render: (trace) => (
              <a href={detailUrl(trace.id)}>
                <strong>
                  {trace.method} {trace.path ?? '–'}
                </strong>
              </a>
            ),
          },
          { key: 'at', label: 'At', render: (trace) => time(trace.startedAt) },
          { key: 'status', label: 'Status', numeric: true, render: (trace) => trace.status ?? '–' },
          {
            key: 'server',
            label: 'Server time',
            numeric: true,
            render: (trace) =>
              trace.duration === null ? (
                'running'
              ) : (
                <Rated metric="server" value={trace.duration}>
                  {formatMs(trace.duration)}
                </Rated>
              ),
          },
          {
            key: 'queries',
            label: 'Queries',
            numeric: true,
            render: (trace) => {
              const { queries } = summarize(trace)
              return `${queries.count} · ${formatMs(queries.time)}`
            },
          },
          {
            key: 'memory',
            label: 'Heap',
            numeric: true,
            render: (trace) => formatBytes(trace.memory?.heapUsed),
          },
        ]}
        empty="No requests kept yet. Open a page of the site, or of the admin, and come back."
      />
    </>
  )
}

/** One request's server trace, in full. */
export function RequestPage({ trace }: { trace: RequestTrace }) {
  const summary = summarize(trace)
  return (
    <div className="otw-perf otw-perf-page">
      <style href="otw-performance" precedence="default">
        {CSS}
      </style>
      <div className="otw-perf-panel">
        <ServerPanel trace={trace} summary={summary} />
        <h3>Database</h3>
        <DatabasePanel trace={trace} summary={summary} />
        <h3>Hooks</h3>
        <HooksPanel summary={summary} />
        <h3>Plugins</h3>
        <PluginsPanel summary={summary} />
        <h3>Timeline</h3>
        <TimelinePanel trace={trace} />
      </div>
    </div>
  )
}
