import fs from 'fs-extra';
import Database from 'better-sqlite3';
import { SQLITE_IN_CLAUSE_BATCH_SIZE } from '../graph/storage/constants.mjs';

export function initializeDatabase(dbPath) {
    try {
        const db = new Database(dbPath, { fileMustExist: true });
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        return db;
    } catch (err) {
        console.error(`[Bridge Daemon] Failed to open database at ${dbPath}. Is the graph initialized?`);
        process.exit(1);
    }
}

export function getLastSyncId(db, stateFile) {
    if (fs.existsSync(stateFile)) {
        return parseInt(fs.readFileSync(stateFile, 'utf8'), 10) || 0;
    } else {
        try {
            const row = db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
            return row?.max_id || 0;
        } catch (e) {
            return 0;
        }
    }
}

export function getActiveShapeCSubscriptions(db) {
    const stmt = db.prepare(`
        SELECT data 
        FROM Nodes 
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
    `);
    return collapseDuplicateShapeCRoutes(stmt.all().map(row => JSON.parse(row.data)));
}

/**
 * @summary Collapses duplicate active Shape C wake routes before bridge-daemon dispatch.
 *
 * The bridge daemon is the last-mile consumer of durable `WAKE_SUBSCRIPTION` rows. If a stale
 * active row survives an MCP restart, dispatching every row wakes the same agent multiple times
 * for the same mailbox event. This defense-in-depth guard mirrors the Memory Core
 * `subscribe` idempotency contract: one active route per `(agentIdentity, trigger, filters,
 * appName)` tuple, with the newest updated/created row winning when legacy duplicates exist.
 *
 * @param {Object[]} subscriptions Parsed WAKE_SUBSCRIPTION graph nodes.
 * @returns {Object[]} Deduplicated subscriptions for bridge delivery.
 */
export function collapseDuplicateShapeCRoutes(subscriptions) {
    const byRoute = new Map();

    for (const subscription of subscriptions) {
        const key      = buildShapeCRouteKey(subscription);
        const existing = byRoute.get(key);

        if (!existing || getSubscriptionTimestamp(subscription) >= getSubscriptionTimestamp(existing)) {
            byRoute.set(key, subscription);
        }
    }

    return Array.from(byRoute.values());
}

function buildShapeCRouteKey(subscription) {
    const props    = subscription.properties || {};
    const metadata = props.harnessTargetMetadata || {};

    return stableStringify({
        agentIdentity: props.agentIdentity,
        trigger      : props.trigger,
        filters      : props.filters || {},
        harnessTarget: props.harnessTarget,
        routeMetadata: {
            appName: metadata.appName || null
        }
    });
}

function getSubscriptionTimestamp(subscription) {
    const props = subscription.properties || {};
    return props.updatedAt || props.createdAt || '';
}

function stableStringify(value) {
    return JSON.stringify(stableNormalize(value));
}

function stableNormalize(value) {
    if (Array.isArray(value)) {
        return value
            .map(item => stableNormalize(item))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((out, key) => {
            out[key] = stableNormalize(value[key]);
            return out;
        }, {});
    }

    return value;
}

export function getGraphLogEntries(db, lastSyncId) {
    return db.prepare('SELECT log_id, entity_id, entity_type FROM GraphLog WHERE log_id > ? ORDER BY log_id ASC').all(lastSyncId);
}

export function getNodesData(db, nodeIds) {
    if (!nodeIds || nodeIds.size === 0) return [];
    const ids = Array.from(nodeIds);
    let results = [];
    for (let i = 0; i < ids.length; i += SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let chunk = ids.slice(i, i + SQLITE_IN_CLAUSE_BATCH_SIZE);
        let placeholders = chunk.map(() => '?').join(',');
        results = results.concat(db.prepare(`SELECT id, data FROM Nodes WHERE id IN (${placeholders})`).all(...chunk));
    }
    return results;
}

export function getEdgesData(db, edgeIds) {
    if (!edgeIds || edgeIds.size === 0) return [];
    const ids = Array.from(edgeIds);
    let results = [];
    for (let i = 0; i < ids.length; i += SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let chunk = ids.slice(i, i + SQLITE_IN_CLAUSE_BATCH_SIZE);
        let placeholders = chunk.map(() => '?').join(',');
        results = results.concat(db.prepare(`SELECT id, data, source, target, type FROM Edges WHERE id IN (${placeholders})`).all(...chunk));
    }
    return results;
}

export function getDbNode(db, id) {
    try {
        const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
    } catch (e) {
        return null;
    }
}

export function getUnreadSunsetHandovers(db) {
    const stmt = db.prepare(`
        SELECT id, data FROM Nodes
        WHERE json_extract(data, '$.type') = 'MESSAGE'
          AND json_extract(data, '$.properties.readAt') IS NULL
          AND json_extract(data, '$.properties.taggedConcepts') LIKE '%"sunset-protocol-handover"%'
    `);
    const rows = stmt.all();
    const unreadMessages = [];

    for (const row of rows) {
        let messageNode;
        try {
            messageNode = JSON.parse(row.data);
        } catch (err) {
            continue;
        }

        // Double check to avoid false positives from LIKE
        if (messageNode.properties && messageNode.properties.taggedConcepts && messageNode.properties.taggedConcepts.includes('sunset-protocol-handover')) {
            unreadMessages.push(messageNode);
        }
    }
    return unreadMessages;
}

export function markNodesAsRead(db, nodes) {
    if (nodes.length === 0) return;
    const stmt = db.prepare('UPDATE Nodes SET data = ? WHERE id = ?');
    db.transaction(() => {
        for (const node of nodes) {
            node.properties.readAt = new Date().toISOString();
            stmt.run(JSON.stringify(node), node.id);
        }
    })();
}
