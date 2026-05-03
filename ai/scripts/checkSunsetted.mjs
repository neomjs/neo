#!/usr/bin/env node
/**
 * @summary Auto-Wakeup Substrate Detection Logic (Epic #10601).
 *
 * This script queries the SQLite GraphLog to determine if an agent is sunsetted
 * based on missing WAKE_SUBSCRIPTION nodes or inactivity exceeding the threshold.
 */
import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import LifecycleService from '../mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs';
import GraphService from '../mcp/server/memory-core/services/GraphService.mjs';

async function main() {
    await LifecycleService.initAsync();

    // Ensure GraphService is initialized
    await GraphService.initAsync();
    const db = GraphService.db.storage.db;

    // Target identity for Phase 1/2
    const identity = process.argv[2] || process.env.NEO_AGENT_IDENTITY || '@neo-gemini-3-1-pro';

    // 1. Check if WAKE_SUBSCRIPTION exists and is active
    const subStmt = db.prepare(`
        SELECT id FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.agentIdentity') = ?
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
          AND json_extract(data, '$.properties.harnessTarget') != 'disabled'
    `);
    const subs = subStmt.all(identity);

    // 2. Find last AGENT_MEMORY for this identity + extract origin session ID.
    //    rows are `AGENT_MEMORY` (not `MEMORY`); identity tracks via `properties.userId`.
    //    Legacy rows missing structured fields are migrated via update-on-read.
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
    let originSessionId = memRow?.sessionIdField || '';
    let isSunsetted = false;
    let reason = '';

    // Update-on-read migration for legacy AGENT_MEMORY rows
    if (memRow && (!lastMemTime || !originSessionId)) {
        try {
            const tsMatch     = memRow.nameField?.match(/^Memory:\s+(.+)$/);
            const sidMatch    = memRow.descField?.match(/inside session ([a-f0-9-]+)/);
            
            const migratedTime = tsMatch?.[1];
            const migratedSessionId = sidMatch?.[1];

            if (migratedTime && migratedSessionId) {
                lastMemTime = migratedTime;
                originSessionId = migratedSessionId;

                const dataObj = JSON.parse(memRow.data);
                dataObj.properties = dataObj.properties || {};
                dataObj.properties.timestamp = migratedTime;
                dataObj.properties.sessionId = migratedSessionId;
                dataObj.properties.agentIdentity = identity;

                const updateStmt = db.prepare(`UPDATE Nodes SET data = ? WHERE id = ?`);
                updateStmt.run(JSON.stringify(dataObj), memRow.id);
            }
        } catch (err) {
            // Ignore migration errors on read path
        }
    }

    if (subs.length === 0) {
        isSunsetted = true;
        reason = 'No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)';
    } else if (lastMemTime) {
        const lastMemMs   = new Date(lastMemTime).getTime();
        const ageMs       = Date.now() - lastMemMs;
        const thresholdMs = parseInt(process.env.SUNSET_THRESHOLD_MS, 10) || 10 * 60 * 1000;
        if (ageMs > thresholdMs) {
            isSunsetted = true;
            reason = `Last memory is ${Math.round(ageMs / 60000)}m old (>${Math.round(thresholdMs/60000)}m threshold)`;
        }
    } else {
        // No memory and has subscription? Assume active (just booted).
        // But if it's older than 10m? We don't have boot time. We'll rely on memory.
        // Actually, if no memory exists AT ALL, it's a fresh DB. Not sunsetted.
    }

    console.log(JSON.stringify({
        identity,
        sunsetted: isSunsetted,
        reason,
        originSessionId
    }));
    process.exit(0);
}

main().catch(err => {
    console.error('checkSunsetted failed:', err.message);
    process.exit(1);
});
