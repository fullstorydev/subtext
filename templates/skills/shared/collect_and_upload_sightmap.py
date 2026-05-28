#!/usr/bin/env python3
"""Collect .sightmap/ definitions and upload them to a Lidar MCP session.

Walks all .sightmap/**/*.yaml files under a given root, parses component definitions, flattens
hierarchical children into compound CSS selectors suitable for the subtext MCP's NFA matcher, and
uploads the result to the sightmap upload endpoint.

Usage:
    python3 collect_and_upload_sightmap.py --url <sightmap_upload_url> [--root DIR]

The upload URL is returned by open_session / open_connection and includes a
single-use authentication token.
"""

# Python 3.9 compat
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

try:
    import yaml  # type: ignore[import-not-found]
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")


# ---------------------------------------------------------------------------
# Sightmap collection
# ---------------------------------------------------------------------------


def find_sightmap_files(root: str) -> list[str]:
    """Find all .yaml/.yml files under root/.sightmap/.

    Checks only the direct .sightmap/ child of root to avoid walking
    potentially massive directory trees (node_modules, go, etc.).
    """
    sdir = os.path.join(root, ".sightmap")
    if not os.path.isdir(sdir):
        return []

    files = []
    for dirpath, _, filenames in os.walk(sdir):
        for name in sorted(filenames):
            if name.endswith((".yaml", ".yml")):
                files.append(os.path.join(dirpath, name))
    return files


def flatten_components(
    components: list[dict],
    parent_selectors: Optional[list[str]] = None,
    parent_source: str = "",
) -> list[dict]:
    """Flatten hierarchical component definitions into a flat list.

    Children inherit the parent's selectors as prefixes (descendant combinator)
    and the parent's source if they don't specify their own.

    The YAML ``selector`` field may be a string or a list of strings. The output
    always uses ``selectors`` (a JSON array) so the Go side never needs to split
    comma-separated values.
    """
    if parent_selectors is None:
        parent_selectors = []
    result = []
    for comp in components:
        name = comp.get("name", "")
        raw = comp.get("selector", "")
        source = comp.get("source", "") or parent_source

        # Normalise to a list — YAML authors may write a string or a list.
        if isinstance(raw, list):
            selectors = [s for s in raw if s]
        elif raw:
            selectors = [raw]
        else:
            selectors = []

        # Build full selector chains by combining with parent selectors.
        if parent_selectors and selectors:
            full_selectors = [f"{p} {s}" for p in parent_selectors for s in selectors]
        elif parent_selectors:
            full_selectors = list(parent_selectors)
        else:
            full_selectors = selectors

        if name and full_selectors:
            memory = comp.get("memory", [])
            if not isinstance(memory, list):
                memory = [memory] if memory else []
            entry = {
                "name": name,
                "selectors": full_selectors,
                "source": source or "",
                "memory": memory,
            }
            result.append(entry)

        # Recurse into children
        children = comp.get("children", [])
        if children:
            result.extend(flatten_components(children, full_selectors, source))

    return result


def parse_file(path: str) -> list[dict]:
    """Parse a single sightmap YAML file and return flattened components."""
    with open(path) as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        return []

    components = data.get("components", [])
    if not isinstance(components, list):
        components = []

    result = flatten_components(components)

    # Also flatten view-scoped components
    views = data.get("views", [])
    if isinstance(views, list):
        for view in views:
            view_components = view.get("components", [])
            if isinstance(view_components, list):
                result.extend(flatten_components(view_components))

    return result


def collect(root: str) -> list[dict]:
    """Collect all sightmap definitions from a root directory."""
    files = find_sightmap_files(root)
    result = []
    for path in files:
        result.extend(parse_file(path))
    return result


def collect_memory(root: str) -> list[str]:
    """Collect top-level memory entries from .sightmap/ YAML files."""
    files = find_sightmap_files(root)
    result: list[str] = []
    for path in files:
        with open(path) as f:
            data = yaml.safe_load(f)
        if not isinstance(data, dict):
            continue
        memory = data.get("memory", [])
        if isinstance(memory, str):
            memory = [memory]
        if isinstance(memory, list):
            result.extend(str(m) for m in memory if m)
    return result


# ---------------------------------------------------------------------------
# Sightmap root discovery
# ---------------------------------------------------------------------------


def find_sightmap_root(cwd: str) -> Optional[str]:
    """Find a directory containing .sightmap/, checking cwd and ancestors."""
    d = cwd
    while d != os.path.dirname(d):
        if os.path.isdir(os.path.join(d, ".sightmap")):
            return d
        d = os.path.dirname(d)
    return None


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Collect and upload .sightmap/ definitions"
    )
    parser.add_argument(
        "--url",
        required=True,
        help="Sightmap upload URL (from open_session/open_connection response)",
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Root directory containing .sightmap/ (auto-detected if omitted)",
    )
    args = parser.parse_args()

    root = (
        args.root or os.environ.get("SIGHTMAP_ROOT") or find_sightmap_root(os.getcwd())
    )
    if not root:
        print("No .sightmap/ directory found", file=sys.stderr)
        sys.exit(1)

    components = collect(root)
    memory = collect_memory(root)

    if not components and not memory:
        print("No sightmap definitions found")
        sys.exit(0)

    body = json.dumps(
        {
            "sightmap": components,
            "memory": memory,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        args.url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    # Allow self-signed certs for local dev servers (.test, localhost).
    ssl_ctx = None
    parsed_url = urllib.parse.urlparse(args.url)
    if parsed_url.hostname and (
        parsed_url.hostname.endswith(".test")
        or parsed_url.hostname in ("localhost", "127.0.0.1")
    ):
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, timeout=30, context=ssl_ctx) as resp:
            result = json.loads(resp.read())
            count = result.get("components", 0)
            print(f"Uploaded {count} sightmap component(s)")
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        print(f"Upload failed ({e.code}): {body_text}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Upload failed: {e.reason}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
