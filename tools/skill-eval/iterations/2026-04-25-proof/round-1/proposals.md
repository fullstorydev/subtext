# Round 1 Variant Proposals

**Date:** 2026-04-25
**Proposer:** subagent (Sonnet 4.6) given only `skill-input.md` body — no eval queries, no baseline numbers.
**Constraints applied:** ≤30 words, MUST-style imperative, no trigger-artifact enumeration, no reference to user queries.

### Variant 1

**Description:** You MUST use this skill when making any code change that affects what a user sees on screen. Establishes a before/after visual evidence trail and drives browser verification.

**Hypothesis:** This variant anchors invocation on the *outcome condition* — "affects what a user sees" — rather than file type or task label. The SKILL.md itself uses this exact phrase as its core gate, so matching that language should align the loader's routing with the skill's own decision logic. Axis: broad scope + outcome framing.

**Risk:** "Affects what a user sees" is subjective enough that the model may invoke this on backend changes that incidentally touch a shared utility — under-triggers on pure refactors that happen to live in `.tsx` files are also possible if the model decides no UI change is visible.

**Word count:** 28

---

### Variant 2

**Description:** Use this skill when implementing or fixing UI code. It owns browser-connected verification throughout the task and must not be deferred until the change is complete.

**Hypothesis:** This variant explicitly addresses mid-flow ownership — the phrase "must not be deferred" targets the failure mode where the model finishes editing and only then tries to verify. The SKILL.md's loop is designed to interleave editing and verification, so signaling that the skill runs *during* the task, not after, should improve routing fidelity. Axis: timing of invocation within a task.

**Risk:** "UI code" is narrower than the SKILL.md's actual trigger set, which includes `.html`, `.ejs`, and template files that a model might not classify as UI code — could under-trigger on templating or server-rendered markup changes.

**Word count:** 26

---

### Variant 3

**Description:** When another skill or task hands you a visual change, you MUST invoke this skill. It owns live browser state and verification so callers don't have to.

**Hypothesis:** This variant shifts the axis to *composition* — positioning the skill as a downstream receiver invoked by other skills, matching the "Triggers from" and "Composition" sections of the SKILL.md. Framing it as a service that absorbs browser and session management targets the case where a higher-level agent delegates UI work. Axis: inter-skill invocation and delegation.

**Risk:** "Visual change" may cause the loader to skip invocation when a task is framed as a bug fix or refactor rather than an explicit visual change, even when the modified files clearly affect rendering.

**Word count:** 27

---

## Proposer process notes

- Initial dispatch: V1 28 words ✓, V2 26 words ✓, V3 33 words ❌ (over the 30-word cap). The proposer's own self-reported counts in its first reply were inaccurate (it claimed 26 for V1 and 27 for V2); independent recount has the correct numbers.
- Revision: V3 was sent back to the proposer with instructions to revise word count only, preserving the composition axis. Revised V3 came back at 27 words.
- All three axes are distinct: outcome scope (V1), invocation timing (V2), inter-skill delegation (V3).
- No trigger-artifact lists in any variant.
- No specific user queries, eval-set entries, or baseline numbers were provided to the proposer.
