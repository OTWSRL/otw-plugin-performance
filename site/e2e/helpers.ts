import { expect, type Page } from '@playwright/test'

export const ADMIN = {
  name: 'Ada Admin',
  email: 'ada@example.com',
  password: 'a strong e2e password',
}

export const CUSTOMER = { email: 'cy@example.com', password: 'another e2e password' }

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login\?next=/)
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page).not.toHaveURL(/\/admin\/login/)
}

/** The one-time message after a form post. */
export function notice(page: Page, message: string) {
  return expect(page.getByRole('status').filter({ hasText: message })).toBeVisible()
}

/**
 * A top-level menu entry, which opens its section's first page, as in WordPress. Its name may
 * end in WordPress's update count, as in "Plugins (1 update)".
 */
export function openSection(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const name = new RegExp(`^${escaped}( \\(\\d+ updates?\\))?$`)
  return page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name }).click()
}
