# Performance for OTW CMS

`@otwdesign/plugin-performance`: WordPress's Query Monitor, plus the browser's side. People with the
`performance.view` capability (administrators, unless a plugin grants it to others) get a bar at
the bottom of every page of the site and the admin. For each request, it shows:

- the server's time;
- the browser's timings: the Web Vitals (FCP, LCP, CLS, INP), and when the page was ready to use;
- the page's size, and its JavaScript memory;
- every query, with its statement (never its values) and the plugin it ran for, with repeated
  statements flagged;
- hooks, each plugin's own time, a timeline of Next.js's and the CMS's steps, resources, and the
  pages opened since.

**Performance › Recent requests** keeps the last 100 for ten minutes. The user guide is the docs
site's Performance page; how tracing works is in its Hosting › Tracing and Plugin Handbook ›
Tracing.

It reads the traces the CMS records with OpenTelemetry (`cms.traces`), which OTW CMS has from
1.0.0. For people who can't see the bar, it adds the recording (about 0.15 ms on
the server) and none of the bar's code: it's a chunk of its own, loaded only where the bar shows.

On prerendered pages, which have no request to trace and don't know who's viewing, a site puts
`<PrerenderedPerformanceBar />` from `@otwdesign/plugin-performance/prerendered` last in the layout's
`<body>`. It shows the browser's side to people the bar has shown to elsewhere (a cookie,
`performance_bar`, marks them, and the server confirms); visitors get about a kilobyte of script
that finds no cookie and stops.

## Installing it

```sh
npm install @otwdesign/plugin-performance
```

Add `"@otwdesign/plugin-performance"` to `plugins` in the site's `cms.config.json`, rebuild, and
activate **Performance** on the Plugins screen. It needs OTW CMS 1.0.0 or later.

## Working on it

The published plugin takes the CMS from npm (its peer dependencies). This repo links a checkout
of the CMS next to it instead, so the plugin, the CMS and the docs site, which links this repo
too, are worked on together:

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
src/        the plugin: index.tsx (the main entry), admin.tsx (the admin entry, `./admin`: Recent
            requests and the bar on admin screens), slot.tsx (the bar's slot, for both),
            bar.tsx (the bar, a client component, loaded by lazy-bar.tsx), prerendered.tsx (for
            prerendered layouts), hint.ts (its cookie), panels.tsx (what it shows), format.ts
            and browser.ts (the numbers)
test/       unit tests, on @otwdesign/testing's kernel
site/       an OTW site with this plugin installed, for `pnpm dev` and the e2e tests
site/catalog  a test plugin with a slow page (/catalog: one query per item) for the bar to find
site/src/app/(static)  a prerendered layout and page (/about), for PrerenderedPerformanceBar
```

Two things follow from linking to a checkout, and go away once the CMS is installed from npm:

- The linked packages bring their own React and drizzle-orm. Vitest dedupes React; the tests use
  plain SQL strings rather than drizzle's `sql` helper, whose types wouldn't match the CMS's.
- `site/next.config.ts` sets Turbopack's root to the folder holding both repos.

## Releasing

Published by hand, as the Plugin Handbook's Publishing page describes. Bump the version in
`package.json` and in `src/index.tsx` (the plugin's `version`), then:

```sh
pnpm check && pnpm test:e2e
pnpm publish --dry-run   # this package alone: src, README.md, LICENSE, NOTICE and package.json
pnpm publish             # npm asks for your second factor
```

## License

Apache License 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 OTW SRL.
