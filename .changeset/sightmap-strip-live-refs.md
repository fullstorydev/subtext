---
"subtext": patch
---

subtext-sightmap: remove references to live-mode tools from the sightmap upload
instructions. The bridge skill documented `live-connect` / `live-tunnel` (and
`live-view-new`) as alternate sources of the `sightmap_upload_url`, but those are
Subtext Verify tools, not part of this plugin. The upload path here is
`review-open` → `sightmap_upload_url` → collector (before `review-zoom` /
`review-snapshot`), which is confirmed working; the instructions now describe only
that flow.
