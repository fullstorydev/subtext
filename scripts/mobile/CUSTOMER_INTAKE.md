# Mobile Debugging Intake

Use this template when asking what Subtext needs for a mobile replay debugging run.

## App Access

- App format: installed app, `.ipa`, `.app`, simulator build, or source repo.
- Bundle ID:
- FullStory org and environment:
- Is the app already instrumented with FullStory?
- If source/build is required, exact build and install commands:

## Device Target

- Device type: physical iOS device or simulator.
- Device name:
- UDID:
- iOS version:
- Signing or WebDriverAgent requirements:

## Auth Path

- Starting state: logged out, logged in, fresh install, or existing app state.
- Test account or login method:
- MFA, passkey, captcha, deep link, or manual step requirements:
- Any system prompts expected on first launch:

## Goal

- User task to perform:
- Screen or flow that should appear:
- Interactions required: taps, typing, scrolls, waits, gestures.
- Expected replay behavior:
- Things that should be considered failure:

## Session Discovery

Provide at least one way to identify the matching FullStory session:

- FullStory session URL from SDK logs.
- User ID and approximate run time.
- Session ID from logs.
- Trace ID.
- A user-provided replay URL.
- A deterministic test account that can be searched in FullStory.

## Evidence Output

The run should produce:

- Device snapshots/screenshots for the performed goal.
- FullStory session URL or equivalent session identifier.
- Subtext `review-open` evidence.
- Multiple `review-view` samples around the target flow.
- A final pass/warn/fail report against the rubric.
