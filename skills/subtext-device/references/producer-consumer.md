# Producer and consumer

Two subagents, running at the same time: the producer keeps driving while the consumer keeps reading. Neither waits on the other.

Paths below use `<run>`, the run id from `sightmap device run current`. The run log is `.sightmap/.device-runs/<run>.jsonl`, written by `sightmap device`; the feedback file `.sightmap/.device-runs/<run>.consumer.md` is a plain Markdown file the consumer creates and appends to. Both are covered by gitignoring `.device-runs/`.

## Orchestrating agent

1. `sightmap device start --detach`, then start the **producer** as a background subagent.
2. Poll `sightmap device console list --grep fullstory.com/ui/ --limit 0` every few seconds until it shows a session URL, usually within seconds of `start`. Then start the **consumer** as a second background subagent, **without waiting for the producer to finish**.
3. Give both the run id, the session URL, and a credit budget for the consumer (default: at most 10 `review-open` calls, i.e. 100 credits, unless the user says otherwise).
4. When the producer reports it's done, tell the consumer, wait for its final pass, then reconcile and report.

## Producer

Drives the app and never waits on network data.

- Works through flows with `snapshot` / `click` / `fill` / `scroll` / `openurl`. Each action lands in the run log with its timestamp, target component and view; a secure field's text is redacted.
- Between flows, checks the console for the SDK's termination lines (`console list --grep terminat --limit 0`). As soon as a new one appears it runs `sightmap device relaunch` and carries on from the app's start screen, re-doing the step that was in flight. It doesn't wait for a crash. If sessions keep ending with a 206 on the same screen, it stops relaunching there and reports the screen.
- Owns `components:` and `views:` in `.sightmap/`: elements it can't target cleanly become new components.
- Between flows, reads `<run>.consumer.md` for the consumer's requests (e.g. "re-run checkout; a POST /orders fired with no step that explains it") and works them into its next flows.
- When finished, reports to the orchestrator: the run id, the flows it covered, the sessions it saw end, and any consumer requests it couldn't do. It leaves the app running, so the last bundle uploads and the consumer can still re-check a screen.

## Consumer

Reads captured data while the producer is still working.

1. Follow the producer with `sightmap device run tail --follow --json` (or poll with `--since SEQ`). The run log has no session entries: a `launch` entry is a relaunch, and may start a new session. On each poll, re-check the console for session URLs and termination lines; when a newer URL appears, switch to it, and note the gap: steps between a termination line and the next session's start were never recorded, so don't expect their requests.
2. About every 30 s while new producer steps are appearing, read the newest data: `review-open` the session URL, then `review-zoom` with `t0_ms` set past what it has already processed, and `resolution={"network": "machine", "console": "standard"}`. Close each client with `review-close` before opening the next.
3. Match each request and `FS.log` message to the producer step just before it (by timestamp), then author:
   - `requests:` (route glob + method) for endpoints that mean something;
   - `properties:` for outcomes hidden in bodies;
   - `messages:` for meaningful logs and errors.

   It owns those sections of `.sightmap/`. Component and view problems it notices go to the producer, not into the YAML.
4. When it needs more coverage (an endpoint it can't place, a flow that never fired a request, an error worth reproducing), it appends a short line to `<run>.consumer.md`.
5. When the producer is done, wait ~30 s for the last bundle, do one final read to cover the tail of the session, then report what it authored and what remains unmapped.

## Budget and pacing

Never re-open faster than every ~30 s, since newer data can't arrive sooner. Stop at the credit budget and say so. If the producer goes idle, stop polling until new steps appear.

## Known data quirks

- A network request can appear twice at the same millisecond; count unique requests.
- Network data has lagged the app by 35 s to 2 min in field runs, longer than the upload interval.
