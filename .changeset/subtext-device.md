---
"subtext": minor
---

Add `subtext-device`: the Subtext layer for driving a native iOS or React Native
app in the local iOS Simulator with `sightmap device`. It explains how the
Fullstory SDK's data reaches agents (batched uploads, point-in-time
`review-open` reads, network grains), what the app and org need, how to find the
session URL in the app's console and notice when the SDK ends a session, and
how to run a producer that drives the app alongside a consumer that reads the
session and authors `.sightmap/` requests and messages from it.
An Android reference covers the emulator: the Fullstory session as the network
source, finding the session URL in logcat, and a snapshot loop for improving an
app's sightmap, with a worked example, the not-in-front state, and
what to gitignore.
