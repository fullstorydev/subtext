# Changesets

This directory holds [changeset](https://github.com/changesets/changesets) files
— per-change descriptions that drive the automated version bump workflow.

## Workflow

1. **You open a PR.** If the change is user-facing (anything that should appear
   in the changelog or trigger a version bump), run:

   ```sh
   npm run changeset
   ```

   Pick `patch` / `minor` / `major`, write a short summary, and commit the
   resulting `.changeset/*.md` file with your PR.

2. **PR merges to `main`.** The `Release` workflow (`.github/workflows/release.yml`)
   notices the pending changesets and opens a "Version Packages" PR that:
   - Runs `changeset version` to bump `package.json`.
   - Runs `scripts/sync-manifest-versions.mjs` to sync the new version into
     `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`,
     `.codex-plugin/plugin.json`, and `.cursor-plugin/plugin.json`.
   - Updates `CHANGELOG.md`.

3. **You merge the Version Packages PR.** The workflow then runs
   `changeset tag` to push a git tag and create a GitHub release for the
   new version. Nothing is published to npm.

## Skipping the changeset

Pure infra / refactor / docs changes that should not appear in the changelog
don't need a changeset. Open the PR without one — the release workflow will
ignore it.
