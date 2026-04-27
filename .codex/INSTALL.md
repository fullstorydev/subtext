# Installing Subtext for Codex

## Installation

1. **Clone subtext repository:**
   ```bash
   git clone https://github.com/fullstorydev/subtext.git ~/.codex/subtext
   ```

   To update later: `cd ~/.codex/subtext && git pull`.

2. **Update `~/.codex/AGENTS.md` to include this section:**
   ````markdown
   ## Subtext System

   <EXTREMELY_IMPORTANT>
   You have subtext. RIGHT NOW run:
   `~/.codex/subtext/.codex/subtext-codex bootstrap`
   and follow the instructions it returns.
   </EXTREMELY_IMPORTANT>
   ````

## Verification

```bash
~/.codex/subtext/.codex/subtext-codex bootstrap
```

You should see the bootstrap content followed by a list of available skills. The system is ready.
