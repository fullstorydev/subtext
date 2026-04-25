"""Top-level sandbox eval orchestration.

Serial loop over the eval-set. Produces the same JSON shape as
vendor/skill-creator/scripts/run_eval.py so downstream tools
(bin/loop, diff viewers) don't care about the source.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

# Make this runnable as `python -m lib.run_eval_sandbox` from tools/skill-eval/
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from lib.sandbox_runner import run_query_in_sandbox, SandboxResult
from lib.subagent_wrap import wrap_subagent_query


def _parse_skill_md(skill_path: Path) -> tuple[str, str]:
    """Minimal frontmatter read: returns (name, description).

    We duplicate a tiny slice of vendor/skill-creator/scripts/utils.py's
    parse_skill_md here rather than importing the vendored copy, to keep
    lib/ self-contained. If behavior needs to change, match vendor's.
    """
    content = (skill_path / "SKILL.md").read_text()
    m = re.match(r"^---\n(.*?)\n---", content, flags=re.DOTALL)
    if not m:
        raise ValueError(f"No frontmatter in {skill_path}/SKILL.md")
    fm = m.group(1)
    name_m = re.search(r"^name:\s*(.+)$", fm, flags=re.MULTILINE)
    if not name_m:
        raise ValueError("No 'name:' in frontmatter")
    desc_m = re.search(r"^description:\s*(.+?)(?=\n\w+:|\Z)", fm, flags=re.MULTILINE | re.DOTALL)
    if not desc_m:
        raise ValueError("No 'description:' in frontmatter")
    return name_m.group(1).strip(), desc_m.group(1).strip()


def run_eval_over_sandbox(
    eval_set: list[dict],
    skill_name: str,
    description: str,
    plugin_source_path: str,
    runs_per_query: int = 3,
    trigger_threshold: float = 0.5,
    model: str | None = None,
    timeout_s: int = 180,
    verbose: bool = False,
    query_style: str = "user-facing",
) -> dict:
    """Iterate the eval-set, dispatch each query through the sandbox, tally results."""
    results = []
    for item_index, item in enumerate(eval_set):
        triggers = 0
        # Use a fresh uuid per *query* so different queries don't collide on
        # staged command filenames inside the container. Runs within a
        # query can share it (we reset the container anyway each run).
        unique_id = uuid.uuid4().hex[:8]
        clean_name = f"{skill_name}-skill-{unique_id}".replace(":", "-")

        errors = 0
        for run_idx in range(runs_per_query):
            if verbose:
                print(
                    f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                    file=sys.stderr,
                )
            try:
                # Phase 2C: optionally wrap the query as a subagent-dispatch
                # prompt to measure framework-flow routing surface.
                effective_query = (
                    wrap_subagent_query(item["query"], task_num=item_index + 1)
                    if query_style == "subagent"
                    else item["query"]
                )
                r: SandboxResult = run_query_in_sandbox(
                    query=effective_query,
                    clean_name=clean_name,
                    description=description,
                    plugin_source_path=plugin_source_path,
                    timeout_s=timeout_s,
                    model=model,
                )
                if r.triggered:
                    triggers += 1
            except Exception as e:  # noqa: BLE001 — log and carry on
                errors += 1
                print(f"  warn: query failed: {e}", file=sys.stderr)

        trigger_rate = triggers / runs_per_query
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
            "errors": errors,
        })

    passed = sum(1 for r in results if r["pass"])
    with_errors = sum(1 for r in results if r["errors"] > 0)
    total = len(results)
    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "with_errors": with_errors,
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Sandbox-mode trigger eval for a subtext skill")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory (containing SKILL.md)")
    parser.add_argument("--eval-set", required=True, help="Path to eval-set JSON")
    parser.add_argument("--plugin-source", required=True, help="Host path to the subtext plugin source")
    parser.add_argument("--runs-per-query", type=int, default=3)
    parser.add_argument("--trigger-threshold", type=float, default=0.5)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--model", default=None)
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--query-style",
        choices=["user-facing", "subagent"],
        default="user-facing",
        help="user-facing (default): pass queries to claude -p as-is. "
             "subagent: wrap each query in a subagent-dispatch-prompt template "
             "to measure framework-flow routing surface.",
    )
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_name, description = _parse_skill_md(skill_path)

    output = run_eval_over_sandbox(
        eval_set=eval_set,
        skill_name=skill_name,
        description=description,
        plugin_source_path=str(Path(args.plugin_source).resolve()),
        runs_per_query=args.runs_per_query,
        trigger_threshold=args.trigger_threshold,
        timeout_s=args.timeout,
        model=args.model,
        verbose=args.verbose,
        query_style=args.query_style,
    )

    if args.verbose:
        s = output["summary"]
        print(f"Results: {s['passed']}/{s['total']} passed", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
