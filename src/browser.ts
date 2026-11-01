// What the browser says about a page, from the Performance APIs. Plain functions over entries,
// so they can be tested without a browser; the bar feeds them what PerformanceObserver reports.

export interface NavigationEntry {
  startTime: number
  redirectStart: number
  redirectEnd: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  secureConnectionStart: number
  requestStart: number
  responseStart: number
  responseEnd: number
  domInteractive: number
  domContentLoadedEventEnd: number
  loadEventEnd: number
  transferSize: number
  encodedBodySize: number
  nextHopProtocol: string
  type: string
}

export interface NavigationPhases {
  redirect: number
  dns: number
  connect: number
  tls: number
  /** From sending the request to the first byte of the response: mostly the server's time. */
  waiting: number
  /** Time to first byte, from the start of the navigation. */
  ttfb: number
  download: number
  /** From the last byte to the DOM being ready to use. */
  domProcessing: number
  domContentLoaded: number
  load: number | null
  transferSize: number
  protocol: string
  type: string
}

const span = (from: number, to: number) => (from > 0 && to >= from ? to - from : 0)

export function navigationPhases(entry: NavigationEntry): NavigationPhases {
  return {
    redirect: span(entry.redirectStart, entry.redirectEnd),
    dns: span(entry.domainLookupStart, entry.domainLookupEnd),
    connect: span(entry.connectStart, entry.connectEnd),
    tls: entry.secureConnectionStart > 0 ? span(entry.secureConnectionStart, entry.connectEnd) : 0,
    waiting: span(entry.requestStart, entry.responseStart),
    ttfb: entry.responseStart - entry.startTime,
    download: span(entry.responseStart, entry.responseEnd),
    domProcessing: span(entry.responseEnd, entry.domInteractive),
    domContentLoaded: entry.domContentLoadedEventEnd - entry.startTime,
    load: entry.loadEventEnd > 0 ? entry.loadEventEnd - entry.startTime : null,
    transferSize: entry.transferSize,
    protocol: entry.nextHopProtocol,
    type: entry.type,
  }
}

export interface LayoutShift {
  value: number
  startTime: number
  hadRecentInput: boolean
}

/**
 * Cumulative Layout Shift as Chrome reports it: the worst session window, where a window gathers
 * shifts less than a second apart, for at most five seconds. Shifts right after input don't count.
 */
export function cumulativeLayoutShift(shifts: readonly LayoutShift[]): number {
  let worst = 0
  let window = 0
  let windowStart = 0
  let last = -Infinity
  for (const shift of shifts) {
    if (shift.hadRecentInput) continue
    if (shift.startTime - last > 1000 || shift.startTime - windowStart > 5000) {
      window = 0
      windowStart = shift.startTime
    }
    window += shift.value
    last = shift.startTime
    worst = Math.max(worst, window)
  }
  return worst
}

export interface InteractionEvent {
  interactionId: number
  duration: number
}

/**
 * Interaction to Next Paint: the slowest interaction, or near it on busy pages (the 98th
 * percentile, so one outlier in fifty is forgiven). `null` before any interaction.
 */
export function interactionToNextPaint(events: readonly InteractionEvent[]): number | null {
  const byInteraction = new Map<number, number>()
  for (const event of events) {
    if (!event.interactionId) continue
    byInteraction.set(
      event.interactionId,
      Math.max(byInteraction.get(event.interactionId) ?? 0, event.duration),
    )
  }
  const durations = [...byInteraction.values()].sort((a, b) => b - a)
  if (durations.length === 0) return null
  return durations[Math.min(durations.length - 1, Math.floor(durations.length / 50))]!
}

/** Total Blocking Time: how long long tasks blocked the main thread past 50 ms each. */
export function totalBlockingTime(tasks: readonly { duration: number }[]): number {
  return tasks.reduce((total, task) => total + Math.max(0, task.duration - 50), 0)
}

export interface ResourceEntry {
  name: string
  initiatorType: string
  startTime: number
  duration: number
  transferSize: number
  decodedBodySize: number
}

export interface ResourceSummary {
  count: number
  transferSize: number
  cached: number
  byType: { type: string; count: number; transferSize: number }[]
  slowest: { name: string; type: string; duration: number; transferSize: number; cached: boolean }[]
}

/** Downloads by type, and the slowest; a resource with no transfer but a body came from the cache. */
export function summarizeResources(
  entries: readonly ResourceEntry[],
  slowest = 10,
): ResourceSummary {
  const byType = new Map<string, { type: string; count: number; transferSize: number }>()
  let transferSize = 0
  let cached = 0
  for (const entry of entries) {
    const type = entry.initiatorType || 'other'
    const total = byType.get(type) ?? { type, count: 0, transferSize: 0 }
    total.count++
    total.transferSize += entry.transferSize
    byType.set(type, total)
    transferSize += entry.transferSize
    if (entry.transferSize === 0 && entry.decodedBodySize > 0) cached++
  }
  return {
    count: entries.length,
    transferSize,
    cached,
    byType: [...byType.values()].sort((a, b) => b.transferSize - a.transferSize),
    slowest: [...entries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, slowest)
      .map((entry) => ({
        name: entry.name,
        type: entry.initiatorType || 'other',
        duration: entry.duration,
        transferSize: entry.transferSize,
        cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
      })),
  }
}

/** A short label for an element, such as `img.hero` or `h1#title`, for the LCP element. */
export function describeElement(
  element: { tagName: string; id?: string; className?: unknown } | null | undefined,
): string | null {
  if (!element) return null
  const tag = element.tagName.toLowerCase()
  if (element.id) return `${tag}#${element.id}`
  const classes =
    typeof element.className === 'string'
      ? element.className.trim().split(/\s+/).filter(Boolean)
      : []
  return classes.length ? `${tag}.${classes.slice(0, 2).join('.')}` : tag
}
