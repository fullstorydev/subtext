#!/usr/bin/env python3
"""Rewrite a SKILL.md's frontmatter `description:` field in place.

Usage:
    apply_description.py <skill-md-path> <new-description-text-or-@file>

Preserves all other frontmatter fields and body content. Handles both
inline `description: ...` and YAML block scalar (`description: >-` followed
by indented continuation lines) source formats, and always writes the new
value as a single inline value.
"""
from __future__ import annotations

import sys
from pathlib import Path


def rewrite_description(content: str, new_description: str) -> str:
    lines = content.split("\n")
    if not lines or lines[0].strip() != "---":
        raise ValueError("SKILL.md missing opening '---' frontmatter fence")

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        raise ValueError("SKILL.md missing closing '---' frontmatter fence")

    desc_start = None
    for i in range(1, end_idx):
        if lines[i].startswith("description:"):
            desc_start = i
            break
    if desc_start is None:
        raise ValueError("SKILL.md frontmatter has no 'description:' field")

    # Determine if description uses a block scalar (>-, |-, >, |).
    value = lines[desc_start][len("description:"):].strip()
    desc_end = desc_start
    if value in (">", "|", ">-", "|-"):
        j = desc_start + 1
        while j < end_idx and (lines[j].startswith("  ") or lines[j].startswith("\t") or lines[j].strip() == ""):
            desc_end = j
            j += 1

    new_line = f"description: {inline_yaml(new_description)}"
    return "\n".join(lines[:desc_start] + [new_line] + lines[desc_end + 1:])


def inline_yaml(text: str) -> str:
    """Render a string as an inline YAML value safe for a single line.

    Uses unquoted plain form when possible, otherwise a double-quoted string
    with proper escaping. Always emitted on one line.
    """
    text = text.replace("\r\n", " ").replace("\n", " ").strip()
    if not text:
        return '""'
    first = text[0]
    needs_quoting = (
        first in "!&*>|%@`#[]{},\"'"
        or first == "-" and (len(text) == 1 or text[1] == " ")
        or ":" in text and any((text[i] == ":" and (i + 1 == len(text) or text[i + 1] == " ")) for i in range(len(text)))
        or "#" in text and " #" in text
    )
    if not needs_quoting:
        return text
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    skill_md = Path(sys.argv[1])
    arg = sys.argv[2]
    if arg.startswith("@"):
        new_desc = Path(arg[1:]).read_text()
    else:
        new_desc = arg
    content = skill_md.read_text()
    updated = rewrite_description(content, new_desc)
    skill_md.write_text(updated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
