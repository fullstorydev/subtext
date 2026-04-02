---
name: subtext:setup-snippet
description: Install the Subtext capture snippet into the user's application. Detects framework and uses the appropriate integration pattern. Supports web frameworks and React Native.
metadata:
  platform: claude-code
  requires:
    skills: ["subtext:shared"]
---

# Setup Snippet

Install the Subtext capture snippet into the user's application.

## Language

Always refer to this as the "Subtext snippet" or "capture snippet" in user-facing messages — not the "Fullstory snippet." Fullstory is the underlying technology, but the user is setting up Subtext.

## Pre-check

Determine whether the **capture snippet** is actually installed. The snippet is the code that loads and initializes session capture — not helper utilities, type declarations, or UI text that mentions "Fullstory".

**Run these checks in order. Stop at the first positive match.**

1. **Package dependencies (highest confidence):** Read `package.json` — look for `@fullstory/browser`, `@fullstory/react-native`, or `@fullstory/snippet` in `dependencies` or `devDependencies`. This is the most reliable signal.
2. **Script tag in HTML entry point:** Search ONLY `index.html` (or framework equivalent like `app/layout.tsx`, `pages/_document.tsx`) for the literal strings `fullstory.com/s/fs.js` or `_fs_script`. Do not search other files.
3. **SDK initialization call:** Grep for the pattern `init\(\s*\{\s*orgId` or `window\['_fs_org'\]\s*=` or `window\._fs_org\s*=` in `.ts`, `.tsx`, `.js`, `.jsx` files (exclude `node_modules`, test files, and `*.d.ts`). The `init()` function comes from the `@fullstory/browser` NPM package v2: `import { init } from '@fullstory/browser'`.

**IMPORTANT — These are NOT the snippet and MUST be ignored:**
- URLs containing "fullstory.com" (e.g., `https://subtext.fullstory.com`, `https://www.fullstory.com`)
- Footer links, marketing copy, or any UI text mentioning "Fullstory"
- String literals in console.log, comments, or documentation
- Type declarations (`declare global { interface Window { FS?: ... } }`)
- Helper functions that call `window.FS(...)` — these consume the snippet but are not the snippet
- Event listeners for Fullstory events (e.g., `fullstory:dataLayerChange`)
- Import of utility modules that wrap Fullstory calls (e.g., `import { waitForSession } from '@/lib/playground/fullstory'`)

**Do NOT use a broad grep for "fullstory" or "Fullstory" — this produces false positives from marketing copy, URLs, and helper code.** Only search for the exact patterns listed above.

If a genuine snippet is found, report "Subtext snippet already installed" with the exact file and line, and exit.

## Framework Detection

Read `package.json` and project structure to detect the framework:

| Signal | Framework | Integration file |
|--------|-----------|-----------------|
| `next` in dependencies | Next.js | `app/layout.tsx` or `pages/_document.tsx` (detect app vs pages router) |
| `@remix-run` in dependencies | Remix | `app/root.tsx` |
| `vite` in devDependencies | Vite | `index.html` |
| `react-scripts` in dependencies | Create React App | `public/index.html` |
| `react-native` in dependencies | React Native | New file or existing config |
| None of the above | Plain HTML | `index.html` or primary HTML file (search for `<head>` tags if not found) |

## Install Flow

1. **Show the user** which framework was detected and which file will be modified
2. **Show the snippet** that will be inserted (framework-specific pattern)
3. **Wait for confirmation** before making changes
4. **Insert the snippet** into the correct location
5. **Verify** the snippet is syntactically correct in context (no broken imports, valid JSX, etc.)

## Resolve Org ID

Ask the user for their Fullstory org ID.

## The Snippet

Fetch the latest snippet from the Fullstory API — do NOT hardcode the snippet content.

Run:
```bash
curl -s "https://api.fullstory.com/code/v2/snippet?Type=CORE&Org=${ORG_ID}"
```

Where `ORG_ID` is the org ID resolved from the `/me` endpoint above. The response contains the current production snippet ready to insert.

If the API call fails, fall back to asking the user to provide their snippet from the Fullstory settings page.

## Framework Patterns

### Next.js (App Router)
Add the snippet to `app/layout.tsx` inside `<head>` or as a `<Script>` component with `dangerouslySetInnerHTML`.

### Next.js (Pages Router)
Add to `pages/_document.tsx` inside `<Head>`.

### Remix
Add to `app/root.tsx` inside the `<head>` section of the root layout.

### Vite / CRA / Plain HTML
Add the `<script>` tag to `index.html` inside `<head>`.

### React Native
Install `@fullstory/react-native` package and add initialization to app entry point.

### No framework / no index.html
If no framework is detected and no `index.html` exists, search the project for files containing `<head>` tags (`.html`, `.tsx`, `.jsx` files). If found, present the candidates to the user and ask which file to use. If nothing is found, ask the user where their HTML entry point lives.

## Explain

After installation:
- "The Subtext snippet is now installed and will record user sessions in your app."
- "Sessions capture DOM snapshots, clicks, scrolls, network requests, and console output."
- "Next, we'll capture your first session so you can see Subtext in action."
