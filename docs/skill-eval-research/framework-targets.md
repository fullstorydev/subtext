# Framework targets for plugin-matrix expansion

Tracks popular Claude Code plugins / skill frameworks we may want to add to
the sandbox eval matrix in future phases. Each entry lists what the framework
does, its marketplace source, a priority judgment, and an initial collision-
vector hypothesis (which of its skills might win routing contests against
`subtext:proof` or other Subtext skills).

Adding a new framework to the matrix requires (a) a `Dockerfile.<framework>`
that extends the base sandbox image with `claude plugin install` steps, (b) a
new case in `tools/skill-eval/sandbox/build.sh` and `tools/skill-eval/bin/eval-sandboxed`,
and (c) optionally, additional queries in `eval-set-v3.json` that stress the
hypothesized collision vectors.

## Currently in matrix

### superpowers (Jesse Vincent) — `obra/superpowers-marketplace`

A full development-methodology framework: brainstorming → writing-plans →
subagent-driven-development → TDD → verification-before-completion. 20+
skills, at least two of which are MUST-tier (`brainstorming`,
`using-superpowers`).

**Priority:** added as the first collision target (Phase 2B matrix).

**Collision vectors vs proof:**
- `brainstorming` is MUST-triggered on "creative work" — may win on queries
  like "Let's brainstorm the dark-mode toggle" that could plausibly go to
  proof's "implement" phrasing too.
- `test-driven-development` triggers on "implementing any feature or bugfix,
  before writing implementation code" — direct overlap with proof's
  "implementing, fixing, or refactoring code" phrasing. The question is
  whether Claude routes to BOTH (via a sequential Skill chain) or picks one.
- `verification-before-completion` could compete on "verify my changes" type
  prompts.

## Candidates for follow-up matrices

### code-review (Anthropic) — `anthropics/claude-plugins-official`

Provides a `/code-review` slash command for reviewing PRs. Opens a structured
review flow. Relevance to Subtext: the `subtext:review` skill shares naming
overlap; users may invoke either expecting the other.

**Priority:** high. Review-adjacent territory directly overlaps with Subtext's
new `review` skill. Worth a dedicated matrix run.

**Collision vectors:**
- `code-review:code-review` slash command may be preferred over Subtext's
  `review` skill on queries like "Review this PR" or "Code review the recent
  changes".
- Unlike proof, this is a *slash command* not an auto-triggered skill — the
  collision is less about automatic routing and more about user mental model.

### frontend-design (Anthropic) — `anthropics/claude-plugins-official`

Specialized skill for building high-quality frontend UI (distinct aesthetic,
creative code generation). Description mentions "building web components,
pages, artifacts, posters, or applications".

**Priority:** high. Direct scope overlap with proof on UI implementation
tasks — proof and frontend-design both fire plausibly on "build me a landing
page".

**Collision vectors:**
- frontend-design's description mentions "web components, pages, artifacts"
  and styling/beautifying any UI — almost identical query surface to proof's
  UI positives.
- Whether both fire, or one wins, is the key question. If proof wins, we're
  fine; if frontend-design wins, users making UI changes with Subtext
  installed but frontend-design active may skip the evidence capture.

### mcp-builder (Anthropic) — `anthropics/claude-plugins-official`

Specialized flow for building MCP servers. Scope is narrow enough that it
likely doesn't collide with proof on typical UI / backend / refactor queries.

**Priority:** low. Add only if we see MCP-builder-related queries in the
eval-set.

**Collision vectors:** minimal. Would fire on "add an MCP tool" / "build a
new MCP server" — queries that are out of proof's eval set.

### playwright-cli — browser automation skill

Used for driving browser tests. Relevance to Subtext: overlaps with
`subtext:live` and `subtext:proof` on browser-involving tasks.

**Priority:** medium. Worth testing once we have more confidence in the
matrix infrastructure.

**Collision vectors:**
- `subtext:live` vs playwright-cli for "navigate to X and click Y" prompts.
- proof might also fire if the task involves UI changes that Playwright
  would validate.

### superpowers:code-reviewer, superpowers:writing-plans, etc.

These are sub-skills within the superpowers plugin and are already covered
by the `subtext-plus-superpowers` matrix config. No additional work needed.

## Open questions for future phases

1. **Subagent-dispatch matrix:** Phase 2C will add subagent-style query
   mode. Should subagent-style queries also be matrix-tested? Likely yes:
   the subagent's skill-loader is the most important collision surface for
   framework-driven workflows.

2. **Matrix scale:** at Phase 3 parallelism, is there a point where we
   stop adding configs and instead rotate through them? An N × M matrix
   with large N and M gets noisy. Maybe cap at ~5 active configs.

3. **Soft-ambiguous queries:** some eval-set-v3 queries are marked "soft"
   because reasonable interpretations differ. In a matrix, a divergence on
   a soft query is less interesting than one on a hard positive. The
   matrix rendering could highlight hard-only divergences.

4. **Cross-plugin chain interactions:** a query might trigger brainstorming
   (SP) → proof chain in some routing models. Measuring *what* triggered
   (not just whether proof fired) may be the next harness feature.
