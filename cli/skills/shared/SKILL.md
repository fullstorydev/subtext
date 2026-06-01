---

name: shared
description: Foundation skill for the subtext plugin. MCP tool conventions, environment detection, security rules, and sightmap upload.
metadata:
  _generated_from: templates/skills/shared/SKILL.template

---
# Shared

Foundation for all subtext skills. Read this when any workflow or recipe lists it in PREREQUISITE.

## Command Groups

All commands ship in the `subtext` binary. Groups by subcommand:

| Namespace | Commands |
|-----------|---------|
| `subtext live` | Browser automation: `subtext live connect`, `subtext live disconnect`, `subtext live view-*`, `subtext live act-*`, `subtext live log-*`, `subtext live net-*`, `subtext live tunnel`, `subtext live emulate`, `subtext live eval-script` |
| `subtext comment` | Comments: `subtext comment add`, `subtext comment list`, `subtext comment reply`, `subtext comment resolve` |
| `subtext doc` | Proof documents: `subtext doc create`, `subtext doc update`, `subtext doc attach`, `subtext doc close`, `subtext doc read`, `subtext doc diff`, `subtext doc list` |
| `subtext tunnel` | Reverse tunnel (built-in): `subtext tunnel connect`, `subtext tunnel disconnect`, `subtext tunnel status` |
| `subtext sightmap` | Sightmap: `subtext sightmap upload` |

## Sightmap Upload

Two commands return a sightmap upload URL:

| Command | Field | Format |
|---------|-------|--------|
| `subtext live connect` | `sightmap_upload_url:` | text line in response |
| `subtext live tunnel` | `sightmapUploadUrl` | JSON field in response |

If the project has `.sightmap/` definitions, upload them after getting the URL and **before** proceeding (before `subtext live view-new` for the tunnel-first flow):

```bash
URL=$(subtext live tunnel --format json | jq -r .data.sightmapUploadUrl)
subtext sightmap upload --url "$URL"
```

The upload uses a single-use token embedded in the URL — no additional auth is needed. Do NOT pass the `sightmap` parameter directly to `subtext live connect`.

## Discovering Parameters

Run `subtext <command> --help` to see parameters for any command. For example:

```bash
subtext live connect --help
subtext comment add --help
```

## Security Rules

- Never expose API tokens, session tokens, or credentials in output
- Confirm with the user before any write operation that modifies production data
- Session URLs may contain sensitive user data — don't log or repeat them unnecessarily
