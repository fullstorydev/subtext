---
"subtext": minor
---

subtext-sightmap: reinstate the sightmap side-band upload path. The public skills lost the upload workflow when sightmap support was pulled from the initial release; this restores it in the first-party bridge skill. Bundles the `collect_and_upload_sightmap.py` collector beside the skill (referenced skill-relative, no plugin-root variable) and documents `review-open` / `live-connect` / `live-tunnel` → `sightmap_upload_url` → collector (before zoom/snapshot) as the preferred way to feed a `.sightmap/` corpus into a review. The inline `review-open sightmap:` array is demoted to a small, hand-authored / no-Python fallback, with the hierarchical-flatten caveat spelled out.
