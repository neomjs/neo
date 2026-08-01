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

    let baseUrl, dispatchCalls, receiver, server, state, stateDir;

    test.beforeEach(async () => {
        stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-wake-receiver-'));
        state    = new WakeReceiverState({stateDir});
        await state.init();
        dispatchCalls = [];
        receiver = createWakeReceiver({
            manifest,
            state,
            dispatch: async record => {
                dispatchCalls.push(record);
                return 'delivered';
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

        receiver = await startWakeReceiver({
            manifestPath,
            stateDir: path.join(dir, 'state'),
            host    : '127.0.0.1',
            port    : await freePort(),
            logger  : {error() {}, warn() {}, log() {}}
        });
    });

    test.afterEach(async () => {
        await new Promise(resolve => receiver.server.close(resolve));
        await fs.rm(dir, {recursive: true, force: true});
    });

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
});
