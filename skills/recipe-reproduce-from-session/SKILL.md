---
name: subtext:recipe-reproduce
description: Short recipe to reproduce a user flow locally from a session URL.
metadata:
  requires:
    skills: ["subtext:session", "subtext:live", "subtext:sightmap", "subtext:shared", "subtext:tunnel"]
---

# Recipe: Reproduce from Session

> **PREREQUISITE:** Read `subtext:shared`, `subtext:session`, `subtext:live`, `subtext:sightmap`, and `subtext:tunnel`.

## Steps

1. **Open session**: `review-open(session_url=...)` — extract event summaries and repro steps
2. **Extract repro steps** from event summaries: URLs, clicks, form fills, waits, expected outcomes
3. **Set up tunnel if localhost**: `live-tunnel()` then `tunnel-connect({ relayUrl, target })` — grab `connectionId` from the response and pass it as `connection_id` to `live-connect`
4. **Navigate to local URL**: `live-view-navigate(url=...)` — map session URL to local equivalent
5. **For each step**: `live-view-snapshot()` → interact (`live-act-click`/`live-act-fill`/`live-act-keypress`) → capture evidence
6. **At key moments**: `live-view-screenshot()` for visual evidence, check `live-log-list` and `live-net-list`
7. **Report outcome**: reproduced / not reproduced / partial — with component hierarchy and errors
8. **Write back sightmap gaps**: any unnamed components or missing views discovered during the run
