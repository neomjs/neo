import { fileURLToPath } from 'url';
import path from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../.neo-ai-data/neo-sqlite/knowledge-graph.sqlite');

function run() {
    try {
        const db = new Database(dbPath, { readonly: true });

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
