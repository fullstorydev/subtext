# Subtext for AI Agent Visual Verification

Subtext gives AI agents eyes. Instead of guessing whether a UI change worked, agents connect to a cloud-hosted Chromium browser, take screenshots, read component trees, check console logs, leave comments, and capture session replays — all through a CLI that wraps FullStory's MCP server. The result: every PR ships with before/after evidence that humans and other agents can review.

This guide covers how to integrate Subtext into your agent workflows, what the CLI can do today, what's missing, and how to package and distribute it.

---

## How It Works

Subtext is a remote HTTP MCP server at `https://api.fullstory.com/mcp/subtext`. It manages cloud Chromium instances that agents control through ~40 tools: browser navigation, DOM interaction, screenshots, console logs, network requests, comments, session review, and privacy scanning.

The CLI at `tools/subtext-cli/` is a Node.js wrapper that translates shell commands into MCP JSON-RPC calls. An agent running in any sandbox can install and use it — no local browser required. Localhost apps are tunneled automatically through FullStory's relay infrastructure.

**The core loop:**

1. Agent starts a dev server (e.g., `npx expo start --web`)


2. Agent connects Subtext to the running app: `subtext connect http://localhost:8081`


3. Subtext returns a `connection_id` and a `viewer_url` (shareable FullStory session link)


4. Agent takes a BEFORE screenshot, makes code changes (hot reload), takes an AFTER screenshot


5. Agent leaves comments on areas that changed, captures evidence, disconnects


6. Screenshots and session link go into the PR body



Every connection creates a FullStory session with full replay. Humans reviewing the PR can watch exactly what the agent did, frame by frame.

---

## The Agent Inner Loop

The critical insight we learned building StoryArc: **Subtext Live is the development environment, not a post-deployment checkbox.** The agent should connect Subtext *before* writing code, develop with hot reload while Subtext watches, test interactively through the live browser, and only then create the PR.

### Correct sequence

| Step | What happens | Evidence produced |
| --- | --- | --- |
| 1. Start dev server | `npx expo start --web --port 8081` | — |
| 2. Connect Subtext | `subtext connect http://localhost:8081` | `viewer_url` shared in chat |
| 3. BEFORE screenshot | `subtext screenshot <conn> before.png` | Baseline state captured |
| 4. Develop with hot reload | Agent writes code; Subtext browser updates live | — |
| 5. Test interactively | `subtext click`, `subtext fill`, `subtext snapshot` | Agent exercises the feature |
| 6. Check console/network | `subtext logs <conn> error 30` | Errors caught before PR |
| 7. AFTER screenshot | `subtext screenshot <conn> after.png` | Working state captured |
| 8. Leave comments | `subtext raw comment-add '{...}'` | Context for reviewers |
| 9. Create PR | Screenshots + viewer link in PR body | Full evidence trail |
| 10. Disconnect | `subtext disconnect <conn>` | Session replay available |

### Incorrect sequence (what we had to fix)

An earlier version treated Subtext as post-deployment verification: create PR → deploy to Netlify preview → connect Subtext → take screenshots → update PR body. This meant agents were "verifying" code they'd already shipped without seeing it run. The deploy preview is CI — it's where *reviewers* verify, not where the *agent* develops.

---

## CLI Reference

### Installation

The CLI lives at `tools/subtext-cli/` in the StoryArc repo. It requires Node.js 18+ and an API key.

```bash
export SUBTEXT_API_KEY="your-key-here"
node tools/subtext-cli/cli/index.js <command> [args]
```

### Core Commands

```bash
# Connect to an app (auto-tunnels localhost)
subtext connect <url>
# Returns: connection_id, viewer_url, fs_session_url, component tree

# Take a screenshot + get component tree
subtext snapshot <connection_id>

# Take a screenshot only (no tree)
subtext screenshot <connection_id> [output_path]

# Navigate to a URL
subtext navigate <connection_id> <url>

# Click a component by UID (from snapshot tree)
subtext click <connection_id> <component_id>

# Fill an input field
# Single field:
subtext raw live-act-fill '{"connection_id":"<id>","component_id":"<uid>","value":"text"}'
# Multiple fields:
subtext raw live-act-fill '{"connection_id":"<id>","fields":[{"component_id":"<uid>","text":"val"}]}'

# Press a keyboard key
subtext raw live-act-keypress '{"connection_id":"<id>","key":"Enter"}'

# Get console errors
subtext logs <connection_id> error 30

# Get console warnings
subtext logs <connection_id> warn 30

# List network requests
subtext raw live-net-list '{"connection_id":"<id>"}'

# Evaluate JavaScript in page context
subtext raw live-eval-script '{"connection_id":"<id>","expression":"document.title"}'

# Disconnect (always do this when done)
subtext disconnect <connection_id>
```

### Screenshot Artifacts

Upload screenshots to get signed URLs for PR bodies:

```bash
# Upload via live screenshot
subtext raw live-view-screenshot '{"connection_id":"<id>","upload":true}'
# Returns: artifact_id, signed URL (expires in 168h)

# Refresh an expired URL
subtext raw artifact-url '{"artifact_id":"<id>","ext":".png"}'
```

**Always use the full signed URL** (including `?Expires=...&Signature=...`). The base GCS path returns 403.

### Comments

Leave comments on sessions to document findings, flag issues, or annotate changes:

```bash
# Add a comment
subtext raw comment-add '{"session_id":"<session_id>","body":"Fixed: avatar file input now exists in DOM","intent":"looks-good"}'

# Reply to a comment
subtext raw comment-reply '{"comment_id":"<id>","body":"Confirmed — tested on mobile viewport too"}'

# Resolve a comment
subtext raw comment-resolve '{"comment_id":"<id>"}'

# List comments
subtext raw comment-list '{"session_id":"<session_id>"}'
```

Comment intents: `looks-good`, `needs-work`, `question`, `fyi`.

### Session Review (Post-Hoc Analysis)

Review a previously recorded session without a live browser:

```bash
# Open a session for review
subtext raw review-open '{"session_url":"https://app.fullstory.com/ui/.../client-session/..."}'
# Returns: client_id, event summaries (pages, timestamps)

# View at a specific timestamp
subtext raw review-view '{"client_id":"<id>","page_index":0,"timestamp_ms":1234}'

# Diff between two timestamps (shows changed regions)
subtext raw review-diff '{"client_id":"<id>","page_index":0,"from_ts":1000,"to_ts":5000}'

# Close the review session
subtext raw review-close '{"client_id":"<id>"}'
```

### Privacy Scanning (optional)

Detect and mask PII before sessions ship to production:

```bash
# Scan for PII (dry run — proposes rules, doesn't persist)
subtext raw privacy-propose '{"session_id":"<id>"}'

# Create rules from proposals
subtext raw privacy-create '{"rules":[{"name":"mask-email","selector":"[data-testid=email]","block_type":"mask"}]}'

# Promote preview rules to production
subtext raw privacy-promote '{"rule_ids":["rule_123"]}'
```

---

## What's Missing: Comments as Agent Memory

The current recipe skill (`recipe-visual-evidence/SKILL.md`) covers the screenshot workflow but lacks a critical loop: **agents should leave comments during their session that serve as memory for the next agent or human reviewer.**

### The gap

When an agent hits an issue, discovers something unexpected, or updates the .sightmap to improve future runs, that knowledge currently dies with the session. The next agent starts from scratch. Comments should close this loop.

### Proposed additions to the recipe skill

**During development (Step 5-6):**

```bash
# When the agent discovers something that would help the next run:
subtext raw comment-add '{
  "session_id":"<session_id>",
  "body":"SIGHTMAP UPDATE: Login form uses React controlled inputs — live-act-fill works but live-act-keyboard does not exist. Use component_id as string, not number. Added to sightmap guide section.",
  "intent":"fyi"
}'

# When the agent hits a non-blocking issue:
subtext raw comment-add '{
  "session_id":"<session_id>",
  "body":"ISSUE: artifact-upload returns unspecified error with this API key. Workaround: use live-view-screenshot with upload:true instead. Filed for Subtext team.",
  "intent":"needs-work"
}'

# When the agent verifies a fix:
subtext raw comment-add '{
  "session_id":"<session_id>",
  "body":"VERIFIED: Arc detail page now renders correctly. Realtime channel crash fixed — defensive removeChannel() before creating new subscription.",
  "intent":"looks-good"
}'
```

**After development (Step 8, before PR):**

```bash
# Summary comment with findings for the reviewer
subtext raw comment-add '{
  "session_id":"<session_id>",
  "body":"SESSION SUMMARY:\n- Fixed: Realtime channel crash (blank screen on arc detail)\n- Root cause: supabase.channel() caching race on remount\n- Verified: 3 arc types navigated without error\n- Sightmap updated: added Realtime subscription notes\n- Known issue: artifact-upload CLI broken (used screenshot upload instead)",
  "intent":"looks-good"
}'
```

### Sightmap as comment memory

The sightmap is Subtext's record of the component tree — it learns which selectors map to which UI elements. When an agent updates the sightmap (by navigating new pages or discovering better selectors), it should leave a comment noting what changed:

```bash
subtext raw comment-add '{
  "session_id":"<session_id>",
  "body":"SIGHTMAP MEMORY: Verified all arc detail selectors (2026-04-08). Layout: back button + arc name + badge in header, then info card, status card, branches section, danger zone. Status buttons: Planning highlighted with black bg, others outline. Branch creation: + Branch → modal → fill name + git branch → submit → card appears.",
  "intent":"fyi"
}'
```

This way, the next agent (or human reviewing the session) can read the comment history to understand what was learned. The sightmap guide section in the snapshot data already contains these notes — comments make them durable and visible in the FullStory UI.

---

## NPM Distribution Options

The CLI at `tools/subtext-cli/` is ready to extract into a standalone npm package. Here are the distribution options, ordered by ease of setup:

### Option 1: `npm pack` (zero infrastructure)

Best for: Testing with a small number of users before going public.

```bash
cd tools/subtext-cli
npm pack
# Creates: fullstorydev-subtext-cli-1.0.0.tgz
```

Install anywhere:

```bash
npm install ./fullstorydev-subtext-cli-1.0.0.tgz
# or from a URL:
npm install https://your-server.com/fullstorydev-subtext-cli-1.0.0.tgz
```

Pros: No registry needed. Ship the tarball via Slack, email, or a private URL.
Cons: No version resolution. Manual distribution.

### Option 2: GitHub Packages (private registry)

Best for: Internal distribution within the FullStory org before public launch.

```json
// package.json
{
  "name": "@fullstorydev/subtext-cli",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com"
  }
}
```

```bash
npm login --registry=https://npm.pkg.github.com --scope=@fullstorydev
npm publish
```

Consumers add to `.npmrc`:

```
@fullstorydev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Pros: Version management, access control via GitHub org. Consumers install with normal `npm install @fullstorydev/subtext-cli`.
Cons: Requires GitHub token for consumers. Slightly more setup.

### Option 3: Public npm (`@fullstorydev/subtext-cli`)

Best for: General availability. When the API is stable and you want external adoption.

```bash
# One-time: create the @fullstorydev org on npm if it doesn't exist
npm org create fullstorydev

# Then publish normally:
npm publish --access public
```

Consumers install with:

```bash
npm install @fullstorydev/subtext-cli
# or globally:
npm install -g @fullstorydev/subtext-cli
```

Pros: Standard npm workflow. No special configuration for consumers.
Cons: Public — anyone can see and install it.

### Recommendation

Start with **Option 1** (`npm pack`) for immediate testing. Move to **Option 2** (GitHub Packages) when you want version management across the team. Go to **Option 3** (public npm) when the API surface is stable and you're ready for external users.

The package name `@fullstorydev/subtext-cli` is the right namespace for all three options — it matches the GitHub org and signals official FullStory ownership.

---

## Integration with Obvious Platform

For agents running in Obvious (like the StoryArc build), the CLI integrates through the repo sandbox:

- **computerId:** All CLI commands run via `computer-ops` with the repo sandbox ID


- **Secrets:** `SECRET_SUBTEXT_API_KEY` is available as a project secret


- **Screenshots:** Displayed in chat via `repo-sandbox-preview({ computerId, path })`


- **Session links:** Shared as `viewer_url` in thread messages and PR bodies



The `recipe-visual-evidence/SKILL.md` in the StoryArc repo codifies the full workflow for Obvious code-agents. For other platforms (Claude Code, GitHub Agentic Workflows), the same CLI works — only the screenshot display and chat integration differ.

---

## What's Next

Three things would make this substantially better:

1. **Comment-as-memory in the recipe skill.** Add explicit steps for agents to leave comments documenting discoveries, sightmap updates, and session summaries. The comments section above has the exact additions needed for `recipe-visual-evidence/SKILL.md`.


2. **Review tools in CI.** The `review-open` / `review-view` / `review-diff` tools can power automated session analysis in CI — a bot that reviews the agent's Subtext session and flags unexpected regressions. This doesn't exist yet but the API supports it.


3. `npm pack`** → GitHub Packages → public npm.** Extract the CLI, add proper `package.json` with bin entry, write a README, and publish to `@fullstorydev/subtext-cli`. Start with pack for testing, promote to public when stable.