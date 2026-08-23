import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import Database         from 'better-sqlite3';
import memoryCoreConfig from '../mcp/server/memory-core/config.mjs';

/**
 * @summary Prints recent Native Edge Graph rows from the resolved Memory Core graph leaf.
 * @returns {void}
 */
function run() {
    try {
        const dbPath = memoryCoreConfig.storagePaths.graph;
        const db     = new Database(dbPath, { readonly: true });

        const nodes = db.prepare('SELECT * FROM nodes ORDER BY rowid DESC LIMIT 15').all();
        const edges = db.prepare('SELECT * FROM edges ORDER BY rowid DESC LIMIT 15').all();

        console.log("=== RECENT NODES ===");
        for (const row of nodes) {
            let data = {};
            try { data = JSON.parse(row.data || '{}'); } catch(e){}
            let props = data.properties || {};
            console.log(`ID: ${row.id}`);
            console.log(`  Type: ${data.label}`);
            console.log(`  Name: ${props.name}`);
            console.log(`  Desc: ${props.description}\n`);
        }

        console.log("=== RECENT EDGES ===");
        for (const row of edges) {
            let data = {};
            try { data = JSON.parse(row.data || '{}'); } catch(e){}
            let props = data.properties || {};
            console.log(`ID: ${row.id} | ${row.source} -[${row.type}]-> ${row.target} | Weight: ${props.weight || 1.0}`);
        }

        db.close();
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
