# Installing Subtext for Codex

Codex discovers skills natively from `~/.agents/skills/`. Install Subtext
by cloning the repo and creating a single symlink — no AGENTS.md edits, no
bootstrap CLI.

## Prerequisites

- OpenAI Codex CLI
- Git

## Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/fullstorydev/subtext.git ~/.codex/subtext
   ```

2. **Create the skills symlink:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/subtext/skills ~/.agents/skills/subtext
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\subtext" "$env:USERPROFILE\.codex\subtext\skills"
   ```

3. **Restart Codex** to discover the skills.

## Verify

```bash
ls -la ~/.agents/skills/subtext
```

You should see a symlink pointing to your subtext clone's `skills/` directory.

## Updating

```bash
cd ~/.codex/subtext && git pull
```

Skills update instantly through the symlink.

## Uninstalling

```bash
rm ~/.agents/skills/subtext
```

Optionally delete the clone: `rm -rf ~/.codex/subtext`.
