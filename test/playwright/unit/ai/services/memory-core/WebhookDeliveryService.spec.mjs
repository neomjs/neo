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

import {test, expect} from '@playwright/test';
import Neo from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';
import crypto from 'crypto';

let WebhookDeliveryService;
let GraphService;

test.describe('WebhookDeliveryService', () => {
    let fetchCalls = [];
    let updatedNodes = [];

    test.beforeAll(async () => {
        WebhookDeliveryService = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
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
                    id: 'WAKE_SUB:123',
                    properties: {
                        harnessTarget: 'mcp-notifications',
                        harnessTargetMetadata: {
                            url: 'http://localhost:8080/webhook',
                            signingKey: 'secret123'
                        }
                    }
                };
            }
            return null;
        };

        GraphService.upsertNode = (node) => {
            if (node.id === 'WAKE_SUB:123') {
                updatedNodes.push(node);
            }
        };

        // Reset the service state
        WebhookDeliveryService.consecutiveFailures.clear();
    });

    test.afterEach(() => {
        delete global.mockFetchResponse;
    });

    test('delivers event successfully and signs it', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData = {
            eventId: '01HXXX',
            schemaVersion: '1.0',
            payload: { message: 'hello' }
        };

        await WebhookDeliveryService.deliver(subscription, eventData);

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

    test('marks degraded immediately on 4xx response', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData = { eventId: '01HXXX' };

        global.mockFetchResponse = () => ({ ok: false, status: 400 });

        await WebhookDeliveryService.deliver(subscription, eventData);

        test.expect(fetchCalls.length).toBe(1); // No retries for 4xx
        test.expect(updatedNodes.length).toBe(1);
        test.expect(updatedNodes[0].properties.harnessTarget).toBe('degraded');
    });

    test('retries on 5xx response and degrades after 3 failures', async () => {
        const subscription = GraphService.getNode({ id: 'WAKE_SUB:123' });
        const eventData = { eventId: '01HXXX' };

        const originalSetTimeout = global.setTimeout;
        global.setTimeout = (fn, delay) => originalSetTimeout(fn, 10);

        global.mockFetchResponse = () => ({ ok: false, status: 500 });

        await WebhookDeliveryService.deliver(subscription, eventData);
        test.expect(updatedNodes.length).toBe(0); // 1st failure

        await WebhookDeliveryService.deliver(subscription, eventData);
        test.expect(updatedNodes.length).toBe(0); // 2nd failure

        await WebhookDeliveryService.deliver(subscription, eventData);
        test.expect(updatedNodes.length).toBe(1); // 3rd failure

        global.setTimeout = originalSetTimeout;

        test.expect(fetchCalls.length).toBe(12); // 3 events * 4 attempts
        test.expect(updatedNodes[0].properties.harnessTarget).toBe('degraded');
    });
});
