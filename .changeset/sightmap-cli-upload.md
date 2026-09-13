---
"subtext": minor
---

subtext-sightmap: upload the `.sightmap/` corpus with the `sightmap` CLI
(`sightmap export --url <sightmap_upload_url>`) instead of the bundled Python
collector, and remove `collect_and_upload_sightmap.py`.

`sightmap export` routes the upload through the Go loader — the single source of
truth, shared with the server-side reader — and POSTs the whole canonical wire
(components incl. view-scoped, views/routes, requests, messages, memory, tags), so
review snapshots and signals now also carry view and network annotations, not just
components. Drops the Python 3 / PyYAML dependency. The inline `review-open
sightmap:` array stays as the small-set / no-binary fallback. Also documents that
the upload token is single-use and time-limited (upload immediately after
`review-open`).
