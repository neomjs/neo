---
id: 9554
title: 'Enhancement: Add Data Pipeline Telemetry & Performance Metrics'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - performance
  - core
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-03-25T20:12:22Z'
updatedAt: '2026-06-23T03:33:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9554'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Enhancement: Add Data Pipeline Telemetry & Performance Metrics

### Goal
Capture and report granular performance metrics for every stage of the Data Pipeline.

### Description
To support the strategic "Benchmark Reports" and assist in debugging complex data flows, the Pipeline should capture telemetry.

**Requirements:**
1. Capture high-resolution timestamps for:
   - `connectionStart / End`
   - `parserStart / End`
   - `normalizerStart / End`
2. Track payload sizes (raw vs. parsed).
3. Return a `telemetry` object to the App Worker alongside the shaped data.
4. Integrate with `Neo.util.Logger` for optional performance profiling in the console.

## Timeline

- 2026-03-25T20:12:22Z @tobiu assigned to @tobiu
- 2026-03-25T20:12:24Z @tobiu added the `enhancement` label
- 2026-03-25T20:12:24Z @tobiu added the `ai` label
- 2026-03-25T20:12:24Z @tobiu added the `performance` label
- 2026-03-25T20:12:24Z @tobiu added the `core` label
- 2026-03-25T20:50:50Z @tobiu added the `help wanted` label
- 2026-03-25T20:50:50Z @tobiu added the `no auto close` label
- 2026-03-26T15:20:24Z @tobiu unassigned from @tobiu
- 2026-06-23T03:33:24Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:33:24Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T03:33:41Z

[ARCH_ALIGNMENT]

Ticket-intake classification on 2026-06-23: **needs-design / not-code-ready**; preserve open, but exclude from branch pickup until the contract is explicit.

Evidence checked:
- Live issue state: #9554 was created on 2026-03-25, last updated on 2026-03-26, has no comments, no assignee, and already carries `no auto close`.
- Stale-band: `.github/workflows/close-inactive-issues.yml` sets issue stale at 90 days and close 14 days later. At 2026-06-23T03:33:07Z, #9554 is still **pre-stale by updatedAt** (~88.5 days), not post-stale; `no auto close` is still a parked-lane signal, not readiness evidence.
- KB ticket sweep found #9554 as the active Data Pipeline telemetry issue and did not identify a direct successor or duplicate. Raw Memory Core queries for `#9554` / Data Pipeline telemetry found no prior design resolution.
- Live issue/PR sweeps found adjacent Data Pipeline work (#9449, #9451, #9453, #9543, #9546, #9553, #9555), but no merged PR completing #9554. The only PR search hit was unrelated to Data Pipeline telemetry.
- Current source check: `src/data/Pipeline.mjs` still returns shaped data from `execute()`, `read()`, and `executeRemoteOrLocal()`; there is no telemetry object, stage timing, payload-size accounting, or logger integration. `src/data/Store.mjs` consumes `pipeline.read(params)` directly as the load response.

Reason for not-code-ready: requirement 3 changes a consumed runtime contract by returning a `telemetry` object to the App Worker alongside shaped data. Before implementation, the ticket needs a Contract Ledger that defines at least:

| Target Surface | Required design decision |
|---|---|
| `Neo.data.Pipeline#read()` / `execute()` return shape | Whether telemetry wraps the data, is attached out-of-band, emitted as an event, or stored on the pipeline/store. |
| App Worker / Data Worker boundary | Exact IPC payload shape and compatibility for `workerExecution: 'app'` vs `workerExecution: 'data'`. |
| `Neo.data.Store#load()` consumption | Whether store load events expose telemetry, ignore it, or preserve existing item extraction semantics. |
| Timing fields | Exact start/end semantics for connection/parser/normalizer, including skipped stages and failures. |
| Payload sizes | Definitions for raw vs parsed size, streaming/chunked data, and unavailable-size fallback. |
| Logger profiling | Opt-in flag, logger namespace/level, and guarantee that default behavior has no console noise. |
| Evidence | Focused unit coverage for app execution and data-worker execution, including backward compatibility for existing `Store.load()` consumers. |

Applied labels: `not-code-ready` + `needs-design`.


