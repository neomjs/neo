import { test, expect } from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { getNodesData, getEdgesData } from '../../../../../ai/scripts/bridge-daemon-queries.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE } from '../../../../../ai/graph/storage/constants.mjs';

test.describe('Bridge Daemon', () => {
    let db;
    let daemonProcess;
    const TEST_ID = crypto.randomUUID().substring(0, 8);
    const DB_PATH = `.neo-ai-data/sqlite/test-daemon-${TEST_ID}.sqlite`;
    const DAEMON_DIR = `.neo-ai-data/wake-daemon-test-${TEST_ID}`;

    test.beforeEach(() => {
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

    test.afterEach(() => {
        if (daemonProcess) {
            daemonProcess.kill('SIGKILL');
            daemonProcess = null;
        }
        if (db) {
            db.close();
            db = null;
        }
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
                subject: 'Test Wake Event',
                priority: 'normal'
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
        expect(output).toContain('[WAKE][priority:normal]');
        expect(output).toContain('Test Wake Event');
        expect(output).toContain('priority: normal');

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

    test('does not deliver wake events for wakeSuppressed mailbox-only messages', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-suppressed';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent Suppressed' }
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
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let deliveryCount = 0;
        daemonProcess.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes('[Bridge Daemon Test Adapter] Delivered')) {
                deliveryCount++;
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId,
            label: 'MESSAGE',
            properties: {
                from: agentId,
                to: agentId,
                subject: 'Suppressed Sunset Ping',
                readAt: null,
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true
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

        await new Promise(resolve => setTimeout(resolve, 5500));

        expect(deliveryCount).toBe(0);

        const stored = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(msgId);
        const storedMessage = JSON.parse(stored.data);
        expect(storedMessage.properties.readAt).toBeNull();
        expect(storedMessage.properties.wakeSuppressed).toBe(true);
    });

    test('deduplicates multiple triggers for the same message in the coalescing window', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-dedup';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent Dedup' }
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
                    coalesceWindow: 2 // 2 seconds to ensure we catch multiple triggers
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let deliveryCount = 0;
        let finalDigest = '';
        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                resolve(); // Resolve instead of reject because we expect exactly one delivery. We'll wait a bit.
            }, 8000);
            
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                console.log('[DAEMON STDOUT]', out);
                if (out.includes('[Bridge Daemon Test Adapter] Delivered')) {
                    deliveryCount++;
                    finalDigest = out;
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId,
            label: 'MESSAGE',
            properties: {
                from: '@sender',
                subject: 'Test Dedup Event'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        // Insert first SENT_TO edge
        const edgeId1 = 'edge_1_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId1, JSON.stringify({
            id: edgeId1,
            source: msgId,
            target: agentId,
            type: 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId1, 'edges');

        // Insert second SENT_TO edge for the exact same message to simulate duplication
        const edgeId2 = 'edge_2_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId2, JSON.stringify({
            id: edgeId2,
            source: msgId,
            target: agentId,
            type: 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId2, 'edges');

        // Wait for 5 seconds to ensure any duplicate delivers would have occurred
        await deliveryPromise;
        
        expect(deliveryCount).toBe(1);
        expect(finalDigest).toContain('1 new messages');
        expect(finalDigest).toContain('Test Dedup Event');
        expect(finalDigest).toContain('[WAKE][priority:normal]');
        expect(finalDigest).toContain('priority: normal');
    });

    test('uses the highest coalesced message priority in the wake digest header', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-priority';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent Priority' }
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
                    coalesceWindow: 2
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver priority digest within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Bridge Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const lowMsgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(lowMsgId, JSON.stringify({
            id: lowMsgId,
            label: 'MESSAGE',
            properties: {
                from: '@sender',
                subject: 'Low Priority Wake Event',
                priority: 'low'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(lowMsgId, 'nodes');

        const lowEdgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(lowEdgeId, JSON.stringify({
            id: lowEdgeId,
            source: lowMsgId,
            target: agentId,
            type: 'SENT_TO'
        }), lowMsgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(lowEdgeId, 'edges');

        const highMsgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(highMsgId, JSON.stringify({
            id: highMsgId,
            label: 'MESSAGE',
            properties: {
                from: '@sender',
                subject: 'High Priority Wake Event',
                priority: 'high'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(highMsgId, 'nodes');

        const highEdgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(highEdgeId, JSON.stringify({
            id: highEdgeId,
            source: highMsgId,
            target: agentId,
            type: 'SENT_TO'
        }), highMsgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(highEdgeId, 'edges');

        const output = await deliveryPromise;
        expect(output).toContain('[WAKE][priority:high]');
        expect(output).toContain('2 new messages');
        expect(output).toContain('High Priority Wake Event');
        expect(output).toContain('priority: high');
    });

    test('skips osascript delivery and logs error when appName is missing', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-empty';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent Empty' }
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
                    adapter: 'osascript',
                    coalesceWindow: 1 // 1 second for fast test
                    // appName intentionally omitted
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const errorLogPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to log error within timeout')), 10000);
            
            daemonProcess.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes('harnessTargetMetadata.appName is missing/empty')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId,
            label: 'MESSAGE',
            properties: { from: '@sender', subject: 'Test Empty AppName' }
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

        const output = await errorLogPromise;
        expect(output).toContain('[Bridge Daemon] Cannot deliver subscription');
        expect(output).toContain(subId);
    });

    test('Antigravity chorded shortcut generates correct osascript using command and shift down', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-antigravity';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId,
            label: 'AGENT',
            properties: { name: 'Test Agent Antigravity' }
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
                    adapter: 'osascript',
                    appName: 'Antigravity',
                    coalesceWindow: 1 
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        // Create mock osascript to capture args without actually running AppleScript
        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/scripts/bridge-daemon.mjs'], {
            stdio: 'pipe',
            env: { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        // We know bridge-daemon will log INFO when it finishes osascript
        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);
            
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Bridge Daemon] Delivered ' + subId)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId,
            label: 'MESSAGE',
            properties: {
                from: '@sender',
                subject: 'Test Antigravity Event',
                priority: 'normal'
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

        await deliveryPromise;

        const mockOutput = fs.readFileSync(mockOutPath, 'utf8');
        const args = JSON.parse(mockOutput);
        
        expect(args.join(' ')).toContain('keystroke "i" using {command down, shift down}');
        expect(args.join(' ')).toContain('tell application "Antigravity" to activate');
    });

    test('getNodesData and getEdgesData deterministically chunk queries by SQLITE_IN_CLAUSE_BATCH_SIZE', () => {
        let prepareCount = 0;
        let paramsLength = [];

        const mockDb = {
            prepare: () => {
                prepareCount++;
                return {
                    all: (...params) => {
                        paramsLength.push(params.length);
                        return params.map(p => ({ id: p, data: '{}' }));
                    }
                };
            }
        };

        const overflowAmount = 50;
        const totalItems = SQLITE_IN_CLAUSE_BATCH_SIZE + overflowAmount;
        const ids = new Set(Array.from({ length: totalItems }, (_, i) => `id_${i}`));

        const nodeResults = getNodesData(mockDb, ids);
        expect(prepareCount).toBe(2);
        expect(paramsLength).toEqual([SQLITE_IN_CLAUSE_BATCH_SIZE, overflowAmount]);
        expect(nodeResults.length).toBe(totalItems);

        prepareCount = 0;
        paramsLength = [];
        const edgeResults = getEdgesData(mockDb, ids);
        expect(prepareCount).toBe(2);
        expect(paramsLength).toEqual([SQLITE_IN_CLAUSE_BATCH_SIZE, overflowAmount]);
        expect(edgeResults.length).toBe(totalItems);
    });
});
