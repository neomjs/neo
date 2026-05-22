#!/usr/bin/env node
/**
 * @summary Auto-Wakeup Substrate Detection Logic — two-mode detector contract (Epic #10601, sub #10673).
 *
 * Queries the SQLite GraphLog to determine whether an agent identity is in
 * one of two recovery-relevant states:
 *
 *   - **`sunset`** (terminal): the `WAKE_SUBSCRIPTION` is missing / disabled
 *     / degraded. The `session-sunset` workflow's Unsubscribe primitive is the
 *     authoritative signal — staleness alone is NOT a sunset signal (#10641
 *     codified this discipline). Recovery: per-harness terminal-restart per
 *     #10676 sunset-mode restart substrate.
 *   - **`idle_out_candidate`** (recoverable): subscription is active AND the
 *     last `AGENT_MEMORY` is older than `IDLE_THRESHOLD_MS` (10 min default,
 *     matches `checkAllAgentIdle.mjs` convention). Recovery: in-place A2A
 *     heartbeat nudge per #10675 — bounded, non-spawning, idempotent.
 *
 * The two signals are mutually exclusive by construction: `sunset` requires
 * `subscription_active: false`; `idle_out_candidate` requires
 * `subscription_active: true`. Both can be `false` simultaneously (the no-op
 * "agent is operating normally" case).
 *
 * **Output shape (#10673 contract):**
 *
 *     {
 *       identity: '@neo-opus-4-7',
 *       sunset: false,
 *       idle_out_candidate: true,
 *       evidence: {
 *         subscription_active: true,
 *         subscription_status: 'active',     // 'missing' | 'active' | 'degraded' | 'disabled'
 *         last_memory_age_min: 12,
 *         last_sessionId: 'cce1fea5-...'
 *       },
 *       recommended_action: 'idle_out_nudge', // 'sunset_restart' | 'idle_out_nudge' | 'no_action'
 *
 *       // Backward-compat fields (#10673 AC5) for callers not yet migrated:
 *       sunsetted: false,            // mirrors `sunset`
 *       reason: '',                   // human-readable
 *       originSessionId: 'cce1fea5-...',  // = evidence.last_sessionId
 *       abandonedCount: 0             // from in-flight lock check
 *     }
 *
 * **In-flight lock integration:** when a `sunset_restart` or `idle_out_nudge`
 * action is in flight (per `inflightLock.mjs`), the corresponding signal
 * downgrades to `false` — the substrate is already mid-recovery; no second
 * dispatch needed. This is the data-layer mutex that prevents the runaway-spawn
 * pattern documented in `learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md`.
 *
 * `AGENT_MEMORY` rows are read for origin-session extraction (so the
 * fresh-session-spawn boot prompt can carry the prior session ID for Memory
 * Core context-priming) and for update-on-read migration of legacy rows
 * lacking structured `timestamp` / `sessionId` / `agentIdentity` fields.
 *
 * @see ai/scripts/inflightLock.mjs        — in-flight lock primitive (#10674)
 * @see ai/daemons/SwarmHeartbeatService.mjs — primary consumer of detector output (Orchestrator swarm-heartbeat lane, #11766)
 * @see ai/scripts/resumeHarness.mjs       — sunset-mode action dispatcher
 * @see ai/scripts/trioWakeCooldown.mjs    — idle-out-mode action dispatcher (when #10675 lands)
 * @see learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md — pre-fix forensic context
 */
import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import LifecycleService from '../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import GraphService from '../services/memory-core/GraphService.mjs';
import { checkInflightLock } from './inflightLock.mjs';

/**
 * @summary Idle-out threshold — fresh `AGENT_MEMORY` newer than this is "active";
 * older is `idle_out_candidate`. Matches `checkAllAgentIdle.mjs:35` convention so
 * downstream consumers see consistent idle semantics across detectors.
 */
const IDLE_THRESHOLD_MS = parseInt(process.env.IDLE_THRESHOLD_MS, 10) || 10 * 60 * 1000;

/**
 * @summary Compute the sunset / idle-out detector payload for one agent identity.
 * @param {String} [identity] Agent identity to inspect.
 * @returns {Promise<Object>} Structured detector contract consumed by shell and daemon paths.
 */
export async function checkSunsetted(identity = process.env.NEO_AGENT_IDENTITY || '@neo-gemini-3-1-pro') {
    await LifecycleService.initAsync();

    // Ensure GraphService is initialized
    await GraphService.initAsync();
    const db = GraphService.db.storage.db;

    // 1. Query ALL subscriptions for this identity (regardless of status) so the
    //    detector can emit a structured `subscription_status` field rather than
    //    a binary "exists / doesn't exist". Per #10673 evidence-fields contract.
    const allSubsStmt = db.prepare(`
        SELECT json_extract(data, '$.properties.status')        as status,
               json_extract(data, '$.properties.harnessTarget') as harnessTarget
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.agentIdentity') = ?
    `);
    const allSubs = allSubsStmt.all(identity);

    // Determine subscription_status with the same precedence the prior
    // active-subs query encoded: 'active' wins over 'degraded'/'disabled'
    // (an identity with both an active sub and a disabled one is operationally
    // active). This preserves the #10641 sunset-detection discipline:
    // subscription presence beats staleness as the authoritative signal.
    let subscriptionStatus;
    if (allSubs.length === 0) {
        subscriptionStatus = 'missing';
    } else {
        const activeSub = allSubs.find(s =>
            (s.status ?? 'active') === 'active' && s.harnessTarget !== 'disabled'
        );
        if (activeSub) {
            subscriptionStatus = 'active';
        } else if (allSubs.some(s => s.harnessTarget === 'disabled')) {
            subscriptionStatus = 'disabled';
        } else {
            subscriptionStatus = 'degraded';
        }
    }
    const subscriptionActive = subscriptionStatus === 'active';

    // [Anchor & Echo] Option A: Upfront Bulk Migration for Legacy Rows
    // Legacy AGENT_MEMORY rows lack a structured 'timestamp' property (time was embedded in 'name').
    // If not migrated, 'ORDER BY COALESCE(timestamp, name)' falls back to 'name', and lexical
    // sorting ('Memory: 2026-05...') always places legacy rows above fresh rows (which have pure ISO strings).
    // Instead of probabilistic update-on-read (which blocks on the top-1 legacy row infinitely),
    // we perform a deterministic bulk-migration of ALL legacy rows for the target identity before querying.
    const legacyStmt = db.prepare(`
        SELECT id,
               data,
               json_extract(data, '$.properties.name')        as nameField,
               json_extract(data, '$.properties.description') as descField
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'AGENT_MEMORY'
          AND (json_extract(data, '$.properties.agentIdentity') = ? OR json_extract(data, '$.properties.userId') = ?)
          AND json_extract(data, '$.properties.timestamp') IS NULL
    `);
    const legacyRows = legacyStmt.all(identity, identity);

    if (legacyRows.length > 0) {
        const updateStmt = db.prepare(`UPDATE Nodes SET data = ? WHERE id = ?`);
        db.transaction((rows) => {
            for (const row of rows) {
                const tsMatch  = row.nameField?.match(/^Memory:\s+(.+)$/);
                const sidMatch = row.descField?.match(/inside session ([a-f0-9-]+)/);

                if (tsMatch && sidMatch) {
                    try {
                        const dataObj = JSON.parse(row.data);
                        dataObj.properties = dataObj.properties || {};
                        dataObj.properties.timestamp = tsMatch[1];
                        dataObj.properties.sessionId = sidMatch[1];
                        dataObj.properties.agentIdentity = identity;
                        updateStmt.run(JSON.stringify(dataObj), row.id);
                    } catch (err) {
                        // Ignore unparseable legacy rows
                    }
                }
            }
        })(legacyRows);
    }

    // 2. Find last AGENT_MEMORY for this identity + extract origin session ID.
    //    rows are `AGENT_MEMORY` (not `MEMORY`); identity tracks via `properties.userId`.
    //    Now that legacy rows are migrated, ORDER BY timestamp works deterministically.
    const memStmt = db.prepare(`
        SELECT json_extract(data, '$.properties.timestamp')   as timestampField,
               json_extract(data, '$.properties.sessionId')   as sessionIdField
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'AGENT_MEMORY'
          AND (json_extract(data, '$.properties.agentIdentity') = ? OR json_extract(data, '$.properties.userId') = ?)
        ORDER BY COALESCE(json_extract(data, '$.properties.timestamp'), json_extract(data, '$.properties.name')) DESC
        LIMIT 1
    `);
    const memRow = memStmt.get(identity, identity);

    const originSessionId = memRow?.sessionIdField || '';
    const lastMemTimeMs   = memRow?.timestampField ? new Date(memRow.timestampField).getTime() : 0;
    const memAgeMs        = lastMemTimeMs ? (Date.now() - lastMemTimeMs) : null;
    const lastMemoryAgeMin = memAgeMs !== null ? Math.round(memAgeMs / 60000) : null;

    // 3. Compute the two signals via in-flight lock-aware logic.
    //
    // [Anchor & Echo] Sunset detection criterion: ONLY the explicit Unsubscribe primitive.
    //
    // Memory-staleness is NOT a sunset signal (#10641 codified this — see
    // historical context in `learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md`).
    // The authoritative sunset signal is the absence of an active
    // `WAKE_SUBSCRIPTION`. Staleness is reflected in `idle_out_candidate`
    // ONLY when paired with an active subscription, surfacing as a
    // lower-authority "candidate in-place nudge" signal — never as sunset.

    let sunset             = false;
    let idleOutCandidate   = false;
    let reason             = '';
    let lockData           = null;

    if (!subscriptionActive) {
        // Potential sunset path. Check in-flight lock first — if a sunset_restart
        // is already in flight, downgrade to no-op so we don't spawn a second.
        lockData = await checkInflightLock(identity, 'sunset_restart', lastMemTimeMs);

        if (lockData.inFlight) {
            sunset = false;
            reason = 'Sunset restart already in-flight (lock active)';
        } else {
            sunset = true;
            reason = `No active WAKE_SUBSCRIPTION (status: ${subscriptionStatus})`;
        }
    } else if (lastMemoryAgeMin !== null && memAgeMs > IDLE_THRESHOLD_MS) {
        // Active subscription + stale memory = candidate idle-out nudge.
        // Per @neo-gpt's #10683 substrate-truth audit on bounded discipline:
        // this signal is "candidate in-place nudge," NOT "agent is idle." The
        // consumer (per #10675) is responsible for the bounded/non-spawning/
        // idempotent/no-destructive-type guarantees on the action dispatch.
        lockData = await checkInflightLock(identity, 'idle_out_nudge', lastMemTimeMs);

        if (!lockData.inFlight) {
            idleOutCandidate = true;
        }
        // else: nudge already in flight; emit no_action recommendation.
    }

    // 4. Compute recommended_action — the single field the Orchestrator swarm-heartbeat
    //    lane / trioWakeCooldown.mjs / resumeHarness.mjs consume to fork into the
    //    right recovery path.
    let recommendedAction;
    if (sunset)                  recommendedAction = 'sunset_restart';
    else if (idleOutCandidate)   recommendedAction = 'idle_out_nudge';
    else                         recommendedAction = 'no_action';

    // 5. Emit structured + backward-compat output. Backward-compat fields
    //    (#10673 AC5) preserve `sunsetted` / `reason` / `originSessionId` /
    //    `abandonedCount` for consumers not yet migrated to the new shape.
    //    The Orchestrator swarm-heartbeat lane (`SwarmHeartbeatService`) reads
    //    these legacy fields via the direct module export today (#11766).
    return {
        identity,
        sunset,
        idle_out_candidate: idleOutCandidate,
        evidence: {
            subscription_active : subscriptionActive,
            subscription_status : subscriptionStatus,
            last_memory_age_min : lastMemoryAgeMin,
            last_sessionId      : originSessionId
        },
        recommended_action: recommendedAction,

        // Backward-compat fields:
        sunsetted: sunset,
        reason,
        originSessionId,
        abandonedCount: lockData?.abandonedCount || 0
    };
}

async function main() {
    const identity = process.argv[2] || process.env.NEO_AGENT_IDENTITY || '@neo-gemini-3-1-pro';
    const result = await checkSunsetted(identity);
    console.log(JSON.stringify(result));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error('checkSunsetted failed:', err.message);
        process.exit(1);
    });
}
