import Base                 from '../../../../../src/core/Base.mjs';
import aiConfig             from '../config.mjs';
import logger               from '../logger.mjs';
import crypto               from 'crypto';
import path                 from 'path';
import fs                   from 'fs-extra';
import TextEmbeddingService from '../services/TextEmbeddingService.mjs';

/**
 * @summary A native SQLite Vector database wrapper mimicking ChromaDB's API.
 * Uses sqlite-vec to maintain fully local, zero-dependency embedding queries.
 *
 * @class Neo.ai.mcp.server.memory-core.services.SQLiteVectorManager
 * @extends Neo.core.Base
 * @singleton
 */
class SQLiteVectorManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.managers.SQLiteVectorManager'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.managers.SQLiteVectorManager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         * @protected
         */
        db: null,
        /**
         * @member {Object|null} collectionsCache={}
         * @protected
         */
        collectionsCache: {}
    }

    /**
     * @summary Initializes the SQLite database and loads the sqlite-vec extension.
     * Establishes system tables and cross-checks the current embedding model
     * dimensions against any existing collections to prevent vector corruption.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        if (this.db) return;

        if (aiConfig.engine !== 'neo' && aiConfig.engine !== 'both') {
            logger.log('[SQLiteVectorManager] Engine configured to bypass local vector manager. Skipping init.');
            return;
        }

        // 1. Establish SQLite DB Connection
        let dbPath = typeof aiConfig.sqlitePath === 'string' ? aiConfig.sqlitePath : path.resolve(process.cwd(), 'neo-memory-core-sqlite/knowledge-graph.sqlite');
        await fs.ensureDir(path.dirname(dbPath));

        // Dynamic imports for native modules
        const Database = (await import('better-sqlite3')).default;
        const sqliteVec = await import('sqlite-vec');

        // Load sqlite-vec securely across architectures
        const extPath = sqliteVec.getLoadablePath();
        this.db = new Database(dbPath, { verbose: null });
        this.db.pragma('journal_mode = WAL');

        // Load the sqlite-vec extension
        try {
            sqliteVec.load(this.db);
        } catch (e) {
            throw new Error(`Failed to load sqlite-vec native extension from path [${extPath}]. Ensure binary compatibility for your architecture.`, { cause: e });
        }

        // System tables
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS vector_collections_meta (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE,
                dimension INTEGER
            );
        `);

        // Create client mock for deleteCollection
        this.client = {
            deleteCollection: async ({ name }) => {
                const tableName = name.replace(/[^a-zA-Z0-9_]/g, '_');
                this.db.exec(`DROP TABLE IF EXISTS ${tableName}_data;`);
                this.db.exec(`DROP TABLE IF EXISTS ${tableName}_vec;`);
                this.db.prepare(`DELETE FROM vector_collections_meta WHERE name = ?`).run(tableName);
                delete this.collectionsCache[name];
                logger.log(`[SQLiteVectorManager] Deleted collection ${name}`);
            }
        };

        logger.log('[SQLiteVectorManager] Validating vector dimensions against existing collections...');
        const tables = this.db.prepare('SELECT * FROM vector_collections_meta').all();
        if (tables.length > 0) {
            try {
                const dummy = await TextEmbeddingService.embedText("dimension_test", aiConfig.neoEmbeddingProvider);
                const currentDim = dummy.length;
                for (const table of tables) {
                    if (table.dimension !== currentDim) {
                        logger.error(`[SQLiteVectorManager] CRITICAL STARTUP ERROR: SQLite Vector Dimension Mismatch!`);
                        logger.error(`[SQLiteVectorManager] Table '${table.name}' expects ${table.dimension}D vectors.`);
                        logger.error(`[SQLiteVectorManager] Current embedding model outputs ${currentDim}D vectors.`);
                        throw new Error(`Vector dimension mismatch. Expected ${table.dimension}, got ${currentDim}.`);
                    }
                }
            } catch (e) {
                logger.error('[SQLiteVectorManager] Failed to validate embedding dimensions:', e.message);
                throw e;
            }
        }

        logger.log('[SQLiteVectorManager] SQLite VSS mounted successfully via sqlite-vec.');
    }

    /**
     * @summary Retrieves or creates the core episodic memory collection.
     * Uses configuration defined in aiConfig.memoryDb.
     * @returns {Promise<Object>} An interface providing add, get, and query methods.
     */
    async getMemoryCollection() {
        return this.getOrCreateCollection({ name: aiConfig.memoryDb.collectionName });
    }

    /**
     * @summary Retrieves or creates the session summary collection.
     * Uses configuration defined in aiConfig.sessionDb.
     * @returns {Promise<Object>} An interface providing add, get, and query methods.
     */
    async getSummaryCollection() {
        return this.getOrCreateCollection({ name: aiConfig.sessionDb.collectionName });
    }

    /**
     * @summary Core infrastructure method that scaffolds the underlying SQLite tables
     * for a vector collection if it does not already exist. It resolves the
     * correct vector dimension dynamically based on the current embedding model.
     * @param {Object} config API matching ChromaDB's getOrCreateCollection.
     * @param {String} config.name The unique name for the collection.
     * @returns {Promise<Object>} The collection abstraction interface.
     */
    async getOrCreateCollection({ name }) {
        if (this.collectionsCache[name]) {
            return this.collectionsCache[name];
        }

        // Clean name to be valid table name
        const tableName = name.replace(/[^a-zA-Z0-9_]/g, '_');

        let col = this.db.prepare('SELECT * FROM vector_collections_meta WHERE name = ?').get(tableName);
        let dim = col ? col.dimension : null;

        if (!col) {
            logger.log(`[SQLiteVectorManager] Discovering embedding dimension for new collection: ${tableName}`);
            // Infer dimension via a dummy generation
            const dummy = await TextEmbeddingService.embedText("dimension_test", aiConfig.neoEmbeddingProvider);
            dim = dummy.length;

            this.db.prepare('INSERT INTO vector_collections_meta (id, name, dimension) VALUES (?, ?, ?)').run(crypto.randomUUID(), tableName, dim);

            // Create structural tables
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS ${tableName}_data (
                    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
                    chroma_id TEXT UNIQUE,
                    document TEXT,
                    metadata TEXT
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS ${tableName}_vec USING vec0(
                    embedding float[${dim}]
                );
            `);
        }

        const collectionInterface = this.#createInterface(tableName, dim);
        this.collectionsCache[name] = collectionInterface;
        return collectionInterface;
    }

    /**
     * @summary Factory method that generates the abstraction interface for a specific SQLite vector collection.
     * Maps ChromaDB collection methodology (count, add, upsert, get, query) to native sqlite-vec SQL statements.
     * @param {String} tableName The sanitized name for the physical SQLite tables (_data and _vec).
     * @param {Number} dim The vector dimension lock established for this table.
     * @returns {Object} Interface matching ChromaDB's API surface with `count`, `add`, `upsert`, `get`, and `query`.
     * @private
     */
    #createInterface(tableName, dim) {
        const self = this;

        return {
            name: tableName,

            async count() {
                const res = self.db.prepare(`SELECT count(*) as c FROM ${tableName}_data`).get();
                return res.c || 0;
            },

            async add({ ids, embeddings, metadatas, documents }) {
                return await this.upsert({ ids, embeddings, metadatas, documents });
            },

            async delete({ ids, where }) {
                // Delete by IDs (if provided)
                if (ids && ids.length > 0) {
                    const delData = self.db.prepare(`DELETE FROM ${tableName}_data WHERE chroma_id = ? RETURNING rowid`);
                    const delVec  = self.db.prepare(`DELETE FROM ${tableName}_vec WHERE rowid = ?`);

                    const tx = self.db.transaction(() => {
                        for (const id of ids) {
                            const res = delData.get(id);
                            if (res && res.rowid !== undefined) {
                                delVec.run(BigInt(res.rowid));
                            }
                        }
                    });
                    tx();
                }

                // Delete by Where clause (if provided)
                if (where) {
                    let conditions = [];
                    let values = [];
                    for (const [key, val] of Object.entries(where)) {
                        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
                        values.push(val);
                    }
                    if (conditions.length > 0) {
                        const sql = `DELETE FROM ${tableName}_data WHERE ` + conditions.join(' AND ') + ` RETURNING rowid`;
                        const delData = self.db.prepare(sql);
                        const delVec  = self.db.prepare(`DELETE FROM ${tableName}_vec WHERE rowid = ?`);

                        const tx = self.db.transaction(() => {
                            const results = delData.all(...values);
                            for (const row of results) {
                                if (row && row.rowid !== undefined) {
                                    delVec.run(BigInt(row.rowid));
                                }
                            }
                        });
                        tx();
                    }
                }
            },

            async upsert({ ids, embeddings, metadatas, documents }) {
                // Generate any missing embeddings BEFORE the synchronous SQLite transaction
                let finalEmbeddings = embeddings || [];
                if (documents && finalEmbeddings.length !== ids.length) {
                    finalEmbeddings = [];
                    for (let i = 0; i < ids.length; i++) {
                        if (embeddings && embeddings[i]) {
                            finalEmbeddings.push(embeddings[i]);
                        } else if (documents[i]) {
                            const e = await TextEmbeddingService.embedText(documents[i], aiConfig.neoEmbeddingProvider);
                            finalEmbeddings.push(e);
                        } else {
                            finalEmbeddings.push(null);
                        }
                    }
                }

                const upsertData = self.db.prepare(`
                    INSERT INTO ${tableName}_data (chroma_id, document, metadata) 
                    VALUES (?, ?, ?)
                    ON CONFLICT(chroma_id) DO UPDATE SET document=excluded.document, metadata=excluded.metadata
                    RETURNING rowid
                `);
                const deleteVec = self.db.prepare(`DELETE FROM ${tableName}_vec WHERE rowid = ?`);
                const insertVec = self.db.prepare(`INSERT INTO ${tableName}_vec (rowid, embedding) VALUES (?, ?)`);

                const tx = self.db.transaction(() => {
                    for (let i = 0; i < ids.length; i++) {
                        const metaStr = metadatas && metadatas[i] ? JSON.stringify(metadatas[i]) : '{}';
                        const docStr  = documents && documents[i] ? documents[i] : '';

                        const res = upsertData.get(ids[i], docStr, metaStr);
                        const rowid = BigInt(res.rowid);

                        if (finalEmbeddings[i]) {
                            deleteVec.run(rowid);
                            const f32 = new Float32Array(finalEmbeddings[i]);
                            insertVec.run(rowid, f32);
                        }
                    }
                });

                tx();
            },

            async get({ ids, where, include, limit, offset }) {
                let sql = `SELECT * FROM ${tableName}_data`;
                let conditions = [];
                let values = [];

                if (ids && ids.length > 0) {
                    const placeholders = ids.map(() => '?').join(',');
                    conditions.push(`chroma_id IN (${placeholders})`);
                    values.push(...ids);
                }

                if (where) {
                    for (const [key, val] of Object.entries(where)) {
                        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
                        values.push(val);
                    }
                }

                if (conditions.length > 0) {
                    sql += ` WHERE ` + conditions.join(' AND ');
                }

                sql += ` ORDER BY rowid DESC`;

                if (limit !== undefined) {
                    sql += ` LIMIT ?`;
                    values.push(limit);
                    if (offset !== undefined) {
                        sql += ` OFFSET ?`;
                        values.push(offset);
                    }
                }

                const rows = self.db.prepare(sql).all(...values);

                return {
                    ids: rows.map(r => r.chroma_id),
                    metadatas: include && include.includes('metadatas') ? rows.map(r => JSON.parse(r.metadata)) : [],
                    documents: include && include.includes('documents') ? rows.map(r => r.document) : [],
                    embeddings: [] // Rarely needed via raw GET
                };
            },

            async query({ queryEmbeddings, queryTexts, nResults, where }) {
                // Allow dynamic generation from queryTexts
                let finalQueryEmbedding = queryEmbeddings ? queryEmbeddings[0] : null;
                if (!finalQueryEmbedding && queryTexts && queryTexts.length > 0) {
                    finalQueryEmbedding = await TextEmbeddingService.embedText(queryTexts[0], aiConfig.neoEmbeddingProvider);
                }

                if (!finalQueryEmbedding) {
                    throw new Error('SQLiteVectorManager requires queryEmbeddings or queryTexts');
                }

                const f32 = new Float32Array(finalQueryEmbedding);

                let whereClause = '';
                let queryArgs = [f32, nResults || 5];

                if (where) {
                    let conditions = [];
                    for (const [key, val] of Object.entries(where)) {
                        // Subquery metadata extraction rather than joined table direct extraction
                        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
                        queryArgs.push(val);
                    }
                    if (conditions.length > 0) {
                        whereClause = `AND v.rowid IN (SELECT rowid FROM ${tableName}_data WHERE ` + conditions.join(' AND ') + `)`;
                    }
                }

                // Query vector search using pre-filtering via rowid IN (), then join _data to return columns
                const sql = `
                    SELECT 
                        d.chroma_id as id, 
                        d.metadata, 
                        d.document, 
                        v.distance 
                    FROM ${tableName}_vec v
                    JOIN ${tableName}_data d ON v.rowid = d.rowid
                    WHERE v.embedding MATCH ? AND k = ? ${whereClause}
                    ORDER BY v.distance
                `;

                const rows = self.db.prepare(sql).all(...queryArgs);

                for (const row of rows) {
                    returnData.ids[0].push(row.id);
                    returnData.metadatas[0].push(JSON.parse(row.metadata));
                    returnData.documents[0].push(row.document);
                    returnData.distances[0].push(row.distance);
                }

                return returnData;
            }
        };
    }
}

export default Neo.setupClass(SQLiteVectorManager);
