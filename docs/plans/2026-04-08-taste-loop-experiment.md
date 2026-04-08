# Taste Loop: Experiment Design

**Date**: 2026-04-08
**Subject**: story-arc (React Native / Expo / NativeWind)
**Goal**: Build and test an autoresearch-style improvement loop for UI/UX quality using Subtext's browser tools and LLM-as-judge evaluation.

---

## The Autoresearch Pattern, Adapted

Karpathy's autoresearch works because of three properties:
1. **One metric** (val_bpb) — unambiguous, deterministic
2. **Immutable evaluator** — the agent can't game its own scoring
3. **Binary gate** — keep if better, discard if worse

For UI/UX taste, we don't have val_bpb. But the architectural insight transfers: **separate the improver from the judge, and make the judge immutable.**

### Our Adaptation

```
┌─────────────────────────────────────────────────┐
│                  TASTE LOOP                      │
│                                                  │
│  1. BASELINE                                     │
│     └─ Screenshot + measure current state        │
│     └─ Judge scores baseline (rubric → scores)   │
│                                                  │
│  2. PROPOSE                                      │
│     └─ Improver agent analyzes scores + screenshot│
│     └─ Proposes a targeted change (one dimension)│
│     └─ Edits code (git commit)                   │
│                                                  │
│  3. RENDER                                       │
│     └─ Hot reload / rebuild                      │
│     └─ Screenshot + measure new state            │
│                                                  │
│  4. JUDGE                                        │
│     └─ Same immutable rubric + judge prompt       │
│     └─ Pairwise comparison: is v(n+1) > v(n)?   │
│     └─ Per-dimension scores                      │
│                                                  │
│  5. GATE                                         │
│     └─ If better: keep commit, update baseline   │
│     └─ If worse: git reset, try different change │
│     └─ Log result to results.tsv                 │
│                                                  │
│  6. REPEAT                                       │
└─────────────────────────────────────────────────┘
```

**Critical constraint**: The judge prompt, rubric, and measurement scripts are immutable during a run. The improver agent cannot modify them. This prevents the optimization from gaming its own evaluation — "the alignment problem in miniature."

---

## The Judge: Rubric Design

We use a multi-dimensional rubric inspired by Stripe's framework, DesignProbe's categories, and NN/g principles. Each dimension gets:
- A **pairwise comparison** (A vs B — which is better on this dimension?)
- A **1-5 absolute score** (for tracking progress over time)
- A **text rationale** (forces the judge to reason, which improves alignment per research)

### Dimensions

| # | Dimension | What it measures | Measurement inputs |
|---|-----------|-----------------|-------------------|
| 1 | **Typography** | Hierarchy, legibility, pairing, rhythm, size scale | Screenshot + computed font styles |
| 2 | **Color & Contrast** | Harmony, palette coherence, WCAG contrast ratios, mood | Screenshot + extracted color values |
| 3 | **Layout & Spacing** | Balance, alignment, whitespace, density, grid consistency | Screenshot + bounding box measurements |
| 4 | **Visual Hierarchy** | Information priority, eye flow, emphasis on primary actions | Screenshot |
| 5 | **Component Craft** | Border radius consistency, shadow usage, interactive state clarity | Screenshot + computed styles |
| 6 | **Consistency** | Same component looks the same across views, token adherence | Multi-page screenshots |
| 7 | **Overall Impression** | "Would you trust this product?" — gestalt quality, professionalism | Screenshot only (pure vibes) |

### Composite Score

Weighted average: Typography (15%) + Color (15%) + Layout (20%) + Hierarchy (15%) + Craft (10%) + Consistency (10%) + Impression (15%) = **Taste Score (1-5)**

The weights can be tuned, but layout gets the most because it's the most impactful and most measurable.

### Pairwise Override

Even with absolute scores, the **pairwise comparison is the primary gate**. Research shows LLMs are more reliable at "A vs B" than absolute scoring. The absolute scores are for tracking trends, not for the keep/discard decision.

The judge sees:
1. Screenshot A (before) + measurements A
2. Screenshot B (after) + measurements B
3. The specific change description
4. The rubric

And answers: "Is B better than A? On which dimensions did it improve? On which did it regress?"

---

## Measurement Scripts (Immutable)

These run via `live-eval-script` against the rendered page. They extract objective data that supplements the judge's visual assessment.

### measure-typography.js
```javascript
// Extract all visible text elements' computed typography
(() => {
  const elements = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,td,th');
  const styles = new Set();
  const fonts = new Set();
  for (const el of elements) {
    if (el.offsetParent === null) continue; // skip hidden
    const cs = getComputedStyle(el);
    fonts.add(cs.fontFamily);
    styles.add(`${cs.fontSize}/${cs.lineHeight} ${cs.fontWeight} ${cs.fontFamily.split(',')[0].trim()}`);
  }
  return JSON.stringify({
    uniqueFonts: [...fonts],
    uniqueStyles: [...styles],
    styleCount: styles.size,
    fontCount: fonts.size
  });
})()
```

### measure-colors.js
```javascript
// Extract color palette from visible elements
(() => {
  const colors = { text: new Set(), bg: new Set(), border: new Set() };
  const els = document.querySelectorAll('*');
  for (const el of els) {
    if (el.offsetParent === null) continue;
    const cs = getComputedStyle(el);
    if (cs.color !== 'rgba(0, 0, 0, 0)') colors.text.add(cs.color);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') colors.bg.add(cs.backgroundColor);
    if (cs.borderColor !== 'rgba(0, 0, 0, 0)' && cs.borderWidth !== '0px') colors.border.add(cs.borderColor);
  }
  return JSON.stringify({
    textColors: [...colors.text].length,
    bgColors: [...colors.bg].length,
    borderColors: [...colors.border].length,
    uniqueTextColors: [...colors.text].slice(0, 20),
    uniqueBgColors: [...colors.bg].slice(0, 20)
  });
})()
```

### measure-spacing.js
```javascript
// Measure spacing consistency
(() => {
  const gaps = new Map();
  const paddings = new Map();
  const els = document.querySelectorAll('div, section, main, aside, article, ul, ol, nav, header, footer');
  for (const el of els) {
    if (el.offsetParent === null) continue;
    const cs = getComputedStyle(el);
    const gap = cs.gap || cs.rowGap;
    if (gap && gap !== 'normal') gaps.set(gap, (gaps.get(gap) || 0) + 1);
    const p = `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`;
    if (p !== '0px 0px 0px 0px') paddings.set(p, (paddings.get(p) || 0) + 1);
  }
  return JSON.stringify({
    uniqueGaps: Object.fromEntries([...gaps].sort((a,b) => b[1]-a[1]).slice(0, 15)),
    uniquePaddings: Object.fromEntries([...paddings].sort((a,b) => b[1]-a[1]).slice(0, 15)),
    gapVariety: gaps.size,
    paddingVariety: paddings.size
  });
})()
```

### measure-contrast.js
```javascript
// Check WCAG contrast ratios on text elements
(() => {
  function luminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }
  function parseColor(c) {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function contrastRatio(fg, bg) {
    const l1 = luminance(...fg), l2 = luminance(...bg);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }
  const violations = [];
  const els = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li');
  for (const el of els) {
    if (el.offsetParent === null || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    const bg = parseColor(cs.backgroundColor);
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg, bg);
    const fontSize = parseFloat(cs.fontSize);
    const isBold = parseInt(cs.fontWeight) >= 700;
    const aaThreshold = (fontSize >= 18 || (fontSize >= 14 && isBold)) ? 3 : 4.5;
    if (ratio < aaThreshold) {
      violations.push({
        text: el.textContent.trim().slice(0, 40),
        ratio: Math.round(ratio * 100) / 100,
        required: aaThreshold,
        tag: el.tagName.toLowerCase()
      });
    }
  }
  return JSON.stringify({ violations: violations.slice(0, 20), totalChecked: els.length, violationCount: violations.length });
})()
```

---

## Story-Arc as Test Subject

### Why it's a good candidate
- Real app with real functionality (not a toy)
- React Native + NativeWind (Tailwind) — well-structured styling that's easy to modify
- Has design tokens in global.css (CSS custom properties)
- Desktop web view accessible via browser (Expo web export)
- Current design is functional but explicitly described as "rough"
- Has both mobile and desktop layouts to test

### Current design profile
- **Minimal monochrome** — black primary, off-white bg, white cards
- **No shadows, no borders on cards** — very flat
- **16px radius everywhere** — uniform but potentially monotonous
- **Limited typography scale** — text-xs, text-sm, text-base, text-xl, text-2xl
- **No motion/animation** — static UI
- **Sparse visual hierarchy** — most elements have similar visual weight

### Screens to evaluate
1. **Arc List** (home) — the most visible screen, card-based layout
2. **Branch Workspace** (desktop) — the primary work surface, complex layout
3. **Profile** — form-based screen, simpler

### Setup
1. Run story-arc locally: `npx expo start --web`
2. Connect via Subtext tunnel: `live-connect` → tunnel to localhost
3. Take baseline screenshots + measurements
4. Run judge for baseline scores
5. Begin improvement loop

---

## The Improver Agent

The improver is a separate agent (or separate Claude invocation) that:

1. Receives: current screenshot, measurement data, judge scores with rationale, the rubric
2. Picks **one dimension** to improve (the lowest-scoring or most impactful)
3. Proposes a **specific, targeted change** (e.g., "increase heading font weight to establish stronger visual hierarchy on Arc List")
4. Edits the relevant source files (NativeWind classes, global.css tokens, component code)
5. Commits the change with a descriptive message
6. Does NOT see or modify the judge prompt or measurement scripts

### Improver constraints
- One change per iteration (atomic improvements, easy to evaluate)
- Must describe the change and its intended effect before making it
- Cannot modify global.css token values AND component classes in the same iteration (isolate token changes from layout changes)
- Should reference the judge's rationale to target specific weaknesses

---

## Results Tracking

Like autoresearch's `results.tsv`:

```
iteration | commit    | status  | taste_score | typo | color | layout | hierarchy | craft | consistency | impression | change_description
0         | abc1234   | baseline| 2.4         | 2    | 3     | 2      | 2         | 3     | 3           | 2          | Initial state
1         | def5678   | keep    | 2.8         | 3    | 3     | 3      | 2         | 3     | 3           | 3          | Added font weight hierarchy to headings
2         | ghi9012   | discard | 2.3         | 3    | 2     | 3      | 2         | 3     | 2           | 2          | Changed to warm color palette (judge: broke consistency)
3         | jkl3456   | keep    | 3.1         | 3    | 3     | 3      | 3         | 3     | 3           | 3          | Added subtle card shadows for depth
...
```

### Success criteria
- **Minimum**: Taste score improves from baseline by ≥1 point after 10 iterations
- **Target**: Taste score reaches 4.0+ (good-not-great)
- **Stretch**: Qualitative improvement that a human designer would agree is significantly better

---

## Where Results Encode Into Subtext

### Immediate (this experiment)
- **Measurement scripts** → candidate for bundling as a Subtext skill helper (like collect_and_upload_sightmap.py)
- **Judge rubric** → candidate for a `subtext:design-critique` skill
- **The loop orchestration** → candidate for a `subtext:taste-loop` skill

### Near-term (if experiment succeeds)
- **`live-measure-element`** — new MCP tool wrapping the measurement scripts
- **`live-audit-design`** — new MCP tool that runs all measurements and returns structured report
- **Design token extraction** → extend sightmap to include design tokens, not just component selectors

### Medium-term
- **GIF/video capture** — record interaction sequences for evaluating motion and transitions (requires server-side work, but the tunnel + live-act-* sequence could drive it with local screen recording)
- **Interoperability with frontend-design skill** — our critique loop could run as a post-generation step: frontend-design generates → Subtext's taste-loop evaluates and iterates

### Longer-term
- **Design memory** — accumulate per-project taste profiles across sessions (extends the MemPalace concept from the earlier research)
- **Comparative design database** — screenshot + score pairs that serve as few-shot examples for the judge (UICrit showed 55% improvement with targeted few-shot)

---

## Running the Experiment

### Phase 1: Manual loop (today)
Run the loop manually to validate the approach:
1. Start story-arc web locally
2. Connect via Subtext
3. Screenshot + measure baseline
4. Write judge prompt, score baseline
5. Make one improvement, screenshot, re-score
6. Repeat 5-10 times, track results
7. Evaluate: did scores track with perceived quality?

### Phase 2: Semi-automated loop
Script the measurement and scoring steps:
1. Measurement scripts run automatically via `live-eval-script`
2. Judge scoring runs as a separate Claude invocation with fixed prompt
3. Human reviews keep/discard decisions
4. Track in results.tsv

### Phase 3: Fully automated loop
If Phase 2 validates the approach:
1. Orchestration skill drives the full loop
2. Improver and judge are separate agents
3. Human checkpoints every N iterations (not every one)
4. Results logged, git history preserved

### Phase 4: Encode into Subtext
Package validated components as:
1. Measurement scripts → plugin scripts
2. Judge rubric → skill
3. Loop orchestration → skill
4. New tool proposals → Subtext MCP feature requests with evidence
