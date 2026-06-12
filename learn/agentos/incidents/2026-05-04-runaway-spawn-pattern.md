# Incident: Runaway-Spawn Pattern (2026-05-03 / 2026-05-04)

> Forensic record for [#10672](https://github.com/neomjs/neo/issues/10672), sub of Epic [#10671](https://github.com/neomjs/neo/issues/10671) (substrate-restart recovery, two-mode). Captures the empirical anchors that triggered the architectural pivot from `Cmd+N`-into-running-app spawn to per-harness terminal-restart, and the test-suite vector that compounded the operator-observed harm.

| Attribute | Value |
|---|---|
| **Severity** | High (substrate-coherence violation; multi-day operator-visible) |
| **Detected** | 2026-05-03 14:41 CEST (heartbeat log) — operator-confirmed mid-day 2026-05-04 |
| **Acute Containment** | 2026-05-03 22:53 UTC (operator manual gate-trip) — production runaway loop closed by [#10683](https://github.com/neomjs/neo/pull/10683) (in-flight lock, merged) + [#10682](https://github.com/neomjs/neo/pull/10682) (test-suite vector, merged) |
| **Root Resolution** | ⏳ Pending [#10676](https://github.com/neomjs/neo/issues/10676) sunset-mode terminal-restart substrate. MC-server `currentSessionId` staleness across MCP-client reconnects remains until per-harness terminal-restart primitives land via [#10677](https://github.com/neomjs/neo/issues/10677) / [#10678](https://github.com/neomjs/neo/issues/10678) / [#10679](https://github.com/neomjs/neo/issues/10679). See "Containment vs. resolution" below. |
| **Author** | Claude Opus 4.7 (Claude Code) |
| **Origin Session ID** | `cce1fea5-32ff-410c-b820-2e9a27b3cd51` |

## Summary

Between 2026-05-03 14:41 and 16:02 CEST, `swarm-heartbeat.sh` fired Phase 1 Recovery for `@neo-opus-4-7` 17 times — 9 of those attempts dispatched `osascript` Cmd+N spawns into Claude Desktop. None of the spawned sessions saved a fresh `AGENT_MEMORY` because the operator manually pressed ESC on each one to prevent identity-uniqueness destruction. The substrate had no signal channel for ESC-as-rejection: it interpreted "no fresh memory observed" as "still need to spawn" and continued the loop. After ~80 minutes the operator manually tripped the wake safety gate ([#10648](https://github.com/neomjs/neo/issues/10648)) at 22:53 UTC, terminating the cycle.

The next morning (2026-05-04 09:03 UTC), the same prompt-payload pattern appeared in two NEW Claude Code worktrees during what the operator perceived as another runaway. Investigation traced the cause to the **unit test suite**: `npx run test-unit test/playwright/unit/ai/scripts/resumeHarness.spec.mjs` invokes `resumeHarness.mjs` as a real subprocess with `WAKE_GATE_OVERRIDE=1` and on hosts with Claude Desktop accessibility permission, the underlying `osascript` actually pastes the boot-grounding prompt into the live app. This was the test-suite-as-runaway-vector failure mode operator framed as: *"imagine a real night shift. one of you starts 'all' unit tests and game over."*

The root cause across both surface manifestations was the same: **parallel-session identity-uniqueness violation during long boot windows**, with no data-layer mutex preventing concurrent kill-and-spawn or paste operations against the same agent identity. Empirical port-collision crashes during `@neo-gemini-3-1-pro`'s independent `antigravity chat -n` investigation ([#10678](https://github.com/neomjs/neo/issues/10678)) on 2026-05-04 morning further validated that the OS process boundary alone does not enforce identity uniqueness at the Memory Core data layer.

## Timeline

All times in UTC unless otherwise noted.

### 2026-05-03 — Heartbeat-driven manifestation

| Time (UTC) | Event |
|---|---|
| 12:41:55 | `heartbeat-opus_4_7.log` first Phase 1 Recovery fire for `@neo-opus-4-7`, reason: "No active WAKE_SUBSCRIPTION" |
| 12:46–12:51 | 3 cycles of "No active WAKE_SUBSCRIPTION" reason — pre-#10641 staleness signal |
| 12:56:59 | Reason text shifts to "Last memory is 31m old (>10m threshold)" — the staleness predicate begins compounding |
| 13:12:02 | First successful `osascript` dispatch: "Successfully resumed @neo-opus-4-7 via osascript (Claude)" |
| 13:17–14:02 | 9 total successful `osascript` dispatches across the window. Memory-age reason climbs **31m → 242m** despite repeated spawns |
| 14:02:26 | Last `osascript` dispatch in this incident window |
| 22:53:09 | Operator manually trips `wake-safety-gate.json` via CLI: `state: tripped`, `trippedBy: cli` |

The 9 successful dispatches did NOT produce 9 fresh `AGENT_MEMORY` rows. The memory-age reason kept increasing because **the operator manually pressed ESC on each spawned Claude Desktop session** to prevent parallel-session identity-uniqueness destruction. The substrate observed only the surface signal ("no fresh memory") and could not distinguish operator rejection from genuine spawn failure.

### 2026-05-04 — Multi-day accumulation surfaces + test-suite vector

| Time (UTC) | Event |
|---|---|
| 05:33:42 | This forensic-record session bootstrapped (jsonl `ff7c9e0e-...`); operator pasted test-recovery prompt to begin investigation |
| ~07:00–08:00 | Empirical confirmation of MC-server `currentSessionId` staleness: `set_session_id` boot call returns `replacedSessionId: f839713d-...` (yesterday's session, persisted across MCP-client reconnects) |
| ~08:00 | Visual evidence captured: Claude Desktop "Recents" panel shows 19+ orphan boot-titled sessions across 5+ prompt-iteration generations — multi-day accumulation visible in the operator UI |
| ~08:30–09:00 | Operator-directed architectural pivot from Cmd+N spawn to per-harness terminal-restart; cross-family substrate-truth audit by `@neo-gpt` (MESSAGE:27a2b65b) and `@neo-gemini-3-1-pro` (MESSAGE:524a967d) shapes the consensus design |
| ~08:30 | Filed Epic [#10671](https://github.com/neomjs/neo/issues/10671) (substrate-restart recovery, two-mode) under [#10601](https://github.com/neomjs/neo/issues/10601) with 8 sub-issues |
| 09:03:29 | New Claude Code worktree `great-varahamihira-60699f` boots with the resumeHarness boot-grounding prompt as first user message |
| 09:03:45 | Second new Claude Code worktree `nice-wescoff-0ae915` boots with the same prompt (doubled-up, second instance queued in input) |
| 09:03–09:14 | Investigation traces the spawns to `@neo-gemini-3-1-pro`'s execution of `npx run test-unit test/playwright/unit/ai/scripts/resumeHarness.spec.mjs` while implementing PR [#10680](https://github.com/neomjs/neo/pull/10680) |
| 09:14:46 | Gemini explicitly confirms the test-suite cause (MESSAGE:58f3973c) and halts further test runs |
| 09:18:00 | PR [#10681](https://github.com/neomjs/neo/issues/10681) filed — mock-osascript discipline for `resumeHarness.spec.mjs` and similar specs |
| 09:30:48 | PR [#10682](https://github.com/neomjs/neo/pull/10682) opened (Playwright `test.skip` by default behind `RUN_LIVE_OSASCRIPT=1` opt-in) |
| ~09:45 | Operator merges PR #10682 — test-suite vector closed |
| ~09:53 | PR [#10683](https://github.com/neomjs/neo/pull/10683) opened by `@neo-gemini-3-1-pro` — substrate restart mutex (in-flight lock) implementing [#10674](https://github.com/neomjs/neo/issues/10674) |
| 10:05 | PR #10683 reviewed Approved by `@neo-opus-4-7` after empirical test verification (16 passed / 2 skipped) |

## Empirical Evidence

### Heartbeat log excerpts

`.neo-ai-data/wake-daemon/heartbeat-opus_4_7.log`:

```
[heartbeat 2026-05-03T14:41:55+02:00] Phase 1 Recovery Triggered for @neo-opus-4-7. Reason: No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)
[heartbeat 2026-05-03T14:46:56+02:00] Phase 1 Recovery Triggered for @neo-opus-4-7. Reason: No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)
[heartbeat 2026-05-03T14:51:57+02:00] Phase 1 Recovery Triggered for @neo-opus-4-7. Reason: No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)
[heartbeat 2026-05-03T14:56:59+02:00] Phase 1 Recovery Triggered for @neo-opus-4-7. Reason: Last memory is 31m old (>10m threshold)
... <reason text climbs across 12:56–14:02> ...
[heartbeat 2026-05-03T16:02:26+02:00] Phase 1 Recovery Triggered for @neo-opus-4-7. Reason: Last memory is 242m old (>10m threshold)
Successfully resumed @neo-opus-4-7 via osascript (Claude)
```

The corresponding logs for `@neo-gemini-3-1-pro` and `@neo-gpt` show analogous patterns (Antigravity osascript dispatches; `@neo-gpt` blocked at "No active WAKE_SUBSCRIPTION" because his subscription metadata was missing — separate failure mode, addressed by [#10645](https://github.com/neomjs/neo/issues/10645) AgentIdentity cache hydration fix).

### MC-server staleness confirmation

In this session's boot: `set_session_id({sessionId: 'cce1fea5-...'})` returned `replacedSessionId: 'f839713d-0e79-4599-b482-0b0e84fb8fd4'`. The `f839713d` session was the prior day's Row 2 work — it had persisted in the MCP server's process-local `SessionService.currentSessionId` despite the MCP client (Claude Code) restarting. This confirms: the OS process boundary at the harness level does NOT propagate fresh-process semantics to a long-running MCP server's in-process state.

### Test-suite spawn evidence

Two new Claude Code worktree jsonl files appeared 2026-05-04 09:03 UTC, each containing the EXACT `resumeHarness.mjs` boot-grounding prompt format with `Recovery context: test` (the `'test'` arg passed by `resumeHarness.spec.mjs` line 74 + line 113 to the real `resumeHarness.mjs` subprocess invocation). The wake-daemon log showed no corresponding wake delivery at 09:03 — the spawns came from a direct subprocess invocation with `WAKE_GATE_OVERRIDE=1` set, which bypassed the `wake-safety-gate.json` `state: tripped` protection.

### Visual multi-day accumulation

Claude Desktop's "Recents" panel screenshot showed 19+ orphan boot-titled sessions across 5+ prompt-iteration generations (titles ranging from `Initialize fresh session with startup configuration` ×7 to `Read startup instructions and coordinate` ×1). This evidenced the runaway pattern accumulating across multiple days, not just the 2026-05-03 incident window.

## Root Cause

**Parallel-session identity-uniqueness violation during long boot windows.**

Boot ramp for a fresh agent (`AGENTS_STARTUP.md` + `AGENTS.md` + `MEMORY.md` + tool reads + first `add_memory`) takes longer than the 5-minute `swarm-heartbeat.sh` cron interval. Even WITHOUT operator rejection, slow boot triggers a parallel spawn before the in-progress one saves its first memory. Result: multiple simultaneous agent instances under the same identity racing on:

- A2A targeting (sender chooses one identity; multiple sessions race to read+`mark_read`)
- Inbox `mark_read` collisions (siblings blind to messages already-read)
- Memory Core sessionId collisions
- Sunset semantics (drops one `WAKE_SUBSCRIPTION`; N-1 zombie sessions remain subscribed)
- Dream/REM synthesis (parallel narratives = synthesis garbage)

The 600-second time-based cooldown in `resumeHarness.mjs:79-89` does NOT prevent this, because it bounds time-since-last-spawn rather than spawn-completion-status. Boot ramp routinely exceeds 600s on cold cache.

## Failure Modes (catalog)

The substrate had no signal channel to distinguish four operationally-different failure modes that all surface identically as "no fresh `AGENT_MEMORY` after spawn":

1. **User-ESC rejection** — operator manually halted spawn; substrate unaware
2. **Genuine spawn failure** — osascript permission denied, app not launched, etc.
3. **MC-server staleness** — fresh agent's writes land under stale `currentSessionId`
4. **Rate-limit during boot ramp** — agent reaches `add_memory` call but Anthropic API throttles, save deferred

All four expose the same observable signal — and the cooldown cycle compounds them indistinguishably. The fix MUST treat all four identically: detect the absence of fresh memory within a bounded window, mark the action abandoned, and apply backpressure.

## Substrate Response

### Test-suite vector ([#10681](https://github.com/neomjs/neo/issues/10681) / PR [#10682](https://github.com/neomjs/neo/pull/10682))

Playwright `test.skip(!process.env.RUN_LIVE_OSASCRIPT, ...)` discipline:

- Live-host runtime tests in `resumeHarness.spec.mjs` are skipped by default
- Static-config-check coverage retained as always-on tests via test-split
- Header documentation in describe scope cross-references `wake/daemon.spec.mjs` as the reference architecture for safe live-substrate testing (mock-osascript-on-PATH or `adapter: 'test'` test-stream)
- Merged 2026-05-04, closing the test-suite-as-runaway-vector failure mode

### In-flight lock primitive ([#10674](https://github.com/neomjs/neo/issues/10674) / PR [#10683](https://github.com/neomjs/neo/pull/10683))

`ai/scripts/inflightLock.mjs` — per-identity data-layer mutex:

- Lock file written before `sunset_restart` or `idle_out_nudge` actions
- `checkSunsetted.mjs` consults the lock before recommending recovery — skips action when lock is held and not expired
- Lock cleared via memory-resolved path (fresh `AGENT_MEMORY` with timestamp > `lock.acquiredAt`) OR expired-abandoned path (lock age > `BOOT_TIMEOUT_MS`, default 15 min)
- Auto-trips the wake safety gate ([#10648](https://github.com/neomjs/neo/issues/10648)) after `MAX_ABANDONED_ACTIONS` (default 3) consecutive abandoned actions per identity
- Same primitive guards both modes — sunset-restart (per `resumeHarness.mjs`) AND idle-out A2A nudges (per `trioWakeCooldown.mjs`)

### Detector contract ([#10673](https://github.com/neomjs/neo/issues/10673) / PR [#10689](https://github.com/neomjs/neo/pull/10689))

`ai/scripts/checkSunsetted.mjs` evolved to emit BOTH `sunset` and `idle_out_candidate` signals plus `evidence` fields and `recommended_action`. Two-mode signal disambiguation:

- `recommended_action: 'sunset_restart'` → terminal recovery via per-harness restart (#10676, pending)
- `recommended_action: 'idle_out_nudge'` → in-place A2A nudge via `idleOutNudge.mjs`
- `recommended_action: 'no_action'` → in-flight lock held OR no signal

### Idle-out A2A nudge dispatcher ([#10675](https://github.com/neomjs/neo/issues/10675) / PR [#10690](https://github.com/neomjs/neo/pull/10690))

`ai/scripts/idleOutNudge.mjs` — per-identity dispatcher consumed by `swarm-heartbeat.sh` when the detector emits `recommended_action: 'idle_out_nudge'`:

- Reuses A2A messaging path (`MailboxService.addMessage` → `wake-daemon` keystroke delivery); zero new transport, no fresh-session spawn
- Bounded / non-spawning / idempotent / no-destructive-type invariants enforced
- Distinct from `trioWakeCooldown.mjs` (swarm-wide all-idle); fires per-identity when ONE agent is stale while the swarm is otherwise active

## Prevention

The runaway-spawn pattern's pathways have a mix of shipped fixes and still-pending substrate work. The pattern is **contained** but not "fully fixed" until the sunset-mode restart substrate ([#10676](https://github.com/neomjs/neo/issues/10676)) lands per-harness terminal-restart primitives.

### Pathway containment status (as of 2026-05-04)

| Pathway | Pre-fix | Post-fix | Status |
|---|---|---|---|
| Slow boot ramp races next heartbeat | parallel spawn | in-flight lock blocks until memory-resolved or expired | ✅ shipped via [#10683](https://github.com/neomjs/neo/pull/10683) |
| User-ESC rejection | substrate blind to rejection | lock expires → counted as abandoned → auto-trip after N | ✅ shipped via [#10683](https://github.com/neomjs/neo/pull/10683) |
| Test-suite invokes real `resumeHarness.mjs` | osascript paste lands on host app | `test.skip(!RUN_LIVE_OSASCRIPT)` opt-in default-off | ✅ shipped via [#10682](https://github.com/neomjs/neo/pull/10682) |
| Detector cannot disambiguate sunset vs idle-out | binary `sunsetted` boolean conflated terminal-vs-recoverable | structured `recommended_action` enum + `evidence` fields | ✅ shipped via [#10689](https://github.com/neomjs/neo/pull/10689) |
| Per-identity stale memory (one agent idle while others active) | no recovery path; either no-op or accidental sunset-restart | bounded in-place A2A nudge via `idleOutNudge.mjs` | ✅ shipped via [#10690](https://github.com/neomjs/neo/pull/10690) |
| MC-server `currentSessionId` staleness | fresh agent writes under stale id | sunset-mode terminal-restart (Q1c, [#10676](https://github.com/neomjs/neo/issues/10676)) — fresh OS process = fresh MCP client handshake = fresh `currentSessionId` by construction | ⏳ **pending** — substrate work for [#10676](https://github.com/neomjs/neo/issues/10676) |
| Concurrent kill+spawn parallel-init | port collisions / data-layer races | serialized kill-before-spawn (operator-confirmed; [#10676](https://github.com/neomjs/neo/issues/10676) AC9) | ⏳ **pending** — substrate work for [#10676](https://github.com/neomjs/neo/issues/10676) |
| Per-harness restart primitive verification | unverified per-harness `kill+launch+inject-prompt` semantics | empirical proof per harness ([#10677](https://github.com/neomjs/neo/issues/10677) / [#10678](https://github.com/neomjs/neo/issues/10678) / [#10679](https://github.com/neomjs/neo/issues/10679)) | ⏳ **in flight** — Antigravity track via PR [#10680](https://github.com/neomjs/neo/pull/10680) |

**Containment vs. resolution:** the substrate fixes shipped (#10682, #10683, #10689, #10690) close the *acute* failure surfaces — the runaway-spawn loop cannot reproduce in production today because (a) the test-suite path that triggered it is now `[skipped]` by default, and (b) any production path that DID try to fire would be blocked by the in-flight lock. **However**, the *root underlying substrate concern* — MC-server `currentSessionId` staleness across MCP-client reconnects — remains until [#10676](https://github.com/neomjs/neo/issues/10676) lands per-harness terminal-restart. The `set_session_id` plumbing band-aid (proposed in #10627, abandoned with PR [#10670](https://github.com/neomjs/neo/pull/10670) closed-as-superseded) was the wrong layer; #10676 is the right substrate fix and is gated on per-harness investigations producing verified primitives.

Empirical validation that the in-flight lock is load-bearing (not theoretical): `@neo-gemini-3-1-pro`'s independent `antigravity chat -n` investigation ([#10678](https://github.com/neomjs/neo/issues/10678)) crashed her Memory Core MCP servers via parallel-init port collisions — the exact failure mode the lock prevents, observed in the wild.

## Lessons Captured

1. **Time-based cooldowns do not bound boot-completion.** Substrate gates that need to coordinate across boot ramps must be event-bounded (memory-resolved or expired-abandoned), not wall-clock-bounded.
2. **The OS process boundary is not the data-layer mutex.** Multiple harness instances sharing the same SQLite + mailbox can race even if the OS guarantees one app instance per user. The mutex must be explicit.
3. **Test files that invoke production scripts as real subprocesses with destructive side effects must default to `[skipped]`.** Operator framing: "imagine a real night shift. one of you starts 'all' unit tests and game over." `RUN_LIVE_OSASCRIPT=1` opt-in is the established pattern; future similar primitives follow it (with separate `RUN_LIVE_KILL_OPS=1` for kill-class operations per [#10676](https://github.com/neomjs/neo/issues/10676) AC10).
4. **Failure modes that surface identically must be remediated identically.** ESC-rejection, spawn-failure, MC-staleness, and rate-limit-during-boot all produce "no fresh memory after action" — the in-flight lock treats them as a single class with a single auto-trip backpressure path.
5. **Coordination collision risk is real for unassigned epic-sub pickup.** During this incident's substrate response, two agents began parallel implementation of the same in-flight lock primitive (`@neo-opus-4-7` started a draft on `agent/10674-inflight-lock-primitive`; `@neo-gemini-3-1-pro` opened PR #10683 ~3 minutes later). The discipline is "ping the most-likely-active peer before pickup, even on substrate-class work." Captured in [feedback memory](https://github.com/neomjs/neo) for future cycles.

## References

- **Epic:** [#10671](https://github.com/neomjs/neo/issues/10671) — Substrate-restart recovery (two-mode: idle-out + sunset)
- **Sub-issues filed during the response:**
  - [#10672](https://github.com/neomjs/neo/issues/10672) — this forensic record
  - [#10673](https://github.com/neomjs/neo/issues/10673) — `checkSunsetted` detector contract
  - [#10674](https://github.com/neomjs/neo/issues/10674) — In-flight lock primitive (PR [#10683](https://github.com/neomjs/neo/pull/10683))
  - [#10675](https://github.com/neomjs/neo/issues/10675) — Idle-out A2A nudge with cooldown
  - [#10676](https://github.com/neomjs/neo/issues/10676) — Sunset-mode restart substrate
  - [#10677](https://github.com/neomjs/neo/issues/10677) — Claude Desktop terminal-restart investigation
  - [#10678](https://github.com/neomjs/neo/issues/10678) — Antigravity terminal-restart investigation (PR [#10680](https://github.com/neomjs/neo/pull/10680))
  - [#10679](https://github.com/neomjs/neo/issues/10679) — Codex Desktop terminal-restart investigation
  - [#10681](https://github.com/neomjs/neo/issues/10681) — Mock osascript in unit tests (PR [#10682](https://github.com/neomjs/neo/pull/10682), merged)
- **Superseded:**
  - [#10627](https://github.com/neomjs/neo/issues/10627) — Steady-state `set_session_id` rotation (closed-as-superseded; PR [#10670](https://github.com/neomjs/neo/pull/10670) abandoned)
- **Adjacent prior wake-substrate forensics:** [#10641](https://github.com/neomjs/neo/issues/10641), [#10643](https://github.com/neomjs/neo/issues/10643), [#10644](https://github.com/neomjs/neo/issues/10644), [#10647](https://github.com/neomjs/neo/issues/10647), [#10648](https://github.com/neomjs/neo/issues/10648), [#10650](https://github.com/neomjs/neo/issues/10650)
- **Wake substrate primitives:** [#10312](https://github.com/neomjs/neo/issues/10312) Sleep-Cycle MVP, [#10357](https://github.com/neomjs/neo/issues/10357) Phase 3 wake substrate, [#10423](https://github.com/neomjs/neo/issues/10423) wake daemon PID-lock, [#10543](https://github.com/neomjs/neo/issues/10543) Sunset Unsubscribe Primitive
