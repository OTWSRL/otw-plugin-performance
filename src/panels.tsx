import type { RequestTrace, TraceSpan } from '@otw/sdk'
import type { ReactNode } from 'react'
import type { NavigationPhases, ResourceSummary } from './browser'
import {
  depths,
  formatBytes,
  formatMs,
  label,
  pluginTime,
  rate,
  treeOrder,
  type Metric,
  type TraceSummary,
} from './format'

// Plain components, no hooks: the bar renders them in the browser, the admin's request page on
// the server.

/** What the browser measured about the page, gathered by the bar. */
export interface BrowserMetrics {
  phases: NavigationPhases | null
  fcp: number | null
  lcp: { time: number; element: string | null } | null
  cls: number
  inp: number | null
  longTasks: { count: number; blocking: number }
  /** When the page was ready to use: on screen, and hydrated so its links and buttons respond. */
  ready: number | null
  resources: ResourceSummary
  memory: { used: number; limit: number } | null
  connection: { type: string; downlink: number | null; rtt: number | null } | null
}

export function Rated({
  metric,
  value,
  children,
}: {
  metric: Metric
  value: number | null
  children: ReactNode
}) {
  const rating = rate(metric, value)
  return <span className={rating ? `otw-perf-${rating}` : 'otw-perf-muted'}>{children}</span>
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="otw-perf-stat">
      <strong>{children}</strong>
      <span>{label}</span>
    </div>
  )
}

const plugin = (span: TraceSpan) => span.plugin ?? '–'

export function ServerPanel({ trace, summary }: { trace: RequestTrace; summary: TraceSummary }) {
  const phases = trace.spans.filter((span) => span.parentId === trace.spans[0]?.id)
  return (
    <>
      <div className="otw-perf-grid">
        <Stat label="Server time">
          <Rated metric="server" value={trace.duration}>
            {trace.duration === null ? 'running' : formatMs(trace.duration)}
          </Rated>
        </Stat>
        <Stat label="Status">{trace.status ?? '–'}</Stat>
        <Stat label="Queries">
          {summary.queries.count} · {formatMs(summary.queries.time)}
        </Stat>
        <Stat label="Hook handlers">
          {summary.hooks.count} · {formatMs(summary.hooks.time)}
        </Stat>
        <Stat label="Heap used">{formatBytes(trace.memory?.heapUsed)}</Stat>
        <Stat label="Process memory (RSS)">{formatBytes(trace.memory?.rss)}</Stat>
      </div>
      <p className="otw-perf-note">
        {trace.method} <code>{trace.path ?? '–'}</code>
        {trace.route && (
          <>
            {' '}
            · route <code>{trace.route}</code>
          </>
        )}{' '}
        · trace <code>{trace.id}</code>
      </p>
      {summary.boot && (
        <p className="otw-perf-warning">
          The CMS started during this request ({formatMs(summary.boot.duration)}): the first request
          after a start, a plugin change or a settings change pays for it.
        </p>
      )}
      {summary.errors.length > 0 && (
        <>
          <h3>Errors</h3>
          <table>
            <tbody>
              {summary.errors.map((span) => (
                <tr key={span.id}>
                  <td>{span.name}</td>
                  <td className="otw-perf-error">{span.error}</td>
                  <td>{plugin(span)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Where the time went</h3>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Plugin</th>
            <th className="num">Starts at</th>
            <th className="num">Took</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((span) => (
            <tr key={span.id}>
              <td>{span.name}</td>
              <td>{plugin(span)}</td>
              <td className="num">{formatMs(span.start)}</td>
              <td className="num">{formatMs(span.duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trace.droppedSpans > 0 && (
        <p className="otw-perf-note">
          {trace.droppedSpans} more steps weren't recorded: the limit is 2,000.
        </p>
      )}
    </>
  )
}

const TIMELINE_LIMIT = 400

export function TimelinePanel({ trace }: { trace: RequestTrace }) {
  const total = Math.max(
    trace.duration ?? 0,
    ...trace.spans.map((span) => span.start + span.duration),
    1,
  )
  const depth = depths(trace)
  const shown = treeOrder(trace).slice(0, TIMELINE_LIMIT)
  return (
    <>
      <table className="otw-perf-timeline">
        <thead>
          <tr>
            <th>Step</th>
            <th>Plugin</th>
            <th className="num">Took</th>
            <th>0 – {formatMs(total)}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((span) => (
            <tr key={span.id}>
              <td style={{ paddingLeft: 8 + (depth.get(span.id) ?? 0) * 12 }}>
                <code
                  title={
                    span.kind === 'query'
                      ? String(span.attributes['db.statement'] ?? '')
                      : undefined
                  }
                >
                  {label(span)}
                </code>
              </td>
              <td>{plugin(span)}</td>
              <td className="num">{formatMs(span.duration)}</td>
              <td className="bar">
                <div className="otw-perf-track">
                  <div
                    className="otw-perf-fill"
                    data-kind={span.kind}
                    style={{
                      left: `${(span.start / total) * 100}%`,
                      width: `${(span.duration / total) * 100}%`,
                    }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trace.spans.length > TIMELINE_LIMIT && (
        <p className="otw-perf-note">
          Showing the first {TIMELINE_LIMIT} of {trace.spans.length} steps.
        </p>
      )}
    </>
  )
}

export function DatabasePanel({ trace, summary }: { trace: RequestTrace; summary: TraceSummary }) {
  const queries = trace.spans.filter((span) => span.kind === 'query')
  const slowest = summary.queries.slowest
  return (
    <>
      <p className="otw-perf-note">
        {queries.length} {queries.length === 1 ? 'query' : 'queries'} in{' '}
        {formatMs(summary.queries.time)}
        {slowest && <>; the slowest took {formatMs(slowest.duration)}</>}. Values are never
        recorded.
      </p>
      {summary.queries.repeated.length > 0 && (
        <div className="otw-perf-warning">
          <strong>Repeated queries.</strong> The same statement ran more than once, which usually
          means a query inside a loop (an N+1). Fetch the rows in one query instead.
          <table>
            <tbody>
              {summary.queries.repeated.map((entry) => (
                <tr key={entry.statement}>
                  <td>
                    <code>{entry.statement}</code>
                  </td>
                  <td className="num">× {entry.count}</td>
                  <td className="num">{formatMs(entry.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Statement</th>
            <th>Plugin</th>
            <th className="num">Rows</th>
            <th className="num">Took</th>
          </tr>
        </thead>
        <tbody>
          {queries.map((span, index) => (
            <tr key={span.id}>
              <td className="num">{index + 1}</td>
              <td>
                <code>{String(span.attributes['db.statement'] ?? span.name)}</code>
                {span.error && <div className="otw-perf-error">{span.error}</div>}
              </td>
              <td>{plugin(span)}</td>
              <td className="num">{String(span.attributes['db.rows'] ?? '–')}</td>
              <td className={`num${span === slowest ? ' otw-perf-fair' : ''}`}>
                {formatMs(span.duration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function HooksPanel({ summary }: { summary: TraceSummary }) {
  if (summary.hooks.count === 0)
    return <p className="otw-perf-note">No action or filter ran a handler.</p>
  return (
    <>
      <p className="otw-perf-note">
        {summary.hooks.count} handler {summary.hooks.count === 1 ? 'run' : 'runs'} in{' '}
        {formatMs(summary.hooks.time)}, slowest first.
      </p>
      <table>
        <thead>
          <tr>
            <th>Hook</th>
            <th>Type</th>
            <th>Handlers from</th>
            <th className="num">Runs</th>
            <th className="num">Took</th>
          </tr>
        </thead>
        <tbody>
          {summary.hooks.byName.map((hook) => (
            <tr key={`${hook.type} ${hook.name}`}>
              <td>
                <code>{hook.name}</code>
              </td>
              <td>{hook.type}</td>
              <td>{hook.plugins.join(', ') || '–'}</td>
              <td className="num">{hook.calls}</td>
              <td className="num">{formatMs(hook.time)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function PluginsPanel({ summary }: { summary: TraceSummary }) {
  if (summary.plugins.length === 0)
    return <p className="otw-perf-note">No plugin did anything timed in this request.</p>
  return (
    <>
      <p className="otw-perf-note">
        Time spent in each plugin's own code: its queries, hook handlers, page loads and setup.
        Rendering its components counts toward the page, not the plugin.
      </p>
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th className="num">Queries</th>
            <th className="num">Query time</th>
            <th className="num">Hooks</th>
            <th className="num">Loading</th>
            <th className="num">Setup</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.plugins.map((entry) => (
            <tr key={entry.plugin}>
              <td>{entry.plugin}</td>
              <td className="num">{entry.queries}</td>
              <td className="num">{formatMs(entry.queryTime)}</td>
              <td className="num">{formatMs(entry.hookTime)}</td>
              <td className="num">{formatMs(entry.loadTime)}</td>
              <td className="num">{formatMs(entry.setupTime)}</td>
              <td className="num">{formatMs(pluginTime(entry))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function BrowserPanel({ browser }: { browser: BrowserMetrics }) {
  const { phases } = browser
  const steps: [string, number | null, string][] = phases
    ? [
        ['Redirects', phases.redirect, ''],
        ['DNS lookup', phases.dns, ''],
        ['Connecting', phases.connect, phases.tls ? `TLS ${formatMs(phases.tls)}` : ''],
        ['Waiting for the server', phases.waiting, 'from sending the request to the first byte'],
        ['Downloading the HTML', phases.download, formatBytes(phases.transferSize)],
        ['Building the page (DOM)', phases.domProcessing, ''],
      ]
    : []
  return (
    <>
      <div className="otw-perf-grid">
        <Stat label="Time to first byte">
          <Rated metric="ttfb" value={phases?.ttfb ?? null}>
            {formatMs(phases?.ttfb)}
          </Rated>
        </Stat>
        <Stat label="First Contentful Paint">
          <Rated metric="fcp" value={browser.fcp}>
            {formatMs(browser.fcp)}
          </Rated>
        </Stat>
        <Stat label="Largest Contentful Paint">
          <Rated metric="lcp" value={browser.lcp?.time ?? null}>
            {formatMs(browser.lcp?.time)}
          </Rated>
        </Stat>
        <Stat label="Ready to use">
          <Rated metric="ready" value={browser.ready}>
            {formatMs(browser.ready)}
          </Rated>
        </Stat>
        <Stat label="Cumulative Layout Shift">
          <Rated metric="cls" value={browser.cls}>
            {browser.cls.toFixed(3)}
          </Rated>
        </Stat>
        <Stat label="Interaction to Next Paint">
          <Rated metric="inp" value={browser.inp}>
            {browser.inp === null ? 'no input yet' : formatMs(browser.inp)}
          </Rated>
        </Stat>
        <Stat label="Total Blocking Time">
          <Rated metric="tbt" value={browser.longTasks.blocking}>
            {formatMs(browser.longTasks.blocking)}
          </Rated>
        </Stat>
        <Stat label="DOMContentLoaded">{formatMs(phases?.domContentLoaded)}</Stat>
        <Stat label="Load">{formatMs(phases?.load)}</Stat>
      </div>
      {browser.lcp?.element && (
        <p className="otw-perf-note">
          The largest paint was <code>{browser.lcp.element}</code>.
        </p>
      )}
      <h3>Loading the page</h3>
      <table>
        <tbody>
          {steps.map(([label, value, note]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num">{formatMs(value)}</td>
              <td className="otw-perf-muted">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>This browser</h3>
      <table>
        <tbody>
          <tr>
            <td>Long tasks</td>
            <td className="num">{browser.longTasks.count}</td>
            <td className="otw-perf-muted">tasks over 50 ms that kept the page from responding</td>
          </tr>
          <tr>
            <td>Protocol</td>
            <td className="num">{phases?.protocol || '–'}</td>
            <td className="otw-perf-muted">
              {phases?.type === 'reload' ? 'a reload' : (phases?.type ?? '')}
            </td>
          </tr>
          {browser.memory && (
            <tr>
              <td>JavaScript heap</td>
              <td className="num">{formatBytes(browser.memory.used)}</td>
              <td className="otw-perf-muted">of {formatBytes(browser.memory.limit)}</td>
            </tr>
          )}
          {browser.connection && (
            <tr>
              <td>Connection</td>
              <td className="num">{browser.connection.type}</td>
              <td className="otw-perf-muted">
                {browser.connection.downlink !== null && `${browser.connection.downlink} Mbit/s`}
                {browser.connection.rtt !== null && ` · ${browser.connection.rtt} ms round trip`}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

export function ResourcesPanel({ resources }: { resources: ResourceSummary }) {
  return (
    <>
      <p className="otw-perf-note">
        {resources.count} files, {formatBytes(resources.transferSize)} transferred,{' '}
        {resources.cached} from the browser's cache.
      </p>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th className="num">Files</th>
            <th className="num">Transferred</th>
          </tr>
        </thead>
        <tbody>
          {resources.byType.map((entry) => (
            <tr key={entry.type}>
              <td>{entry.type}</td>
              <td className="num">{entry.count}</td>
              <td className="num">{formatBytes(entry.transferSize)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Slowest</h3>
      <table>
        <tbody>
          {resources.slowest.map((entry) => (
            <tr key={entry.name}>
              <td>
                <code>{entry.name.replace(/^https?:\/\/[^/]+/, '')}</code>
              </td>
              <td>{entry.type}</td>
              <td className="num">{entry.cached ? 'cached' : formatBytes(entry.transferSize)}</td>
              <td className="num">{formatMs(entry.duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
