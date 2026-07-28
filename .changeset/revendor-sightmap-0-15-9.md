---
"subtext": patch
---

Update the vendored sightmap skills from `@sightmap/sightmap` 0.14.0 to 0.15.9. `sightmap-authoring` and `sightmap-browser` pick up a large batch of upstream improvements — offline/live selector parity for `id`/`class`/SVG, visibility-aware coverage, `wait-for --view`/`--component` step boundaries, client-side redirect reporting, and stricter loud validation — along with the corrected authoring guidance. Also adds `AGENTS.md` documenting the vendoring and release process (the pin is now `--save-exact` for reproducible provenance).
