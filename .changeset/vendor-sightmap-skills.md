---
"subtext": minor
---

Bundle the sightmap skills. `sightmap-authoring` and `sightmap-browser` are now vendored from the `@sightmap/sightmap` package into `skills/`, and a new `subtext-sightmap` skill bridges a project's `.sightmap/` corpus into session review (passing definitions to `review-open` for annotated snapshots). No extra install and no binary required at plugin install time.
