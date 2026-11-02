'use client'

import type { RequestTrace } from '@otw/sdk'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  cumulativeLayoutShift,
  describeElement,
  interactionToNextPaint,
  navigationPhases,
  summarizeResources,
  totalBlockingTime,
  type InteractionEvent,
  type LayoutShift,
  type ResourceEntry,
} from './browser'
import { formatBytes, formatMs, summarize } from './format'
import { hintCookie } from './hint'
import {
  BrowserPanel,
  DatabasePanel,
  HooksPanel,
  PluginsPanel,
  Rated,
  ResourcesPanel,
  ServerPanel,
  TimelinePanel,
  type BrowserMetrics,
} from './panels'
import { CSS } from './styles'

type Tab =
  'server' | 'timeline' | 'database' | 'hooks' | 'plugins' | 'browser' | 'resources' | 'navigations'

const TABS: { id: Tab; label: string }[] = [
  { id: 'server', label: 'Server' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'database', label: 'Database' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'browser', label: 'Browser' },
  { id: 'resources', label: 'Resources' },
  { id: 'navigations', label: 'Navigations' },
]
/** What a prerendered page can show: there's no server trace to break down. */
const PRERENDERED_TABS: readonly Tab[] = ['server', 'browser', 'resources', 'navigations']

interface Navigation {
  path: string
  /** When the new page showed, from the start of the first page load. */
  at: number
  /** The router's request for the page, if it made one for this navigation. */
  fetch: { duration: number; total: number; transferSize: number } | null
}

type ServerState =
  | { status: 'loading' }
  | { status: 'ready'; trace: RequestTrace }
  | { status: 'missing'; reason: string }
  | { status: 'prerendered' }

const MAX_ATTEMPTS = 8

// Kept for the life of the page, not the component: Next.js re-creates an admin screen, bar and
// all, on each navigation between screens.
const session: { hydrated: number | null; path: string | null; navigations: Navigation[] } = {
  hydrated: null,
  path: null,
  navigations: [],
}

const NOT_INSTRUMENTED =
  "Server tracing is off: the site doesn't load the CMS's instrumentation. Run cms generate, which writes instrumentation.ts, and restart the site."
const NOT_RECORDED = 'This page was rendered before recording started. Reload it.'
const PRERENDERED =
  "This page's layout is prerendered, so the bar can't see the server's side of the request: Browser and Resources show the browser's. Pages rendered per request, and every admin screen, show the server's side too."

/** The server's trace of this request, fetched once the response has ended, retried until it has. */
function useServerTrace(
  traceId: string | null,
  endpoint: string,
  available: boolean,
  prerendered: boolean,
): ServerState {
  // Each result is tied to the trace it's for, so a new trace id reads as loading until it arrives.
  const [result, setResult] = useState<{ traceId: string; state: ServerState } | null>(null)
  useEffect(() => {
    if (!available || !traceId) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = (state: ServerState) => {
      if (!stopped) setResult({ traceId, state })
    }
    const load = async (attempt: number) => {
      const retry = () => {
        if (attempt + 1 < MAX_ATTEMPTS)
          timer = setTimeout(() => load(attempt + 1), 200 * (attempt + 1))
      }
      try {
        const response = await fetch(`${endpoint}/${traceId}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (response.ok) {
          const trace = (await response.json()) as RequestTrace
          settle({ status: 'ready', trace })
          if (trace.duration === null) retry()
        } else if (response.status === 404 && attempt + 1 < MAX_ATTEMPTS) {
          retry()
        } else {
          settle({
            status: 'missing',
            reason:
              response.status === 404
                ? "This request's trace isn't kept any more, or another server handled it."
                : `The server answered ${response.status}.`,
          })
        }
      } catch {
        settle({ status: 'missing', reason: "The server couldn't be reached." })
      }
    }
    void load(0)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [traceId, endpoint, available])

  if (prerendered) return { status: 'prerendered' }
  if (!available) return { status: 'missing', reason: NOT_INSTRUMENTED }
  if (!traceId) return { status: 'missing', reason: NOT_RECORDED }
  return result?.traceId === traceId ? result.state : { status: 'loading' }
}

/** What the browser reports about this page load, updated as PerformanceObserver hears more. */
function useBrowserMetrics(): BrowserMetrics | null {
  const [metrics, setMetrics] = useState<BrowserMetrics | null>(null)
  useEffect(() => {
    session.hydrated ??= performance.now()
    const { hydrated } = session
    const shifts: LayoutShift[] = []
    const events: InteractionEvent[] = []
    const tasks: { duration: number }[] = []
    let fcp: number | null = null
    let lcp: BrowserMetrics['lcp'] = null
    let frame = 0

    const update = () => {
      frame = 0
      const [navigation] = performance.getEntriesByType(
        'navigation',
      ) as PerformanceNavigationTiming[]
      const memory = (
        performance as Performance & {
          memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
        }
      ).memory
      const connection = (
        navigator as Navigator & {
          connection?: { effectiveType?: string; downlink?: number; rtt?: number }
        }
      ).connection
      setMetrics({
        phases: navigation ? navigationPhases(navigation) : null,
        fcp,
        lcp,
        cls: cumulativeLayoutShift(shifts),
        inp: interactionToNextPaint(events),
        longTasks: { count: tasks.length, blocking: totalBlockingTime(tasks) },
        hydrated,
        resources: summarizeResources(
          performance.getEntriesByType('resource') as unknown as ResourceEntry[],
        ),
        memory: memory ? { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit } : null,
        connection: connection?.effectiveType
          ? {
              type: connection.effectiveType,
              downlink: connection.downlink ?? null,
              rtt: connection.rtt ?? null,
            }
          : null,
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const observers: PerformanceObserver[] = []
    const observe = (
      type: string,
      onEntries: (entries: PerformanceEntryList) => void,
      options = {},
    ) => {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return
      const observer = new PerformanceObserver((list) => {
        onEntries(list.getEntries())
        schedule()
      })
      observer.observe({ type, buffered: true, ...options })
      observers.push(observer)
    }
    observe('paint', (entries) => {
      for (const entry of entries)
        if (entry.name === 'first-contentful-paint') fcp = entry.startTime
    })
    observe('largest-contentful-paint', (entries) => {
      const last = entries.at(-1) as LargestContentfulPaint | undefined
      if (last)
        lcp = { time: last.renderTime || last.startTime, element: describeElement(last.element) }
    })
    observe('layout-shift', (entries) => shifts.push(...(entries as unknown as LayoutShift[])))
    observe('event', (entries) => events.push(...(entries as unknown as InteractionEvent[])), {
      durationThreshold: 16,
    })
    observe('longtask', (entries) => tasks.push(...entries))
    observe('resource', () => {})

    // loadEventEnd is set after the load handlers run, so read it on the next turn.
    const onLoad = () => setTimeout(schedule, 0)
    window.addEventListener('load', onLoad)
    schedule()
    return () => {
      for (const observer of observers) observer.disconnect()
      window.removeEventListener('load', onLoad)
      cancelAnimationFrame(frame)
    }
  }, [])
  return metrics
}

const listeners = new Set<() => void>()
const NO_NAVIGATIONS: Navigation[] = []

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function recordNavigation(path: string) {
  const at = performance.now()
  const fetches = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(
    (entry) => entry.name.includes('_rsc=') && entry.responseEnd <= at + 50,
  )
  const last = fetches.at(-1)
  // A request that ended long before the page changed was a prefetch.
  const fetch =
    last && at - last.responseEnd < 1000
      ? { duration: last.duration, total: at - last.startTime, transferSize: last.transferSize }
      : null
  session.navigations = [{ path, at, fetch }, ...session.navigations].slice(0, 20)
  for (const listener of listeners) listener()
}

/**
 * Pages opened with the site's links, which Next.js renders without reloading. The router fetches
 * the new page just before the address changes, unless it fetched it earlier, on hover.
 */
function useNavigations(): Navigation[] {
  const pathname = usePathname()
  const navigations = useSyncExternalStore(
    subscribe,
    () => session.navigations,
    () => NO_NAVIGATIONS,
  )
  useEffect(() => {
    if (session.path === null) session.path = pathname
    if (session.path === pathname) return
    session.path = pathname
    recordNavigation(pathname)
  }, [pathname])
  return navigations
}

function Chip({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="otw-perf-chip" onClick={onClick}>
      <span>{label}</span>
      {children}
    </button>
  )
}

/**
 * The bar at the bottom of each page, like Query Monitor's: what the server and the browser did
 * for this request. Only people with `performance.view` get it. On a prerendered page, only the
 * browser's side.
 */
export function PerformanceBar({
  traceId,
  endpoint,
  available,
  historyUrl,
  prerendered = false,
}: {
  traceId: string | null
  endpoint: string
  available: boolean
  historyUrl: string
  prerendered?: boolean
}) {
  const [open, setOpen] = useState<Tab | null>(null)
  const server = useServerTrace(traceId, endpoint, available, prerendered)
  const browser = useBrowserMetrics()
  const navigations = useNavigations()
  const summary = useMemo(
    () => (server.status === 'ready' ? summarize(server.trace) : null),
    [server],
  )
  const tabs = prerendered ? TABS.filter((tab) => PRERENDERED_TABS.includes(tab.id)) : TABS

  // Tells prerendered pages, which can't know who's viewing, to ask the server for the bar.
  useEffect(() => {
    document.cookie = hintCookie({ secure: location.protocol === 'https:', remember: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  const show = (tab: Tab) => setOpen((current) => (current === tab ? null : tab))
  const trace = server.status === 'ready' ? server.trace : null
  const phases = browser?.phases

  return (
    <div className="otw-perf" data-otw-perf="" data-trace={traceId ?? undefined}>
      <style href="otw-performance" precedence="default">
        {CSS}
      </style>
      <div className="otw-perf-spacer" />
      <section className="otw-perf-dock" aria-label="Performance">
        {open && (
          <>
            <div className="otw-perf-tabs" role="tablist" aria-label="Performance details">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`otw-perf-tab-${tab.id}`}
                  aria-selected={open === tab.id}
                  aria-controls="otw-perf-panel"
                  onClick={() => setOpen(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <a
                href={historyUrl}
                className="otw-perf-muted"
                style={{ marginLeft: 'auto', padding: '4px 8px' }}
              >
                Recent requests
              </a>
            </div>
            <div
              className="otw-perf-panel"
              role="tabpanel"
              id="otw-perf-panel"
              aria-labelledby={`otw-perf-tab-${open}`}
            >
              <Panel tab={open} server={server} browser={browser} navigations={navigations} />
            </div>
          </>
        )}
        <div className="otw-perf-summary">
          <button
            type="button"
            className="otw-perf-toggle"
            aria-expanded={open !== null}
            onClick={() => setOpen(open ? null : 'server')}
          >
            {open ? '▾' : '▴'} Performance
          </button>
          <Chip label="Server" onClick={() => show('server')}>
            {trace ? (
              <Rated metric="server" value={trace.duration}>
                {trace.duration === null ? '…' : formatMs(trace.duration)}
              </Rated>
            ) : (
              <span className="otw-perf-muted">
                {server.status === 'loading'
                  ? '…'
                  : server.status === 'prerendered'
                    ? 'prerendered'
                    : 'n/a'}
              </span>
            )}
          </Chip>
          <Chip label="TTFB" onClick={() => show('browser')}>
            <Rated metric="ttfb" value={phases?.ttfb ?? null}>
              {formatMs(phases?.ttfb)}
            </Rated>
          </Chip>
          <Chip label="FCP" onClick={() => show('browser')}>
            <Rated metric="fcp" value={browser?.fcp ?? null}>
              {formatMs(browser?.fcp)}
            </Rated>
          </Chip>
          <Chip label="LCP" onClick={() => show('browser')}>
            <Rated metric="lcp" value={browser?.lcp?.time ?? null}>
              {formatMs(browser?.lcp?.time)}
            </Rated>
          </Chip>
          <Chip label="CLS" onClick={() => show('browser')}>
            <Rated metric="cls" value={browser?.cls ?? null}>
              {browser ? browser.cls.toFixed(3) : '–'}
            </Rated>
          </Chip>
          {browser?.inp !== null && browser?.inp !== undefined && (
            <Chip label="INP" onClick={() => show('browser')}>
              <Rated metric="inp" value={browser.inp}>
                {formatMs(browser.inp)}
              </Rated>
            </Chip>
          )}
          {!prerendered && (
            <>
              <Chip label="Queries" onClick={() => show('database')}>
                {summary ? (
                  <span className={summary.queries.repeated.length ? 'otw-perf-fair' : undefined}>
                    {summary.queries.count} · {formatMs(summary.queries.time)}
                  </span>
                ) : (
                  '–'
                )}
              </Chip>
              <Chip label="Hooks" onClick={() => show('hooks')}>
                {summary ? summary.hooks.count : '–'}
              </Chip>
              <Chip label="Memory" onClick={() => show('server')}>
                {formatBytes(trace?.memory?.heapUsed)}
              </Chip>
            </>
          )}
          {navigations.length > 0 && (
            <Chip label="Navigations" onClick={() => show('navigations')}>
              {navigations.length}
            </Chip>
          )}
        </div>
      </section>
    </div>
  )
}

function Panel({
  tab,
  server,
  browser,
  navigations,
}: {
  tab: Tab
  server: ServerState
  browser: BrowserMetrics | null
  navigations: Navigation[]
}) {
  if (tab === 'browser')
    return browser ? (
      <BrowserPanel browser={browser} />
    ) : (
      <p className="otw-perf-note">Measuring…</p>
    )
  if (tab === 'resources')
    return browser ? (
      <ResourcesPanel resources={browser.resources} />
    ) : (
      <p className="otw-perf-note">Measuring…</p>
    )
  if (tab === 'navigations') return <NavigationsPanel navigations={navigations} />
  if (server.status === 'loading')
    return <p className="otw-perf-note">Waiting for the server's trace…</p>
  if (server.status === 'missing') return <p className="otw-perf-note">{server.reason}</p>
  if (server.status === 'prerendered') return <p className="otw-perf-note">{PRERENDERED}</p>
  const summary = summarize(server.trace)
  if (tab === 'timeline') return <TimelinePanel trace={server.trace} />
  if (tab === 'database') return <DatabasePanel trace={server.trace} summary={summary} />
  if (tab === 'hooks') return <HooksPanel summary={summary} />
  if (tab === 'plugins') return <PluginsPanel summary={summary} />
  return <ServerPanel trace={server.trace} summary={summary} />
}

function NavigationsPanel({ navigations }: { navigations: Navigation[] }) {
  if (navigations.length === 0) {
    return (
      <p className="otw-perf-note">
        Pages opened with the site's links show here: Next.js renders them without reloading.
      </p>
    )
  }
  return (
    <>
      <p className="otw-perf-note">
        In the admin, the Server tabs follow each page you open. On the site, they show the first
        page: reload to see another page's server trace.
      </p>
      <table>
        <thead>
          <tr>
            <th>Page</th>
            <th className="num">Fetching it</th>
            <th className="num">Until shown</th>
            <th className="num">Transferred</th>
          </tr>
        </thead>
        <tbody>
          {navigations.map((navigation) => (
            <tr key={`${navigation.at}`}>
              <td>
                <code>{navigation.path}</code>
              </td>
              <td className="num">
                {navigation.fetch ? formatMs(navigation.fetch.duration) : 'prefetched'}
              </td>
              <td className="num">{navigation.fetch ? formatMs(navigation.fetch.total) : '–'}</td>
              <td className="num">
                {navigation.fetch ? formatBytes(navigation.fetch.transferSize) : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
