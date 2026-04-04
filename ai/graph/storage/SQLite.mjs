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
            this.db.prepare('SELECT data FROM Nodes LIMIT 1').get();
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
     * @param {Object[]} nodes 
     */
    removeNodes(nodes) {
        if (!this.db || !nodes || nodes.length === 0) return;
        const stmt = this.db.prepare('DELETE FROM Nodes WHERE id = ?');
        
        const removeMany = this.db.transaction((nodesList) => {
            for (const node of nodesList) {
                stmt.run(node.id);
            }
        });
        
        removeMany(nodes);
    }

    /**
     * Cleaves standalone Edge matrices cleanly inside atomic DELETE loop transactions.
     * @param {Object[]} edges 
     */
    removeEdges(edges) {
        if (!this.db || !edges || edges.length === 0) return;
        const stmt = this.db.prepare('DELETE FROM Edges WHERE id = ?');
        
        const removeMany = this.db.transaction((edgesList) => {
            for (const edge of edgesList) {
                stmt.run(edge.id);
            }
        });
        
        removeMany(edges);
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
     * Reverse projects persistent SQLite structured queries back outwards,
     * repopulating dynamic volatile Native Edge mappings instantaneously directly down into Graph engine Store models.
     */
    async load() {
        if (!this.db || !this.database) return;
        
        const nodesStmt = this.db.prepare('SELECT data FROM Nodes');
        const edgesStmt = this.db.prepare('SELECT data FROM Edges');
        
        const nodeRecords = nodesStmt.all().map(row => JSON.parse(row.data));
        const edgeRecords = edgesStmt.all().map(row => JSON.parse(row.data));
        
        if (nodeRecords.length > 0) {
            this.database.autoSave = false;
            this.database.nodes.add(nodeRecords);
            this.database.autoSave = true;
        }
        
        if (edgeRecords.length > 0) {
            this.database.autoSave = false;
            this.database.edges.add(edgeRecords);
            this.database.autoSave = true;
        }
    }
}

export default Neo.setupClass(SQLite);
