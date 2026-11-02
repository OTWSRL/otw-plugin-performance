import { beforeEach, describe, expect, it } from 'vitest'
import { hydratedAt, markHydrated } from '../src/hydrated'

describe('markHydrated', () => {
  beforeEach(() => performance.clearMarks())

  it('has nothing to say before the page hydrates', () => {
    expect(hydratedAt()).toBeNull()
  })

  it("keeps the first time: the bar mounting again later isn't the page hydrating", async () => {
    markHydrated()
    const first = hydratedAt()
    expect(first).toBeGreaterThan(0)
    await new Promise((resolve) => setTimeout(resolve, 5))
    markHydrated()
    expect(hydratedAt()).toBe(first)
  })
})
