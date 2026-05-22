---
"subtext": minor
---

tunnel: package hygiene — split build/dist, untrack artifacts, harden publish.

Cleans up the publish flow so the tarball is always self-contained and local
builds can't get into a half-built state.

- `tunnel/build/` and `tunnel/dist/` are now gitignored; reproducible from
  sources via `npm run build` / `npm run bundle`.
- `bin`/`files` point at `dist/`; `prepack` runs `bundle` so `npm publish` and
  `npm pack` are always self-contained.
- `npm test` and `npm run build` are self-bootstrapping (`clean && tsc`).
- Adds `npm run verify` (`npm pack --dry-run`) for quick "what would ship?" checks.
- `main.ts` walks up to find `package.json` so it works from both the tsc
  output (`build/src/main.js`) and the rollup bundle (`dist/index.js`).
