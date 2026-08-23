#!/usr/bin/env node
/**
 * @summary All-agent-idle detection at heartbeat layer.
 *
 * This script queries the SQLite GraphLog to determine if ALL configured agents
 * in the swarm are idle (i.e. their last AGENT_MEMORY timestamp is older
 * than IDLE_THRESHOLD).
 *
 * Detector Contract:
 * - Emits a structured `AllAgentIdleSignal` when the all-idle predicate holds.
 * - Signal shape:
 *   {
 *     "allIdle": boolean,
 *     "cycle_id": string,
 *     "identities": string[],
 *     "coordinator_recommendation": string,
 *     "details": { [identity]: { "lastMemTime": string, "ageMs": number } }
 *   }
 */
import Neo                   from '../../../src/Neo.mjs';
import * as core             from '../../../src/core/_export.mjs';
import { createHash }        from 'crypto';
import path                  from 'path';
import { fileURLToPath }     from 'url';
import LifecycleService      from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import GraphService          from '../../services/memory-core/GraphService.mjs';
import AiConfig              from '../../config.mjs';
import memoryCoreConfig      from '../../mcp/server/memory-core/config.mjs';
import {resolveTargets}      from '../../daemons/orchestrator/scheduling/swarmHeartbeat.mjs';
import { checkInflightLock } from './inflightLock.mjs';

/**
 * @summary Derive a logical all-agent-idle cycle id from the observed identity state.
 * @param {String[]} identities Configured agent identities.
 * @param {Object<String, {lastMemTime: ?String, inFlightNudge: Boolean}>} details Per-identity idle details.
 * @returns {String}
 */
export function deriveAllAgentIdleCycleId(identities, details) {
    const stateKey = [...identities].sort().map(identity => {
        const detail  = details[identity] || {};
        const lastMem = detail.lastMemTime || 'never';
        const nudge   = detail.inFlightNudge ? 'in-flight' : 'clear';

        return `${identity}:${lastMem}:${nudge}`
    }).join('|');

    return createHash('sha256')
        .update(stateKey)
        .digest('hex')
        .slice(0, 16)
}

/**
 * @summary Compute whether every configured swarm identity is past the idle threshold.
 * @param {Object} options
 * @param {String} options.wakeDaemonDir Resolved wake-daemon data member.
 * @returns {Promise<Object>} All-agent-idle detector signal.
 */
export async function checkAllAgentIdle({wakeDaemonDir}={}) {
    await LifecycleService.ready();
    await GraphService.ready();
    const db = GraphService.db.storage.db;

    // All-idle check set: the registered active team (deployment-portable via `identityRoots`),
    // overridable by the `NEO_SWARM_IDENTITIES` leaf. Distinct from swarm-heartbeat PULSE
    // targets — idle detection needs the full team, not the recently-A2A-active subset.
    const identities = await resolveTargets({
        targetSource   : 'active-local-team',
        explicitTargets: AiConfig.orchestrator.swarmHeartbeat.allIdleIdentities
    });

    const thresholdMs = AiConfig.orchestrator.swarmHeartbeat.idleThresholdMs;
    const now         = Date.now();

    let   allIdle               = true;
    const details               = {};
    let   earliestIdledIdentity = null;
    let   maxAge                = -1;

    for (const identity of identities) {
        const memStmt = db.prepare(`
            SELECT id,
                   data,
                   json_extract(data, '$.properties.name')        as nameField,
                   json_extract(data, '$.properties.description') as descField,
                   json_extract(data, '$.properties.timestamp')   as timestampField,
                   json_extract(data, '$.properties.sessionId')   as sessionIdField
            FROM Nodes
            WHERE json_extract(data, '$.label') = 'AGENT_MEMORY'
              AND (json_extract(data, '$.properties.agentIdentity') = ? OR json_extract(data, '$.properties.userId') = ?)
            ORDER BY COALESCE(json_extract(data, '$.properties.timestamp'), json_extract(data, '$.properties.name')) DESC
            LIMIT 1
        `);
        const memRow = memStmt.get(identity, identity);

        let lastMemTime = memRow?.timestampField || null;

        // Fallback for legacy memories whose timestamp only exists in the name field.
        if (memRow && !lastMemTime) {
            const tsMatch = memRow.nameField?.match(/^Memory:\s+(.+)$/);
            if (tsMatch?.[1]) {
                lastMemTime = tsMatch[1];
            }
        }

        let ageMs = 0;
        if (lastMemTime) {
            ageMs = now - new Date(lastMemTime).getTime();
        } else {
            // Boundary case: If no AGENT_MEMORY rows exist for the identity, treat them as fully idle
            // so they don't block the all-idle predicate on fresh checkouts.
            ageMs = Infinity;
        }

        // Check if there is an active idle_out_nudge lock for this identity
        const lastMemTimeMs = lastMemTime ? new Date(lastMemTime).getTime() : 0;
        const lockData      = await checkInflightLock(identity, 'idle_out_nudge', lastMemTimeMs, {wakeDaemonDir});

        if (lockData.inFlight) {
            ageMs = 0; // Treat as actively waking up (not idle)
        }

        details[identity] = {
            lastMemTime,
            ageMs,
            inFlightNudge : lockData.inFlight,
            abandonedCount: lockData.abandonedCount || 0
        };

        if (ageMs <= thresholdMs) {
            allIdle = false;
        }

        if (ageMs > maxAge) {
            maxAge = ageMs;
            earliestIdledIdentity = identity;
        }
    }

    const cycleId = deriveAllAgentIdleCycleId(identities, details);

    const signal = {
        allIdle,
        cycle_id                  : cycleId,
        identities,
        coordinator_recommendation: earliestIdledIdentity,
        details
    };

    return signal;
}

async function main() {
    const signal = await checkAllAgentIdle({wakeDaemonDir: memoryCoreConfig.wakeDaemon.dataDir});
    console.log(JSON.stringify(signal));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(err => {
        console.error('checkAllAgentIdle failed:', err.message);
        process.exit(1);
    });
}
