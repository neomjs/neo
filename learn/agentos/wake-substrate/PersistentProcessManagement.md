# Persistent-Process Management for SwarmHeartbeatService

This document covers operator-side installation, verification, and uninstallation of the swarm heartbeat daemon as a persistent daemon process. The entry-point wrapper at `ai/scripts/swarm-heartbeat-daemon.mjs` (#11058 split) is the launchd / systemd target; the class definition lives at `ai/daemons/SwarmHeartbeatService.mjs`. Required for autonomous **night-shift mode** operation — without persistent-process management, the heartbeat singleton only runs when an operator manually invokes the bash wrapper (`ai/scripts/swarm-heartbeat.sh`) interactively and keeps the terminal open.

> **Verify-before-assert notice:** the plist template in this directory (`com.neomjs.swarm-heartbeat.plist.template`) is **author-side draft**. Correctness on a given operator's macOS install is operator-territory L3 verification. Do NOT install the template as-is without running the verification commands in §3 below.

## Compaction Taxonomy (3-Axis Slot Rule)
**Disposition:** `keep` (External Operator Guide; not injected into active agent context).
**Rationale:** Low-frequency (run once per host setup), high-severity (macOS `launchd` failure isolates the swarm), non-machine-enforceable (operator-territory CLI execution).

## 1. Why this exists

The wake substrate (Epic [#10671](https://github.com/neomjs/neo/issues/10671)) ships:

- `ai/daemons/SwarmHeartbeatService.mjs` — Neo-singleton heartbeat daemon (5-minute poll by default; #10789)
- `ai/scripts/swarm-heartbeat.sh` — sibling bash wrapper for **developer-interactive** use (preserved per #10789 AC10; not the persistent-process target)
- `ai/scripts/checkSunsetted.mjs` — sunset / idle-out detector consumed by the daemon
- `ai/scripts/resumeHarness.mjs` — recovery dispatcher invoked when a sunsetted agent is detected
- `ai/scripts/wakeSafetyGate.mjs` — fail-closed safety gate consulted before any high-authority recovery action

`SwarmHeartbeatService` runs `await this.scheduleNext()` in a setTimeout chain (5-minute default cadence). It must run as a long-lived process. macOS's native primitive for long-lived per-user daemons is **launchd LaunchAgent** (per-user, lives in `~/Library/LaunchAgents/`). Linux's analog is **systemd user service** (typically `~/.config/systemd/user/`); a sibling shape is sketched in §5 below but committed-template is macOS-only for v1.

**Why the singleton replaces the bash wrapper as the persistent-process target:**

- Architectural pattern compliance — `ai/daemons/` already houses Neo-class services (`DreamService.mjs` + 10+ under `ai/daemons/services/`); a bash daemon would have introduced architectural debt.
- Direct module imports for `wakeSafetyGate.mjs`, `heartbeatLock.mjs`, and `MailboxService.sweepExpiredTasks` remove three subprocess hops per cycle.
- Persistent-singleton state lets future work (gauge, observability, backpressure) live on the class instance instead of bash-shell environment variables.

## 2. Operator empirical-prerequisites

Before installing, verify on your local environment:

```bash
# 1. The daemon entry-point wrapper + class definition both exist
test -f ai/scripts/swarm-heartbeat-daemon.mjs && echo "OK (wrapper)" || echo "FAIL: did you check out the #11058 branch?"
test -f ai/daemons/SwarmHeartbeatService.mjs && echo "OK (class)"   || echo "FAIL: class file missing"

# 2. Required tools are reachable
which node sqlite3 gh tmux

# 3. The .neo-ai-data dir tree exists (will be created if not, but worth pre-checking)
ls -la .neo-ai-data/wake-daemon/ .neo-ai-data/sqlite/

# 4. Manual one-shot execution works — exercises the SIGTERM clean-shutdown path the
#    wrapper's signal handlers (swarm-heartbeat-daemon.mjs) implement.
NEO_AGENT_IDENTITY="@your-identity" POLL_INTERVAL=10 \
   node ai/scripts/swarm-heartbeat-daemon.mjs &
DAEMON_PID=$!
sleep 30
kill -TERM "$DAEMON_PID"
wait "$DAEMON_PID" 2>/dev/null
# Expected:
#   1. "Starting heartbeat for @your-identity (interval: 10000ms)" log line on launch
#   2. At least one pulse cycle (10s interval × ~3 pulses in 30s window)
#   3. "Received SIGTERM; stopping." + "Heartbeat stopped." log lines on shutdown
#   4. wait exits 0 (clean shutdown via the handler's process.exit(0))
# A SIGALRM-shape recipe (perl alarm) would terminate by signal, NOT through the
# clean-shutdown handler — the daemon only catches SIGTERM/SIGINT.
```

If any of these fails, **fix the underlying issue first**. launchd will faithfully reproduce whatever runtime environment problem the manual execution surfaces.

## 3. macOS launchd installation procedure

### 3a. Substitute the template

```bash
# From repo root, copy the template + substitute placeholders
cp learn/agentos/wake-substrate/com.neomjs.swarm-heartbeat.plist.template \
   ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist

# Substitute repo-root path (this assumes you run this command FROM the repo root)
sed -i '' "s|\[OPERATOR_SUBSTITUTE_REPO_ROOT\]|$(pwd)|g" \
   ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist

# Substitute agent identity (replace with your actual identity, e.g. "@neo-opus-4-7")
sed -i '' "s|\[OPERATOR_SUBSTITUTE_AGENT_IDENTITY\]|@your-identity|g" \
   ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist

# Verify substitution succeeded — should be ZERO matches remaining
grep -c "OPERATOR_SUBSTITUTE" ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist
# expected output: 0
```

### 3b. Lint the plist syntax

```bash
plutil -lint ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist
# expected output: <path>: OK
```

If `plutil` reports a syntax error, **do not proceed**. Common causes:
- Unescaped `<` / `>` / `&` in your repo path or agent identity (sed `|` delimiter avoids this for `/`-laden paths but still surfaces if your path has special XML chars)
- Substitution missed a placeholder (zero `OPERATOR_SUBSTITUTE` matches confirmed via §3a final check)

### 3c. Install + start

```bash
# Bootstrap (load + start) the LaunchAgent
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist

# Verify load
launchctl list | grep com.neomjs
# expected output: a line with PID + label "com.neomjs.swarm-heartbeat"
```

### 3d. Verify execution

```bash
# Initial verify: the startup line MUST appear within seconds of bootstrap
tail -f .neo-ai-data/wake-daemon/heartbeat.stdout.log
# Expected first line: "[SwarmHeartbeatService] Starting heartbeat for <identity> (interval: 300000ms)"

# Watch the daemon's stderr — should be empty during normal operation
tail -f .neo-ai-data/wake-daemon/heartbeat.stderr.log
```

The daemon emits `INFO`-level log lines only when something happens — these are the durable observability signals:

- **Startup:** `Starting heartbeat for <identity> (interval: <ms>)` — fires once on launch.
- **Stale lock cleared:** `Clearing stale concurrency lock (<age>ms old)` — only when a producer-side lock outlived its TTL.
- **TTL sweep:** `sweep: <N> task(s) transitioned to Expired` — only when N > 0.
- **Sunset recovery:** `Phase 1 Recovery Triggered for <identity>. Reason: ...` — only when the sunset detector fires.
- **Idle-out nudge:** `Idle-out nudge triggered for <identity>` — only when the per-identity idle threshold trips.
- **All-agent-idle:** `AllAgentIdle detected: <signal>` — only when the trio-wide idle predicate holds.
- **Gate-closed:** `Wake safety gate closed; skipping ...` — only when a high-authority dispatch was suppressed.
- **Shutdown:** `Received SIGTERM; stopping.` + `Heartbeat stopped.` — fires on `launchctl bootout`.

A healthy idle daemon may emit nothing for many cycles in a row (no expired tasks, no sunset, no idle-out, no all-idle, no gate-closed). The startup line + an empty stderr log is the steady-state proof of life. **Do not infer "daemon stopped polling" from log silence past startup** — silence during agent-active periods is the token-economy gate working as designed.

> ⚠️ **Lock-as-evidence anti-pattern:** the file `.neo-ai-data/heartbeat-concurrency.lock` is **producer-side state** — created by `acquireHeartbeatLock` when expensive agent work starts (#10319 `withHeartbeatLock`), removed when that work finishes. The heartbeat daemon only *inspects + releases stale locks*, never touches it on healthy idle pulses. **Do not watch the lock's mtime as a polling-health indicator** — a healthy daemon may go hours without touching it.

#### Healthcheck-side verification (#10783)

For a single-call observability check that doesn't require `tail -f` against multiple log files, the Memory Core healthcheck surfaces the wake substrate's three operational dimensions in one block. Call any healthcheck-emitting tool (e.g. `mcp__neo-mjs-memory-core__healthcheck`) and inspect the `features.wake` block:

```jsonc
"features": {
    "wake": {
        "gateState": "enabled",       // 'enabled' | 'disabled' | 'tripped' | 'unknown'
        "gateReason": "",
        "gateTrippedAt": null,
        "gateTrippedBy": null,
        "daemonRunning": true,        // mtime of heartbeat-liveness file < 10min
        "lastPulseAt": "2026-05-07T20:51:52.141Z",
        "secondsSinceLastPulse": 12
    }
}
```

The `daemonRunning` heuristic reads the dedicated liveness file `.neo-ai-data/wake-daemon/heartbeat.alive` — touched by `swarm-heartbeat.sh` at the top of every pulse loop iteration, NOT the producer-side concurrency lock above. `gateState` is read via `wakeSafetyGate.readGateState`. Field semantics + defensive defaults documented inline at `HealthService.buildWakeFeaturesBlock`.

**Use this for:** quick night-shift readiness check from the agent harness; integration tests asserting daemon-running invariants; operator dashboards consuming the healthcheck JSON. **Use `tail -f` for:** real-time event observation (sweep / sunset / idle-out / gate-closed events as they fire).

If the startup log line never appears, the daemon failed to launch. Common causes: `WorkingDirectory` mis-substituted (script can't find `.neo-ai-data/`), `PATH` missing critical CLI tool (sqlite3, node, gh), or the script crashed at module-load (check `heartbeat.stderr.log` for `ReferenceError: Neo is not defined` or similar).

## 4. Uninstall procedure

```bash
# Bootout (stop + unload) the LaunchAgent — sends SIGTERM, which the singleton
# handles via clean shutdown (clearTimeout on the next pulse + process.exit(0))
launchctl bootout gui/$(id -u)/com.neomjs.swarm-heartbeat

# Verify unload
launchctl list | grep com.neomjs
# expected output: empty (no matches)

# Optional: remove the plist
rm ~/Library/LaunchAgents/com.neomjs.swarm-heartbeat.plist
```

The daemon stops cleanly without state damage; the SQLite DB, ChromaDB, and Memory Core data are unaffected by daemon lifecycle.

## 5. Linux systemd sibling (out-of-scope-for-v1 sketch)

The Linux analog uses systemd's user-service substrate. **Not committed as a template in v1** because no operator has empirically validated against a Linux deployment yet. Future ticket should produce a committed `.service` file once a Linux operator validates.

Sketch shape:

```ini
# ~/.config/systemd/user/swarm-heartbeat.service
[Unit]
Description=Neo.mjs SwarmHeartbeatService
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/repo
ExecStart=/usr/bin/env node /path/to/repo/ai/scripts/swarm-heartbeat-daemon.mjs
Restart=always
RestartSec=10
Environment="NEO_AGENT_IDENTITY=@your-identity"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
StandardOutput=append:/path/to/repo/.neo-ai-data/wake-daemon/heartbeat.stdout.log
StandardError=append:/path/to/repo/.neo-ai-data/wake-daemon/heartbeat.stderr.log

[Install]
WantedBy=default.target
```

Loaded via `systemctl --user daemon-reload && systemctl --user enable --now swarm-heartbeat.service`. Verified via `systemctl --user status swarm-heartbeat.service`.

## 6. Troubleshooting (common gotchas observed in launchd-daemon authoring)

| Symptom | Likely cause | Fix |
|---|---|---|
| Daemon "loaded" but no log lines | `WorkingDirectory` placeholder unsubstituted OR substituted to wrong path | Re-run §3a sed with correct repo root; `launchctl bootout` + `bootstrap` to reload |
| `node: command not found` in stderr log | `PATH` env var doesn't include node's location | Add node's actual install dir to the plist `EnvironmentVariables.PATH` (check via `which node` in your interactive shell) |
| `gh: command not found` in stderr log | Same — Homebrew's `gh` not in default launchd PATH | Add `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel) to plist PATH |
| `tmux: command not found` | Same PATH issue; tmux-injection is best-effort and silently no-ops if absent | Add tmux's install dir to plist PATH OR accept the no-op (heartbeat still runs) |
| `ReferenceError: Neo is not defined` | Module-load ordering broke the Neo prelude | File a bug — `ai/scripts/swarm-heartbeat-daemon.mjs` (entry-point wrapper) MUST import `Neo` + `core/_export` + `InstanceManager` before importing the class file; regressions here have a documented anchor |
| `KeepAlive` causing rapid relaunch loop | Script crashes on startup (config error, missing dependency) | Check `heartbeat.stderr.log` for the actual crash; FIX the crash before lengthening `ThrottleInterval` (do not paper over real bugs) |
| Daemon runs but doesn't trigger recovery wakes | `wakeSafetyGate.json` is `tripped` (deny-by-default) | Operator-territory: `node ai/scripts/wakeSafetyGate.mjs enable --reason "validated post-#10671"` AFTER end-to-end validation per [Epic #10671](https://github.com/neomjs/neo/issues/10671) |
| Two heartbeat pulse producers firing | Both `swarm-heartbeat.sh` AND launchd-loaded `SwarmHeartbeatService` running | Pick one. The shell wrapper is for developer-interactive use; launchd is for night-shift / persistent-process. Don't run both. |

## 7. Relationship to operator-territory steps (#10671 epic-finish)

Persistent-process management (THIS doc) is one of three integration steps for night-shift readiness:

1. **Persistent-process management** (this doc) — install + verify launchd plist for `ai/scripts/swarm-heartbeat-daemon.mjs` (entry-point wrapper)
2. **`wakeSafetyGate` untrip** — `node ai/scripts/wakeSafetyGate.mjs enable --reason "..."` after empirical validation that the cross-harness prompt-landing matrix (#10649) holds
3. **End-to-end validation** — simulate mutual-idle scenario; verify recovery wake fires correctly to a healthy peer; confirm fresh-session-spawn lands cleanly without runaway-spawn pattern from 2026-05-03

All three must complete for the swarm to operate continuously during operator-offline (night-shift) hours.

## 8. Pre-run discipline reminder

Per [#10780](https://github.com/neomjs/neo/issues/10780): before re-enabling DreamMode/Sandman (separate substrate from the heartbeat daemon — `autoDream` / `autoGoldenPath` config flags currently disabled in operator-local `config.mjs`), **always run `npm run ai:backup` first.** The backup primitive captures atomic-bundle state across KB + MC + graph + concepts + trajectories. DreamMode regressions can produce graph state that's expensive to recover from without a backup. The heartbeat daemon itself does NOT trigger DreamMode; it triggers recovery wakes for sunsetted agents — but the discipline applies to the broader Dream Pipeline substrate they're part of.

## 9. Related substrate

- **Daemon entry-point wrapper:** `ai/scripts/swarm-heartbeat-daemon.mjs` (#11058 split — Neo bootstrap + signal handlers + start invocation; the launchd / systemd target)
- **Daemon class source:** `ai/daemons/SwarmHeartbeatService.mjs` (Neo-singleton; #10789; class-only since #11058)
- **Sibling bash wrapper:** `ai/scripts/swarm-heartbeat.sh` (developer-interactive, NOT the persistent-process target; preserved per #10789 AC10)
- **Daemon dependencies:** `checkSunsetted.mjs`, `resumeHarness.mjs`, `wakeSafetyGate.mjs`, `sweepExpiredTasks.mjs`, `heartbeatLock.mjs`, `idleOutNudge.mjs`, `checkAllAgentIdle.mjs`, `trioWakeCooldown.mjs`
- **Parent epic:** [#10671](https://github.com/neomjs/neo/issues/10671) — Substrate-restart recovery (two-mode: idle-out + sunset)
- **Implementation ticket:** [#10789](https://github.com/neomjs/neo/issues/10789) — SwarmHeartbeatService Neo-singleton replacement
- **Closed-not-planned predecessors:** [#10781](https://github.com/neomjs/neo/issues/10781), [#10787](https://github.com/neomjs/neo/issues/10787), PR [#10782](https://github.com/neomjs/neo/pull/10782) — bash-shape attempt; closed for architectural pattern violation
- **Sub-tickets resolved by this substrate:** [#10396](https://github.com/neomjs/neo/issues/10396), [#10399](https://github.com/neomjs/neo/issues/10399), [#10633](https://github.com/neomjs/neo/issues/10633)
- **Sibling discipline:** [#10780](https://github.com/neomjs/neo/issues/10780) — Backup-first before DreamMode/Sandman; [`learn/agentos/DreamPipeline.md`](../DreamPipeline.md) for DreamMode-specific operational discipline
- **Adjacent observability gap:** healthcheck `features.wake` block (gate-state + daemon-running-state + last-pulse timestamp) — currently neither healthcheck-surfaced nor ticketed; sibling-fileable extension of [#10779](https://github.com/neomjs/neo/issues/10779) (`features.dream` healthcheck)

## 10. Sibling daemon: Bridge Daemon Installation (#11066)

The Phase 3 wake-substrate **bridge daemon** (`ai/scripts/bridge-daemon.mjs`) is a parallel persistent-process to SwarmHeartbeatService — runs the SQLite GraphLog wake-event coalescer + osascript / tmux delivery loop. Without persistent-process management, the operator must keep a terminal open running `node ai/scripts/bridge-daemon.mjs` continuously, which blocks operator laptop-close / restart / machine-switch.

**Sibling-pattern lift from §3:** the bridge daemon installs identically to SwarmHeartbeatService — same launchd primitive, same substitution pattern, same troubleshooting gotchas. This section codifies the bridge-specific delta only.

**Coexistence:** bridge + heartbeat are independent daemons. Both write to `.neo-ai-data/wake-daemon/` (bridge: `bridge.log` / `bridge-daemon.pid`; heartbeat: `heartbeat-concurrency.lock` / `heartbeat.{stdout,stderr}.log`). They can install / uninstall independently. The PID-lock substrate (#10422 / #10423) prevents two bridge daemons from running concurrently (the second one exits cleanly).

### 10a. Operator empirical-prerequisites

```bash
# 1. Daemon entrypoint exists
test -f ai/scripts/bridge-daemon.mjs && echo "OK" || echo "FAIL: bridge-daemon.mjs missing"

# 2. State directory exists (created on first run, but worth pre-checking)
ls -la .neo-ai-data/wake-daemon/

# 3. SQLite graph database exists (bridge tail-syncs from it)
ls -la .neo-ai-data/sqlite/memory-core-graph.sqlite

# 4. Manual one-shot execution works (matches the existing operator-terminal pattern)
npm run ai:bridge &
DAEMON_PID=$!
sleep 10
kill -TERM "$DAEMON_PID"
wait "$DAEMON_PID" 2>/dev/null
# Expected:
#   1. "[Bridge Daemon] Started. Tail-syncing from GraphLog ID: <N>" log line on launch
#   2. Quiet poll loop (no errors)
#   3. Clean exit on SIGTERM
```

### 10b. macOS launchd installation procedure

```bash
# From repo root, copy the template + substitute placeholders
cp learn/agentos/wake-substrate/com.neomjs.bridge-daemon.plist.template \
   ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist

# Substitute repo-root path (this assumes you run this command FROM the repo root)
sed -i '' "s|\[OPERATOR_SUBSTITUTE_REPO_ROOT\]|$(pwd)|g" \
   ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist

# Verify substitution succeeded — should be ZERO matches remaining
grep -c "OPERATOR_SUBSTITUTE" ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist
# expected output: 0

# Lint the plist syntax
plutil -lint ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist
# expected output: <path>: OK

# Bootstrap (load + start) the LaunchAgent
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist

# Verify it's running
launchctl list com.neomjs.bridge-daemon
# expected output: PID number + "0" exit status
```

**Note:** the bridge-daemon plist has NO `NEO_AGENT_IDENTITY` env-var (unlike heartbeat) — bridge is identity-agnostic; it processes wake events for ALL identities with active subscriptions. The optional `NEO_AI_DB_PATH` and `NEO_AI_DAEMON_DIR` overrides exist for non-default workspace layouts.

### 10c. Migration from operator-terminal-running mode

Operators currently keeping `node ai/scripts/bridge-daemon.mjs` alive in a terminal can transition cleanly:

```bash
# 1. Identify the running terminal-managed bridge
ps aux | grep "bridge-daemon.mjs" | grep -v grep
# Note the PID

# 2. Send SIGTERM to the operator-terminal-managed instance
kill -TERM <PID>

# 3. Verify it exited cleanly (PID file removed, no zombie)
ls .neo-ai-data/wake-daemon/bridge-daemon.pid
# expected: file does not exist

# 4. Bootstrap the launchd-managed instance per §10b above

# 5. Verify launchd-managed instance is running
launchctl list com.neomjs.bridge-daemon
ps aux | grep "bridge-daemon.mjs" | grep -v grep
# expected: one process running, owned by launchd (no controlling terminal)

# 6. Operator can now close the terminal that previously held the manual daemon
```

### 10d. Uninstall procedure (mirrors §4)

```bash
# Stop + unload the LaunchAgent
launchctl bootout gui/$(id -u)/com.neomjs.bridge-daemon

# Remove the plist
rm ~/Library/LaunchAgents/com.neomjs.bridge-daemon.plist

# Verify no residual launchd registration
launchctl list | grep bridge-daemon
# expected: no output
```

If re-enabling later, repeat §10b — the template is preserved in the repo at `learn/agentos/wake-substrate/com.neomjs.bridge-daemon.plist.template`.

### 10e. Linux systemd sibling (out-of-scope-for-v1 sketch)

```ini
# ~/.config/systemd/user/bridge-daemon.service
[Unit]
Description=Neo.mjs Bridge Daemon (Phase 3 wake substrate)
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/repo
ExecStart=/usr/bin/env node /path/to/repo/ai/scripts/bridge-daemon.mjs
Restart=always
RestartSec=10
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
StandardOutput=append:/path/to/repo/.neo-ai-data/wake-daemon/bridge.stdout.log
StandardError=append:/path/to/repo/.neo-ai-data/wake-daemon/bridge.stderr.log

[Install]
WantedBy=default.target
```

Loaded via `systemctl --user daemon-reload && systemctl --user enable --now bridge-daemon.service`. Verified via `systemctl --user status bridge-daemon.service`.

### 10f. Troubleshooting (bridge-specific gotchas)

Most §6 gotchas apply identically to bridge-daemon. Bridge-specific additions:

| Symptom | Likely cause | Fix |
|---|---|---|
| Bridge daemon "loaded" but no wake events delivered | Subscriptions unset OR wakeSafetyGate tripped | Verify subscriptions via `gh issue list` queries against active WAKE_SUBSCRIPTION nodes; check gate state per §3c notes |
| `osascript: command not found` in stderr log | Same PATH issue as heartbeat | Add `/usr/bin` (osascript is system-installed at `/usr/bin/osascript`) |
| Two bridge daemons running | PID-lock substrate didn't fire OR plist installed before manual instance was killed | `kill` the operator-terminal instance per §10c step 2; PID-lock at `.neo-ai-data/wake-daemon/bridge-daemon.pid` |
| GraphLog tail-sync stuck at old ID | `lastSyncId` file corrupted OR DB schema drift | Inspect `.neo-ai-data/wake-daemon/lastSyncId`; if recovery needed, delete + restart (will tail from current GraphLog head, missing intervening events) |
