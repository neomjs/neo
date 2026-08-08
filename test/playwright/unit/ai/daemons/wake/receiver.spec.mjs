import {test, expect} from '@playwright/test';
import crypto         from 'node:crypto';
import fs             from 'node:fs/promises';
import net            from 'node:net';
import os             from 'node:os';
import path           from 'node:path';

import {
    createWakeReceiver,
    loadWakeReceiverManifest,
    parseWakeReceiverArgs,
    startWakeReceiver,
    verifyWakeSignature
} from '../../../../../../ai/daemons/wake/receiver.mjs';
import {WakeReceiverState} from '../../../../../../ai/daemons/wake/receiverState.mjs';

test.describe('ai/daemons/wake/receiver', () => {
    const subscriptionId = 'WAKE_SUB:test';
    const signingKey     = 'a'.repeat(64);
    const agentIdentity  = '@neo-gpt';
    const manifest       = {
        schemaVersion: 1,
        routes       : {
            [subscriptionId]: {
                signingKey,
                agentIdentity,
                harnessTargetMetadata: {adapter: 'tmux', tmuxSession: 'test'},
                adapterConfig        : {attemptTimeoutMs: 100}
            }
        }
    };

    let baseUrl, dispatchCalls, dispatchResult, receiver, server, state, stateDir;

    test.beforeEach(async () => {
        stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-receiver-'));
        state    = new WakeReceiverState({stateDir});
        await state.init();
        dispatchCalls  = [];
        // Adapters may end with a bare outcome string or `{outcome, outcomeReason}`; tests select
        // the shape under test rather than each building a receiver of their own.
        dispatchResult = 'delivered';
        receiver = createWakeReceiver({
            manifest,
            state,
            dispatch: async record => {
                dispatchCalls.push(record);
                return dispatchResult;
            },
            logger: {error() {}, warn() {}, log() {}}
        });
        server = receiver.server;
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    test.afterEach(async () => {
        await new Promise(resolve => server.close(resolve));
        await fs.rm(stateDir, {recursive: true, force: true});
    });

    const buildEnvelope = (overrides = {}) => ({
        schemaVersion: '1.0',
        eventType    : 'wake/digest',
        eventId      : 'wake-digest:event-1',
        subscriptionId,
        agentIdentity,
        payload      : {
            totalEvents   : 1,
            sourceEventIds: ['MESSAGE:1'],
            breakdown     : {
                sent_to_me: {count: 1, latest: {messageId: 'MESSAGE:1', subject: 'hello'}}
            }
        },
        emittedAt: new Date().toISOString(),
        ...overrides
    });

    async function postWake({envelope = buildEnvelope(), signature, headers = {}} = {}) {
        const body = JSON.stringify(envelope);
        const hmac = signature ?? crypto.createHmac('sha256', signingKey).update(body).digest('hex');

        return fetch(`${baseUrl}/wake`, {
            method : 'POST',
            headers: {
                'content-type'              : 'application/json',
                'x-neo-wake-event-id'       : envelope.eventId,
                'x-neo-wake-subscription-id': subscriptionId,
                'x-neo-wake-schema-version' : '1.0',
                'x-neo-wake-signature'      : hmac,
                ...headers
            },
            body
        });
    }

    async function waitForState(expected) {
        for (let index = 0; index < 50; index++) {
            const records = await state.list(expected);
            if (records.length > 0) return records;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        return [];
    }

    test('verifies HMAC over the exact raw request bytes', () => {
        const body      = Buffer.from('{"eventId":"one"}');
        const signature = crypto.createHmac('sha256', signingKey).update(body).digest('hex');

        expect(verifyWakeSignature(body, signingKey, signature)).toBe(true);
        expect(verifyWakeSignature(Buffer.from('{"eventId":"two"}'), signingKey, signature)).toBe(false);
        expect(verifyWakeSignature(body, signingKey, 'not-hex')).toBe(false);
    });

    test('invalid signatures return non-success and create no state or dispatch', async () => {
        const response = await postWake({signature: '0'.repeat(64)});

        expect(response.status).toBe(401);
        expect(await state.list()).toEqual([]);
        expect(dispatchCalls).toEqual([]);
    });

    test('persists before 2xx, drains once, and dedupes a webhook retry', async () => {
        const first = await postWake();

        expect(first.status).toBe(202);
        expect(await first.json()).toMatchObject({status: 'accepted'});
        expect(await waitForState('delivered')).toHaveLength(1);

        const second = await postWake();
        expect(second.status).toBe(200);
        expect(await second.json()).toMatchObject({status: 'duplicate'});
        expect(dispatchCalls).toHaveLength(1);
        expect((await state.list())[0].route).not.toHaveProperty('signingKey');
    });

    test('a terminal adapter failure persists the reason it reported (#16259)', async () => {
        dispatchResult = {outcome: 'failed', outcomeReason: 'kTCCServicePostEvent denied (-1743)'};

        expect((await postWake()).status).toBe(202);

        const [record] = await waitForState('failed');

        // Read the DURABLE record, not the log. A receiver run under launchd writes stdout nowhere
        // an operator reads, so a failure whose cause exists only in a log line has no cause at all.
        expect(record.outcomeReason).toBe('kTCCServicePostEvent denied (-1743)');
    });

    test('a bare outcome string still terminalizes and carries no invented reason (#16259)', async () => {
        dispatchResult = 'failed';

        expect((await postWake()).status).toBe(202);

        const [record] = await waitForState('failed');

        // The reason channel is additive. A string-returning adapter must not acquire a fabricated
        // reason, and must not be misread as an invalid outcome by the object-handling branch.
        expect(record).not.toHaveProperty('outcomeReason');
    });

    test('an adapter returning a reason with an unknown outcome still fails closed (#16259)', async () => {
        dispatchResult = {outcome: 'nonsense', outcomeReason: 'ignored'};

        expect((await postWake()).status).toBe(202);

        const [record] = await waitForState('failed');

        // The invalid-outcome guard must win over the adapter-supplied reason, otherwise a typo'd
        // outcome would land as a terminal state nobody validated.
        expect(record.outcomeReason).toBe('invalid-adapter-outcome:nonsense');
    });

    test('signed header/body route mismatches fail before acceptance', async () => {
        const response = await postWake({
            envelope: buildEnvelope({agentIdentity: '@neo-opus-vega'})
        });

        expect(response.status).toBe(409);
        expect(await state.list()).toEqual([]);
    });

    test('signed schema header/body mismatches fail before acceptance', async () => {
        const response = await postWake({
            headers: {'x-neo-wake-schema-version': '2.0'}
        });

        expect(response.status).toBe(409);
        expect(await state.list()).toEqual([]);
    });

    test('startup-style drain replays durable pending work accepted before dispatch', async () => {
        const envelope = buildEnvelope();
        await state.accept({
            subscriptionId,
            eventId       : envelope.eventId,
            sourceEventIds: envelope.payload.sourceEventIds,
            envelope,
            route         : {
                agentIdentity,
                harnessTargetMetadata: {adapter: 'test'},
                adapterConfig        : {attemptTimeoutMs: 100}
            }
        });

        await receiver.drain();
        expect(await state.list('delivered')).toHaveLength(1);
        expect(dispatchCalls).toHaveLength(1);
    });

    test('loads only a 0600 manifest with explicit route attempt policy', async () => {
        const manifestPath = path.join(stateDir, 'routes.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest), {mode: 0o600});

        expect(await loadWakeReceiverManifest(manifestPath)).toEqual(manifest);
        await fs.chmod(manifestPath, 0o644);
        await expect(loadWakeReceiverManifest(manifestPath)).rejects.toThrow('must be mode 0600');
    });

    test('an OpenCode osascript route passes manifest validation (#16279)', async () => {
        const manifestPath = path.join(stateDir, 'opencode-routes.json');
        const valid        = structuredClone(manifest);

        valid.routes[subscriptionId].harnessTargetMetadata = {
            adapter        : 'osascript',
            appName        : 'OpenCode',
            addressType    : 'userDataDir',
            instanceAddress: '/seat/ai.opencode.desktop'
        };

        await fs.writeFile(manifestPath, JSON.stringify(valid), {mode: 0o600});

        expect(await loadWakeReceiverManifest(manifestPath)).toEqual(valid);
    });

    test('rejects test adapters and incomplete production routes in a disk manifest', async () => {
        const manifestPath = path.join(stateDir, 'invalid-routes.json');
        const invalid      = structuredClone(manifest);
        invalid.routes[subscriptionId].harnessTargetMetadata = {adapter: 'test'};
        await fs.writeFile(manifestPath, JSON.stringify(invalid), {mode: 0o600});

        await expect(loadWakeReceiverManifest(manifestPath)).rejects.toThrow('unsupported production adapter');

        invalid.routes[subscriptionId].harnessTargetMetadata = {adapter: 'tmux'};
        await fs.writeFile(manifestPath, JSON.stringify(invalid), {mode: 0o600});
        await expect(loadWakeReceiverManifest(manifestPath)).rejects.toThrow('explicit tmux session');

        invalid.routes[subscriptionId].harnessTargetMetadata = {
            adapter        : 'tmux',
            addressType    : 'webhookUrl',
            instanceAddress: 'http://192.0.2.1:9123/wake'
        };
        await fs.writeFile(manifestPath, JSON.stringify(invalid), {mode: 0o600});
        await expect(loadWakeReceiverManifest(manifestPath)).rejects.toThrow('webhookUrl must stay loopback-only');
    });

    test('parses the listener bind as an explicit CLI value', () => {
        expect(parseWakeReceiverArgs([
            '--manifest', '/tmp/routes.json',
            '--state-dir', '/tmp/state',
            '--host', '0.0.0.0',
            '--port', '3199'
        ])).toEqual({
            manifestPath: '/tmp/routes.json',
            stateDir    : '/tmp/state',
            host        : '0.0.0.0',
            port        : 3199
        });
    });
});

test.describe('ai/daemons/wake/receiver — manifest reload', () => {
    const signingKey = 'a'.repeat(64);
    const mine       = 'WAKE_SUB:mine';
    const peer       = 'WAKE_SUB:peer';
    const third      = 'WAKE_SUB:third';

    const route = agentIdentity => ({
        signingKey,
        agentIdentity,
        harnessTargetMetadata: {adapter: 'tmux', tmuxSession: 'test'},
        adapterConfig        : {attemptTimeoutMs: 100}
    });

    const write = async (routes, mode = 0o600) => {
        await fs.writeFile(manifestPath, JSON.stringify({schemaVersion: 1, routes}), {mode});
        await fs.chmod(manifestPath, mode);
    };

    // `startWakeReceiver` requires an explicit integer port in 1..65535 — deliberately, so a real
    // deployment cannot bind an arbitrary one. Borrow a free port rather than weakening that guard.
    const freePort = async () => {
        const probe = net.createServer();

        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));

        const {port} = probe.address();

        await new Promise(resolve => probe.close(resolve));

        return port
    };

    let dir, manifestPath, receiver;

    test.beforeEach(async () => {
        dir          = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-reload-'));
        manifestPath = path.join(dir, 'routes.json');

        await write({[mine]: route('@neo-opus-ada')});

        // A short sweep so the periodic trigger can be asserted as itself. The production default is
        // measured in tens of seconds; injecting it is what lets a spec prove the real timer fires
        // rather than calling the reload helper by hand and claiming the timer was covered.
        receiver = await startWakeReceiver({
            manifestPath,
            stateDir           : path.join(dir, 'state'),
            host               : '127.0.0.1',
            port               : await freePort(),
            logger             : {error() {}, warn() {}, log() {}},
            reconcileIntervalMs: 40
        });
    });

    test.afterEach(async () => {
        receiver.stopWatchingManifest?.();
        await new Promise(resolve => receiver.server.close(resolve));
        await fs.rm(dir, {recursive: true, force: true});
    });

    /**
     * Polls until the predicate holds. Watch latency is a property of the platform, not of the code
     * under test, so a spec that asserts once after a fixed sleep measures the sleep.
     * @param {Function} predicate
     * @param {Number} [timeoutMs=4000]
     * @returns {Promise<Boolean>}
     */
    const waitFor = async (predicate, timeoutMs = 4000) => {
        const deadline = Date.now() + timeoutMs;

        while (Date.now() < deadline) {
            if (await predicate()) return true;
            await new Promise(resolve => setTimeout(resolve, 25));
        }

        return false
    };

    // A forged signature separates the two states and needs no key: a route the process holds reaches
    // the signature gate (401); one it does not know is rejected earlier (404).
    const probe = async subscriptionId => (await fetch(
        `http://127.0.0.1:${receiver.server.address().port}/wake`,
        {
            method : 'POST',
            headers: {
                'content-type'              : 'application/json',
                'x-neo-wake-subscription-id': subscriptionId,
                'x-neo-wake-schema-version' : '1.0',
                'x-neo-wake-signature'      : 'deadbeef'
            },
            body: '{}'
        }
    )).status;

    test('a route published while the process is running serves without a restart', async () => {
        expect(await probe(mine)).toBe(401);
        expect(await probe(peer)).toBe(404);

        // What a peer's generator run does: compose additively onto the published file.
        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-gpt-emmy')});

        expect(await receiver.reload()).toBe(2);
        expect(await probe(peer)).toBe(401);
        expect(await probe(mine)).toBe(401);
    });

    test('a manifest the loader would reject leaves the serving routes untouched', async () => {
        await fs.writeFile(manifestPath, '{ this is not json', {mode: 0o600});

        // Refused rather than adopted, and reported rather than silent.
        expect(await receiver.reload()).toBe(null);

        // The live route must survive a bad reload. A stale receiver is recoverable; an emptied one is
        // a second incident stacked on the first.
        expect(await probe(mine)).toBe(401);
    });

    test('the reload path cannot serve routes the boot path would have refused', async () => {
        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-gpt-emmy')}, 0o644);

        expect(await receiver.reload()).toBe(null);

        // Positive control: the same content at 0600 IS adopted, so the refusal above is the mode and
        // not an unrelated rejection.
        expect(await probe(peer)).toBe(404);
        await fs.chmod(manifestPath, 0o600);
        expect(await receiver.reload()).toBe(2);
        expect(await probe(peer)).toBe(401);
    });

    test('a published route goes live with NO signal, restart, or reload() call', async () => {
        // The headline: nothing external happens after the write. Previously the file said two routes
        // and the process served one, with no surface reporting the discrepancy — a published route was
        // silently undeliverable until someone remembered to signal.
        expect(await probe(peer)).toBe(404);

        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace')});

        expect(await waitFor(async () => await probe(peer) === 401)).toBe(true);

        // And the route it already served is untouched — a reload adds, it does not swap one for another.
        expect(await probe(mine)).toBe(401);
    });

    test('a change that fires no watch event still converges — the REAL sweep timer is the self-heal', async () => {
        // `fs.watch` may legitimately miss events (network and virtualised filesystems routinely do).
        // Closing ONLY the watcher reproduces that exactly and leaves the periodic sweep running, so
        // what this asserts is the scheduled trigger firing on its own. Stopping both and then calling
        // the helper by hand would disable the mechanism under test and prove nothing about it.
        receiver.stopManifestWatcher();

        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace')});

        // No watcher observes the write; only the interval can rescue it.
        expect(await waitFor(async () => await probe(peer) === 401)).toBe(true);
    });

    test('an unchanged manifest costs no reload, so a duplicate event is free', async () => {
        // Watch events arrive doubled on some platforms. Funnelling every trigger through a revision
        // comparison makes a duplicate cost a stat instead of a redundant parse-and-swap.
        expect(await receiver.reloadIfChanged()).toBe(null);
        expect(await receiver.reloadIfChanged()).toBe(null);
        expect(await probe(mine)).toBe(401);
    });

    test('a publish during startup is still adopted — the served revision is the one that was LOADED', async () => {
        // @neo-gpt-emmy's first falsifier. Recording the revision from a stat taken AFTER boot work
        // (state init, listen) attaches whatever is on disk by then to content loaded earlier: the
        // comparison then reads "unchanged" forever and the route is permanently dark. Reproduced by
        // publishing while startup is still in flight.
        const started = startWakeReceiver({
            manifestPath,
            stateDir           : path.join(dir, 'state-startup'),
            host               : '127.0.0.1',
            port               : await freePort(),
            logger             : {error() {}, warn() {}, log() {}},
            reconcileIntervalMs: 40
        });

        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace')});

        const startupReceiver = await started;

        try {
            const hit = async id => (await fetch(
                `http://127.0.0.1:${startupReceiver.server.address().port}/wake`,
                {
                    method : 'POST',
                    headers: {
                        'content-type'              : 'application/json',
                        'x-neo-wake-subscription-id': id,
                        'x-neo-wake-schema-version' : '1.0',
                        'x-neo-wake-signature'      : 'deadbeef'
                    },
                    body: '{}'
                }
            )).status;

            expect(await waitFor(async () => await hit(peer) === 401)).toBe(true);
        } finally {
            startupReceiver.stopWatchingManifest();
            await new Promise(resolve => startupReceiver.server.close(resolve));
        }
    });

    test('two overlapping reloads cannot let the older one win', async () => {
        // @neo-gpt-emmy's second falsifier. Unserialized reloads can complete out of order, so an
        // older parse lands its `setManifest` last and rolls the route table backwards while both
        // callers report success. Fired concurrently against two different manifests.
        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace')});

        const first = receiver.reloadIfChanged();

        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace'), [third]: route('@neo-gpt')});

        const [, second] = await Promise.all([first, receiver.reloadIfChanged()]);

        // Whatever the interleaving, the FINAL served table must be the newest file — never an earlier
        // one reinstated by a slower caller.
        expect(await probe(third)).toBe(401);
        expect(await probe(peer)).toBe(401);
        expect(second === null || second === 3).toBe(true);
    });

    test('a distinct publish sharing an mtime is still adopted — mtime alone is not an identity', async () => {
        // @neo-gpt-emmy's third falsifier. Two atomic publishes can land inside one clock tick; an
        // mtime-only revision aliases them and the second is never adopted. The publisher renames a
        // temp file, so the inode differs even when the timestamp does not — forcing the timestamps
        // equal here isolates exactly that.
        // Isolating the inode term takes three things, and dropping any one lets a weaker term pass the
        // spec: identical mtime, identical SIZE, and delivery by RENAME. An in-place overwrite keeps the
        // inode, and a manifest with a different route count changes the size — either way something
        // other than the inode does the discriminating and the term this patch relies on is untested.
        const pinned = 1_760_000_000;
        const alpha  = 'WAKE_SUB:aaa';
        const beta   = 'WAKE_SUB:bbb';

        /**
         * Publishes the way the generator does: write a sibling temp file, then rename over the target.
         * @param {Object} routes
         * @returns {Promise<Object>} The published file's stat.
         */
        const publishByRename = async routes => {
            const temp = path.join(dir, `routes.${Math.abs(Object.keys(routes)[0].length)}.tmp`);

            await fs.writeFile(temp, JSON.stringify({schemaVersion: 1, routes}), {mode: 0o600});
            await fs.chmod(temp, 0o600);
            await fs.utimes(temp, pinned, pinned);
            await fs.rename(temp, manifestPath);

            return fs.stat(manifestPath)
        };

        const first = await publishByRename({[alpha]: route('@neo-opus-ada')});

        // Establish that exact revision as the SERVED one, so the next publish collides with it.
        await receiver.reloadIfChanged();

        const second = await publishByRename({[beta]: route('@neo-opus-ada')});

        // The controls. Without these three the spec silently degrades into the size test it used to be.
        expect(second.mtimeMs).toBe(first.mtimeMs);
        expect(second.size).toBe(first.size);
        expect(second.ino).not.toBe(first.ino);

        expect(await receiver.reloadIfChanged()).toBe(1);
        expect(await probe(beta)).toBe(401);
        expect(await probe(alpha)).toBe(404);
    });

    test('a corrupt write leaves the serving table intact, and recovery needs no signal', async () => {
        expect(await probe(mine)).toBe(401);

        await fs.writeFile(manifestPath, '{ not json', {mode: 0o600});

        // The fail-safe under the AUTOMATIC path: the existing spec proves reload() refuses, but the
        // watcher is a new caller of it. A malformed file reaching an emptied route table would turn a
        // stale receiver into a dead one — the exact inversion this daemon must never make.
        expect(await receiver.reloadIfChanged()).toBe(null);
        expect(await probe(mine)).toBe(401);

        // A refused reload must NOT record the file's mtime, or the sweep would treat a rejected write
        // as accepted and never retry — the corrupt file would become permanently authoritative.
        await write({[mine]: route('@neo-opus-ada'), [peer]: route('@neo-opus-grace')});

        expect(await waitFor(async () => await probe(peer) === 401)).toBe(true);
    });
});

test.describe('ai/daemons/wake/receiver — context gate (#16682)', () => {
    const subscriptionId = 'WAKE_SUB:gate-test';
    const signingKey     = 'b'.repeat(64);
    const agentIdentity  = '@neo-kimi-phoebe';
    const manifest       = {
        schemaVersion: 1,
        routes       : {
            [subscriptionId]: {
                signingKey,
                agentIdentity,
                harnessTargetMetadata: {adapter: 'test'},
                adapterConfig        : {
                    attemptTimeoutMs: 100,
                    contextGate     : {maxContextTokens: 250_000, warnContextTokens: 200_000}
                }
            }
        }
    };
    const ungatedManifest = {
        schemaVersion: 1,
        routes       : {
            [subscriptionId]: {
                signingKey,
                agentIdentity,
                harnessTargetMetadata: {adapter: 'test'},
                adapterConfig        : {attemptTimeoutMs: 100}
            }
        }
    };

    let baseUrl, dispatchCalls, probeCalls, probeResult, receiver, server, state, stateDir, warnLines;

    const buildEnvelope = () => ({
        schemaVersion: '1.0',
        eventType    : 'wake/digest',
        eventId      : 'wake-digest:gate-1',
        subscriptionId,
        agentIdentity,
        payload      : {
            totalEvents   : 1,
            sourceEventIds: ['MESSAGE:gate-1'],
            breakdown     : {sent_to_me: {count: 1, latest: {messageId: 'MESSAGE:gate-1', subject: 'gate'}}}
        },
        emittedAt: new Date().toISOString()
    });

    async function postWake() {
        const envelope = buildEnvelope();
        const body     = JSON.stringify(envelope);

        return fetch(`${baseUrl}/wake`, {
            method : 'POST',
            headers: {
                'content-type'              : 'application/json',
                'x-neo-wake-event-id'       : envelope.eventId,
                'x-neo-wake-subscription-id': subscriptionId,
                'x-neo-wake-schema-version' : '1.0',
                'x-neo-wake-signature'      : crypto.createHmac('sha256', signingKey).update(body).digest('hex')
            },
            body
        });
    }

    async function waitForRecord(predicate) {
        for (let index = 0; index < 100; index++) {
            const hit = (await state.list()).find(predicate);
            if (hit) return hit;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        return null;
    }

    async function waitForFlag(check) {
        for (let index = 0; index < 100; index++) {
            if (check()) return true;
            await new Promise(resolve => setTimeout(resolve, 5));
        }
        return false;
    }

    async function bootReceiver(activeManifest) {
        receiver = createWakeReceiver({
            manifest    : activeManifest,
            state,
            dispatch    : async record => { dispatchCalls.push(record); return 'delivered'; },
            contextProbe: async record => { probeCalls.push(record); return probeResult; },
            logger      : {error() {}, log() {}, warn(line) { warnLines.push(line); }}
        });
        server = receiver.server;
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    }

    test.beforeEach(async () => {
        stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-gate-'));
        state    = new WakeReceiverState({stateDir});
        await state.init();
        dispatchCalls = [];
        probeCalls    = [];
        warnLines     = [];
        probeResult   = null;
    });

    test.afterEach(async () => {
        if (server) await new Promise(resolve => server.close(resolve));
        await fs.rm(stateDir, {recursive: true, force: true});
    });

    test('an over-budget session defers: no dispatch, record returns to pending with the reason', async () => {
        probeResult = {contextTokens: 700_000, lastActivityAt: Date.now(), sessionId: 'ses_big'};
        await bootReceiver(manifest);

        await postWake();
        // A record is `pending` from accept until the gate runs — wait for the DEFERRAL, not the state.
        const deferred = await waitForRecord(record => record.deferCount >= 1);

        expect(dispatchCalls).toHaveLength(0);
        expect(probeCalls).toHaveLength(1);
        expect(deferred).toMatchObject({
            state              : 'pending',
            deferCount         : 1,
            deferReason        : 'context-gate:700000>250000',
            probedContextTokens: 700_000
        });
        // The warn lands in the same drain iteration but after the state write the poll observes.
        expect(await waitForFlag(() => warnLines.some(line => line.includes('DEFERRED')))).toBe(true);
    });

    test('a deferral flushes on the next drain once the session shrinks or rotates', async () => {
        probeResult = {contextTokens: 700_000, lastActivityAt: Date.now(), sessionId: 'ses_big'};
        await bootReceiver(manifest);

        await postWake();
        expect(await waitForRecord(record => record.deferCount >= 1)).toBeTruthy();

        probeResult = {contextTokens: 45_000, lastActivityAt: Date.now(), sessionId: 'ses_fresh'};
        await receiver.drain();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(dispatchCalls).toHaveLength(1);
    });

    test('unknown context delivers fail-open with a loud warn — never silently withheld', async () => {
        probeResult = null;
        await bootReceiver(manifest);

        await postWake();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(dispatchCalls).toHaveLength(1);
        expect(warnLines.join('\n')).toContain('fail-open');
    });

    test('the warn band delivers with an approaching-gate warning', async () => {
        probeResult = {contextTokens: 220_000, lastActivityAt: Date.now(), sessionId: 'ses_warm'};
        await bootReceiver(manifest);

        await postWake();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(warnLines.join('\n')).toContain('warns');
    });

    test('a wake delivered through a probed gate carries the session-context payload (AC-2)', async () => {
        probeResult = {contextTokens: 45_000, lastActivityAt: Date.now(), sessionId: 'ses_cheap'};
        await bootReceiver(manifest);

        await postWake();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(dispatchCalls).toHaveLength(1);
        expect(dispatchCalls[0].envelope.payload.sessionContext).toEqual({
            contextTokens   : 45_000,
            maxContextTokens: 250_000
        });
        // The durable record keeps the byte-identical signed envelope — the line is a dispatch-time copy
        const delivered = (await state.list()).find(record => record.state === 'delivered');

        expect(delivered.envelope.payload.sessionContext).toBeUndefined();
    });

    test('absent probe data, no session-context field rides the dispatch envelope (no noise)', async () => {
        probeResult = null;
        await bootReceiver(manifest);

        await postWake();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(dispatchCalls).toHaveLength(1);
        expect(dispatchCalls[0].envelope.payload.sessionContext).toBeUndefined();
    });

    test('a legacy route without contextGate skips the gate and the probe entirely', async () => {
        await bootReceiver(ungatedManifest);

        await postWake();

        expect(await waitForRecord(record => record.state === 'delivered')).toBeTruthy();
        expect(probeCalls).toHaveLength(0);
        expect(warnLines).toHaveLength(0);
    });

    test('the manifest loader validates contextGate shape when present', async () => {
        const route = overrides => ({
            signingKey,
            agentIdentity,
            harnessTargetMetadata: {adapter: 'opencode-server'},
            adapterConfig        : {attemptTimeoutMs: 100, ...overrides}
        });
        const load = contextGate => {
            const dir = stateDir;
            return fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({
                schemaVersion: 1,
                routes       : {[subscriptionId]: route({contextGate})}
            }), {mode: 0o600}).then(() => loadWakeReceiverManifest(path.join(dir, 'manifest.json')));
        };

        await expect(load({maxContextTokens: 250_000, warnContextTokens: 200_000})).resolves.toBeDefined();
        await expect(load({maxContextTokens: 0, warnContextTokens: 0})).rejects.toThrow('contextGate');
        await expect(load({maxContextTokens: 100_000, warnContextTokens: 250_000})).rejects.toThrow('contextGate');
        await expect(load({maxContextTokens: 250_000})).rejects.toThrow('contextGate');
        await expect(load('not-an-object')).rejects.toThrow('contextGate');
    });
});
