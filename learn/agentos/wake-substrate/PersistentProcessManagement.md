# Persistent-Process Management for the Wake Substrate

This document covers operator-side persistent-process management for the swarm wake substrate. **Since #11766 the swarm heartbeat is no longer a standalone daemon** — it is a config-gated scheduled lane inside the **Orchestrator daemon** (`Neo.ai.daemons.Orchestrator`). The Orchestrator is the single persistent local Agent OS process; there is no separate `swarm-heartbeat` launchd plist to install. The heartbeat class definition lives at `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs` and is driven by the Orchestrator's `poll()` loop (`initAsync()` once at start, `pulse()` once per cadence tick).

> **Verify-before-assert notice:** any launchd / systemd template you author for the Orchestrator is **author-side draft**. Correctness on a given operator's macOS install is operator-territory L3 verification. Do NOT install a template as-is without running the verification commands below.

## Compaction Taxonomy (3-Axis Slot Rule)
**Disposition:** `keep` (External Operator Guide; not injected into active agent context).
**Rationale:** Low-frequency (run once per host setup), high-severity (a `launchd` failure isolates the swarm), non-machine-enforceable (operator-territory CLI execution).

## 1. Why this exists

The wake substrate (Epic [#10671](https://github.com/neomjs/neo/issues/10671)) ships:

- `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs` — Neo-singleton swarm-heartbeat lane (5-minute pulse cadence by default; #10789). Folded into the Orchestrator daemon as a config-gated scheduled lane per [#11766](https://github.com/neomjs/neo/issues/11766).
- `ai/scripts/checkSunsetted.mjs` — sunset / idle-out detector consumed by the heartbeat lane
- `ai/scripts/resumeHarness.mjs` — recovery dispatcher invoked when a sunsetted agent is detected; Claude recovery targets Claude Desktop Tab 3 (Code tab) via the `osascript` adapter (Cmd+3 → fresh chat), not a terminal-attached CLI
- `ai/scripts/wakeSafetyGate.mjs` — fail-closed safety gate consulted before any high-authority recovery action

The heartbeat must run continuously. Rather than a dedicated daemon, the heartbeat `pulse()` is scheduled by the **Orchestrator** — the same persistent process that owns summarization, KB-sync, backup, dream, and golden-path lanes. macOS's native primitive for the long-lived per-user Orchestrator process is **launchd LaunchAgent** (per-user, lives in `~/Library/LaunchAgents/`). Linux's analog is a **systemd user service** (typically `~/.config/systemd/user/`).

**Why the heartbeat is an Orchestrator lane rather than a standalone daemon (#11766):**

- One persistent local daemon instead of two — the Orchestrator already owns a `poll()` scheduler, PID-file singleton enforcement, lifecycle traps, and per-task health reporting. A second daemon duplicated all of that.
- The Orchestrator's `runIfDue` lane provides the cadence gate and per-pulse failure isolation that the old self-rescheduling loop provided — a single-pulse failure is isolated by the scheduler.
- The heartbeat lane is config-gated (`swarmHeartbeatEnabled` / `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED`), so it can be disabled per deployment profile (e.g. the cloud `Orchestrator` profile — see ADR 0014).

## 2. Operator empirical-prerequisites

Before relying on the heartbeat lane, verify on your local environment:

```bash
# 1. The Orchestrator entry-point + the heartbeat class definition both exist
test -f ai/daemons/orchestrator/daemon.mjs                    && echo "OK (orchestrator entry-point)" || echo "FAIL: orchestrator entry-point missing"
test -f ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs && echo "OK (heartbeat class)"      || echo "FAIL: heartbeat class missing"

# 2. Required tools are reachable
which node sqlite3 gh tmux

# 3. The .neo-ai-data dir tree exists (will be created if not, but worth pre-checking)
ls -la .neo-ai-data/wake-daemon/ .neo-ai-data/sqlite/ .neo-ai-data/orchestrator-daemon/

# 4. Manual one-shot execution works — exercises the SIGTERM clean-shutdown path the
#    Orchestrator entry-point's signal handlers implement.
node ai/daemons/orchestrator/daemon.mjs &
DAEMON_PID=$!
sleep 30
kill -TERM "$DAEMON_PID"
wait "$DAEMON_PID" 2>/dev/null
# Expected:
#   1. "[Orchestrator] Started. ..." log line on launch
#   2. The heartbeat lane runs once its interval elapses (default 5min; lower
#      NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS for a faster local check)
#   3. Clean shutdown on SIGTERM via the entry-point's cleanup handler
```

If any of these fails, **fix the underlying issue first**. launchd will faithfully reproduce whatever runtime environment problem the manual execution surfaces.

## 3. Running the Orchestrator as a persistent process

The Orchestrator is the single persistent local Agent OS daemon — the heartbeat rides inside it. Install the Orchestrator under launchd (macOS) or systemd (Linux) using the standard launchd LaunchAgent / systemd user-service shape, targeting `ai/daemons/orchestrator/daemon.mjs` as the `ExecStart` / `ProgramArguments` entry-point.

General launchd guidance for the Orchestrator LaunchAgent:

- `WorkingDirectory` must be the repo root so the daemon resolves `.neo-ai-data/`.
- `EnvironmentVariables.PATH` must include the install dirs of `node`, `sqlite3`, `gh`, and `tmux` — launchd does not inherit your interactive shell `PATH`.
- `plutil -lint` the plist before `launchctl bootstrap`; a syntax error means do-not-proceed.
- The Orchestrator entry-point enforces a PID-file singleton (`.neo-ai-data/orchestrator-daemon/orchestrator-daemon.pid`) and handles `SIGTERM` / `SIGINT` with a clean shutdown.

The heartbeat lane needs no separate install step: once the Orchestrator is running with `swarmHeartbeatEnabled` (the default outside the cloud profile), the lane pulses on its configured interval.

### 3a. Verify heartbeat-lane execution

The Orchestrator records every lane outcome through `HealthService.recordTaskOutcome(...)`. The heartbeat lane emits `INFO`-level log lines only when something happens — these are the durable observability signals:

- **Stale lock cleared:** `Clearing stale concurrency lock (<age>ms old)` — only when a producer-side lock outlived its TTL.
- **TTL sweep:** `sweep: <N> task(s) transitioned to Expired` — only when N > 0.
- **Sunset recovery:** `Phase 1 Recovery Triggered for <identity>. Reason: ...` — only when the sunset detector fires.
- **Idle-out nudge:** `Idle-out nudge triggered for <identity>` — only when the per-identity idle threshold trips.
- **All-agent-idle:** `AllAgentIdle detected: <signal>` — only when the trio-wide idle predicate holds.
- **Gate-closed:** `Wake safety gate closed; skipping ...` — only when a high-authority dispatch was suppressed.

A healthy idle heartbeat lane may emit nothing for many cycles in a row (no expired tasks, no sunset, no idle-out, no all-idle, no gate-closed). **Do not infer "heartbeat stopped pulsing" from log silence** — silence during agent-active periods is the token-economy gate working as designed.

> ⚠️ **Lock-as-evidence anti-pattern:** the file `.neo-ai-data/heartbeat-concurrency.lock` is **producer-side state** — created by `acquireHeartbeatLock` when expensive agent work starts (#10319 `withHeartbeatLock`), removed when that work finishes. The heartbeat lane only *inspects + releases stale locks*, never touches it on healthy idle pulses. **Do not watch the lock's mtime as a polling-health indicator** — a healthy lane may go hours without touching it.

### 3b. Verify active wake-recipient coverage

The Orchestrator heartbeat process identity is not the wake-recipient set. Each pulse sweeps the primary fallback identity plus active `WAKE_SUBSCRIPTION` identities, so desktop harnesses that are currently reachable through `bridge-daemon`, `mcp-notifications`, or `a2a-webhook` are part of sunset / idle-out detection even when the Orchestrator daemon was launched by another agent identity.

For night-shift readiness, verify both layers:

- **Route layer:** `manage_wake_subscription({action: 'list'})` shows an active subscription for each intended maintainer identity. For Codex Desktop, the target is typically `harnessTarget: 'bridge-daemon'` with `harnessTargetMetadata.appName: 'Codex'`.
- **Pulse layer:** Memory Core healthcheck reports `features.wake.daemonRunning: true` and a recent `lastPulseAt`. An active Codex route with a stale heartbeat means the bridge can receive A2A messages, but the Orchestrator is not currently driving the watchdog lane.

### 3c. Healthcheck-side verification (#10783)

For a single-call observability check, the Memory Core healthcheck surfaces the wake substrate's operational dimensions in one block. Call any healthcheck-emitting tool (e.g. `mcp__neo-mjs-memory-core__healthcheck`) and inspect the `features.wake` block:

```jsonc
"features": {
    "wake": {
        "gateState": "enabled",       // 'enabled' | 'disabled' | 'tripped' | 'unknown'
        "gateTrippedAt": null,
        "gateTrippedBy": null,
        "daemonRunning": true,        // mtime of heartbeat-liveness file < 2× POLL_INTERVAL
        "lastPulseAt": "2026-05-07T20:51:52.141Z",
        "secondsSinceLastPulse": 12
    }
}
```

The `daemonRunning` heuristic reads the dedicated liveness file `.neo-ai-data/wake-daemon/heartbeat.alive` — touched by `SwarmHeartbeatService.touchLivenessFile()` at the top of every `pulse()` (the producer is the Orchestrator's swarm-heartbeat lane since #11766), NOT the producer-side concurrency lock above. `gateState` is read via `wakeSafetyGate.readGateState`. Field semantics + defensive defaults are documented inline at `HealthService.buildWakeFeaturesBlock`.

**Use this for:** quick night-shift readiness check from the agent harness; integration tests asserting heartbeat-running invariants; operator dashboards consuming the healthcheck JSON. (The Orchestrator's per-lane outcomes are recorded via `recordTaskOutcome`, but no longer surfaced as a healthcheck block — the verbose `orchestrator.tasks` block was trimmed to keep the probe lean.)

## 4. Disabling the heartbeat lane

The heartbeat lane is config-gated; there is no plist to uninstall. To disable it for a given Orchestrator process:

- `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED=false`, or
- `orchestrator.localOnly.swarmHeartbeatEnabled: false` in the top-level `ai` config.

The cloud `Orchestrator` deployment profile disables the lane by default (see ADR 0014 §2.1 — the heartbeat is a `local-only` lane delivering wakes via the `wake-daemon` adapter set: `osascript` for Claude Desktop and the current Codex Desktop direct-wake route, explicitly configured `codex-app-server` routes for live-host-gated Codex probes, `antigravity-cli` / `claude-cli` for CLI shells, `tmux send-keys` for tmux sessions). Per Epic #11993 cycle-3 (graduated from Discussion #11992): the SwarmHeartbeatService no longer injects directly into tmux — pulses flow through `WakeSubscriptionService.emitHeartbeatPulse` → wake-daemon's adapter dispatch, gated by the 3-signal `active AND idle AND ready` decision per `WakeDecisionService.decideWake`. Stopping the Orchestrator process stops the heartbeat with it; the SQLite DB, ChromaDB, and Memory Core data are unaffected by daemon lifecycle.

## 5. Troubleshooting (common gotchas for the Orchestrator LaunchAgent)

| Symptom | Likely cause | Fix |
|---|---|---|
| Orchestrator "loaded" but no log lines | `WorkingDirectory` placeholder unsubstituted OR substituted to wrong path | Re-substitute with the correct repo root; `launchctl bootout` + `bootstrap` to reload |
| `node: command not found` in stderr log | `PATH` env var doesn't include node's location | Add node's actual install dir to the plist `EnvironmentVariables.PATH` (check via `which node` in your interactive shell) |
| `gh: command not found` in stderr log | Same — Homebrew's `gh` not in default launchd PATH | Add `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel) to plist PATH |
| `tmux: command not found` | tmux is one of the wake-daemon's adapters (used for tmux-hosted harnesses); absent on macOS-Desktop-only deployments. Post-Epic #11993 the SwarmHeartbeatService no longer injects directly into tmux — wakes flow through wake-daemon's adapter dispatch | Add tmux's install dir to plist PATH only if the deployment includes tmux-hosted harnesses; otherwise the wake-daemon's other adapters handle delivery |
| `ReferenceError: Neo is not defined` | Module-load ordering broke the Neo prelude | File a bug — `ai/daemons/orchestrator/daemon.mjs` (entry-point wrapper) MUST import `Neo` + `core/_export` + `InstanceManager` before importing the daemon class |
| `KeepAlive` causing rapid relaunch loop | Daemon crashes on startup (config error, missing dependency) | Check the stderr log for the actual crash; FIX the crash before lengthening `ThrottleInterval` (do not paper over real bugs) |
| Heartbeat lane runs but doesn't trigger recovery wakes | `wakeSafetyGate.json` is `tripped` (deny-by-default) | Operator-territory: `node ai/scripts/wakeSafetyGate.mjs enable --reason "validated post-#10671"` AFTER end-to-end validation per [Epic #10671](https://github.com/neomjs/neo/issues/10671) |
| Heartbeat lane never pulses | Lane disabled by config | Confirm `NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED` is not `false` and the deployment profile is not the cloud profile (ADR 0014) |

## 6. Relationship to operator-territory steps (#10671 epic-finish)

Night-shift readiness has three integration steps:

1. **Persistent-process management** (this doc) — run the Orchestrator daemon (`ai/daemons/orchestrator/daemon.mjs`) under launchd / systemd; the heartbeat lane rides inside it.
2. **`wakeSafetyGate` untrip** — `node ai/scripts/wakeSafetyGate.mjs enable --reason "..."` after empirical validation that the cross-harness prompt-landing matrix (#10649) holds.
3. **End-to-end validation** — simulate the mutual-idle scenario; verify a recovery wake fires correctly to a healthy peer; confirm fresh-session-spawn lands cleanly without the runaway-spawn pattern from 2026-05-03.

All three must complete for the swarm to operate continuously during operator-offline (night-shift) hours.

## 7. Pre-run discipline reminder

Per [#10780](https://github.com/neomjs/neo/issues/10780): before re-enabling DreamMode/Sandman (separate substrate from the heartbeat lane — `autoDream` / `autoGoldenPath` config flags currently disabled in operator-local `config.mjs`), **always run `npm run ai:backup` first.** The backup primitive captures atomic-bundle state across KB + MC + graph + concepts + trajectories. DreamMode regressions can produce graph state that's expensive to recover from without a backup. The heartbeat lane itself does NOT trigger DreamMode; it triggers recovery wakes for sunsetted agents — but the discipline applies to the broader Dream Pipeline substrate they're part of.

## 8. Related substrate

- **Orchestrator entry-point wrapper:** `ai/daemons/orchestrator/daemon.mjs` (Neo bootstrap + signal handlers + start invocation; the launchd / systemd target)
- **Orchestrator daemon class:** `ai/daemons/orchestrator/Orchestrator.mjs` (Neo-singleton; #11009; owns the `poll()` scheduler)
- **Heartbeat lane class:** `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs` (Neo-singleton; #10789; folded into the Orchestrator as a scheduled lane per #11766)
- **Heartbeat lane dependencies:** `checkSunsetted.mjs`, `resumeHarness.mjs`, `wakeSafetyGate.mjs`, `sweepExpiredTasks.mjs`, `heartbeatLock.mjs`, `idleOutNudge.mjs`, `checkAllAgentIdle.mjs`, `trioWakeCooldown.mjs`
- **Heartbeat fold ADR:** [ADR 0014](../decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md) — classifies the `swarm-heartbeat` lane as `local-only`
- **Parent epic:** [#10671](https://github.com/neomjs/neo/issues/10671) — Substrate-restart recovery (two-mode: idle-out + sunset)
- **Implementation tickets:** [#10789](https://github.com/neomjs/neo/issues/10789) — SwarmHeartbeatService Neo-singleton; [#11766](https://github.com/neomjs/neo/issues/11766) — fold into the Orchestrator
- **Sub-tickets resolved by this substrate:** [#10396](https://github.com/neomjs/neo/issues/10396), [#10399](https://github.com/neomjs/neo/issues/10399), [#10633](https://github.com/neomjs/neo/issues/10633)
- **Sibling discipline:** [#10780](https://github.com/neomjs/neo/issues/10780) — Backup-first before DreamMode/Sandman; [`learn/agentos/DreamPipeline.md`](../DreamPipeline.md) for DreamMode-specific operational discipline
- **Night-shift ownership contract:** [`NightShiftLeasedDriver.md`](./NightShiftLeasedDriver.md) — lane-scoped driver lease, TTL, renewal, and no-idle obligations for autonomous windows (#10763)
