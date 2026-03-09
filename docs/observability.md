# Observability

Hermit now records local-first runtime telemetry for CLI sessions and can aggregate those logs into workspace reports.

This is the canonical observability document for the runtime telemetry approach.

## Scope

Telemetry is currently captured automatically for `chat`, `ask`, `heartbeat`, and transcript-ingest sessions.

Current telemetry covers:

- session start and end
- turn start and end
- time to first assistant token
- tool start and end
- tool durations
- tool execution errors
- assistant message errors
- retry events
- compaction events

This is intentionally local-first and append-only.

## Storage

Raw event logs are written under:

- `.hermit/telemetry/events/YYYY/MM/DD/<session-id>.jsonl`

Aggregated reports are written under:

- `.hermit/telemetry/reports/report-<window>-<date>-<timestamp>.md`
- `.hermit/telemetry/reports/report-<window>-<date>-<timestamp>.json`

## Event Model

The recorder writes structured telemetry events rather than dumping every raw SDK event verbatim. Current event types are:

- `session_start`
- `session_end`
- `turn_start`
- `first_token`
- `tool_start`
- `tool_end`
- `assistant_message_end`
- `retry_start`
- `retry_end`
- `compaction_start`
- `compaction_end`
- `turn_end`

Each event includes at least:

- `timestamp`
- `sessionId`
- `commandName`
- `model`
- `roleId` when available

## Commands

Generate a report for the last 7 days:

```bash
hermit telemetry report
```

Generate a report for a custom window:

```bash
hermit telemetry report --window 24h
hermit telemetry report --window 7d
hermit telemetry report --window 2w
```

Filter by role:

```bash
hermit telemetry report --role <role-id>
```

## Current Metrics

Telemetry reports only aggregate completed sessions. In-flight sessions without a `session_end` event are ignored so partial data does not skew reported counts and rates.

The report currently summarizes:

- session count
- turn count
- tool error rate
- assistant error rate
- silent turn rate
- retry count
- compaction count
- turn duration p50/p95
- time-to-first-token p50/p95
- tool duration p50/p95
- top failing tools
- slowest turns
- per-tool breakdown

## How To Use It

Telemetry is one input to Hermit's self-improvement loop.

- Use reports to spot repeated failure modes, retries, slow turns, or fragile tools before changing prompts or runtime behavior.
- Treat telemetry as supporting evidence, then confirm the right fix in prompts, code, templates, renderers, docs, or tests.
- Do not treat a single anomalous session as enough evidence for a broad workflow rewrite.

## Documentation References

Telemetry is also referenced from:

- `README.md` for feature discovery and CLI usage
- `docs/architecture.md` for runtime module responsibilities and storage model

## Guardrails

- telemetry stays local by default
- logs are append-only
- reports are derived artifacts, not the source log
- raw tool arguments and full prompts are not stored in telemetry events today
