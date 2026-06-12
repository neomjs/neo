# Swarm Heartbeat Token Economy Baseline (May 2026)

This file captures the empirical token-economy anchor for the Track 1 swarm heartbeat under Epic #10311 and
sub-issue #10318.

## Summary

The confirmed-empty heartbeat path is safe at the current 5 minute default:

- **LLM prompt tokens:** `0`
- **LLM MCP tool calls:** `0`
- **Prompt injection:** skipped
- **Measured token-economy gate latency:** approximately `0.58s` per pulse on this machine
- **Measured current wrapper-cycle latency:** approximately `0.69s` per pulse including the failing TTL sweeper

The zero-token result is not an estimate. The heartbeat (measured here as the `ai/scripts/swarm-heartbeat.sh`
shell wrapper; folded into the Orchestrator's swarm-heartbeat lane per #11766) executes the deterministic checks
before injecting a prompt and returns early when both actionable counters are zero:

1. unread mailbox messages for the target agent identity
2. open GitHub issues assigned to the active GitHub user

If both counters are `0`, no `[SYSTEM HEARTBEAT]` prompt is sent to the harness. The LLM does not wake and therefore
does not spend tokens or perform follow-up MCP calls.

## Measurement Environment

| Field | Value |
| :--- | :--- |
| Date | 2026-05-01 |
| Checkout | `df5e33dbd` |
| Platform | Darwin 25.4.0 arm64 |
| Node.js | v25.9.0 |
| SQLite | 3.51.0 |
| GitHub CLI | 2.89.0 |
| Ticket state during measurement | #10318 assigned to `@neo-gpt`, so the GitHub query returned one open assigned issue |

The assigned-issue query was measured after claiming #10318. This means the current run did not represent an empty
GitHub-assignment result, but the query path is the same. The empty-cycle token conclusion comes from the script's
branch condition, not from the current issue count.

## Component Latency

| Component | Mean latency | Samples | Notes |
| :--- | ---: | :--- | :--- |
| Concurrency lock check | `2.9ms` | `5.2ms`, `1.9ms`, `1.6ms` | Lock absent; exit status `1` is expected for the shell `test -f` check. |
| TTL sweeper invocation | `116.4ms` | `116.4ms` | Direct invocation exits non-zero; see caveat below. |
| Push-capable subscription bypass query | `5.1ms` | `5.1ms`, `4.8ms`, `5.4ms` | Reads local SQLite `WAKE_SUBSCRIPTION` nodes. |
| Unread-message query, empty probe identity | `5.3ms` | `5.9ms`, `5.2ms`, `4.9ms` | Reads local SQLite `MESSAGE` + `SENT_TO` graph state. |
| Assigned-issues query | `564.8ms` | `622.1ms`, `560.7ms`, `513.2ms`, `565.0ms`, `563.0ms` | `gh issue list --assignee @me --state open --json number`; measured outside the sandbox. |

The token-economy gate is dominated by GitHub network latency:

```
2.9ms + 5.1ms + 5.3ms + 564.8ms = 578.1ms
```

The current full wrapper cycle adds the failing TTL sweeper:

```
116.4ms + 578.1ms = 694.5ms
```

These are wall-clock latencies in the wrapper process, not LLM latency and not token cost.

## TTL Sweeper Caveat

The current heartbeat script also calls `ai/scripts/sweepExpiredTasks.mjs` before the token-economy fast path. Direct
invocation currently exits non-zero after roughly `116ms` with:

```
ReferenceError: Neo is not defined
```

Because the measured `swarm-heartbeat.sh` shell wrapper redirects the sweeper stderr to `/dev/null`, this failure is
silent in the heartbeat loop and `expired` falls back to `0`. The local graph contained no A2A Task nodes during
measurement, so no task state was changed by this probe. (Post-#11766, the heartbeat is an Orchestrator lane that
calls `MailboxService.sweepExpiredTasks()` directly — no subprocess, no `/dev/null` redirect.)

This caveat does not change the empty-cycle token budget, but it does mean the TTL sweeper's operational health should
be fixed or tracked separately from #10318 before relying on heartbeat-driven task expiration.

## Frequency Decision

Keep the fallback heartbeat default at **5 minutes** for now.

At 5 minutes:

- One fallback-served agent can run up to `288` deterministic pulses per day.
- Two fallback-served agents can run up to `576` deterministic pulses per day.
- Three fallback-served agents can run up to `864` deterministic pulses per day.
- Confirmed-empty pulses still cost `0` LLM tokens and `0` LLM MCP calls.

At 15 minutes:

- One fallback-served agent drops to `96` deterministic pulses per day.
- Three fallback-served agents drop to `288` deterministic pulses per day.
- The token budget stays `0` for confirmed-empty pulses, but wake latency becomes three times worse.

Given the measured pre-inference latency and the strict zero-inference branch, 15 minutes is only justified when a
host has GitHub API quota pressure, network constraints, or battery/CPU constraints. It should not become the default
while heartbeat is still a fallback/watchdog lane.

Do not tighten fallback polling below 5 minutes. ADR 0002 assigns the 30-60 second latency/token trade-off to the
push-based wake substrate and its coalescing window; polling at that cadence would reintroduce the load pattern the
push substrate was designed to avoid.

## Concurrency Semantics

The heartbeat uses a file mutex at `.neo-ai-data/heartbeat-concurrency.lock` to prevent overlapping pulses while an
agent is already performing expensive work.

The semantics are deliberately skip-based:

- **Fresh lock present:** skip the current pulse.
- **No lock:** run the deterministic heartbeat checks.
- **Stale lock:** clear the lock and continue. The default stale-lock threshold is `30` minutes
  (`HEARTBEAT_LOCK_TTL_SECONDS=1800`).
- **Missed pulses:** do not queue. The next successful pulse re-reads Memory Core and GitHub state.

Agents and scripts can wrap expensive work with:

```bash
node ai/scripts/heartbeatLock.mjs -- npx playwright test test/playwright/unit/foo.spec.mjs
```

The wrapper creates the lock before the command starts and removes it in a `finally` path after the command exits,
including failure exits. This preserves the heartbeat as a fallback/watchdog: idle sessions can still be pulsed,
while long-running inference, test, memory extraction, or review jobs can suppress overlapping heartbeat injections.

## Architectural Boundary

The heartbeat is not the primary long-term wake substrate. Per ADR 0002 §6.5, push-capable identities should bypass
heartbeat polling, and the heartbeat should remain:

- a system-level watchdog
- a fallback for identities with `harnessTarget: 'disabled' | 'none'`
- a diagnostic override for empirical bisection sessions

The token-economy contract for confirmed-empty fallback pulses is therefore:

```
empty state -> deterministic wrapper checks only -> no prompt -> zero LLM tokens
```
