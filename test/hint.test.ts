import { describe, expect, it } from 'vitest'
import { hasHint, hintCookie } from '../src/hint'

describe('the hint cookie', () => {
  it('is found among the page’s other cookies, and only with its value', () => {
    expect(hasHint('theme=dark; performance_bar=1; lang=en')).toBe(true)
    expect(hasHint('performance_bar=1')).toBe(true)
    expect(hasHint('')).toBe(false)
    expect(hasHint('performance_bar=; theme=dark')).toBe(false)
    expect(hasHint('my_performance_bar=1')).toBe(false)
  })

  it('is set for a month, for the whole site, and secure on HTTPS', () => {
    expect(hintCookie({ secure: false, remember: true })).toBe(
      'performance_bar=1; max-age=2592000; path=/; samesite=lax',
    )
    expect(hintCookie({ secure: true, remember: true })).toMatch(/; secure$/)
  })

  it('is cleared by expiring it', () => {
    expect(hintCookie({ secure: false, remember: false })).toBe(
      'performance_bar=; max-age=0; path=/; samesite=lax',
    )
  })
})
