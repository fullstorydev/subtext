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
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    num_workers: int = 4,
) -> dict:
    """Iterate the eval-set, dispatch each query through the sandbox, tally results."""
    # Use the skill basename (e.g., "proof" for "subtext:proof") as the
    # clean_name. This serves two purposes:
    #   1. Entrypoint lookup: the entrypoint (subtext-sandbox/entrypoint.sh)
    #      stages EVAL_DESCRIPTION into /tmp/subtext-runtime/skills/<basename>/
    #      SKILL.md. The basename must match the actual on-disk skill dir.
    #   2. Trigger detection: TriggerDetector substring-matches clean_name
    #      against tool_input.skill. The basename matches "subtext:proof"
    #      (the routable skill name) via substring.
    #
    # Vendor's run_eval.py uses a UUID-suffixed clean_name (e.g.,
    # "subtext-proof-skill-abc12345") to avoid false positives in isolated
    # mode where the staged file was the only "proof"-named entity. In
    # sandbox mode we route directly to the plugin's actual skill, so the
    # UUID suffix is unnecessary and would break the entrypoint lookup.
    skill_basename = skill_name.split(":")[-1]
    per_query_meta: list[tuple[int, dict, str, str]] = []  # (item_index, item, clean_name, effective_query)
    for item_index, item in enumerate(eval_set):
        clean_name = skill_basename
        effective_query = (
            wrap_subagent_query(item["query"], task_num=item_index + 1)
            if query_style == "subagent"
            else item["query"]
        )
        per_query_meta.append((item_index, item, clean_name, effective_query))

    def _run_one(item_index: int, item: dict, clean_name: str, effective_query: str, run_idx: int) -> tuple[int, SandboxResult | Exception]:
        """Worker function — returns (item_index, result-or-exception)."""
        if verbose:
            print(
                f"[{item['query'][:50]}] run {run_idx + 1}/{runs_per_query}",
                file=sys.stderr,
            )
        try:
            r = run_query_in_sandbox(
                query=effective_query,
                clean_name=clean_name,
                description=description,
                plugin_source_path=plugin_source_path,
                timeout_s=timeout_s,
                model=model,
            )
            return (item_index, r)
        except Exception as e:  # noqa: BLE001 — log and carry on
            return (item_index, e)

    # Per-query state, indexed by item_index.
    triggers_by_query: dict[int, int] = {i: 0 for i in range(len(eval_set))}
    errors_by_query: dict[int, int] = {i: 0 for i in range(len(eval_set))}
    models_by_query: dict[int, set[str]] = {i: set() for i in range(len(eval_set))}

    # Build the full job list: one entry per (query, run).
    jobs = [
        (item_index, item, clean_name, effective_query, run_idx)
        for (item_index, item, clean_name, effective_query) in per_query_meta
        for run_idx in range(runs_per_query)
    ]

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        future_list = [executor.submit(_run_one, *job) for job in jobs]
        for future in as_completed(future_list):
            item_index, result_or_exc = future.result()
            if isinstance(result_or_exc, Exception):
                errors_by_query[item_index] += 1
                print(f"  warn: query failed: {result_or_exc}", file=sys.stderr)
            else:
                if result_or_exc.triggered:
                    triggers_by_query[item_index] += 1
                if result_or_exc.model:
                    models_by_query[item_index].add(result_or_exc.model)

    # Aggregate per-query results in the original eval-set order.
    results = []
    for item_index, item in enumerate(eval_set):
        triggers = triggers_by_query[item_index]
        errors = errors_by_query[item_index]
        observed_models = models_by_query[item_index]
        trigger_rate = triggers / runs_per_query
        should_trigger = item["should_trigger"]
        did_pass = (
            trigger_rate >= trigger_threshold
            if should_trigger
            else trigger_rate < trigger_threshold
        )
        result_model = ",".join(sorted(observed_models)) if observed_models else None
        results.append({
            "query": item["query"],
            "should_trigger": should_trigger,
            "trigger_rate": trigger_rate,
            "triggers": triggers,
            "runs": runs_per_query,
            "pass": did_pass,
            "errors": errors,
            "model": result_model,
        })

    passed = sum(1 for r in results if r["pass"])
    with_errors = sum(1 for r in results if r["errors"] > 0)
    total = len(results)
    # Union of all models observed across all queries. Usually a single
    # model; comma-separated if the eval rotated models (shouldn't happen
    # within one run, but defensive).
    summary_models: set[str] = set()
    for r in results:
        if r["model"]:
            for m in r["model"].split(","):
                summary_models.add(m)
    return {
        "skill_name": skill_name,
        "description": description,
        "results": results,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "with_errors": with_errors,
            "models": sorted(summary_models),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Sandbox-mode trigger eval for a subtext skill")
    parser.add_argument("--skill-path", required=True, help="Path to skill directory (containing SKILL.md)")
    parser.add_argument("--eval-set", required=True, help="Path to eval-set JSON")
    parser.add_argument("--plugin-source", required=True, help="Host path to the subtext plugin source")
    parser.add_argument(
        "--description",
        default=None,
        help="Override the description tested. When unset, reads from SKILL.md frontmatter. "
             "Useful for testing alternative descriptions without mutating disk.",
    )
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
    parser.add_argument(
        "--num-workers",
        type=int,
        default=4,
        help="Number of parallel docker run workers (default 4). "
             "Each worker spins up its own container; tune based on host "
             "CPU/memory.",
    )
    args = parser.parse_args()

    skill_path = Path(args.skill_path)
    eval_set = json.loads(Path(args.eval_set).read_text())
    skill_name, on_disk_description = _parse_skill_md(skill_path)
    description = args.description if args.description is not None else on_disk_description

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
        num_workers=args.num_workers,
    )

    if args.verbose:
        s = output["summary"]
        print(f"Results: {s['passed']}/{s['total']} passed", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
