# Local development

## Build and run

```bash
cd /Users/clint/sandbox/work/forks/subtext/cli
go build -o /tmp/subtext ./cmd/subtext
/tmp/subtext auth whoami
```

Assumes `~/.config/subtext/config.yaml` contains your `api_key`. If not, set `SUBTEXT_API_KEY` instead.

## Against local stack

```bash
/tmp/subtext --endpoint api.fullstory.test:8043 auth whoami
```

## Run tests

```bash
go test ./...
```
