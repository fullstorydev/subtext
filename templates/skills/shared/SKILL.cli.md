# Shared

Foundation for all subtext skills. Read this when any workflow or recipe lists it in PREREQUISITE.

## Command Groups

All commands ship in the `subtext` binary. Groups by subcommand:

| Namespace | Commands |
|-----------|---------|
| `subtext review` | Session replay: {{tool "review-open"}}, {{tool "review-view"}}, {{tool "review-diff"}}, {{tool "review-close"}} |
| `subtext live` | Browser automation: {{tool "live-connect"}}, {{tool "live-disconnect"}}, `subtext live view *`, `subtext live act *`, `subtext live log *`, `subtext live net *`, {{tool "live-tunnel"}}, {{tool "live-emulate"}}, {{tool "live-eval-script"}} |
| `subtext comment` | Comments: {{tool "comment-add"}}, {{tool "comment-list"}}, {{tool "comment-reply"}}, {{tool "comment-resolve"}} |
| `subtext doc` | Proof documents: {{tool "doc-create"}}, {{tool "doc-update"}}, {{tool "doc-attach"}}, {{tool "doc-close"}}, {{tool "doc-read"}}, {{tool "doc-diff"}}, {{tool "doc-list"}} |
| `subtext tunnel` | Reverse tunnel (built-in): {{tool "tunnel-connect"}}, {{tool "tunnel-disconnect"}}, {{tool "tunnel-status"}} |

## Sightmap Upload

Three commands return a sightmap upload URL:

| Command | Field | Format |
|---------|-------|--------|
| {{tool "review-open"}} | `sightmap_upload_url:` | text line in response |
| {{tool "live-connect"}} | `sightmap_upload_url:` | text line in response |
| {{tool "live-tunnel"}} | `sightmapUploadUrl` | JSON field in response |

If the project has `.sightmap/` definitions, upload them after getting the URL and **before** proceeding (before {{tool "review-view"}}/{{tool "review-diff"}} for review flows; before {{tool "live-view-new"}} for the tunnel-first flow):

```bash
URL=$(subtext live tunnel --format json | jq -r .data.sightmapUploadUrl)
subtext sightmap upload --url "$URL"
```

The upload uses a single-use token embedded in the URL — no additional auth is needed. Do NOT pass the `sightmap` parameter directly to {{tool "review-open"}}/{{tool "live-connect"}}.

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
