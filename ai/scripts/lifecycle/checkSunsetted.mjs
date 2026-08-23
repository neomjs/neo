#!/usr/bin/env node
/**
 * @summary Auto-Wakeup substrate detector for terminal sunset and recoverable idle-out states.
 *
 * Queries the SQLite GraphLog to determine whether an agent identity is in
 * one of two recovery-relevant states:
 *
 *   - **`sunset`** (terminal): the `WAKE_SUBSCRIPTION` is missing / disabled
 *     / degraded. The `session-sunset` workflow's Unsubscribe primitive is the
 *     authoritative signal; staleness alone is NOT a sunset signal. Recovery:
 *     per-harness terminal restart.
 *   - **`idle_out_candidate`** (recoverable): subscription is active AND the
 *     last `AGENT_MEMORY` is older than the configured idle threshold
 *     (`AiConfig.orchestrator.swarmHeartbeat.idleThresholdMs`, env `NEO_IDLE_THRESHOLD_MS`,
 *     10 min default — the same leaf `checkAllAgentIdle.mjs` reads). Recovery: in-place A2A
 *     heartbeat nudge — bounded, non-spawning, idempotent.
 *
 * The two signals are mutually exclusive by construction: `sunset` requires
 * `subscription_active: false`; `idle_out_candidate` requires
 * `subscription_active: true`. Both can be `false` simultaneously (the no-op
 * "agent is operating normally" case).
 *
 * **Output shape:**
 *
 *     {
 *       identity: '@neo-opus-ada',
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
 *       // Backward-compat fields for callers not yet migrated:
 *       sunsetted: false,            // mirrors `sunset`
 *       reason: '',                   // human-readable
 *       originSessionId: 'cce1fea5-...',  // = evidence.last_sessionId
 *       abandonedCount: 0             // from in-flight lock check
 *     }
 *
 * **In-flight lock integration:** when a `sunset_restart` or `idle_out_nudge`
 * action is in flight, the corresponding signal downgrades to `false`; the
 * substrate is already mid-recovery, so no second dispatch is needed. This
 * data-layer mutex prevents duplicate recovery dispatches.
 *
 * `AGENT_MEMORY` rows are read for origin-session extraction (so the
 * fresh-session-spawn boot prompt can carry the prior session ID for Memory
 * Core context-priming) and for update-on-read migration of legacy rows
 * lacking structured `timestamp` / `sessionId` / `agentIdentity` fields.
 *
 * @see ai/scripts/lifecycle/inflightLock.mjs        — in-flight recovery lock primitive
 * @see ai/daemons/SwarmHeartbeatService.mjs — primary consumer of detector output
 * @see ai/scripts/lifecycle/resumeHarness.mjs       — sunset-mode action dispatcher
 * @see ai/scripts/lifecycle/swarmWakeCooldown.mjs   — idle-out-mode action dispatcher
 * @see learn/agentos/incidents/2026-05-04-runaway-spawn-pattern.md — wake-recovery failure-mode background
 */
import Neo                              from '../../../src/Neo.mjs';
import * as core                        from '../../../src/core/_export.mjs';
import path                             from 'path';
import { fileURLToPath }                from 'url';
import LifecycleService                 from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import {isActiveWakeSubscriptionStatus} from '../../services/memory-core/wakeSubscriptionStatusPolicy.mjs';
import GraphService                     from '../../services/memory-core/GraphService.mjs';
import AiConfig                         from '../../config.mjs';
import memoryCoreConfig                 from '../../mcp/server/memory-core/config.mjs';
import { checkInflightLock }            from './inflightLock.mjs';

/**
 * @summary Compute the sunset / idle-out detector payload for one agent identity.
 * @param {String} [identity] Agent identity to inspect.
 * @param {Object} options
 * @param {String} options.wakeDaemonDir Resolved wake-daemon data member.
 * @returns {Promise<Object>} Structured detector contract consumed by shell and daemon paths.
 */
export async function checkSunsetted(
    identity = process.env.NEO_AGENT_IDENTITY || '@neo-gemini-pro',
    {wakeDaemonDir}={}
) {
    await LifecycleService.ready();

    // Ensure GraphService finished initializing
    await GraphService.ready();
    const db = GraphService.db.storage.db;

    // Query all subscriptions for this identity so the detector emits a structured
    // `subscription_status` field rather than a binary "exists / doesn't exist".
    const allSubsStmt = db.prepare(`
        SELECT json_extract(data, '$.properties.status')        as status,
               json_extract(data, '$.properties.harnessTarget') as harnessTarget
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.agentIdentity') = ?
    `);
    const allSubs = allSubsStmt.all(identity);

    // `active` wins over `degraded` / `disabled`: an identity with both an active
    // subscription and an inactive one is operationally active. Subscription
    // presence remains the authoritative sunset signal; memory staleness only
    // feeds idle-out recovery.
    let subscriptionStatus;
    if (allSubs.length === 0) {
        subscriptionStatus = 'missing';
    } else {
        const activeSub = allSubs.find(s =>
            isActiveWakeSubscriptionStatus(s.status) && s.harnessTarget !== 'disabled'
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

    // Bulk-migrate legacy AGENT_MEMORY rows before querying so timestamp ordering
    // is deterministic. Legacy rows store time in `name`; without migration,
    // `ORDER BY COALESCE(timestamp, name)` can keep selecting the same older row
    // ahead of fresh ISO-timestamped rows.
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
                        // Non-parseable legacy rows remain invisible to timestamp ordering.
                    }
                }
            }
        })(legacyRows);
    }

    // Find the latest AGENT_MEMORY for this identity and extract its origin session.
    // Rows use `AGENT_MEMORY` labels, and identity can be tracked via
    // `properties.agentIdentity` or `properties.userId`.
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

    const originSessionId  = memRow?.sessionIdField || '';
    const lastMemTimeMs    = memRow?.timestampField ? new Date(memRow.timestampField).getTime() : 0;
    const memAgeMs         = lastMemTimeMs ? (Date.now() - lastMemTimeMs) : null;
    const lastMemoryAgeMin = memAgeMs !== null ? Math.round(memAgeMs / 60000) : null;

    // Compute the two recovery signals with in-flight lock awareness. Absence of
    // an active WAKE_SUBSCRIPTION is the authoritative sunset signal. Memory
    // staleness is never a sunset signal; when paired with an active subscription,
    // it only produces the lower-authority in-place idle-out nudge candidate.

    let sunset           = false;
    let idleOutCandidate = false;
    let reason           = '';
    let lockData         = null;

    if (!subscriptionActive) {
        // Sunset path: if a restart is already in flight, downgrade to no-op so
        // recovery stays single-dispatch.
        lockData = await checkInflightLock(identity, 'sunset_restart', lastMemTimeMs, {wakeDaemonDir});

        if (lockData.inFlight) {
            sunset = false;
            reason = 'Sunset restart already in-flight (lock active)';
        } else {
            sunset = true;
            reason = `No active WAKE_SUBSCRIPTION (status: ${subscriptionStatus})`;
        }
    } else if (lastMemoryAgeMin !== null && memAgeMs > AiConfig.orchestrator.swarmHeartbeat.idleThresholdMs) {
        // Active subscription + stale memory = candidate idle-out nudge.
        // This signal is "candidate in-place nudge," NOT "agent is idle." The
        // consumer is responsible for bounded, non-spawning, idempotent dispatch
        // that never destructively types into an active draft.
        lockData = await checkInflightLock(identity, 'idle_out_nudge', lastMemTimeMs, {wakeDaemonDir});

        if (!lockData.inFlight) {
            idleOutCandidate = true;
        }
        // else: nudge already in flight; emit no_action recommendation.
    }

    // `recommended_action` is the single branch field consumed by Orchestrator
    // heartbeat recovery, swarmWakeCooldown.mjs, and resumeHarness.mjs.
    let recommendedAction;
    if (sunset)                  recommendedAction = 'sunset_restart';
    else if (idleOutCandidate)   recommendedAction = 'idle_out_nudge';
    else                         recommendedAction = 'no_action';

    // Emit the structured contract plus backward-compatible fields consumed by
    // callers that still read `sunsetted`, `reason`, `originSessionId`, or
    // `abandonedCount`.
    return {
        identity,
        sunset,
        idle_out_candidate: idleOutCandidate,
        evidence          : {
            subscription_active: subscriptionActive,
            subscription_status: subscriptionStatus,
            last_memory_age_min: lastMemoryAgeMin,
            last_sessionId     : originSessionId
        },
        recommended_action: recommendedAction,

        // Backward-compat fields:
        sunsetted     : sunset,
        reason,
        originSessionId,
        abandonedCount: lockData?.abandonedCount || 0
    };
}

async function main() {
    const identity = process.argv[2] || process.env.NEO_AGENT_IDENTITY || '@neo-gemini-pro';
    const result   = await checkSunsetted(identity, {wakeDaemonDir: memoryCoreConfig.wakeDaemon.dataDir});
    console.log(JSON.stringify(result));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error('checkSunsetted failed:', err.message);
        process.exit(1);
    });
}
