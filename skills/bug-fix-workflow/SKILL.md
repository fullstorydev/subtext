---
name: subtext:bug-fix-workflow
description: Fix UI bugs via evidence-driven workflow. Understand before fixing, test before coding. Delegates heavy exploration to subagents.
metadata:
  requires:
    skills: ["subtext:session", "subtext:shared", "subtext:sightmap", "subtext:visual-verification", "subtext:comments"]
---

# Bug Fix

> **PREREQUISITE:** Read `subtext:shared` and `subtext:session` for MCP conventions and session replay tools.

End-to-end bug fixing from session evidence to validated fix. Core principle: **understand before you fix, evidence before hypothesis, test before code.**

## Goal

A validated bug fix: root cause identified, failing test written, minimal fix applied, broader suite green, browser confirms the fix.

**Done when ALL true:**
- Root cause is identified and explained
- A failing test exists that proves the bug (unless untestable)
- The minimal fix makes the test pass
- The broader test suite has no regressions
- (Optional) Browser validation confirms the fix

## Core Invariant

Non-negotiable:
1. **Understand the bug before locating code.** Evidence from session or reproduction, not guesswork.
2. **Have a root cause hypothesis before writing any fix code.** Name the file, the function, the mechanism.
3. **Write a failing test before writing fix code** (when testable).

## Entry Evaluation

Before doing anything, assess what you already know:
- Comments on the session? → `comment-list`. Bug annotations pinpoint location and expected behavior. Reply to acknowledge each before investigating.
- Can you state expected vs actual? → Understanding satisfied, skip ahead
- Do you know the file/function? → Root Cause may be partially satisfied, verify with evidence
- Is a session-analysis already in this conversation? → Accept it, don't re-analyze
- Stack trace or error pointing to a specific line? → May go straight to Failing Test, but verify first

## Decision Points

### Understanding — "Do I know what's wrong?"

- Session-analysis exists in conversation → accept it
- Otherwise → delegate to subagent running `subtext:session-analysis-workflow`. Give it: session coordinates and bug description.
- Bug description with no session, specific enough → proceed to Root Cause
- Bug description vague → ask for context or session URL

**Exit:** You can state expected behavior, actual behavior, and name the components.
**Checkpoint:** Present understanding to user. Ask whether to reproduce or proceed to code.

### Reproduction — "Can I see it happen?" (optional)

- Bug is UI-visible and local dev available → delegate browser reproduction to subagent
- Bug is data-dependent or local data insufficient → note and proceed; session evidence is sufficient
- Reproduction fails → session evidence is sufficient. Don't block.

### Root Cause — "Where in the code?"

**Delegate deep code exploration to a subagent.** Main context should only see candidate files + hypothesis.

- Source paths from session analysis → start there, trace data flow
- No source mapping → grep for component names, test IDs, class names from session evidence

**Exit:** Name the file, function/line, and mechanism.
**Checkpoint:** Present hypothesis with evidence. If user disagrees, see "Revising a Wrong Hypothesis."

### Failing Test — "Can I prove the bug?"

- Find existing test files near the fix file. Match their patterns.
- Assert **correct** behavior. Test must FAIL against current (buggy) code.
- Run it. Confirm it fails for the right reason.
- If purely visual → skip unit test, validate via browser
- If no test infrastructure nearby → create minimal test following nearest conventions

### Fix — minimal change

- Fix the bug, nothing else. No refactoring, no cleanup.
- Run the failing test — must pass.
- Run broader suite — no regressions.
- Existing tests break assuming buggy behavior → update those tests.

### Validation — confirm the fix

- Build the UI
- Delegate browser validation to subagent with original repro steps
- Subagent follows steps and confirms bug is gone
- Apply `visual-verification` rules: screenshot the fix, check theme/viewport variants if the change touched styles, and compare against the original bug evidence
- `comment-reply` on each bug annotation with fix status and evidence (commit, screenshot)
- `comment-resolve` only on issues confirmed fixed via screenshot — leave others open with a status reply

## Revising a Wrong Hypothesis

**User rejects hypothesis:**
- Ask what they think instead. Domain knowledge is faster than re-exploration.
- Look at what you DIDN'T check: network if you focused on DOM, async timing if you focused on data.
- If they point to a different area → new code exploration subagent.

**Test fails for wrong reason (or won't fail):**
- Hypothesis is wrong. Don't force it.
- Re-examine: different code path? Different rendering branch? Different data source?
- Fresh code exploration subagent with the new question.

**Fix causes unexpected regressions:**
- Regressions are clues. Read failing test names and assertions.
- Is the fix too broad? Shared utility affected?
- If deeper issue → stop, present findings to user.

**Revised twice and can't converge:**
- Present what you know and what you've eliminated.
- Ask the user to help distinguish remaining possibilities.
- May exceed bug-fix scope — report as partial diagnosis.

## Heuristics

1. **Console errors and network failures first.** Smoking guns.
2. **Source paths in session analysis output are the fastest path from components to code.**
3. **Most common mistake: jumping to fix before understanding.**
4. **Delegate to subagents aggressively.** Main context sees summaries only.
5. **Check in at decision points, not micro-steps.** Two checkpoints: after understanding, after hypothesis.

## Composition

- **Invoked by**: `subtext:workflow` router (directly in main context, NOT as subagent)
- **Delegates to**: subagents for session analysis, code exploration, browser reproduction/validation
