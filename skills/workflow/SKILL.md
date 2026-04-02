---
name: subtext:workflow
description: Use when a user provides a Fullstory session URL, wants to analyze a session recording, diagnose a user-reported issue, fix a bug, review UX, or reproduce a flow. Routes to the right workflow.
metadata:
  requires:
    skills: ["subtext:shared", "subtext:session", "subtext:comments"]
---

# Workflows

Route session URLs to the right workflow. Infers intent, delegates.

## Available Workflows

| Workflow | Description |
|----------|-------------|
| `subtext:session-analysis-workflow` | Understand what happened in a session |
| `subtext:bug-fix-workflow` | End-to-end: understand, test, fix, validate |
| `subtext:ux-review-workflow` | Friction analysis with prioritized issues |
| `subtext:reproduce-workflow` | Drive browser through a user flow |

## Routing

When a user provides a session URL, call `comment-list` before routing. Comment intents are strong routing signals — bug annotations → bug-fix, UX questions → ux-review — even when the user's message is ambiguous.

Scan the user's message for intent signals. Only show the menu when intent is genuinely ambiguous.

| Trigger Keywords | Workflow | Runs As |
|-----------------|----------|---------|
| "what happened", "diagnose", "investigate", "summary", "review" | `subtext:session-analysis-workflow` | subagent |
| "fix", "bug", "broken", "not working" | `subtext:bug-fix-workflow` | main context |
| "ux", "usability", "friction", "confusing" | `subtext:ux-review-workflow` | subagent |
| "reproduce", "repro", "test", "walk through" | `subtext:reproduce-workflow` | subagent |

**Default when no signal:** `subtext:session-analysis-workflow` — it adapts depth to what it finds and the user can escalate.

## Delegation Rules

**Session Analysis, UX Review, Reproduce:** MUST run as Task subagent. Review tool responses are large and will burn through the main context window. Give the subagent: session coordinates and the user's original message.

**Bug Fix:** Do NOT run as subagent. Bug Fix needs the main context for code editing. Invoke `subtext:bug-fix-workflow` directly, passing the session URL.

## When Intent is Ambiguous

Ask the user:
```
What would you like to do with this session?

1. **Session Analysis** — Understand what happened, diagnose issues
2. **Bug Fix** — Full fix workflow (understand, test, fix, validate)
3. **UX Review** — Evaluate usability and friction
4. **Reproduce** — Exercise the flow locally via browser
5. **Custom** — Tell me what you're looking for
```

## Heuristics

- If the user mentions both a bug and UX, prefer bug-fix — UX review can happen after.
- Multiple sessions from the same user often indicate a recurring issue. Note this.
- Bug fix requests always need main context. Everything else should run in a subagent.

## See Also

- `subtext:shared` — MCP conventions
- `subtext:session` — session replay tools (review-*)
