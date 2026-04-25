# Subtext Sandbox

Test a fresh install of Claude Code with the Subtext plugin against a React demo app, all in an isolated container. Every run starts from a clean environment — no cached state carries over.

## What's inside the container

- **Vite + React + TypeScript** demo app (pre-built, copied from `demo-store/`)
- **Claude Code** with the Subtext plugin loaded via `--plugin-dir`
- **FullStory auth** via API key (no OAuth browser flow)

The entrypoint starts the Vite dev server on port 5173, waits for it to be ready, then launches Claude Code.

## Prerequisites

- Docker Engine + Compose plugin
- An Anthropic API key
- A FullStory API key (used instead of OAuth because containers don't have browsers)
- For `local` mode: your subtext repo at `~/src/subtext`

## Setup

```bash
# Create .env from the template
cp .env.example .env
# Edit .env and fill in both keys:
#   ANTHROPIC_API_KEY=sk-ant-...
#   FULLSTORY_API_KEY=...
```

Or export them directly:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export FULLSTORY_API_KEY=...
```

## Running

```bash
chmod +x run.sh

# Use your local subtext plugin from ~/src/subtext
./run.sh local

# Use the prod subtext plugin (cloned from GitHub)
./run.sh prod
```

The script automatically:
1. Resolves the plugin source (local path or fresh clone from GitHub)
2. Rebuilds the Docker image from scratch (`--no-cache`)
3. Starts the Vite dev server inside the container
4. Launches Claude Code with the plugin pre-installed and authenticated

## Eval mode (non-interactive)

The container has a second mode used by the skill-eval harness (`tools/skill-eval/bin/eval-sandboxed`). When the entrypoint sees a non-empty `EVAL_QUERY` environment variable, it skips the Vite dev server and the interactive Claude shell and instead runs `claude -p` once with the query, streaming `stream-json` events to stdout.

The contract between the harness (Python, on the host) and the entrypoint (bash, in the container) is four env vars:

| Env var | Required | Purpose |
|---|---|---|
| `EVAL_QUERY` | yes (in eval mode) | The user message sent to `claude -p`. Presence of this var is what selects eval mode. |
| `EVAL_CLEAN_NAME` | yes | The skill basename (e.g., `proof`) — used by the harness's trigger detector to recognize when Claude invokes the skill. |
| `EVAL_DESCRIPTION` | yes | The frontmatter `description:` value to stage on the skill before `claude -p` runs. Allows the harness to test alternative descriptions without rewriting `SKILL.md` on disk. |
| `EVAL_MODEL` | no | Claude model to dispatch against (e.g., `claude-sonnet-4-6`). When unset, `claude -p` picks its default. |
| `ANTHROPIC_API_KEY` | yes | Forwarded into `claude -p`. `FULLSTORY_API_KEY` is **not** required in eval mode — the entrypoint deletes `/workspace/.mcp.json` before the run, so MCP servers are never contacted. |

The harness is the only consumer of this mode. See `tools/skill-eval/lib/sandbox_runner.py` for the producer side and `entrypoint.sh` (the `if [ -n "$EVAL_QUERY" ]` branch) for the consumer.

The eval mode is exercised via two distinct images, both built by `tools/skill-eval/sandbox/build.sh --config <name>`:

| Image tag | Plugin set | Built from |
|---|---|---|
| `subtext-sandbox-claude` (config `subtext-only`) | Subtext only | `Dockerfile` |
| `subtext-sandbox-superpowers` (config `subtext-plus-superpowers`) | Subtext + Superpowers | `Dockerfile.superpowers` (extends the base) |

## How it works

### Startup sequence

1. `entrypoint.sh` resolves the plugin — either the mounted local volume or a fresh clone from GitHub
2. Starts `npm run dev` (Vite) in the background on port 5173
3. Waits up to 30 seconds for the dev server to respond
4. Launches `claude --plugin-dir /opt/subtext` with any extra args you pass

### Plugin loading

There is no `claude plugin add` for local directories. The `--plugin-dir` flag loads a plugin from a local path at runtime.

### Authentication (no OAuth)

OAuth requires a browser redirect to a localhost callback, which doesn't work inside a container. Instead, the container uses a **static API key** via Claude Code's `headersHelper` mechanism:

1. The Dockerfile writes a `.mcp.json` into the workspace that configures each HTTP MCP server with a `headersHelper` pointing to `/usr/local/bin/mcp-auth-helper.sh`
2. The helper script reads `FULLSTORY_API_KEY` from the environment and returns it as a `Basic` auth header
3. The env var is passed into the container via `docker-compose.yml` from your `.env` file
4. Claude Code calls the helper at connection time — no browser, no OAuth, no keychain
