import { describe, expect, it } from 'vitest'
import {
  cumulativeLayoutShift,
  describeElement,
  interactionToNextPaint,
  navigationPhases,
  navigationTiming,
  pageReady,
  pageSize,
  summarizeResources,
  totalBlockingTime,
} from '../src/browser'

describe('navigationPhases', () => {
  it('splits a page load into its phases', () => {
    const phases = navigationPhases({
      startTime: 0,
      redirectStart: 0,
      redirectEnd: 0,
      domainLookupStart: 5,
      domainLookupEnd: 25,
      connectStart: 25,
      connectEnd: 70,
      secureConnectionStart: 40,
      requestStart: 72,
      responseStart: 252,
      responseEnd: 300,
      domInteractive: 420,
      domContentLoadedEventEnd: 450,
      loadEventEnd: 900,
      transferSize: 18_000,
      encodedBodySize: 17_500,
      nextHopProtocol: 'h2',
      type: 'navigate',
    })
    expect(phases).toEqual({
      redirect: 0,
      dns: 20,
      connect: 45,
      tls: 30,
      waiting: 180,
      ttfb: 252,
      download: 48,
      domProcessing: 120,
      domContentLoaded: 450,
      load: 900,
      transferSize: 18_000,
      protocol: 'h2',
      type: 'navigate',
    })
  })
})

describe('cumulativeLayoutShift', () => {
  it('takes the worst session window and ignores shifts after input', () => {
    const shifts = [
      { value: 0.05, startTime: 100, hadRecentInput: false },
      { value: 0.05, startTime: 600, hadRecentInput: false },
      // More than a second later: a new window.
      { value: 0.02, startTime: 2000, hadRecentInput: false },
      { value: 0.5, startTime: 2100, hadRecentInput: true },
    ]
    expect(cumulativeLayoutShift(shifts)).toBeCloseTo(0.1)
    expect(cumulativeLayoutShift([])).toBe(0)
  })

  it('closes a window after five seconds even when shifts keep coming', () => {
    const shifts = Array.from({ length: 12 }, (_, i) => ({
      value: 0.01,
      startTime: i * 900,
      hadRecentInput: false,
    }))
    // 0, 900 … 4500: six shifts fit in the first five seconds.
    expect(cumulativeLayoutShift(shifts)).toBeCloseTo(0.06)
  })
})

describe('interactionToNextPaint', () => {
  it('is the slowest interaction, counting each once', () => {
    const events = [
      { interactionId: 1, duration: 40 },
      { interactionId: 1, duration: 120 },
      { interactionId: 2, duration: 80 },
      { interactionId: 0, duration: 900 },
    ]
    expect(interactionToNextPaint(events)).toBe(120)
    expect(interactionToNextPaint([])).toBeNull()
  })

  it('forgives one outlier in fifty on busy pages', () => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      interactionId: i + 1,
      duration: i === 0 ? 2000 : 100,
    }))
    expect(interactionToNextPaint(events)).toBe(100)
  })
})

describe('totalBlockingTime', () => {
  it('counts what each long task blocked past 50 ms', () => {
    expect(totalBlockingTime([{ duration: 120 }, { duration: 50 }, { duration: 80 }])).toBe(100)
  })
})

describe('summarizeResources', () => {
  it('totals downloads by type, counts cached ones, and lists the slowest', () => {
    const summary = summarizeResources(
      [
        {
          name: '/a.js',
          initiatorType: 'script',
          startTime: 0,
          duration: 300,
          transferSize: 40_000,
          decodedBodySize: 120_000,
        },
        {
          name: '/b.css',
          initiatorType: 'link',
          startTime: 0,
          duration: 50,
          transferSize: 0,
          decodedBodySize: 9_000,
        },
        {
          name: '/c.js',
          initiatorType: 'script',
          startTime: 0,
          duration: 120,
          transferSize: 10_000,
          decodedBodySize: 30_000,
        },
      ],
      2,
    )
    expect(summary).toMatchObject({ count: 3, transferSize: 50_000, cached: 1 })
    expect(summary.byType).toEqual([
      { type: 'script', count: 2, transferSize: 50_000 },
      { type: 'link', count: 1, transferSize: 0 },
    ])
    expect(summary.slowest.map((entry) => [entry.name, entry.cached])).toEqual([
      ['/a.js', false],
      ['/c.js', false],
    ])
  })
})

describe('describeElement', () => {
  it('names the element the way a selector would', () => {
    expect(describeElement({ tagName: 'IMG', id: 'hero' })).toBe('img#hero')
    expect(describeElement({ tagName: 'H1', className: 'title big extra' })).toBe('h1.title.big')
    expect(describeElement({ tagName: 'P', className: '' })).toBe('p')
    expect(describeElement(null)).toBeNull()
  })
})

describe('navigationTiming', () => {
  const request = (startTime: number, responseEnd: number) => ({
    startTime,
    duration: responseEnd - startTime,
    responseEnd,
    transferSize: 4000,
  })

  it('times a navigation from the click, with the request the click made', () => {
    const timing = navigationTiming(1350, '/b', { at: 1000, path: '/b' }, [
      request(100, 150),
      request(1005, 1305),
    ])
    expect(timing).toEqual({ wait: 350, fetch: { duration: 300, transferSize: 4000 } })
  })

  it('still times a page the router fetched before the click', () => {
    // Fetched when its link came into view; the click only shows it.
    const timing = navigationTiming(5040, '/b', { at: 5000, path: '/b' }, [request(4400, 4700)])
    expect(timing).toEqual({ wait: 40, fetch: null })
  })

  it('times it from the request when no click led there, as after a redirect', () => {
    const fetched = { wait: 350, fetch: { duration: 300, transferSize: 4000 } }
    expect(navigationTiming(2350, '/login', null, [request(2000, 2300)])).toEqual(fetched)
    expect(
      navigationTiming(2350, '/login', { at: 1990, path: '/account' }, [request(2000, 2300)]),
    ).toEqual(fetched)
  })

  it("doesn't guess with nothing to go by", () => {
    expect(navigationTiming(9000, '/b', null, [])).toEqual({ wait: null, fetch: null })
    // A request that ended long before the page changed was a prefetch.
    expect(navigationTiming(9000, '/b', null, [request(100, 400)])).toEqual({
      wait: null,
      fetch: null,
    })
  })
})

describe('pageSize', () => {
  const origin = 'https://shop.example'
  const file = (
    name: string,
    transferSize: number,
    encodedBodySize: number,
    decodedBodySize: number,
  ) => ({
    name,
    transferSize,
    encodedBodySize,
    decodedBodySize,
  })

  it('weighs the HTML and every file as sent, whether or not the cache had it this time', () => {
    const size = pageSize(
      { transferSize: 10_300, encodedBodySize: 10_000, decodedBodySize: 40_000 },
      [
        file(`${origin}/app.js`, 50_300, 50_000, 150_000),
        file(`${origin}/logo.png`, 0, 20_000, 20_000), // from the cache
      ],
      origin,
    )
    expect(size).toEqual({
      size: 80_000,
      transferred: 60_600,
      unpacked: 210_000,
      files: 3,
      unsized: 0,
    })
  })

  it('counts the files from other sites that keep their size to themselves', () => {
    const size = pageSize(
      null,
      [
        file('https://fonts.example/a.woff2', 0, 0, 0),
        file(`${origin}/api/ping`, 0, 0, 0), // empty, not hidden
        file('https://cdn.example/b.js', 9_000, 8_000, 30_000), // allowed by Timing-Allow-Origin
      ],
      origin,
    )
    expect(size).toEqual({
      size: 8_000,
      transferred: 9_000,
      unpacked: 30_000,
      files: 3,
      unsized: 1,
    })
  })
})

describe('pageReady', () => {
  it('is when React hydrated the page, once it was on screen', () => {
    expect(pageReady(400, 120)).toBe(400)
  })

  it("waits for the first paint: no one clicks what they can't see", () => {
    // A small cached page can hydrate before the browser first paints it.
    expect(pageReady(44, 72)).toBe(72)
  })

  it('goes by hydration until the paint is known, and is unknown before hydration', () => {
    expect(pageReady(300, null)).toBe(300)
    expect(pageReady(null, 120)).toBeNull()
  })
})
