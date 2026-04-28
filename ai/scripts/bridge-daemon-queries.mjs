import fs from 'fs-extra';
import Database from 'better-sqlite3';

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
          AND COALESCE(json_extract(data, '$.properties.status'), 'active') != 'degraded'
    `);
    return stmt.all().map(row => JSON.parse(row.data));
}

export function getGraphLogEntries(db, lastSyncId) {
    return db.prepare('SELECT log_id, entity_id, entity_type FROM GraphLog WHERE log_id > ? ORDER BY log_id ASC').all(lastSyncId);
}

export function getNodesData(db, nodeIds) {
    if (!nodeIds || nodeIds.size === 0) return [];
    const ids = Array.from(nodeIds);
    let results = [];
    for (let i = 0; i < ids.length; i += 400) {
        let chunk = ids.slice(i, i + 400);
        let placeholders = chunk.map(() => '?').join(',');
        results = results.concat(db.prepare(`SELECT id, data FROM Nodes WHERE id IN (${placeholders})`).all(...chunk));
    }
    return results;
}

export function getEdgesData(db, edgeIds) {
    if (!edgeIds || edgeIds.size === 0) return [];
    const ids = Array.from(edgeIds);
    let results = [];
    for (let i = 0; i < ids.length; i += 400) {
        let chunk = ids.slice(i, i + 400);
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
