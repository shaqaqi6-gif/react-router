# CLAUDE.md

This file guides Claude Code (and other AI assistants) working in this repository.

## Repository identity — read this first

Despite the GitHub repo name `react-router`, **this project is not React Router
and contains no React or React Router code.** It is **"نظام تدقيق نقليات
الدريس" (Aldrees Transport Audit)** — a vanilla-JS/Vite single-page app that
audits Aldrees's monthly Aramco fuel-transport invoices against a
"should-cost" model (nearest reference center × official rate table), surfaces
waste/anomalies, and renders dashboards, a Leaflet route map, and Excel
exports. `package.json`'s `name` is `aldrees-transport-audit`. Do not assume
React conventions, JSX, routing libraries, or component frameworks apply here.

The UI, comments, commit messages, and most identifiers are in **Arabic**
(RTL). Match that convention for any new UI copy, comments, or commit
messages touching this app — don't switch to English mid-file.

## Running the project

```bash
npm install      # install dependencies
npm run dev      # Vite dev server with HMR
npm run build    # production build → dist/
npm run preview  # preview the production build locally
```

There is no test suite and no lint/typecheck script configured — verify
changes by running `npm run dev` and exercising the affected page in a
browser (see "Verification" below).

## Architecture

Plain ES modules bundled by Vite (`vite.config.js`), no framework:

```
index.html          # page shell (login screen + topbar) — Vite entry point
vite.config.js       # build config (target: esnext for top-level await; raised
                      #   chunk-size warning limit because data.js is huge)
netlify.toml          # build command/publish dir + security headers for Netlify
public/
  _headers, _redirects # Netlify static headers / SPA fallback routing
  favicon.svg
netlify/functions/
  admin-users.js      # server-side Netlify Function: create/update/delete
                       #   Supabase auth users using the service_role key
supabase/
  schema.sql           # Postgres schema + RLS policies for the Supabase backend
src/
  main.js              # ~1400 lines: all UI logic — nav, page renderers, map,
                        #   invoice upload, exports, admin/users page, plan page
  engine.js             # pure audit engine: AldreesAudit.runAudit(rows, REF, period)
                        #   → { AGG, STATIONS, GEO_trips }
  data.js               # generated/embedded reference + default data (huge,
                        #   effectively one line per export — see below)
  corrections.js         # applyCorrections(STATIONS, AGG): post-hoc fixes for
                        #   stations whose road-distance matrix was wrong
  auth.js                # picks auth provider at runtime (Supabase vs local)
  auth-local.js           # localStorage-based auth/user-management (offline mode)
  auth-supabase.js        # Supabase-backed auth/user-management (online mode)
  styles/app.css           # all application styles (Leaflet CSS comes from npm)
```

### Data flow

1. `engine.js` exports `AldreesAudit.runAudit(rows, REF, period)`. It takes
   raw invoice rows `[sno, origin, km, wt, amt, notrips, product, destName]`
   plus the static reference bundle `REF` (`{ meta, roads:{centers,roads},
   price:{large,small}, najran, o2a, tanks, tolPerTrip }`) and returns
   `{ AGG, STATIONS, GEO_trips }`:
   - `AGG` — aggregate KPIs (total waste, compliance %, breakdowns by origin
     center / city / region / product, load-efficiency stats, top offenders).
   - `STATIONS` — per-station rollup (nearest benchmark center, distance,
     rate, waste, tier, per-origin and per-product breakdowns).
   - `GEO_trips` — per-station trip count/avg distance, used by the map.
2. `data.js` exports the static reference data consumed by the engine and UI:
   `initialAGG`, `initialStations` (default dataset — currently April 2026
   invoice results), `GEO` (station coordinates), `CENTERS` (Aramco center
   coordinates), `RM` (road-distance matrix: `{centers, roads}`), `REF`
   (engine reference bundle), `APPROVED` (official Aramco-approved
   origin-center assignments).
3. `corrections.js` (`applyCorrections`) patches `STATIONS`/`AGG` in place for
   individual stations whose road matrix was known to be wrong (e.g. copied
   from the wrong station). It's currently a no-op (`FIXES = {}`) because the
   authoritative "actual measured" distance file now covers all stations, but
   the mechanism stays wired in `main.js` for future one-off fixes.
4. `main.js` wires it together: imports the initial data, calls
   `applyCorrections`, renders the SPA (hash-free client-side nav via
   `nav()`/`render()`/`PAGE`), and on invoice upload (`handleUpload` →
   `parseInvoiceRows` → `AldreesAudit.runAudit`) replaces `AGG`/`STATIONS`
   for that period via `applyAudit`. Multiple uploaded periods are cached in
   `localStorage` (`PERIODS`, `persistPeriods`/`loadPeriodsStore`).

### `data.js` conventions

`src/data.js` is a **generated, near-minified data blob** (~1.9MB, effectively
one line per `export const`), not hand-authored source. When it needs
updating (new invoice defaults, corrected coordinates, a new distance
matrix), regenerate/replace the relevant `export const` assignment
programmatically rather than hand-editing JSON inline — do not attempt to
manually reformat or "clean up" this file's style. Read it with `offset`/
`limit` or targeted `grep`, never a full read (it exceeds normal file-read
limits).

### Cache-busting: `DATA_VERSION`

`main.js` defines `APP_VERSION` (semver-ish app version, bump on every
user-visible change) and `DATA_VERSION` (a fingerprint string). Whenever
`data.js`'s reference distances/engine logic change in a way that would make
previously-cached uploaded-period results in `localStorage` stale/wrong,
**bump `DATA_VERSION`** — the app compares it on boot and discards
`localStorage`-cached periods on mismatch, forcing recomputation with the new
data. Forgetting this bump is a real historical bug class in this repo (see
changelog entry 1.9.15 in README.md).

### Auth

`src/auth.js` auto-selects a provider at import time (top-level `await`,
hence `target: 'esnext'` in `vite.config.js`):
- If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set →
  `auth-supabase.js` (real Supabase auth + cross-device "who's online"
  presence + centralized login/logout log; user creation goes through the
  `netlify/functions/admin-users.js` serverless function, which holds the
  secret `service_role` key server-side and verifies the caller is an active
  admin before acting).
- Otherwise → `auth-local.js` (browser-`localStorage`-only auth, single
  browser/device, for local trial use). Default local admin login is
  `aldrees` / `Aldrees@2026` (see README.md §1.7.1).

Both providers expose the same interface so the rest of the app doesn't
branch on which is active. See `SUPABASE_SETUP.md` for the full Supabase
provisioning walkthrough (create project → run `supabase/schema.sql` → seed
first admin → set 4 env vars on Netlify → invite users from within the app).

**Security note (from README.md):** the local-provider login is
client-side-only hash comparison and is not secure for sensitive data in
production; the Supabase provider is the intended production path.
`service_role` key must only ever live in Netlify's server-side environment
variables — never in `VITE_*` vars or committed to git (`.env*` is
gitignored).

### Deployment

Deploys to Netlify (`netlify.toml`): build command `npm run build`, publish
`dist/`, functions from `netlify/functions/`, plus baseline security headers
(`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`). SPA routing
handled by `public/_redirects` (`/* /index.html 200`).

## Domain model (needed to reason about correctness)

- **Station (محطة)**: a fuel station identified by `sno`, receiving fuel
  deliveries ("ردود"/trips) from one or more Aramco supply centers.
- **Center (مركز)**: one of 21 Aramco supply centers with known coordinates.
- **Benchmark/nearest center**: for each station, the nearest valid center by
  measured road distance (`RM.roads[sno]`), excluding dropped centers (Najran
  is fully excluded — `DROP_CENTERS`/`NAJRAN`).
- **Band (شريحة)**: a 50km pricing tier, `band(km) = floor((km-1)/50) + 1`.
- **Should-cost**: rate for the nearest center's band × trip count. **Waste**
  = actual billed amount − should-cost, floored at 0.
- **Tolerance (`tolPerTrip`, default 110 SAR/trip)**: if a station's waste
  per trip at a given origin is below this, it's forgiven (treated as 0
  waste) — applied uniformly across all stats, not just one table.
- **Coverage (`cov`)**: `benchmark` (station has a known road-distance
  matrix), `proxy` (station missing from the reference matrix — evaluated
  against its own cheapest historical trip instead), or excluded.
- **Taif routing rule**: tanker trucks are banned from the Al-Hada road, so
  Taif-area stations' effective reference distance is the longer of the
  matrix distance and the minimum actually-billed distance (forced detour via
  Al-Sail) — see the `TAIF`/`taifMinKm` logic in `engine.js`.
- **Load efficiency / consolidation**: separately, the engine flags groups of
  small under-filled trips (same station/band/product) that would have been
  cheaper consolidated into fewer large-tanker trips, subject to tank
  capacity (`TANKS`) constraints.

When touching `engine.js`, preserve these invariants — the numbers it
produces are cross-checked against real Aramco settlement data, and small
logic changes visibly shift the total waste figure (tracked per-release in
the README changelog).

## Conventions to follow

- **No framework, no build-step abstractions beyond Vite.** Keep new UI code
  as plain DOM manipulation (`$`/`$$` helpers, template-string HTML,
  `element.onclick = ...`) matching `main.js`'s existing style — don't
  introduce a component library or state-management dependency.
- **Numbers**: use the existing `num`/`numD`/`sar`/`sarD`/`pct` helpers in
  `main.js` for formatting (comma-grouped, LTR-wrapped for RTL context)
  rather than ad hoc `toLocaleString` calls.
- **Arabic-first**: new labels, tooltips, error messages, and comments should
  be in Arabic to match the rest of the UI, unless the user explicitly asks
  otherwise.
- **`README.md` changelog**: the project keeps a manually-maintained,
  detailed release log at the bottom of `README.md` (semver-ish, newest
  first) describing exactly what data/logic changed and its effect on the
  total waste figure. When you make a user-visible or data/logic change,
  bump `APP_VERSION` in `main.js`, add a changelog entry in the same style
  (what changed, why, resulting waste figure), and bump `DATA_VERSION` too if
  cached periods would now be computed incorrectly.
- **Don't hand-edit `data.js`'s data literals directly** unless the change is
  trivial and easy to verify by eye — prefer writing/using a small script to
  regenerate the relevant export, and sanity-check resulting totals against
  the engine.
- **Secrets**: never commit `.env`, and never let `SUPABASE_SERVICE_ROLE_KEY`
  reach client-side code — it belongs only in Netlify Function environment
  variables, referenced from `netlify/functions/*.js`.

## Verification

There's no automated test suite. To verify a change:
1. `npm run dev` and open the app in a browser.
2. Log in (local mode default admin: `aldrees` / `Aldrees@2026`, unless
   Supabase env vars are configured).
3. Exercise the affected page(s) — dashboard totals, alerts, station detail
   modal, map, or invoice upload flow — and confirm the numbers/behavior
   match expectations (cross-check waste totals against the README changelog
   baseline if you touched `engine.js`, `corrections.js`, or `data.js`).
4. `npm run build` to confirm the production build still succeeds (catches
   import/syntax errors Vite dev mode may tolerate).
