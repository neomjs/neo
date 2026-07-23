import fs       from 'fs';
import readline from 'readline';

/**
 * @module ai/services/memory-core/helpers/graphJsonlImport
 * @summary Canonical bounded Native Edge Graph JSONL importer shared by
 * operator restore and isolated target-set staging.
 */

/**
 * @summary Imports canonical `{type:'node'|'edge', data}` JSONL records into an
 * opened graph SQLite database.
 *
 * The caller owns destructive-target admission. `replace` clears graph rows
 * before importing; staging callers use it only on a run-owned disposable DB,
 * while `DatabaseService` applies its production guard first.
 *
 * @param {Object} options
 * @param {Object} options.db Open better-sqlite3 database with Nodes/Edges.
 * @param {String} options.filePath JSONL source.
 * @param {'merge'|'replace'} options.mode Import mode.
 * @param {Number} [options.batchSize=2000] Maximum transaction batch.
 * @param {Function} [options.warn=()=>{}] Bounded warning sink.
 * @returns {Promise<{imported: Number, counts: Object, mode: String, maxBatchSize: Number}>}
 */
export async function importGraphJsonl({
    db,
    filePath,
    mode,
    batchSize = 2000,
    warn = () => {}
} = {}) {
    if (!db || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
        throw new TypeError('importGraphJsonl: opened better-sqlite3 db is required')
    }
    if (typeof filePath !== 'string' || filePath.length === 0) {
        throw new TypeError('importGraphJsonl: filePath is required')
    }
    if (!['merge', 'replace'].includes(mode)) {
        throw new TypeError("importGraphJsonl: mode must be 'merge' or 'replace'")
    }
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw new TypeError('importGraphJsonl: batchSize must be a positive integer')
    }

    if (mode === 'replace') {
        db.transaction(() => {
            db.prepare('DELETE FROM Edges').run();
            db.prepare('DELETE FROM Nodes').run();
        }).immediate()
    }

    const
        conflictClause = mode === 'replace' ? 'OR REPLACE' : 'OR IGNORE',
        insertNode     = db.prepare(`INSERT ${conflictClause} INTO Nodes (id, user_id, data) VALUES (?, ?, ?)`),
        insertEdge     = db.prepare(`
            INSERT ${conflictClause} INTO Edges (id, user_id, source, target, type, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `),
        counts         = {
            nodes: {inserted: 0, skippedExisting: 0, failed: 0},
            edges: {inserted: 0, skippedExisting: 0, failed: 0}
        };

    let imported    = 0;
    let maxObserved = 0;

    const insertBatch = db.transaction(records => {
        for (const record of records) {
            if (record.type === 'node') {
                try {
                    const result = insertNode.run(
                        record.data.id,
                        record.data.properties?.userId || record.data.user_id || null,
                        JSON.stringify(record.data)
                    );
                    if (result.changes === 1) {
                        counts.nodes.inserted++
                    } else {
                        counts.nodes.skippedExisting++
                    }
                } catch (error) {
                    counts.nodes.failed++;
                    if (counts.nodes.failed <= 5) {
                        warn(`[importGraphJsonl] node insert failed for id=${record.data?.id}: ${error.message}`)
                    }
                }
            } else if (record.type === 'edge') {
                const
                    edgeData = record.data,
                    edgeId   = edgeData.id || `${edgeData.source}->${edgeData.target}:${edgeData.type}`;

                if (!edgeData.source || !edgeData.target || !edgeData.type) {
                    counts.edges.failed++;
                    if (counts.edges.failed <= 5) {
                        warn(`[importGraphJsonl] edge missing source/target/type: id=${edgeId}`)
                    }
                    imported++;
                    continue
                }

                try {
                    const result = insertEdge.run(
                        edgeId,
                        edgeData.properties?.userId || edgeData.user_id || null,
                        edgeData.source,
                        edgeData.target,
                        edgeData.type,
                        JSON.stringify(edgeData)
                    );
                    if (result.changes === 1) {
                        counts.edges.inserted++
                    } else {
                        counts.edges.skippedExisting++
                    }
                } catch (error) {
                    counts.edges.failed++;
                    if (counts.edges.failed <= 5) {
                        warn(`[importGraphJsonl] edge insert failed for id=${edgeId}: ${error.message}`)
                    }
                }
            }

            imported++
        }
    });

    const
        input = fs.createReadStream(filePath),
        lines = readline.createInterface({input, crlfDelay: Infinity}),
        batch = [];

    try {
        for await (const line of lines) {
            if (!line.trim()) {
                continue
            }

            batch.push(JSON.parse(line));

            if (batch.length === batchSize) {
                maxObserved = Math.max(maxObserved, batch.length);
                insertBatch(batch);
                batch.length = 0
            }
        }

        if (batch.length > 0) {
            maxObserved = Math.max(maxObserved, batch.length);
            insertBatch(batch)
        }
    } finally {
        lines.close();
        input.destroy()
    }

    return {
        imported,
        counts,
        mode,
        maxBatchSize: maxObserved
    }
}
