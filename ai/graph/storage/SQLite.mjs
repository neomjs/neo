import Base                            from './Base.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE } from './constants.mjs';

const GRAPH_SCHEMA_VERSION = 1;
const GRAPH_SCHEMA_VERSION_ID = 'graph';
const GRAPH_SCHEMA_WIPE_ENV = 'NEO_ALLOW_SCHEMA_WIPE';

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
        me.db.pragma('busy_timeout = 5000');
        me.db.pragma('foreign_keys = ON'); // honor schema-declared `Edges` ON DELETE CASCADE

        try {
            const rcs = await import('../../mcp/server/shared/services/RequestContextService.mjs');
            me.RequestContextService = rcs.default;
            me.normalizeUserId       = rcs.normalizeUserId;
        } catch (e) {
            // Safe fallback for browser/UI isolated executions
        }

        me.initSchema();
    }

    /**
     * @summary Initializes or migrates the persisted graph schema without silently dropping graph data.
     *
     * Evaluates current disk schemas, verifying universal JSON mapping configurations.
     * Injects strict Graph relational maps internally mitigating corrupted Edge cascade cascades cleanly.
     */
    initSchema() {
        if (!this.db) return;
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');

        this.assertSupportedSchemaVersion();

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Nodes (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                data TEXT NOT NULL
            );
        `);

        // We store the structured relationships natively
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Edges (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                type TEXT NOT NULL,
                data TEXT NOT NULL,
                FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_edges_source ON Edges(source);
            CREATE INDEX IF NOT EXISTS idx_edges_target ON Edges(target);
        `);

        this.migrateLegacyGraphColumns();

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

        // Summarization coordinator job lease table.
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS SummarizationJobs (
                session_id TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
                lease_token TEXT,
                expires_at INTEGER,
                retry_count INTEGER DEFAULT 0
            );
        `);

        this.stampSchemaVersion();
    }

    /**
     * @summary Refuses unsupported persisted schemas unless the operator explicitly opts into a destructive reset.
     * @protected
     */
    assertSupportedSchemaVersion() {
        const schemaVersion = this.readGraphSchemaVersion();

        if (schemaVersion === null || schemaVersion === GRAPH_SCHEMA_VERSION) {
            return;
        }

        this.resetGraphSchemaOrThrow(
            `Unsupported SQLite graph schema version ${schemaVersion}; expected ${GRAPH_SCHEMA_VERSION}.`
        );
    }

    /**
     * @summary Reads the current graph schema version row, treating absent version metadata as legacy v1-compatible.
     * @returns {Number|null}
     * @protected
     */
    readGraphSchemaVersion() {
        if (!this.hasTable('SchemaVersion')) {
            return null;
        }

        let row;

        try {
            row = this.db.prepare('SELECT version FROM SchemaVersion WHERE id = ? LIMIT 1').get(GRAPH_SCHEMA_VERSION_ID);
        } catch (e) {
            this.resetGraphSchemaOrThrow(`Unreadable SQLite graph SchemaVersion table: ${e.message}`);
            return null;
        }

        if (!row) {
            return null;
        }

        const version = Number(row.version);

        if (!Number.isInteger(version) || version < 1) {
            this.resetGraphSchemaOrThrow(`Invalid SQLite graph schema version value: ${String(row.version)}.`);
            return null;
        }

        return version;
    }

    /**
     * @summary Adds backward-compatible columns to legacy graph tables without deleting existing rows.
     * @protected
     */
    migrateLegacyGraphColumns() {
        if (!this.hasColumn('Nodes', 'user_id')) {
            this.db.exec('ALTER TABLE Nodes ADD COLUMN user_id TEXT');
        }

        if (!this.hasColumn('Edges', 'user_id')) {
            this.db.exec('ALTER TABLE Edges ADD COLUMN user_id TEXT');
        }
    }

    /**
     * @summary Writes the current graph schema version row after successful schema creation/migration.
     * @protected
     */
    stampSchemaVersion() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS SchemaVersion (
                id TEXT PRIMARY KEY,
                version INTEGER NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        this.db.prepare(`
            INSERT INTO SchemaVersion (id, version, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                version = excluded.version,
                updated_at = excluded.updated_at
        `).run(GRAPH_SCHEMA_VERSION_ID, GRAPH_SCHEMA_VERSION);
    }

    /**
     * @summary Resets graph schema tables only under the explicit schema-wipe environment gate.
     * @param {String} reason Operator-facing reset reason.
     * @protected
     */
    resetGraphSchemaOrThrow(reason) {
        if (process.env[GRAPH_SCHEMA_WIPE_ENV] !== 'true') {
            throw new Error(
                `${reason} Refusing destructive graph schema reset for ${this.dbPath || ':memory:'}. ` +
                `Set ${GRAPH_SCHEMA_WIPE_ENV}=true only for deliberate maintenance.`
            );
        }

        console.warn(
            `[SQLite] ${GRAPH_SCHEMA_WIPE_ENV}=true; resetting graph schema at ` +
            `${this.dbPath || ':memory:'}. Reason: ${reason}`
        );

        this.db.exec(`
            DROP TRIGGER IF EXISTS node_insert;
            DROP TRIGGER IF EXISTS node_update;
            DROP TRIGGER IF EXISTS node_delete;
            DROP TRIGGER IF EXISTS edge_insert;
            DROP TRIGGER IF EXISTS edge_update;
            DROP TRIGGER IF EXISTS edge_delete;
            DROP TABLE IF EXISTS SummarizationJobs;
            DROP TABLE IF EXISTS GraphLog;
            DROP TABLE IF EXISTS Edges;
            DROP TABLE IF EXISTS Nodes;
            DROP TABLE IF EXISTS SchemaVersion;
        `);
    }

    /**
     * @summary Checks whether a persisted SQLite table exists.
     * @param {String} tableName
     * @returns {Boolean}
     * @protected
     */
    hasTable(tableName) {
        return Boolean(this.db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = ?
            LIMIT 1
        `).get(tableName));
    }

    /**
     * @summary Checks whether a persisted SQLite table contains a column.
     * @param {String} tableName
     * @param {String} columnName
     * @returns {Boolean}
     * @protected
     */
    hasColumn(tableName, columnName) {
        if (!this.hasTable(tableName)) {
            return false;
        }

        return this.db.prepare(`PRAGMA table_info(${tableName})`).all().some(column => column.name === columnName);
    }

    /**
     * @summary Classifies a SQLite path as disposable (test-isolated) versus a live production database.
     *
     * Disposable = SQLite `:memory:`, an OS-temp / repo-`tmp/` path, or any `*test*` path. This is the single
     * definition of "safe to mutate from a test", shared by `clear()`'s production-wipe guard and
     * `assertTestWriteIsolated()` so the destructive and the write-isolation guards never drift apart.
     * @param {String|null} [dbPath=this.dbPath]
     * @returns {Boolean}
     * @protected
     */
    isDisposableDbPath(dbPath=this.dbPath) {
        return !dbPath || dbPath === ':memory:' || dbPath.includes('tmp') || dbPath.includes('test');
    }

    /**
     * @summary Fail-closed guard: a test context MUST NOT write to a production graph database.
     *
     * The write-path twin of `clear()`'s production-wipe guard. Graph writes were otherwise unguarded, so a bare
     * `npx playwright test` — which, unlike `playwright.config.unit.mjs`, never sets `UNIT_TEST_MODE`, so
     * `storagePaths.graph` resolves to the live `graphProd` — would silently write test rows into the shared
     * production graph (the live-DB orphan-bleed / backlog-corruption vector).
     *
     * Inserts are constant in production, so a target-path refusal (the shape that is correct for *destructive*
     * ops in `DestructiveOperationGuard`) would break the live runtime. This therefore keys on the test
     * **caller**, not the target: it fires only when a test runner is detected (`TEST_WORKER_INDEX`, which
     * Playwright sets in every worker process, or `UNIT_TEST_MODE`) AND the resolved path is production-like.
     * It is config-independent — it fires regardless of harness or config state (the prior live-collection-wipe
     * lesson). Zero production blast: the live runtime sets neither signal, so this early-returns.
     *
     * @param {Object} [options]
     * @param {String} [options.dbPath=this.dbPath] Resolved SQLite path; injectable for tests.
     * @param {Object} [options.env=process.env]    Environment map; injectable for tests.
     * @throws {Error} When a test context targets a production graph path.
     * @protected
     */
    assertTestWriteIsolated({dbPath=this.dbPath, env=process.env}={}) {
        const inTestRunner = env.TEST_WORKER_INDEX !== undefined || env.UNIT_TEST_MODE === 'true';

        if (!inTestRunner || this.isDisposableDbPath(dbPath)) return;

        throw new Error(
            `GRAPH_WRITE_GUARD: refusing a graph write to the production database "${dbPath}" from a test ` +
            `context (TEST_WORKER_INDEX/UNIT_TEST_MODE detected). Tests MUST run with UNIT_TEST_MODE=true, so ` +
            `storagePaths.graph resolves to the in-memory graphTest — a bare \`npx playwright test\` would ` +
            `otherwise pollute the live graph.`
        );
    }

    /**
     * Maps volatile Memory Node structures directly into SQLite standard JSON buffers using Upsert topologies natively.
     * @param {Object[]} nodes
     */
    addNodes(nodes) {
        if (!this.db || !nodes || nodes.length === 0) return;
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();
        const stmt = this.db.prepare(`
            INSERT INTO Nodes (id, user_id, data)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, user_id=excluded.user_id
        `);

        const insertMany = this.db.transaction((nodesList) => {
            for (const node of nodesList) {
                const isRecord = node.isRecord;
                const nodeData = {
                    id        : isRecord ? node.get('id') : node.id,
                    label     : isRecord ? node.get('label') : node.label,
                    properties: isRecord ? node.get('properties') : node.properties
                };

                if (typeof nodeData.id !== 'string' || nodeData.id.length === 0) {
                    throw new Error(`SQLite graph node writes require a non-empty string id. Received: ${String(nodeData.id)}`);
                }

                stmt.run(nodeData.id, nodeData.properties?.userId || null, JSON.stringify(nodeData));
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();
        const stmt = this.db.prepare(`
            INSERT INTO Edges (id, user_id, source, target, type, data)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                user_id=excluded.user_id,
                source=excluded.source,
                target=excluded.target,
                type=excluded.type,
                data=excluded.data
        `);

        const insertMany = this.db.transaction((edgesList) => {
            for (const edge of edgesList) {
                const isRecord = edge.isRecord;
                const edgeData = {
                    id        : isRecord ? edge.get('id') : edge.id,
                    source    : isRecord ? edge.get('source') : edge.source,
                    target    : isRecord ? edge.get('target') : edge.target,
                    type      : isRecord ? edge.get('type') : edge.type,
                    properties: isRecord ? edge.get('properties') : edge.properties
                };
                stmt.run(edgeData.id, edgeData.properties?.userId || null, edgeData.source, edgeData.target, edgeData.type || null, JSON.stringify(edgeData));
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();

        const insertNodeStmt = this.db.prepare(`
            INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, user_id=excluded.user_id
        `);
        const removeNodeStmt = this.db.prepare('DELETE FROM Nodes WHERE id = ?');

        const insertEdgeStmt = this.db.prepare(`
            INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, source=excluded.source, target=excluded.target, type=excluded.type, data=excluded.data
        `);
        const removeEdgeStmt = this.db.prepare('DELETE FROM Edges WHERE id = ?');

        const batchCommit = this.db.transaction((logs) => {
            for (const trace of logs) {
                const storeType = trace.type;
                const mutation  = trace.mutation;

                if (storeType === 'nodes') {
                    if (mutation.addedItems) {
                        for (const node of mutation.addedItems) insertNodeStmt.run(node.id, node.properties?.userId || null, JSON.stringify(node));
                    }
                    if (mutation.removedItems) {
                        for (const node of mutation.removedItems) removeNodeStmt.run(node.id);
                    }
                } else if (storeType === 'edges') {
                    if (mutation.addedItems) {
                        for (const edge of mutation.addedItems) insertEdgeStmt.run(edge.id, edge.properties?.userId || null, edge.source, edge.target, edge.type || null, JSON.stringify(edge));
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');

        // Prevent accidental test-driven wipes of non-temporary graph databases (shares isDisposableDbPath
        // with assertTestWriteIsolated so the destructive- and write-guards classify prod paths identically).
        if (!this.isDisposableDbPath()) {
            throw new Error(`FATAL: Attempted to clear a non-temporary SQLite database natively! Path: ${this.dbPath}`);
        }

        this.db.exec('DELETE FROM Edges');
        this.db.exec('DELETE FROM Nodes');
    }

    /**
     * Retrieves the absolute maximum GraphLog ID currently tracked avoiding lock dependencies organically.
     * @returns {Number}
     */
    getLatestLogId() {
        if (!this.db) return 0;
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        try {
            let maxLogQuery = this.db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
            return maxLogQuery.max_id || 0;
        } catch (e) { return 0; }
    }

    /**
     * Executes localized sequence polling isolating un-processed Native SQL edits securely resolving Cache Coherence natively cleanly.
     * Maps `AFTER UPDATE/INSERT/DELETE` trigger records stored in `GraphLog` locally comparing explicitly sequentially securely validating remote worker diffs internally perfectly accurately.
     * @see Neo.ai.graph.Database#syncCache
     * @param {Number} sinceId
     * @returns {Object} { lastLogId, invalidNodes, invalidEdges }
     */
    getDeltaLog(sinceId = 0) {
        if (!this.db) return {lastLogId: sinceId, invalidNodes: [], invalidEdges: []};
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');

        let logs         = this.db.prepare('SELECT log_id, entity_id, entity_type FROM GraphLog WHERE log_id > ? ORDER BY log_id ASC').all(sinceId);
        let maxId        = sinceId;
        let invalidNodes = new Set();
        let invalidEdgesMap = new Map();

        for (let trace of logs) {
            maxId = trace.log_id > maxId ? trace.log_id : maxId;
            if (trace.entity_type === 'nodes') invalidNodes.add(trace.entity_id);
            else if (trace.entity_type === 'edges') invalidEdgesMap.set(trace.entity_id, { id: trace.entity_id });
        }

        if (invalidEdgesMap.size > 0) {
            let edgeIds = Array.from(invalidEdgesMap.keys());
            let chunkSize = SQLITE_IN_CLAUSE_BATCH_SIZE;
            for (let i = 0; i < edgeIds.length; i += chunkSize) {
                let chunk = edgeIds.slice(i, i + chunkSize);
                let placeholders = chunk.map(() => '?').join(',');
                let edgesQuery = this.db.prepare(`SELECT id, source, target FROM Edges WHERE id IN (${placeholders})`);
                let edgesData = edgesQuery.all(...chunk);
                for (let row of edgesData) {
                    invalidEdgesMap.set(row.id, { id: row.id, source: row.source, target: row.target });
                }
            }
        }

        return {
            lastLogId   : maxId,
            invalidNodes: Array.from(invalidNodes),
            invalidEdges: Array.from(invalidEdgesMap.values())
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        let ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        if (ids.length === 0) return {nodes: [], edges: []};

        // Resolve the RLS key canonically (normalized, no-`@`) and match BOTH stored forms: the
        // user_id column was written in @-prefixed AND normalized forms, so this cold lazy-load (the
        // path getNode hits BEFORE GraphService.isRlsVisible) must tolerate both — recovering an
        // owner's own normalized-user_id rows without widening across tenants. Mirrors searchNodes.
        const rcs       = this.RequestContextService;
        const rawUserId = rcs ? (rcs.getUserId?.() ?? rcs.getAgentIdentityNodeId?.()) : null;
        const userId    = rawUserId == null ? null : (this.normalizeUserId ? this.normalizeUserId(rawUserId) : rawUserId);
        const userIdAt  = userId == null ? null : '@' + userId;
        let rlsClause = `AND (user_id = ? OR user_id = ? OR user_id IS NULL OR json_extract(data, '$.properties.sharedEntity') = 1 OR json_extract(data, '$.properties.visibility') = 'team')`;

        const chunkSize = SQLITE_IN_CLAUSE_BATCH_SIZE;
        let targetNodes = [];
        let edges = [];

        for (let i = 0; i < ids.length; i += chunkSize) {
            let chunk = ids.slice(i, i + chunkSize);
            let placeholders = chunk.map(() => '?').join(',');

            const nodesStmt = this.db.prepare(`SELECT data FROM Nodes WHERE id IN (${placeholders}) ${rlsClause}`);
            targetNodes.push(...nodesStmt.all(...chunk, userId, userIdAt).map(r => JSON.parse(r.data)));

            const edgesStmt = this.db.prepare(`SELECT data FROM Edges WHERE (source IN (${placeholders}) OR target IN (${placeholders})) ${rlsClause}`);
            const edgesParams = [...chunk, ...chunk, userId, userIdAt];
            edges.push(...edgesStmt.all(...edgesParams).map(r => JSON.parse(r.data)));
        }

        let adjacentIds = new Set();
        for (let e of edges) {
            if (!ids.includes(e.source)) adjacentIds.add(e.source);
            if (!ids.includes(e.target)) adjacentIds.add(e.target);
        }

        let adjacentNodes = [];
        if (adjacentIds.size > 0) {
            let adjIdsArray = Array.from(adjacentIds);
            for (let i = 0; i < adjIdsArray.length; i += chunkSize) {
                let chunk = adjIdsArray.slice(i, i + chunkSize);
                let adjPl = chunk.map(() => '?').join(',');
                let adjStmt = this.db.prepare(`SELECT data FROM Nodes WHERE id IN (${adjPl}) ${rlsClause}`);
                adjacentNodes.push(...adjStmt.all(...chunk, userId, userIdAt).map(r => JSON.parse(r.data)));
            }
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
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');

        // Retrieve absolute max log ID marking initialization cleanly so synchronization matches hardware efficiently internally natively.
        try {
            let maxLogQuery = this.db.prepare('SELECT MAX(log_id) as max_id FROM GraphLog').get();
            this.database.lastSyncId = maxLogQuery.max_id || 0;
        } catch (e) {}
    }
}

export default Neo.setupClass(SQLite);
