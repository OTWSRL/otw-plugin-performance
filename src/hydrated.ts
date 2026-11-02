// When React had hydrated the page, so its links and buttons respond. A performance mark, so the
// bar, a chunk that arrives later, can read it; DevTools shows it too.
const HYDRATED = 'performance:hydrated'

/** Marks the page hydrated. Only the first call counts. */
export function markHydrated(): void {
  if (performance.getEntriesByName(HYDRATED, 'mark').length === 0) performance.mark(HYDRATED)
}

/** When the page was hydrated, from the start of its load; `null` until it's marked. */
export function hydratedAt(): number | null {
  return performance.getEntriesByName(HYDRATED, 'mark')[0]?.startTime ?? null
}
