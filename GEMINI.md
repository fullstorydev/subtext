# Subtext

This extension connects **Gemini CLI** to Subtext — tools that let coding agents verify and show their work against your running application (screenshots, viewer URLs, network traces, comments).

## Access

- Subtext requires an [account](https://subtext.fullstory.com) to be enrolled for MCP tool access. Contact subtext@fullstory.com if you have questions.
- Authentication is **OAuth** (or API key). On first MCP use, the client should open a browser to authorize with Fullstory.
- Two regional MCP servers: `subtext` (US) and `subtext-eu1` (EU). Use whichever matches your Fullstory account region.

## Bundled capabilities

Skills under `skills/` are auto-discovered by Gemini CLI. Start with [`using-subtext`](skills/using-subtext/SKILL.md), which routes you to the right workflow:

- `proof` — capture before/after evidence while implementing UI changes
- `review` — summarize a recorded session
- `live` — drive a hosted browser
- `onboard` — first-run walkthrough
- `sightmap` — define semantic component naming
- plus tool-catalog atomics (`session`, `comments`, `tunnel`, `shared`) and the `recipe-sightmap-setup` recipe

MCP servers: `subtext` / `subtext-eu1` (review, live, comments) and `subtext-tunnel` (local dev tunnel client, run via `npx`).

For product workflows and examples, see the [Subtext docs](https://subtext.fullstory.com/).
