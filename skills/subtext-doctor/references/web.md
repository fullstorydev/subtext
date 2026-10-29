# Web

Field-tested on a Next.js 16 App Router + MUI app (October 2026) with three sessions:
- a real-input browser on production: 11 of 12 clicks resolved;
- Subtext Verify on production: 0 of 10 clicks recorded;
- Subtext Verify on localhost through the tunnel: no localhost page recorded.

Not yet tested: shadow DOM, consent banners, a deploy during a session, and frameworks other than React.

## Detect

- `@fullstory/browser` or `@fullstory/snippet` in `package.json`, or the inline snippet (`_fs_script`, `_fs_org`) in an HTML entry point. The `setup-snippet` skill lists what does and doesn't count as an installed snippet.
- Find where `init()` runs and when. A client component's `useEffect` starts capture after hydration; a `<head>` snippet starts before.
- Find `setIdentity` / `identify`. Check both it and `init()` for an environment gate (`NODE_ENV`, a dev flag); if identity has its own gate, local sessions can't be found by email.
- In a repo with a native app too, the web corpus is usually the top of `.sightmap/`, with the native corpus in a subdirectory such as `.sightmap/mobile/`. One `sightmap export` includes both.

## Sessions

- **What marks a session as this platform:** section headers like `# tab A · https://host/path`, `page-load · TTFB … LCP …` lines, and aggregated `network · host · N requests` lines. App custom events don't tell platforms apart; an app may send the same `Visual Context Update` event on web and mobile.
- **Route changes** are `(navigated)` sections, named `[ViewName]` once the corpus is uploaded. Hash changes count.
- **Build switch:** a deploy reaches the tester only on a full load, which adds a `page-load` line and a page to the map. On Vercel, compare the `?dpl=` value on asset requests either side of it. Judge interactions after the load that brought the build under test.
- **Upload lag:** about 40–60 seconds. Poll after 1 minute, then every 2.
- **Finding it:** `review-list-sessions` by `email_address` works once the app identifies the user. The session may start before the flow, at the login page. The `client-session/…` URL from `FS.getCurrentSessionURL()` also works as `session_url`.
- **Log:** the browser console and network panel, filtered to `fullstory`. Expect 200 or 202 on `rec/page` and 200 on `rec/bundle/v2`. Some embedded browsers don't log third-party requests; `performance.getEntriesByType('resource')` lists them.

### With the live tools (Subtext Verify)

`live-connect <deployed URL>` records a session through Verify's own injected snippet, loaded before the document; the app's own snippet then logs "already been defined". Use the returned `trace_id` for `review-summary` and `review-open`.

- **`live-act-click` clicks aren't recorded.** The page changes they cause are. Use a Verify session to check capture, view naming and network, and `live-view-inspect` to see which attributes exist on the deployed page. Measure click resolution only on a session with real input: a person, or a browser that sends real mouse events.
- **`capture_status: active` doesn't prove pages arrive.** Confirm with a summary that shows them.
- Upload the corpus to each connection's own `sightmap_upload_url` before reading live names.
- Element ids change after every re-render in dev. Take a fresh snapshot before each click; a stale id fails with "not found or not scrollable".

**Localhost** is unverified: in the field test, no localhost page reached Fullstory even once it loaded.
- The hosted browser refuses `localhost` and `127.0.0.1`. Browse `http://app.localhost:PORT` with `allowedOrigins: ["localhost:PORT"]`.
- The tunnel resolves hosts with real DNS, so `*.test` fails without a hosts entry.
- Check the app doesn't redirect unknown hosts to its deployed domain; multi-tenant proxies often do.

### Without the live tools

A person records on the deployed site. Ask for the start time, the last-click time, the click count, and what the console and network panel showed: Fullstory requests loaded or blocked, ad blocker on or off. For the development-only attribute check, read the framework source instead of inspecting the deployed page.

## Static pass

Point `corpus_dir` at the corpus and `app_dirs` at the web source, then run this. It skips the native corpus directory, compares `data-testid` selectors with source, and ends with selectors on attributes or classes that only exist in some builds.

```bash
corpus_dir=.sightmap
app_dirs=(app)
scratch=$(mktemp -d)
corpus_grep() { grep -rhoE --include='*.yaml' --include='*.yml' --exclude-dir=mobile "$1" "$corpus_dir"; }
corpus_grep '\[data-testid="[^"]+"\]' | sed -E 's/.*="([^"]+)"\]/\1/' | grep -vxE '\.+|…' | sort -u > "$scratch/exact"
corpus_grep '\[data-testid[$^*]="[^"]+"\]' | sed -E 's/\[data-testid(.)="([^"]+)"\]/\1 \2/' | sort -u > "$scratch/partial"
git grep -hoE "data-testid(=\{?|[\"']?: *)[\"'][^\"']+[\"']" -- "${app_dirs[@]}" ':!*.test.*' ':!*.spec.*' ':!*.md' \
  | sed -E "s/.*[\"']([^\"']+)[\"']$/\1/" | sort -u > "$scratch/source"
git grep -hoE 'data-testid(=\{|["'"'"']?: *)`[^`$]*' -- "${app_dirs[@]}" ':!*.test.*' ':!*.spec.*' ':!*.md' \
  | sed -E 's/.*`//' | sort -u > "$scratch/template"
cat "$scratch/source" "$scratch/template" > "$scratch/all"
matches() { awk -v op="$1" -v v="$2" '(op=="^" && index($0,v)==1) || (op=="$" && substr($0,length($0)-length(v)+1)==v) || (op=="*" && index($0,v)) {f=1} END {exit !f}'; }
echo "# exact selectors with no literal data-testid:"
comm -23 "$scratch/exact" "$scratch/source"
echo "# partial selectors (^= \$= *=) no data-testid could match:"
while read -r op v; do matches "$op" "$v" < "$scratch/all" || echo "$op= $v"; done < "$scratch/partial"
echo "# literal data-testids no selector covers:"
comm -13 "$scratch/exact" "$scratch/source" | while read -r t; do
  covered=
  while read -r op v; do printf '%s\n' "$t" | matches "$op" "$v" && covered=1; done < "$scratch/partial"
  [ -n "$covered" ] || echo "$t"
done
echo "# selectors on development-only attributes or hashed classes:"
grep -rnE --include='*.yaml' --include='*.yml' --exclude-dir=mobile 'data-mui-internal-clone-element|data-reactroot|data-v-[0-9a-f]{8}|\.(css|mui)-[a-z]*[0-9][a-z0-9]*' "$corpus_dir"
```

Before deleting a selector that shows as dead, check it against `$scratch/template` (built from a template literal) and against props that default a test id (`testId = 'x'` forwarded to `data-testid`); the script misses both. Run the same comparison for `aria-label` selectors against source text.

## Selectors

Corpus selectors are CSS. Prefer `data-testid`, `aria-label`, `href`, ids and roles. A framework's own global classes (`.MuiButton-root`) are stable across builds; hashed CSS-in-JS classes (`css-1x2y3z`, `mui-1no0cgg`) change between builds, so never select on them. Keep view selectors page-specific: every view's components apply on every page during click attribution.

**Check production attributes.** A selector can match on localhost and never in production. MUI's Tooltip, for example, adds `data-mui-internal-clone-element` only when `NODE_ENV !== 'production'`. Confirm with `live-view-inspect` on the deployed page, or in the framework source.

**Reading the last bracket on web:**
- Skip trailing `[key="value"]` brackets with no component name; they're properties.
- A generic fallback after a specific name (`[BackToScheduleLink] [Button]`) counts as the specific name.
- Clicks on text or icons inside a control resolve to the nearest named component (`[Tab]`, `[ParticipantLink]`, an SVG `path` to `[SortButton]`). A named text child wins (`[GolferName]` inside `[PickedGolfer]`).

## Capture traps to flag

- `init()` or identity gated on `NODE_ENV`: local sessions missing or anonymous.
- `init()` in a client effect: nothing recorded before hydration.
- Selectors on development-only attributes or hashed classes (the static pass's last section).
- A proxy or middleware that redirects unknown hosts: tunnel sessions end up on the deployed site.
- `fs-exclude` on a container, a content security policy without Fullstory's hosts, and cross-origin iframes (they need `recordCrossDomainIFrames` plus the snippet inside the frame).

## Expected noise

- `click div` on an invisible popover or menu backdrop, from clicking outside to close. Name it rather than leaving it out.
- Raw names such as `path`, `div` and `svg` in `review-open`'s map appear for resolved clicks too.
- In Verify sessions: "The FullStory snippet has already been defined elsewhere" on every full load, and in dev, a React hydration-mismatch error per page from injected `data-lidar-id` attributes.
- Dev-only widgets (realtime monitors, analytics debug logs) on localhost.
- Live trees keep stale text nodes from the previous page after a client-side navigation.

## Fix table

Rows marked *open* weren't confirmed fixed in the field test.

| Symptom | Cause | Fix | Gap belongs to |
|---|---|---|---|
| Session shows every page but no clicks | Clicks came from Verify's `live-act-click` | Record clicks with real input; use Verify sessions only for capture and views | Subtext Verify |
| Selector names the control on localhost, never in production | Attribute rendered only in development builds (MUI Tooltip's `data-mui-internal-clone-element`) | *Open.* Select on `aria-label`, or add a `data-testid` | Corpus |
| `click div` after a menu opens | Invisible popover backdrop; the menu entry selects only the paper (`.MuiPopover-paper`) | *Open.* Add a backdrop entry, e.g. `.MuiPopover-root > .MuiBackdrop-root` | Corpus |
| Click ends in a bare `[key="value"]` | A component from another view matches inside the control, and only its property shows | *Open.* Scope the other view's selector so it doesn't match inside the control | Corpus; Subtext should name the component |
| Local session can't be found by email | Identity call gated on `NODE_ENV` | *Open.* Gate it with the same flag as `init()` | App |
| Hosted browser refuses localhost | Verify blocks internal addresses | Browse `http://app.localhost:PORT` with `allowedOrigins: ["localhost:PORT"]` | Subtext Verify docs |
| Tunnel lands on the deployed site | App proxy redirects unknown hosts to its root domain | Point the app's root-domain setting at the tunnel host for the run | App |
| Localhost pages never reach the session, while `capture_status` says `active` | Unknown | *Open.* Report it | Subtext Verify / Fullstory |
