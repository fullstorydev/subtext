# Releasing the Subtext CLI

## Prerequisites

- Write access to this repo (`fullstorydev/subtext`).
- (First release only) `@fullstory` npm scope access. Set `PUBLISH_NPM=true` on the repo once the scope is provisioned.

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
3. Publishes the npm package to `@fullstory/subtext-cli` (requires `PUBLISH_NPM=true` repo variable and `NPM_TOKEN` secret).

### 5. Smoke test

```bash
# via npm
npx @fullstory/subtext-cli@0.2.0 --version

# via go install (requires cli/v0.2.0 tag to be indexed by the Go module proxy)
go install github.com/fullstorydev/subtext/cli/cmd/subtext@v0.2.0
subtext --version
```

## Snapshot builds (local testing)

```bash
cd cli
goreleaser release --snapshot --clean --skip=publish
./dist/subtext_darwin_arm64_v8.0/subtext version
```

No tag or GitHub credentials needed. Binaries land in `cli/dist/`.

## First release checklist

- [ ] Confirm `@fullstory` npm scope exists and `NPM_TOKEN` secret is set in repo settings.
- [ ] Set `PUBLISH_NPM=true` as a repo variable in GitHub Actions settings.
- [ ] Test `npx @fullstory/subtext-cli auth whoami` after publish.
