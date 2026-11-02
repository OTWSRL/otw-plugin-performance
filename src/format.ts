import type { RequestTrace, TraceSpan } from '@otw/sdk'

/** `182 ms`, `1.24 s`; `–` when unknown. */
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–'
  if (ms < 1) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** `512 B`, `48.2 KB`, `1.3 MB`. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '–'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export type Metric = 'server' | 'ttfb' | 'fcp' | 'lcp' | 'ready' | 'cls' | 'inp' | 'tbt' | 'size'
export type Rating = 'good' | 'fair' | 'poor'

/**
 * Good up to the first value, poor past the second: Google's Web Vitals thresholds, and
 * Lighthouse's for Time to Interactive (ready) and total byte weight (size).
 */
export const THRESHOLDS: Readonly<Record<Metric, readonly [number, number]>> = {
  server: [200, 800],
  ttfb: [800, 1800],
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  ready: [3800, 7300],
  cls: [0.1, 0.25],
  inp: [200, 500],
  tbt: [200, 600],
  size: [2667 * 1024, 4000 * 1024],
}

export function rate(metric: Metric, value: number | null | undefined): Rating | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const [good, poor] = THRESHOLDS[metric]
  return value <= good ? 'good' : value <= poor ? 'fair' : 'poor'
}

export interface RepeatedQuery {
  statement: string
  count: number
  time: number
}

export interface HookTotal {
  name: string
  type: string
  calls: number
  time: number
  plugins: string[]
}

export interface PluginTotal {
  plugin: string
  queries: number
  queryTime: number
  hookTime: number
  loadTime: number
  setupTime: number
  /** Time in the plugin's outermost spans, so a query inside its page load counts once. */
  total: number
}

/** A request's trace, added up: its queries, hooks, plugins, boot and errors. */
export interface TraceSummary {
  queries: { count: number; time: number; slowest: TraceSpan | null; repeated: RepeatedQuery[] }
  hooks: { count: number; time: number; byName: HookTotal[] }
  plugins: PluginTotal[]
  boot: TraceSpan | null
  errors: TraceSpan[]
}

const normalize = (statement: string) => statement.replace(/\s+/g, ' ').trim()

/** A plugin's own time: its queries, hook handlers, page loads and setup, each counted once. */
export const pluginTime = (entry: PluginTotal) => entry.total

/**
 * What a request did, added up: queries (and the same statement run again and again, usually an
 * N+1), hooks by name, and the time each plugin took.
 */
export function summarize(trace: RequestTrace): TraceSummary {
  const queries = trace.spans.filter((span) => span.kind === 'query')
  const hooks = trace.spans.filter((span) => span.kind === 'hook')

  const byStatement = new Map<string, RepeatedQuery>()
  for (const query of queries) {
    const statement = normalize(String(query.attributes['db.statement'] ?? query.name))
    const entry = byStatement.get(statement) ?? { statement, count: 0, time: 0 }
    entry.count++
    entry.time += query.duration
    byStatement.set(statement, entry)
  }

  const byHook = new Map<string, HookTotal>()
  for (const hook of hooks) {
    const name = String(hook.attributes['otw.hook'] ?? hook.name)
    const type = String(hook.attributes['otw.hook.type'] ?? 'hook')
    const key = `${type} ${name}`
    const entry = byHook.get(key) ?? { name, type, calls: 0, time: 0, plugins: [] }
    entry.calls++
    entry.time += hook.duration
    if (hook.plugin && !entry.plugins.includes(hook.plugin)) entry.plugins.push(hook.plugin)
    byHook.set(key, entry)
  }

  const byPlugin = new Map<string, PluginTotal>()
  const totalFor = (plugin: string) => {
    let entry = byPlugin.get(plugin)
    if (!entry) {
      entry = { plugin, queries: 0, queryTime: 0, hookTime: 0, loadTime: 0, setupTime: 0, total: 0 }
      byPlugin.set(plugin, entry)
    }
    return entry
  }
  const byId = new Map(trace.spans.map((span) => [span.id, span]))
  const insideOwn = (span: TraceSpan) => {
    for (let parent = byId.get(span.parentId ?? ''), depth = 0; parent && depth < 100; depth++) {
      if (parent.plugin === span.plugin) return true
      parent = byId.get(parent.parentId ?? '')
    }
    return false
  }
  for (const span of trace.spans) {
    if (!span.plugin) continue
    const entry = totalFor(span.plugin)
    if (!insideOwn(span)) entry.total += span.duration
    if (span.kind === 'query') {
      entry.queries++
      entry.queryTime += span.duration
    } else if (span.kind === 'hook') entry.hookTime += span.duration
    else if (span.kind === 'page' || span.kind === 'admin' || span.kind === 'api')
      entry.loadTime += span.duration
    else if (span.kind === 'setup' || span.kind === 'migration') entry.setupTime += span.duration
  }

  const sum = (spans: TraceSpan[]) => spans.reduce((total, span) => total + span.duration, 0)
  return {
    queries: {
      count: queries.length,
      time: sum(queries),
      slowest: queries.reduce<TraceSpan | null>(
        (worst, span) => (!worst || span.duration > worst.duration ? span : worst),
        null,
      ),
      repeated: [...byStatement.values()]
        .filter((entry) => entry.count > 1)
        .sort((a, b) => b.count - a.count || b.time - a.time),
    },
    hooks: {
      count: hooks.length,
      time: sum(hooks),
      byName: [...byHook.values()].sort((a, b) => b.time - a.time),
    },
    plugins: [...byPlugin.values()].sort(
      (a, b) => pluginTime(b) - pluginTime(a) || a.plugin.localeCompare(b.plugin),
    ),
    boot: trace.spans.find((span) => span.kind === 'boot') ?? null,
    errors: trace.spans.filter((span) => span.error),
  }
}

/** The spans as a tree, depth first: each parent before its children, siblings by start. */
export function treeOrder(trace: RequestTrace): TraceSpan[] {
  const ids = new Set(trace.spans.map((span) => span.id))
  const children = new Map<string | null, TraceSpan[]>()
  for (const span of trace.spans) {
    const parent = span.parentId && ids.has(span.parentId) ? span.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), span])
  }
  const ordered: TraceSpan[] = []
  const visit = (parent: string | null) => {
    for (const span of (children.get(parent) ?? []).sort((a, b) => a.start - b.start)) {
      ordered.push(span)
      visit(span.id)
    }
  }
  visit(null)
  return ordered
}

/** What a span is called on screen: a query by its statement, everything else by its name. */
export function label(span: TraceSpan, max = 90): string {
  const statement = span.kind === 'query' ? span.attributes['db.statement'] : undefined
  const text = typeof statement === 'string' ? statement.replace(/\s+/g, ' ').trim() : span.name
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** How deep each span sits under the request, for the timeline. */
export function depths(trace: RequestTrace): Map<string, number> {
  const parents = new Map(trace.spans.map((span) => [span.id, span.parentId]))
  const depth = new Map<string, number>()
  const of = (id: string, seen = 0): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    const parent = parents.get(id)
    const value = !parent || !parents.has(parent) || seen > 50 ? 0 : of(parent, seen + 1) + 1
    depth.set(id, value)
    return value
  }
  for (const span of trace.spans) of(span.id)
  return depth
}
