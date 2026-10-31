# Performance Baseline Report — Arknights Team Builder

**Target URL:** https://yyiik0220-collab.github.io/arknights-team-builder/  
**Measured:** 2026-10-30  
**Method:** Structural / curl-based analysis (Lighthouse CLI unavailable; PageSpeed Insights API quota exhausted).  
**Phase 6 purpose:** Re-run the same checks after optimizations and compare the values below.

---

## 1. Estimated Lighthouse category scores

These are estimates derived from the actual asset structure, headers, and timings. They are **not** real Lighthouse scores. Use them only as a relative baseline.

| Category | Baseline estimate | Confidence | Main reason |
|---|---|---|---|
| **Performance** | **60–75 / 100** | Medium | Many unminified ES-module requests; large JSON parsed on startup; no explicit resource hints; no service worker. |
| **Accessibility** | **85–95 / 100** | High | Good semantic HTML, ARIA labels, skip link, focus states, language attr; minor risk from dynamic text injection. |
| **Best Practices** | **80–90 / 100** | Medium-High | HTTPS, HSTS, CSP-like fetch discipline; no security headers beyond HSTS; JS modules loaded unbundled. |
| **SEO** | **90–100 / 100** | High | Canonical, OG/Twitter tags, meta description, manifest, favicons, lang=ja all present. |

---

## 2. Core Web Vitals (estimated / measured)

| Metric | Value | Threshold | Status |
|---|---|---|---|
| **LCP (Largest Contentful Paint)** | ~1.0–1.8 s | ≤2.5 s Good | **Good** |
| **CLS (Cumulative Layout Shift)** | ~0 | ≤0.1 Good | **Good** |
| **INP (Interaction to Next Paint)** | ~100–250 ms | ≤200 ms Good | **Good / Needs Improvement** |
| **TTFB (Time to First Byte)** | **~205 ms** | ≤600 ms Good | **Good** |

### TTFB curl evidence (wired connection, cache miss)

| Resource | TTFB | Total |
|---|---|---|
| `index.html` | 205 ms | 217 ms |
| `data/operators.json` | 155 ms | 305 ms |
| `data/stages.json` | 167 ms | 219 ms |
| `data/i18n.json` | 142 ms | 211 ms |

> Note: Mobile / 3G / slow 4G will show higher values. The JSON parse/validation step (`validateMasterData`) adds main-thread work after download.

---

## 3. Page weight audit

### Transfer sizes (with gzip where supported)

| Type | Files | Approx. compressed | Approx. uncompressed |
|---|---|---|---|
| HTML | 1 | ~4.7 KB | ~18.8 KB |
| CSS | 5 | ~8 KB | ~29.9 KB |
| JS modules | 16 | ~28 KB | ~101 KB |
| Data JSON | 4 | ~56 KB | ~298 KB |
| Images / icons | 3 | ~58 KB | ~58 KB |
| **Total** | **~24 requests** | **~155 KB** | **~505 KB** |

### Key asset sizes (remote, with Content-Length)

```text
HTML                 18,821
CSS base.css            973
CSS layout.css      3,374
CSS components.css 16,278
CSS database.css    5,341
CSS responsive.css  3,897
JS main.js          3,538
JS modules total   97,511
  app-state.js          790
  data-loader.js      3,825
  database-ui.js     11,576
  database.js           848
  growth-advisor.js   9,944
  growth-ui.js        7,630
  i18n.js             2,993
  import-export.js   11,198
  navigation.js       1,761
  recommendation.js   6,983
  roster-ui.js       13,086
  roster.js           1,425
  scoring.js          6,806
  stages.js          14,770
  storage.js          2,693
  ui.js               2,183
JSON operators.json 143,537
JSON stages.json     63,345
JSON i18n.json       88,594
JSON scoring-config.json 2,277
assets/ogp.png       56,440
assets/favicon.png    1,543
favicon.svg             311
manifest.json           626
```

---

## 4. Architecture observations

1. **No bundler / minification.** All CSS and JS are served unminified with whitespace and comments. This increases parse/transfer cost.
2. **16 ES module requests.** `main.js` is `type="module"` and imports 15 modules. Each module causes a separate network request (HTTP/2 mitigates but does not eliminate overhead).
3. **All master data fetched up-front.** `loadMasterData()` fetches `operators.json`, `stages.json`, `scoring-config.json` in parallel. `i18n.json` is fetched separately. The app cannot render meaningful content until all finish and `validateMasterData()` runs.
4. **No service worker / no offline caching.** Second visits still hit the network for all assets.
5. **No resource hints.** No `preload`, `prefetch`, `modulepreload`, or `dns-prefetch` tags.
6. **No lazy loading of views.** All view HTML is in `index.html`; hidden sections are toggled via JS. This keeps first HTML download larger but avoids extra view requests.
7. **No operator images.** The app is text/data-heavy; image weight is low (only favicons + OGP).
8. **Good accessibility foundations.** Skip link, `aria-live` regions, `aria-label`, focus-visible styles, semantic headings, `lang` switching.

---

## 5. Security / Best-Practice headers

Only GitHub Pages defaults are present:

| Header | Present? |
|---|---|
| Strict-Transport-Security | Yes |
| X-Content-Type-Options | No |
| X-Frame-Options | No |
| Content-Security-Policy | No |
| Referrer-Policy | No |

Best-Practices score is mainly supported by HTTPS and valid HTML structure; missing security headers are the main downgrade risk.

---

## 6. Improvement priority matrix

| Priority | Area | Current state | Target | Impact |
|---|---|---|---|---|
| **P0** | Bundle & minify JS/CSS | 16 JS + 5 CSS requests, unminified | Single (or few) minified bundles | Large Performance gain |
| **P0** | Preload critical data | No hints | `preload`/`modulepreload` for main.js, operators.json, i18n.json | Faster LCP / TTI |
| **P1** | Lazy-load non-critical data | All JSON fetched on boot | Fetch scoring/stages on demand; defer i18n if not needed | Reduced initial payload |
| **P1** | Service worker / caching | None | Cache-first for static assets + data | Repeat-visit Performance |
| **P2** | Security headers | Only HSTS | Add CSP, X-Content-Type-Options, Referrer-Policy via meta/headers | Best Practices |
| **P2** | Image optimization | OGP 56 KB PNG | Consider WebP/AVIF with PNG fallback | Small Performance gain |
| **P3** | JSON size reduction | ~298 KB raw data | Tree-shake unused fields; compress further | Medium Performance gain |

---

## 7. Recommended Phase 6 experiments

1. Run `npm run build` with a bundler (Vite / Rollup) that minifies and splits JS/CSS.
2. Add `<link rel="modulepreload" href="./js/main.js">` and preload critical JSON.
3. Add a service worker generated by the build step to cache `index.html`, JS/CSS, and JSON.
4. Measure again with the same curl commands and (if available) Lighthouse CLI.

---

## 8. Raw measurement commands

```bash
# TTFB / total time
curl -s -o nul -w "time_starttransfer: %{time_starttransfer}s\ntime_total: %{time_total}s\n" https://yyiik0220-collab.github.io/arknights-team-builder/

# Compressed size
curl -s -o nul -H "Accept-Encoding: gzip, deflate, br" -w "%{size_download} bytes\n" https://yyiik0220-collab.github.io/arknights-team-builder/index.html

# Asset headers
for %f in (css/base.css css/layout.css css/components.css css/database.css css/responsive.css js/main.js data/operators.json data/stages.json data/i18n.json data/scoring-config.json assets/ogp.png assets/favicon.png manifest.json favicon.svg) do curl -s -I https://yyiik0220-collab.github.io/arknights-team-builder/%f
```

---

*Baseline recorded for Phase 6 comparison.*
