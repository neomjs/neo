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
        const {dataDir, filename} = aiConfig.engines.neo;
        let dbPath                = path.resolve(dataDir, filename);
        await fs.ensureDir(path.dirname(dbPath));

        // Dynamic imports for native modules
        const Database  = (await import('better-sqlite3')).default;
        const sqliteVec = await import('sqlite-vec');

        // Load sqlite-vec securely across architectures
        const extPath = sqliteVec.getLoadablePath();
        this.db       = new Database(dbPath, {verbose: null});
        this.db.pragma('journal_mode = WAL');

        // Load the sqlite-vec extension
        try {
            sqliteVec.load(this.db);
        } catch (e) {
            throw new Error(`Failed to load sqlite-vec native extension from path [${extPath}]. Ensure binary compatibility for your architecture.`, {cause: e});
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
            deleteCollection: async ({name}) => {
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
                const dummy      = await TextEmbeddingService.embedText("dimension_test", aiConfig.neoEmbeddingProvider);
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
     * Uses configuration defined in aiConfig.collections.
     * @returns {Promise<Object>} An interface providing add, get, and query methods.
     */
    async getMemoryCollection() {
        return this.getOrCreateCollection({name: aiConfig.collections.memory});
    }

    /**
     * @summary Retrieves or creates the session summary collection.
     * Uses configuration defined in aiConfig.collections.
     * @returns {Promise<Object>} An interface providing add, get, and query methods.
     */
    async getSummaryCollection() {
        return this.getOrCreateCollection({name: aiConfig.collections.session});
    }

    /**
     * @summary Core infrastructure method that scaffolds the underlying SQLite tables
     * for a vector collection if it does not already exist. It resolves the
     * correct vector dimension dynamically based on the current embedding model.
     * @param {Object} config API matching ChromaDB's getOrCreateCollection.
     * @param {String} config.name The unique name for the collection.
     * @returns {Promise<Object>} The collection abstraction interface.
     */
    async getOrCreateCollection({name}) {
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
            dim         = dummy.length;

            // Prevent race conditions with concurrent async initializations
            this.db.prepare('INSERT OR IGNORE INTO vector_collections_meta (id, name, dimension) VALUES (?, ?, ?)').run(crypto.randomUUID(), tableName, dim);

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

        const collectionInterface   = this.#createInterface(tableName, dim);
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

        const buildWhere = (where, tableAlias = '') => {
            let conditions = [];
            let values = [];
            if (!where) return { conditions, values };
            
            for (const [key, val] of Object.entries(where)) {
                let field = tableAlias ? `json_extract(${tableAlias}.metadata, '$.${key}')` : `json_extract(metadata, '$.${key}')`;
                
                if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                    for (const [op, opVal] of Object.entries(val)) {
                        let bindVal = opVal;
                        if (typeof opVal === 'boolean') bindVal = opVal ? 1 : 0;
                        
                        if (op === '$eq') { conditions.push(`${field} = ?`); values.push(bindVal); }
                        else if (op === '$ne') { conditions.push(`${field} != ?`); values.push(bindVal); }
                        else if (op === '$gt') { conditions.push(`${field} > ?`); values.push(bindVal); }
                        else if (op === '$gte') { conditions.push(`${field} >= ?`); values.push(bindVal); }
                        else if (op === '$lt') { conditions.push(`${field} < ?`); values.push(bindVal); }
                        else if (op === '$lte') { conditions.push(`${field} <= ?`); values.push(bindVal); }
                    }
                } else {
                    let bindVal = val;
                    if (typeof val === 'boolean') bindVal = val ? 1 : 0;
                    conditions.push(`${field} = ?`);
                    values.push(bindVal);
                }
            }
            return { conditions, values };
        };

        return {
            name: tableName,

            async count() {
                const res = self.db.prepare(`SELECT count(*) as c FROM ${tableName}_data`).get();
                return res.c || 0;
            },

            async add({ids, embeddings, metadatas, documents}) {
                return await this.upsert({ids, embeddings, metadatas, documents});
            },

            async delete({ids, where}) {
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
                    const { conditions, values } = buildWhere(where, '');
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

            async upsert({ids, embeddings, metadatas, documents}) {
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

                        const res   = upsertData.get(ids[i], docStr, metaStr);
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

            async update({ids, metadatas, documents}) {
                const tx = self.db.transaction(() => {
                    for (let i = 0; i < ids.length; i++) {
                        let updates = [];
                        let vals = [];

                        if (documents && documents[i] !== undefined) {
                            updates.push('document = ?');
                            vals.push(documents[i]);
                        }
                        if (metadatas && metadatas[i] !== undefined) {
                            updates.push('metadata = ?');
                            vals.push(JSON.stringify(metadatas[i]));
                        }
                        if (updates.length > 0) {
                            vals.push(ids[i]);
                            self.db.prepare(`UPDATE ${tableName}_data SET ${updates.join(', ')} WHERE chroma_id = ?`).run(...vals);
                        }
                    }
                });
                tx();
            },

            async get({ids, where, include, limit, offset}) {
                const fetchEmbeddings = include && include.includes('embeddings');

                let sql = fetchEmbeddings
                    ? `SELECT d.*, v.embedding FROM ${tableName}_data d LEFT JOIN ${tableName}_vec v ON d.rowid = v.rowid`
                    : `SELECT d.* FROM ${tableName}_data d`;

                let conditions = [];
                let values     = [];

                if (ids && ids.length > 0) {
                    const placeholders = ids.map(() => '?').join(',');
                    conditions.push(`d.chroma_id IN (${placeholders})`);
                    values.push(...ids);
                }

                if (where) {
                    const w = buildWhere(where, 'd');
                    conditions.push(...w.conditions);
                    values.push(...w.values);
                }

                if (conditions.length > 0) {
                    sql += ` WHERE ` + conditions.join(' AND ');
                }

                sql += ` ORDER BY d.rowid DESC`;

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
                    ids       : rows.map(r => r.chroma_id),
                    metadatas : include && include.includes('metadatas') ? rows.map(r => JSON.parse(r.metadata)) : [],
                    documents : include && include.includes('documents') ? rows.map(r => r.document) : [],
                    embeddings: fetchEmbeddings ? rows.map(r => r.embedding ? Array.from(new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4)) : null) : []
                };
            },

            async query({queryEmbeddings, queryTexts, nResults, where}) {
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
                let queryArgs   = [f32, nResults || 5];

                if (where) {
                    const w = buildWhere(where, '');
                    if (w.conditions.length > 0) {
                        whereClause = `AND v.rowid IN (SELECT rowid FROM ${tableName}_data WHERE ` + w.conditions.join(' AND ') + `)`;
                        queryArgs.push(...w.values);
                    }
                }

                // Query vector search using pre-filtering via rowid IN (), then join _data to return columns
                const sql = `
                    SELECT d.chroma_id as id,
                           d.metadata,
                           d.document,
                           v.distance
                    FROM ${tableName}_vec v
                    JOIN ${tableName}_data d ON v.rowid = d.rowid
                    WHERE v.embedding MATCH ? AND k = ? ${whereClause}
                    ORDER BY v.distance
                `;

                const rows = self.db.prepare(sql).all(...queryArgs);

                let returnData = {ids: [[]], metadatas: [[]], documents: [[]], distances: [[]]};

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
