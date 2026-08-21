import Base                                           from './Base.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE }                from './constants.mjs';
import { isDisposableStorePath, isTestRunnerContext } from '../../services/shared/storeWriteGuard.mjs';

const GRAPH_SCHEMA_VERSION    = 1;
const GRAPH_SCHEMA_VERSION_ID = 'graph';
const GRAPH_SCHEMA_WIPE_ENV   = 'NEO_ALLOW_SCHEMA_WIPE';

/**
 * @summary Maps a narrow UPDATE's result to the `GraphLog` id it produced, or `0` when nothing matched.
 *
 * The `node_update` / `edge_update` triggers insert a `GraphLog` row inside the statement, so
 * `lastInsertRowid` names exactly this write's log position. Returning it lets a caller acknowledge
 * **its own** row instead of the global maximum — the difference between skipping the replay of a
 * write you just made and skipping a concurrent peer's write you have never seen.
 *
 * `0` rather than `false` on no-match keeps every existing truthiness check working while making the
 * id available to callers that need it.
 * @param {Object} result better-sqlite3 `RunResult`.
 * @returns {Number} `GraphLog` id, or `0`.
 */
function narrowWriteResult(result) {
    return result.changes > 0 ? Number(result.lastInsertRowid) : 0
}

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
                entity_type TEXT NOT NULL,
                event_id TEXT,
                event_payload TEXT
            );
        `);

        this.migrateLegacyGraphLogColumns();
        this.db.exec(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_log_event_id
            ON GraphLog(event_id)
            WHERE event_id IS NOT NULL;
        `);

        // Trigger mapping logic binding Node constraints cleanly locally.
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_insert AFTER INSERT ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'nodes'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_update AFTER UPDATE ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'nodes'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS node_delete AFTER DELETE ON Nodes BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (OLD.id, 'nodes'); END;`);

        // Trigger mapping logic binding Edge constraints accurately instantly!
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_insert AFTER INSERT ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'edges'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_update AFTER UPDATE ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (NEW.id, 'edges'); END;`);
        this.db.exec(`CREATE TRIGGER IF NOT EXISTS edge_delete AFTER DELETE ON Edges BEGIN INSERT INTO GraphLog(entity_id, entity_type) VALUES (OLD.id, 'edges'); END;`);

        // Summarization coordinator job lease + bounded replay receipt. One compressed envelope
        // is retained per session (overwritten by newer synthesis, removed by purgeSession with
        // the row), so Chroma recycle recovery never depends on an unbounded append journal.
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS SummarizationJobs (
                session_id TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
                lease_token TEXT,
                expires_at INTEGER,
                retry_count INTEGER DEFAULT 0,
                result_envelope BLOB,
                result_encoding TEXT,
                result_staged_at INTEGER,
                result_acknowledged_at INTEGER,
                result_last_replayed_at INTEGER
            );
        `);

        this.migrateLegacySummarizationJobColumns();
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
     * @summary Adds nullable typed-event columns to legacy GraphLog tables without rewriting rows.
     * @protected
     */
    migrateLegacyGraphLogColumns() {
        if (!this.hasColumn('GraphLog', 'event_id')) {
            this.db.exec('ALTER TABLE GraphLog ADD COLUMN event_id TEXT');
        }

        if (!this.hasColumn('GraphLog', 'event_payload')) {
            this.db.exec('ALTER TABLE GraphLog ADD COLUMN event_payload TEXT');
        }
    }

    /**
     * @summary Adds the nullable, backward-compatible durable result envelope to legacy
     * `SummarizationJobs` tables without rewriting or invalidating existing lease rows.
     * @protected
     */
    migrateLegacySummarizationJobColumns() {
        const columns = {
            result_envelope        : 'BLOB',
            result_encoding        : 'TEXT',
            result_staged_at       : 'INTEGER',
            result_acknowledged_at : 'INTEGER',
            result_last_replayed_at: 'INTEGER'
        };

        for (const [name, type] of Object.entries(columns)) {
            if (!this.hasColumn('SummarizationJobs', name)) {
                this.db.exec(`ALTER TABLE SummarizationJobs ADD COLUMN ${name} ${type}`);
            }
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
     * Delegates to the Agent-OS-wide `storeWriteGuard.isDisposableStorePath` classifier — one definition of
     * "safe to mutate from a test" (`:memory:`, an OS-temp / repo-`tmp/`, or any `*test*` path) shared across
     * the graph store and the file-stores so no per-store classifier drifts. Used here by both `clear()`'s
     * production-wipe guard and `assertTestWriteIsolated()`.
     * @param {String|null} [dbPath=this.dbPath]
     * @returns {Boolean}
     * @protected
     */
    isDisposableDbPath(dbPath=this.dbPath) {
        return isDisposableStorePath(dbPath);
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
        if (!isTestRunnerContext(env) || this.isDisposableDbPath(dbPath)) return;

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
     * @summary Sets ONE property under `$.properties`, in SQL, only when it is currently absent.
     *
     * `json_set` rewrites a single path instead of replacing the document, so a field another process
     * committed between our read and our write survives. The `IS NULL` predicate makes write-once an
     * atomic property of the statement rather than a caller-side read-then-check, which would race the
     * very window it is meant to close.
     *
     * `table` and `property` are interpolated (neither a table name nor a JSON path can be a bound
     * parameter), so both are validated against strict shapes first. `value` is bound.
     *
     * @param {String} table `'Nodes'` or `'Edges'`.
     * @param {String} id Record id.
     * @param {String} property Property name under `$.properties`; identifier characters only.
     * @param {*} value Value to set.
     * @returns {Boolean} `true` only when this statement wrote.
     */
    /**
     * @summary Shared preflight for the narrow property writers. Returns the JSON path, or `null`
     * when there is no database to write to.
     *
     * `table` and `property` are interpolated into the statement — neither a table name nor a JSON
     * path can be a bound parameter — so both are validated against strict shapes here rather than at
     * each call site, where one of the two would eventually be forgotten.
     * @param {String} caller Method name, for the error message.
     * @param {String} table
     * @param {String} property
     * @returns {String|null}
     * @private
     */
    assertNarrowWrite(caller, table, property) {
        if (!this.db) return null;
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        this.assertTestWriteIsolated();

        if (table !== 'Nodes' && table !== 'Edges') {
            throw new Error(`${caller} supports 'Nodes' and 'Edges'. Received: ${String(table)}`);
        }

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(property)) {
            throw new Error(`${caller} property must be a plain identifier. Received: ${String(property)}`);
        }

        return `$.properties.${property}`
    }

    setRecordPropertyIfAbsent(table, id, property, value) {
        const path = this.assertNarrowWrite('setRecordPropertyIfAbsent', table, property);

        if (!path) return false;

        return narrowWriteResult(this.db.prepare(`
            UPDATE ${table}
            SET   data = json_set(data, '${path}', ?)
            WHERE id = ?
              AND json_extract(data, '${path}') IS NULL
        `).run(value, id));
    }

    /**
     * @summary Sets one property under `$.properties` in SQL, whatever its current value.
     *
     * Same single-path `json_set` as the write-once variant, without the `IS NULL` predicate: a read
     * receipt or an archive flag legitimately changes more than once, so guarding on absence would
     * silently drop the second write. Narrowness is the shared property; write-once is not.
     * @param {String} table `'Nodes'` or `'Edges'`.
     * @param {String} id Record id.
     * @param {String} property Property name under `$.properties`; identifier characters only.
     * @param {*} value Value to set; `null` sets JSON null rather than removing the key.
     * @returns {Boolean} `true` when a row matched and was updated.
     */
    setRecordProperty(table, id, property, value) {
        const path = this.assertNarrowWrite('setRecordProperty', table, property);

        if (!path) return false;

        return narrowWriteResult(this.db.prepare(`
            UPDATE ${table}
            SET   data = json_set(data, '${path}', ?)
            WHERE id = ?
        `).run(value, id));
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
     * Atomically removes one physical node only while it remains unreferenced.
     * The optional JSON-path guard keeps destructive cleanup bound to the exact
     * source marker that authorized it. A single conditional DELETE closes the
     * check/delete race across SQLite connections: a competing edge either commits
     * first and blocks this deletion, or loses the node FK after this deletion wins.
     *
     * This is a physical graph invariant, so it deliberately ignores requester RLS.
     * @param {String} nodeId
     * @param {Object} [options]
     * @param {String|null} [options.requiredPropertyPath=null] Rooted dotted object path with identifier-only segments.
     * @param {String|Number|Boolean|null} [options.requiredPropertyValue]
     * @returns {Boolean} `true` only when the row was removed.
     */
    removeNodeIfUnreferenced(nodeId, {
        requiredPropertyPath=null,
        requiredPropertyValue
    }={}) {
        if (!this.db?.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        if (typeof nodeId !== 'string' || nodeId.length === 0) {
            throw new TypeError('removeNodeIfUnreferenced requires a non-empty node id.');
        }
        if (requiredPropertyPath != null
            && (typeof requiredPropertyPath !== 'string'
                || !/^\$\.[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(requiredPropertyPath))) {
            throw new TypeError('requiredPropertyPath must use rooted dotted identifier syntax, e.g. `$.properties.marker`.');
        }

        this.assertTestWriteIsolated();

        const
            propertyGuard = requiredPropertyPath == null
                ? ''
                : 'AND json_extract(Nodes.data, ?) IS ?',
            statement     = this.db.prepare(`
                DELETE FROM Nodes
                WHERE Nodes.id = ?
                  ${propertyGuard}
                  AND NOT EXISTS (
                      SELECT 1 FROM Edges
                      WHERE Edges.source = Nodes.id OR Edges.target = Nodes.id
                  )
            `),
            propertyValue = typeof requiredPropertyValue === 'boolean'
                ? Number(requiredPropertyValue)
                : requiredPropertyValue,
            result        = requiredPropertyPath == null
                ? statement.run(nodeId)
                : statement.run(nodeId, requiredPropertyPath, propertyValue);

        return result.changes === 1
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
     * @summary Appends one immutable typed event to GraphLog.
     *
     * This method deliberately does not open its own transaction. Callers that couple an event to
     * a source mutation must invoke it inside the same `better-sqlite3` transaction as that write;
     * standalone operational events may call it directly.
     * @param {Object} args
     * @param {String} args.entityId Source entity id.
     * @param {String} args.eventId Durable server-owned event id.
     * @param {String} args.eventType Typed GraphLog event vocabulary.
     * @param {Object} args.payload Immutable event snapshot.
     * @returns {{eventId:String,logId:Number}}
     */
    appendGraphLogEvent({entityId, eventId, eventType, payload} = {}) {
        if (!this.db?.open) throw new Error('SQLite connection is closed (lifecycle violation).');
        if (typeof entityId !== 'string' || !entityId) throw new TypeError('GraphLog event entityId must be a non-empty string.');
        if (typeof eventId !== 'string' || !eventId) throw new TypeError('GraphLog event eventId must be a non-empty string.');
        if (typeof eventType !== 'string' || !eventType) throw new TypeError('GraphLog event eventType must be a non-empty string.');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('GraphLog event payload must be an object.');

        const info = this.db.prepare(`
            INSERT INTO GraphLog(entity_id, entity_type, event_id, event_payload)
            VALUES (?, ?, ?, ?)
        `).run(entityId, eventType, eventId, JSON.stringify(payload));

        return {eventId, logId: Number(info.lastInsertRowid)}
    }

    /**
     * Executes localized sequence polling isolating un-processed Native SQL edits securely resolving Cache Coherence natively cleanly.
     * Maps `AFTER UPDATE/INSERT/DELETE` trigger records stored in `GraphLog` locally comparing explicitly sequentially securely validating remote worker diffs internally perfectly accurately.
     * @see Neo.ai.graph.Database#syncCache
     * The optional raw-row limit is applied by SQLite before result materialization. Consumers
     * that need to remain schedulable under a large mutation wave can therefore page the journal
     * without first allocating or walking the full tail. Existing callers retain the historical
     * unbounded behavior by omitting `options.limit`.
     *
     * @param {Number} sinceId
     * @param {Object} [options]
     * @param {Number|null} [options.limit=null] Positive maximum raw GraphLog rows to materialize.
     * @param {Number|null} [options.untilId=null] Inclusive upper log-id boundary for a frozen page sequence.
     * @returns {Object} { lastLogId, invalidNodes, invalidEdges, events, entityLogIds, hasMore }
     */
    getDeltaLog(sinceId = 0, {limit = null, untilId = null} = {}) {
        const isBounded     = limit !== null && limit !== undefined;
        const hasUpperBound = untilId !== null && untilId !== undefined;

        if (isBounded && (!Number.isInteger(limit) || limit <= 0)) {
            throw new TypeError('GraphLog delta limit must be a positive integer.');
        }
        if (hasUpperBound && (!Number.isInteger(untilId) || untilId < 0)) {
            throw new TypeError('GraphLog delta upper bound must be a non-negative integer.');
        }

        if (!this.db) return {
            lastLogId: sinceId, invalidNodes: [], invalidEdges: [], events: [], entityLogIds: new Map(), hasMore: false
        };
        if (!this.db.open) throw new Error('SQLite connection is closed (lifecycle violation).');

        let query = `
            SELECT log_id, entity_id, entity_type, event_id, event_payload
            FROM GraphLog
            WHERE log_id > ?
        `;
        const queryArgs = [sinceId];

        if (hasUpperBound) {
            query += ' AND log_id <= ?';
            queryArgs.push(untilId);
        }

        query += ' ORDER BY log_id ASC';
        if (isBounded) {
            query += ' LIMIT ?';
            queryArgs.push(limit + 1);
        }

        let logs = this.db.prepare(query).all(...queryArgs);

        const hasMore = isBounded && logs.length > limit;
        if (hasMore) logs = logs.slice(0, limit);

        let maxId           = sinceId;
        let invalidNodes    = new Set();
        let invalidEdgesMap = new Map();
        let events          = [];
        let entityLogIds    = new Map();

        for (let trace of logs) {
            maxId = trace.log_id > maxId ? trace.log_id : maxId;
            if (trace.entity_type === 'nodes') {
                invalidNodes.add(trace.entity_id);
                entityLogIds.set(trace.entity_id, trace.log_id);
            }
            else if (trace.entity_type === 'edges') {
                invalidEdgesMap.set(trace.entity_id, {id: trace.entity_id, logId: trace.log_id});
                entityLogIds.set(trace.entity_id, trace.log_id);
            }
            else if (trace.event_id && trace.event_payload) events.push(trace);
        }

        if (invalidEdgesMap.size > 0) {
            let edgeIds   = Array.from(invalidEdgesMap.keys());
            let chunkSize = SQLITE_IN_CLAUSE_BATCH_SIZE;
            for (let i = 0; i < edgeIds.length; i += chunkSize) {
                let chunk        = edgeIds.slice(i, i + chunkSize);
                let placeholders = chunk.map(() => '?').join(',');
                let edgesQuery   = this.db.prepare(`SELECT id, source, target FROM Edges WHERE id IN (${placeholders})`);
                let edgesData    = edgesQuery.all(...chunk);
                for (let row of edgesData) {
                    invalidEdgesMap.set(row.id, {...invalidEdgesMap.get(row.id), source: row.source, target: row.target});
                }
            }
        }

        return {
            lastLogId   : maxId,
            invalidNodes: Array.from(invalidNodes),
            invalidEdges: Array.from(invalidEdgesMap.values()),
            events,
            entityLogIds,
            hasMore
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
        let   rlsClause = `AND (user_id = ? OR user_id = ? OR user_id IS NULL OR json_extract(data, '$.properties.sharedEntity') = 1 OR json_extract(data, '$.properties.visibility') = 'team')`;

        const chunkSize   = SQLITE_IN_CLAUSE_BATCH_SIZE;
        let   targetNodes = [];
        let   edges       = [];

        for (let i = 0; i < ids.length; i += chunkSize) {
            let chunk        = ids.slice(i, i + chunkSize);
            let placeholders = chunk.map(() => '?').join(',');

            const nodesStmt = this.db.prepare(`SELECT data FROM Nodes WHERE id IN (${placeholders}) ${rlsClause}`);
            targetNodes.push(...nodesStmt.all(...chunk, userId, userIdAt).map(r => JSON.parse(r.data)));

            const edgesStmt   = this.db.prepare(`SELECT data FROM Edges WHERE (source IN (${placeholders}) OR target IN (${placeholders})) ${rlsClause}`);
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
                let chunk   = adjIdsArray.slice(i, i + chunkSize);
                let adjPl   = chunk.map(() => '?').join(',');
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
