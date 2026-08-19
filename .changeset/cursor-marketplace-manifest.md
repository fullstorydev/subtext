---
"subtext": patch
---

Add a Cursor-flavored marketplace manifest (`.cursor-plugin/marketplace.json`) listing only the root Subtext plugin. Cursor-style marketplace indexers read `.cursor-plugin/marketplace.json` before `.claude-plugin/marketplace.json`; without it they fall through to the Claude listing, where the external `subtext-verify` GitHub source reference either fails parsing or causes Subtext Verify to be surfaced instead of Subtext. Also teach `sync-manifest-versions.mjs` to keep the new manifest's version in sync.
