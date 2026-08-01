import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'WebhookDeliveryServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}       from '@playwright/test';
import Neo                  from '../../../../../../src/Neo.mjs';
import * as core            from '../../../../../../src/core/_export.mjs';
import crypto               from 'crypto';
import fs                   from 'node:fs/promises';
import os                   from 'node:os';
import path                 from 'node:path';
import {createWakeReceiver} from '../../../../../../ai/daemons/wake/receiver.mjs';
import {WakeReceiverState}  from '../../../../../../ai/daemons/wake/receiverState.mjs';

let WebhookDeliveryService;
let GraphService;

test.describe('WebhookDeliveryService', () => {
    let fetchCalls   = [];
    let updatedNodes = [];
    let originalFetch, originalGetNode, originalUpsertNode, originalGetUnscopedNodeRecord;

    test.beforeAll(async () => {
        WebhookDeliveryService       = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        GraphService                 = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        originalFetch                = global.fetch;
        originalGetNode              = GraphService.getNode;
        originalUpsertNode           = GraphService.upsertNode;
        originalGetUnscopedNodeRecord = GraphService.getUnscopedNodeRecord;
    });

    test.afterAll(() => {
        global.fetch                       = originalFetch;
        GraphService.getNode               = originalGetNode;
        GraphService.upsertNode            = originalUpsertNode;
        GraphService.getUnscopedNodeRecord = originalGetUnscopedNodeRecord;
    });

    test.beforeEach(() => {
        fetchCalls = [];
        updatedNodes = [];

        // Mock global fetch
        global.fetch = async (url, options) => {
            fetchCalls.push({ url, options });

            if (global.mockFetchResponse) {
                return global.mockFetchResponse(url, options);
            }

            return { ok: true, status: 200 };
        };

        // Mock GraphService methods
        GraphService.getNode = ({ id }) => {
            if (id === 'WAKE_SUB:123') {
                return {
                    id        : 'WAKE_SUB:123',
                    properties: {
                        harnessTarget        : 'mcp-notifications',
                        harnessTargetMetadata: {
                            url       : 'http://localhost:8080/webhook',
                            signingKey: 'secret123'
                        }
                    }
                };
            }
            return null;
        };

        // The degrade path reads through the context-free accessor, because it runs from a background
        // flush where the RLS-scoped reads resolve no requester and return null. These doubles
        // keep this suite's fast in-memory shape; the real read/write path — with RLS actually engaged
        // and the requester unbound — is covered by WebhookDeliveryService.degradeDeadRoute.spec.mjs.
        GraphService.getUnscopedNodeRecord = ({id}) => GraphService.getNode({id});

        GraphService.upsertNode = (node) => {
            if (node.id === 'WAKE_SUB:123') {
                updatedNodes.push(node);
            }
        };

        // Reset the service state
        WebhookDeliveryService.consecutiveFailures.clear();
        WebhookDeliveryService.degradedSubscriptions.clear();
        WebhookDeliveryService.configure({attemptTimeoutSeconds: 30});
    });

    test.afterEach(() => {
        delete global.mockFetchResponse;
    });

    test('delivers event successfully and signs it', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData    = {
            eventId      : '01HXXX',
            schemaVersion: '1.0',
            payload      : { message: 'hello' }
        };

        const outcome = await WebhookDeliveryService.deliver(subscription, eventData);

        test.expect(outcome).toBe('delivered');
        test.expect(fetchCalls.length).toBe(1);
        const { url, options } = fetchCalls[0];
        test.expect(url).toBe('http://localhost:8080/webhook');
        test.expect(options.method).toBe('POST');
        test.expect(options.headers['X-Neo-Wake-Event-Id']).toBe('01HXXX');
        test.expect(options.headers['X-Neo-Wake-Subscription-Id']).toBe('WAKE_SUB:123');
        test.expect(options.headers['X-Neo-Wake-Signature']).toBeDefined();

        // Verify HMAC
        const expectedSig = crypto.createHmac('sha256', 'secret123').update(JSON.stringify(eventData)).digest('hex');
        test.expect(options.headers['X-Neo-Wake-Signature']).toBe(expectedSig);
    });

    test('real sender and receiver agree on exact-body HMAC and durable acceptance', async () => {
        const stateDir       = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-shape-b-contract-'));
        const state          = new WakeReceiverState({stateDir});
        const key            = 'a'.repeat(64);
        const subscriptionId = 'WAKE_SUB:shape-b-contract';
        let   dispatchCount  = 0;

        await state.init();
        const receiver = createWakeReceiver({
            manifest: {
                schemaVersion: 1,
                routes       : {
                    [subscriptionId]: {
                        signingKey           : key,
                        agentIdentity        : '@alice',
                        harnessTargetMetadata: {adapter: 'tmux', tmuxSession: 'test'},
                        adapterConfig        : {attemptTimeoutMs: 100}
                    }
                }
            },
            state,
            dispatch: async () => {
                dispatchCount++;
                return 'delivered';
            },
            logger: {error() {}, warn() {}, log() {}}
        });

        await new Promise((resolve, reject) => {
            receiver.server.once('error', reject);
            receiver.server.listen(0, '127.0.0.1', resolve);
        });

        try {
            global.fetch = originalFetch;
            const eventData = {
                schemaVersion: '1.0',
                eventType    : 'wake/digest',
                eventId      : 'wake-digest:shape-b-contract',
                subscriptionId,
                agentIdentity: '@alice',
                payload      : {
                    totalEvents   : 1,
                    sourceEventIds: ['MESSAGE:shape-b-contract'],
                    breakdown     : {}
                },
                emittedAt: new Date().toISOString()
            };
            const subscription = {
                id        : subscriptionId,
                properties: {
                    harnessTargetMetadata: {
                        url       : `http://127.0.0.1:${receiver.server.address().port}/wake`,
                        signingKey: key
                    }
                }
            };

            expect(await WebhookDeliveryService.deliver(subscription, eventData)).toBe('delivered');
            await receiver.drain();

            expect(await state.list('delivered')).toHaveLength(1);
            expect(dispatchCount).toBe(1);
        } finally {
            await new Promise(resolve => receiver.server.close(resolve));
            await fs.rm(stateDir, {recursive: true, force: true});
        }
    });

    test('marks degraded immediately on 4xx response', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData    = { eventId: '01HXXX' };

        global.mockFetchResponse = () => ({ ok: false, status: 400 });

        const outcome = await WebhookDeliveryService.deliver(subscription, eventData);

        test.expect(outcome).toBe('skipped');
        test.expect(fetchCalls.length).toBe(1); // No retries for 4xx
        test.expect(updatedNodes.length).toBe(1);
        // `status`, not `harnessTarget`: degradation and routing are separate fields with separate value
        // spaces, and both consumers of degradation read `status`.
        test.expect(updatedNodes[0].properties.status).toBe('degraded');
    });

    test('retries on 5xx response and degrades after 3 failures', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData    = { eventId: '01HXXX' };

        const originalSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => originalSetTimeout(fn, 10);

        global.mockFetchResponse = () => ({ ok: false, status: 500 });

        expect(await WebhookDeliveryService.deliver(subscription, eventData)).toBe('failed');
        test.expect(updatedNodes.length).toBe(0); // 1st failure

        expect(await WebhookDeliveryService.deliver(subscription, eventData)).toBe('failed');
        test.expect(updatedNodes.length).toBe(0); // 2nd failure

        expect(await WebhookDeliveryService.deliver(subscription, eventData)).toBe('failed');
        test.expect(updatedNodes.length).toBe(1); // 3rd failure

        global.setTimeout = originalSetTimeout;

        test.expect(fetchCalls.length).toBe(12); // 3 events * 4 attempts
        test.expect(updatedNodes[0].properties.status).toBe('degraded');
    });

    test('refuses unsigned Shape-B delivery without issuing a request, and counts it toward the degrade', async () => {
        const subscription = GraphService.getNode({id: 'WAKE_SUB:123'});
        delete subscription.properties.harnessTargetMetadata.signingKey;

        // The refusal is a delivery FAILURE, not an inapplicable target. Returning 'skipped' without
        // recording never reached `_recordConsecutiveFailure`, so no threshold was met and the degrade
        // never ran — leaving the row `active` on every surface while the seat received nothing.
        // Counted the same way as a 5xx above, so the two paths converge on one degrade mechanism.
        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXX'})).toBe('failed');
        expect(updatedNodes.length).toBe(0); // 1st

        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXY'})).toBe('failed');
        expect(updatedNodes.length).toBe(0); // 2nd

        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXZ'})).toBe('failed');
        expect(updatedNodes.length).toBe(1); // 3rd — the row stops reading active

        expect(updatedNodes[0].properties.status).toBe('degraded');
        // The original invariant, unchanged: refusing still issues no request.
        expect(fetchCalls).toHaveLength(0);
    });

    test('a missing URL is counted the same way — the identical silent-forever shape', async () => {
        const subscription = GraphService.getNode({id: 'WAKE_SUB:123'});
        delete subscription.properties.harnessTargetMetadata.url;

        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXX'})).toBe('failed');
        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXY'})).toBe('failed');
        expect(await WebhookDeliveryService.deliver(subscription, {eventId: '01HXXZ'})).toBe('failed');

        expect(updatedNodes.length).toBe(1);
        expect(updatedNodes[0].properties.status).toBe('degraded');
        expect(fetchCalls).toHaveLength(0);
    });
});
