#!/usr/bin/env node
/**
 * @summary Per-identity idle-out heartbeat-pulse dispatcher.
 *
 * Consumed by the Orchestrator swarm-heartbeat lane when `checkSunsetted.mjs`
 * emits `recommended_action: 'idle_out_nudge'` for a specific identity.
 * Emits a Shape B GraphLog-only heartbeat pulse via
 * `WakeSubscriptionService.emitHeartbeatPulse` — `bridge-daemon` delivers via
 * its existing harness adapter set. **Zero MESSAGE-node persistence, no
 * SENT_TO edge, no inbox surfacing.** Shape A heartbeat-via-mailbox-message has
 * been removed entirely.
 *
 * **Distinct from `swarmWakeCooldown.mjs`:** the swarm cooldown fires when ALL configured agents
 * idle simultaneously (swarm-wide signal); this dispatcher fires per-identity
 * when one specific agent's `AGENT_MEMORY` exceeds the idle threshold while
 * the swarm is otherwise active. Both reuse the `idle_out_nudge` lock mode from
 * `inflightLock.mjs` but operate independently — one identity going
 * idle is not a swarm-wide event.
 *
 * **Invariants:**
 *
 * - **Bounded:** the in-flight `idle_out_nudge` lock prevents re-fire within
 *   `BOOT_TIMEOUT_MS` (default 15 min, per `inflightLock.mjs`). One nudge per
 *   identity per window — no spam during long deep-thinking turns or rate-limit
 *   throttle.
 * - **non-spawning:** uses the bridge-daemon dispatch path via Shape B pulse.
 *   The recipient sees the pulse as a `[WAKE]` block whose digest line reads
 *   "N heartbeat pulses". No durable mailbox message, no transcript pollution.
 * - **Idempotent:** acquiring the lock is the gate. If a prior nudge is in
 *   flight (lock held), this invocation is a no-op. The detector contract in
 *   `checkSunsetted.mjs` ALSO consults the lock and downgrades the
 *   `recommended_action` to `'no_action'` when held — this dispatcher's
 *   defensive lock-check is layer-2 against detector-dispatcher race windows.
 *
 * **Safety gate integration:** consults `wakeSafetyGate.mjs` before
 * any action. Operator override `WAKE_GATE_OVERRIDE=1` bypasses the gate. Same
 * fail-closed pattern as `resumeHarness.mjs`.
 *
 * **Lock release path:** the lock is NOT cleared on dispatcher success — it
 * stays held until `checkInflightLock` (called by `checkSunsetted.mjs` on the
 * next heartbeat cycle) detects a fresh `AGENT_MEMORY` post-lock-acquire and
 * clears it. This is the memory-resolved release path owned by
 * `inflightLock.mjs`. If the recipient never saves a memory (rejection,
 * sustained rate-limit), the lock ages out at `BOOT_TIMEOUT_MS` and is
 * cleared as "abandoned" — `MAX_ABANDONED_ACTIONS` triggers the wake safety
 * gate auto-trip.
 *
 * @see ai/scripts/lifecycle/checkSunsetted.mjs    — detector emitting `recommended_action: 'idle_out_nudge'`
 * @see ai/scripts/lifecycle/inflightLock.mjs      — `idle_out_nudge` lock mode
 * @see ai/daemons/SwarmHeartbeatService.mjs       — caller; routes on `recommended_action`
 * @see ai/services/memory-core/WakeSubscriptionService.mjs — `emitHeartbeatPulse` Shape B primitive
 * @see ai/scripts/lifecycle/swarmWakeCooldown.mjs  — sibling for swarm-wide all-idle case
 * @see ai/scripts/lifecycle/resumeHarness.mjs     — sibling for sunset-restart case
 * @see test/playwright/unit/ai/scripts/idleOutNudge.spec.mjs
 * @plane in-plane
 */
import Neo                                                       from '../../../src/Neo.mjs';
import * as core                                                 from '../../../src/core/_export.mjs';
import path                                                      from 'path';
import {fileURLToPath}                                           from 'url';
import LifecycleService                                          from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import GraphService                                              from '../../services/memory-core/GraphService.mjs';
import WakeSubscriptionService                                   from '../../services/memory-core/WakeSubscriptionService.mjs';
import RequestContextService                                     from '../../mcp/server/shared/services/RequestContextService.mjs';
import {hasOverride, readGateState}                              from './wakeSafetyGate.mjs';
import {writeInflightLock, clearInflightLock, checkInflightLock} from './inflightLock.mjs';

/**
 * @summary Dispatch a single idle-out heartbeat pulse to the target identity.
 *
 * Sequence (mirrors `resumeHarness.mjs` defense-in-depth pattern):
 *   1. Wake safety gate check (with `WAKE_GATE_OVERRIDE` operator bypass)
 *   2. Initialize Memory Core services
 *   3. Defensive in-flight lock check (handles detector-dispatcher race window)
 *   4. Acquire in-flight `idle_out_nudge` lock
 *   5. Emit Shape B heartbeat pulse via `WakeSubscriptionService.emitHeartbeatPulse`
 *   6. On emit error: clear lock + fail loudly (so retry isn't blocked for the
 *      full `BOOT_TIMEOUT_MS` window)
 *
 * Lock is NOT cleared on success; release is memory-resolved.
 *
 * @param {string} identity Target agent identity (e.g., '@neo-opus-ada').
 * @returns {Promise<void>}
 */
export async function idleOutNudge(identity) {
    // 1. Wake safety gate. Fail-closed; operator override via WAKE_GATE_OVERRIDE=1.
    if (hasOverride()) {
        console.error('[OVERRIDE] WAKE_GATE_OVERRIDE set; bypassing wake safety gate for idleOutNudge.');
    } else {
        const gate = await readGateState();
        if (gate.state !== 'enabled') {
            console.error(`Skipping idle-out nudge for ${identity}: Wake safety gate ${gate.state} (reason: ${gate.reason}). Set WAKE_GATE_OVERRIDE=1 to override.`);
            return;
        }
    }

    // 2. Await Memory Core service readiness before graph access.
    await LifecycleService.ready();
    await GraphService.ready();

    // 3. Defensive in-flight lock check. The detector contract in checkSunsetted.mjs
    //    SHOULD have already filtered this out — it consults the lock and downgrades
    //    `recommended_action` to `'no_action'` when held. This dispatcher's check is
    //    layer-2 against the narrow detector-dispatcher race window where a lock could
    //    be acquired between detector-emit and dispatcher-execute.
    //
    //    `latestMemoryTimestampMs: 0` parameter forces the lock-state check (we can't
    //    cheaply re-query the latest memory here; the detector already did that work
    //    upstream and would have downgraded if memory-resolved). Edge case: if a memory
    //    landed between detector-emit and this check, we'd send an unnecessary nudge —
    //    bounded harm given the lock immediately blocks the next cycle.
    const lockCheck = await checkInflightLock(identity, 'idle_out_nudge', 0);
    if (lockCheck.inFlight) {
        console.error(`Skipping idle-out nudge for ${identity}: in-flight idle_out_nudge lock already held.`);
        return;
    }

    // 4. Acquire the in-flight lock BEFORE emitting — secures the nudge bounded window.
    await writeInflightLock(identity, 'idle_out_nudge', 0);

    const sender = process.env.NEO_AGENT_IDENTITY || '@system';

    // Machine-readable cycle-state carried in the pulse id (`<source>.<base64url-JSON>`) so the
    // bridge-daemon wake digest surfaces the next lifecycle step instead of an opaque "N heartbeat
    // pulses" — the receiver branches on the cycle without prose inference (the idle-holding fix).
    const pulseId = `idle-out-nudge.${Buffer.from(JSON.stringify({
        source    : 'idle-out-nudge',
        reason    : 'idle: no recent AGENT_MEMORY while the swarm is active',
        nextAction: 'drain the lifecycle queue (own-PR changes → designated reviews → own-PR green → request review), then claim a non-colliding backlog lane'
    })).toString('base64url')}`;

    // 5. Emit Shape B heartbeat pulse. Creates an ephemeral GraphLog entry tagged
    //    as `heartbeat_pulse`; bridge-daemon's resync() picks it up + dispatches
    //    via the existing adapter set (osascript / codex-app-server / etc.).
    //    NO MESSAGE node persisted, NO SENT_TO edge, NO inbox surfacing.
    //    Idempotent: if no active bridge-daemon subscription for the identity,
    //    the emit no-ops (logged, not throws).
    try {
        await RequestContextService.run({agentIdentityNodeId: sender}, async () => {
            await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: identity, pulseId});
        });
        console.error(`[idleOutNudge] Emitted heartbeat pulse to ${identity}`);
    } catch (err) {
        // 6. Emit-failure path: release the lock so the next interval can retry.
        //    Without this, a transient WakeSubscriptionService error would block all
        //    idle-out nudges for this identity for the full BOOT_TIMEOUT_MS window.
        console.error(`[idleOutNudge] Failed to emit heartbeat pulse to ${identity}: ${err.message}`);
        await clearInflightLock(identity, 'idle_out_nudge').catch(() => {});
        throw err;
    }
}

async function main() {
    const identity = process.argv[2];

    if (!identity) {
        console.error('Usage: idleOutNudge.mjs <identity>');
        process.exit(1);
    }

    await idleOutNudge(identity);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error('idleOutNudge unexpected error:', err.message);
        process.exit(1);
    });
}
