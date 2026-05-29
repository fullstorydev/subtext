# Releasing the Subtext CLI

## Prerequisites

- Write access to this repo (`fullstorydev/subtext`).
- (First release only) `@subtextdev` npm scope access and a Trusted Publisher configured on npmjs.com (see below).

## Release process

### 1. Decide on the version

We use `cli/vX.Y.Z` tags for CLI releases (separate from the npm `v*` tags used by the agent plugin). The `cli/v` prefix lets `go install` resolve the module via the Go module proxy. The CLI version lives only in the git tag — there is no version file to update.

### 2. Update the npm wrapper version

The npm package version must be bumped manually before tagging so that `npm publish` picks up the right version and `install.js` points at the correct release download URL. The release workflow will fail the validation step if the tag and `package.json` version disagree.

```bash
# In cli/npm/package.json, bump "version" to match your tag (without the "cli/v" prefix)
# e.g. if you're tagging cli/v0.2.0, set "version": "0.2.0"
```

Commit:

```bash
git add cli/npm/package.json
git commit -m "cli: bump npm version to 0.2.0"
git push
```

### 3. Tag and push

```bash
git tag cli/v0.2.0
git push origin cli/v0.2.0
```

This triggers the `release-cli` GitHub Actions workflow.

### 4. Watch the workflow

Go to **Actions → Release CLI** in the repo. It will:

1. Run `go test ./...` to confirm tests pass.
2. Run GoReleaser, which:
   - Builds binaries for darwin/linux/windows × amd64/arm64.
   - Creates tar.gz / zip archives and a `checksums.txt`.
   - Creates a GitHub Release named `CLI vX.Y.Z` under the `cli/v*` tag.
3. Publishes the npm package to `@subtextdev/subtext-cli` via OIDC (requires a Trusted Publisher configured on npmjs.com — no `NPM_TOKEN` secret needed).

### 5. Smoke test

```bash
# via npm
npx @subtextdev/subtext-cli@0.2.0 --version

# via go install (requires cli/v0.2.0 tag to be indexed by the Go module proxy)
go install github.com/fullstorydev/subtext/cli/cmd/subtext@v0.2.0
subtext --version
```

## GoReleaser and the cli/v* tag prefix

GoReleaser OSS does not natively support the `prefix/vX.Y.Z` tag format used by Go monorepos — that's a [GoReleaser Pro feature](https://goreleaser.com/customization/monorepo/). The `cli/v` prefix is required so `go install` resolves the module correctly via the Go module proxy.

The release workflow works around this with three steps:

1. Strip the prefix into `GORELEASER_CURRENT_TAG` (e.g. `v0.1.0`) so GoReleaser has a valid semver for building and embedding the version in the binary.
2. Pass `--skip=validate` so GoReleaser doesn't reject the tag for not existing in git (only `cli/v0.1.0` exists, not `v0.1.0`).
3. Pass `--skip=publish` and create the GitHub Release manually via `gh release create cli/vX.Y.Z` so the release tag stays as `cli/v0.1.0` and doesn't collide with the plugin's `v*` tag namespace.

If the project moves to GoReleaser Pro, the workaround can be replaced with a `monorepos: [{tag_prefix: "cli/", dir: "cli/"}]` config block.

## Snapshot builds (local testing)

```bash
cd cli
goreleaser release --snapshot --clean --skip=publish
./dist/subtext_darwin_arm64_v8.0/subtext version
```

No tag or GitHub credentials needed. Binaries land in `cli/dist/`.

## First release checklist

- [ ] Confirm `@subtextdev` npm scope exists on npmjs.com.
- [ ] Configure a Trusted Publisher on npmjs.com: GitHub Actions, org `fullstorydev`, repo `subtext`, workflow `release-cli.yml`, allow `npm publish`.
- [ ] Test `npx @subtextdev/subtext-cli auth whoami` after publish.
