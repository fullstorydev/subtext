# Web

**Unverified.** No field test of this loop has run against a web app yet. Follow the loop in `SKILL.md`, and record everything below that turns out different, or missing, under "Reference updates" in the report.

## Detect

- `@fullstory/browser` or `@fullstory/snippet` in `package.json`, or the inline snippet (`_fs_org`) in an HTML template.

## Sessions

- **What marks a session as this platform:** `review-summary` shows page navigations with URLs.
- **Build switch:** a deploy reaches a tester only on a full page reload; judge interactions after the reload that loaded the build under test.
- **Log:** the browser console and network panel. Check that requests to Fullstory aren't blocked by a content security policy or an ad blocker.
- **Recording without a person:** if the separate Subtext Verify plugin is installed, `subtext-live` can drive a hosted browser through the flows to produce the session. A real tester's session is still the better health check, since it uses the real network and browser.

## Selectors

Corpus selectors are CSS, so they can target `data-*` attributes, ids, classes or roles. For the static pass, adapt the script in [react-native.md](react-native.md): match the attribute the corpus actually uses (often `[data-testid="…"]`) and grep source for the same attribute.

## Fix table

None yet. Add rows from the first field test.
