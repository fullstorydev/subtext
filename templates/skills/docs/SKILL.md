---
name: docs
description: Proof document MCP tools for creating, updating, and closing agent work documentation. Use when tracking a bug fix, UX review, or changeset to produce a permanent, evidence-backed record.
metadata:
  targets: [mcp, cli]
  requires:
    skills: ["subtext:shared"]
---

# Docs

> **PREREQUISITE:** Read `subtext:shared` for {{if ne .Target "cli"}}MCP {{end}}conventions.

Tool catalog and judgment rules for agent-produced proof documents. {{if ne .Target "cli"}}Doc tools are available on the subtext MCP server.{{else}}Doc commands are available in the `subtext` CLI.{{end}}

The document tools are intentionally generic: the server does not know about bug-fix vs. ux-review vs. verification workflows. Pass your preferred structure via `doc-create(content: ...)`; this skill ships opinionated templates below.

{{if eq .Target "cli"}}## Commands{{else}}## MCP Tools{{end}}

| Tool | Description |
|------|-------------|
| {{tool "doc-create"}} | Open a new proof document with a title and optional seed markdown |
| {{tool "doc-update"}} | Edit the document: replace text, append content, or update metadata |
| {{tool "doc-attach"}} | Attach evidence (screenshot, replay, log, diff, report) into a named section |
| {{tool "doc-close"}} | Finalize the document, write a permanent snapshot, get a stable URL |
| {{tool "doc-read"}} | Read the current or a past version of a document |
| {{tool "doc-diff"}} | Diff two document versions |
| {{tool "doc-list"}} | List open or closed documents, optionally filtered by tag, ref, trace_id, or status |

## Lifecycle

```
doc-create → [doc-update / doc-attach]* → doc-close
```

- {{tool "doc-create"}} writes the title, auto-managed metadata line, and (if `content` is provided) your seed markdown. Without `content`, it creates a document with a single empty `## Evidence` section.
- {{tool "doc-update"}} and {{tool "doc-attach"}} fill evidence during work.
- {{tool "doc-close"}} writes an immutable version snapshot (`v1.md`, `v2.md`, …) and marks the doc `complete`, `partial`, or `abandoned`.
- Open docs auto-close as `abandoned` after 24h of inactivity.
- A closed doc can be reopened by calling {{tool "doc-update"}} on it. The metadata header will switch to `Latest closed: vN | Draft in progress` until the next {{tool "doc-close"}} bumps to `v{N+1}`.

## Seed templates

Pass one of these as `content` on {{tool "doc-create"}} to shape the document up front. Agents may edit headings and add sections freely afterwards via {{tool "doc-update"}}.

### bug-fix

```markdown
## Context
<!-- What broke, how it was observed, what the expected behavior was -->

## Root Cause
<!-- Why it broke -->

## Before
<!-- Evidence of the bug: screenshots, session replays, console errors -->

## Changes
<!-- Files modified, approach taken -->

## After
<!-- Evidence the fix works: screenshots, test output -->

## Test Results
<!-- Repro check, regression checks -->

## Session Replays
<!-- Viewer URLs -->
```

### ux-review

```markdown
## Context
<!-- What was reviewed and why -->

## Flow Summary
<!-- The user journey observed -->

## Friction Points
<!-- Where users stalled, backtracked, or failed -->

## Positive Patterns
<!-- What worked well -->

## Evidence
<!-- Auto-populated by doc-attach -->

## Session Replays
<!-- Viewer URLs -->
```

### verification

```markdown
## Context
<!-- What is being verified, against what claim or spec -->

## Before
<!-- Observed state before verification -->

## Changes
<!-- Diffs, commits, or other artifacts representing what was modified -->

## After
<!-- Observed state after -->

## Test Matrix
<!-- The cases that were exercised -->

## Evidence
<!-- Auto-populated by doc-attach -->
```

### changeset

```markdown
## Context
<!-- The batch of changes and why -->

## Changes
<!-- Files modified, approach, notable decisions -->

## Before / After
<!-- Visual or behavioral comparison -->

## Test Results
<!-- Confidence evidence -->

## Evidence
<!-- Auto-populated by doc-attach -->
```

## Attaching evidence

{{tool "doc-attach"}} has four source modes. Provide exactly one:

| Mode | Use when | Params |
|------|----------|--------|
| `base64_data` + `content_type` | Binary content (images, PDF) generated in-session | `label`, `section`, `render_as` |
| `text` + `content_type` | Plain-text content (markdown plans, logs, JSON). Avoids base64 inflation. | `label`, `section`, `render_as` |
| `artifact_id` | Referencing a file from a previous {{tool "artifact-upload"}} | `label`, `section`, `render_as`, optionally `artifact_ext` |
| `url` | External URL (session replay, viewer link, Grafana, Loom) | `label`, `section`, `render_as` |

Additional params:

- **`section`** — markdown heading to insert under. Defaults to `Evidence`. Creates the section at the bottom if absent.
- **`render_as`** — `image` inlines as `![label](url)`, `link` inserts `- [label](url)`. Defaults to `link`. Use `image` for screenshots.

GCS-backed attachments (`base64_data`, `text`, `artifact_id`) are stored as `gs://` URIs in the markdown and signed at render time, so closed documents stay readable indefinitely.

## When to create a document

Create a doc at the **start** of any significant workflow:

- Running the `proof` skill for a code change (create at Step 1, close at Step 7)
- Starting a multi-step changeset (PR review, deployment verification)
- Any time the user will want a permanent record of what the agent did and why

Pass the returned `doc_id` to any subagents so they can attach evidence to the same document.

## When to attach evidence

Attach at every capture point. Typical patterns:

- Screenshot of observed bug → `doc-attach(render_as: "image", section: "Before", label: "Observed bug", base64_data: ...)`
- Fix diff → `doc-attach(render_as: "link", section: "Changes", label: "Fix", text: "<git diff>", content_type: "text/plain")`
- Test output → `doc-attach(render_as: "link", section: "Test Results", label: "Test run", text: "<output>", content_type: "text/plain")`
- Session replay → `doc-attach(render_as: "link", section: "Session Replays", label: "Stale filter on reload", url: "<viewer_url>")`
- Validation screenshot → `doc-attach(render_as: "image", section: "After", label: "Filter persists", artifact_id: "<live-view-screenshot id>")`

## When to close

When work is done and evidence is captured, call `doc-close(status: "complete", summary: ...)`. If the work was incomplete, close as `partial` and explain in `summary`. If you never finished, `abandoned`.

There is no server-side score. Before closing, re-read the document ({{tool "doc-read"}}) and ask whether a human reviewer opening the URL cold would understand what changed, what was tested, and why. If not, attach what's missing.

## Rules

1. **Create at entry, not end.** A doc started after the work captures nothing useful.
2. **Seed structure up front.** Pass a `content` template on {{tool "doc-create"}}. Editing after-the-fact is harder than starting with the right shape.
3. **Pass `doc_id` to subagents.** Evidence from subagents belongs in the same document.
4. **Fill sections progressively.** Don't batch all {{tool "doc-update"}} calls at the end.
5. **Prefer `text` over `base64_data`** for textual evidence (markdown, logs, JSON). It avoids token inflation.
6. **Close with a useful summary.** The summary appears in {{tool "doc-list"}} and the permanent snapshot.
7. **Share the `doc_url`.** Give it to the user when closing so they have the permanent link.

## End-to-end transcript (bug fix)

```
User: Fix the session filter bug. Session: https://app.fullstory.com/ui/ABC/session/...

Agent:
1. doc-create(
     title: "Fix: session filter returns stale data",
     ref: "https://github.com/org/repo/issues/42",
     tags: ["session", "filter"],
     content: "<bug-fix template from this skill>"
   )
   → doc_id: "doc-abc123", doc_url: "https://..."

2. [session analysis subagent] review-open(session_url: ...) → observe filter resets
   doc-attach(
     doc_id: "doc-abc123", section: "Before", render_as: "link",
     url: <session_viewer_url>,
     label: "Session showing stale filter on page reload"
   )

3. [code exploration subagent] finds useSessionFilter.ts:47 — stale closure
   doc-update(
     doc_id: "doc-abc123",
     updates: [{old_str: "## Root Cause\n<!-- Why it broke -->",
                new_str: "## Root Cause\nStale closure in useSessionFilter.ts:47. The effect dep array omits `filterKey`, causing the filter to hold a reference to the initial empty state."}]
   )

4. [fix + test written]
   doc-attach(
     doc_id: "doc-abc123", section: "Changes", render_as: "link",
     text: <git diff output>, content_type: "text/plain",
     label: "Fix: add filterKey to dep array"
   )

5. [browser validation]
   doc-attach(
     doc_id: "doc-abc123", section: "After", render_as: "image",
     artifact_id: <live-view-screenshot id>,
     label: "Filter persists after reload"
   )

6. doc-close(doc_id: "doc-abc123", status: "complete",
             summary: "Fixed stale closure in session filter dep array. All tests pass. Browser confirms fix.")
   → doc_url: "https://..." (permanent)

User receives: "Fix complete. Proof document: https://..."
```

## Gotchas

- Forgetting to {{tool "doc-create"}} at entry — you'll have no document to attach evidence to
- Seeding without `content` and then painting structure with {{tool "doc-update"}} — slower and more error-prone than seeding up front
- Using `base64_data` for text — use `text` instead to avoid ~33% inflation and wasted tokens
- Not sharing the `doc_url` — the user can't find the proof document without it

## See Also

- `subtext:shared` — MCP conventions
- `subtext:comments` — inline session annotations (separate from proof docs)
- `proof` — workflow skill that integrates doc evidence capture with visual verification
