// The bar sits on every page of the site and the admin, so everything is scoped under .otw-perf
// and doesn't depend on the page's own styles. Dark on the bar; light on the admin's own pages.
export const CSS = `
.otw-perf {
  --perf-bg: #1d2327;
  --perf-panel: #23282d;
  --perf-line: #3c434a;
  --perf-text: #f0f0f1;
  --perf-muted: #a7aaad;
  --perf-accent: #72aee6;
  --perf-good: #68de7c;
  --perf-fair: #f2d675;
  --perf-poor: #ff8085;
  --perf-bar: #3858e9;
  color: var(--perf-text);
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  text-align: left;
}
.otw-perf *, .otw-perf *::before, .otw-perf *::after { box-sizing: border-box; }
.otw-perf-page {
  --perf-bg: #fff;
  --perf-panel: #fff;
  --perf-line: #dcdcde;
  --perf-text: #1d2327;
  --perf-muted: #646970;
  --perf-accent: #2271b1;
  --perf-good: #007017;
  --perf-fair: #996800;
  --perf-poor: #d63638;
  --perf-bar: #2271b1;
  font-size: 13px;
}
.otw-perf-spacer { height: 32px; }
.otw-perf-dock {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483000;
  background: var(--perf-bg); border-top: 1px solid var(--perf-line);
  box-shadow: 0 -2px 8px rgb(0 0 0 / 25%);
}
.otw-perf-summary {
  display: flex; align-items: center; gap: 2px; min-height: 32px; padding: 0 8px;
  overflow-x: auto; white-space: nowrap; scrollbar-width: none;
}
.otw-perf button {
  font: inherit; color: inherit; background: none; border: 0; cursor: pointer;
  padding: 4px 8px; border-radius: 3px;
}
.otw-perf button:hover, .otw-perf button[aria-selected='true'] { background: var(--perf-line); }
.otw-perf button:focus-visible { outline: 2px solid var(--perf-accent); outline-offset: -2px; }
.otw-perf-toggle { font-weight: 600; }
.otw-perf-chip { display: inline-flex; gap: 6px; align-items: baseline; }
.otw-perf-chip span:first-child { color: var(--perf-muted); }
.otw-perf-good { color: var(--perf-good); }
.otw-perf-fair { color: var(--perf-fair); }
.otw-perf-poor { color: var(--perf-poor); }
.otw-perf-muted { color: var(--perf-muted); }
.otw-perf-panel {
  height: min(50vh, 460px); overflow: auto; background: var(--perf-panel);
  border-top: 1px solid var(--perf-line); padding: 12px 16px 16px;
}
.otw-perf-page .otw-perf-panel { height: auto; overflow: visible; padding: 0; border: 0; }
.otw-perf-tabs { display: flex; gap: 2px; padding: 4px 8px 0; overflow-x: auto; border-top: 1px solid var(--perf-line); }
.otw-perf h3 { margin: 16px 0 6px; font-size: 13px; font-weight: 600; color: var(--perf-text); }
.otw-perf h3:first-child { margin-top: 0; }
.otw-perf table { width: 100%; border-collapse: collapse; margin: 0 0 8px; }
.otw-perf th, .otw-perf td {
  padding: 4px 8px; border-bottom: 1px solid var(--perf-line); text-align: left; vertical-align: top;
}
.otw-perf th { color: var(--perf-muted); font-weight: 600; }
.otw-perf td.num, .otw-perf th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.otw-perf code {
  font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: inherit; background: none;
  white-space: pre-wrap; word-break: break-word;
}
.otw-perf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 8px; }
.otw-perf-stat { border: 1px solid var(--perf-line); border-radius: 4px; padding: 8px 10px; }
.otw-perf-stat strong { display: block; font-size: 16px; font-weight: 600; }
.otw-perf-stat span { color: var(--perf-muted); }
.otw-perf-note { margin: 4px 0 8px; color: var(--perf-muted); }
.otw-perf-warning { margin: 4px 0 10px; padding: 6px 10px; border-left: 3px solid var(--perf-fair); background: rgb(242 214 117 / 10%); }
.otw-perf-error { color: var(--perf-poor); }
.otw-perf-timeline td.bar { width: 45%; min-width: 160px; }
.otw-perf-track { position: relative; height: 12px; }
.otw-perf-fill { position: absolute; top: 2px; height: 8px; min-width: 2px; border-radius: 2px; background: var(--perf-bar); }
.otw-perf-fill[data-kind='query'] { background: #9b51e0; }
.otw-perf-fill[data-kind='hook'] { background: #00a32a; }
.otw-perf-fill[data-kind='render'] { background: #dba617; }
.otw-perf-fill[data-kind='boot'], .otw-perf-fill[data-kind='setup'], .otw-perf-fill[data-kind='migration'] { background: #d63638; }
`
