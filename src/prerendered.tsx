'use client'

import { useEffect, useState } from 'react'
import { hasHint, hintCookie } from './hint'
import { LazyPerformanceBar } from './lazy-bar'

// Plugins' API routes are mounted under /api/p/{plugin id}.
const VIEWER_URL = '/api/p/performance/viewer'

interface Viewer {
  endpoint: string
  historyUrl: string
}

/**
 * The performance bar for prerendered pages: put it at the end of a prerendered layout's
 * `<body>`, where a layout rendered per request has `<Slot name="site.footer">`. Such pages have
 * no request of their own to trace, so it shows the browser's side of the page load.
 *
 * Its HTML is empty. In the browser, visitors get a cookie check and nothing more; people the
 * bar has shown to elsewhere, in the admin for instance, get it once the server confirms they
 * may see it.
 */
export function PrerenderedPerformanceBar() {
  const [viewer, setViewer] = useState<Viewer | null>(null)
  useEffect(() => {
    if (!hasHint(document.cookie)) return
    let stopped = false
    const check = async () => {
      try {
        const response = await fetch(VIEWER_URL, { credentials: 'same-origin', cache: 'no-store' })
        if (response.ok) {
          const answer = (await response.json()) as Viewer
          if (!stopped) setViewer(answer)
        } else if ([401, 403, 404].includes(response.status)) {
          // Signed out, no longer allowed, or the plugin is off: stop asking.
          document.cookie = hintCookie({ secure: location.protocol === 'https:', remember: false })
        }
      } catch (error) {
        console.warn('performance: could not check whether you may see the bar', error)
      }
    }
    void check()
    return () => {
      stopped = true
    }
  }, [])
  if (!viewer) return null
  return (
    <LazyPerformanceBar
      traceId={null}
      endpoint={viewer.endpoint}
      available
      historyUrl={viewer.historyUrl}
      prerendered
    />
  )
}
