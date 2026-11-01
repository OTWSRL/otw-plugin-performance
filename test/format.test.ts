import type { RequestTrace, TraceSpan } from '@otw/sdk'
import { describe, expect, it } from 'vitest'
import { depths, formatBytes, formatMs, label, rate, summarize, treeOrder } from '../src/format'

function span(id: string, extra: Partial<TraceSpan> = {}): TraceSpan {
  return {
    id,
    parentId: 'root',
    name: id,
    kind: 'other',
    start: 0,
    duration: 1,
    plugin: null,
    attributes: {},
    ...extra,
  }
}

const query = (id: string, statement: string, duration: number, plugin: string) =>
  span(id, { kind: 'query', duration, plugin, attributes: { 'db.statement': statement } })

const hook = (id: string, name: string, type: string, duration: number, plugin: string) =>
  span(id, {
    kind: 'hook',
    duration,
    plugin,
    attributes: { 'otw.hook': name, 'otw.hook.type': type },
  })

function trace(spans: TraceSpan[]): RequestTrace {
  return {
    id: 't1',
    method: 'GET',
    route: '/[...slug]',
    path: '/shop',
    status: 200,
    startedAt: 0,
    duration: 50,
    memory: null,
    spans: [span('root', { parentId: null, kind: 'request', duration: 50 }), ...spans],
    droppedSpans: 0,
  }
}

describe('formatting', () => {
  it('reads milliseconds and bytes the way people do', () => {
    expect([formatMs(0.42), formatMs(182.4), formatMs(1240), formatMs(null)]).toEqual([
      '0.42 ms',
      '182 ms',
      '1.24 s',
      '–',
    ])
    expect([
      formatBytes(512),
      formatBytes(49_357),
      formatBytes(1_363_149),
      formatBytes(undefined),
    ]).toEqual(['512 B', '48.2 KB', '1.3 MB', '–'])
  })

  it('rates metrics against the Web Vitals thresholds', () => {
    expect([rate('lcp', 2500), rate('lcp', 3000), rate('lcp', 4001)]).toEqual([
      'good',
      'fair',
      'poor',
    ])
    expect([rate('cls', 0.05), rate('inp', 600), rate('ttfb', null)]).toEqual([
      'good',
      'poor',
      null,
    ])
  })
})

describe('summarize', () => {
  it('adds up queries and finds the same statement run again and again', () => {
    const summary = summarize(
      trace([
        query('q1', 'SELECT * FROM shop_products', 4, 'shop'),
        query('q2', 'SELECT * FROM shop_prices  WHERE id = $1', 2, 'shop'),
        query('q3', 'SELECT * FROM shop_prices WHERE id = $1', 3, 'shop'),
        query('q4', 'SELECT * FROM shop_prices WHERE id = $1', 1, 'reviews'),
      ]),
    )
    expect(summary.queries).toMatchObject({ count: 4, time: 10 })
    expect(summary.queries.slowest!.id).toBe('q1')
    expect(summary.queries.repeated).toEqual([
      { statement: 'SELECT * FROM shop_prices WHERE id = $1', count: 3, time: 6 },
    ])
  })

  it('totals hooks by name and time by plugin', () => {
    const summary = summarize(
      trace([
        hook('h1', 'shop.price', 'filter', 2, 'shop'),
        hook('h2', 'shop.price', 'filter', 5, 'sale'),
        hook('h3', 'shop.viewed', 'action', 1, 'stats'),
        query('q1', 'SELECT 1', 3, 'sale'),
        span('s1', { kind: 'setup', duration: 7, plugin: 'stats' }),
      ]),
    )
    expect(summary.hooks.byName).toEqual([
      { name: 'shop.price', type: 'filter', calls: 2, time: 7, plugins: ['shop', 'sale'] },
      { name: 'shop.viewed', type: 'action', calls: 1, time: 1, plugins: ['stats'] },
    ])
    expect(
      summary.plugins.map((entry) => [
        entry.plugin,
        entry.queryTime + entry.hookTime + entry.setupTime,
      ]),
    ).toEqual([
      ['sale', 8],
      ['stats', 8],
      ['shop', 2],
    ])
  })

  it('collects the spans that failed', () => {
    expect(
      summarize(trace([span('bad', { error: 'disk full' })])).errors.map((entry) => entry.id),
    ).toEqual(['bad'])
  })
})

describe('plugin totals', () => {
  it('count a query inside the plugin’s own page load once', () => {
    const summary = summarize(
      trace([
        span('load', { kind: 'page', duration: 10, plugin: 'shop' }),
        query('q', 'SELECT 1', 6, 'shop'),
        { ...query('nested', 'SELECT 2', 4, 'shop'), parentId: 'load' },
      ]),
    )
    expect(summary.plugins[0]).toMatchObject({
      plugin: 'shop',
      loadTime: 10,
      queryTime: 10,
      total: 16,
    })
  })
})

describe('treeOrder and label', () => {
  it('lists parents before their children, even when they start together', () => {
    const spans = [
      span('child', { parentId: 'parent', start: 2 }),
      span('parent', { start: 2 }),
      span('later', { start: 5 }),
    ]
    expect(treeOrder(trace(spans)).map((entry) => entry.id)).toEqual([
      'root',
      'parent',
      'child',
      'later',
    ])
  })

  it('names a query by its statement, shortened', () => {
    expect(label(query('q', 'SELECT  *\n FROM t', 1, 'x'))).toBe('SELECT * FROM t')
    expect(label(span('s', { name: 'render route' }))).toBe('render route')
    expect(label(query('q', 'x'.repeat(100), 1, 'x'), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})

describe('depths', () => {
  it('measures how far each span sits under the request', () => {
    const spans = [span('a'), span('b', { parentId: 'a' }), span('c', { parentId: 'missing' })]
    expect(Object.fromEntries(depths(trace(spans)))).toEqual({ root: 0, a: 1, b: 2, c: 0 })
  })
})
