# Performance for OTW CMS

`@otw/plugin-performance`: WordPress's Query Monitor, plus the browser's side. People with the
`performance.view` capability (administrators, unless a plugin grants it to others) get a bar at
the bottom of every page of the site and the admin. For each request, it shows:

- the server's time;
- the browser's timings, with the Web Vitals (FCP, LCP, CLS, INP);
- every query, with its statement (never its values) and the plugin it ran for, with repeated
  statements flagged;
- hooks, each plugin's own time, a timeline of Next.js's and the CMS's steps, resources, and the
  pages opened since.

**Performance › Recent requests** keeps the last 100 for ten minutes. The user guide is the docs
site's Performance page; how tracing works is in its Hosting › Tracing and Plugin Handbook ›
Tracing.

It reads the traces the CMS records with OpenTelemetry (`cms.traces`), so it needs the version of
OTW CMS that has them, and adds nothing to requests of people who can't see the bar beyond
recording them (about 0.15 ms).

## Working on it

The CMS's packages aren't on npm yet, so this repo links to a checkout of the CMS next to it:

```
nextjs-cms/              the CMS
otw-plugin-performance/  this repo
```

```sh
pnpm install
pnpm dev          # the test site, at http://localhost:3000 (the first visit sets up an administrator)
pnpm check        # lint, format, typecheck, unit tests
pnpm test:e2e     # Playwright, against the test site built from scratch
```

```
src/        the plugin: index.tsx (the definition), bar.tsx (the bar, a client component),
            panels.tsx and admin.tsx (what it shows), format.ts and browser.ts (the numbers)
test/       unit tests, on @otw/testing's kernel
site/       an OTW site with this plugin installed, for `pnpm dev` and the e2e tests
site/catalog  a test plugin with a slow page (/catalog: one query per item) for the bar to find
```

Two things follow from linking to a checkout, and go away once the CMS is installed from npm:

- The linked packages bring their own React and drizzle-orm. Vitest dedupes React; the tests use
  plain SQL strings rather than drizzle's `sql` helper, whose types wouldn't match the CMS's.
- `site/next.config.ts` sets Turbopack's root to the folder holding both repos.

## Releasing

Once `@otw/sdk` and `@otw/admin-ui` are on npm: point the development dependencies at `^0.1.0`
instead of `link:`, drop `"private"`, and publish as the Plugin Handbook's Publishing page
describes. `files` already limits the package to `src`.
