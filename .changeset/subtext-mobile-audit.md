---
"subtext": minor
---

Add `subtext-mobile-audit`: a post-setup audit for native mobile apps. It gates on
capture health (session length, recorded taps, device-log errors), then measures how
many recorded taps resolve to named sightmap components and maps each gap to a fix.
The React Native fix table covers `testID`s on native library views that the SDK
exposes only as `#id`, Fabric wrapper flattening, `fs-exclude` dropping taps, and
frames large enough to end capture.
