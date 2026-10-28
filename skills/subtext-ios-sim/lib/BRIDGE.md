# iOS tree ↔ sightmap bridge

`normalize.mjs` turns a helper `describe` result into a tree of short-tag
elements. `sightmap-bridge.mjs` layers a `.sightmap/` corpus onto it, renders it
like `sightmap snapshot`, resolves ids and component queries, and writes
`.snap` + `.snap.tree.json` files that sightmap's offline tools read.

## Decision: our own matcher (b), with the corpus loaded by `sightmap export`

Checked against sightmap v0.32.0:

- **No offline command annotates a tree.** `snapshot --json` writes `component`
  and `props` per node, but only for a live Chrome page. Offline, `explain --snap
  FILE '*'` prints the owning component per node, `coverage` prints only
  aggregates, and `sel-check` counts one selector.
- **Offline tools ignore view components.** `explain --snap` and `coverage`
  match only globals, even when the `.snap` header names a view or the snap
  sits under `snapshots/<View>/`. iOS screens have no URL to route on, so most
  of a corpus would go unmatched.
- **No properties offline.** `explain` gives no extracted props, so queries
  like `ProductRow[title="Row 3"]` can't be resolved from it.
- **`sightmap export` emits the corpus as JSON.** Child selectors come
  pre-flattened with their ancestors, `$ref`s are expanded, and `parentChain` and
  `memory` are included. That removes YAML parsing and nesting rules from Node.

So we match in Node (`selector.mjs`: tag, `*`, `#id`, `[a]`, `= ^= $= *= ~= |=`
with an optional `i`, descendant and `>` combinators, selector lists, `:not`,
`:is`, `:where`, `:has`). We extract properties (`text`, `attr=`, `Child.prop`,
`exists:Child`) and apply the live snapshot's rules: view components before
globals, first match wins, and conflicts are reported. Live `sightmap snapshot`
behaves the same way, which we verified with a probe page.

**We stay compatible with sightmap.** The tests write our tree as
`.snap.tree.json`, run `sightmap explain --snap` over a globals-only parity
corpus (`test/fixtures/sightmap-parity/`), and require the same component on
every node across four recorded trees. Run them with `SIGHTMAP_BIN=… node --test
test/*.test.mjs`. When sightmap's matcher changes, those tests show where we
differ.

## Element model

| ComponentNode field | From |
|---|---|
| `element.tag`, `role` | normalized type: `button`, `text`, `textfield`, `switch`, `tab`, `cell`, `image`, `other`, … (subrole wins when present: `AXSwitch` → `switch`, `AXTabButton` → `tab`) |
| `element.attrs.identifier` | `identifier` (AXUniqueId) |
| `element.attrs.text`, `name` | `label` |
| `element.attrs.value`, `value` | `value` |
| `element.id` / `attrs.id` | `identifier`, only when it is a valid CSS identifier (`#lastTapped`) |
| `attrs.disabled` | present when `enabled` is false |
| `text` | `label`, or the children's text joined (innerText analog) |
| `bounds` | `frame`, rounded to integers (sightmap requires ints) |
| `isVisible` / `inViewport` | frame intersects the screen / its center is on screen |
| `isIgnored` | label-, identifier- and value-less `other` groups with 2+ children |

Unlabeled single-child and empty `other` wrappers are removed during
normalization, so `>` depends on that collapsing. Prefer descendant selectors.

## Views

No URL means no routes. `annotate(…, {view})` picks a view explicitly.
Otherwise the view is inferred as the one whose own (non-global) components
match the most nodes, and it's rendered as `[View: X] (inferred)`.
