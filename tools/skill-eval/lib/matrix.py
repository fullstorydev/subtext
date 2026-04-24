"""Matrix aggregation + markdown rendering for cross-config eval results.

Consumes the per-config result JSONs produced by run_eval_sandbox and emits
a consolidated matrix (queries × configs → per-query-per-config trigger rate)
plus a markdown rendering suitable for pasting into PR comments and docs.

Pure stdlib. No subprocess. Fed by bin/eval-sandboxed-matrix which orchestrates
the per-config runs.
"""

from __future__ import annotations

from typing import Any


def build_matrix(configs: dict[str, dict]) -> dict:
    """Consolidate per-config result JSONs into a single matrix.

    Input:
        configs: {config_name: run_eval_sandbox_output_dict}
    Returns:
        {
            "configs": [config_name, ...],
            "queries": [
                {
                    "query": str,
                    "should_trigger": bool,
                    "results": {config_name: {trigger_rate, triggers, runs, pass, errors}}
                },
                ...
            ],
            "summary": {config_name: {total, passed, failed, with_errors}}
        }

    Raises ValueError if configs don't share the same query set (in matching order).
    """
    config_names = list(configs.keys())
    if not config_names:
        raise ValueError("at least one config required")

    # Pin the query list from the first config; all others must match it exactly.
    first_cfg = configs[config_names[0]]
    canonical_queries = [r["query"] for r in first_cfg["results"]]
    for name in config_names[1:]:
        other_queries = [r["query"] for r in configs[name]["results"]]
        if other_queries != canonical_queries:
            raise ValueError(
                f"query set mismatch between '{config_names[0]}' and '{name}' "
                f"(matrix requires identical queries in identical order)"
            )

    # Build query list with per-config sub-results.
    matrix_queries = []
    for idx, query_text in enumerate(canonical_queries):
        first_result = first_cfg["results"][idx]
        per_cfg: dict[str, dict[str, Any]] = {}
        for name in config_names:
            r = configs[name]["results"][idx]
            per_cfg[name] = {
                "trigger_rate": r["trigger_rate"],
                "triggers": r["triggers"],
                "runs": r["runs"],
                "pass": r["pass"],
                "errors": r.get("errors", 0),  # Older results (vendor/host) may lack this.
            }
        matrix_queries.append({
            "query": query_text,
            "should_trigger": first_result["should_trigger"],
            "results": per_cfg,
        })

    # Build per-config summary block.
    summary = {
        name: {
            "total": configs[name]["summary"]["total"],
            "passed": configs[name]["summary"]["passed"],
            "failed": configs[name]["summary"]["failed"],
            "with_errors": configs[name]["summary"].get("with_errors", 0),
        }
        for name in config_names
    }

    return {
        "configs": config_names,
        "queries": matrix_queries,
        "summary": summary,
    }


def find_divergences(matrix: dict, min_gap: float = 0.5) -> list[dict]:
    """Return queries where the max-min trigger_rate across configs is >= min_gap.

    Useful for surfacing routing-contest changes: a query that triggers reliably
    in one config and unreliably in another is the primary skill-collision signal.
    """
    divs = []
    for q in matrix["queries"]:
        rates = [res["trigger_rate"] for res in q["results"].values()]
        if not rates:
            continue
        gap = max(rates) - min(rates)
        if gap >= min_gap:
            divs.append({
                "query": q["query"],
                "should_trigger": q["should_trigger"],
                "gap": gap,
                "rates": {cfg: q["results"][cfg]["trigger_rate"] for cfg in matrix["configs"]},
            })
    return divs


def render_matrix_markdown(matrix: dict, divergence_threshold: float = 0.5) -> str:
    """Render the matrix as a markdown document suitable for docs + PR comments."""
    configs = matrix["configs"]
    lines: list[str] = []

    # Summary table: one row per config.
    lines.append("## Matrix summary\n")
    lines.append("| Config | Passed | Failed | With errors |")
    lines.append("|---|---|---|---|")
    for cfg in configs:
        s = matrix["summary"][cfg]
        lines.append(f"| {cfg} | {s['passed']}/{s['total']} | {s['failed']} | {s['with_errors']} |")
    lines.append("")

    # Per-query table.
    lines.append("## Per-query breakdown\n")
    header = "| Query | Expected | " + " | ".join(configs) + " |"
    sep = "|---|---|" + "|".join(["---"] * len(configs)) + "|"
    lines.append(header)
    lines.append(sep)
    for q in matrix["queries"]:
        expected_sym = "✅" if q["should_trigger"] else "❌"
        # Truncate long queries for readability.
        qt = q["query"].replace("|", "\\|")
        if len(qt) > 80:
            qt = qt[:77] + "..."
        row_cells = [f"{qt}", expected_sym]
        for cfg in configs:
            r = q["results"][cfg]
            mark = "✅" if r["pass"] else "❌"
            row_cells.append(f"{mark} {r['triggers']}/{r['runs']}")
        lines.append("| " + " | ".join(row_cells) + " |")
    lines.append("")

    # Divergences list.
    divs = find_divergences(matrix, min_gap=divergence_threshold)
    lines.append(f"## Divergences (≥{divergence_threshold:.2f} trigger-rate gap)\n")
    if not divs:
        lines.append("_No divergences at this threshold._")
    else:
        for d in divs:
            expected_sym = "✅" if d["should_trigger"] else "❌"
            rates_str = ", ".join(f"{cfg}={d['rates'][cfg]:.2f}" for cfg in configs)
            lines.append(f"- {expected_sym} `{d['query'][:90]}` — gap {d['gap']:.2f} ({rates_str})")
    lines.append("")

    return "\n".join(lines)
