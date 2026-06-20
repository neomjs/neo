import { test, expect }                                                                        from '@playwright/test';
import fs                                                                                      from 'fs-extra';
import path                                                                                    from 'path';
import Database                                                                                from 'better-sqlite3';
import { spawn }                                                                               from 'child_process';
import crypto                                                                                  from 'crypto';
import http                                                                                    from 'http';
import os                                                                                      from 'os';
import { collapseDuplicateShapeCRoutes, getActiveHarnessPresence, getNodesData, getEdgesData } from '../../../../../../ai/daemons/wake/queries.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE }                                                         from '../../../../../../ai/graph/storage/constants.mjs';

/**
 * @summary Stubs `ps` for subprocess daemon tests so instance-resolution branches do not depend
 * on the host machine's live GUI process list.
 *
 * The wake daemon resolves same-bundle harness instances by shelling out to `ps`. Unit tests that
 * assert the default app-activate AppleScript path must force the resolver to return `null`,
 * otherwise a developer machine with Claude.app already running can take the PID-targeted branch
 * while CI takes the activate branch.
 *
 * @param {String} binDir
 * @param {String} [psOutput='']
 */
function writeMockPs(binDir, psOutput = '') {
    const mockPsPath = path.join(binDir, 'ps');

    fs.writeFileSync(mockPsPath, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(psOutput)});\n`);
    fs.chmodSync(mockPsPath, 0o755);
}

function insertWakeSubscription(db, {
    subId = 'sub_' + crypto.randomUUID(),
    agentId,
    harnessTargetMetadata
}) {
    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
        id        : agentId,
        label     : 'AGENT',
        properties: { name: agentId }
    }));

    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
        id        : subId,
        label     : 'WAKE_SUBSCRIPTION',
        properties: {
            agentIdentity: agentId,
            harnessTarget: 'bridge-daemon',
            status       : 'active',
            trigger      : 'SENT_TO_ME',
            harnessTargetMetadata
        }
    }));

    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

    return subId;
}

function insertHarnessPresence(db, {
    presenceId = 'presence_' + crypto.randomUUID(),
    subId,
    agentId,
    lastSeenAt = new Date().toISOString()
}) {
    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(presenceId, JSON.stringify({
        id        : presenceId,
        label     : 'HARNESS_PRESENCE',
        properties: {
            agentIdentity : agentId,
            subscriptionId: subId,
            state         : 'idle',
            wakePolicy    : 'immediate',
            source        : 'mcp-client',
            bootId        : 'test-boot',
            pid           : process.pid,
            lastSeenAt,
            status        : 'active'
        }
    }));
}

function insertMessageWake(db, {agentId, subject = 'Addressed Wake Event'}) {
    const msgId = 'msg_' + crypto.randomUUID();
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
        id        : msgId,
        label     : 'MESSAGE',
        properties: {
            from    : '@sender',
            subject,
            priority: 'normal'
        }
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

    const edgeId = 'edge_' + crypto.randomUUID();
    db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
        id    : edgeId,
        source: msgId,
        target: agentId,
        type  : 'SENT_TO'
    }), msgId, agentId, 'SENT_TO');
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

    return {msgId, edgeId};
}

function insertTurnPresence(db, {
    agentId,
    turnId = 'turn_' + crypto.randomUUID(),
    startedAt = new Date().toISOString(),
    source = 'codex-user-prompt-submit',
    wakeSubmitNonce
}) {
    const nodeId = `AGENT_TURN_PRESENCE:${agentId}:${turnId}`;

    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(nodeId, JSON.stringify({
        id        : nodeId,
        label     : 'AGENT_TURN_PRESENCE',
        properties: {
            agentIdentity : agentId,
            turnId,
            startedAt,
            lastProgressAt: startedAt,
            status        : 'active',
            terminalState : null,
            source,
            ...(wakeSubmitNonce ? {wakeSubmitNonce} : {})
        }
    }));

    return {nodeId, turnId};
}

function extractWakeSubmitNonce(output) {
    return output.match(/wakeSubmitNonce=([0-9a-f-]{36})/)?.[1] || null;
}

test.describe('Wake Daemon', () => {
    let db;
    let daemonProcess;
    let DB_PATH;
    let DAEMON_DIR;

    test.beforeEach(() => {
        const testId = crypto.randomUUID().substring(0, 8);
        // Route to the OS temp dir so even crashed/interrupted runs (which skip afterEach)
        // never leak test daemon dbs into the production `.neo-ai-data/` store.
        DB_PATH    = path.join(os.tmpdir(), 'neo-test-daemon', `test-daemon-${testId}.sqlite`);
        DAEMON_DIR = path.join(os.tmpdir(), `neo-wake-daemon-test-${testId}`);

        fs.ensureDirSync(path.dirname(DB_PATH));
        fs.ensureDirSync(DAEMON_DIR);
        if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
        if (fs.existsSync(`${DB_PATH}-wal`)) fs.unlinkSync(`${DB_PATH}-wal`);
        if (fs.existsSync(`${DB_PATH}-shm`)) fs.unlinkSync(`${DB_PATH}-shm`);
        process.env.NEO_MEMORY_DB_PATH_TEST = DB_PATH;

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
        delete process.env.NEO_MEMORY_DB_PATH_TEST;
    });

    test('detects and delivers wake events via test adapter', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 1 // 1 second for fast test
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        // Start the daemon with environment overrides
        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Test Wake Event',
                priority: 'normal'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        // Wait for delivery
        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('[WAKE][priority:normal]');
        expect(output).toContain('Test Wake Event');
        expect(output).not.toContain('priority: normal');
        expect(output).not.toContain('\nWindow:');
        expect(output).not.toContain('Subscription:'); // the redundant per-wake subscription id is dropped from the digest

        // Verify the diagnostic log file was persisted to disk and contains
        // structured entries (ISO timestamp + PID + INFO/ERROR level prefix). Persistence
        // is the substrate for post-hoc wake-failure investigation; without this audit
        // trail every diagnostic depends on terminal-scrollback luck.
        const logFile = path.join(DAEMON_DIR, 'wake-daemon.log');
        expect(fs.existsSync(logFile)).toBe(true);
        const logContents = fs.readFileSync(logFile, 'utf8');
        expect(logContents).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/); // ISO timestamp
        expect(logContents).toMatch(/\[PID:\d+\]/);                                       // PID prefix
        expect(logContents).toMatch(/\[INFO\]/);                                          // level prefix
        expect(logContents).toContain('[Wake Daemon Test Adapter] Delivered');          // Same delivery line as stdout
    });

    test('#13480: Codex submit attempts log turn-start proof when turn presence appears', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-started';

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'test-codex-submit',
                appName       : 'Codex',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH                    : DB_PATH,
                NEO_AI_DAEMON_DIR                     : DAEMON_DIR,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '3000',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output = '';
        let insertedPresence = false;
        let msgId;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex turn-start proof')), 10000);
            const onData = data => {
                output += data.toString();

                const wakeSubmitNonce = extractWakeSubmitNonce(output);
                if (!insertedPresence && wakeSubmitNonce && output.includes(`Submit attempted ${subId}`)) {
                    insertedPresence = true;
                    insertTurnPresence(db, {
                        agentId,
                        turnId   : 'started-proof',
                        startedAt: new Date().toISOString(),
                        wakeSubmitNonce
                    });
                }

                if (output.includes('wake-submit-started')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        ({msgId} = insertMessageWake(db, {agentId, subject: 'Codex Turn Presence Proof'}));

        await proofPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain(`Submit attempted ${subId} via test-codex-submit to Codex`);
        expect(logContents).toContain(`Turn-start proof wake-submit-started ${subId}`);
        expect(logContents).toContain('correlation=nonce');
        expect(logContents).toContain('turnId=started-proof');
        expect(logContents).toContain(`messageIds=${msgId}`);
        expect(logContents).toMatch(/wakeSubmitNonce=[0-9a-f-]{36}/);
    });

    test('#13636: Codex timestamp-only turn presence is ambiguous, not causal started proof', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-ambiguous';

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'test-codex-submit',
                appName       : 'Codex',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH                    : DB_PATH,
                NEO_AI_DAEMON_DIR                     : DAEMON_DIR,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '3000',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output = '';
        let insertedPresence = false;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex ambiguous turn-start proof')), 10000);
            const onData = data => {
                output += data.toString();

                if (!insertedPresence && output.includes(`Submit attempted ${subId}`)) {
                    insertedPresence = true;
                    insertTurnPresence(db, {
                        agentId,
                        turnId   : 'timestamp-only-proof',
                        startedAt: new Date().toISOString()
                    });
                }

                if (output.includes('wake-submit-unknown') && output.includes('timestamp-window-without-nonce')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Codex Ambiguous Turn Presence'});

        await proofPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain(`Turn-start proof wake-submit-unknown ${subId}`);
        expect(logContents).toContain('correlation=timestamp-window-without-nonce');
        expect(logContents).toContain('turnId=timestamp-only-proof');
        expect(logContents).not.toContain(`Turn-start proof wake-submit-started ${subId}`);
    });

    test('#13480: Codex submit attempts log not-started when turn presence does not appear', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-not-started';

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'test-codex-submit',
                appName       : 'Codex',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH                    : DB_PATH,
                NEO_AI_DAEMON_DIR                     : DAEMON_DIR,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '300',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output = '';
        let msgId;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex not-started proof')), 10000);
            const onData = data => {
                output += data.toString();
                if (output.includes('wake-submit-not-started')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        ({msgId} = insertMessageWake(db, {agentId, subject: 'Codex Missing Turn Presence'}));

        await proofPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain(`Submit attempted ${subId} via test-codex-submit to Codex`);
        expect(logContents).toContain(`Turn-start proof wake-submit-not-started ${subId}`);
        expect(logContents).toContain('correlation=nonce');
        expect(logContents).toContain(`messageIds=${msgId}`);
        expect(logContents).toMatch(/wakeSubmitNonce=[0-9a-f-]{36}/);
    });

    test('#13077: a failed wake delivery is retried, then capped with a terminal error', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-retry';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Retry' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: agentId,
                harnessTarget: 'bridge-daemon',
                status       : 'active',
                trigger      : 'SENT_TO_ME',
                // The test-fail adapter throws deterministically → the delivery path fails without a live target.
                harnessTargetMetadata: { adapter: 'test-fail', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        // Cap retries at 2 so the terminal "giving up" path is reached within a few 3s poll cycles.
        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, WAKE_MAX_DELIVERY_RETRIES: '2' }
        });

        const terminalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not reach the retry-cap terminal within timeout')), 20000);
            // ERROR-level logs go to stderr; watch both streams to be robust.
            const onData = (data) => {
                if (data.toString().includes('Giving up wake delivery')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };
            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Inject a MESSAGE + SENT_TO edge → triggers the wake → test-fail adapter throws → retry → cap.
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId, label: 'MESSAGE', properties: { from: '@sender', subject: 'Retry Wake Event', priority: 'normal' }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id: edgeId, source: msgId, target: agentId, type: 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await terminalPromise;

        // Authoritative assertions on the persisted log: the delivery was attempted MORE THAN ONCE
        // (retried, not consumed on first failure) and eventually gave up with a bounded terminal error.
        const logFile     = path.join(DAEMON_DIR, 'wake-daemon.log');
        const logContents = fs.readFileSync(logFile, 'utf8');
        const failMatches = logContents.match(/Failed to deliver via test-fail/g) || [];
        expect(failMatches.length).toBeGreaterThanOrEqual(2);   // initial failure + at least one retry
        expect(logContents).toContain('Giving up wake delivery'); // bounded terminal reached
        expect(logContents).toContain('after 2 failed attempts'); // cap respected
    });

    test('#13077: same-subscription consecutive failures COALESCE into one retry digest (no overwrite loss)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-coalesce';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Coalesce' }
        }));
        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: { adapter: 'test-fail', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        // First flush ("1 new messages") fails + enqueues; the second flush coalesces; the RETRY
        // rebuilds a digest over BOTH → "2 new messages". That string proves neither wake was lost.
        const coalescedPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Coalesced 2-message retry digest not observed within timeout')), 25000);
            const onData = (data) => {
                if (data.toString().includes('2 new messages')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };
            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        const injectMessage = (subject) => {
            const msgId = 'msg_' + crypto.randomUUID();
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
                id: msgId, label: 'MESSAGE', properties: { from: '@sender', subject, priority: 'normal' }
            }));
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');
            const edgeId = 'edge_' + crypto.randomUUID();
            db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
                id: edgeId, source: msgId, target: agentId, type: 'SENT_TO'
            }), msgId, agentId, 'SENT_TO');
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');
        };

        await new Promise(resolve => setTimeout(resolve, 1000));
        injectMessage('First wake');                            // flushes + fails + enqueues
        await new Promise(resolve => setTimeout(resolve, 4000)); // let it enqueue before the 2nd
        injectMessage('Second wake');                           // flushes + fails + COALESCES

        await coalescedPromise;

        // The retry digest was rebuilt over BOTH messages — neither failed wake was overwritten/lost.
        const logFile     = path.join(DAEMON_DIR, 'wake-daemon.log');
        const logContents = fs.readFileSync(logFile, 'utf8');
        expect(logContents).toContain('[Wake Daemon Test-Fail Adapter] Attempted');
        expect(logContents).toContain(`2 events for ${agentId}`); // coalesced total count
        expect(logContents).toContain('2 new messages');          // coalesced breakdown
    });

    test('#13281: a retry drops a message read between the failed delivery and the re-attempt', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-retry-readfilter';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Retry ReadFilter' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: agentId,
                harnessTarget: 'bridge-daemon',
                status       : 'active',
                trigger      : 'SENT_TO_ME',
                // test-fail throws on the first attempt → the wake is queued for retry. We mark the
                // message read before the retry fires, so the retry's read-reconcile must drop it.
                harnessTargetMetadata: { adapter: 'test-fail', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        // The wake fires on SENT_TO; DELIVERED_TO carries the per-recipient readAt the daemon reconciles
        // against live at flush/retry time. Updating that edge (no GraphLog row) simulates the recipient
        // reading the message between the failed delivery and the retry, without firing a new wake.
        const msgId = 'msg_' + crypto.randomUUID();
        const delId = 'edge_' + crypto.randomUUID();

        const markMessageRead = () => {
            db.prepare('UPDATE Edges SET data = ? WHERE id = ?').run(JSON.stringify({
                id        : delId, source: msgId, target: agentId, type: 'DELIVERED_TO',
                properties: { readAt: '2026-06-15T00:00:00.000Z' }
            }), delId);
        };

        let markedRead = false;
        const dropPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Retry was not dropped after the message was read within timeout')), 25000);
            const onData = (data) => {
                const out = data.toString();
                // First delivery failure → the wake is now queued for retry. Mark the message read so the
                // retry's read-reconcile must drop it rather than re-deliver the stale digest.
                if (!markedRead && out.includes('Failed to deliver via test-fail')) {
                    markedRead = true;
                    markMessageRead();
                }
                if (out.includes(`Retry for ${subId} dropped: all queued messages were read before re-delivery`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            };
            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId, label: 'MESSAGE', properties: { from: '@sender', subject: 'Read Before Retry', priority: 'normal' }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const sentId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(
            sentId, JSON.stringify({ id: sentId, source: msgId, target: agentId, type: 'SENT_TO' }),
            msgId, agentId, 'SENT_TO'
        );
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(sentId, 'edges');

        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(
            delId, JSON.stringify({ id: delId, source: msgId, target: agentId, type: 'DELIVERED_TO', properties: { readAt: null } }),
            msgId, agentId, 'DELIVERED_TO'
        );

        await dropPromise;

        // The retry was dropped (read-reconciled), not re-attempted or capped: without the fix the retry
        // would rebuild the stale digest and throw again, eventually hitting the "Giving up" cap.
        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain(`Retry for ${subId} dropped`);
        expect(logContents).not.toContain('Giving up wake delivery');
    });

    test('a message-wake digest omits the lane directive — it is heartbeat-only (#13118, #13137)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-directive';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Directive' }
        }));
        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId, label: 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: agentId, harnessTarget: 'bridge-daemon', status: 'active',
                trigger      : 'SENT_TO_ME', harnessTargetMetadata: { adapter: 'test', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Directive Presence Probe'});

        // The lifecycle-first directive is an IDLE-watchdog nudge that belongs ONLY on pure-heartbeat
        // digests. A message wake already carries actionable content, so its digest must NOT carry the
        // generic directive — that unconditional placement was the dominant token cost (message wakes
        // far outnumber the heartbeat).
        const output = await deliveryPromise;
        expect(output).toContain('new messages');          // the message digest still delivers normally
        expect(output).not.toContain('lifecycle-first');   // ...but WITHOUT the lane directive (heartbeat-only)
        expect(output).not.toContain('verified-empty');
    });

    test('detects and delivers a CAN_* permission_granted wake via the dead-to-live edge path', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-perm';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Permission' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'PERMISSION_GRANTED',
                harnessTargetMetadata: { adapter: 'test', coalesceWindow: 1 }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver permission wake within timeout')), 10000);
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // A CAN_REPLY_TO grant edge @granter -> @test-agent-perm. The old daemon keyed PERMISSION_GRANTED
        // on a HAS_PERMISSION edge that is created nowhere (a dead branch); through the shared match() the
        // live CAN_* edge now fires and maps to the daemon's flat {type:'permission', scope, grantedBy}
        // payload. This is the one daemon-local surface the pure evaluator spec cannot exercise.
        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: '@granter',
            target: agentId,
            type  : 'CAN_REPLY_TO'
        }), '@granter', agentId, 'CAN_REPLY_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('[WAKE]');
        expect(output).toContain('permissions granted');
        expect(output).toContain('CAN_REPLY_TO');
        expect(output).toContain('@granter');
    });

    test('filters already-read messages out of the wake digest, counting only genuinely-unread (#12479)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-readfilter';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent ReadFilter' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: { adapter: 'test', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Inject a MESSAGE addressable to the agent: SENT_TO is the routing/detection edge the wake fires on;
        // DELIVERED_TO carries the per-recipient readAt the daemon must reconcile against. Only SENT_TO + the
        // node go into GraphLog (the wake trigger) — DELIVERED_TO is read live at flush time, not a trigger.
        const injectMessage = (subject, readAt) => {
            const msgId = 'msg_' + crypto.randomUUID();
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
                id        : msgId,
                label     : 'MESSAGE',
                properties: { from: '@sender', subject, priority: 'normal' }
            }));
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

            const sentId = 'edge_' + crypto.randomUUID();
            db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(
                sentId, JSON.stringify({ id: sentId, source: msgId, target: agentId, type: 'SENT_TO' }),
                msgId, agentId, 'SENT_TO'
            );
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(sentId, 'edges');

            const delId = 'edge_' + crypto.randomUUID();
            db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(
                delId, JSON.stringify({ id: delId, source: msgId, target: agentId, type: 'DELIVERED_TO', properties: { readAt } }),
                msgId, agentId, 'DELIVERED_TO'
            );
            return msgId;
        };

        // One already-read message (readAt set) and one genuinely-unread (readAt null), in the same coalesce window.
        injectMessage('Already Read Noise',   '2026-06-06T00:00:00.000Z');
        injectMessage('Genuinely New Signal', null);

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('1 new messages');         // only the unread one is counted
        expect(output).toContain('Genuinely New Signal');    // ...and previewed as the latest
        expect(output).not.toContain('Already Read Noise');  // the already-read one is reconciled out
    });

    test('delivers GraphLog-only heartbeat pulses via test adapter', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-heartbeat';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Heartbeat' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'HEARTBEAT_PULSE',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver heartbeat pulse within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pulseSummary = Buffer.from(JSON.stringify({
            source: 'github-notification',
            count : 1,
            latest: {
                id         : 'ghn-test-1',
                reason     : 'mention',
                title      : 'Ping Euclid',
                url        : 'https://api.github.com/repos/neomjs/neo/pulls/13411',
                pullRequest: {
                    number   : 13411,
                    state    : 'MERGED',
                    mergedAt : '2026-06-16T10:20:00Z',
                    checkedAt: '2026-06-16T10:21:00Z'
                }
            }
        })).toString('base64url');
        const pulseId = `HEARTBEAT_PULSE:${agentId}:github-notification.${pulseSummary}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('[WAKE][priority:normal]');
        expect(output).toContain('heartbeat pulses');
        expect(output).toContain('lifecycle-first');   // a pure-heartbeat digest DOES carry the lane directive (heartbeat-only placement)
        expect(output).toContain('latest GitHub mention: "Ping Euclid"');
        expect(output).toContain('[PR #13411: MERGED, mergedAt 2026-06-16T10:20:00Z, checkedAt 2026-06-16T10:21:00Z]');
        expect(output).not.toContain('new messages');
    });

    test('renders idle-out-nudge cycle-state in the heartbeat digest (#12612)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-idle-out';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: {name: 'Test Agent Idle Out'}
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'HEARTBEAT_PULSE',
                harnessTargetMetadata: {adapter: 'test', coalesceWindow: 1}
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver idle-out heartbeat pulse within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pulseSummary = Buffer.from(JSON.stringify({
            source    : 'idle-out-nudge',
            reason    : 'idle: no recent AGENT_MEMORY while the swarm is active',
            nextAction: 'drain the lifecycle queue, then claim a non-colliding backlog lane'
        })).toString('base64url');
        const pulseId = `HEARTBEAT_PULSE:${agentId}:idle-out-nudge.${pulseSummary}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('heartbeat pulses');
        expect(output).toContain('idle-out nudge — idle: no recent AGENT_MEMORY while the swarm is active');
        expect(output).toContain('next: drain the lifecycle queue, then claim a non-colliding backlog lane');
    });

    test('delivers heartbeat pulses through the existing SENT_TO_ME bridge-daemon route', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-heartbeat-sent-to-me';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Heartbeat Existing Route' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver heartbeat pulse through existing route within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pulseId = `HEARTBEAT_PULSE:${agentId}:${crypto.randomUUID()}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('[WAKE][priority:normal]');
        expect(output).toContain('heartbeat pulses');
        expect(output).not.toContain('new messages');
    });

    test('does not deliver wake events for wakeSuppressed mailbox-only messages', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-suppressed';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Suppressed' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let deliveryCount = 0;
        daemonProcess.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                deliveryCount++;
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from          : agentId,
                to            : agentId,
                subject       : 'Suppressed Sunset Ping',
                readAt        : null,
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await new Promise(resolve => setTimeout(resolve, 5500));

        expect(deliveryCount).toBe(0);

        const stored = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(msgId);
        const storedMessage = JSON.parse(stored.data);
        expect(storedMessage.properties.readAt).toBeNull();
        expect(storedMessage.properties.wakeSuppressed).toBe(true);
    });

    test('does not queue wake delivery for known non-active identities (#13456)', async () => {
        const agentId = '@neo-gemini-pro';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'test',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));

        await new Promise(resolve => setTimeout(resolve, 1000));

        insertMessageWake(db, {agentId, subject: 'Benched Gemini Wake'});

        await new Promise(resolve => setTimeout(resolve, 5500));

        expect(stdoutLog).not.toContain(`[Wake Daemon Test Adapter] Delivered ${subId}`);
        expect(stdoutLog).not.toContain('Benched Gemini Wake');
    });

    test('deduplicates multiple triggers for the same message in the coalescing window', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-dedup';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Dedup' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 2 // 2 seconds to ensure we catch multiple triggers
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
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
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : '@sender',
                subject: 'Test Dedup Event'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        // Insert first SENT_TO edge
        const edgeId1 = 'edge_1_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId1, JSON.stringify({
            id    : edgeId1,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId1, 'edges');

        // Insert second SENT_TO edge for the exact same message to simulate duplication
        const edgeId2 = 'edge_2_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId2, JSON.stringify({
            id    : edgeId2,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId2, 'edges');

        // Wait for 5 seconds to ensure any duplicate delivers would have occurred
        await deliveryPromise;

        expect(deliveryCount).toBe(1);
        expect(finalDigest).toContain('1 new messages');
        expect(finalDigest).toContain('Test Dedup Event');
        expect(finalDigest).toContain('[WAKE][priority:normal]');
        expect(finalDigest).not.toContain('priority: normal');
    });

    test('delivers Codex wake events via app-server adapter without osascript fallback (#13067)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-app-server';

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'codex-app-server',
                appName       : 'Codex',
                coalesceWindow: 1
            }
        });

        const binDir               = path.join(DAEMON_DIR, 'bin');
        const mockCodexPath        = path.join(binDir, 'codex');
        const mockCodexOutPath     = path.join(DAEMON_DIR, 'mock_codex_appserver_out.json');
        const mockOsascriptPath    = path.join(binDir, 'osascript');
        const mockOsascriptOutPath = path.join(DAEMON_DIR, 'mock_codex_appserver_osascript_out.json');

        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        fs.writeFileSync(mockCodexPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockCodexOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockCodexPath, 0o755);
        fs.writeFileSync(mockOsascriptPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockOsascriptOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                CODEX_CLI_PATH    : mockCodexPath,
                NEO_MEMORY_DB_PATH: DB_PATH,
                NEO_AI_DAEMON_DIR : DAEMON_DIR,
                PATH              : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
            }
        });

        let stdoutLog = '';

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver Codex app-server digest within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes(`[Wake Daemon] Dispatched ${subId} via codex-app-server send-message-v2`)) {
                    clearTimeout(timeout);
                    resolve();
                }
                if (out.includes(`[Wake Daemon] Delivered ${subId} via osascript`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon fell back to osascript for codex-app-server route'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {
            agentId,
            subject: 'Codex App Server Wake'
        });

        await deliveryPromise;

        const args = JSON.parse(fs.readFileSync(mockCodexOutPath, 'utf8'));
        expect(args.slice(0, 3)).toEqual(['debug', 'app-server', 'send-message-v2']);
        expect(args.length).toBe(4);
        expect(args[3]).toContain('[WAKE][priority:normal]');
        expect(args[3]).toContain('Codex App Server Wake');
        expect(fs.existsSync(mockOsascriptOutPath)).toBe(false);
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=codex-app-server; adapterSource=metadata; app=Codex; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0'
        );
    });

    test('resolves bundled Codex Desktop CLI when daemon PATH lacks bare codex (#13287)', async () => {
        test.skip(process.platform !== 'darwin', 'Codex Desktop bundled CLI path is currently mac-specific');

        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-desktop-cli';

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'codex-app-server',
                appName       : 'Codex',
                coalesceWindow: 1
            }
        });

        const binDir           = path.join(DAEMON_DIR, 'bin');
        const mockCodexPath    = path.join(DAEMON_DIR, 'Codex.app', 'Contents', 'Resources', 'codex');
        const mockCodexOutPath = path.join(DAEMON_DIR, 'mock_codex_desktop_cli_out.json');

        fs.ensureDirSync(binDir);
        fs.ensureDirSync(path.dirname(mockCodexPath));
        writeMockPs(binDir);
        fs.writeFileSync(mockCodexPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockCodexOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockCodexPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                CODEX_CLI_PATH        : '',
                CODEX_DESKTOP_CLI_PATH: mockCodexPath,
                NEO_MEMORY_DB_PATH    : DB_PATH,
                NEO_AI_DAEMON_DIR     : DAEMON_DIR,
                PATH                  : `${path.dirname(process.execPath)}${path.delimiter}${path.resolve(binDir)}`
            }
        });

        let stdoutLog = '';

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver Codex app-server digest via Desktop CLI fallback')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes(`[Wake Daemon] Dispatched ${subId} via codex-app-server send-message-v2`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {
            agentId,
            subject: 'Codex Desktop CLI Wake'
        });

        await deliveryPromise;

        const args = JSON.parse(fs.readFileSync(mockCodexOutPath, 'utf8'));
        expect(args.slice(0, 3)).toEqual(['debug', 'app-server', 'send-message-v2']);
        expect(args[3]).toContain('Codex Desktop CLI Wake');
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=codex-app-server; adapterSource=metadata; app=Codex; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0'
        );
    });

    test('uses the highest coalesced message priority in the wake digest header and preserves divergent latest priority', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-priority';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Priority' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'test',
                    coalesceWindow: 2
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver priority digest within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const highMsgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(highMsgId, JSON.stringify({
            id        : highMsgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'High Priority Wake Event',
                priority: 'high'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(highMsgId, 'nodes');

        const highEdgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(highEdgeId, JSON.stringify({
            id    : highEdgeId,
            source: highMsgId,
            target: agentId,
            type  : 'SENT_TO'
        }), highMsgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(highEdgeId, 'edges');

        const lowMsgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(lowMsgId, JSON.stringify({
            id        : lowMsgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Low Priority Wake Event',
                priority: 'low'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(lowMsgId, 'nodes');

        const lowEdgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(lowEdgeId, JSON.stringify({
            id    : lowEdgeId,
            source: lowMsgId,
            target: agentId,
            type  : 'SENT_TO'
        }), lowMsgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(lowEdgeId, 'edges');

        const output = await deliveryPromise;
        expect(output).toContain('[WAKE][priority:high]');
        expect(output).toContain('2 new messages');
        expect(output).toContain('Low Priority Wake Event');
        expect(output).toContain('latest priority: low');
    });

    test('skips osascript delivery and logs error when appName is missing', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-empty';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Empty' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    coalesceWindow: 1 // 1 second for fast test
                    // appName intentionally omitted
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: { from: '@sender', subject: 'Test Empty AppName' }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        const output = await errorLogPromise;
        expect(output).toContain('[Wake Daemon] Cannot deliver subscription');
        expect(output).toContain(subId);
    });

    test('Antigravity chorded shortcut generates correct osascript using command and shift down', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-antigravity';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Antigravity' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Antigravity',
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        // Create mock osascript to capture args without actually running AppleScript
        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        // We know bridge-daemon will log INFO when it finishes osascript
        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes('[Wake Daemon] Delivered ' + subId)) {
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Test Antigravity Event',
                priority: 'normal'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await deliveryPromise;

        const mockOutput = fs.readFileSync(mockOutPath, 'utf8');
        const args = JSON.parse(mockOutput);

        expect(args.join(' ')).toContain('keystroke "i" using {command down, shift down}');
        expect(args.join(' ')).toContain('tell application "Antigravity" to activate');
        expect(args.join(' ')).not.toContain('key code 49');
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=osascript; adapterSource=metadata; app=Antigravity; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0'
        );
    });

    test('Claude default focus seed emits r -> Cmd+Z before prompt clear and guards frontmost (#10987, #10422)', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-claude';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Claude' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Claude',
                    coalesceWindow: 1
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_claude_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver event within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon] Delivered ' + subId)) {
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Test Claude Event',
                priority: 'normal'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await deliveryPromise;

        const args          = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');
        const activateIndex = scriptContent.indexOf('tell application "Claude" to activate');
        const tabIndex      = scriptContent.indexOf('keystroke "3" using command down');
        const rIndex        = scriptContent.indexOf('keystroke "r"');
        const zIndex        = scriptContent.indexOf('keystroke "z" using command down');
        const clearIndex    = scriptContent.indexOf('keystroke "a" using command down');
        const guardAfterActivationIndex = scriptContent.indexOf('my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "after activation")');
        const guardBeforeClearIndex     = scriptContent.indexOf('my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before prompt clear")');
        const guardBeforeWakeSetIndex   = scriptContent.indexOf('my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake clipboard set")');
        const wakePayloadIndex          = scriptContent.indexOf('set the clipboard to wakePayload');
        const guardBeforeWakePasteIndex = scriptContent.indexOf('my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake paste")');
        const pasteIndex                = scriptContent.indexOf('keystroke "v" using command down');

        expect(activateIndex).toBeGreaterThan(-1);
        expect(scriptContent).toContain('on assertTargetFrontmost(appName, targetBundleId, targetProcessId, phase)');
        expect(scriptContent).toContain('set targetBundleId to id of application "Claude"');
        expect(scriptContent).toContain('bundle identifier of frontmostProcess');
        expect(scriptContent).toContain('set the clipboard to savedClipboard\n    error errMsg');
        expect(tabIndex).toBeGreaterThan(activateIndex);
        expect(guardAfterActivationIndex).toBeGreaterThan(activateIndex);
        expect(guardAfterActivationIndex).toBeLessThan(tabIndex);
        expect(rIndex).toBeGreaterThan(tabIndex);
        expect(zIndex).toBeGreaterThan(rIndex);
        expect(guardBeforeClearIndex).toBeGreaterThan(zIndex);
        expect(guardBeforeClearIndex).toBeLessThan(clearIndex);
        expect(clearIndex).toBeGreaterThan(zIndex);
        expect(guardBeforeWakeSetIndex).toBeGreaterThan(clearIndex);
        expect(guardBeforeWakeSetIndex).toBeLessThan(wakePayloadIndex);
        expect(guardBeforeWakePasteIndex).toBeGreaterThan(wakePayloadIndex);
        expect(guardBeforeWakePasteIndex).toBeLessThan(pasteIndex);
        expect(scriptContent).not.toContain('key code 49');
    });

    test('addressType pid dispatch targets the resolved process id when HarnessPresence is fresh (#12422)', async () => {
        const agentId = '@test-agent-pid-address';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'osascript',
                appName        : 'Antigravity',
                coalesceWindow : 1,
                instanceAddress: '4242',
                addressType    : 'pid'
            }
        });
        insertHarnessPresence(db, {subId, agentId});

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_pid_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver pid-addressed event within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes('[Wake Daemon] Delivered ' + subId)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'PID Address Wake'});
        await deliveryPromise;

        const args = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');

        expect(scriptContent).toContain('set targetProcessId to "4242"');
        expect(scriptContent).toContain('first process whose unix id is 4242');
    });

    test('stale HarnessPresence refuses targeted GUI delivery instead of falling through to app activate (#12422)', async () => {
        const agentId = '@test-agent-stale-presence';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'osascript',
                appName        : 'Antigravity',
                coalesceWindow : 1,
                instanceAddress: '4242',
                addressType    : 'pid'
            }
        });
        insertHarnessPresence(db, {
            subId,
            agentId,
            lastSeenAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_stale_presence_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not refuse stale targeted wake within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`Targeted wake refused for ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
                if (out.includes(`[Wake Daemon] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon delivered targeted wake despite stale HarnessPresence'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Stale Presence Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('userDataDir bypasses the HarnessPresence freshness gate when a live process resolves (#12571)', async () => {
        const agentId     = '@test-agent-userdatadir-live';
        const userDataDir = '/Users/example/.claude-instances/test-live';
        const mainPid     = 47474;
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'osascript',
                appName        : 'Claude',
                coalesceWindow : 1,
                instanceAddress: userDataDir,
                addressType    : 'userDataDir'
            }
        });
        // Stale presence (20 min): under the prior gate this targeted wake would be refused.
        insertHarnessPresence(db, {subId, agentId, lastSeenAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()});

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        // Mock ps: a live Claude main carrying the target --user-data-dir → getInstancePid resolves it.
        writeMockPs(binDir, `${mainPid} 1 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=${userDataDir}`);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_userdatadir_live_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver userDataDir wake despite a live process')), 10000);

            daemonProcess.stdout.on('data', data => {
                const out = data.toString();
                if (out.includes(`[Wake Daemon] Delivered ${subId}`)) { clearTimeout(timeout); resolve(); }
                if (out.includes(`Targeted wake refused for ${subId}`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon refused a live userDataDir wake on stale presence — freshness gate not relaxed'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'userDataDir Live Wake'});
        await deliveryPromise;

        const args          = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');

        expect(scriptContent).toContain(`first process whose unix id is ${mainPid}`);
    });

    test('userDataDir still fails closed when no live process maps to the address (#12571)', async () => {
        const agentId     = '@test-agent-userdatadir-dead';
        const userDataDir = '/Users/example/.claude-instances/test-dead';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'osascript',
                appName        : 'Claude',
                coalesceWindow : 1,
                instanceAddress: userDataDir,
                addressType    : 'userDataDir'
            }
        });
        // Stale presence is irrelevant here — the live-pid oracle is what must still refuse.
        insertHarnessPresence(db, {subId, agentId, lastSeenAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()});

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        // Mock ps: NO process carries the target --user-data-dir → getInstancePid returns null.
        writeMockPs(binDir, `47475 1 /Applications/Claude.app/Contents/MacOS/Claude --user-data-dir=/Users/example/.claude-instances/other`);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_userdatadir_dead_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not refuse the dead userDataDir wake within timeout')), 10000);

            // The no-live-process refusal is logged at ERROR (stderr); a delivery would log at INFO (stdout).
            daemonProcess.stdout.on('data', data => {
                if (data.toString().includes(`[Wake Daemon] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon delivered a userDataDir wake despite no live process'));
                }
            });
            daemonProcess.stderr.on('data', data => {
                if (data.toString().includes('No running Claude instance found for userDataDir')) { clearTimeout(timeout); resolve(); }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'userDataDir Dead Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('freshness gate is NOT relaxed for non-userDataDir targets — pid + stale presence still refuses (#12571)', async () => {
        // Boundary guard: the freshness-veto exemption applies ONLY to userDataDir (where getInstancePid
        // is a live oracle). `pid` has no equivalent live-target proof, so a stale-presence pid wake
        // must still fail closed — proving the relaxation did not generalize beyond userDataDir.
        const agentId = '@test-agent-pid-boundary-stale';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'osascript',
                appName        : 'Claude',
                coalesceWindow : 1,
                instanceAddress: '4242',
                addressType    : 'pid'
            }
        });
        insertHarnessPresence(db, {subId, agentId, lastSeenAt: new Date(Date.now() - 20 * 60 * 1000).toISOString()});

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_pid_boundary_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_AI_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not refuse the stale pid wake within timeout')), 10000);

            // The freshness refusal is logged at WARN (stdout); a delivery would log at INFO (stdout).
            daemonProcess.stdout.on('data', data => {
                const out = data.toString();
                if (out.includes(`Targeted wake refused for ${subId}`)) { clearTimeout(timeout); resolve(); }
                if (out.includes(`[Wake Daemon] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon delivered a stale pid wake — the userDataDir relaxation leaked to pid'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Stale Pid Boundary Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('addressType tmuxSession dispatch sends the digest to the instanceAddress session (#12422)', async () => {
        const agentId = '@test-agent-tmux-address';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter        : 'tmux',
                appName        : 'Antigravity',
                coalesceWindow : 1,
                instanceAddress: 'neo-gpt-session',
                addressType    : 'tmuxSession'
            }
        });
        insertHarnessPresence(db, {subId, agentId});

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        const mockTmuxPath = path.join(binDir, 'tmux');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_tmux_out.json');
        fs.writeFileSync(mockTmuxPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockTmuxPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver tmux-addressed event within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`Delivered ${subId} via tmux to session neo-gpt-session`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Tmux Address Wake'});
        await deliveryPromise;

        const args = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        expect(args[0]).toBe('send-keys');
        expect(args[1]).toBe('-t');
        expect(args[2]).toBe('neo-gpt-session');
        expect(args.at(-1)).toBe('C-m');
    });

    test('tmux wake delivers pure-heartbeat interactive submit (idle-gated at emit, not delivery)', async () => {
        const agentId = '@test-agent-tmux-pure-heartbeat';
        const subId = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'tmux',
                appName       : 'Antigravity',
                coalesceWindow: 1
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        const mockTmuxPath = path.join(binDir, 'tmux');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_tmux_pure_heartbeat_out.json');
        fs.writeFileSync(mockTmuxPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockTmuxPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pulseId = `HEARTBEAT_PULSE:${agentId}:${crypto.randomUUID()}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        await new Promise(resolve => setTimeout(resolve, 5000));

        expect(fs.existsSync(mockOutPath)).toBe(true);
        expect(stdoutLog).toContain(`Delivered ${subId}`);
        expect(stdoutLog).not.toContain(`Suppressed ${subId}`);
    });

    test('addressType webhookUrl dispatch POSTs the wake digest to the instanceAddress (#12422)', async () => {
        const received = new Promise((resolve, reject) => {
            const server = http.createServer((req, res) => {
                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    res.writeHead(204);
                    res.end();
                    resolve({server, req, body});
                });
            });
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const {port} = server.address();
                const agentId = '@test-agent-webhook-address';
                const subId = insertWakeSubscription(db, {
                    agentId,
                    harnessTargetMetadata: {
                        adapter        : 'tmux',
                        appName        : 'Antigravity',
                        coalesceWindow : 1,
                        instanceAddress: `http://127.0.0.1:${port}/wake`,
                        addressType    : 'webhookUrl'
                    }
                });
                insertHarnessPresence(db, {subId, agentId});

                daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                    stdio: 'pipe',
                    env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
                });

                setTimeout(() => insertMessageWake(db, {agentId, subject: 'Webhook Address Wake'}), 1000);
            });
        });

        const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Daemon failed to POST webhook-addressed event within timeout')), 10000);
        });

        const {server, req, body} = await Promise.race([received, timeout]);
        server.close();

        const payload = JSON.parse(body);
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/wake');
        expect(payload.digest).toContain('Webhook Address Wake');
        expect(payload.subscriptionId).toMatch(/^sub_/);
    });

    test('Codex UI wake fails closed when no validated focusSeedKey is configured (#10664)', async () => {
        // An earlier hypothesis — that a Codex Space-seed could mirror the Claude focus-seed fix —
        // was empirically falsified by manual matrix validation 2026-05-03. Space and Enter
        // apply only a focus outline; printable keys can focus but mutate prompt content —
        // updated evidence shows the probe char APPENDS to the existing draft rather than
        // fully replacing it, but appending IS mutation that the subsequent Cmd+A/Cmd+X
        // clear captures and the wake paste overwrites. No safe non-mutating composer-focus
        // primitive exists for Codex Desktop today. The bridge-daemon MUST fail closed for
        // Codex without an explicit `meta.focusSeedKey` opt-in (single-key non-mutating
        // primitive only) — refusing to proceed past the destructive Cmd+A / Cmd+X clear
        // sequence — until either operator opts in via verified single-key metadata, OR
        // the Codex app-server adapter supersedes UI-keystroke delivery. The
        // probe-and-undo candidate `r → Cmd+Z → Cmd+A → Cmd+X` under @neo-gpt's 5-row
        // matrix investigation is a multi-step SEQUENCE, NOT a single-key seed; if it
        // proves safe it needs a distinct implementation path (sequence primitive or
        // app-server route), NOT a `focusSeedKey: 'r'` opt-in.
        //
        // This test is a defense-in-depth check: the bridge refuses to send any
        // osascript keystroke for a Codex subscription that lacks an explicit
        // composer-focus primitive.
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-fail-closed';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Codex Fail-Closed' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Codex',
                    coalesceWindow: 1
                    // No focusSeedKey configured — bridge MUST refuse delivery
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_codex_failclosed_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        // Wait for the fail-closed warning log line (proxy for the deliver-or-refuse decision).
        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not emit Codex fail-closed warning within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`Codex UI wake delivery refused for ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
                // Negative case: if the daemon ever logs an osascript attempt for this subId, the
                // fail-closed guard didn't fire. Reject so the test fails loudly.
                if (
                    out.includes(`[Wake Daemon] Delivered ${subId}`) ||
                    out.includes(`[Wake Daemon] Submit attempted ${subId}`)
                ) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon attempted Codex wake despite missing focusSeedKey — fail-closed guard regressed'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Test Codex Event',
                priority: 'normal'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await refusalPromise;

        // Confirm osascript was never called. The mock writes argv to mockOutPath only when
        // invoked — so file-absent ⇒ refusal-fired-correctly. Defense-in-depth assertion.
        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('Codex wake submit attempt emits specific sequence r -> Cmd+Z -> Cmd+A/X -> paste -> Esc -> Enter (#10667, #13287, #13480)', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-cleanup';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Codex Cleanup' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Codex',
                    coalesceWindow: 1,
                    focusSeedKey  : 'r'
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_codex_cleanup_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not attempt Codex wake submit within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes(`Submit attempted ${subId}`)) {
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
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                subject : 'Test Codex Cleanup',
                priority: 'normal'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        await deliveryPromise;

        const rawArgs = JSON.parse(fs.readFileSync(mockOutPath, 'utf-8'));
        const scriptContent = rawArgs.filter((_, i) => rawArgs[i - 1] === '-e').join('\n');

        const rIndex = scriptContent.indexOf('keystroke "r"');
        const zIndex = scriptContent.indexOf('keystroke "z" using command down');
        const aIndex = scriptContent.indexOf('keystroke "a" using command down');
        const xIndex = scriptContent.indexOf('keystroke "x" using command down');
        const pasteIndex = scriptContent.indexOf('keystroke "v" using command down');
        const escapeIndex = scriptContent.indexOf('key code 53');
        const enterIndex = scriptContent.indexOf('key code 36');

        expect(rIndex).toBeGreaterThan(-1);
        expect(zIndex).toBeGreaterThan(rIndex);
        expect(aIndex).toBeGreaterThan(zIndex);
        expect(xIndex).toBeGreaterThan(aIndex);
        expect(pasteIndex).toBeGreaterThan(xIndex);
        expect(escapeIndex).toBeGreaterThan(pasteIndex);
        expect(enterIndex).toBeGreaterThan(escapeIndex);
        expect(rawArgs.at(-1)).toContain('[WAKE][priority:normal]');
        expect(rawArgs.at(-1)).toContain('Test Codex Cleanup');
        expect(rawArgs.at(-1)).not.toContain('lifecycle-first');
        expect(stdoutLog).toContain(`[Wake Daemon] Submit attempted ${subId} via osascript to Codex`);
        expect(stdoutLog).not.toContain(`[Wake Daemon] Delivered ${subId} via osascript to Codex`);
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=osascript; adapterSource=metadata; app=Codex; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0; ' +
            'submitProof=attempted; turnStartProof=live-required'
        );
    });

    test('Codex UI wake submits pure-heartbeat interactively (idle-gated at emit, not delivery)', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-pure-heartbeat';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Codex Pure Heartbeat' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Codex',
                    coalesceWindow: 1,
                    focusSeedKey  : 'r'
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_codex_pure_heartbeat_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));

        await new Promise(resolve => setTimeout(resolve, 1000));

        const pulseId = `HEARTBEAT_PULSE:${agentId}:${crypto.randomUUID()}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        await new Promise(resolve => setTimeout(resolve, 5000));

        expect(fs.existsSync(mockOutPath)).toBe(true);
        expect(stdoutLog).toContain(`Submit attempted ${subId}`);
        expect(stdoutLog).not.toContain(`Suppressed ${subId}`);
    });

    test('Codex UI wake attempts actionable message submit and drops coalesced heartbeat event (#13456, #13480)', async () => {
        const subId = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-codex-mixed-submit';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: { name: 'Test Agent Codex Mixed Submit' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Codex',
                    coalesceWindow: 1,
                    focusSeedKey  : 'r'
                }
            }
        }));

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath = path.join(DAEMON_DIR, 'mock_codex_mixed_submit_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR }
        });

        let stdoutLog = '';

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not attempt actionable Codex wake submit within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes(`Submit attempted ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        insertMessageWake(db, {agentId, subject: 'Codex Mixed Submit'});
        const pulseId = `HEARTBEAT_PULSE:${agentId}:${crypto.randomUUID()}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        await deliveryPromise;

        const rawArgs       = JSON.parse(fs.readFileSync(mockOutPath, 'utf-8'));
        const scriptContent = rawArgs.filter((_, i) => rawArgs[i - 1] === '-e').join('\n');
        const pasteIndex    = scriptContent.indexOf('keystroke "v" using command down');
        const escapeIndex   = scriptContent.indexOf('key code 53');
        const enterIndex    = scriptContent.indexOf('key code 36');
        const digest        = rawArgs.at(-1);

        expect(pasteIndex).toBeGreaterThan(-1);
        expect(escapeIndex).toBeGreaterThan(pasteIndex);
        expect(enterIndex).toBeGreaterThan(escapeIndex);
        expect(digest).toContain('Codex Mixed Submit');
        expect(digest).toContain('new messages');
        expect(digest).not.toContain('heartbeat pulses');
        expect(digest).not.toContain('lifecycle-first');
        expect(stdoutLog).toContain(`[Wake Daemon] Submit attempted ${subId} via osascript to Codex`);
        expect(stdoutLog).not.toContain(`[Wake Daemon] Delivered ${subId} via osascript to Codex`);
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=osascript; adapterSource=metadata; app=Codex; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0; ' +
            'submitProof=attempted; turnStartProof=live-required'
        );
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

    test('collapseDuplicateShapeCRoutes keeps only newest active route per identity tuple (#10717)', () => {
        const buildSub = ({id, agentIdentity = '@neo-gemini-3-1-pro', appName = 'Antigravity', createdAt}) => ({
            id,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity,
                trigger              : 'SENT_TO_ME',
                filters              : {},
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter: 'test',
                    appName
                },
                createdAt,
                updatedAt: createdAt,
                status   : 'active'
            }
        });

        const oldGemini = buildSub({id: 'WAKE_SUB:old-gemini', createdAt: '2026-05-04T20:16:10.969Z'});
        const newGemini = buildSub({id: 'WAKE_SUB:new-gemini', createdAt: '2026-05-04T20:46:07.162Z'});
        const claude    = buildSub({
            id           : 'WAKE_SUB:claude',
            agentIdentity: '@neo-opus-4-7',
            appName      : 'Claude',
            createdAt    : '2026-05-04T20:00:00.000Z'
        });

        const result = collapseDuplicateShapeCRoutes([oldGemini, claude, newGemini]);

        expect(result.map(sub => sub.id).sort()).toEqual(['WAKE_SUB:claude', 'WAKE_SUB:new-gemini']);
    });

    test('getActiveHarnessPresence does not fall back from a missing subscription row to another fresh identity row (#12422)', () => {
        const agentId      = '@test-agent-route-specific-presence';
        const missingSubId = 'sub_missing_route_specific_presence';
        const freshSubId   = 'sub_fresh_route_specific_presence';

        insertHarnessPresence(db, {subId: freshSubId, agentId});

        const missingRoutePresence = getActiveHarnessPresence(db, {
            subscriptionId: missingSubId,
            agentIdentity : agentId
        });
        const identityFallbackPresence = getActiveHarnessPresence(db, {agentIdentity: agentId});

        expect(missingRoutePresence).toBeNull();
        expect(identityFallbackPresence.properties.subscriptionId).toBe(freshSubId);
    });

    test('suppresses wake for sender of AGENT:* broadcast and delivers to peers (#10668)', async () => {
        const senderId    = '@test-agent-sender';
        const peerId      = '@test-agent-peer';
        const senderSubId = 'sub_' + crypto.randomUUID();
        const peerSubId   = 'sub_' + crypto.randomUUID();

        // Two agents subscribed to the same bridge-daemon test adapter — the broadcast
        // sender and a peer receiver. The fix's contract is: sender's own broadcast
        // does NOT wake them, but the peer's wake delivery is unaffected.
        for (const [agentId, subId] of [[senderId, senderSubId], [peerId, peerSubId]]) {
            db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
                id        : agentId,
                label     : 'AGENT',
                properties: {name: agentId}
            }));
            db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
                id        : subId,
                label     : 'WAKE_SUBSCRIPTION',
                properties: {
                    agentIdentity        : agentId,
                    harnessTarget        : 'bridge-daemon',
                    status               : 'active',
                    trigger              : 'SENT_TO_ME',
                    harnessTargetMetadata: {adapter: 'test', coalesceWindow: 1}
                }
            }));
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');
        }

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        let senderDeliveryCount = 0;
        let peerDeliveryCount   = 0;
        daemonProcess.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes(`[Wake Daemon Test Adapter] Delivered ${senderSubId}`)) senderDeliveryCount++;
            if (out.includes(`[Wake Daemon Test Adapter] Delivered ${peerSubId}`))   peerDeliveryCount++;
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Sender broadcasts to AGENT:*: from === senderId, edge target === 'AGENT:*'.
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : senderId,
                to     : 'AGENT:*',
                subject: 'Cross-family broadcast'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: 'AGENT:*',
            type  : 'SENT_TO'
        }), msgId, 'AGENT:*', 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        // Coalesce window 1s + safety margin matches the wakeSuppressed-test pattern.
        await new Promise(resolve => setTimeout(resolve, 5500));

        // Same-sender broadcast must NOT wake the sender (the self-fanout bug).
        expect(senderDeliveryCount).toBe(0);
        // Cross-sender broadcast must still wake the peer (preserves broadcast value).
        expect(peerDeliveryCount).toBe(1);
    });

    test('preserves wake delivery for direct self-DM addressed to self (#10668)', async () => {
        // The fix gates on `entity.target === 'AGENT:*'` to suppress only broadcast
        // self-fanout. Direct self-DMs (target === agentIdentity AND from === agentIdentity)
        // remain delivered for deliberate self-handoff flows like sunset protocol DMs.
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-self-dm';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id        : agentId,
            label     : 'AGENT',
            properties: {name: agentId}
        }));
        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity        : agentId,
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                trigger              : 'SENT_TO_ME',
                harnessTargetMetadata: {adapter: 'test', coalesceWindow: 1}
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver self-DM wake within timeout')), 10000);
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`[Wake Daemon Test Adapter] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    resolve(out);
                }
            });
            daemonProcess.on('error', reject);
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Direct self-DM: from === agentId AND target === agentId (NOT AGENT:*).
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : agentId,
                to     : agentId,
                subject: 'Deliberate self-handoff'
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        const edgeId = 'edge_' + crypto.randomUUID();
        db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target: agentId,
            type  : 'SENT_TO'
        }), msgId, agentId, 'SENT_TO');
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');

        const output = await deliveryPromise;
        expect(output).toContain('Deliberate self-handoff');
    });
});
