---
name: subtext:docs
description: Proof document MCP tools for creating, updating, and closing agent work documentation. Use when tracking a bug fix, UX review, or changeset to produce a permanent, evidence-backed record.
metadata:
  requires:
    skills: ["subtext:shared"]
---

# Docs

> **PREREQUISITE:** Read `subtext:shared` for MCP conventions.

Tool catalog and judgment rules for agent-produced proof documents. Doc tools are available on the subtext MCP server.

## MCP Tools

| Tool | Description |
|------|-------------|
| `doc-create` | Open a new proof document with a title, kind, and optional ref/tags |
| `doc-update` | Edit the document: replace text, append content, or update metadata |
| `doc-attach` | Attach evidence (screenshot, diff, session replay, log, etc.) into a named section |
| `doc-score` | Compute the current evidence score (0–100) across 5 dimensions |
| `doc-close` | Finalize the document, write a permanent snapshot, get a stable URL |
| `doc-read` | Read the current or a past version of a document |
| `doc-diff` | Diff two document versions |
| `doc-list` | List open or closed documents, optionally filtered by tag or ref |

## Document Kinds

| Kind | When to use |
|------|-------------|
| `bug-fix` | Root-cause investigation + code fix |
| `ux-review` | Visual or usability review with before/after evidence |
| `verification` | Verify a claim, deployment, or spec against observed behavior |
| `changeset` | Track a PR or batch of changes end-to-end |
| `custom` | Freeform; use when none of the above fit |

## Lifecycle

```
doc-create → [doc-update / doc-attach]* → doc-score → doc-close
```

- `doc-create` seeds sections from a template based on `kind`.
- `doc-update` / `doc-attach` fill in evidence during work.
- `doc-score` tells you what's missing before closing.
- `doc-close` writes a permanent snapshot. Terminal states: `complete`, `partial`.
- Open docs auto-close as `abandoned` after 24h of inactivity.
- A closed doc can be reopened by calling `doc-update` on it.

## Evidence Types

| Type | Fills dimension |
|------|----------------|
| `screenshot` | visual_state (+10) |
| `component_tree` | semantic_tree (+10) |
| `diff` | behavioral (+6) |
| `console_log` | behavioral (+7) |
| `network_trace` | behavioral (+7) |
| `session_replay` | replay (+10) |

Context dimension (+20 total) comes from filling the title, Context, Changes, and TestResults sections.

Maximum score is 100. Aim for >= 80 before closing as `complete`.

## When to Create a Document

Create a doc at the **start** of any significant workflow:
- Opening a `bug-fix-workflow` or `ux-review-workflow`
- Starting a multi-step changeset (PR review, deployment verification)
- Anytime the user will want a permanent record of what the agent did and why

Pass the returned `doc_id` to any subagents so they can attach evidence to the same document.

## When to Attach Evidence

Attach at every capture point:
- Screenshot of observed bug → `doc-attach` with `type: screenshot`, `section: "Context"`
- Diff of the fix → `doc-attach` with `type: diff`, `section: "Changes"`
- Test output → `doc-attach` with `type: console_log`, `section: "TestResults"`
- Session replay URL → `doc-attach` with `type: session_replay`, `section: "Evidence"`

## When to Close

Call `doc-score` before closing. If score < 60, add missing evidence or close as `partial` with a `summary` explaining what's missing. Close as `complete` only when the work is done and evidence is sufficient.

## Rules

1. **Create at entry, not end.** A doc started after the work captures nothing useful.
2. **Pass `doc_id` to subagents.** Evidence from subagents belongs in the same document.
3. **Fill sections progressively.** Don't batch all `doc-update` calls at the end.
4. **Score before closing.** Know what you're missing.
5. **Close with a useful summary.** The summary appears in `doc-list` and the permanent snapshot.
6. **Share the `doc_url`.** Give it to the user when closing so they have the permanent link.

## End-to-End Transcript (Bug Fix)

```
User: Fix the session filter bug. Session: https://app.fullstory.com/ui/ABC/session/...

Agent:
1. doc-create(title: "Fix: session filter returns stale data", kind: "bug-fix",
              ref: "https://github.com/org/repo/issues/42", tags: ["session", "filter"])
   → doc_id: "doc-abc123", doc_url: "https://..."

2. [session analysis subagent] review-open(session_url: ...) → observe filter resets
   doc-attach(doc_id: "doc-abc123", type: "session_replay",
              url: <session_viewer_url>, section: "Evidence",
              label: "Session showing stale filter on page reload")

3. [code exploration subagent] finds useSessionFilter.ts:47 — stale closure
   doc-update(doc_id: "doc-abc123",
              updates: [{old_str: "Content here.", new_str: "Root cause: stale closure in useSessionFilter.ts:47. The effect dep array omits `filterKey`, causing the filter to hold a reference to the initial empty state."}])

4. [fix + test written]
   doc-attach(doc_id: "doc-abc123", type: "diff",
              content: <git diff output>, section: "Changes",
              label: "Fix: add filterKey to dep array")

5. [browser validation]
   doc-attach(doc_id: "doc-abc123", type: "screenshot",
              artifact_id: <live-view-screenshot id>, section: "After",
              label: "Filter persists after reload")

6. doc-score(doc_id: "doc-abc123")
   → score: 87/100, missing: ["network_trace"]

7. doc-close(doc_id: "doc-abc123", status: "complete",
             summary: "Fixed stale closure in session filter dep array. All tests pass. Browser confirms fix.")
   → doc_url: "https://..." (permanent)

User receives: "Fix complete. Proof document: https://..."
```

## Gotchas

- Forgetting to `doc-create` at entry — you'll have no document to attach evidence to
- Attaching evidence without specifying `section` — evidence lands in the default section and the score may not reflect the correct dimension
- Closing with `complete` when score < 60 — use `partial` and explain in `summary`
- Not sharing the `doc_url` — the user can't find the proof document without it

## See Also

- `subtext:shared` — MCP conventions
- `subtext:comments` — inline session annotations (separate from proof docs)
- `subtext:bug-fix-workflow` — workflow that uses docs at each phase
