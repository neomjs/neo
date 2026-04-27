import { test, expect } from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import crypto from 'crypto';

test.describe('Bridge Daemon', () => {
    let db;
    let daemonProcess;
    const TEST_ID = crypto.randomUUID().substring(0, 8);
    const DB_PATH = `.neo-ai-data/sqlite/test-daemon-${TEST_ID}.sqlite`;
    const DAEMON_DIR = `.neo-ai-data/wake-daemon-test-${TEST_ID}`;

    test.beforeAll(() => {
        fs.ensureDirSync(path.dirname(DB_PATH));
        fs.ensureDirSync(DAEMON_DIR);
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
        if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
        
        db = new Database(DB_PATH);
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
    });

    test.afterAll(() => {
        if (daemonProcess) daemonProcess.kill('SIGKILL');
        if (db) db.close();
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
        if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
        fs.removeSync(DAEMON_DIR);
    });

    test('detects and delivers wake events via test adapter', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent' }
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

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        // Start the daemon with environment overrides
        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);
            
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Bridge Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        // Wait a short moment to ensure daemon initializes
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Inject MESSAGE and SENT_TO edge
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

        // Wait for delivery
        const output = await deliveryPromise;
        expect(output).toContain('[Bridge Daemon Test Adapter] Delivered');
        expect(output).toContain('Test Wake Event');

        // Per #10419 — verify the diagnostic log file was persisted to disk and contains
        // structured entries (ISO timestamp + PID + INFO/ERROR level prefix). Persistence
        // is the substrate for post-hoc wake-failure investigation; without this audit
        // trail every diagnostic depends on terminal-scrollback luck.
        const logFile = path.join(DAEMON_DIR, 'bridge.log');
        expect(fs.existsSync(logFile)).toBe(true);
        const logContents = fs.readFileSync(logFile, 'utf8');
        expect(logContents).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/); // ISO timestamp
        expect(logContents).toMatch(/\[PID:\d+\]/);                                       // PID prefix
        expect(logContents).toMatch(/\[INFO\]/);                                          // level prefix
        expect(logContents).toContain('[Bridge Daemon Test Adapter] Delivered');          // Same delivery line as stdout
    });
});
