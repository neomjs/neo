#!/usr/bin/env node
/**
 * @summary Auto-Wakeup Substrate Detection Logic (Epic #10601).
 *
 * This script queries the SQLite GraphLog to determine if an agent is sunsetted.
 * The authoritative sunset signal is the Unsubscribe primitive: the
 * `session-sunset` workflow drops the agent's active WAKE_SUBSCRIPTION node
 * before terminating the transcript, so a missing subscription is the only
 * condition that flips `sunsetted=true`.
 *
 * `AGENT_MEMORY` rows are read for origin-session extraction (so the
 * fresh-session-spawn boot prompt can carry the prior session ID for Memory
 * Core context-priming) and for update-on-read migration of legacy rows
 * lacking structured `timestamp` / `sessionId` / `agentIdentity` fields.
 * Memory freshness is intentionally NOT a sunset proxy — it has too many
 * legitimate non-sunset causes (rate-limit, long deep-thinking turns,
 * Memory Core path asymmetry under Chroma contention, in-flight tool
 * sequences). See the Anchor & Echo block on the predicate for the full
 * rationale and the operator-clarified substrate model from issue #10641.
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

    let originSessionId = memRow?.sessionIdField || '';
    let isSunsetted = false;
    let reason = '';

    // [Anchor & Echo] Sunset detection criterion: ONLY the explicit Unsubscribe primitive.
    //
    // Memory-staleness is NOT a sunset signal. It has too many legitimate causes to serve
    // as a sunset proxy: Anthropic API rate-limits (the agent cannot save during throttle),
    // long deep-thinking turns (peer reviews, complex analysis), Memory Core path
    // asymmetry under contention (`add_memory` blocks on Chroma while `add_message` keeps
    // working on SQLite), or in-flight tool sequences with consolidate-and-save still
    // pending. Conflating staleness with sunset previously triggered Phase 1 Recovery
    // (`resumeHarness.mjs` Cmd+N + paste of `buildBootGroundingPrompt`) against
    // legitimately active agents, spawning orphan Claude Desktop sessions with zero
    // continuity context (Zero-State Amnesia per `AGENTS.md` §14).
    //
    // The authoritative sunset signal is the Unsubscribe primitive: the `session-sunset`
    // workflow drops the WAKE_SUBSCRIPTION node before terminating the transcript. Any
    // wake against an agent that still holds an active subscription is a non-sunset wake
    // and MUST be delivered in-place by `bridge-daemon.mjs` (Cmd+`<tabShortcut>` + paste);
    // that is the wake substrate's design contract per the operator's clarified model
    // (issue #10641): "the bridge SHOULD spawn new sessions. but only after a sunset.
    // otherwise => resume inside current session."
    if (subs.length === 0) {
        isSunsetted = true;
        reason = 'No active WAKE_SUBSCRIPTION (Unsubscribe primitive fired)';
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
