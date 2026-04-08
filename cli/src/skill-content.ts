export const SKILL_CONTENT = `# Subtext CLI — Agent Skill

## TLDR
Subtext CLI drives a hosted browser for visual verification. Use it to connect to your app, take before/after screenshots, interact with elements, check for errors, and leave structured comments.

**Bootstrap:** \`subtext get-skill > /tmp/subtext-skill.md\`

**Canonical workflow:**
\`\`\`
subtext connect http://localhost:8081    # auto-tunnels, auto-uploads sightmap
subtext snapshot <conn>                  # find component UIDs
subtext click <conn> <uid>              # interact
subtext screenshot <conn> -o before.png # evidence
subtext logs <conn> error               # verify no errors
subtext disconnect <conn>               # cleanup
\`\`\`

---

## Visual Verification Workflow

Connect BEFORE writing code. Develop with hot reload while Subtext watches.

### 1. Start dev server
\`\`\`bash
npx expo start --web    # or your framework's dev command
\`\`\`

### 2. Connect (auto-tunnels localhost, auto-uploads sightmap)
\`\`\`bash
export SUBTEXT_API_KEY="your-api-key"
subtext connect http://localhost:8081
\`\`\`
Returns: \`connection_id\`, \`viewer_url\`, \`session_id\`.

### 3. Share viewer_url
Paste \`viewer_url\` in chat so reviewers can watch in real-time.

### 4. Read prior session comments
\`\`\`bash
subtext raw comment-list '{"session_id":"<session_id>"}'
\`\`\`
Check for unresolved ISSUE comments. Reply to acknowledge before starting work.

### 5. Before screenshot (capture current state BEFORE code changes)
\`\`\`bash
subtext screenshot <conn_id> -o evidence/before.png
subtext raw live-view-screenshot '{"connection_id":"<conn_id>","upload":true}'
\`\`\`
Save the full signed URL (with \`?Expires=...&Signature=...\`).

### 6. Develop with hot reload
Make code changes. The hosted browser updates in real-time.

### 7. Test interactively
\`\`\`bash
subtext snapshot <conn_id>                          # find component UIDs
subtext click <conn_id> <uid>                       # click elements
subtext fill <conn_id> <uid> "test value"           # fill inputs
subtext navigate <conn_id> /other-page              # navigate
\`\`\`

### 8. Check console and network for errors
\`\`\`bash
subtext logs <conn_id> error
subtext network <conn_id>
\`\`\`
Fix any errors before proceeding.

### 9. Leave structured comments (see Comment Templates below)

### 10. After screenshot
\`\`\`bash
subtext screenshot <conn_id> -o evidence/after.png
subtext raw live-view-screenshot '{"connection_id":"<conn_id>","upload":true}'
\`\`\`

### 11. Create PR with evidence
\`\`\`markdown
## Visual Evidence
**Before:** ![before](SIGNED_URL_BEFORE)
**After:** ![after](SIGNED_URL_AFTER)
**Live Viewer:** [Watch session](VIEWER_URL)
\`\`\`

### 12. Disconnect
\`\`\`bash
subtext disconnect <conn_id>
\`\`\`

---

## Command Reference

### Connection
| Command | Description |
|---------|-------------|
| \`subtext connect <url>\` | Open browser, navigate (auto-tunnels localhost, auto-uploads sightmap) |
| \`subtext connect <url> --no-tunnel\` | Connect without auto-tunnel |
| \`subtext connect <url> --no-hooks\` | Connect without sightmap upload |
| \`subtext disconnect <connection_id>\` | Close browser session |
| \`subtext navigate <connection_id> <url>\` | Navigate to URL |

### Inspection
| Command | Description |
|---------|-------------|
| \`subtext snapshot <conn> [view_id]\` | Screenshot + component tree (UIDs for interaction) |
| \`subtext screenshot <conn> [view_id] [-o path]\` | Screenshot only, optionally save to file |
| \`subtext logs <conn> [level] [limit]\` | Console messages (levels: error, warn, info, log) |
| \`subtext network <conn> [pattern] [limit]\` | Network requests, optionally filtered |
| \`subtext eval <conn> <expression>\` | Execute JS in page context |
| \`subtext tabs <conn>\` | List open tabs |

### Interaction
| Command | Description |
|---------|-------------|
| \`subtext click <conn> <component_id>\` | Click a component by UID |
| \`subtext fill <conn> <component_id> <value>\` | Fill an input field |
| \`subtext fill-multi <conn> <json>\` | Fill multiple fields (JSON array) |
| \`subtext hover <conn> <component_id>\` | Hover over a component |
| \`subtext keypress <conn> <key> [component_id]\` | Press a key |
| \`subtext drag <conn> <component_id> <dx> <dy>\` | Drag component by pixel offset |
| \`subtext wait <conn> <type> <value>\` | Wait for condition (selector, text) |

### Viewport & Device
| Command | Description |
|---------|-------------|
| \`subtext resize <conn> <width> <height>\` | Resize viewport |
| \`subtext emulate <conn> <device>\` | Device emulation |
| \`subtext new-tab <conn> [url]\` | Open new tab |
| \`subtext close-tab <conn> <view_id>\` | Close tab |

### Responsive testing presets
\`\`\`bash
subtext resize <conn> 1440 900    # desktop
subtext resize <conn> 768 1024    # tablet
subtext resize <conn> 375 812     # mobile
\`\`\`

### Sightmap
| Command | Description |
|---------|-------------|
| \`subtext sightmap show\` | Show local sightmap summary |
| \`subtext sightmap upload <url>\` | Upload sightmap to URL |

### Advanced
| Command | Description |
|---------|-------------|
| \`subtext tools\` | List available MCP tools |
| \`subtext raw <tool_name> <json>\` | Call any MCP tool directly |
| \`subtext tunnel <relayUrl> [-t target]\` | Manual tunnel proxy |
| \`subtext get-skill\` | Print this skill document |
| \`subtext get-skill --json\` | Print skill wrapped in JSON |

---

## Sightmap

A sightmap teaches Subtext semantic names for your UI components. Place YAML files in \`.sightmap/\` at your project root.

### YAML Schema (version 1)
\`\`\`yaml
version: 1

memory:
  - "Global note about the app"

components:
  - name: NavBar                    # semantic name (required)
    selector: "nav.main-nav"        # CSS selector (required, string or string[])
    source: src/NavBar.tsx           # source file (optional)
    description: "Main navigation"  # description (optional)
    memory:                         # component notes (optional)
      - "Has 5 links on desktop, hamburger on mobile"
    children:                       # nested components (optional)
      - name: NavLink
        selector: "a.nav-link"

views:
  - name: checkout
    route: "/checkout"
    source: src/Checkout.tsx
    components:
      - name: CheckoutForm
        selector: "form.checkout"
        children:
          - name: SubmitButton
            selector: "button.submit"
\`\`\`

Auto-upload: On \`connect\`, the CLI walks up from cwd (max 5 levels) looking for \`.sightmap/\` with YAML files. All components are flattened and uploaded. Disable with \`--no-hooks\`.

---

## Comment Templates

### SIGHTMAP UPDATE (intent: tweak)
When you discover a better selector or renamed component:
\`\`\`bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"tweak","body":"SIGHTMAP UPDATE: ArcDetailPage view -- selector .arc-header should be [data-testid=arc-header] for stability.\\nFile: .sightmap/views.yaml\\nSuggested change:\\n  - name: ArcHeader\\n    selector: [data-testid=arc-header]"}'
\`\`\`

### ISSUE (intent: bug)
When you find a bug. Include screenshot_url from \`live-view-screenshot\` with \`upload:true\`:
\`\`\`bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"bug","screenshot_url":"<signed_url>","body":"ISSUE [p1]: Avatar upload button not responding on mobile viewport (375px).\\nSteps: 1. Navigate to /profile 2. Tap avatar 3. Nothing happens\\nExpected: File picker opens"}'
\`\`\`

### VERIFIED (intent: looks-good)
When you confirm an acceptance criterion works. Include screenshot_url:
\`\`\`bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"looks-good","screenshot_url":"<signed_url>","body":"VERIFIED: Arc detail page renders correctly -- confirmed after 5 back/forward navigations. Zero console errors."}'
\`\`\`
Leave one VERIFIED comment per acceptance criterion tested.

### SESSION SUMMARY (intent: looks-good)
Leave at disconnect -- handoff note for the next agent or reviewer:
\`\`\`bash
subtext raw comment-add '{"session_id":"<session_id>","intent":"looks-good","body":"SESSION SUMMARY:\\nTested: Arc detail page rendering, branch realtime updates\\nPassed: 3/3 acceptance criteria\\nFailed: 0\\nSightmap updates: 1\\nNext steps: None -- ready for PR"}'
\`\`\`

---

## Key Rules

- Connect BEFORE writing code -- Subtext Live is the development environment
- ALWAYS \`comment-list\` on session start -- never assume you know what feedback exists
- ALWAYS use full signed URLs (with \`?Expires=...&Signature=...\`) -- base path returns 403
- Refresh expired URLs: \`subtext raw artifact-url '{"artifact_id":"<id>","ext":".png"}'\` (168h TTL)
- Leave at least one VERIFIED or ISSUE comment per acceptance criterion tested
- End every session with SESSION SUMMARY before disconnecting
- Never say "looks good" without screenshot evidence
- Responsive changes: capture at desktop (1440x900), tablet (768x1024), and mobile (375x812)

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`SECRET_SUBTEXT_API_KEY\` | API key (preferred) |
| \`SUBTEXT_API_KEY\` | API key (fallback) |
| \`SUBTEXT_API_URL\` | Override MCP endpoint |
| \`SUBTEXT_SCREENSHOT_DIR\` | Auto-save directory for screenshots |
| \`SUBTEXT_NO_HOOKS\` | Set to 1 to disable post-connect hooks |
`;
