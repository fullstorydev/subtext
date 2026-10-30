---
"subtext": minor
---

Add `subtext-doctor`: checks that Subtext is set up correctly for an app on any
platform. It confirms the plugin is connected, gates on capture health (session
length, recorded interactions, log errors), then measures how many recorded clicks
or taps resolve to named sightmap components, checks views and named requests, and
maps each gap to a fix. Platform details live in per-platform references. React
Native (iOS) and web (Next.js + MUI) are field-tested: the web reference covers
development-only selector attributes, Subtext Verify clicks not being recorded,
localhost tunnel limits, and the web last-bracket exceptions. Native iOS and
Android are partly verified: Android covers emulator setup from scratch, finding
the session URL in logcat, and the selector attribute.
