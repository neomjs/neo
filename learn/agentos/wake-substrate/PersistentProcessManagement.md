# Persistent-Process Management for SwarmHeartbeatService

This document covers operator-side installation, verification, and uninstallation of `ai/daemons/SwarmHeartbeatService.mjs` as a persistent daemon process. Required for autonomous **night-shift mode** operation — without persistent-process management, the heartbeat singleton only runs when an operator manually invokes the bash wrapper (`ai/scripts/swarm-heartbeat.sh`) interactively and keeps the terminal open.

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
# 1. The daemon entrypoint exists
test -f ai/daemons/SwarmHeartbeatService.mjs && echo "OK" || echo "FAIL: did you check out the #10789 branch?"

# 2. Required tools are reachable
which node sqlite3 gh tmux

# 3. The .neo-ai-data dir tree exists (will be created if not, but worth pre-checking)
ls -la .neo-ai-data/wake-daemon/ .neo-ai-data/sqlite/

# 4. Manual one-shot execution works — exercises the SIGTERM clean-shutdown path the
#    daemon's signal handlers (SwarmHeartbeatService.mjs) implement.
NEO_AGENT_IDENTITY="@your-identity" POLL_INTERVAL=10 \
   node ai/daemons/SwarmHeartbeatService.mjs &
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
ExecStart=/usr/bin/env node /path/to/repo/ai/daemons/SwarmHeartbeatService.mjs
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
| `ReferenceError: Neo is not defined` | Module-load ordering broke the Neo prelude | File a bug — `SwarmHeartbeatService.mjs` should always import `Neo` + `core/_export` first; regressions here have a documented anchor |
| `KeepAlive` causing rapid relaunch loop | Script crashes on startup (config error, missing dependency) | Check `heartbeat.stderr.log` for the actual crash; FIX the crash before lengthening `ThrottleInterval` (do not paper over real bugs) |
| Daemon runs but doesn't trigger recovery wakes | `wakeSafetyGate.json` is `tripped` (deny-by-default) | Operator-territory: `node ai/scripts/wakeSafetyGate.mjs enable --reason "validated post-#10671"` AFTER end-to-end validation per [Epic #10671](https://github.com/neomjs/neo/issues/10671) |
| Two heartbeat pulse producers firing | Both `swarm-heartbeat.sh` AND launchd-loaded `SwarmHeartbeatService` running | Pick one. The shell wrapper is for developer-interactive use; launchd is for night-shift / persistent-process. Don't run both. |

## 7. Relationship to operator-territory steps (#10671 epic-finish)

Persistent-process management (THIS doc) is one of three integration steps for night-shift readiness:

1. **Persistent-process management** (this doc) — install + verify launchd plist for `SwarmHeartbeatService.mjs`
2. **`wakeSafetyGate` untrip** — `node ai/scripts/wakeSafetyGate.mjs enable --reason "..."` after empirical validation that the cross-harness prompt-landing matrix (#10649) holds
3. **End-to-end validation** — simulate mutual-idle scenario; verify recovery wake fires correctly to a healthy peer; confirm fresh-session-spawn lands cleanly without runaway-spawn pattern from 2026-05-03

All three must complete for the swarm to operate continuously during operator-offline (night-shift) hours.

## 8. Pre-run discipline reminder

Per [#10780](https://github.com/neomjs/neo/issues/10780): before re-enabling DreamMode/Sandman (separate substrate from the heartbeat daemon — `autoDream` / `autoGoldenPath` config flags currently disabled in operator-local `config.mjs`), **always run `npm run ai:backup` first.** The backup primitive captures atomic-bundle state across KB + MC + graph + concepts + trajectories. DreamMode regressions can produce graph state that's expensive to recover from without a backup. The heartbeat daemon itself does NOT trigger DreamMode; it triggers recovery wakes for sunsetted agents — but the discipline applies to the broader Dream Pipeline substrate they're part of.

## 9. Related substrate

- **Daemon source:** `ai/daemons/SwarmHeartbeatService.mjs` (Neo-singleton; #10789)
- **Sibling bash wrapper:** `ai/scripts/swarm-heartbeat.sh` (developer-interactive, NOT the persistent-process target; preserved per #10789 AC10)
- **Daemon dependencies:** `checkSunsetted.mjs`, `resumeHarness.mjs`, `wakeSafetyGate.mjs`, `sweepExpiredTasks.mjs`, `heartbeatLock.mjs`, `idleOutNudge.mjs`, `checkAllAgentIdle.mjs`, `trioWakeCooldown.mjs`
- **Parent epic:** [#10671](https://github.com/neomjs/neo/issues/10671) — Substrate-restart recovery (two-mode: idle-out + sunset)
- **Implementation ticket:** [#10789](https://github.com/neomjs/neo/issues/10789) — SwarmHeartbeatService Neo-singleton replacement
- **Closed-not-planned predecessors:** [#10781](https://github.com/neomjs/neo/issues/10781), [#10787](https://github.com/neomjs/neo/issues/10787), PR [#10782](https://github.com/neomjs/neo/pull/10782) — bash-shape attempt; closed for architectural pattern violation
- **Sub-tickets resolved by this substrate:** [#10396](https://github.com/neomjs/neo/issues/10396), [#10399](https://github.com/neomjs/neo/issues/10399), [#10633](https://github.com/neomjs/neo/issues/10633)
- **Sibling discipline:** [#10780](https://github.com/neomjs/neo/issues/10780) — Backup-first before DreamMode/Sandman; [`learn/agentos/DreamPipeline.md`](../DreamPipeline.md) for DreamMode-specific operational discipline
- **Adjacent observability gap:** healthcheck `features.wake` block (gate-state + daemon-running-state + last-pulse timestamp) — currently neither healthcheck-surfaced nor ticketed; sibling-fileable extension of [#10779](https://github.com/neomjs/neo/issues/10779) (`features.dream` healthcheck)
