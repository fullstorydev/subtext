"""Subagent-dispatch-prompt wrapping for skill-eval.

When the harness runs in --query-style subagent mode, each query gets wrapped
in a subagent-dispatch template before being sent to claude -p. This measures
how skill-loader routing differs between user-typed prompts and framework-
dispatched subagent prompts — the routing surface that matters most for
flows like Superpowers' subagent-driven-development.

The template mirrors the shape of subagent prompts that those frameworks
actually dispatch:
  - 'You are implementing Task N.' framing
  - The original query as Task Description
  - A '## Your Job' numbered list (with SP's literal phrasing)
  - Status-report sign-off

Pure stdlib. No subprocess. Used by lib.run_eval_sandbox.
"""

from __future__ import annotations


SUBAGENT_TEMPLATE = """You are implementing Task {task_num}.

## Task Description

{query}

## Your Job

1. Implement exactly what the task specifies
2. Write tests (following TDD if task says to)
3. Verify implementation works
4. Commit your work
5. Self-review
6. Report back

Work from the current directory.

When done, report status (DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT), files changed, test results, and any concerns."""


def wrap_subagent_query(query: str, task_num: int = 1) -> str:
    """Wrap a user-facing query in a subagent-dispatch-prompt template.

    The template faithfully mirrors SP's
    skills/subagent-driven-development/implementer-prompt.md — including the
    conditional TDD phrasing `(following TDD if task says to)`. We deliberately
    do NOT anchor on unconditional 'Follow TDD' framing — Phase 2B showed
    that explicit TDD cues cost proof routing wins to
    superpowers:test-driven-development, and we want to measure subagent-shape
    signal cleanly without that confounder.

    Args:
        query: the original user-facing query (as it appears in the eval-set).
        task_num: the task number to embed in the prompt header. Default 1.
            The eval orchestrator typically passes the 1-indexed query position
            so each wrapped prompt has a slightly different header — closer to
            how real subagent dispatches reference plan task numbers.

    Returns:
        A subagent-dispatch-style prompt that embeds the original query and
        leaves work-style framing (TDD or otherwise) conditional on what the
        original query asks for.
    """
    return SUBAGENT_TEMPLATE.format(task_num=task_num, query=query)
