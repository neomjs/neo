#!/usr/bin/env node
/**
 * @summary All-agent-idle detection at heartbeat layer (Substrate Primitive #10625).
 *
 * This script queries the SQLite GraphLog to determine if ALL configured agents
 * in the swarm trio are idle (i.e. their last AGENT_MEMORY timestamp is older
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
import path from 'path';
import { fileURLToPath } from 'url';
import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import LifecycleService from '../mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs';
import GraphService from '../mcp/server/memory-core/services/GraphService.mjs';
import { checkInflightLock } from './inflightLock.mjs';

export async function checkAllAgentIdle(cycleIdParam, identitiesEnvParam) {
    await LifecycleService.initAsync();
    await GraphService.initAsync();
    const db = GraphService.db.storage.db;

    const cycleId = cycleIdParam || Math.floor(Date.now() / 1000).toString();
    const identitiesEnv = identitiesEnvParam || process.env.NEO_TRIO_IDENTITIES || '@neo-gemini-3-1-pro,@neo-opus-4-7,@neo-gpt';
    const identities = identitiesEnv.split(',').map(s => s.trim()).filter(Boolean);

    const thresholdMs = parseInt(process.env.IDLE_THRESHOLD_MS, 10) || 10 * 60 * 1000;
    const now = Date.now();

    let allIdle = true;
    const details = {};
    let earliestIdledIdentity = null;
    let maxAge = -1;

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

        // Fallback for legacy regex extraction per #10623 if timestamp structured field is absent
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
        const lockData = await checkInflightLock(identity, 'idle_out_nudge', lastMemTimeMs);

        if (lockData.inFlight) {
            ageMs = 0; // Treat as actively waking up (not idle)
        }

        details[identity] = { 
            lastMemTime, 
            ageMs, 
            inFlightNudge: lockData.inFlight, 
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

    const signal = {
        allIdle,
        cycle_id: cycleId,
        identities,
        coordinator_recommendation: earliestIdledIdentity,
        details
    };

    return signal;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
    checkAllAgentIdle(process.argv[2], process.env.NEO_TRIO_IDENTITIES).then(signal => {
        console.log(JSON.stringify(signal));
        process.exit(0);
    }).catch(err => {
        console.error('checkAllAgentIdle failed:', err.message);
        process.exit(1);
    });
}
