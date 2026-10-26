---
"subtext": minor
---

Add `subtext-doctor`: checks that Subtext is set up correctly for an app on any
platform. It confirms the plugin is connected, gates on capture health (session
length, recorded interactions, log errors), then measures how many recorded clicks
or taps resolve to named sightmap components and maps each gap to a fix.
Platform details live in per-platform references: React Native is field-tested
(native library views exposed only as `#id`, Fabric wrapper flattening,
`fs-exclude` dropping taps, frames large enough to end capture); native iOS,
Android and web start as unverified stubs.
