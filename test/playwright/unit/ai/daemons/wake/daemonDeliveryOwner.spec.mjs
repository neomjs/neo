import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Database       from 'better-sqlite3';
import {spawn}        from 'child_process';
import crypto         from 'crypto';
import http           from 'http';
import os             from 'os';

/**
 * @summary Mounted composition witnesses for the wake daemon's atomic delivery owner — the
 * discriminating tests the pure policy arithmetic cannot provide.
 *
 * Each witness drives the SPAWNED daemon against a controllable local webhook and pins one
 * composition behavior a direct falsifier previously disproved:
 * 1. **In-flight ownership + flush-time refractory:** an event arriving while a delivery is
 *    unresolved neither dispatches behind it nor back-to-back after it — it lands as the NEXT
 *    refractory-spaced digest, with zero loss and zero overlap.
 * 2. **Retry union without loss:** an event merged while a delivery-retry is pending rides ONE
 *    union digest when the target recovers — and the retry's success emits the same countable
 *    dispatch record as the direct path.
 * 3. **The hard cap cuts through a still-rolling stream:** continuous arrivals keep re-arming the
 *    window, and the cap (env-shortened via the daemon's constant-override idiom) still forces a
 *    digest out before the stream quiets.
 * 4. **A fail-closed skip counts nothing:** a refused route emits its refusal log and NO
 *    `[Wake Dispatch]` record — the counting surface stays truthful.
 *
 * Timing assertions use generous slack: these witnesses discriminate ORDER, COUNT, and
 * presence/absence of records; exact spacing stays pinned at the policy tier.
 */
function insertAgent(db, agentId) {
    db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)').run(agentId, JSON.stringify({
        id: agentId, label: 'AGENT', properties: {name: agentId}
    }));
}

function insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata}) {
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
}

function insertHarnessPresence(db, {subId, agentId}) {
    const presenceId = 'presence_' + crypto.randomUUID();
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
            lastSeenAt    : new Date().toISOString(),
            status        : 'active'
        }
    }));
}

function insertMessageWake(db, {agentId, subject}) {
    const msgId = 'msg_' + crypto.randomUUID();
    db.prepare('INSERT INTO Nodes (id, data) VALUES (?, ?)').run(msgId, JSON.stringify({
        id        : msgId,
        label     : 'MESSAGE',
        properties: {from: '@sender', priority: 'normal', subject, sentAt: new Date().toISOString(), to: agentId}
    }));
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(msgId, 'nodes');

    const edgeId = 'edge_' + crypto.randomUUID();
    db.prepare('INSERT INTO Edges (id, data, source, target, type) VALUES (?, ?, ?, ?, ?)').run(edgeId, JSON.stringify({
        id: edgeId, source: msgId, target: agentId, type: 'SENT_TO'
    }), msgId, agentId, 'SENT_TO');
    db.prepare('INSERT INTO GraphLog (entity_id, entity_type) VALUES (?, ?)').run(edgeId, 'edges');
}

test.describe('Wake Daemon — atomic delivery owner (mounted composition witnesses)', () => {
    let db, daemonProcess, DB_PATH, DAEMON_DIR;

    test.beforeEach(() => {
        const testId = crypto.randomUUID().substring(0, 8);
        DB_PATH    = path.join(os.tmpdir(), 'neo-test-daemon', `test-owner-${testId}.sqlite`);
        DAEMON_DIR = path.join(os.tmpdir(), `neo-wake-owner-test-${testId}`);

        fs.ensureDirSync(path.dirname(DB_PATH));
        fs.ensureDirSync(DAEMON_DIR);
        process.env.NEO_MEMORY_DB_PATH_TEST = DB_PATH;

        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.exec(`
            CREATE TABLE IF NOT EXISTS Nodes (id TEXT PRIMARY KEY, data TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS Edges (id TEXT PRIMARY KEY, data TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, type TEXT NOT NULL, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS GraphLog (log_id INTEGER PRIMARY KEY AUTOINCREMENT, entity_id TEXT NOT NULL, entity_type TEXT NOT NULL, event_id TEXT, event_payload TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
        `);
    });

    test.afterEach(() => {
        daemonProcess?.kill('SIGKILL');
        daemonProcess = null;
        db?.close();
        db = null;
        fs.removeSync(path.dirname(DB_PATH));
        fs.removeSync(DAEMON_DIR);
        delete process.env.NEO_MEMORY_DB_PATH_TEST;
    });

    const spawnDaemon = (envOverrides = {}) => {
        daemonProcess = spawn('node', ['ai/daemons/wake/daemon.mjs'], {
            stdio: 'pipe',
            env  : {...process.env, NEO_MEMORY_DB_PATH: DB_PATH, NEO_AI_DAEMON_DIR: DAEMON_DIR, ...envOverrides}
        });
        return daemonProcess;
    };

    const readLog = () => {
        const logFile = path.join(DAEMON_DIR, 'wake-daemon.log');
        return fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    test('W1 — in-flight ownership: an event during an unresolved delivery lands as the NEXT refractory-spaced digest — no overlap, no back-to-back, no loss', async () => {
        test.setTimeout(30000);

        const requests  = [];
        let   holdFirst = true;

        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', async () => {
                const arrivedAt = Date.now();
                if (holdFirst) {
                    holdFirst = false;
                    await sleep(2500);              // hold the FIRST delivery open
                }
                requests.push({arrivedAt, body, respondedAt: Date.now()});
                res.writeHead(204);
                res.end();
            });
        });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const {port} = server.address();

        const agentId = '@owner-test-inflight', subId = 'sub_' + crypto.randomUUID();
        insertAgent(db, agentId);
        insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata: {
            adapter        : 'tmux', addressType: 'webhookUrl', coalesceWindow: 1,
            instanceAddress: `http://127.0.0.1:${port}/wake`
        }});
        insertHarnessPresence(db, {subId, agentId});

        spawnDaemon({NEO_WAKE_FLUSH_REFRACTORY_SECONDS: '4'});
        await sleep(1000);

        insertMessageWake(db, {agentId, subject: 'FIRST-DIGEST-MSG'});
        // inject the second message while the first delivery is guaranteed unresolved
        await sleep(4500);
        insertMessageWake(db, {agentId, subject: 'SECOND-DIGEST-MSG'});

        // wait until both digests delivered (poll the request ledger)
        for (let i = 0; i < 40 && requests.length < 2; i++) await sleep(500);
        server.close();

        expect(requests, 'both messages must arrive — zero loss').toHaveLength(2);
        expect(requests[0].body).toContain('FIRST-DIGEST-MSG');
        expect(requests[0].body).not.toContain('SECOND-DIGEST-MSG');
        expect(requests[1].body).toContain('SECOND-DIGEST-MSG');
        expect(requests[1].body).not.toContain('FIRST-DIGEST-MSG');
        // no overlap: the second request only arrives after the first RESPONDED
        expect(requests[1].arrivedAt).toBeGreaterThan(requests[0].respondedAt);
        // no back-to-back double prompt: the refractory (4s, env-shortened) spaces the digests
        expect(requests[1].arrivedAt - requests[0].respondedAt).toBeGreaterThan(2500);

        const dispatchLines = readLog().match(/\[Wake Dispatch\].*outcome=delivered/g) || [];
        expect(dispatchLines, 'exactly two countable dispatch records').toHaveLength(2)
    });

    test('W2 — retry union: an event merged while a retry is pending rides ONE union digest on recovery, and the retry success COUNTS', async () => {
        test.setTimeout(45000);

        const requests = [];

        // Fail the first THREE attempts: after the second failed RETRY the linear backoff is
        // attempts × poll interval = 6s — the window that deterministically fits the mid-retry
        // injection below (message poll pickup + its 1s flush) while the entry is still pending,
        // forcing the merge path. (After only one failed retry the backoff is a single poll
        // interval — the injection cannot reliably beat it.)
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                requests.push({body, at: Date.now()});
                res.writeHead(requests.length <= 3 ? 500 : 204);
                res.end();
            });
        });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const {port} = server.address();

        const agentId = '@owner-test-retry-union', subId = 'sub_' + crypto.randomUUID();
        insertAgent(db, agentId);
        insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata: {
            adapter        : 'tmux', addressType: 'webhookUrl', coalesceWindow: 1,
            instanceAddress: `http://127.0.0.1:${port}/wake`
        }});
        insertHarnessPresence(db, {subId, agentId});

        spawnDaemon();
        await sleep(1000);

        insertMessageWake(db, {agentId, subject: 'FAILED-THEN-RETRIED-MSG'});

        // wait for the THIRD failed attempt, then inject inside its 6s backoff window — the flush
        // for this message must find the retry entry still pending and MERGE
        for (let i = 0; i < 60 && requests.length < 3; i++) await sleep(500);
        expect(requests.length, 'three failed attempts observed').toBeGreaterThanOrEqual(3);
        insertMessageWake(db, {agentId, subject: 'MERGED-INTO-RETRY-MSG'});

        for (let i = 0; i < 30 && !requests.some(r => r.body.includes('MERGED-INTO-RETRY-MSG')); i++) await sleep(500);
        // allow one more poll cycle so a (defective) separate second dispatch would surface
        await sleep(3000);
        server.close();

        if (!requests.some(r => r.body.includes('MERGED-INTO-RETRY-MSG'))) {
            // failure diagnostic: the daemon's own decision trail (the log dies with afterEach)
            console.log('W2 DIAGNOSTIC — daemon log tail:\n' + readLog().split('\n').slice(-30).join('\n'));
            console.log('W2 DIAGNOSTIC — request bodies:', JSON.stringify(requests.map(r => r.body)));
        }

        const successBodies = requests.slice(3);
        // the union digest: ONE successful request counting BOTH messages (the digest format
        // carries the count + the LATEST subject, not every subject)
        const unionRequest = successBodies.find(r => r.body.includes('MERGED-INTO-RETRY-MSG'));
        expect(unionRequest, 'the merged message must be delivered — zero loss').toBeTruthy();
        expect(unionRequest.body, 'ONE union digest carrying both messages').toMatch(/2 events for @owner-test-retry-union/);
        expect(unionRequest.body).toMatch(/2 message events/);
        expect(successBodies, 'exactly one delivery — never a separate second block').toHaveLength(1);

        const log           = readLog();
        const retryDispatch = log.match(/\[Wake Dispatch\].*outcome=delivered.*via=retry/g) || [];
        expect(retryDispatch.length, 'the retry success emits the countable dispatch record').toBeGreaterThanOrEqual(1)
    });

    test('W3 — the hard cap cuts through a still-rolling stream: continuous arrivals cannot postpone the digest past the cap', async () => {
        test.setTimeout(30000);

        const requests = [];
        const server   = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                requests.push({body, at: Date.now()});
                res.writeHead(204);
                res.end();
            });
        });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const {port} = server.address();

        const agentId = '@owner-test-cap', subId = 'sub_' + crypto.randomUUID();
        insertAgent(db, agentId);
        insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata: {
            adapter        : 'tmux', addressType: 'webhookUrl', coalesceWindow: 3,
            instanceAddress: `http://127.0.0.1:${port}/wake`
        }});
        insertHarnessPresence(db, {subId, agentId});

        // 4s cap (env-shortened): a 3s rolling window re-armed by a continuous stream would
        // otherwise flush only after the stream quiets
        spawnDaemon({NEO_WAKE_FLUSH_HARD_CAP_SECONDS: '4'});
        await sleep(1000);

        const streamEndsAt = Date.now() + 9000;
        const injector     = setInterval(() => {
            if (Date.now() >= streamEndsAt) return clearInterval(injector);
            insertMessageWake(db, {agentId, subject: 'STREAM-MSG-' + crypto.randomUUID().slice(0, 6)});
        }, 1500);

        for (let i = 0; i < 40 && requests.length === 0; i++) await sleep(500);
        clearInterval(injector);
        const firstArrival = requests[0]?.at;
        await sleep(1000);
        server.close();

        expect(requests.length, 'the cap forces a digest out').toBeGreaterThanOrEqual(1);
        // THE discriminator: the first digest arrived while the stream was still injecting —
        // rolling-without-cap would have waited for quiet (stream end + window)
        expect(firstArrival, 'digest arrived before the stream quieted — the cap fired').toBeLessThan(streamEndsAt);
        expect(requests[0].body).toMatch(/\d+ events for @owner-test-cap/)
    });

    test('W5 — a HUNG adapter cannot starve the queue: the attempt bound resolves it as failed, and the merged follow-up delivers as ONE union on retry', async () => {
        test.setTimeout(45000);

        const requests  = [];
        let   hangFirst = true;

        // request 1 NEVER responds (the hung-transport falsifier — respondedAt stays null);
        // every later request 204s. The ledger separates ARRIVED from RESPONDED: a hung
        // request must never satisfy a delivery assertion.
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c.toString());
            req.on('end', () => {
                const entry = {body, at: Date.now(), respondedAt: null};
                requests.push(entry);
                if (hangFirst) {
                    hangFirst = false;
                    return;                         // hold forever — the abort closes the socket
                }
                res.writeHead(204);
                res.end();
                entry.respondedAt = Date.now();
            });
        });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const {port} = server.address();

        const agentId = '@owner-test-hung', subId = 'sub_' + crypto.randomUUID();
        insertAgent(db, agentId);
        insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata: {
            adapter        : 'tmux', addressType: 'webhookUrl', coalesceWindow: 1,
            instanceAddress: `http://127.0.0.1:${port}/wake`
        }});
        insertHarnessPresence(db, {subId, agentId});

        spawnDaemon({NEO_WAKE_ATTEMPT_TIMEOUT_SECONDS: '3'});
        await sleep(1000);

        insertMessageWake(db, {agentId, subject: 'HUNG-ATTEMPT-MSG'});

        // inject ONLY once the first attempt is observably in flight (its request arrived and is
        // hanging) — previously this second message starved forever behind the in-flight
        // reservation; now the 3s attempt bound fails the hang, the flush merges into the
        // pending retry, and the union delivers on the recovered route
        for (let i = 0; i < 30 && requests.length < 1; i++) await sleep(500);
        expect(requests.length, 'the first attempt is in flight').toBeGreaterThanOrEqual(1);
        insertMessageWake(db, {agentId, subject: 'QUEUED-BEHIND-HANG-MSG'});

        for (let i = 0; i < 50 && !requests.some(r => r.respondedAt && r.body.includes('QUEUED-BEHIND-HANG-MSG')); i++) await sleep(500);
        server.close();

        expect(requests[0].respondedAt, 'the first request genuinely hung').toBeNull();
        const delivered = requests.filter(r => r.respondedAt && r.body.includes('QUEUED-BEHIND-HANG-MSG'));
        expect(delivered.length, 'the queue survived the hang — the second message delivered').toBeGreaterThanOrEqual(1);
        expect(delivered[0].body, 'ONE union digest with both messages').toMatch(/2 events for @owner-test-hung/);

        const log = readLog();
        expect(log, 'the bound resolved the hang as a failed attempt').toContain('exceeded 3000ms');
        expect(log.match(/\[Wake Dispatch\].*outcome=delivered/g), 'exactly one countable delivery').toHaveLength(1)
    });

    test('W4 — a fail-closed skip counts NOTHING: refused route, zero dispatch records', async () => {
        test.setTimeout(20000);

        const agentId = '@owner-test-skip', subId = 'sub_' + crypto.randomUUID();
        insertAgent(db, agentId);
        // unknown adapter → the explicit 'skipped' outcome (previously fell through as delivered)
        insertWakeSubscription(db, {subId, agentId, harnessTargetMetadata: {
            adapter: 'no-such-adapter', coalesceWindow: 1
        }});
        insertHarnessPresence(db, {subId, agentId});

        spawnDaemon();
        await sleep(1000);
        insertMessageWake(db, {agentId, subject: 'SKIPPED-MSG'});

        let log = '';
        for (let i = 0; i < 30; i++) {
            await sleep(500);
            log = readLog();
            if (log.includes("Unknown adapter 'no-such-adapter'")) break;
        }
        await sleep(2000);  // window for a (defective) dispatch record to surface
        log = readLog();

        expect(log, 'the refusal is logged').toContain("Unknown adapter 'no-such-adapter'");
        expect(log.match(/\[Wake Dispatch\]/g), 'a skip must never count as a dispatch').toBeNull()
    });
});
