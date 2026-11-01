import { describe, expect, it } from 'vitest'
import {
  cumulativeLayoutShift,
  describeElement,
  interactionToNextPaint,
  navigationPhases,
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
