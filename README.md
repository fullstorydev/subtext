# Subtext, by Fullstory

**Session replay, built for agents.** Subtext is agentic session review: it captures production sessions of your app and connects them to your coding agent — Claude Code, Cursor, Codex, or Gemini CLI — so it can review what real users did, reproduce reported bugs, verify its own UI changes, and manage capture privacy rules, all without leaving the terminal.

## Get started

The fastest way in is the [setup wizard](https://github.com/fullstorydev/subtext-wizard). Run it in your project directory:

```sh
npx @subtextdev/subtext-wizard
```

One command handles the whole setup: it logs you in, fetches your org's capture snippet, asks which analytics tools you use, then hands the install off to your own coding agent — which wires up the capture snippet, MCP server, skills, and commands for you. Takes a few minutes.

**Requires a free Subtext account — no credit card.** Subtext is a hosted service that records and stores your app's sessions. Your account is where they live, and where your agent reads them back through the MCP server. The wizard handles it. When it opens the login page, create an account in one click with Google, then come back to finish.

_EU data region? Run `npx @subtextdev/subtext-wizard --region eu`._

## What you get

Once setup is done, your agent has these tools:

- **Session review** — point your agent at a recorded session and it walks through what happened: the flow the user took, console errors, network activity, and where things broke. Great for debugging user-reported issues or confirming a fix landed in the real UI.
- **Privacy rules** — detect PII in captured sessions and manage element-block, URL, and network capture rules directly from your agent.

Driving a *live* browser and capturing before/after proof of code changes live in the companion **[Subtext Verify](https://github.com/fullstorydev/subtext-verify)** plugin.

## Set up manually

Prefer to wire things up yourself? The wizard just automates the steps below — you can do them by hand instead.

**1. Install the plugin**

**Claude Code**
```
/plugin marketplace add fullstorydev/subtext
/plugin install subtext@subtext-marketplace
```

**Cursor** — install from the Marketplace panel (or a Team Marketplace that imports this repo).

**Codex** — open `/plugins`, install **subtext** from the repo marketplace.

**Gemini CLI**
```
gemini extensions install https://github.com/fullstorydev/subtext
```

**Manual / openskills**
```
npx openskills install fullstorydev/subtext
```
…then add the `subtext` MCP server (below) to your agent's MCP configuration.

**2. Connect the MCP server**

The `subtext` server runs at `https://api.fullstory.com/mcp/subtext` (EU1 mirror: `https://api.eu1.fullstory.com/mcp/subtext`). It's HTTP only — no local process required.

**3. Add the capture snippet to your app**

Install the Fullstory capture snippet for your org so sessions are recorded. The wizard does this for you against your org's snippet; to do it by hand, grab your snippet from your Fullstory settings.

## Notes

- All tools are read-only analysis **except** `privacy-create` / `privacy-promote` / `privacy-delete` / `privacy-url-create` / `privacy-network-create`, which modify org privacy rules.
- This plugin bundles the **skills** `subtext-review` (structured session summaries), `subtext-session` (the `review-*` tool catalog), `subtext-privacy` (PII detection + element-block/URL/network privacy rules), and `subtext-telemetry` (workflow milestone logging), plus `subtext-shared` and `subtext-using-subtext`.
