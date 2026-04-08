# @fullstorydev/subtext-cli

CLI and SDK for Subtext -- drive a hosted browser, capture screenshots, verify UI changes, and interact with web apps from the command line.

## Installation

```bash
npm install @fullstorydev/subtext-cli
```

Or install globally:

```bash
npm install -g @fullstorydev/subtext-cli
```

## Quick Start

```bash
export SUBTEXT_API_KEY="your-api-key"
subtext connect http://localhost:3000          # opens hosted browser (auto-tunnels localhost)
subtext snapshot <connection_id>               # screenshot + component tree
subtext screenshot <connection_id> -o shot.png # save screenshot to file
subtext disconnect <connection_id>             # close session
```

## Commands

### Connection

#### `connect <url>`

Open a hosted browser and navigate to the given URL. Localhost URLs are automatically tunneled so the hosted browser can reach your local dev server. A `.sightmap/` directory (if present) is auto-uploaded on connect.

```bash
subtext connect http://localhost:3000
subtext connect https://my-app.netlify.app
subtext connect http://localhost:8081 --no-tunnel   # skip auto-tunnel
subtext connect http://localhost:3000 --no-hooks    # skip sightmap upload
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--hooks` / `--no-hooks` | `true` | Run post-connect hooks (sightmap upload) |
| `--no-tunnel` | `false` | Disable auto-tunnel for localhost URLs |

Returns `connection_id`, `viewer_url`, and `session_id`.

#### `disconnect <connection_id>`

Close the browser session and release resources.

```bash
subtext disconnect conn_abc123
```

#### `navigate <connection_id> <url>`

Navigate the current tab to a new URL.

```bash
subtext navigate conn_abc123 https://example.com/page2
```

### Inspection

#### `snapshot <connection_id> [view_id]`

Capture a screenshot and the component tree. The component tree shows UIDs you can use with interaction commands.

```bash
subtext snapshot conn_abc123
subtext snapshot conn_abc123 view_456
```

#### `screenshot <connection_id> [view_id]`

Capture a screenshot only (no component tree).

```bash
subtext screenshot conn_abc123
subtext screenshot conn_abc123 -o before.png
subtext screenshot conn_abc123 view_456 -o mobile.png
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-o`, `--output <path>` | Save screenshot to this file path |

#### `logs <connection_id> [level] [limit]`

Retrieve console messages from the browser.

```bash
subtext logs conn_abc123
subtext logs conn_abc123 error
subtext logs conn_abc123 error 50
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `level` | Filter by log level: `error`, `warn`, `info`, `log` |
| `limit` | Max number of entries to return |

#### `network <connection_id> [pattern] [limit]`

Retrieve network requests from the browser.

```bash
subtext network conn_abc123
subtext network conn_abc123 "api/"
subtext network conn_abc123 "graphql" 20
```

#### `eval <connection_id> <expression>`

Execute JavaScript in the page context and return the result.

```bash
subtext eval conn_abc123 "document.title"
subtext eval conn_abc123 "window.innerWidth"
```

#### `tabs <connection_id>`

List all open tabs in the browser session.

```bash
subtext tabs conn_abc123
```

### Interaction

#### `click <connection_id> <component_id>`

Click a component by its UID (from `snapshot` output).

```bash
subtext click conn_abc123 btn_submit
```

#### `fill <connection_id> <component_id> <value>`

Type a value into an input field.

```bash
subtext fill conn_abc123 input_email "user@example.com"
```

#### `fill-multi <connection_id> <json>`

Fill multiple fields at once. Pass a JSON array of `{ component_id, value }` objects.

```bash
subtext fill-multi conn_abc123 '[{"component_id":"input_email","value":"a@b.com"},{"component_id":"input_pass","value":"secret"}]'
```

#### `hover <connection_id> <component_id>`

Hover over a component.

```bash
subtext hover conn_abc123 menu_item_3
```

#### `keypress <connection_id> <key> [component_id]`

Press a key, optionally targeting a specific component.

```bash
subtext keypress conn_abc123 Enter
subtext keypress conn_abc123 Tab input_name
```

#### `drag <connection_id> <component_id> <dx> <dy>`

Drag a component by the given pixel offset.

```bash
subtext drag conn_abc123 card_1 200 0
```

#### `wait <connection_id> <type> <value>`

Wait for a condition before continuing.

```bash
subtext wait conn_abc123 selector ".loading-done"
subtext wait conn_abc123 text "Welcome back"
```

### Screenshots & Artifacts

#### Saving screenshots locally

Use `--output` / `-o` with the `screenshot` command:

```bash
subtext screenshot conn_abc123 -o evidence/before.png
```

Or set the `SUBTEXT_SCREENSHOT_DIR` environment variable to auto-save all screenshot output:

```bash
export SUBTEXT_SCREENSHOT_DIR=./evidence
subtext snapshot conn_abc123    # screenshots saved to ./evidence/screenshot_<timestamp>.png
```

#### Signed URLs

Upload a screenshot for a signed URL using the `raw` command:

```bash
subtext raw live-view-screenshot '{"connection_id":"conn_abc123","upload":true}'
```

Signed URLs include `?Expires=...&Signature=...` query parameters. **Always use the full URL** -- the base path without the signature returns 403.

To refresh an expired signed URL (168-hour TTL):

```bash
subtext raw artifact-url '{"artifact_id":"<id>","ext":".png"}'
```

### Viewport & Device

#### `resize <connection_id> <width> <height>`

Resize the browser viewport.

```bash
subtext resize conn_abc123 1440 900    # desktop
subtext resize conn_abc123 768 1024    # tablet
subtext resize conn_abc123 375 812     # mobile
```

#### `emulate <connection_id> <device>`

Emulate a device profile.

```bash
subtext emulate conn_abc123 "iPhone 14"
```

### Tabs

#### `new-tab <connection_id> [url]`

Open a new browser tab, optionally navigating to a URL.

```bash
subtext new-tab conn_abc123
subtext new-tab conn_abc123 https://example.com
```

#### `close-tab <connection_id> <view_id>`

Close a specific tab.

```bash
subtext close-tab conn_abc123 view_789
```

### Sightmap

#### `sightmap show`

Display a summary of the local `.sightmap/` directory -- component count, names, and selectors.

```bash
subtext sightmap show
```

#### `sightmap upload <url>`

Upload the local `.sightmap/` to the given upload URL (returned during `connect`).

```bash
subtext sightmap upload https://api.fullstory.com/sightmap/upload?token=...
```

### Advanced

#### `tools`

List all available MCP tools on the server.

```bash
subtext tools
```

#### `raw <tool_name> <json>`

Call any MCP tool directly by name with a JSON argument object.

```bash
subtext raw comment-add '{"session_id":"sess_123","intent":"looks-good","body":"VERIFIED: Login works"}'
subtext raw live-view-screenshot '{"connection_id":"conn_abc123","upload":true}'
```

#### `tunnel <relayUrl>`

Start a tunnel proxy manually (normally handled automatically by `connect`).

```bash
subtext tunnel wss://relay.example.com/ws --target http://localhost:8080
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `-t`, `--target` | `http://localhost:3000` | Local target URL to proxy to |

#### `get-skill`

Print the embedded agent skill document to stdout. Useful for bootstrapping agents with Subtext knowledge.

```bash
subtext get-skill > /tmp/subtext-skill.md
subtext get-skill --json   # wrap in { "skill": "..." } JSON
```

## Visual Verification Workflow

This is the core workflow for using Subtext as a development and verification environment. Connect **before** writing code -- develop with hot reload while Subtext watches.

### 1. Start dev server

```bash
npx expo start --web    # or your framework's dev command
```

### 2. Connect

```bash
subtext connect http://localhost:8081
```

Auto-tunnels localhost, auto-uploads `.sightmap/`. Returns `connection_id`, `viewer_url`, `session_id`.

### 3. Share viewer_url

Paste the `viewer_url` so reviewers can watch in real-time.

### 4. Read prior session comments

```bash
subtext raw comment-list '{"session_id":"<session_id>"}'
```

Check for unresolved `ISSUE` comments from previous sessions.

### 5. Before screenshot

Capture the current state **before** making code changes:

```bash
subtext screenshot <conn_id> -o evidence/before.png
subtext raw live-view-screenshot '{"connection_id":"<conn_id>","upload":true}'
```

### 6. Develop with hot reload

Make code changes. The hosted browser updates in real-time.

### 7. Test interactively

```bash
subtext snapshot <conn_id>                          # find component UIDs
subtext click <conn_id> <uid>                       # interact
subtext fill <conn_id> <uid> "test value"           # fill inputs
subtext navigate <conn_id> /other-page              # navigate
```

### 8. Check console and network for errors

```bash
subtext logs <conn_id> error
subtext network <conn_id>
```

### 9. Leave structured comments

Use the four comment types described below in [Comment Templates](#comment-templates).

### 10. After screenshot

```bash
subtext screenshot <conn_id> -o evidence/after.png
subtext raw live-view-screenshot '{"connection_id":"<conn_id>","upload":true}'
```

### 11. Create PR with evidence

Include signed URLs and the viewer link in the PR body:

```markdown
## Visual Evidence

**Before:** ![before](SIGNED_URL_BEFORE)
**After:** ![after](SIGNED_URL_AFTER)
**Live Viewer:** [Watch session](VIEWER_URL)
```

### 12. Disconnect

```bash
subtext disconnect <conn_id>
```

## Comment Templates

Leave structured comments during testing using `subtext raw comment-add`. There are four types:

### SIGHTMAP UPDATE (intent: `tweak`)

When you discover a better selector or renamed component:

```bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"tweak","body":"SIGHTMAP UPDATE: ArcDetailPage view -- selector .arc-header should be [data-testid=arc-header] for stability.\nFile: .sightmap/views.yaml\nSuggested change:\n  - name: ArcHeader\n    selector: [data-testid=arc-header]"}'
```

### ISSUE (intent: `bug`)

When you find a bug or regression. Include `screenshot_url` (from `live-view-screenshot` with `upload:true`):

```bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"bug","screenshot_url":"<signed_url>","body":"ISSUE [p1]: Avatar upload button not responding on mobile viewport (375px).\nSteps: 1. Navigate to /profile 2. Tap avatar 3. Nothing happens\nExpected: File picker opens"}'
```

### VERIFIED (intent: `looks-good`)

When you confirm an acceptance criterion works. Include `screenshot_url` as evidence:

```bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"looks-good","screenshot_url":"<signed_url>","body":"VERIFIED: Arc detail page renders correctly -- confirmed after 5 back/forward navigations. Zero console errors."}'
```

Leave one `VERIFIED` comment per acceptance criterion tested.

### SESSION SUMMARY (intent: `looks-good`)

Leave at disconnect -- the handoff note for the next agent or reviewer:

```bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"looks-good","body":"SESSION SUMMARY:\nTested: Arc detail page rendering, branch realtime updates\nPassed: 3/3 acceptance criteria\nFailed: 0\nSightmap updates: 1\nNext steps: None -- ready for PR"}'
```

## Sightmap Reference

A sightmap teaches Subtext semantic names for your UI components. Place YAML files in a `.sightmap/` directory at your project root. On `connect`, the CLI auto-discovers and uploads the sightmap.

### YAML Schema (version 1)

```yaml
version: 1

memory:
  - "Global note: this app uses Tailwind CSS"
  - "The sidebar collapses on mobile viewports"

components:
  - name: NavBar                    # semantic name (required)
    selector: "nav.main-nav"        # CSS selector (required) -- can be string or string[]
    source: src/NavBar.tsx           # source file (optional)
    description: "Main navigation"  # description (optional)
    memory:                         # component-specific notes (optional)
      - "Has 5 links on desktop, hamburger on mobile"
    children:                       # nested components (optional)
      - name: NavLink
        selector: "a.nav-link"
      - name: NavLogo
        selector: "img.logo"
        source: src/Logo.tsx

views:
  - name: checkout                  # view/page name
    route: "/checkout"              # URL route pattern
    source: src/Checkout.tsx        # view source file
    components:                     # view-scoped components
      - name: CheckoutForm
        selector: "form.checkout"
        source: src/Checkout.tsx
        children:
          - name: SubmitButton
            selector: "button.submit"
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | yes | Schema version, currently `1` |
| `memory` | `string[]` | no | Global notes for the agent |
| `components` | `SightmapComponent[]` | no | Top-level components |
| `views` | `SightmapView[]` | no | Page/view definitions |

**SightmapComponent:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Semantic name for the component |
| `selector` | `string \| string[]` | yes | CSS selector(s) to find the component |
| `source` | `string` | no | Source file path |
| `description` | `string` | no | Human-readable description |
| `memory` | `string[]` | no | Component-specific notes |
| `children` | `SightmapComponent[]` | no | Nested child components |

**SightmapView:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | no | View name |
| `route` | `string` | no | URL route pattern |
| `source` | `string` | no | View source file |
| `components` | `SightmapComponent[]` | no | Components scoped to this view |

### Auto-upload

When you run `subtext connect`, the CLI walks up from the current directory (max 5 levels) looking for a `.sightmap/` directory containing YAML files. If found, all components are flattened (children get compound selectors) and uploaded automatically. Disable with `--no-hooks`.

You can split your sightmap across multiple YAML files and subdirectories -- the CLI collects all `.yaml`/`.yml` files recursively.

### Complete example

```
.sightmap/
  navbar.yaml
  views.yaml
  cards.yml
```

**navbar.yaml:**

```yaml
version: 1

components:
  - name: NavBar
    selector: "nav.main-nav"
    source: src/NavBar.tsx
    children:
      - name: NavLink
        selector: "a.nav-link"
      - name: NavLogo
        selector: "img.logo"
        source: src/Logo.tsx
```

**views.yaml:**

```yaml
version: 1

components:
  - name: Footer
    selector: "footer.site-footer"
    source: src/Footer.tsx

views:
  - name: checkout
    route: "/checkout"
    components:
      - name: CheckoutForm
        selector: "form.checkout"
        source: src/Checkout.tsx
        children:
          - name: SubmitButton
            selector: "button.submit"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SECRET_SUBTEXT_API_KEY` | API key (preferred, auto-set by MCP hosts) |
| `SUBTEXT_API_KEY` | API key (fallback) |
| `SUBTEXT_API_URL` | Override the MCP endpoint (default: `https://api.fullstory.com/mcp/subtext`) |
| `SUBTEXT_SCREENSHOT_DIR` | Directory to auto-save screenshots from `snapshot` and `screenshot` commands |
| `SUBTEXT_NO_HOOKS` | Set to `1` to disable post-connect hooks (sightmap upload) |

## SDK Usage

The package exports `SubtextClient` for programmatic use:

```typescript
import { SubtextClient } from "@fullstorydev/subtext-cli";

const client = new SubtextClient({
  apiKey: process.env.SUBTEXT_API_KEY!,
});

// Connect to a URL
const connectResult = await client.connect("https://example.com");

// Take a snapshot (screenshot + component tree)
const snapshot = await client.snapshot("conn_abc123");

// Interact with components
await client.click("conn_abc123", "btn_submit");
await client.fill("conn_abc123", "input_email", "user@example.com");

// Check for errors
const logs = await client.logs("conn_abc123", "error");

// Disconnect
await client.disconnect("conn_abc123");
```

### Available SDK methods

| Method | Description |
|--------|-------------|
| `connect(url)` | Open browser and navigate |
| `disconnect(connectionId)` | Close session |
| `snapshot(connectionId, viewId?)` | Screenshot + component tree |
| `screenshot(connectionId, viewId?)` | Screenshot only |
| `navigate(connectionId, url)` | Navigate to URL |
| `newTab(connectionId, url?)` | Open new tab |
| `closeTab(connectionId, viewId)` | Close tab |
| `tabs(connectionId)` | List tabs |
| `emulate(connectionId, device)` | Device emulation |
| `resize(connectionId, width, height)` | Resize viewport |
| `click(connectionId, componentId)` | Click component |
| `fill(connectionId, componentId, value)` | Fill input |
| `hover(connectionId, componentId)` | Hover over component |
| `keypress(connectionId, key, componentId?)` | Press key |
| `drag(connectionId, componentId, dx, dy)` | Drag component |
| `waitFor(connectionId, type, value)` | Wait for condition |
| `eval(connectionId, expression)` | Execute JS in page |
| `logs(connectionId, level?, limit?)` | Console messages |
| `network(connectionId, pattern?, limit?)` | Network requests |
| `raw(tool, params)` | Call any MCP tool |

### Additional SDK exports

```typescript
import {
  callTool,
  findSightmapRoot,
  parseSightmapFile,
  flattenComponents,
  collectComponents,
  collectMemory,
  uploadSightmap,
  autoUploadSightmap,
  isLocalUrl,
  startTunnelProxy,
  createHooks,
  extractSightmapUploadUrl,
} from "@fullstorydev/subtext-cli";
```

## Security

The Subtext CLI can:

- **Execute arbitrary JavaScript** in the hosted browser via the `eval` command
- **Tunnel to localhost** -- the hosted browser can reach your local dev server through the auto-tunnel
- **Interact with pages** -- click, fill, drag, keypress on any element
- **Read console and network logs** from the browser session

Keep your API key secure. Do not commit it to source control -- use environment variables.
