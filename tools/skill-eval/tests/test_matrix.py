"""Unit tests for lib.matrix.

Fixtures under tests/fixtures/matrix/ simulate two per-config run outputs.
config_a: 3/3 passed; config_b: 2/3 (the first query drops from 3/3 to 1/3
triggers — simulates a routing-contest loss when another framework is loaded).
"""

import json
from pathlib import Path

from lib.matrix import build_matrix, render_matrix_markdown, find_divergences

FIXTURES = Path(__file__).parent / "fixtures" / "matrix"


def _load_configs() -> dict:
    return {
        "config_a": json.loads((FIXTURES / "config_a_result.json").read_text()),
        "config_b": json.loads((FIXTURES / "config_b_result.json").read_text()),
    }


def test_build_matrix_has_expected_keys():
    matrix = build_matrix(_load_configs())
    assert set(matrix.keys()) == {"configs", "queries", "summary"}
    assert matrix["configs"] == ["config_a", "config_b"]
    assert len(matrix["queries"]) == 3


def test_build_matrix_preserves_per_query_per_config_results():
    matrix = build_matrix(_load_configs())
    # First query: config_a 3/3, config_b 1/3
    q0 = matrix["queries"][0]
    assert q0["query"] == "Update the button hover state"
    assert q0["should_trigger"] is True
    assert q0["results"]["config_a"]["triggers"] == 3
    assert q0["results"]["config_a"]["pass"] is True
    assert q0["results"]["config_b"]["triggers"] == 1
    assert q0["results"]["config_b"]["pass"] is False


def test_build_matrix_summary_per_config():
    matrix = build_matrix(_load_configs())
    assert matrix["summary"]["config_a"] == {"total": 3, "passed": 3, "failed": 0, "with_errors": 0}
    assert matrix["summary"]["config_b"] == {"total": 3, "passed": 2, "failed": 1, "with_errors": 0}


def test_find_divergences_flags_big_trigger_rate_gaps():
    matrix = build_matrix(_load_configs())
    divs = find_divergences(matrix, min_gap=0.5)
    # Only the first query has a gap >= 0.5 (1.0 vs 0.33)
    assert len(divs) == 1
    assert divs[0]["query"] == "Update the button hover state"


def test_find_divergences_threshold():
    matrix = build_matrix(_load_configs())
    # A tighter threshold (0.3) still catches the 1.0 vs 0.33 query but no more.
    divs = find_divergences(matrix, min_gap=0.3)
    assert len(divs) == 1


def test_render_matrix_markdown_contains_summary_row_per_config():
    matrix = build_matrix(_load_configs())
    md = render_matrix_markdown(matrix)
    # Summary table should mention both configs
    assert "config_a" in md
    assert "config_b" in md
    # Per-query table should have a divergence-flagged row
    assert "Update the button hover state" in md
    # Divergences section present
    assert "Divergences" in md or "divergence" in md.lower()


def test_build_matrix_with_missing_query_raises():
    """All configs must have the same set of queries; mismatch is an error."""
    import pytest
    configs = _load_configs()
    # Drop the last query from config_b to create a mismatch
    configs["config_b"]["results"] = configs["config_b"]["results"][:-1]
    with pytest.raises(ValueError, match="query"):
        build_matrix(configs)
