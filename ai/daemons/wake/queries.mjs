import fs                              from 'fs-extra';
import Database                        from 'better-sqlite3';
import {writeFileAtomicSync}           from '../../services/shared/atomicFileWrite.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE } from '../../graph/storage/constants.mjs';
// Only the WAKE_SUBSCRIPTION reads below use this. The HARNESS_PRESENCE query later in this file
// carries the same COALESCE idiom for a DIFFERENT entity and must not be folded into it.
import { activeWakeSubscriptionStatusSql } from '../../services/memory-core/wakeSubscriptionStatusPolicy.mjs';

export function initializeDatabase(dbPath) {
    try {
        const db = new Database(dbPath, { fileMustExist: true });
        db.pragma('journal_mode = WAL');
        db.pragma('busy_timeout = 5000');
        return db;
    } catch (err) {
        console.error(`[Wake Daemon] Failed to open database at ${dbPath}. Is the graph initialized?`);
        process.exit(1);
    }
}

/**
 * @summary Resolves the wake-daemon resume cursor — the GraphLog id to tail-sync from.
 *
 * **Fail-to-the-tip semantics.** A missing OR corrupt/empty cursor file resolves to
 * `MAX(log_id)` (resume at the log tip, skip the backlog), never `0`. The previous
 * `parseInt(...) || 0` collapsed a corrupt/empty cursor (`parseInt` → `NaN`) to `0`, which
 * makes the daemon tail-sync the ENTIRE GraphLog from id 0 and re-fire the whole unread
 * backlog as one volume-escalated HIGH wake (the full-backlog wake-flood this guards against).
 * Only a genuinely-parseable non-negative integer is trusted as a cursor: a legitimately
 * persisted `0` is preserved, while `NaN` (truncated/empty file) or a negative value falls
 * through to the safe tip. A cursor ahead of the current tip is also clamped back to the tip:
 * stale wake-daemon state can survive graph restore/rebuild, and trusting that future cursor
 * would silence the daemon until GraphLog catches up.
 *
 * @param {Database} db        SQLite database handle.
 * @param {String}   stateFile Path to the persisted cursor file.
 * @returns {Number} The log id to resume tail-sync from.
 */
export function getLastSyncId(db, stateFile) {
    const maxLogId = getMaxLogId(db);

    if (fs.existsSync(stateFile)) {
        const parsed = parseInt(fs.readFileSync(stateFile, 'utf8'), 10);
        // A valid cursor is a non-negative integer; anything else (NaN from a truncated/empty
        // file, or a negative value) is corruption → fail to the tip, never replay from 0.
        return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, maxLogId) : maxLogId;
    }

    // Missing cursor (first boot / fresh data dir) → resume at the tip, skip the backlog.
    return maxLogId;
}

/**
 * @summary Returns the highest GraphLog id, or `0` when the log is empty / unreadable.
 *
 * Shared by {@link getLastSyncId} across both the missing-cursor and corrupt-cursor branches
 * so the two cannot drift apart. An empty log legitimately yields `0` (nothing to replay).
 *
 * @param {Database} db SQLite database handle.
 * @returns {Number}
 */
function getMaxLogId(db) {
    try {
        const row = db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
        return row?.max_id || 0;
    } catch (e) {
        return 0;
    }
}

/**
 * @summary Atomically persists the wake-daemon resume cursor.
 *
 * Writes to a sibling temp file then `renameSync`s it over the live cursor. `rename(2)` is
 * atomic within a filesystem, so a process kill mid-write can only ever truncate the
 * disposable temp file — the live cursor is always either the old value or the new one, never
 * an empty string. That empty-string truncation is precisely the corruption that drove a
 * subsequent boot into the replay-from-0 backlog flood; pairing this atomic write with the
 * fail-to-the-tip read in {@link getLastSyncId} is the write-side half of that defense.
 *
 * @param {String} stateFile  Path to the persisted cursor file.
 * @param {Number} lastSyncId The cursor value to persist.
 * @returns {void}
 */
export function writeLastSyncId(stateFile, lastSyncId) {
    // Was a fixed `${stateFile}.tmp` with no cleanup: two daemons sharing a state file raced the same
    // scratch, and a throw between write and rename stranded it next to the cursor permanently.
    writeFileAtomicSync(stateFile, lastSyncId.toString())
}

export function getActiveShapeCSubscriptions(db) {
    // `'bridge-daemon'` is the FROZEN harnessTarget wire value — kept verbatim on the
    // wake-daemon rename so persisted WAKE_SUBSCRIPTION rows keep matching (no migration).
    const stmt = db.prepare(`
        SELECT data
        FROM Nodes
        WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
          AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
          AND ${activeWakeSubscriptionStatusSql()}
    `);
    return collapseDuplicateShapeCRoutes(stmt.all().map(row => JSON.parse(row.data)));
}

export const HARNESS_PRESENCE_STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * @summary Loads the newest active HarnessPresence row for a wake-daemon subscription.
 *
 * Presence is a volatile overlay keyed by subscription and identity. The wake daemon consumes it
 * only as a freshness guard for targeted delivery; missing or stale presence must fail closed for
 * address-specific dispatch instead of falling through to the legacy untargeted activate path.
 *
 * @param {Database} db SQLite database handle.
 * @param {Object} opts
 * @param {String} opts.subscriptionId WAKE_SUBSCRIPTION id.
 * @param {String} opts.agentIdentity AgentIdentity node id.
 * @returns {Object|null} Parsed HARNESS_PRESENCE node.
 */
export function getActiveHarnessPresence(db, {subscriptionId, agentIdentity} = {}) {
    if (!subscriptionId && !agentIdentity) return null;

    if (subscriptionId) {
        return getNewestHarnessPresence(db, {
            where : "json_extract(data, '$.properties.subscriptionId') = ?",
            params: [subscriptionId]
        });
    }

    if (!agentIdentity) return null;

    return getNewestHarnessPresence(db, {
        where : "json_extract(data, '$.properties.agentIdentity') = ?",
        params: [agentIdentity]
    });
}

function getNewestHarnessPresence(db, {where, params}) {
    const rows = db.prepare(`
        SELECT data FROM Nodes
        WHERE json_extract(data, '$.label') = 'HARNESS_PRESENCE'
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
          AND ${where}
        ORDER BY COALESCE(
            json_extract(data, '$.properties.lastSeenAt'),
            json_extract(data, '$.properties.updatedAt'),
            ''
        ) DESC
        LIMIT 1
    `).all(...params);

    for (const row of rows) {
        try {
            return JSON.parse(row.data);
        } catch (error) {
            return null;
        }
    }

    return null;
}

/**
 * @summary Checks whether a HarnessPresence row is fresh enough for immediate targeted delivery.
 * @param {Object|null} presence Parsed HARNESS_PRESENCE node.
 * @param {Object} [opts]
 * @param {Number} [opts.now=Date.now()] Current timestamp in ms.
 * @param {Number} [opts.staleAfterMs=HARNESS_PRESENCE_STALE_AFTER_MS] Staleness threshold.
 * @returns {Boolean}
 */
export function isHarnessPresenceFresh(presence, {
    now = Date.now(),
    staleAfterMs = HARNESS_PRESENCE_STALE_AFTER_MS
} = {}) {
    const props = presence?.properties || {};
    if ((props.status || 'active') !== 'active') return false;

    const lastSeenAt = props.lastSeenAt ? new Date(props.lastSeenAt).getTime() : NaN;
    if (!Number.isFinite(lastSeenAt)) return false;

    return now - lastSeenAt <= staleAfterMs;
}

/**
 * @summary Collapses duplicate active Shape C wake routes before wake-daemon dispatch.
 *
 * The wake daemon is the last-mile consumer of durable `WAKE_SUBSCRIPTION` rows. If a stale
 * active row survives an MCP restart, dispatching every row wakes the same agent multiple times
 * for the same mailbox event. This defense-in-depth guard mirrors the Memory Core
 * `subscribe` idempotency contract: one active route per `(agentIdentity, trigger, filters,
 * appName, adapter, addressType, instanceAddress, userDataDir)` tuple. The instance-address
 * fields are load-bearing: two routes that share an app (e.g. multiple Claude instances) but
 * target different instances MUST stay distinct, or a wake for one named peer can collapse onto
 * another's route and deliver to the wrong instance. The newest updated/created row wins when
 * genuine duplicates (same tuple) exist.
 *
 * @param {Object[]} subscriptions Parsed WAKE_SUBSCRIPTION graph nodes.
 * @returns {Object[]} Deduplicated subscriptions for wake delivery.
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
            appName        : metadata.appName || null,
            adapter        : metadata.adapter || null,
            addressType    : metadata.addressType || null,
            instanceAddress: metadata.instanceAddress || null,
            userDataDir    : metadata.userDataDir || null
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
    try {
        return db.prepare(`
            SELECT log_id, entity_id, entity_type, event_id, event_payload
            FROM GraphLog
            WHERE log_id > ?
            ORDER BY log_id ASC
        `).all(lastSyncId)
    } catch (error) {
        // Backward-compatible startup against a graph opened before Memory Core has applied the
        // additive event-column migration. Legacy rows remain readable but cannot carry typed
        // events until the authoritative storage owner completes initSchema().
        if (!/no such column: event_(?:id|payload)/i.test(error.message)) throw error;

        return db.prepare(`
            SELECT log_id, entity_id, entity_type, NULL AS event_id, NULL AS event_payload
            FROM GraphLog
            WHERE log_id > ?
            ORDER BY log_id ASC
        `).all(lastSyncId)
    }
}

export function getNodesData(db, nodeIds) {
    if (!nodeIds || nodeIds.size === 0) return [];
    const ids     = Array.from(nodeIds);
    let   results = [];
    for (let i = 0; i < ids.length; i += SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let chunk        = ids.slice(i, i + SQLITE_IN_CLAUSE_BATCH_SIZE);
        let placeholders = chunk.map(() => '?').join(',');
        results = results.concat(db.prepare(`SELECT id, data FROM Nodes WHERE id IN (${placeholders})`).all(...chunk));
    }
    return results;
}

export function getEdgesData(db, edgeIds) {
    if (!edgeIds || edgeIds.size === 0) return [];
    const ids     = Array.from(edgeIds);
    let   results = [];
    for (let i = 0; i < ids.length; i += SQLITE_IN_CLAUSE_BATCH_SIZE) {
        let chunk        = ids.slice(i, i + SQLITE_IN_CLAUSE_BATCH_SIZE);
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
          AND json_extract(data, '$.properties.handoverSummaryProcessedAt') IS NULL
          AND json_extract(data, '$.properties.taggedConcepts') LIKE '%"sunset-protocol-handover"%'
    `);
    const rows           = stmt.all();
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

export function markSunsetHandoversSummaryProcessed(db, nodes) {
    if (nodes.length === 0) return;
    const stmt = db.prepare('UPDATE Nodes SET data = ? WHERE id = ?');
    db.transaction(() => {
        for (const node of nodes) {
            node.properties ??= {};
            node.properties.handoverSummaryProcessedAt = new Date().toISOString();
            stmt.run(JSON.stringify(node), node.id);
        }
    })();
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
