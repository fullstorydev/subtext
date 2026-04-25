"""T1: The entrypoint stages EVAL_DESCRIPTION into the runtime SKILL.md.

Black-box test: spins a real container with EVAL_DRY_RUN=1 so the entrypoint
short-circuits after staging. Asserts the staged description appears verbatim
in the runtime SKILL.md frontmatter.

This is the cheapest acceptance test (~2s, no API key needed) and is the
canary for the staging mechanism. If T1 fails, the entire harness is
mismeasuring and no Phase 4 work is meaningful.
"""

from __future__ import annotations

import subprocess

import pytest


SANDBOX_IMAGE = "subtext-sandbox-claude:latest"


def _run_entrypoint_dry(repo_root, *, description: str, clean_name: str = "proof") -> tuple[int, str, str]:
    """Run the sandbox entrypoint in dry-run mode and capture exit/stdout/stderr.

    EVAL_DRY_RUN=1 makes entrypoint.sh short-circuit after staging the
    runtime SKILL.md and dumping the frontmatter to stderr. No claude
    invocation, no API key needed.
    """
    proc = subprocess.run(
        [
            "docker", "run", "--rm",
            "-v", f"{repo_root}:/opt/subtext:ro",
            "-e", "PLUGIN_SOURCE=local",
            "-e", "EVAL_DRY_RUN=1",
            "-e", f"EVAL_QUERY=anything-truthy",  # entrypoint requires this to enter eval-mode branch
            "-e", f"EVAL_CLEAN_NAME={clean_name}",
            "-e", f"EVAL_DESCRIPTION={description}",
            SANDBOX_IMAGE,
        ],
        capture_output=True,
        timeout=60,
    )
    return proc.returncode, proc.stdout.decode("utf-8"), proc.stderr.decode("utf-8")


def test_basic_description_stages_verbatim(require_docker, require_sandbox_image, repo_root):
    desc = "ACCEPTANCE_TEST_DESC_BASIC_001 — single-line replacement check."
    rc, _, stderr = _run_entrypoint_dry(repo_root, description=desc)
    assert rc == 0, f"entrypoint exited {rc}; stderr:\n{stderr}"
    # Diagnostic echo line confirms what the loader will see.
    assert f"description: {desc}" in stderr, (
        "Staged frontmatter doesn't contain the expected description line.\n"
        f"Expected to find: 'description: {desc}'\n"
        f"Actual stderr:\n{stderr}"
    )


def test_description_with_special_yaml_chars_stages_verbatim(require_docker, require_sandbox_image, repo_root):
    """Quotes, ampersands, colons, and dollar signs must round-trip cleanly.

    Past bug (Phase 1): heredoc-based staging shell-interpreted $ and `.
    The current awk + ENVIRON path should handle these.
    """
    desc = "Special chars: dollar $foo, backtick `cmd`, quote \"hi\", ampersand & semicolon;."
    rc, _, stderr = _run_entrypoint_dry(repo_root, description=desc)
    assert rc == 0, f"entrypoint exited {rc}; stderr:\n{stderr}"
    assert f"description: {desc}" in stderr, (
        f"Special-char description not staged verbatim.\nstderr:\n{stderr}"
    )


def test_frontmatter_structure_preserved(require_docker, require_sandbox_image, repo_root):
    """The rewrite must leave name:, metadata:, and the body intact."""
    desc = "ACCEPTANCE_TEST_DESC_STRUCTURE_002"
    rc, _, stderr = _run_entrypoint_dry(repo_root, description=desc)
    assert rc == 0, f"entrypoint exited {rc}; stderr:\n{stderr}"
    # Frontmatter dump should still contain the name and metadata anchor lines.
    # If awk's substitution accidentally clobbered other fields, these asserts
    # catch it.
    assert "name: subtext:proof" in stderr, f"name field missing.\nstderr:\n{stderr}"
    assert "metadata:" in stderr, f"metadata block missing.\nstderr:\n{stderr}"
    assert "mcp-server: subtext" in stderr, f"mcp-server field missing.\nstderr:\n{stderr}"


def test_missing_description_field_is_an_error(require_docker, require_sandbox_image, repo_root, tmp_path):
    """If the SKILL.md somehow has no description: line, the entrypoint must
    fail loudly rather than silently staging nothing."""
    # Build a fake plugin tree with a description-less SKILL.md.
    fake_plugin = tmp_path / "fake-plugin"
    skill_dir = fake_plugin / "skills" / "proof"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "---\n"
        "name: subtext:proof\n"
        "metadata:\n"
        "  mcp-server: subtext\n"
        "---\n\n"
        "# Proof\n\nBody here.\n"
    )
    rc, _, stderr = _run_entrypoint_dry(fake_plugin, description="anything")
    assert rc != 0, f"expected non-zero exit when description: line missing; got {rc}\nstderr:\n{stderr}"
    assert "no 'description: ' line found" in stderr, (
        f"expected explicit error message; stderr:\n{stderr}"
    )
