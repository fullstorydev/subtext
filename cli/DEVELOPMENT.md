# Local development

## Build and run

```bash
cd cli
go build -o /tmp/subtext ./cmd/subtext
/tmp/subtext auth whoami
```

Assumes `~/.config/subtext/config.yaml` contains your `api_key`. If not, set `SUBTEXT_API_KEY` instead.

## Run tests

```bash
go test ./...
```
