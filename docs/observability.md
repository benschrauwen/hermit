# Observability

Hermit has two observability layers: local runtime telemetry for sessions, and `doctor` for structural workspace validation. They do not share data or code paths.

## Telemetry Coverage

Telemetry is recorded for interactive chat inside `start`, `ask`, background heartbeat sessions, and `ingest:transcript`. Git session metadata (branch, HEAD SHAs, checkpoint SHAs) is attached to those interactive chat, `ask`, and background heartbeat sessions because they run through the git checkpoint wrapper.

Telemetry is local-first and append-only. Reports are generated explicitly via `hermit telemetry report`. Telemetry does not trigger rollback, checkpointing, or background mutations.

## Storage

Raw events: `.hermit/telemetry/events/YYYY/MM/DD/<session-id>.jsonl`, partitioned by UTC day.

Reports: `.hermit/telemetry/reports/report-<window>-<date>-<timestamp>.md` and `.json`.

`.hermit/` is gitignored. Telemetry and reports are runtime artifacts, not canonical records.

## Event Model

Event types: `session_start`, `session_end`, `turn_start`, `first_token`, `tool_start`, `tool_end`, `assistant_message_end`, `retry_start`, `retry_end`, `compaction_start`, `compaction_end`, `turn_end`.

Every event carries: `timestamp`, `sessionId`, `commandName`, `model`, and optional `roleId`.

### Session events

`session_start` fields: `persist`, `continueRecent`, `workspaceRoot`, optional `gitBranch`, `gitHeadAtStart`, `checkpointBeforeSha`.

`session_end` fields: `durationMs`, `turnCount`, `toolCallCount`, `toolErrorCount`, `assistantErrorTurnCount`, `silentTurnCount`, `retryCount`, `compactionCount`, optional `gitBranch`, `gitHeadAtStart`, `gitHeadAtEnd`, `checkpointBeforeSha`, `checkpointAfterSha`.

### Turn and tool events

Turn events: turn timing, time to first token, tool call and error counts, assistant text presence and size, error flag, retry and compaction counts.

Tool events: tool name, tool call ID, optional turn ID, duration, success/error, error message when available.

Assistant message text is not stored.

## Reports

`hermit telemetry report` reads raw event files, filters to the requested window and optional role, and aggregates only completed sessions (those with `session_end`).

```
hermit telemetry report [--window 24h|7d|2w] [--role <role-id>]
```

Default window: `7d`.

Summary metrics: session count, turn count, tool call count, tool error count and rate, assistant error turn count and rate, silent turn count and rate, retry count, compaction count, turn duration p50/p95, time-to-first-token p50/p95, tool duration p50/p95.

Breakdown sections: top 5 failing tools, top 5 slowest turns, per-tool breakdown.

Source metadata: total event count, completed session file count.

## Privacy Boundaries

**Not stored:** full prompts, assistant message text, raw tool arguments, the underlying SDK event stream.

**Stored:** absolute `workspaceRoot`, command name, model identifier, optional role ID, optional git branch and SHAs, optional checkpoint SHAs, tool and assistant error strings (truncated to 500 characters).

No general redaction or universal truncation layer. Local telemetry files should be treated as operational data.

## `doctor`

`doctor` validates structural workspace correctness. For normal roles it checks the selected role contract; for `--role Hermit` it validates the shared `.hermit/agent/` state directly instead of looking for `workspace/agents/Hermit/`. It does not read telemetry files or compute rates. See [Architecture: Validation](architecture.md#validation) for the full check list.

## Strategic Review and Telemetry

The strategic review prompt can read reports under `.hermit/telemetry/reports/`, but heartbeat does not generate a fresh report before review runs. Strategic review trigger conditions are documented in [Architecture: Command Surface](architecture.md#command-surface).
