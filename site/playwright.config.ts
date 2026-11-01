import { defineConfig, devices } from '@playwright/test'

const PORT = 3420

export default defineConfig({
  testDir: './e2e',
  // One server on one embedded database, set up by the first test.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A fresh database each run, so the first visit sets the site up.
    command: `node -e "fs.rmSync('.data/e2e', { recursive: true, force: true })" && pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { CMS_DATA_DIR: '.data/e2e', DATABASE_URL: '' },
  },
})
