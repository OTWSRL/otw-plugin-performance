import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The CMS's packages are linked from a checkout and bring their own React; components need one.
  resolve: { dedupe: ['react', 'react-dom'] },
  test: {
    // The site's Playwright tests live under site/e2e.
    include: ['test/**/*.test.{ts,tsx}'],
    // Each test boots a CMS on an embedded database.
    testTimeout: 15_000,
  },
})
