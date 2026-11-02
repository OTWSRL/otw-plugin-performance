'use client'

import { lazy, Suspense, type ComponentProps } from 'react'
import type { PerformanceBar as Bar } from './bar'

// The bar's code is a chunk of its own, downloaded only where the bar renders. A site imports
// every installed plugin into its layout, so a client component imported directly would be
// downloaded by every visitor, on every page.
const PerformanceBar = lazy(() =>
  import('./bar').then((module) => ({ default: module.PerformanceBar })),
)

/** The performance bar, its code loaded only when it's shown. */
export function LazyPerformanceBar(props: ComponentProps<typeof Bar>) {
  return (
    <Suspense fallback={null}>
      <PerformanceBar {...props} />
    </Suspense>
  )
}
