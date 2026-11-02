// Prerendered pages are the same for everyone, so they can't know who's viewing. This cookie, set
// wherever the bar shows, tells them it's worth asking the server: visitors, who never have it,
// make no request at all. It grants nothing; the server decides.

/** The hint cookie's name. */
export const HINT_COOKIE = 'performance_bar'

const THIRTY_DAYS = 60 * 60 * 24 * 30

/** Whether `document.cookie` holds the hint. */
export function hasHint(cookies: string): boolean {
  return cookies.split(/;\s*/).includes(`${HINT_COOKIE}=1`)
}

/** A `document.cookie` assignment that sets the hint, or with `remember: false` clears it. */
export function hintCookie({ secure, remember }: { secure: boolean; remember: boolean }): string {
  const value = remember ? `1; max-age=${THIRTY_DAYS}` : '; max-age=0'
  return `${HINT_COOKIE}=${value}; path=/; samesite=lax${secure ? '; secure' : ''}`
}
