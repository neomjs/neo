#!/usr/bin/env node
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
    
    // 2. Check last memory timestamp
    const memStmt = db.prepare(`
        SELECT json_extract(data, '$.properties.timestamp') as timestamp 
        FROM Nodes 
        WHERE json_extract(data, '$.label') = 'MEMORY' 
          AND json_extract(data, '$.properties.agent') = ?
        ORDER BY json_extract(data, '$.properties.timestamp') DESC 
        LIMIT 1
    `);
    const memRow = memStmt.get(identity);

    let isSunsetted = false;
    let reason = '';

    if (subs.length === 0) {
        isSunsetted = true;
        reason = 'No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)';
    } else if (memRow && memRow.timestamp) {
        const lastMemTime = new Date(memRow.timestamp).getTime();
        const ageMs = Date.now() - lastMemTime;
        if (ageMs > 10 * 60 * 1000) {
            isSunsetted = true;
            reason = `Last memory is ${Math.round(ageMs / 60000)}m old (>10m threshold)`;
        }
    } else {
        // No memory and has subscription? Assume active (just booted).
        // But if it's older than 10m? We don't have boot time. We'll rely on memory.
        // Actually, if no memory exists AT ALL, it's a fresh DB. Not sunsetted.
    }

    console.log(JSON.stringify({
        identity,
        sunsetted: isSunsetted,
        reason
    }));
    process.exit(0);
}

main().catch(err => {
    console.error('checkSunsetted failed:', err.message);
    process.exit(1);
});
