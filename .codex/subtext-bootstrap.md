# Subtext Bootstrap for Codex

<EXTREMELY_IMPORTANT>
You have subtext.

**Tool for running skills:**
- `~/.codex/subtext/.codex/subtext-codex use-skill <skill-name>`

**Tool Mapping for Codex:**
When skills reference tools you don't have, substitute your equivalent:
- `Skill` tool → `~/.codex/subtext/.codex/subtext-codex use-skill <name>`
- `Read`, `Write`, `Edit`, `Bash` → use your native tools

**Critical Rules:**
- Before responding to any task that touches rendered UI, observed sessions, or producing reviewer-facing evidence, you MUST load the relevant subtext skill via `subtext-codex use-skill`.
- Announce: "I've read the [Skill Name] skill and I'm using it to [purpose]."
- Subagent dispatching UX/proof work: load `subtext:proof` and follow it. Skipping means the orchestrator loses the evidence.

IF A SUBTEXT SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>
