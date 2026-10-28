---
"subtext": minor
---

`subtext-ios-sim` now drives React Native apps: role-less `Pressable`s with a `testID` count as interactive, React Navigation's tabs read as `tab` elements and its JS tab bar blocks taps like a native one, typing keeps up with controlled `TextInput`s, and system sheets such as "Save Password?" show up in the snapshot as an `[Overlay]` you can dismiss. Adds a React Native sample app and an e2e run against it (`test/e2e.sh --fixture RNSampleApp`).
