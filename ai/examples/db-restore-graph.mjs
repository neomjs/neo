import fs from 'fs';
import Database from 'better-sqlite3';

const backupFile = process.argv[2];
if (!backupFile) {
    console.error('❌ Please provide the path to the backup file.');
    process.exit(1);
}

const dbPath = './.neo-ai-data/neo-sqlite/memory-core.sqlite';
const db = new Database(dbPath);

console.log('🔄 Starting Native Edge Graph Pure-SQLite Restore...');
console.log(`- Reading backup file: ${backupFile}`);

const rawText = fs.readFileSync(backupFile, 'utf8');
const items = rawText.split('\\n');

console.log(`- Found ${items.length} records to process.`);

const insertNode = db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)');
const insertEdge = db.prepare('INSERT OR REPLACE INTO Edges (id, source, target, type, data) VALUES (?, ?, ?, ?, ?)');

let nodeCount = 0;
let edgeCount = 0;

db.exec('BEGIN TRANSACTION;');

try {
    for (const itemText of items) {
        if (!itemText.trim()) continue;
        
        let item;
        try {
            item = JSON.parse(itemText);
        } catch (e) {
            console.error(`❌ Parse error: ${e.message} on chunk: ${itemText.substring(0, 50)}...`);
            continue;
        }

        if (item.type === 'node') {
            insertNode.run(item.data.id, JSON.stringify(item.data));
            nodeCount++;
        } else if (item.type === 'edge') {
            const data = item.data;
            insertEdge.run(data.id, data.source, data.target, data.type, JSON.stringify(data));
            edgeCount++;
        }
    }
    db.exec('COMMIT;');
    console.log(`✅ Restore complete. Inserted ${nodeCount} nodes and ${edgeCount} edges.`);
} catch (e) {
    db.exec('ROLLBACK;');
    console.error('❌ SQLite Restore Failed:', e);
}

process.exit(0);
