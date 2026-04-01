#!/usr/bin/env python3
"""Tests for sightmap collection in collect_and_upload_sightmap.py."""

import os
import sys
import tempfile

# Import from the merged script in the same directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collect_and_upload_sightmap import (
    collect,
    find_sightmap_files,
    flatten_components,
    parse_file,
)

TESTDATA = os.path.join(os.path.dirname(__file__), "testdata")


# --- flatten_components ---


class TestFlattenComponents:
    def test_single_component(self):
        result = flatten_components([
            {"name": "NavBar", "selector": "nav.main-nav", "source": "a.tsx"},
        ])
        assert result == [
            {"name": "NavBar", "selectors": ["nav.main-nav"], "source": "a.tsx", "memory": []},
        ]

    def test_children_inherit_parent_selector(self):
        result = flatten_components([
            {
                "name": "NavBar",
                "selector": "nav.main-nav",
                "source": "a.tsx",
                "children": [
                    {"name": "NavLink", "selector": "a.nav-link"},
                ],
            },
        ])
        assert len(result) == 2
        assert result[0] == {"name": "NavBar", "selectors": ["nav.main-nav"], "source": "a.tsx", "memory": []}
        assert result[1] == {"name": "NavLink", "selectors": ["nav.main-nav a.nav-link"], "source": "a.tsx", "memory": []}

    def test_children_inherit_parent_source(self):
        result = flatten_components([
            {
                "name": "Parent",
                "selector": "div.parent",
                "source": "parent.tsx",
                "children": [
                    {"name": "Child", "selector": "span.child"},
                ],
            },
        ])
        assert result[1]["source"] == "parent.tsx"

    def test_child_overrides_source(self):
        result = flatten_components([
            {
                "name": "Parent",
                "selector": "div.parent",
                "source": "parent.tsx",
                "children": [
                    {"name": "Child", "selector": "span.child", "source": "child.tsx"},
                ],
            },
        ])
        assert result[1]["source"] == "child.tsx"

    def test_deeply_nested_children(self):
        result = flatten_components([
            {
                "name": "A",
                "selector": "div.a",
                "source": "a.tsx",
                "children": [
                    {
                        "name": "B",
                        "selector": "div.b",
                        "children": [
                            {"name": "C", "selector": "div.c"},
                        ],
                    },
                ],
            },
        ])
        assert len(result) == 3
        assert result[0]["selectors"] == ["div.a"]
        assert result[1]["selectors"] == ["div.a div.b"]
        assert result[2]["selectors"] == ["div.a div.b div.c"]
        assert result[2]["source"] == "a.tsx"

    def test_no_source_produces_empty_string(self):
        result = flatten_components([
            {"name": "X", "selector": "div.x"},
        ])
        assert result == [{"name": "X", "selectors": ["div.x"], "source": "", "memory": []}]

    def test_missing_name_skipped(self):
        assert flatten_components([{"selector": "div.x"}]) == []

    def test_missing_selector_skipped(self):
        assert flatten_components([{"name": "X"}]) == []

    def test_empty_list(self):
        assert flatten_components([]) == []

    def test_parent_selectors_passthrough(self):
        result = flatten_components(
            [{"name": "Child", "selector": "span.child"}],
            parent_selectors=["div.parent"],
        )
        assert result[0]["selectors"] == ["div.parent span.child"]

    def test_multiple_siblings(self):
        result = flatten_components([
            {"name": "A", "selector": "div.a"},
            {"name": "B", "selector": "div.b"},
            {"name": "C", "selector": "div.c"},
        ])
        assert len(result) == 3
        assert [r["name"] for r in result] == ["A", "B", "C"]

    def test_yaml_list_selector(self):
        result = flatten_components([
            {"name": "Sidebar", "selector": [".sidebar-a", ".sidebar-b"], "source": "s.tsx"},
        ])
        assert result == [
            {"name": "Sidebar", "selectors": [".sidebar-a", ".sidebar-b"], "source": "s.tsx", "memory": []},
        ]

    def test_yaml_list_selector_with_parent(self):
        result = flatten_components(
            [{"name": "Child", "selector": [".a", ".b"]}],
            parent_selectors=[".p1", ".p2"],
        )
        assert result[0]["selectors"] == [".p1 .a", ".p1 .b", ".p2 .a", ".p2 .b"]

    def test_list_parent_string_child(self):
        result = flatten_components([
            {
                "name": "Settings",
                "selector": [".settings-a", ".settings-b"],
                "source": "s.tsx",
                "children": [
                    {"name": "Item", "selector": ".item"},
                ],
            },
        ])
        assert len(result) == 2
        assert result[0]["selectors"] == [".settings-a", ".settings-b"]
        assert result[1]["selectors"] == [".settings-a .item", ".settings-b .item"]


# --- parse_file ---


class TestParseFile:
    def test_navbar_yaml(self):
        result = parse_file(os.path.join(TESTDATA, ".sightmap", "navbar.yaml"))
        names = [r["name"] for r in result]
        assert "NavBar" in names
        assert "NavLink" in names
        assert "NavLogo" in names

        nav_link = next(r for r in result if r["name"] == "NavLink")
        assert nav_link["selectors"] == ["nav.main-nav a.nav-link"]
        assert nav_link["source"] == "src/NavBar.tsx"

        nav_logo = next(r for r in result if r["name"] == "NavLogo")
        assert nav_logo["source"] == "src/Logo.tsx"

    def test_views_yaml(self):
        result = parse_file(os.path.join(TESTDATA, ".sightmap", "views.yaml"))
        names = [r["name"] for r in result]
        assert "Footer" in names
        assert "CheckoutForm" in names
        assert "SubmitButton" in names

        submit = next(r for r in result if r["name"] == "SubmitButton")
        assert submit["selectors"] == ["form.checkout button.submit"]
        assert submit["source"] == "src/Checkout.tsx"

    def test_empty_yaml(self):
        assert parse_file(os.path.join(TESTDATA, ".sightmap", "empty.yaml")) == []

    def test_nested_dashboard(self):
        result = parse_file(
            os.path.join(TESTDATA, "packages", "dashboard", ".sightmap", "dashboard.yaml")
        )
        names = [r["name"] for r in result]
        assert "Sidebar" in names
        assert "SidebarMenu" in names
        assert "MenuItem" in names

        menu_item = next(r for r in result if r["name"] == "MenuItem")
        assert menu_item["selectors"] == ["aside.sidebar ul.menu li.menu-item"]
        assert menu_item["source"] == "packages/dashboard/src/Sidebar.tsx"


# --- find_sightmap_files ---


class TestFindSightmapFiles:
    def test_finds_root_sightmap(self):
        files = find_sightmap_files(TESTDATA)
        basenames = [os.path.basename(f) for f in files]
        assert "navbar.yaml" in basenames
        assert "views.yaml" in basenames
        assert "empty.yaml" in basenames

    def test_finds_nested_sightmap(self):
        basenames = [os.path.basename(f) for f in find_sightmap_files(TESTDATA)]
        assert "dashboard.yaml" in basenames

    def test_all_yaml_extensions(self):
        for f in find_sightmap_files(TESTDATA):
            assert f.endswith((".yaml", ".yml"))

    def test_empty_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            assert find_sightmap_files(tmp) == []

    def test_dir_without_sightmap(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, "src"))
            assert find_sightmap_files(tmp) == []


# --- collect (integration) ---


class TestCollect:
    def test_collects_all_components(self):
        result = collect(TESTDATA)
        names = [r["name"] for r in result]
        assert "NavBar" in names
        assert "NavLink" in names
        assert "Footer" in names
        assert "CheckoutForm" in names
        assert "Sidebar" in names
        assert "MenuItem" in names

    def test_no_duplicates(self):
        result = collect(TESTDATA)
        pairs = [(r["name"], tuple(r["selectors"])) for r in result]
        assert len(pairs) == len(set(pairs))

    def test_empty_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            assert collect(tmp) == []
