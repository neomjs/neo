import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import crypto from 'crypto';

const DB_PATH = '.neo-ai-data/sqlite/memory-core-graph.sqlite';

fs.ensureDirSync(path.dirname(DB_PATH));
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ensure tables exist
db.exec(`
    CREATE TABLE IF NOT EXISTS Nodes (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS Edges (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        type TEXT NOT NULL,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS GraphLog (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Insert mock agent node and subscription
const subId = 'sub_' + crypto.randomUUID();
const agentId = '@test-agent';

db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
    id: agentId,
    label: 'AGENT',
    properties: {
        name: 'Test Agent'
    }
}));

db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
    id: subId,
    label: 'WAKE_SUBSCRIPTION',
    properties: {
        agentIdentity: agentId,
        harnessTarget: 'bridge-daemon',
        status: 'active',
        trigger: 'SENT_TO_ME',
        harnessTargetMetadata: {
            adapter: 'test',
            coalesceWindow: 1 // 1 second for fast test
        }
    }
}));

// Insert into GraphLog
db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

console.log(`[Test] Inserted WAKE_SUBSCRIPTION ${subId}`);

// Start the daemon
const daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], { stdio: 'pipe' });

daemonProcess.stdout.on('data', (data) => {
    const out = data.toString();
    console.log(out.trim());
    
    if (out.includes('[Bridge Daemon Test Adapter] Delivered')) {
        console.log('[Test] SUCCESS: Daemon detected and delivered event.');
        daemonProcess.kill();
        process.exit(0);
    }
});

daemonProcess.stderr.on('data', (data) => {
    console.error(`Daemon stderr: ${data.toString()}`);
});

setTimeout(() => {
    console.log('[Test] Injecting MESSAGE and SENT_TO edge...');
    
    const msgId = 'msg_' + crypto.randomUUID();
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
        id: msgId,
        label: 'MESSAGE',
        properties: {
            from: '@sender',
            subject: 'Test Wake Event'
        }
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

    const edgeId = 'edge_' + crypto.randomUUID();
    db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
        id: edgeId,
        source: msgId,
        target: agentId,
        type: 'SENT_TO'
    }), msgId, agentId, 'SENT_TO');
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

}, 2000); // Wait for daemon to start and do initial sync

setTimeout(() => {
    console.log('[Test] TIMEOUT: Daemon failed to deliver event within 10 seconds.');
    daemonProcess.kill();
    process.exit(1);
}, 10000);
