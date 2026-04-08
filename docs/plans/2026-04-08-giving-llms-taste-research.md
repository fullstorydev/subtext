# Giving LLMs Taste: Research Synthesis & Experiment Plan

**Date**: 2026-04-08
**Goal**: Understand how to leverage Subtext's browser tools to help LLMs produce and critique excellent UI/UX, and design experiments to test the most promising approaches.

---

## The Core Problem

LLMs can generate *functional* UI but not *beautiful* UI. The gap is well-characterized:

- **Training data averages**: Models converge on the statistical mean of all designs on the internet — which is mediocre. Every model produces the same "hero section, 3-card grid, footer" template.
- **No visual feedback**: Text-only models generate code but can't see what they've produced. They can't tell if 12px margin "feels right."
- **Token fabrication**: Without constraints, models invent plausible-looking design values that don't belong to any coherent system. This compounds across sessions.
- **Taste requires judgment, not knowledge**: Models *know* what good design looks like (it's in the training data) but can't *choose* which of many valid options creates the right emotional response for a specific context.

The benchmarks confirm this:
- **DesignBench**: Claude 3.7 Sonnet leads on CLIP scores (0.60-0.83) but UI issue detection accuracy is only **0.27 across all models** — they detect less than a third of rendering bugs
- **DesignProbe**: GPT-5 achieves 72.5% accuracy on aesthetic judgment, but localization of problems scores only **0.20 IoU** — models can say "this looks bad" but can't point to where
- **WiserUI-Bench**: Models show limited understanding of which UI actually drives more user actions — they optimize for visual plausibility, not outcomes
- **WebDev Arena**: Gemini 2.5 Pro leads on human preference (80K+ votes), but the gap between "functional" and "delightful" remains wide across all models

## Key Insight: Taste Is Not One Thing

The most important finding from studying elite design orgs is that "taste" decomposes into evaluable dimensions. Stripe's framework is the clearest:

| Dimension | What it measures | Automatable? |
|-----------|-----------------|--------------|
| **Utility** | Does it solve the user's problem? | Partially — requires understanding intent |
| **Usability** | Is it intuitive and comfortable? | Yes — heuristic evaluation, friction signals |
| **Craft** | Copy quality, motion, load time, transitions | Mostly — measurable properties |
| **Beauty** | Visual polish, aesthetic execution | Hardest — but decomposable further |

Beauty itself decomposes (per DesignProbe and NN/g research):
- **Typography**: hierarchy, legibility, pairing, rhythm
- **Layout**: balance, alignment, whitespace, layering
- **Color**: harmony, contrast, appeal, psychology
- **Visual hierarchy**: scale, weight, flow, gestalt grouping
- **Motion**: timing, easing, orchestration, restraint

**The strategic move**: Don't try to give LLMs holistic "taste." Instead, give them tools to evaluate each dimension independently, then compose the results.

## What Subtext Already Has

Subtext's existing toolkit is remarkably well-positioned for this:

### Strengths
- **Live browser with screenshots** — `live-view-screenshot` captures rendered state; `live-view-snapshot` gets the accessibility tree
- **Sightmap semantic mapping** — Components have meaningful names, source annotations, and memory entries
- **Session replay with diff** — `review-diff` shows exactly what changed between two timestamps
- **JavaScript evaluation** — `live-eval-script` can run arbitrary measurement code (getComputedStyle, getBoundingClientRect)
- **Network inspection** — Full request/response with sightmap overlay
- **Comment system** — Structured observations (bug/tweak/ask/looks-good) tied to timestamps and screenshots
- **Tunnel** — Real-time localhost access enables live design iteration loops
- **Multi-view support** — Can open tabs, navigate, resize viewports
- **UX review workflow** — Already detects friction signals (rage clicks, dead clicks, long pauses)
- **Visual verification skill** — Mandates screenshots after changes, checks theme/viewport variants

### Critical Gaps
1. **No CSS computed style inspection** — Can't programmatically read colors, fonts, spacing (workaround: `live-eval-script` + getComputedStyle)
2. **No element measurement** — Can't measure spacing, alignment, bounding boxes (workaround: `live-eval-script` + getBoundingClientRect)
3. **No before/after visual diff** — Can take two screenshots but no pixel-level comparison tool
4. **No full-page screenshots** — Only captures current viewport
5. **No accessibility audit** — No automated WCAG checking
6. **No design token extraction** — Can't pull CSS variables, color palette, spacing scale from a live page
7. **No component boundary visualization** — Can't overlay sightmap component bounds on screenshots

## What the Research Says Works

### 1. Visual Feedback Loops (Highest Leverage)

**ReLook** (Stanford, 2025) demonstrated a generate-diagnose-refine loop: generate code, render it, screenshot it, feed screenshots to a multimodal critic, refine. Result: **29% improvement** on ArtifactsBench. Even models trained with the loop but run *without* the critic still outperformed baselines — the model internalizes visual refinement.

**This is Subtext's wheelhouse.** The tools to build this loop already exist: `live-view-screenshot` + Claude's vision + `live-eval-script` for measurements + code editing. The missing piece is *orchestration* — a skill/workflow that drives the loop.

### 2. Design System Grounding (Most Reliable)

Hardik Pandya's four-layer architecture:
1. **Spec files** — Structured markdown docs of foundations, components, patterns
2. **Three-tier token layer** — Upstream tokens → project aliases → component usage (never raw values)
3. **Automated auditing** — CI scripts scan for hardcoded values and flag violations
4. **Drift detection** — Pins design system versions, flags upstream changes

Real test (Atlassian's Atlaskit): 64 spec files, 230+ tokens, reduced 418 hardcoded values to zero. "Your 10th AI session produces the same visual quality as your 1st."

**For Subtext**: Sightmap already maps components to semantic names. Extending it to include design tokens (colors, spacing, typography from the actual running app) would create a "design system ground truth" that an LLM can evaluate against.

### 3. Comparative Judgment (Most Accurate)

LLMs are significantly better at "A vs B" than absolute scoring. Pairwise comparison is structurally more reliable because:
- Many judge models are trained with Bradley-Terry loss (relative ranking)
- Humans are also better at relative judgment
- Design reviews at top companies work this way — present options, discuss tradeoffs

**For Subtext**: A "design tournament" workflow where the agent generates 2-3 variants, screenshots each, compares them against specific criteria, and advances the winner. Apple's 10-3-1 process, automated.

### 4. Domain-Specific Heuristics (Most Accurate for Critique)

**Baymard UX-Ray**: 207 curated ecommerce UX heuristics, **95% accuracy** vs. generic LLM prompting at 50-75%. The difference isn't the model — it's the evaluation criteria specificity.

**For Subtext**: Build heuristic libraries for specific domains (ecommerce, SaaS dashboards, marketing sites) that an LLM can evaluate against using live browser inspection.

### 5. Friction Logging (Most Actionable)

Stripe's quarterly "walk the store" process: cross-functional teams use the product end-to-end, logging every friction point across 15 essential user journeys. Scored on a 5-point color scale.

**For Subtext**: The UX review workflow already detects friction signals. Extending it to score journeys and produce structured friction logs would be a natural evolution.

## What Anthropic's Frontend-Design Skill Does

The skill encodes taste through:
- **Mandatory aesthetic direction** before code — choose from curated tones (brutally minimal, maximalist chaos, retro-futuristic, etc.)
- **Anti-pattern blacklist** — bans Inter/Roboto, purple gradients on white, predictable layouts
- **Five design dimensions** — typography (unexpected fonts), color (dominant + sharp accent), motion (orchestrated reveals), spatial composition (asymmetry, overlap), backgrounds (gradient meshes, noise textures)
- **Complexity matching** — maximalist designs need elaborate code, minimal needs precision
- **Novelty enforcement** — explicitly prohibits reusing patterns across projects

**What it gets right**: Forces intentionality. The "choose a bold direction" prompt prevents the model from defaulting to average.

**What it's missing**: No visual verification of its own output (relies on separate visual-verification skill), no design system grounding (generates from scratch each time), no comparative evaluation (generates one option), no measurement of the results.

## Experiment Plan

### Experiment 1: The Critique Loop

**Hypothesis**: An LLM that can see its own rendered output and measure specific properties will produce significantly better UI than single-shot generation.

**Setup**:
1. Pick a simple page to design (landing page, dashboard, settings screen)
2. Generate v1 with the frontend-design skill
3. Use Subtext live browser tools to:
   - Take a screenshot
   - Extract computed styles via `live-eval-script` (colors, fonts, spacing)
   - Measure alignment and spacing via getBoundingClientRect
   - Run basic contrast checks
4. Feed screenshot + measurements back to Claude with a structured critique prompt
5. Generate v2 based on critique
6. Repeat 2-3 times
7. Compare v1 vs v3 via pairwise judgment (separate Claude instance)

**What we're testing**: Does the loop improve quality? How many iterations help? Which measurements matter most?

**Tools needed**: All exist today — `live-view-screenshot`, `live-eval-script`, `live-connect`, tunnel.

### Experiment 2: Design Token Extraction & Enforcement

**Hypothesis**: Extracting a page's actual design tokens and feeding them back as constraints produces more consistent output than unconstrained generation.

**Setup**:
1. Connect to a well-designed site (Linear, Stripe, Vercel) via live browser
2. Use `live-eval-script` to extract:
   - All CSS custom properties (design tokens)
   - Computed color palette (unique colors on page)
   - Font families and size scale
   - Spacing values used
3. Format as a structured design system spec
4. Ask Claude to build a new page using *only* those extracted tokens
5. Compare output quality vs unconstrained generation

**What we're testing**: Can we auto-generate design system grounding from a live page? Does it constrain the model toward better output?

### Experiment 3: Pairwise Design Tournament

**Hypothesis**: Generating multiple options and comparing them produces better final output than single-shot generation, even controlling for total compute.

**Setup**:
1. Define a design brief (e.g., "pricing page for a developer tool")
2. Generate 4 variants with different aesthetic directions (from the frontend-design skill's tone palette)
3. Screenshot each via live browser
4. Run pairwise comparisons using a separate Claude instance as judge, evaluating:
   - Typography quality (hierarchy, legibility, pairing)
   - Color harmony (coherence, contrast, mood)
   - Layout balance (whitespace, alignment, flow)
   - Overall impression (would you trust this company?)
5. Advance the top 2, refine each, compare again
6. Compare final winner vs a single-shot design

**What we're testing**: Does Apple's 10-3-1 process work when automated? Is pairwise judgment reliable enough to pick winners?

### Experiment 4: Heuristic-Driven UX Review

**Hypothesis**: A structured heuristic evaluation using live browser inspection produces more actionable feedback than generic "review this page" prompting.

**Setup**:
1. Connect to a real site via tunnel
2. Run two review modes:
   - **Generic**: "Review this page for UX issues" with screenshot
   - **Structured**: Walk through specific heuristics with targeted measurements:
     - Contrast ratios (via `live-eval-script` computing luminance)
     - Touch target sizes (getBoundingClientRect on interactive elements)
     - Visual hierarchy (font sizes, weights, colors of headings vs body)
     - Consistency (same component rendered differently across pages)
     - Gestalt grouping (spacing between related vs unrelated elements)
3. Compare quantity, specificity, and actionability of findings
4. Validate a sample against manual expert review

**What we're testing**: Does measurement-backed heuristic evaluation outperform screenshot-only review? Which heuristics benefit most from live inspection?

### Experiment 5: Sightmap-Driven Design Audit

**Hypothesis**: Sightmap's component-to-source mapping enables a unique "design consistency audit" that no other tool offers.

**Setup**:
1. Set up sightmap for a multi-page app
2. Navigate to each view via live browser
3. For each sightmap component, extract rendered styles across all views where it appears:
   - Colors, fonts, spacing, sizing
   - Compare values across views
4. Flag inconsistencies: "NavBar uses `font-size: 14px` on HomePage but `font-size: 16px` on Dashboard"
5. Generate a consistency report with specific component × view × property deltas

**What we're testing**: Can sightmap + live inspection detect cross-page design inconsistencies that neither screenshots nor static analysis would catch?

## Proposed New Tools / Skills

Based on the research, these would be highest-leverage additions to Subtext:

### Near-term (could build as skills/eval-scripts today)

1. **`live-measure-element(uid)`** — Helper that runs getBoundingClientRect + getComputedStyle via `live-eval-script` and returns structured measurements (x, y, width, height, margin, padding, font-size, color, background-color, etc.)

2. **`live-extract-design-tokens()`** — Scans page for CSS custom properties + computes unique values for colors, fonts, spacing. Returns as structured design system spec.

3. **`live-check-contrast(uid)`** — Computes WCAG contrast ratio for an element's text color vs background. Returns pass/fail for AA and AAA.

4. **Design critique prompt template** — A structured prompt that takes screenshot + measurements and evaluates along Stripe's four dimensions (utility, usability, craft, beauty) with specific sub-criteria.

### Medium-term (would need server-side work)

5. **`live-view-screenshot(full_page: true)`** — Full-page capture via scrolling + stitching.

6. **`live-view-diff-visual(screenshot_a, screenshot_b)`** — Pixel-level visual diff highlighting changed regions.

7. **`live-audit-accessibility()`** — Runs axe-core or similar via eval-script and returns structured WCAG violations.

8. **`live-view-screenshot(show_component_bounds: true)`** — Overlays sightmap component boundaries on the screenshot.

### Longer-term (research direction)

9. **Design memory system** — Accumulate design observations across sessions (like MemPalace for application design). Track which design decisions worked, which were rejected, build a per-project taste profile.

10. **UX friction scoring** — Extend the UX review workflow with Stripe-style journey scoring (red/orange/yellow/lime/green) across defined user journeys.

11. **Automated design tournament** — 10-3-1 process: generate N variants, screenshot all, pairwise compare, refine winners, converge.

## Priority Ranking

By expected impact × feasibility:

1. **Experiment 1 (Critique Loop)** — Highest leverage, all tools exist today, directly tests whether Subtext can close the taste gap
2. **Experiment 4 (Heuristic Review)** — Validates whether measurement-backed critique is better, informs tool priorities
3. **Experiment 2 (Token Extraction)** — Tests auto-grounding approach, builds toward design consistency tools
4. **Experiment 5 (Sightmap Audit)** — Uniquely Subtext, no other tool can do this
5. **Experiment 3 (Tournament)** — Interesting but highest compute cost, run after validating that pairwise judgment works in Exp 4

## Key Research Sources

### Benchmarks & Papers
- **DesignBench** — Multi-framework MLLM benchmark, Claude leads CLIP scores
- **DesignProbe** — VLM aesthetic judgment, GPT-5 at 72.5% but 0.20 IoU localization
- **ReLook** — Vision-grounded RL with MLLM critic, 29% improvement via screenshot loops
- **UICrit** — 983 mobile screens, 3059 expert critiques, few-shot improves LLM critique 55%
- **WiserUI-Bench** — 300 A/B test pairs, models can't predict behavioral impact
- **MLLM as UI Judge** — Models approximate human preference but diverge on emotion

### Products & Tools
- **Baymard UX-Ray** — 207 heuristics, 95% accuracy (vs 50-75% generic LLM)
- **Applitools Eyes** — Figma-to-production visual comparison
- **v0 / Lovable / Bolt** — AI app builders (functional, not beautiful)
- **Google Stitch** — Gemini-powered design tool (multi-screen, prototyping)
- **Motion AI Kit** — Open-source animation skills for LLMs
- **Chrome DevTools MCP** — Google's browser inspection for AI agents

### Design Practice
- **Apple 10-3-1** — Generate 10 options, narrow to 3, converge on 1
- **Stripe Quality Rubric** — Utility/Usability/Craft/Beauty, 5-point color scale, 15 journeys
- **Linear** — Quality as first principle, design for someone specific
- **Pandya's Design System Architecture** — 4-layer approach, 64 spec files, zero hardcoded values

### Frameworks
- **NN/g 5 Principles** — Scale, hierarchy, balance, contrast, gestalt
- **Norman's 3 Levels** — Visceral, behavioral, reflective
- **Nielsen's 10 Heuristics** — 82-85% LLM detection agreement, but severity judgment unreliable
- **Designlab 10-Point Checklist** — Practical decomposition for critique
