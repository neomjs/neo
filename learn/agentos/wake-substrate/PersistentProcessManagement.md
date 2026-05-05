# Persistent-Process Management for the Swarm Heartbeat Daemon

This document covers operator-side installation, verification, and uninstallation of `swarm-heartbeat-daemon.sh` as a persistent daemon process. Required for autonomous **night-shift mode** operation — without persistent-process management, the heartbeat daemon only runs when an operator manually invokes it and keeps the terminal open.

> **Verify-before-assert notice:** the plist template in this directory (`com.neomjs.swarm-heartbeat.plist.template`) is **author-side draft**. Correctness of the actual plist on a given operator's macOS install is operator-territory L3 verification. Do NOT install the template as-is without running the verification commands in §3 below.

## Compaction Taxonomy (3-Axis Slot Rule)
**Disposition:** `keep` (External Operator Guide; not injected into active agent context).
**Rationale:** Low-frequency (run once per host setup), high-severity (macOS `launchd` failure isolates the swarm), non-machine-enforceable (operator-territory CLI execution).

## 1. Why this exists

The wake substrate (Epic [#10671](https://github.com/neomjs/neo/issues/10671)) ships:

- `ai/scripts/swarm-heartbeat-daemon.sh` — continuous-loop bash daemon (5-minute poll by default)
- `ai/scripts/checkSunsetted.mjs` — sunset / idle-out detector consumed by the daemon
- `ai/scripts/resumeHarness.mjs` — recovery dispatcher invoked when a sunsetted agent is detected
- `ai/scripts/wakeSafetyGate.mjs` — fail-closed safety gate consulted before any high-authority recovery action

The daemon is structured as `while true; do … sleep $POLL_INTERVAL; done`. It must run as a long-lived process. macOS's native primitive for long-lived per-user daemons is **launchd LaunchAgent** (per-user, lives in `~/Library/LaunchAgents/`). Linux's analog is **systemd user service** (typically `~/.config/systemd/user/`); a sibling shape is sketched in §5 below but committed-template is macOS-only for v1.

## 2. Operator empirical-prerequisites

Before installing, verify on your local environment:

```bash
# 1. The daemon script exists and is executable
test -x ai/scripts/swarm-heartbeat-daemon.sh && echo "OK" || echo "FAIL: chmod +x ai/scripts/swarm-heartbeat-daemon.sh"

# 2. Required tools are reachable
which node sqlite3 gh

# 3. The .neo-ai-data dir tree exists (will be created if not, but worth pre-checking)
ls -la .neo-ai-data/wake-daemon/ .neo-ai-data/sqlite/

# 4. Manual one-shot execution works (macOS native timeout alternative)
NEO_AGENT_IDENTITY="@your-identity" perl -e 'alarm shift; exec @ARGV' 10 bash ai/scripts/swarm-heartbeat-daemon.sh
# (should produce log lines + exit cleanly when alarm hits; no errors in output)
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
# Watch the daemon's stdout — should show heartbeat poll activity
tail -f .neo-ai-data/wake-daemon/heartbeat.stdout.log

# Watch the daemon's stderr — should be empty during normal operation
tail -f .neo-ai-data/wake-daemon/heartbeat.stderr.log

# Watch the sweep-error log — daemon writes here on sunset / detector errors
tail -f .neo-ai-data/wake-daemon/sweep-errors.log

# Watch the concurrency lock — touched on each successful poll
ls -la .neo-ai-data/heartbeat-concurrency.lock
# mtime should advance every 5 minutes (default POLL_INTERVAL)
```

If the lock mtime does NOT advance after 10 minutes, the daemon is loaded but not polling. Common causes: `WorkingDirectory` mis-substituted (script can't find `.neo-ai-data/`), `PATH` missing critical CLI tool (sqlite3, node, gh), or the script crashed (check `heartbeat.stderr.log`).

## 4. Uninstall procedure

```bash
# Bootout (stop + unload) the LaunchAgent
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
Description=Neo.mjs Swarm Heartbeat Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/repo
ExecStart=/bin/bash /path/to/repo/ai/scripts/swarm-heartbeat-daemon.sh
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
| Daemon "loaded" but lock mtime never advances | `WorkingDirectory` placeholder unsubstituted OR substituted to wrong path | Re-run §3a sed with correct repo root; `launchctl bootout` + `bootstrap` to reload |
| `node: command not found` in stderr log | `PATH` env var doesn't include node's location | Add node's actual install dir to the plist `EnvironmentVariables.PATH` (check via `which node` in your interactive shell) |
| `gh: command not found` in stderr log | Same — Homebrew's `gh` not in default launchd PATH | Add `/opt/homebrew/bin` (Apple Silicon) or `/usr/local/bin` (Intel) to plist PATH |
| `sqlite3: command not found` | macOS ships sqlite3 at `/usr/bin/sqlite3` so this is rare; if it happens, PATH is misconfigured | Verify PATH includes `/usr/bin` |
| `KeepAlive` causing rapid relaunch loop | Script crashes on startup (config error, missing dependency) | Check `heartbeat.stderr.log` for the actual crash; FIX the crash before lengthening `ThrottleInterval` (do not paper over real bugs) |
| Daemon runs but doesn't trigger recovery wakes | `wakeSafetyGate.json` is `tripped` (deny-by-default) | Operator-territory: `node ai/scripts/wakeSafetyGate.mjs enable --reason "validated post-#10671"` AFTER end-to-end validation per [Epic #10671](https://github.com/neomjs/neo/issues/10671) |

## 7. Relationship to operator-territory steps (#10671 epic-finish)

Persistent-process management (THIS doc) is one of three integration steps for night-shift readiness:

1. **Persistent-process management** (this doc) — install + verify launchd plist
2. **`wakeSafetyGate` untrip** — `node ai/scripts/wakeSafetyGate.mjs enable --reason "..."` after empirical validation that the cross-harness prompt-landing matrix (#10649) holds
3. **End-to-end validation** — simulate mutual-idle scenario; verify recovery wake fires correctly to a healthy peer; confirm fresh-session-spawn lands cleanly without runaway-spawn pattern from 2026-05-03

All three must complete for the swarm to operate continuously during operator-offline (night-shift) hours.

## 8. Pre-run discipline reminder

Per [#10780](https://github.com/neomjs/neo/issues/10780): before re-enabling DreamMode/Sandman (separate substrate from the heartbeat daemon — `autoDream` / `autoGoldenPath` config flags currently disabled in operator-local `config.mjs`), **always run `npm run ai:backup` first.** The backup primitive captures atomic-bundle state across KB + MC + graph + concepts + trajectories. DreamMode regressions can produce graph state that's expensive to recover from without a backup. The heartbeat daemon itself does NOT trigger DreamMode; it triggers recovery wakes for sunsetted agents — but the discipline applies to the broader Dream Pipeline substrate they're part of.

## 9. Related substrate

- **Daemon source:** `ai/scripts/swarm-heartbeat-daemon.sh`
- **Daemon dependencies:** `checkSunsetted.mjs`, `resumeHarness.mjs`, `wakeSafetyGate.mjs`, `sweepExpiredTasks.mjs`, `heartbeatLock.mjs`
- **Parent epic:** [#10671](https://github.com/neomjs/neo/issues/10671) — Substrate-restart recovery (two-mode: idle-out + sunset)
- **Sub-tickets resolved by this substrate:** [#10396](https://github.com/neomjs/neo/issues/10396), [#10399](https://github.com/neomjs/neo/issues/10399), [#10633](https://github.com/neomjs/neo/issues/10633)
- **Filing ticket:** [#10781](https://github.com/neomjs/neo/issues/10781) — Persistent-process management (this doc + the plist template are AC1+AC2 of #10781)
- **Sibling discipline:** [#10780](https://github.com/neomjs/neo/issues/10780) — Backup-first before DreamMode/Sandman; [`learn/agentos/DreamPipeline.md`](../DreamPipeline.md) for DreamMode-specific operational discipline
- **Adjacent observability gap:** healthcheck `features.wake` block (gate-state + daemon-running-state + last-pulse timestamp) — currently neither healthcheck-surfaced nor ticketed; sibling-fileable extension of [#10779](https://github.com/neomjs/neo/issues/10779) (`features.dream` healthcheck)
