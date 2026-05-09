import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'CoalescingEngineServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

let CoalescingEngineService;
let WebhookDeliveryService;

const buildEnvelope = (eventType, payload, logId = 1) => ({
    schemaVersion : '1.0',
    eventType,
    eventId       : `01HEVT${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    logId,
    agentIdentity : '@alice',
    subscriptionId: 'WAKE_SUB:test',
    payload,
    emittedAt     : new Date().toISOString()
});

const buildSubscription = (overrides = {}) => ({
    id                   : 'WAKE_SUB:test',
    agentIdentity        : '@alice',
    harnessTarget        : 'a2a-webhook',
    harnessTargetMetadata: {url: 'https://example.com/wake', signingKey: 'k', ...(overrides.harnessTargetMetadata || {})},
    ...overrides
});

test.describe('CoalescingEngineService', () => {
    let originalDeliver;
    let deliverCalls;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        CoalescingEngineService = (await import('../../../../../../ai/services/memory-core/CoalescingEngineService.mjs')).default;
        WebhookDeliveryService  = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        originalDeliver         = WebhookDeliveryService.deliver?.bind(WebhookDeliveryService);
    });

    test.beforeEach(() => {
        deliverCalls = [];
        WebhookDeliveryService.deliver = async (subscription, eventData) => {
            deliverCalls.push({subscription, eventData});
        };
        CoalescingEngineService.clearAll();
    });

    test.afterEach(() => {
        CoalescingEngineService.clearAll();
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        if (originalDeliver) WebhookDeliveryService.deliver = originalDeliver;
    });

    // -----------------------------------------------------------------------------
    // Window resolution + clamping
    // -----------------------------------------------------------------------------

    test('_resolveWindowMs falls back to default 30s when no override', () => {
        const ms = CoalescingEngineService._resolveWindowMs(buildSubscription());
        expect(ms).toBe(30 * 1000);
    });

    test('_resolveWindowMs honors per-subscription coalesceWindow override', () => {
        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: 60}});
        expect(CoalescingEngineService._resolveWindowMs(sub)).toBe(60 * 1000);
    });

    test('_resolveWindowMs clamps negative override to 0', () => {
        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: -10}});
        expect(CoalescingEngineService._resolveWindowMs(sub)).toBe(0);
    });

    test('_resolveWindowMs clamps over-300s override to 300s max', () => {
        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: 999}});
        expect(CoalescingEngineService._resolveWindowMs(sub)).toBe(300 * 1000);
    });

    test('_resolveWindowMs honors override of 0 for immediate flush', () => {
        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: 0}});
        expect(CoalescingEngineService._resolveWindowMs(sub)).toBe(0);
    });

    // -----------------------------------------------------------------------------
    // Coalescing behavior
    // -----------------------------------------------------------------------------

    test('coalesces multiple events within the window into a single digest', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me',         {messageId: 'M1', from: '@bob'}, 10));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me',         {messageId: 'M2', from: '@bob'}, 11));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/task_state_changed', {taskId: 'T1', newState: 'Working'}, 12));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(1);
        const digest = deliverCalls[0].eventData;
        expect(digest.eventType).toBe('wake/digest');
        expect(digest.payload.totalEvents).toBe(3);
        expect(digest.payload.breakdown.sent_to_me.count).toBe(2);
        expect(digest.payload.breakdown.task_state_changed.count).toBe(1);
        expect(digest.payload.breakdown.permission_granted.count).toBe(0);
    });

    test('immediate-flush (coalesceWindow=0) dispatches synchronously', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));

        // Immediate-flush path schedules dispatch synchronously inside enqueue;
        // give the microtask queue a tick to drain the async deliver call.
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(deliverCalls.length).toBe(1);
        expect(deliverCalls[0].eventData.eventType).toBe('wake/digest');
        expect(deliverCalls[0].eventData.payload.totalEvents).toBe(1);
    });

    test('digest envelope preserves the latest payload per trigger type', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1', subject: 'first'}));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M2', subject: 'second'}));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M3', subject: 'latest'}));

        await new Promise(resolve => setTimeout(resolve, 100));

        const digest = deliverCalls[0].eventData;
        expect(digest.payload.breakdown.sent_to_me.latest.messageId).toBe('M3');
        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('latest');
    });

    test('digest envelope preserves logId of last event for cursor-based catchup', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}, 100));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M2'}, 105));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls[0].eventData.logId).toBe(105);
    });

    // -----------------------------------------------------------------------------
    // Dispatch routing
    // -----------------------------------------------------------------------------

    test('dispatches a2a-webhook subscriptions to WebhookDeliveryService.deliver', async () => {
        const sub = buildSubscription({harnessTarget: 'a2a-webhook', harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(1);
        expect(deliverCalls[0].subscription.id).toBe('WAKE_SUB:test');
        expect(deliverCalls[0].subscription.properties.harnessTargetMetadata.url).toBe('https://example.com/wake');
    });

    test('dispatches mcp-notifications subscriptions via mcpServer.notification', async () => {
        let notificationCalledWith = null;
        CoalescingEngineService.addMcpServer({
            notification: async (args) => {
                notificationCalledWith = args;
            }
        });

        const sub = buildSubscription({harnessTarget: 'mcp-notifications', harnessTargetMetadata: {coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(notificationCalledWith).not.toBeNull();
        expect(notificationCalledWith.method).toBe('notifications/message');
        // TRACKING: #10400 Fix - mcp-notifications bypassed timer and digest envelope
        expect(notificationCalledWith.params.eventType).toBe('wake/sent_to_me');
        expect(notificationCalledWith.params.payload.messageId).toBe('M1');

        // cleanup
        CoalescingEngineService.clearMcpServers();
    });

    test('does NOT dispatch bridge-daemon subscriptions (Shape C handles its own coalescing)', async () => {
        const sub = buildSubscription({harnessTarget: 'bridge-daemon', harnessTargetMetadata: {coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(0);
    });

    test('does NOT dispatch disabled subscriptions', async () => {
        const sub = buildSubscription({harnessTarget: 'disabled', harnessTargetMetadata: {coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(0);
    });

    // -----------------------------------------------------------------------------
    // Lifecycle (flushAll, clearAll)
    // -----------------------------------------------------------------------------

    test('flushAll force-flushes pending subscriptions immediately', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 60}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        expect(deliverCalls.length).toBe(0);

        await CoalescingEngineService.flushAll();
        expect(deliverCalls.length).toBe(1);
    });

    test('clearAll cancels pending timers without dispatching', async () => {
        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        CoalescingEngineService.clearAll();

        await new Promise(resolve => setTimeout(resolve, 100));
        expect(deliverCalls.length).toBe(0);
    });

    test('per-subscription state is isolated', async () => {
        const subA = {...buildSubscription(), id: 'WAKE_SUB:A', harnessTargetMetadata: {url: 'https://a.example.com', coalesceWindow: 0.05}};
        const subB = {...buildSubscription(), id: 'WAKE_SUB:B', harnessTargetMetadata: {url: 'https://b.example.com', coalesceWindow: 0.05}};
        CoalescingEngineService.enqueue(subA, buildEnvelope('wake/sent_to_me', {messageId: 'A1'}));
        CoalescingEngineService.enqueue(subB, buildEnvelope('wake/sent_to_me', {messageId: 'B1'}));
        CoalescingEngineService.enqueue(subA, buildEnvelope('wake/sent_to_me', {messageId: 'A2'}));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(2);
        const aDigest = deliverCalls.find(c => c.subscription.id === 'WAKE_SUB:A')?.eventData;
        const bDigest = deliverCalls.find(c => c.subscription.id === 'WAKE_SUB:B')?.eventData;
        expect(aDigest?.payload.totalEvents).toBe(2);
        expect(bDigest?.payload.totalEvents).toBe(1);
    });
});
