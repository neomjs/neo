import Base from './Base.mjs';

/**
 * Native Write-Ahead Logging (WAL) SQLite engine proxy driving memory graph persistence logic.
 * Bounded uniquely inside backend Node.js domains, this integration leverages dynamic imports natively, 
 * bypassing generic browser module restraints while translating instantaneous $O(1)$ memory mapping directly to physical data rows.
 * 
 * @class Neo.ai.graph.storage.SQLite
 * @extends Neo.ai.graph.storage.Base
 */
class SQLite extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.graph.storage.SQLite'
         * @protected
         */
        className: 'Neo.ai.graph.storage.SQLite',
        /**
         * Absolute path to the sqlite file
         * @member {String|null} dbPath=null
         */
        dbPath: null
    }

    db = null;

    /**
     * Evaluates backend file dependencies dynamically resolving database driver configurations. 
     * Applies robust WAL PRAGMA for ultimate IO concurrency avoiding framework lock-ups natively.
     */
    async initAsync() {
        await super.initAsync();
        
        let me = this;
        
        if (!me.dbPath) {
            throw new Error('SQLite storage requires a valid dbPath config.');
        }

        // Use dynamic imports to prevent native Node module evaluation crashes inside browser/test runtimes
        const fs       = (await import('fs-extra')).default;
        const path     = (await import('path')).default;
        const Database = (await import('better-sqlite3')).default;

        await fs.ensureDir(path.dirname(me.dbPath));

        me.db = new Database(me.dbPath, { verbose: null });
        me.db.pragma('journal_mode = WAL');

        me.initSchema();
    }

    /**
     * Evaluates current disk schemas, verifying universal JSON mapping configurations. 
     * Injects strict Graph relational maps internally mitigating corrupted Edge cascade cascades cleanly.
     */
    initSchema() {
        let upgradeRequired = false;
        
        try {
            this.db.prepare('SELECT log_id FROM GraphLog LIMIT 1').get();
        } catch (e) {
            upgradeRequired = true;
        }
        
        if (upgradeRequired) {
            this.db.exec('DROP TABLE IF EXISTS Edges');
            this.db.exec('DROP TABLE IF EXISTS Nodes');
        }

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Nodes (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        `);

        // We store the structured relationships natively
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Edges (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
            );
        `);

        // The Delta Log Hardware Mechanism mimicking Global Broadcast matrices securely natively without network payloads cleanly!
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS GraphLog (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_id TEXT NOT NULL,
                entity_type TEXT NOT NULL
            );
        `);

        // Trigger mapping logic binding Node constraints cleanly locally.
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_insert AFTER INSERT ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'nodes'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_update AFTER UPDATE ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'nodes'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_delete AFTER DELETE ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (OLD.id, 'nodes'); END;`);

        // Trigger mapping logic binding Edge constraints accurately instantly!
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_insert AFTER INSERT ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'edges'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_update AFTER UPDATE ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'edges'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_delete AFTER DELETE ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (OLD.id, 'edges'); END;`);
    }

    /**
     * Maps volatile Memory Node structures directly into SQLite standard JSON buffers using Upsert topologies natively.
     * @param {Object[]} nodes
     */
    addNodes(nodes) {
        if (!this.db || !nodes || nodes.length === 0) return;
        const stmt = this.db.prepare(`
            INSERT INTO Nodes (id, data)
            VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);
        
        const insertMany = this.db.transaction((nodesList) => {
            for (const node of nodesList) {
                stmt.run(node.id, JSON.stringify(node));
            }
        });
        
        insertMany(nodes);
    }

    /**
     * Injects complex Edge topologies capturing mapping source/target configurations mapped across WAL schema blocks rigidly.
     * @param {Object[]} edges 
     */
    addEdges(edges) {
        if (!this.db || !edges || edges.length === 0) return;
        const stmt = this.db.prepare(`
            INSERT INTO Edges (id, source, target, type, data)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET 
                source=excluded.source, 
                target=excluded.target, 
                type=excluded.type, 
                data=excluded.data
        `);
        
        const insertMany = this.db.transaction((edgesList) => {
            for (const edge of edgesList) {
                stmt.run(edge.id, edge.source, edge.target, edge.type || null, JSON.stringify(edge));
            }
        });
        
        insertMany(edges);
    }

    /**
     * Eradicates structural SQLite Node links, autonomously invoking SQLite CASCADE deletions for dependent bounding edge segments.
     * @param {Object[]|String[]} nodes 
     */
    removeNodes(nodes) {
        if (!this.db || !nodes || nodes.length === 0) return;
        const stmt = this.db.prepare('DELETE FROM Nodes WHERE id = ?');
        
        const removeMany = this.db.transaction((nodesList) => {
            for (const node of nodesList) {
                let resolvedId = typeof node === 'object' ? node.id : node;
                stmt.run(resolvedId);
            }
        });
        
        removeMany(nodes);
    }

    /**
     * Cleaves standalone Edge matrices cleanly inside atomic DELETE loop transactions.
     * @param {Object[]|String[]} edges 
     */
    removeEdges(edges) {
        if (!this.db || !edges || edges.length === 0) return;
        const stmt = this.db.prepare('DELETE FROM Edges WHERE id = ?');
        
        const removeMany = this.db.transaction((edgesList) => {
            for (const edge of edgesList) {
                let resolvedId = typeof edge === 'object' ? edge.id : edge;
                stmt.run(resolvedId);
            }
        });
        
        removeMany(edges);
    }

    /**
     * Executes a combined difflog batch inside an atomic SQLite query wrapper natively safely.
     * @param {Object[]} diffLog Array of mutation traces generated by internal transaction maps.
     */
    executeTransaction(diffLog) {
        if (!this.db || !diffLog || diffLog.length === 0) return;

        const insertNodeStmt = this.db.prepare(`
            INSERT INTO Nodes (id, data) VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data
        `);
        const removeNodeStmt = this.db.prepare('DELETE FROM Nodes WHERE id = ?');
        
        const insertEdgeStmt = this.db.prepare(`
            INSERT INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET source=excluded.source, target=excluded.target, type=excluded.type, data=excluded.data
        `);
        const removeEdgeStmt = this.db.prepare('DELETE FROM Edges WHERE id = ?');

        const batchCommit = this.db.transaction((logs) => {
            for (const trace of logs) {
                const storeType = trace.type;
                const mutation  = trace.mutation;

                if (storeType === 'nodes') {
                    if (mutation.addedItems) {
                        for (const node of mutation.addedItems) insertNodeStmt.run(node.id, JSON.stringify(node));
                    }
                    if (mutation.removedItems) {
                        for (const node of mutation.removedItems) removeNodeStmt.run(node.id);
                    }
                } else if (storeType === 'edges') {
                    if (mutation.addedItems) {
                        for (const edge of mutation.addedItems) insertEdgeStmt.run(edge.id, edge.source, edge.target, edge.type || null, JSON.stringify(edge));
                    }
                    if (mutation.removedItems) {
                        for (const edge of mutation.removedItems) removeEdgeStmt.run(edge.id);
                    }
                }
            }
        });

        batchCommit(diffLog);
    }

    /**
     * Obliterates the relational architecture permanently natively truncating disk layouts instantly.
     */
    clear() {
        if (!this.db) return;
        this.db.exec('DELETE FROM Edges');
        this.db.exec('DELETE FROM Nodes');
    }

    /**
     * Executes localized sequence polling isolating un-processed Native SQL edits securely resolving Cache Coherence natively cleanly.
     * Maps `AFTER UPDATE/INSERT/DELETE` trigger records stored in `GraphLog` locally comparing explicitly sequentially securely validating remote worker diffs internally perfectly accurately.
     * @see Neo.ai.graph.Database#syncCache
     * @param {Number} sinceId 
     * @returns {Object} { lastLogId, invalidNodes, invalidEdges }
     */
    getDeltaLog(sinceId = 0) {
        if (!this.db) return { lastLogId: sinceId, invalidNodes: [], invalidEdges: [] };
        
        let logs = this.db.prepare('SELECT log_id, entity_id, entity_type FROM GraphLog WHERE log_id > ? ORDER BY log_id ASC').all(sinceId);
        let maxId = sinceId;
        let invalidNodes = new Set();
        let invalidEdges = new Set();

        for (let trace of logs) {
            maxId = trace.log_id > maxId ? trace.log_id : maxId;
            if (trace.entity_type === 'nodes') invalidNodes.add(trace.entity_id);
            else if (trace.entity_type === 'edges') invalidEdges.add(trace.entity_id);
        }

        return {
            lastLogId: maxId,
            invalidNodes: Array.from(invalidNodes),
            invalidEdges: Array.from(invalidEdges)
        };
    }

    /**
     * Retrieves specific isolated Graph chunks mapping immediate adjacency cleanly back resolving cache misses instantaneously.
     * Operates completely seamlessly inside strictly synchronous V8 traversal loops cleanly mapping boundaries cleanly safely!
     * Circumvents previous asynchronous initialization restrictions preventing destructive disk loop sweeps flawlessly securely dynamically mechanically internally.
     * @see Neo.ai.graph.Database#getAdjacentNodes
     * @param {String|String[]} nodeIds 
     * @returns {Object} { nodes:[], edges:[] }
     */
    loadNodeVicinitySync(nodeIds) {
        if (!this.db) return { nodes: [], edges: [] };
        let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        if (ids.length === 0) return { nodes: [], edges: [] };

        let placeholders = ids.map(() => '?').join(',');
        
        const nodesStmt = this.db.prepare(`SELECT data FROM Nodes WHERE id IN (${placeholders})`);
        const targetNodes = nodesStmt.all(...ids).map(r => JSON.parse(r.data));

        const edgesStmt = this.db.prepare(`SELECT data FROM Edges WHERE source IN (${placeholders}) OR target IN (${placeholders})`);
        // Duplicate the parameters array because we use the placeholder block twice locally identically natively!
        const edgesParams = [...ids, ...ids];
        const edges = edgesStmt.all(...edgesParams).map(r => JSON.parse(r.data));

        let adjacentIds = new Set();
        for (let e of edges) {
            if (!ids.includes(e.source)) adjacentIds.add(e.source);
            if (!ids.includes(e.target)) adjacentIds.add(e.target);
        }

        let adjacentNodes = [];
        if (adjacentIds.size > 0) {
            let adjIdsArray = Array.from(adjacentIds);
            let adjPl = adjIdsArray.map(() => '?').join(',');
            let adjStmt = this.db.prepare(`SELECT data FROM Nodes WHERE id IN (${adjPl})`);
            adjacentNodes = adjStmt.all(...adjIdsArray).map(r => JSON.parse(r.data));
        }

        return {
            nodes: [...targetNodes, ...adjacentNodes],
            edges: edges
        };
    }

    /**
     * Legacy initialization wrapper replacing autonomous batch-all selections cleanly gracefully mapping to lazy boundaries cleanly natively.
     */
    async load() {
        if (!this.db || !this.database) return;
        
        // Retrieve absolute max log ID marking initialization cleanly so synchronization matches hardware efficiently internally natively.
        try {
            let maxLogQuery = this.db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
            this.database.lastSyncId = maxLogQuery.max_id || 0;
        } catch (e) {}
    }
}

export default Neo.setupClass(SQLite);
