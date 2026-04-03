import fs       from 'fs-extra';
import path     from 'path';
import Database from 'better-sqlite3';
import aiConfig from '../config.mjs';
import logger   from '../logger.mjs';
import Base     from '../../../../../src/core/Base.mjs';

/**
 * @summary Service that manages the SQLite Knowledge Graph (Nodes and Edges).
 *
 * It provides the topological layout of the Neo.mjs namespace, knowledge,
 * and history structurally mapping against semantic ChromaDB queries.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.GraphService
 * @extends Neo.core.Base
 * @singleton
 */
class GraphService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.GraphService'
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.GraphService',
        /**
         * @member {Boolean} singleton=true
         */
        singleton: true,
        /**
         * @member {Object|null} db=null
         */
        db: null
    }

    /**
     * Initializes the SQLite Database and PRAGMA configurations.
     */
    async initAsync() {
        await super.initAsync();
        
        await fs.ensureDir(path.dirname(aiConfig.sqlitePath));

        this.db = new Database(aiConfig.sqlitePath, { verbose: null });
        this.db.pragma('journal_mode = WAL');

        this.initSchema();
        logger.log('[GraphService] SQLite database mounted securely.');
    }

    /**
     * Defines the Nodes and Edges schemas mapping directly to the NeoCortex models.
     */
    initSchema() {
        // Prepare tables structurally supporting arbitrary code, memory, and topology items
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Nodes (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                semanticVectorId TEXT
            );
        `);

        // Store traversal linking topology 
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS Edges (
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                relationship TEXT NOT NULL,
                weight REAL DEFAULT 1.0,
                PRIMARY KEY (source, target, relationship),
                FOREIGN KEY (source) REFERENCES Nodes(id) ON DELETE CASCADE,
                FOREIGN KEY (target) REFERENCES Nodes(id) ON DELETE CASCADE
            );
        `);
        
        logger.log('[GraphService] Graph schematic synchronized.');
    }

    /**
     * Upserts a Node representation into the graph securely linking the ID.
     * @param {Object} node 
     */
    upsertNode({ id, type, name, description, semanticVectorId }) {
        const stmt = this.db.prepare(`
            INSERT INTO Nodes (id, type, name, description, semanticVectorId)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                type=excluded.type,
                name=excluded.name,
                description=excluded.description,
                semanticVectorId=excluded.semanticVectorId
        `);
        stmt.run(id, type, name, description || null, semanticVectorId || null);
    }

    /**
     * Links two nodes via a relationship tracking edge weight metadata.
     * @param {String} source 
     * @param {String} target 
     * @param {String} relationship 
     * @param {Number} weight 
     */
    linkNodes(source, target, relationship, weight = 1.0) {
        // Safe-guard enforcing node presence gracefully internally inside upsert cascades
        const stmt = this.db.prepare(`
            INSERT INTO Edges (source, target, relationship, weight)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(source, target, relationship) DO UPDATE SET
                weight=excluded.weight
        `);
        try {
            stmt.run(source, target, relationship, weight);
        } catch (e) {
             logger.warn(`[GraphService] Link Failed ${source} -> ${target}: ${e.message}`);
        }
    }

    /**
     * Retrieves a specific node by its ID.
     * @param {String} id 
     * @returns {Object|null}
     */
    getNode(id) {
        const stmt = this.db.prepare('SELECT * FROM Nodes WHERE id = ?');
        return stmt.get(id) || null;
    }

    /**
     * Retrieves adjacent connected nodes (neighbors) alongside relationship metadata.
     * @param {String} id 
     * @returns {Array} List of connected Node objects with edge relationship mapping.
     */
    getNeighbors(id) {
        // Flat join to retrieve immediate topology scope
        const stmt = this.db.prepare(`
            SELECT n.*, e.relationship, e.weight, e.source, e.target
            FROM Edges e
            JOIN Nodes n ON (n.id = e.target AND e.source = ?) OR (n.id = e.source AND e.target = ?)
        `);
        return stmt.all(id, id);
    }

    /**
     * Performs a text-based fuzzy search across node topology to find structural entities.
     * @param {String} queryString 
     * @returns {Array} List of matching Nodes.
     */
    searchNodes(queryString) {
        const stmt = this.db.prepare(`
            SELECT * FROM Nodes 
            WHERE name LIKE ? OR description LIKE ? OR id LIKE ?
            LIMIT 50
        `);
        const q = `%${queryString}%`;
        return stmt.all(q, q, q);
    }
}

export default Neo.setupClass(GraphService);
