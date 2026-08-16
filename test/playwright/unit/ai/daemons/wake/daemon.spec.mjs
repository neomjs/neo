import { test, expect }                                                                        from '@playwright/test';
import fs                                                                                      from 'fs-extra';
import path                                                                                    from 'path';
import Database                                                                                from 'better-sqlite3';
import { spawn, spawnSync }                                                                    from 'child_process';
import crypto                                                                                  from 'crypto';
import http                                                                                    from 'http';
import os                                                                                      from 'os';
import { collapseDuplicateShapeCRoutes, getActiveHarnessPresence, getNodesData, getEdgesData } from '../../../../../../ai/daemons/wake/queries.mjs';
import { MESSAGE_WAKE_MAX_AGE_MS }                                                             from '../../../../../../ai/services/memory-core/wakeCoalescePolicy.mjs';
import { SQLITE_IN_CLAUSE_BATCH_SIZE }                                                         from '../../../../../../ai/graph/storage/constants.mjs';
import { withOutboxLock }                                                                      from '../../../../../../ai/daemons/wake/outboxLock.mjs';

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
// The daemon's poll cadence gates BOTH the poll loop and the retry backoff, so this file's wall clock
// is quantized by it: at the shipped 3000ms, a wait shortened anywhere else lands before the same poll
// boundary and recovers nothing.
//
// Injected PER SPAWN rather than once on `process.env`. A module-scope assignment leaks across spec
// FILES — Playwright runs several per worker process — and a sibling wake spec asserts a retry-union
// window derived from `attempts x poll interval = 6s`, which a 50ms cadence collapses to 100ms. That
// is a real cross-file behaviour change, not a flake, and it is invisible when this file is run alone.
const FAST_POLL_MS = '50';

/**
 * @summary Resolves once the spawned daemon has read its GraphLog watermark and entered the poll loop.
 *
 * Replaces the fixed boot sleeps, and the ordering it preserves is the whole point rather than an
 * optimization. The daemon emits this line immediately after `lastSyncId = getLastSyncId(...)` and
 * immediately before `pollLoop()`, so it is the exact instant the watermark exists. A row injected
 * before that instant is not a delta the daemon will see on its first pass — it waits a full
 * `POLL_INTERVAL_MS` (3s) or more, which is why simply deleting the sleeps makes this file SLOWER
 * while every assertion still passes.
 *
 * Strictly better than the 1s sleep in both directions: it returns as soon as boot completes rather
 * than always paying 1s, and it cannot under-wait on a loaded CI box, where a fixed 1s is a latent
 * flake that silently degrades into the same multi-second poll penalty.
 *
 * Attach BEFORE any await on the process, so no output is missed between spawn and subscription.
 *
 * 43 call sites depend on this, 42 of them converted from `await new Promise(r => setTimeout(r,
 * 1000))` — a fixed guess at how long the daemon takes to boot. The guess was well calibrated (the
 * conversion recovered only ~2.7s across the whole file, measured), so this is a CORRECTNESS change,
 * not a performance one: a 1s sleep silently under-waits whenever boot is slower than usual, and
 * the resulting failure looks like a daemon defect rather than a test-timing one. Waiting on the
 * announcement cannot under-wait, and its timeout turns a hung boot into a named failure.
 *
 * NOT applied to every 1s sleep in the file. 21 remain, and at least one is load-bearing: the site
 * separating two mutations into distinct daemon polls needs elapsed wall-time, and converting it
 * would have kept the test green while deleting what it verifies.
 *
 * @param {Object} daemonProcess Spawned daemon child process.
 * @param {Number} [timeoutMs=15000] Bound; a daemon that never announces is a failure, not a wait.
 * @returns {Promise<void>}
 */
function waitForDaemonReady(daemonProcess, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const done = error => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            daemonProcess.stdout.off('data', onData);
            error ? reject(error) : resolve()
        };

        const timer  = setTimeout(() => done(new Error('Daemon did not announce readiness within timeout')), timeoutMs),
              onData = data => { if (data.toString().includes('[Wake Daemon] Started.')) done() };

        daemonProcess.stdout.on('data', onData);
        daemonProcess.on('error', done);
        daemonProcess.on('exit', code => done(new Error(`Daemon exited (code ${code}) before announcing readiness`)))
    })
}

function writeMockPs(binDir, psOutput = '') {
    const mockPsPath = path.join(binDir, 'ps');

    fs.writeFileSync(mockPsPath, `#!/usr/bin/env node
// Instance-listing calls are stubbed for determinism; 'lstart' queries pass through to the real
// ps so process-epoch (pid start-time) checks keep working in daemon integration specs.
const {spawnSync} = require('child_process');
if (process.argv.includes('lstart=')) {
    const r = spawnSync('/bin/ps', process.argv.slice(2));
    process.stdout.write(r.stdout ?? '');
} else {
    process.stdout.write(${JSON.stringify(psOutput)});
}
`);
    fs.chmodSync(mockPsPath, 0o755);
}

/**
 * @summary Returns the spec process's own `ps lstart` string — the reuse-safe epoch half the
 * kimi-pull-bridge envelope fixtures must carry to satisfy the producer's owner validation.
 * @returns {String}
 */
function liveLstart() {
    return spawnSync('ps', ['-p', String(process.pid), '-o', 'lstart=']).stdout.toString().trim()
}

function insertWakeSubscription(db, {
    subId = 'sub_' + crypto.randomUUID(),
    agentId,
    filters = {},
    harnessTargetMetadata,
    trigger = 'SENT_TO_ME'
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
            filters,
            harnessTarget: 'bridge-daemon',
            status       : 'active',
            trigger,
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

function insertMessageWake(db, {
    agentId,
    from = '@sender',
    priority = 'normal',
    sentAt = new Date().toISOString(),
    subject = 'Addressed Wake Event',
    target = agentId
}) {
    const msgId = 'msg_' + crypto.randomUUID();
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
        id        : msgId,
        label     : 'MESSAGE',
        properties: {
            from,
            priority,
            sentAt,
            subject,
            to      : target
        }
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

    const edgeId = 'edge_' + crypto.randomUUID();
    db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
            id    : edgeId,
            source: msgId,
            target,
            type  : 'SENT_TO'
        }), msgId, target, 'SENT_TO');
    const edgeLogId = Number(
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges').lastInsertRowid
    );

    return {msgId, edgeId, edgeLogId};
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
                event_id TEXT,
                event_payload TEXT,
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
        const subId   = 'sub_' + crypto.randomUUID();
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

        const deliveryFailurePath = path.join(DAEMON_DIR, 'wake-delivery-failures.json');
        fs.writeJsonSync(deliveryFailurePath, {
            [subId]: {
                agentIdentity : agentId,
                subscriptionId: subId,
                errorClass    : 'connection-refused',
                failedAt      : '2026-07-29T00:00:00.000Z'
            }
        });

        // Start the daemon with environment overrides
        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        // Ordering, not padding: the row must be injected AFTER the daemon has read its watermark,
        // or it is not a delta the first poll sees. See waitForDaemonReady.
        await waitForDaemonReady(daemonProcess);

        // Inject MESSAGE and SENT_TO edge
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'normal',
                sentAt  : new Date().toISOString(),
                subject : 'Test Wake Event'
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
        await expect.poll(() => fs.readJsonSync(deliveryFailurePath)).toEqual({});        // confirmed recovery clears the receipt
    });

    test('#14576: priority-filtered subscriptions only deliver high-priority direct and broadcast wakes', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-priority-filter';

        insertWakeSubscription(db, {
            subId,
            agentId,
            filters              : {priority: 'high'},
            harnessTargetMetadata: {
                adapter       : 'test',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver priority-filtered digest within timeout')), 10000);

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

        await waitForDaemonReady(daemonProcess);

        insertMessageWake(db, {
            agentId,
            subject: 'Normal Priority Direct'
        });
        insertMessageWake(db, {
            agentId,
            subject: 'Normal Priority Broadcast',
            target : 'AGENT:*'
        });
        insertMessageWake(db, {
            agentId,
            priority: 'high',
            subject : 'High Priority Direct'
        });
        insertMessageWake(db, {
            agentId,
            priority: 'high',
            subject : 'High Priority Broadcast',
            target  : 'AGENT:*'
        });

        const output = await deliveryPromise;
        expect(output).toContain('[WAKE][priority:high]');
        expect(output).toContain(`2 events for ${agentId}`);
        expect(output).toContain('2 message events');
        expect(output).toContain('High Priority Broadcast');
        expect(output).not.toContain('4 message events');
        expect(output).not.toContain('Normal Priority Direct');
        expect(output).not.toContain('Normal Priority Broadcast');
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
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS      : FAST_POLL_MS,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '3000',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output           = '';
        let insertedPresence = false;
        let msgId;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex turn-start proof')), 10000);
            const onData  = data => {
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

        await waitForDaemonReady(daemonProcess);
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
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS      : FAST_POLL_MS,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '3000',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output           = '';
        let insertedPresence = false;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex ambiguous turn-start proof')), 10000);
            const onData  = data => {
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

        await waitForDaemonReady(daemonProcess);
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
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS      : FAST_POLL_MS,
                WAKE_CODEX_TURN_START_PROOF_TIMEOUT_MS: '300',
                WAKE_CODEX_TURN_START_PROOF_POLL_MS   : '50'
            }
        });

        let output = '';
        let msgId;

        const proofPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log Codex not-started proof')), 10000);
            const onData  = data => {
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

        await waitForDaemonReady(daemonProcess);
        ({msgId} = insertMessageWake(db, {agentId, subject: 'Codex Missing Turn Presence'}));

        await proofPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain(`Submit attempted ${subId} via test-codex-submit to Codex`);
        expect(logContents).toContain(`Turn-start proof wake-submit-not-started ${subId}`);
        expect(logContents).toContain('correlation=nonce');
        expect(logContents).toContain(`messageIds=${msgId}`);
        expect(logContents).toMatch(/wakeSubmitNonce=[0-9a-f-]{36}/);
    });

    test('a timed-out UN-ABORTABLE attempt resolves UNKNOWN: not retried, never reported as dropped', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-unknown';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Unknown' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: agentId,
                harnessTarget: 'bridge-daemon',
                status       : 'active',
                trigger      : 'SENT_TO_ME',
                // test-hang never settles and ignores the abort signal — a spawn that outlives the
                // bound. The daemon cannot observe whether the digest reached the seat.
                harnessTargetMetadata: { adapter: 'test-hang', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS: '1',
                WAKE_MAX_DELIVERY_RETRIES       : '2'
            }
        });

        let output = '';

        // Settle on EITHER signature so the red lands on the defect rather than on the absence of a
        // log line the fix itself introduced: pre-fix the bound resolves 'failed' and the retry path
        // re-offers the identical digest, so the SECOND adapter attempt is what appears — and the
        // `attemptCount` assertion below then fails on the duplicate, which is the actual bug.
        const unknownPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Neither an UNKNOWN outcome nor a re-offer appeared within timeout')), 20000);
            const onData  = data => {
                output += data.toString();
                const reOffered = (output.match(/\[Wake Daemon Test-Hang Adapter\] Attempted/g) || []).length > 1;
                if (output.includes('outcome UNKNOWN, not retried') || reOffered) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Unknown Outcome Probe'});

        await unknownPromise;

        // Sampled at the instant the UNKNOWN line lands: before the fix the bound resolved 'failed',
        // the retry path re-offered the same digest, and this count was 2 within the same second.
        const logContents  = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        const attemptCount = (logContents.match(/\[Wake Daemon Test-Hang Adapter\] Attempted/g) || []).length;

        expect(attemptCount).toBe(1);
        expect(logContents).toContain('outcome UNKNOWN, not retried');
        // The terminal drop asserts a loss nobody observed — it must never fire for an unknown.
        expect(logContents).not.toContain(`Giving up wake delivery for ${subId}`);
        // An unknown attempt is not a confirmed delivery either: nothing may count on the surface.
        expect(logContents).not.toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
    });

    test('a timed-out SIGNAL-HONOURING attempt still resolves failed and still retries to the cap', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-abortable';

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
            id: agentId, label: 'AGENT', properties: { name: 'Test Agent Abortable' }
        }));

        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(subId, JSON.stringify({
            id        : subId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: agentId,
                harnessTarget: 'bridge-daemon',
                status       : 'active',
                trigger      : 'SENT_TO_ME',
                // test-hang-abortable rejects when the bound aborts it — the abort is REAL, so the
                // timeout genuinely proves non-delivery and the retry path must be preserved.
                harnessTargetMetadata: { adapter: 'test-hang-abortable', coalesceWindow: 1 }
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(subId, 'nodes');

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS: '1',
                WAKE_MAX_DELIVERY_RETRIES       : '2'
            }
        });

        let output = '';

        const terminalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Abortable route did not reach the retry cap within timeout')), 30000);
            const onData  = data => {
                output += data.toString();
                if (output.includes(`Giving up wake delivery for ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Abortable Failure Probe'});

        await terminalPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');

        // The control: this route must NOT be diverted into the unknown branch, or a genuine
        // failure would stop being retried and the fix would trade a duplicate for a silent loss.
        expect(logContents).toContain('resolved as failed (retry path)');
        expect(logContents).not.toContain('outcome UNKNOWN, not retried');
        expect((logContents.match(/\[Wake Daemon Test-Hang-Abortable Adapter\] Attempted/g) || []).length).toBeGreaterThan(1);
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, WAKE_MAX_DELIVERY_RETRIES: '2', NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

        // Inject a MESSAGE + SENT_TO edge → triggers the wake → test-fail adapter throws → retry → cap.
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId, label: 'MESSAGE', properties: {
                from: '@sender', priority: 'normal', sentAt: new Date().toISOString(), subject: 'Retry Wake Event'
            }
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

        const
            receiptPath = path.join(DAEMON_DIR, 'wake-delivery-failures.json'),
            receipts    = fs.readJsonSync(receiptPath);

        expect(receipts[subId]).toMatchObject({
            agentIdentity : agentId,
            subscriptionId: subId,
            errorClass    : 'test-fail-delivery'
        });
        expect(Number.isNaN(Date.parse(receipts[subId].failedAt))).toBe(false);
        expect(fs.statSync(receiptPath).mode & 0o777).toBe(0o600);
        expect(JSON.stringify(receipts[subId])).not.toContain('simulated delivery failure');
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR,
                     // out-waits: POLL_INTERVAL_MS — this test asserts that a SECOND failure
                     // arriving mid-cycle coalesces into the first's pending retry, so the 4s
                     // gap below must straddle exactly one poll boundary. Under the file's
                     // shortened cadence that gap becomes ~80 cycles and both failures settle
                     // before the second is enqueued, which is a real behaviour change rather
                     // than a flake. Pinned to the shipped value for this test alone.
                     NEO_WAKE_DAEMON_POLL_INTERVAL_MS: '3000' }
        });

        // First flush ("1 message events") fails + enqueues; the second flush coalesces; the RETRY
        // rebuilds a digest over BOTH → "2 message events". That string proves neither wake was lost.
        const coalescedPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Coalesced 2-message retry digest not observed within timeout')), 25000);
            const onData  = (data) => {
                if (data.toString().includes('2 message events')) {
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
                id: msgId, label: 'MESSAGE', properties: {
                    from: '@sender', priority: 'normal', sentAt: new Date().toISOString(), subject
                }
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
        expect(logContents).toContain('2 message events');          // coalesced breakdown
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        let   markedRead  = false;
        const dropPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Retry was not dropped after the message was read within timeout')), 25000);
            const onData  = (data) => {
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

        await waitForDaemonReady(daemonProcess);

        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id: msgId, label: 'MESSAGE', properties: {
                from: '@sender', priority: 'normal', sentAt: new Date().toISOString(), subject: 'Read Before Retry'
            }
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

    test('#15704: a retry rechecks canonical message age and drops an event that crosses the wake horizon', async () => {
        const agentId = '@test-agent-retry-message-age';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {adapter: 'test-fail', coalesceWindow: 0}
        });

        // A temporary process preload keeps production policy free of a test/runtime override. It
        // advances Date.now() by one hour only after the first deterministic adapter failure, while
        // preserving real elapsed time so retry scheduling remains monotonic.
        const clockBaseMs      = Date.now(),
              clockAdvanceFile = path.join(DAEMON_DIR, 'advance-message-clock'),
              clockPreloadFile = path.join(DAEMON_DIR, 'message-clock.cjs');
        fs.writeFileSync(clockPreloadFile, [
            "const fs = require('node:fs');",
            'const realNow = Date.now.bind(Date);',
            'const realBase = realNow();',
            'const clockBase = Number(process.env.WAKE_TEST_CLOCK_BASE_MS);',
            'const advanceMs = Number(process.env.WAKE_TEST_CLOCK_ADVANCE_MS);',
            'const advanceFile = process.env.WAKE_TEST_CLOCK_ADVANCE_FILE;',
            'Date.now = () => clockBase + (realNow() - realBase) + (fs.existsSync(advanceFile) ? advanceMs : 0);'
        ].join('\n'));

        let   output           = '', clockAdvanced = false;
        const staleDropPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Retry did not drop the age-expired message within timeout')), 25000);
            const onData  = data => {
                output += data.toString();
                if (!clockAdvanced && output.includes('Failed to deliver via test-fail')) {
                    clockAdvanced = true;
                    fs.writeFileSync(clockAdvanceFile, 'advance');
                }
                if (output.includes(`Retry for ${subId} dropped: all queued messages became stale or invalid before re-delivery.`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess = spawn('node', ['--require', clockPreloadFile, 'ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                    WAKE_TEST_CLOCK_ADVANCE_FILE    : clockAdvanceFile,
                    WAKE_TEST_CLOCK_ADVANCE_MS      : String(MESSAGE_WAKE_MAX_AGE_MS + 1),
                    WAKE_TEST_CLOCK_BASE_MS         : String(clockBaseMs)
                }
            });
            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        // First boot tails from the existing GraphLog tip by contract, so inject only after startup.
        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {
            agentId,
            sentAt : new Date(clockBaseMs).toISOString(),
            subject: 'Fresh Initially, Stale On Retry'
        });

        await staleDropPromise;

        const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8'),
              attempts    = logContents.match(/\[Wake Daemon Test-Fail Adapter\] Attempted/g) || [];

        expect(attempts).toHaveLength(1); // initial failure only; the due retry is age-gated before adapter dispatch
        expect(logContents).toContain('at retry delivery; oldestAgeMs=');
        expect(logContents).not.toContain('Giving up wake delivery');
    });

    test('#15704: stale replay stays unread and consumed while a fresh peer alone shapes the digest', async () => {
        const agentId = '@test-agent-message-age';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {adapter: 'test', coalesceWindow: 1}
        });

        let   output          = '';
        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Fresh mixed-queue wake was not delivered within timeout')), 15000);
            const onData  = data => {
                output += data.toString();
                if (output.includes(`[Wake Daemon Test Adapter] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
            });
            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        const fresh = insertMessageWake(db, {
            agentId,
            priority: 'normal',
            subject : 'Current Peer Message'
        });
        const stale = insertMessageWake(db, {
            agentId,
            priority: 'high',
            sentAt  : new Date(Date.now() - MESSAGE_WAKE_MAX_AGE_MS - 1_000).toISOString(),
            subject : 'Four-Day Ghost Replay'
        });

        await deliveryPromise;
        await new Promise(resolve => setTimeout(resolve, 250)); // watermark persistence follows the delivery log

        let logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect(logContents).toContain('[WAKE][priority:normal] 1 events');
        expect(logContents).toContain('1 message events (latest: "Current Peer Message"');
        expect(logContents).not.toContain('Four-Day Ghost Replay');
        expect(logContents).toContain(`Suppressed 1 stale/invalid message wake event(s) for ${agentId} at initial delivery`);

        const staleNode = JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get(stale.msgId).data);
        expect(staleNode.properties.readAt ?? null).toBeNull();

        let durableState = JSON.parse(fs.readFileSync(path.join(DAEMON_DIR, 'woken-watermark.json'), 'utf8'));
        expect(durableState.__messageIdsByIdentity[agentId]).toEqual(expect.arrayContaining([stale.msgId, fresh.msgId]));
        expect(durableState[subId]).toBeGreaterThanOrEqual(stale.edgeLogId);

        // Re-emit the exact old SENT_TO edge above the numeric watermark. The stable application-id
        // claim must consume this new GraphLog position without manufacturing another prompt. Move
        // this verification phase onto the existing explicit-immediate route so the post-flush
        // refractory does not postpone observation of durable consumption for two minutes.
        const subscriptionNode = JSON.parse(db.prepare('SELECT data FROM Nodes WHERE id = ?').get(subId).data);
        subscriptionNode.properties.harnessTargetMetadata.coalesceWindow = 0;
        db.prepare('UPDATE Nodes SET data = ? WHERE id = ?').run(JSON.stringify(subscriptionNode), subId);

        const replayLogId = Number(
            db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(stale.edgeId, 'edges').lastInsertRowid
        );
        await new Promise(resolve => setTimeout(resolve, 4500));

        logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
        expect((logContents.match(/\[Wake Daemon Test Adapter\] Delivered/g) || []).length).toBe(1);

        durableState = JSON.parse(fs.readFileSync(path.join(DAEMON_DIR, 'woken-watermark.json'), 'utf8'));
        expect(durableState.__messageIdsByIdentity[agentId]).toContain(stale.msgId);
        expect(durableState[subId]).toBeGreaterThanOrEqual(replayLogId);
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Directive Presence Probe'});

        // The lifecycle-first directive is an IDLE-watchdog nudge that belongs ONLY on pure-heartbeat
        // digests. A message wake already carries actionable content, so its digest must NOT carry the
        // generic directive — that unconditional placement was the dominant token cost (message wakes
        // far outnumber the heartbeat).
        const output = await deliveryPromise;
        expect(output).toContain('message events');          // the message digest still delivers normally
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

        // Inject a MESSAGE addressable to the agent: SENT_TO is the routing/detection edge the wake fires on;
        // DELIVERED_TO carries the per-recipient readAt the daemon must reconcile against. Only SENT_TO + the
        // node go into GraphLog (the wake trigger) — DELIVERED_TO is read live at flush time, not a trigger.
        const injectMessage = (subject, readAt) => {
            const msgId = 'msg_' + crypto.randomUUID();
            db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
                id        : msgId,
                label     : 'MESSAGE',
                properties: {from: '@sender', priority: 'normal', sentAt: new Date().toISOString(), subject}
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
        expect(output).toContain('1 message events');         // only the unread one is counted
        expect(output).toContain('Genuinely New Signal');    // ...and previewed as the latest
        expect(output).not.toContain('Already Read Noise');  // the already-read one is reconciled out
    });

    test('delivers GraphLog-only heartbeat pulses via test adapter', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

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
        expect(output).not.toContain('message events');
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

        await waitForDaemonReady(daemonProcess);

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
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

        const pulseId = `HEARTBEAT_PULSE:${agentId}:${crypto.randomUUID()}`;
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(pulseId, 'heartbeat_pulse');

        const output = await deliveryPromise;
        expect(output).toContain('[Wake Daemon Test Adapter] Delivered');
        expect(output).toContain('[WAKE][priority:normal]');
        expect(output).toContain('heartbeat pulses');
        expect(output).not.toContain('message events');
    });

    test('does not deliver wake events for wakeSuppressed mailbox-only messages', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
        });

        let deliveryCount = 0;
        daemonProcess.stdout.on('data', (data) => {
            const out = data.toString();
            if (out.includes('[Wake Daemon Test Adapter] Delivered')) {
                deliveryCount++;
            }
        });

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from          : agentId,
                to            : agentId,
                subject       : 'Suppressed Sunset Ping',
                readAt        : null,
                sentAt        : new Date().toISOString(),
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

        const stored        = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(msgId);
        const storedMessage = JSON.parse(stored.data);
        expect(storedMessage.properties.readAt).toBeNull();
        expect(storedMessage.properties.wakeSuppressed).toBe(true);
    });

    test('does not queue wake delivery for known non-active identities (#13456)', async () => {
        const agentId = '@neo-gemini-pro';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'test',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
        });

        let   deliveryCount   = 0;
        let   finalDigest     = '';
        const deliveryPromise = new Promise((resolve, reject) => {
            // wall-clock-under-test: the 8s window is the duplicate-delivery observation bound — a
            // second delivery against 50ms poll cycles must surface inside it
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : '@sender',
                sentAt : new Date().toISOString(),
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
        expect(finalDigest).toContain('1 message events');
        expect(finalDigest).toContain('Test Dedup Event');
        expect(finalDigest).toContain('[WAKE][priority:normal]');
        expect(finalDigest).not.toContain('priority: normal');
    });

    test('keeps typed Task transitions distinct and ignores later generic MESSAGE rewrites (#15114)', async () => {
        const agentId = '@test-agent-task-clock';
        const taskId  = 'MSG:TASK-CLOCK-COALESCE';
        const subId   = insertWakeSubscription(db, {
            agentId,
            trigger              : 'TASK_STATE_CHANGED',
            harnessTargetMetadata: {
                adapter       : 'test',
                coalesceWindow: 10
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        let   stdoutLog       = '';
        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Task transition digest did not arrive')), 20000);

            daemonProcess.stdout.on('data', data => {
                stdoutLog += data.toString();
                if (stdoutLog.includes(`[Wake Daemon Test Adapter] Delivered ${subId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        const writeTaskTransition = (eventId, previousState, newState, lastModifiedAt) => {
            db.prepare(`
                INSERT INTO GraphLog (entity_id, entity_type, event_id, event_payload)
                VALUES (?, 'task_state_changed', ?, ?)
            `).run(taskId, eventId, JSON.stringify({
                schemaVersion      : 'task-state-change.v1',
                taskId,
                previousState,
                newState,
                originator         : '@task-originator',
                assignee           : agentId,
                assignmentAuthority: 'memory-core.v1',
                lastModifiedAt
            }));
        };

        // Keep each mutation in a distinct daemon poll. The final state repeats the first state,
        // but its source event id makes it a distinct transition rather than a duplicate.
        await new Promise(resolve => setTimeout(resolve, 1000));
        writeTaskTransition('task-event-1', 'Submitted', 'Working',       '2026-07-12T20:01:02.003Z');
        await new Promise(resolve => setTimeout(resolve, 3500));
        writeTaskTransition('task-event-2', 'Working', 'InputRequired', '2026-07-12T20:01:05.006Z');
        await new Promise(resolve => setTimeout(resolve, 3500));
        writeTaskTransition('task-event-3', 'InputRequired', 'Working', '2026-07-12T20:01:08.009Z');

        // A later unrelated mutable-node rewrite still enters generic GraphLog invalidation, but
        // it is not a fourth Task transition.
        db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(taskId, JSON.stringify({
            id        : taskId,
            label     : 'MESSAGE',
            properties: {
                from                   : '@task-originator',
                lastModifiedAt         : '2026-07-12T20:01:08.009Z',
                readAt                 : new Date().toISOString(),
                sentAt                 : new Date().toISOString(),
                taskAssignmentAuthority: 'memory-core.v1',
                task                   : {state: 'Working', assignee: agentId}
            }
        }));
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(taskId, 'nodes');

        await deliveryPromise;

        expect(stdoutLog).toContain('3 task transitions');
        expect(stdoutLog).toContain(`latest: Working on task ${taskId}`);
    });

    test('#15054: one message wakes an identity once across overlapping routes and later GraphLog replay', async () => {
        const agentId = '@test-agent-stable-message-dedup';

        insertWakeSubscription(db, {
            agentId,
            filters              : {},
            harnessTargetMetadata: {adapter: 'test', coalesceWindow: 0}
        });
        insertWakeSubscription(db, {
            agentId,
            filters              : {priority: 'high'},
            harnessTargetMetadata: {adapter: 'test', coalesceWindow: 0}
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        let   deliveryCount = 0;
        const firstDelivery = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('First stable-message wake did not arrive')), 12000);

            daemonProcess.stdout.on('data', data => {
                const output = data.toString();
                deliveryCount += (output.match(/\[Wake Daemon Test Adapter\] Delivered/g) || []).length;
                if (deliveryCount > 0) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        const {msgId} = insertMessageWake(db, {
            agentId,
            priority: 'high',
            subject : 'Stable message identity'
        });

        await firstDelivery;

        // Projection replay: the application MESSAGE id is unchanged, but GraphLog appends a new
        // position above both per-subscription numeric watermarks. It must not create another prompt.
        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');
        await new Promise(resolve => setTimeout(resolve, 4500));

        expect(deliveryCount).toBe(1);

        const durableState = JSON.parse(
            fs.readFileSync(path.join(DAEMON_DIR, 'woken-watermark.json'), 'utf8')
        );
        expect(durableState.__messageIdsByIdentity[agentId]).toContain(msgId);

        // Restart durability: the stable-id claim survives the daemon process. A third GraphLog
        // emission after restart is still the same logical message and must remain prompt-silent.
        const firstExit = new Promise(resolve => daemonProcess.once('exit', resolve));
        daemonProcess.kill('SIGKILL');
        await firstExit;
        daemonProcess = null;

        db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

        let restartDeliveryCount = 0;
        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });
        daemonProcess.stdout.on('data', data => {
            restartDeliveryCount += (data.toString().match(/\[Wake Daemon Test Adapter\] Delivered/g) || []).length;
        });
        daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));

        await new Promise(resolve => setTimeout(resolve, 4000));
        expect(restartDeliveryCount).toBe(0);
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
                NEO_FLEET_CODEX_BIN             : mockCodexPath,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
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

        await waitForDaemonReady(daemonProcess);
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

    test('uses the AiConfig Fleet Codex binary when daemon PATH lacks bare codex (#15054)', async () => {
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
        const mockCodexPath    = path.join(DAEMON_DIR, 'ChatGPT.app', 'Contents', 'Resources', 'codex');
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
                NEO_FLEET_CODEX_BIN             : mockCodexPath,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.dirname(process.execPath)}${path.delimiter}${path.resolve(binDir)}`
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

        await waitForDaemonReady(daemonProcess);
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
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

        const highMsgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(highMsgId, JSON.stringify({
            id        : highMsgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'high',
                sentAt  : new Date().toISOString(),
                subject : 'High Priority Wake Event'
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
                priority: 'low',
                sentAt  : new Date().toISOString(),
                subject : 'Low Priority Wake Event'
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
        expect(output).toContain('2 message events');
        expect(output).toContain('Low Priority Wake Event');
        expect(output).toContain('latest priority: low');
    });

    test('skips osascript delivery and logs error when appName is missing', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
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
            env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {from: '@sender', sentAt: new Date().toISOString(), subject: 'Test Empty AppName'}
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
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_out.json');
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'normal',
                sentAt  : new Date().toISOString(),
                subject : 'Test Antigravity Event'
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
        const args       = JSON.parse(mockOutput);

        expect(args.join(' ')).toContain('keystroke "i" using {command down, shift down}');
        expect(args.join(' ')).toContain('tell application "Antigravity" to activate');
        expect(args.join(' ')).not.toContain('key code 49');
        expect(stdoutLog).toContain(
            'scenario=direct-message; route=osascript; adapterSource=metadata; app=Antigravity; ' +
            'counts=messages:1,tasks:0,permissions:0,heartbeats:0'
        );
    });

    test('delivers wake events via opencode-server adapter without osascript fallback (#15394)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-opencode-server';

        // Stub the seat's embedded OpenCode server: captures the prompt_async POST.
        const captured   = [];
        const stubServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                captured.push({method: req.method, url: req.url, headers: req.headers, body});
                res.writeHead(204);
                res.end();
            });
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        const envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope.json');
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : stubPort,
            sessionId: 'ses_test',
            projectId: 'project_test',
            directory: DAEMON_DIR,
            username : 'wake-user',
            password : 'wake-pass'
        });

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        const binDir               = path.join(DAEMON_DIR, 'bin');
        const mockOsascriptPath    = path.join(binDir, 'osascript');
        const mockOsascriptOutPath = path.join(DAEMON_DIR, 'mock_opencode_osascript_out.json');

        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        fs.writeFileSync(mockOsascriptPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockOsascriptOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockOsascriptPath, 0o755);

        let stdoutLog = '';

        try {
            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                    PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
                }
            });

            const deliveryPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver opencode-server digest within timeout')), 10000);

                daemonProcess.stdout.on('data', (data) => {
                    const out = data.toString();
                    stdoutLog += out;
                    if (out.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
                        clearTimeout(timeout);
                        resolve();
                    }
                    if (out.includes(`[Wake Daemon] Delivered ${subId} via osascript`)) {
                        clearTimeout(timeout);
                        reject(new Error('Daemon fell back to osascript for opencode-server route'));
                    }
                });
                daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
                daemonProcess.on('error', reject);
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {
                agentId,
                subject: 'OpenCode Server Wake'
            });

            await deliveryPromise;

            expect(captured.length).toBe(1);

            const call = captured[0];
            expect(call.method).toBe('POST');
            expect(call.url).toBe('/session/ses_test/prompt_async');
            expect(call.headers.authorization).toBe('Basic ' + Buffer.from('wake-user:wake-pass').toString('base64'));

            const payload = JSON.parse(call.body);
            expect(payload.parts[0].type).toBe('text');
            expect(payload.parts[0].text).toContain('OpenCode Server Wake');

            expect(fs.existsSync(mockOsascriptOutPath)).toBe(false);
            expect(stdoutLog).toContain(`[Wake Daemon] Dispatched ${subId} via opencode-server prompt_async`);
            expect(stdoutLog).toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
            expect(stdoutLog).toContain('route=opencode-server; adapterSource=metadata');
        } finally {
            stubServer.close();
        }
    });

    test('opencode-server rebinds changed coordinates once while preserving the exact owner tuple (#15677)', async () => {
        const
            subId   = 'sub_' + crypto.randomUUID(),
            agentId = '@test-agent-opencode-rebind';

        const deadServer = http.createServer();
        await new Promise(resolve => deadServer.listen(0, '127.0.0.1', resolve));
        const deadPort = deadServer.address().port;
        await new Promise(resolve => deadServer.close(resolve));

        const captured   = [];
        const liveServer = http.createServer((req, res) => {
            captured.push({url: req.url, authorization: req.headers.authorization});
            res.writeHead(204);
            res.end();
        });
        await new Promise(resolve => liveServer.listen(0, '127.0.0.1', resolve));
        const livePort = liveServer.address().port;

        const
            envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope-rebind.json'),
            authority    = {
                sessionId: 'ses_pinned',
                projectId: 'project_pinned',
                directory: DAEMON_DIR
            };

        fs.writeJsonSync(envelopePath, {
            hostname: '127.0.0.1',
            port    : deadPort,
            ...authority,
            username: 'wake-user-old',
            password: 'wake-pass-old'
        });
        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
            }
        });

        let   output    = '';
        let   rebound   = false;
        const delivered = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('OpenCode coordinate rebind did not deliver within timeout')), 15000);
            const onData  = data => {
                output += data.toString();
                if (!rebound && output.includes('re-reading the authoritative envelope once')) {
                    rebound = true;
                    fs.writeJsonSync(envelopePath, {
                        hostname: '127.0.0.1',
                        port    : livePort,
                        ...authority,
                        username: 'wake-user-new',
                        password: 'wake-pass-new'
                    });
                }
                if (output.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {agentId, subject: 'OpenCode Coordinate Rebind'});
            await delivered;

            expect(rebound).toBe(true);
            expect(captured).toHaveLength(1);
            expect(captured[0].url).toBe('/session/ses_pinned/prompt_async');
            expect(captured[0].authorization)
                .toBe('Basic ' + Buffer.from('wake-user-new:wake-pass-new').toString('base64'));
            expect(output).toContain(`Dispatched ${subId} via opencode-server prompt_async`);
        } finally {
            liveServer.closeAllConnections?.();
            liveServer.close();
        }
    });

    test('opencode-server refuses a stale-coordinate rebind that changes session authority (#15677)', async () => {
        const
            subId   = 'sub_' + crypto.randomUUID(),
            agentId = '@test-agent-opencode-retarget-refusal';

        const deadServer = http.createServer();
        await new Promise(resolve => deadServer.listen(0, '127.0.0.1', resolve));
        const deadPort = deadServer.address().port;
        await new Promise(resolve => deadServer.close(resolve));

        const captured   = [];
        const liveServer = http.createServer((req, res) => {
            captured.push(req.url);
            res.writeHead(204);
            res.end();
        });
        await new Promise(resolve => liveServer.listen(0, '127.0.0.1', resolve));
        const livePort = liveServer.address().port;

        const envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope-retarget.json');
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : deadPort,
            sessionId: 'ses_owner',
            projectId: 'project_owner',
            directory: DAEMON_DIR,
            username : 'wake-user',
            password : 'wake-pass'
        });
        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
            }
        });

        let   output  = '';
        let   rebound = false;
        const refused = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('OpenCode authority change was not refused within timeout')), 15000);
            const onData  = data => {
                output += data.toString();
                if (!rebound && output.includes('re-reading the authoritative envelope once')) {
                    rebound = true;
                    fs.writeJsonSync(envelopePath, {
                        hostname : '127.0.0.1',
                        port     : livePort,
                        sessionId: 'ses_sibling',
                        projectId: 'project_owner',
                        directory: DAEMON_DIR,
                        username : 'wake-user-new',
                        password : 'wake-pass-new'
                    });
                }
                if (output.includes('authority tuple changed during coordinate rebind')) {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            daemonProcess.stdout.on('data', onData);
            daemonProcess.stderr.on('data', onData);
            daemonProcess.on('error', reject);
        });

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {agentId, subject: 'OpenCode Retarget Refusal'});
            await refused;

            expect(rebound).toBe(true);
            expect(captured).toHaveLength(0);
            expect(output).toContain('Failed to deliver via opencode-server');
        } finally {
            liveServer.closeAllConnections?.();
            liveServer.close();
        }
    });

    test('delivers wake events via kimi-server adapter without osascript fallback (#15579)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-server';

        // Stub the seat's `kimi server`: captures the submitPrompt POST. The session authority
        // comes from the wake envelope (SessionStart-hook writer contract), never from a
        // session-index heuristic.
        const captured   = [];
        const stubServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                captured.push({method: req.method, url: req.url, headers: req.headers, body});
                res.writeHead(200, {'content-type': 'application/json'});
                res.end(JSON.stringify({code: 0, msg: 'success', data: {
                    prompt_id      : 'prompt_test',
                    user_message_id: 'msg_test',
                    status         : 'running',
                    content        : []
                }}));
            });
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        const lockPath     = path.join(DAEMON_DIR, 'kimi-server-lock.json');
        const tokenPath    = path.join(DAEMON_DIR, 'kimi-server.token');
        const envelopePath = path.join(DAEMON_DIR, 'kimi-wake-envelope.json');
        fs.writeJsonSync(lockPath, {host: '127.0.0.1', pid: 424242, port: stubPort, started_at: '2026-07-19T20:00:00.000Z'});
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_live', cwd: '/seat/checkout', updatedAt: '2026-07-19T20:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath,
                lockPath,
                tokenPath,
                coalesceWindow: 1
            }
        });

        const binDir               = path.join(DAEMON_DIR, 'bin');
        const mockOsascriptPath    = path.join(binDir, 'osascript');
        const mockOsascriptOutPath = path.join(DAEMON_DIR, 'mock_kimi_osascript_out.json');

        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        fs.writeFileSync(mockOsascriptPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockOsascriptOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockOsascriptPath, 0o755);

        let stdoutLog = '';

        try {
            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                    PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
                }
            });

            const deliveryPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver kimi-server digest within timeout')), 10000);

                daemonProcess.stdout.on('data', (data) => {
                    const out = data.toString();
                    stdoutLog += out;
                    if (out.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
                        clearTimeout(timeout);
                        resolve();
                    }
                    if (out.includes(`[Wake Daemon] Delivered ${subId} via osascript`)) {
                        clearTimeout(timeout);
                        reject(new Error('Daemon fell back to osascript for kimi-server route'));
                    }
                });
                daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
                daemonProcess.on('error', reject);
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {
                agentId,
                subject: 'Kimi Server Wake'
            });

            await deliveryPromise;

            expect(captured.length).toBe(1);

            const submitCall = captured[0];
            expect(submitCall.method).toBe('POST');
            expect(submitCall.url).toBe('/api/v1/sessions/ses_kimi_live/prompts');
            expect(submitCall.headers.authorization).toBe('Bearer kimi-test-token');

            const payload = JSON.parse(submitCall.body);
            expect(payload.content[0].type).toBe('text');
            expect(payload.content[0].text).toContain('Kimi Server Wake');

            expect(fs.existsSync(mockOsascriptOutPath)).toBe(false);
            expect(stdoutLog).toContain(`[Wake Daemon] Dispatched ${subId} via kimi-server submitPrompt (session ses_kimi_live, status=running)`);
            expect(stdoutLog).toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
            expect(stdoutLog).toContain('route=kimi-server; adapterSource=metadata');
        } finally {
            stubServer.close();
        }
    });

    test('kimi-server fails visibly without a wake envelope instead of retargeting heuristically (#15579)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-server-no-envelope';

        // No envelope file: the adapter must refuse visibly (failed, never delivered), not fall
        // back to a session-index pick or to osascript.
        const lockPath  = path.join(DAEMON_DIR, 'kimi-server-lock-no-envelope.json');
        const tokenPath = path.join(DAEMON_DIR, 'kimi-server-no-envelope.token');
        fs.writeJsonSync(lockPath, {host: '127.0.0.1', pid: 424242, port: 1, started_at: '2026-07-19T20:00:00.000Z'});
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath  : path.join(DAEMON_DIR, 'kimi-wake-envelope-MISSING.json'),
                lockPath,
                tokenPath,
                coalesceWindow: 1
            }
        });

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
            }
        });
        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        // The fail-visible path logs through the error stream; fold it into the same buffer.
        daemonProcess.stderr.on('data', data => stdoutLog += data.toString());

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {
            agentId,
            subject: 'Kimi Server Missing Envelope Wake'
        });

        // Give the daemon room to attempt (and possibly retry) the delivery.
        await new Promise(resolve => setTimeout(resolve, 4000));

        expect(stdoutLog).toContain('kimi-server requires a readable wake envelope');
        expect(stdoutLog).not.toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
        expect(stdoutLog).not.toContain(`Dispatched ${subId} via kimi-server submitPrompt`);
    });

    test('kimi-server discovers a single live v0.28 instance without override or legacy lock (#15596)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-v028-discovery';

        // Stub the seat's `kimi web` REST surface: captures the submitPrompt POST.
        const captured   = [];
        const stubServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                captured.push({method: req.method, url: req.url, authorization: req.headers.authorization, body});
                res.writeHead(200, {'content-type': 'application/json'});
                res.end(JSON.stringify({code: 0, data: {status: 'running'}}));
            });
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        // Fixture HOME: only a v0.28 instance file (pid = this test runner = alive), no legacy lock.
        const fakeHome     = path.join(DAEMON_DIR, 'kimi-home-v028');
        const instancesDir = path.join(fakeHome, '.kimi-code', 'server', 'instances');
        fs.ensureDirSync(instancesDir);
        fs.writeJsonSync(path.join(instancesDir, '01TESTINSTANCE0000000000000.json'), {
            server_id   : '01TESTINSTANCE0000000000000',
            pid         : process.pid,
            host        : '127.0.0.1',
            port        : stubPort,
            started_at  : Date.now(),
            heartbeat_at: Date.now(),
            host_version: '0.28.0'
        });

        const tokenPath    = path.join(DAEMON_DIR, 'kimi-server-v028.token');
        const envelopePath = path.join(DAEMON_DIR, 'kimi-wake-envelope-v028.json');
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_v028', cwd: '/seat/checkout', updatedAt: '2026-07-20T10:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath,
                tokenPath,
                coalesceWindow: 1
                // no lockPath: discovery must find the v0.28 instance under HOME
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        try {
            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    HOME                            : fakeHome,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                    PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
                }
            });

            const deliveryPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Daemon failed to discover the v0.28 instance + deliver within timeout')), 10000);

                daemonProcess.stdout.on('data', (data) => {
                    const out = data.toString();
                    stdoutLog += out;
                    if (out.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
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
                subject: 'Kimi v0.28 Discovery Wake'
            });

            await deliveryPromise;

            expect(captured.length).toBe(1);
            expect(captured[0].method).toBe('POST');
            expect(captured[0].url).toBe('/api/v1/sessions/ses_kimi_v028/prompts');
            expect(captured[0].authorization).toBe('Bearer kimi-test-token');
            expect(stdoutLog).toContain(`Dispatched ${subId} via kimi-server submitPrompt (session ses_kimi_v028, status=running)`);
        } finally {
            stubServer.close();
        }
    });

    test('kimi-server rejects a dead-pid v0.28 instance and names both generations (#15596)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-v028-dead-pid';

        // A pid that is guaranteed dead: spawn + await exit, then reuse its pid.
        const deadChild = spawn(process.execPath, ['-e', ''], {stdio: 'ignore'});
        await new Promise(resolve => deadChild.on('exit', resolve));
        const deadPid = deadChild.pid;

        const fakeHome     = path.join(DAEMON_DIR, 'kimi-home-dead');
        const instancesDir = path.join(fakeHome, '.kimi-code', 'server', 'instances');
        fs.ensureDirSync(instancesDir);
        fs.writeJsonSync(path.join(instancesDir, '01DEADINSTANCE000000000000.json'), {
            server_id   : '01DEADINSTANCE000000000000',
            pid         : deadPid,
            host        : '127.0.0.1',
            port        : 1,
            started_at  : Date.now(),
            heartbeat_at: Date.now(),
            host_version: '0.28.0'
        });

        const tokenPath    = path.join(DAEMON_DIR, 'kimi-server-dead.token');
        const envelopePath = path.join(DAEMON_DIR, 'kimi-wake-envelope-dead.json');
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_dead', cwd: '/seat/checkout', updatedAt: '2026-07-20T10:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath,
                tokenPath,
                coalesceWindow: 1
            }
        });

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                HOME                            : fakeHome,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
            }
        });

        daemonProcess.stdout.on('data', (data) => { stdoutLog += data.toString(); });
        // The fail-visible path logs through the error stream; fold it into the same buffer.
        daemonProcess.stderr.on('data', (data) => { stdoutLog += data.toString(); });

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {
            agentId,
            subject: 'Kimi v0.28 Dead Instance Wake'
        });

        // Give the daemon room to attempt (and possibly retry) the delivery.
        await new Promise(resolve => setTimeout(resolve, 4000));

        expect(stdoutLog).toContain('no v0.27 lock');
        expect(stdoutLog).toContain('no live v0.28 instance');
        expect(stdoutLog).toContain(`'kimi web'`);
        expect(stdoutLog).not.toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
        expect(stdoutLog).not.toContain(`Dispatched ${subId} via kimi-server submitPrompt`);
    });

    test('kimi-server fails closed on multiple live v0.28 instances instead of picking arbitrarily (#15596)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-v028-ambiguous';

        const captured   = [];
        const stubServer = http.createServer((req, res) => {
            captured.push({url: req.url});
            res.writeHead(200, {'content-type': 'application/json'});
            res.end(JSON.stringify({code: 0, data: {status: 'running'}}));
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        // Two LIVE instance files (both pid = this test runner) on different ports: the daemon
        // must refuse to guess, even though either would answer HTTP.
        const fakeHome     = path.join(DAEMON_DIR, 'kimi-home-ambiguous');
        const instancesDir = path.join(fakeHome, '.kimi-code', 'server', 'instances');
        fs.ensureDirSync(instancesDir);

        for (const [serverId, port] of [['01AMBIGUOUSINSTANCE000000A', stubPort], ['01AMBIGUOUSINSTANCE000000B', stubPort + 1]]) {
            fs.writeJsonSync(path.join(instancesDir, `${serverId}.json`), {
                server_id   : serverId,
                pid         : process.pid,
                host        : '127.0.0.1',
                port,
                started_at  : Date.now(),
                heartbeat_at: Date.now(),
                host_version: '0.28.0'
            });
        }

        const tokenPath    = path.join(DAEMON_DIR, 'kimi-server-ambiguous.token');
        const envelopePath = path.join(DAEMON_DIR, 'kimi-wake-envelope-ambiguous.json');
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_ambiguous', cwd: '/seat/checkout', updatedAt: '2026-07-20T10:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath,
                tokenPath,
                coalesceWindow: 1
            }
        });

        let stdoutLog = '';

        try {
            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    HOME                            : fakeHome,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                }
            });

            daemonProcess.stdout.on('data', (data) => { stdoutLog += data.toString(); });
            // The fail-visible path logs through the error stream; fold it into the same buffer.
            daemonProcess.stderr.on('data', (data) => { stdoutLog += data.toString(); });

            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {
                agentId,
                subject: 'Kimi v0.28 Ambiguous Wake'
            });

            await new Promise(resolve => setTimeout(resolve, 4000));

            expect(stdoutLog).toContain('cannot pick one arbitrarily');
            expect(stdoutLog).toContain('lockPath');
            expect(stdoutLog).not.toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
            expect(captured.length).toBe(0);
        } finally {
            stubServer.close();
        }
    });

    test('kimi-server legacy v0.27 lock takes precedence over the v0.28 instance scan (#15596)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-legacy-precedence';

        const captured   = [];
        const stubServer = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                captured.push({method: req.method, url: req.url, body});
                res.writeHead(200, {'content-type': 'application/json'});
                res.end(JSON.stringify({code: 0, data: {status: 'running'}}));
            });
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        // Fixture HOME with BOTH generations present: the legacy lock (live stub) and a v0.28
        // instance file (dead pid, port 1). Discovery must return the legacy lock before ever
        // scanning instances.
        const fakeHome     = path.join(DAEMON_DIR, 'kimi-home-legacy');
        const instancesDir = path.join(fakeHome, '.kimi-code', 'server', 'instances');
        fs.ensureDirSync(instancesDir);
        fs.writeJsonSync(path.join(fakeHome, '.kimi-code', 'server', 'lock'), {
            host: '127.0.0.1',
            pid : 424242,
            port: stubPort
        });
        fs.writeJsonSync(path.join(instancesDir, '01SHOULDNOTBEREAD0000000.json'), {
            server_id   : '01SHOULDNOTBEREAD0000000',
            pid         : 1, // launchd on macOS: alive, but the port is unusable — any read fails delivery
            host        : '127.0.0.1',
            port        : 1,
            started_at  : Date.now(),
            heartbeat_at: Date.now(),
            host_version: '0.28.0'
        });

        const tokenPath    = path.join(DAEMON_DIR, 'kimi-server-legacy.token');
        const envelopePath = path.join(DAEMON_DIR, 'kimi-wake-envelope-legacy.json');
        fs.writeFileSync(tokenPath, 'kimi-test-token\n');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_legacy', cwd: '/seat/checkout', updatedAt: '2026-07-20T10:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-server',
                envelopePath,
                tokenPath,
                coalesceWindow: 1
            }
        });

        let stdoutLog = '';

        try {
            daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
                stdio: 'pipe',
                env  : {
                    ...process.env,
                    HOME                            : fakeHome,
                    NEO_MEMORY_DB_PATH              : DB_PATH,
                    NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                    NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                }
            });

            const deliveryPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver via legacy v0.27 lock within timeout')), 10000);

                daemonProcess.stdout.on('data', (data) => {
                    const out = data.toString();
                    stdoutLog += out;
                    if (out.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
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
                subject: 'Kimi Legacy Precedence Wake'
            });

            await deliveryPromise;

            expect(captured.length).toBe(1);
            expect(captured[0].url).toBe('/api/v1/sessions/ses_kimi_legacy/prompts');
            expect(stdoutLog).toContain(`Dispatched ${subId} via kimi-server submitPrompt (session ses_kimi_legacy, status=running)`);
        } finally {
            stubServer.close();
        }
    });

    test('opencode-server shares the configured attempt abort and cannot report orphan success (#15394, #15414)', async () => {
        test.setTimeout(15000);

        const subId    = 'sub_' + crypto.randomUUID();
        const agentId  = '@test-agent-opencode-shared-abort';
        const requests = [];

        // Respond AFTER the 1s delivery-owner bound. If the route ignores the shared signal,
        // this orphan logs a false success at 2s even though the owner already resolved failed.
        const stubServer = http.createServer((req, res) => {
            requests.push(Date.now());
            // out-waits: the 1s delivery-owner bound — the orphan response lands only after the
            // owner has already resolved failed
            setTimeout(() => {
                if (!res.destroyed) {
                    res.writeHead(204);
                    res.end();
                }
            }, 2000);
        });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        const envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope-shared-abort.json');
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : stubPort,
            sessionId: 'ses_shared_abort',
            projectId: 'project_shared_abort',
            directory: DAEMON_DIR,
            username : 'wake-user',
            password : 'wake-pass'
        });

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS: '1'
            }
        });

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, {
                agentId,
                subject: 'OpenCode Shared Abort Wake'
            });

            for (let i = 0; i < 50 && requests.length === 0; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            expect(requests.length).toBeGreaterThanOrEqual(1);

            // Wait beyond the server's delayed response. A detached 5s-local signal would let
            // the orphan complete and emit a transport success after the 1s owner timeout.
            await new Promise(resolve => setTimeout(resolve, 2800));

            const logContents = fs.readFileSync(path.join(DAEMON_DIR, 'wake-daemon.log'), 'utf8');
            expect(logContents).toContain('exceeded 1000ms');
            expect(logContents).not.toContain(`Dispatched ${subId} via opencode-server prompt_async`);
            expect(logContents).not.toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
        } finally {
            stubServer.closeAllConnections?.();
            stubServer.close();
        }
    });

    test('opencode-server route fails visibly (named throw) when the seat envelope is missing (#15394)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-opencode-server-missing-envelope';

        const envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope-missing.json');

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        const binDir               = path.join(DAEMON_DIR, 'bin');
        const mockOsascriptPath    = path.join(binDir, 'osascript');
        const mockOsascriptOutPath = path.join(DAEMON_DIR, 'mock_opencode_missing_osascript_out.json');

        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
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
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
            }
        });

        const failurePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not surface the missing-envelope failure within timeout')), 20000);

            // writeLog routes ERROR to stderr, INFO to stdout — the fail-visible signal lives on stderr.
            daemonProcess.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`Failed to deliver via opencode-server`) && out.includes(`requires a readable seat envelope at '${envelopePath}'`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`[Wake Daemon] Delivered ${subId} via osascript`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon fell back to osascript for a missing-envelope opencode-server route'));
                }
            });
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {
            agentId,
            subject: 'OpenCode Missing Envelope Wake'
        });

        await failurePromise;

        // Fail-visible means the named error surfaced AND the GUI path stayed untouched.
        expect(fs.existsSync(mockOsascriptOutPath)).toBe(false);
    });

    test('a hung OpenCode endpoint fails deadline-bounded and does NOT wedge the serialized delivery of later routes (#15394)', async () => {
        const hungSubId  = 'sub_' + crypto.randomUUID();
        const hungAgent  = '@test-agent-opencode-hung';
        const laterSubId = 'sub_' + crypto.randomUUID();
        const laterAgent = '@test-agent-after-hung';

        // Accept-and-never-respond stub: the worst accepting endpoint — the delivery must die by
        // the AbortSignal deadline, not by the endpoint.
        const stubServer = http.createServer((req, res) => { /* accept, never respond */ });
        await new Promise(resolve => stubServer.listen(0, '127.0.0.1', resolve));
        const stubPort = stubServer.address().port;

        const envelopePath = path.join(DAEMON_DIR, 'opencode-wake-envelope-hung.json');
        fs.writeJsonSync(envelopePath, {
            hostname : '127.0.0.1',
            port     : stubPort,
            sessionId: 'ses_hung',
            projectId: 'project_hung',
            directory: DAEMON_DIR,
            username : 'wake-user',
            password : 'wake-pass'
        });

        insertWakeSubscription(db, {
            subId                : hungSubId,
            agentId              : hungAgent,
            harnessTargetMetadata: {
                adapter       : 'opencode-server',
                envelopePath,
                coalesceWindow: 1
            }
        });

        insertWakeSubscription(db, {
            subId                : laterSubId,
            agentId              : laterAgent,
            harnessTargetMetadata: {
                adapter       : 'test',
                coalesceWindow: 1
            }
        });

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
            }
        });

        let hungFailed = false;

        const laterDeliveredPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('the later route never delivered — the hung endpoint wedged the serialized loop')), 30000);

            daemonProcess.stderr.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`Failed to deliver via opencode-server`)) {
                    hungFailed = true;
                }
            });
            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                if (out.includes(`[Wake Daemon Test Adapter] Delivered ${laterSubId}`)) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.on('error', reject);
        });

        try {
            await new Promise(resolve => setTimeout(resolve, 1000));
            insertMessageWake(db, { agentId: hungAgent,  subject: 'Hung Endpoint Wake' });
            insertMessageWake(db, { agentId: laterAgent, subject: 'After Hung Wake' });

            await laterDeliveredPromise;
            expect(hungFailed).toBe(true);
        } finally {
            stubServer.closeAllConnections?.();
            stubServer.close();
        }
    });

    test('Claude default focus seed emits r -> Cmd+Z before prompt clear and guards frontmost (#10987, #10422)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_claude_out.json');
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'normal',
                sentAt  : new Date().toISOString(),
                subject : 'Test Claude Event'
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

        const args                      = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent             = args.filter((_, i) => args[i - 1] === '-e').join('\n');
        const activateIndex             = scriptContent.indexOf('tell application "Claude" to activate');
        const tabIndex                  = scriptContent.indexOf('keystroke "3" using command down');
        const rIndex                    = scriptContent.indexOf('keystroke "r"');
        const zIndex                    = scriptContent.indexOf('keystroke "z" using command down');
        const clearIndex                = scriptContent.indexOf('keystroke "a" using command down');
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

    test('default Codex route targets the arg-less ChatGPT.app resident by pid (#15054)', async () => {
        const agentId = '@test-codex-default-resident';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'osascript',
                appName       : 'Codex',
                coalesceWindow: 1,
                focusSeedKey  : 'r'
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir, [
            '3778 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
            '37111 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=/Users/example/.codex-app-instances/emmy'
        ].join('\n'));
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_default_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', JSON.stringify(process.argv.slice(2)));\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver the default Codex wake within timeout')), 10000);

            daemonProcess.stdout.on('data', data => {
                if (data.toString().includes(`[Wake Daemon] Submit attempted ${subId}`)) {
                    clearTimeout(timeout);
                    resolve()
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject)
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Default Codex Resident Wake'});
        await deliveryPromise;

        const args          = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');

        expect(scriptContent).toContain('set targetProcessId to "3778"');
        expect(scriptContent).toContain('first process whose unix id is 3778')
    });

    test('ambiguous Codex default route fails closed before osascript (#15054)', async () => {
        const agentId = '@test-codex-ambiguous-default';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'osascript',
                appName       : 'Codex',
                coalesceWindow: 1,
                focusSeedKey  : 'r'
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir, [
            '3778 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
            '37111 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT'
        ].join('\n'));
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_ambiguous_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', 'unexpected delivery');\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not refuse the ambiguous Codex wake within timeout')), 10000);
            const inspect = data => {
                if (data.toString().includes(`Default-instance wake refused for ${subId}`)) {
                    clearTimeout(timeout);
                    resolve()
                }
            };

            daemonProcess.stdout.on('data', inspect);
            daemonProcess.stderr.on('data', inspect);
            daemonProcess.on('error', reject)
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Ambiguous Codex Resident Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false)
    });

    test('default Codex route fails closed when only an addressed sibling resident is running (#15054)', async () => {
        const agentId = '@test-codex-addressed-only';
        const subId   = insertWakeSubscription(db, {
            agentId,
            harnessTargetMetadata: {
                adapter       : 'osascript',
                appName       : 'Codex',
                coalesceWindow: 1,
                focusSeedKey  : 'r'
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir, [
            '37111 1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT --user-data-dir=/Users/example/.codex-app-instances/emmy',
            '37122 37111 /Applications/ChatGPT.app/Contents/Frameworks/ChatGPT Helper.app/Contents/MacOS/ChatGPT Helper --type=renderer --user-data-dir=/Users/example/.codex-app-instances/emmy'
        ].join('\n'));
        const mockOsascriptPath = path.join(binDir, 'osascript');
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_addressed_only_out.json');
        fs.writeFileSync(mockOsascriptPath, `#!/usr/bin/env node\nimport fs from 'fs';\nfs.writeFileSync('${mockOutPath}', 'unexpected delivery');\n`);
        fs.chmodSync(mockOsascriptPath, 0o755);

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, PATH: `${path.resolve(binDir)}:${process.env.PATH}`, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR}
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not refuse the addressed-only Codex wake within timeout')), 10000);
            const inspect = data => {
                if (data.toString().includes(`Default-instance wake refused for ${subId}`)) {
                    clearTimeout(timeout);
                    resolve()
                }
            };

            daemonProcess.stdout.on('data', inspect);
            daemonProcess.stderr.on('data', inspect);
            daemonProcess.on('error', reject)
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Addressed-only Codex Resident Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false)
    });

    test('addressType pid dispatch targets the resolved process id when HarnessPresence is fresh (#12422)', async () => {
        const agentId = '@test-agent-pid-address';
        const subId   = insertWakeSubscription(db, {
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_pid_out.json');
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'PID Address Wake'});
        await deliveryPromise;

        const args          = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');

        expect(scriptContent).toContain('set targetProcessId to "4242"');
        expect(scriptContent).toContain('first process whose unix id is 4242');
    });

    test('stale HarnessPresence refuses targeted GUI delivery instead of falling through to app activate (#12422)', async () => {
        const agentId = '@test-agent-stale-presence';
        const subId   = insertWakeSubscription(db, {
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_stale_presence_out.json');
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Stale Presence Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('userDataDir bypasses the HarnessPresence freshness gate when a live process resolves (#12571)', async () => {
        const agentId     = '@test-agent-userdatadir-live';
        const userDataDir = '/Users/example/.claude-instances/test-live';
        const mainPid     = 47474;
        const subId       = insertWakeSubscription(db, {
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'userDataDir Live Wake'});
        await deliveryPromise;

        const args          = JSON.parse(fs.readFileSync(mockOutPath, 'utf8'));
        const scriptContent = args.filter((_, i) => args[i - 1] === '-e').join('\n');

        expect(scriptContent).toContain(`first process whose unix id is ${mainPid}`);
    });

    test('userDataDir still fails closed when no live process maps to the address (#12571)', async () => {
        const agentId     = '@test-agent-userdatadir-dead';
        const userDataDir = '/Users/example/.claude-instances/test-dead';
        const subId       = insertWakeSubscription(db, {
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'userDataDir Dead Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('freshness gate is NOT relaxed for non-userDataDir targets — pid + stale presence still refuses (#12571)', async () => {
        // Boundary guard: the freshness-veto exemption applies ONLY to userDataDir (where getInstancePid
        // is a live oracle). `pid` has no equivalent live-target proof, so a stale-presence pid wake
        // must still fail closed — proving the relaxation did not generalize beyond userDataDir.
        const agentId = '@test-agent-pid-boundary-stale';
        const subId   = insertWakeSubscription(db, {
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

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {agentId, subject: 'Stale Pid Boundary Wake'});
        await refusalPromise;

        expect(fs.existsSync(mockOutPath)).toBe(false);
    });

    test('addressType tmuxSession dispatch sends the digest to the instanceAddress session (#12422)', async () => {
        const agentId = '@test-agent-tmux-address';
        const subId   = insertWakeSubscription(db, {
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
        const mockOutPath  = path.join(DAEMON_DIR, 'mock_tmux_out.json');
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

        await waitForDaemonReady(daemonProcess);
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
        const subId   = insertWakeSubscription(db, {
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
        const mockOutPath  = path.join(DAEMON_DIR, 'mock_tmux_pure_heartbeat_out.json');
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
                const {port}  = server.address();
                const agentId = '@test-agent-webhook-address';
                const subId   = insertWakeSubscription(db, {
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
                    env  : { ...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS }
                });

                // out-waits: FAST_POLL_MS (50ms) — the stimulus lands inside the daemon's first poll cycles
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
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_failclosed_out.json');
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'normal',
                sentAt  : new Date().toISOString(),
                subject : 'Test Codex Event'
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
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_cleanup_out.json');
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

        await waitForDaemonReady(daemonProcess);

        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from    : '@sender',
                priority: 'normal',
                sentAt  : new Date().toISOString(),
                subject : 'Test Codex Cleanup'
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

        const rawArgs       = JSON.parse(fs.readFileSync(mockOutPath, 'utf-8'));
        const scriptContent = rawArgs.filter((_, i) => rawArgs[i - 1] === '-e').join('\n');

        const rIndex      = scriptContent.indexOf('keystroke "r"');
        const zIndex      = scriptContent.indexOf('keystroke "z" using command down');
        const aIndex      = scriptContent.indexOf('keystroke "a" using command down');
        const xIndex      = scriptContent.indexOf('keystroke "x" using command down');
        const pasteIndex  = scriptContent.indexOf('keystroke "v" using command down');
        const escapeIndex = scriptContent.indexOf('key code 53');
        const enterIndex  = scriptContent.indexOf('key code 36');

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
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_pure_heartbeat_out.json');
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
        const subId   = 'sub_' + crypto.randomUUID();
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
        const mockOutPath       = path.join(DAEMON_DIR, 'mock_codex_mixed_submit_out.json');
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

        await waitForDaemonReady(daemonProcess);

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
        expect(digest).toContain('message events');
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
        const totalItems     = SQLITE_IN_CLAUSE_BATCH_SIZE + overflowAmount;
        const ids            = new Set(Array.from({ length: totalItems }, (_, i) => `id_${i}`));

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

        await waitForDaemonReady(daemonProcess);

        // Sender broadcasts to AGENT:*: from === senderId, edge target === 'AGENT:*'.
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : senderId,
                sentAt : new Date().toISOString(),
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

        await waitForDaemonReady(daemonProcess);

        // Direct self-DM: from === agentId AND target === agentId (NOT AGENT:*).
        const msgId = 'msg_' + crypto.randomUUID();
        db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
            id        : msgId,
            label     : 'MESSAGE',
            properties: {
                from   : agentId,
                sentAt : new Date().toISOString(),
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

    test('delivers wake events via kimi-pull-bridge into the seat outbox without web contact (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-bridge';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-envelope.json');
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-outbox.jsonl');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_pull', cwd: '/seat/checkout', pid: process.pid, pidStartedAt: liveLstart(), agentIdentity: agentId, updatedAt: '2026-07-22T12:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-pull-bridge',
                envelopePath,
                outboxPath,
                coalesceWindow: 1
            }
        });

        // No lock/token/instance fixtures on purpose: the adapter must never consult web-server
        // coordinates. The mock osascript guards against any GUI fallback.
        const binDir               = path.join(DAEMON_DIR, 'bin');
        const mockOsascriptPath    = path.join(binDir, 'osascript');
        const mockOsascriptOutPath = path.join(DAEMON_DIR, 'mock_kimi_pull_osascript_out.json');

        fs.ensureDirSync(binDir);
        writeMockPs(binDir);
        fs.writeFileSync(mockOsascriptPath,
            `#!/usr/bin/env node\n` +
            `const fs = require('fs');\n` +
            `fs.writeFileSync(${JSON.stringify(mockOsascriptOutPath)}, JSON.stringify(process.argv.slice(2)));\n`
        );
        fs.chmodSync(mockOsascriptPath, 0o755);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
            }
        });

        const deliveryPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon failed to deliver kimi-pull-bridge digest within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes(`[Wake Dispatch] ${agentId}: outcome=delivered`)) {
                    clearTimeout(timeout);
                    resolve();
                }
                if (out.includes(`[Wake Daemon] Delivered ${subId} via osascript`)) {
                    clearTimeout(timeout);
                    reject(new Error('Daemon fell back to osascript for kimi-pull-bridge route'));
                }
            });
            daemonProcess.stderr.on('data', data => console.error('[DAEMON STDERR]', data.toString()));
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {
            agentId,
            subject: 'Kimi Pull Bridge Wake'
        });

        await deliveryPromise;

        const lines = fs.readFileSync(outboxPath, 'utf8').trim().split('\n');
        expect(lines.length).toBe(1);

        const entry = JSON.parse(lines[0]);
        expect(entry.wakeId).toMatch(/^[0-9a-f]{16}$/);
        expect(entry.subscriptionId).toBe(subId);
        expect(entry.agentIdentity).toBe(agentId);
        expect(entry.sessionId).toBe('ses_kimi_pull');
        expect(entry.processEpoch).toBe(process.pid);
        expect(entry.digest).toContain('Kimi Pull Bridge Wake');
        expect(entry.writtenAt).toBeTruthy();

        expect((fs.statSync(outboxPath).mode & 0o777).toString(8)).toBe('600');
        expect(fs.existsSync(mockOsascriptOutPath)).toBe(false);
        expect(stdoutLog).toContain(`[Wake Daemon] Queued ${subId} via kimi-pull-bridge (outbox ${outboxPath}, wake ${entry.wakeId}, owner ses_kimi_pull@${process.pid})`);
        expect(stdoutLog).toContain(`[Wake Dispatch] ${agentId}: outcome=delivered`);
        expect(stdoutLog).toContain('route=kimi-pull-bridge; adapterSource=metadata');
    });

    test('kimi-pull-bridge fails visibly without a wake envelope instead of retargeting (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-no-envelope';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-no-envelope.json'); // deliberately absent
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-no-envelope-outbox.jsonl');

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-pull-bridge',
                envelopePath,
                outboxPath,
                coalesceWindow: 1
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
            }
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log the kimi-pull-bridge envelope refusal within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes('kimi-pull-bridge requires a readable wake envelope')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            // The fail-visible path logs through the error stream; fold it into the same buffer.
            daemonProcess.stderr.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes('kimi-pull-bridge requires a readable wake envelope')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {
            agentId,
            subject: 'Kimi Pull Bridge No Envelope'
        });

        await refusalPromise;

        expect(fs.existsSync(outboxPath)).toBe(false);
        expect(stdoutLog).not.toContain(`Dispatched ${subId} via kimi-pull-bridge`);
    });

    test('kimi-pull-bridge refuses an envelope written for a different checkout cwd (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-cwd-mismatch';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-cwd-envelope.json');
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-cwd-outbox.jsonl');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_pull_cwd', cwd: '/other/checkout', pid: process.pid, updatedAt: '2026-07-22T12:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {
                adapter       : 'kimi-pull-bridge',
                cwd           : '/seat/checkout',
                envelopePath,
                outboxPath,
                coalesceWindow: 1
            }
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {
                ...process.env,
                NEO_MEMORY_DB_PATH              : DB_PATH,
                NEO_AI_DAEMON_DIR               : DAEMON_DIR,
                NEO_WAKE_DAEMON_POLL_INTERVAL_MS: FAST_POLL_MS,
                PATH                            : `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`
            }
        });

        const refusalPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Daemon did not log the kimi-pull-bridge cwd refusal within timeout')), 10000);

            daemonProcess.stdout.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes('does not match harnessTargetMetadata.cwd')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            // The fail-visible path logs through the error stream; fold it into the same buffer.
            daemonProcess.stderr.on('data', (data) => {
                const out = data.toString();
                stdoutLog += out;
                if (out.includes('does not match harnessTargetMetadata.cwd')) {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            daemonProcess.on('error', reject);
        });

        await waitForDaemonReady(daemonProcess);
        insertMessageWake(db, {
            agentId,
            subject: 'Kimi Pull Bridge Cwd Mismatch'
        });

        await refusalPromise;

        expect(fs.existsSync(outboxPath)).toBe(false);
        expect(stdoutLog).not.toContain(`Dispatched ${subId} via kimi-pull-bridge`);
    });

    test('kimi-pull-bridge fails closed on a dead owner process epoch (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-dead-epoch';

        // A guaranteed-dead pid: spawn + immediately exit a child, then reuse its pid.
        const deadPid      = spawnSync(process.execPath, ['-e', '']).pid;
        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-dead-envelope.json');
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-dead-outbox.jsonl');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_dead', cwd: '/seat/checkout', pid: deadPid, pidStartedAt: liveLstart(), agentIdentity: agentId, updatedAt: '2026-07-22T12:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {adapter: 'kimi-pull-bridge', envelopePath, outboxPath, coalesceWindow: 1}
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, PATH: `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`}
        });
        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        // The fail-visible path logs through the error stream; fold it into the same buffer.
        daemonProcess.stderr.on('data', data => stdoutLog += data.toString());

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Kimi Pull Bridge Dead Epoch'});
        await new Promise(resolve => setTimeout(resolve, 4000));

        expect(stdoutLog).toContain('dead owner process');
        expect(fs.existsSync(outboxPath)).toBe(false);
        expect(stdoutLog).not.toContain(`Queued ${subId} via kimi-pull-bridge`);
    });

    test('kimi-pull-bridge repairs a permissive existing outbox to 0600 (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-mode-repair';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-repair-envelope.json');
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-repair-outbox.jsonl');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_repair', cwd: '/seat/checkout', pid: process.pid, pidStartedAt: liveLstart(), agentIdentity: agentId, updatedAt: '2026-07-22T12:00:00.000Z'});
        fs.writeFileSync(outboxPath, '', {mode: 0o644});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {adapter: 'kimi-pull-bridge', envelopePath, outboxPath, coalesceWindow: 1}
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, PATH: `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`}
        });
        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        daemonProcess.stderr.on('data', data => stdoutLog += data.toString());

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Kimi Pull Bridge Mode Repair'});
        await new Promise(resolve => setTimeout(resolve, 4000));

        expect((fs.statSync(outboxPath).mode & 0o777).toString(8)).toBe('600');
        expect(stdoutLog).toContain('Repaired wake outbox permissions to 0600');
        expect(fs.readFileSync(outboxPath, 'utf8')).toContain('Kimi Pull Bridge Mode Repair');
    });

    test('kimi-pull-bridge refuses an outboxPath that escapes the seat home (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-escape';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-escape-envelope.json');
        const outboxPath   = path.join(os.tmpdir(), `kimi-pull-escape-${crypto.randomUUID()}.jsonl`);
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_escape', cwd: '/seat/checkout', pid: process.pid, pidStartedAt: liveLstart(), agentIdentity: agentId, updatedAt: '2026-07-22T12:00:00.000Z'});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {adapter: 'kimi-pull-bridge', envelopePath, outboxPath, coalesceWindow: 1}
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, PATH: `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`}
        });
        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        // The fail-visible path logs through the error stream; fold it into the same buffer.
        daemonProcess.stderr.on('data', data => stdoutLog += data.toString());

        await new Promise(resolve => setTimeout(resolve, 1000));
        insertMessageWake(db, {agentId, subject: 'Kimi Pull Bridge Escape'});
        await new Promise(resolve => setTimeout(resolve, 4000));

        expect(stdoutLog).toContain('escapes the seat home');
        expect(fs.existsSync(outboxPath)).toBe(false);
        expect(stdoutLog).not.toContain(`Queued ${subId} via kimi-pull-bridge`);
    });

    test('an append landing mid-consume survives via the shared append lock (#15665)', async () => {
        const subId   = 'sub_' + crypto.randomUUID();
        const agentId = '@test-agent-kimi-pull-race';

        const envelopePath = path.join(DAEMON_DIR, 'kimi-pull-race-envelope.json');
        const outboxPath   = path.join(DAEMON_DIR, 'kimi-pull-race-outbox.jsonl');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_kimi_race', cwd: '/seat/checkout', pid: process.pid, pidStartedAt: liveLstart(), agentIdentity: agentId, updatedAt: '2026-07-22T12:00:00.000Z'});
        fs.writeFileSync(outboxPath, JSON.stringify({wakeId: 'preexisting', digest: 'stale pre-consume entry'}) + '\n', {mode: 0o600});

        insertWakeSubscription(db, {
            subId,
            agentId,
            harnessTargetMetadata: {adapter: 'kimi-pull-bridge', envelopePath, outboxPath, coalesceWindow: 1}
        });

        const binDir = path.join(DAEMON_DIR, 'bin');
        fs.ensureDirSync(binDir);
        writeMockPs(binDir);

        let stdoutLog = '';

        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, PATH: `${path.resolve(binDir)}${path.delimiter}${process.env.PATH}`}
        });
        daemonProcess.stdout.on('data', data => stdoutLog += data.toString());
        daemonProcess.stderr.on('data', data => stdoutLog += data.toString());

        // The adversarial interleave the contract exists for: the consumer holds the lock for its
        // compact WHILE the daemon's first flush attempt lands in the same window — held for 2.6s,
        // past the borrowed WAL helper's 2s TTL that previously let a producer reclaim a live
        // consumer. Under the strict lock the append must wait out the full hold and land after
        // it — never be erased by a stale snapshot rewrite.
        // (The 1s warmup matches the sibling specs: inserting after tail-sync, so the wake is
        // evaluated as genuinely new rather than folded into the boot backlog.)
        await new Promise(resolve => setTimeout(resolve, 1000));

        await withOutboxLock(outboxPath, async () => {
            insertMessageWake(db, {agentId, subject: 'Wake Landing Mid-Consume'});

            await new Promise(resolve => setTimeout(resolve, 2600));

            const heldLines = fs.readFileSync(outboxPath, 'utf8').trim().split('\n').filter(Boolean);
            expect(heldLines.length).toBe(1);
            expect(heldLines[0]).toContain('stale pre-consume entry');

            fs.writeFileSync(outboxPath, '', {mode: 0o600});
        });

        let survivingLines = [];

        for (let attempt = 0; attempt < 20; attempt++) {
            survivingLines = fs.existsSync(outboxPath)
                ? fs.readFileSync(outboxPath, 'utf8').trim().split('\n').filter(Boolean)
                : [];

            if (survivingLines.length > 0) break;

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (survivingLines.length !== 1) console.log('--- RACE DEBUG daemon log tail ---\n' + stdoutLog.slice(-3000));

        expect(survivingLines.length).toBe(1);
        expect(survivingLines[0]).toContain('Wake Landing Mid-Consume');
    });
});
