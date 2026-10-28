# iOS tree ↔ sightmap bridge

`normalize.mjs` turns a helper `describe` result into a tree of short-tag
elements. `sightmap-bridge.mjs` layers a `.sightmap/` corpus onto it, renders it
like `sightmap snapshot`, resolves ids and component queries, and writes
`.snap` + `.snap.tree.json` files that sightmap's offline tools read.

## Decision: our own matcher (b), with the corpus loaded by `sightmap export`

Checked against sightmap v0.32.0 and re-checked on v0.36.1:

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
`:is`, `:where`, `:has`). We extract properties and apply the live snapshot's
rules: view components before globals, first match wins, and conflicts are
reported. Live `sightmap snapshot` behaves the same way, which we verified with
a probe page.

## Export shape across sightmap versions

The bridge is tested with sightmap 0.32 through 0.36 (`SIGHTMAP_TESTED` in
`sightmap-cli.mjs`; `doctor` warns outside it). The npx fallback pins 0.36.1.

- **`extract` (0.34+).** `sightmap export` writes every component property's
  `extract` as an object, `{from, path?, pattern?, join?}`; 0.32/0.33 write the
  strings `text`, `attr=NAME`, `Child.prop`, `exists:Child`. `parseCorpus`
  lowers both to the object form. Supported sources: `dom.text` and
  `dom.raw_text` (both read the label, or the joined child text),
  `dom.attr`, `dom.state` (`disabled`; `selected` from the `Selected` trait;
  `checked` from a switch's `1`/`0` value; `expanded` never resolves),
  `component` (with `Name[]` steps and `join`) and `component.exists`.
  `pattern` takes capture group 1, else the whole match.
- **YAML.** 0.34+ reads both forms in `.sightmap/`; 0.32 can't parse the object
  form ("cannot unmarshal !!map into string"), and the snapshot error says to
  upgrade. The sample apps' corpora use the object form.
- **Routes.** `sightmap validate` requires a `route` on every view (any
  version). Native screens have none, so corpora give each view a placeholder
  route; the bridge never reads it.
- Nothing else in the export changed between 0.32 and 0.36.1 for the fields the
  bridge reads (`globals`, `views[].components`, `selectors`, `parentChain`,
  `memory`).

## iOS-specific selector rules

Two rules let a corpus written against a recorded web or React Native session
match the simulator's tree:

- **`testid` aliases `identifier`.** Session corpora write `[testid="x"]`; the
  simulator exposes the same testID as the accessibility identifier. Every
  identified element carries both attributes, in `attrsOf` and so in the
  `.tree.json`, which keeps sightmap's offline tools in agreement.
- **Absent identified ancestors are skipped.** In a descendant chain, ancestor
  step *k* (followed by whitespace, not `>`) may be skipped when its compound
  names an exact identifier (`#x`, `[identifier="x"]`, `[testid="x"]`, `[id="x"]`)
  and **no element in the whole tree** matches that compound, provided the
  subject step has an attribute or `#id` of its own. A testID on a plain
  wrapper view (not an accessibility element) never reaches the iOS tree, so
  `[testid="login-form"] [testid="login-submit"]` would otherwise never match.
  An identifier present anywhere on screen is never skipped (so a
  `[testid="card"] [testid="close"]` selector doesn't leak to another card's
  close button outside it), prefix and substring matches are never skipped, and
  `[testid="list"] button` doesn't match (it would match every button). The rule
  doesn't apply to relative selectors inside `:has()`.
  `sightmap explain` / `coverage` don't apply this rule, so they can report
  fewer matches than the snapshot for such selectors.

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
