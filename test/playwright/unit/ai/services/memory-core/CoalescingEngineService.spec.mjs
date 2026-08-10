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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import StateProvider   from '../../../../../../src/state/Provider.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../');

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
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        // Isolation is by construction: `collections.*` already resolve to per-process randomized
        // `test-*` names under `UNIT_TEST_MODE`, and Chroma isolates one level higher still, at the
        // database (`databaseTest`). Repointing the shared singleton duplicated that with a coarser
        // generator and left the names pointing here for the rest of the worker's life.

        CoalescingEngineService = (await import('../../../../../../ai/services/memory-core/CoalescingEngineService.mjs')).default;
        WebhookDeliveryService  = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        originalDeliver         = WebhookDeliveryService.deliver?.bind(WebhookDeliveryService);
    });

    test.beforeEach(() => {
        deliverCalls = [];
        WebhookDeliveryService.deliver = async (subscription, eventData) => {
            deliverCalls.push({subscription, eventData});
            return 'delivered';
        };
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        });
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

    test('digest identity is stable for the same subscription and canonical source events', () => {
        const sub    = buildSubscription();
        const events = [
            buildEnvelope('wake/sent_to_me', {messageId: 'M1'}, 100),
            buildEnvelope('wake/heartbeat_pulse', {pulseId: 'P1'}, 101)
        ];
        const first  = CoalescingEngineService._buildDigestEnvelope(sub, events, Date.now());
        const second = CoalescingEngineService._buildDigestEnvelope(sub, events, Date.now());

        expect(first.eventId).toBe(second.eventId);
        expect(first.payload.sourceEventIds).toEqual(['M1', 'P1']);
        expect(first.payload.breakdown.heartbeat_pulse.count).toBe(1);
    });

    test('digest preserves the strongest coalesced message priority when the latest is weaker', () => {
        const sub    = buildSubscription();
        const digest = CoalescingEngineService._buildDigestEnvelope(sub, [
            buildEnvelope('wake/sent_to_me', {messageId: 'M1', priority: 'high'}, 100),
            buildEnvelope('wake/sent_to_me', {messageId: 'M2', priority: 'normal'}, 101)
        ], Date.now());

        expect(digest.payload.breakdown.sent_to_me).toMatchObject({
            count          : 2,
            highestPriority: 'high',
            latest         : {messageId: 'M2', priority: 'normal'}
        });
    });

    test('a failed delivery does not arm the post-flush refractory', async () => {
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 0,
            flushRefractorySeconds: 60,
            flushHardCapSeconds   : 300
        });
        WebhookDeliveryService.deliver = async (subscription, eventData) => {
            deliverCalls.push({subscription, eventData});
            return 'failed';
        };

        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: 0}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await new Promise(resolve => setTimeout(resolve, 10));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M2'}));
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(deliverCalls).toHaveLength(2);
        expect(CoalescingEngineService.lastFlushAtBySub.has(sub.id)).toBe(false);
    });

    test('an event queued during delivery waits for the confirmed-delivery refractory', async () => {
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 0,
            flushRefractorySeconds: 0.05,
            flushHardCapSeconds   : 1
        });

        let releaseFirst, markFirstStarted;
        const firstStarted = new Promise(resolve => { markFirstStarted = resolve; });
        const firstRelease = new Promise(resolve => { releaseFirst = resolve; });

        WebhookDeliveryService.deliver = async (subscription, eventData) => {
            deliverCalls.push({subscription, eventData, startedAt: Date.now()});
            if (deliverCalls.length === 1) {
                markFirstStarted();
                await firstRelease;
            }
            return 'delivered';
        };

        const sub = buildSubscription({harnessTargetMetadata: {coalesceWindow: 0.001}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}));
        await firstStarted;

        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M2'}));
        releaseFirst();

        await new Promise(resolve => setTimeout(resolve, 20));
        expect(deliverCalls).toHaveLength(1);

        await new Promise(resolve => setTimeout(resolve, 60));
        expect(deliverCalls).toHaveLength(2);
        expect(deliverCalls[1].startedAt - deliverCalls[0].startedAt).toBeGreaterThanOrEqual(45);
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
        // MCP notifications preserve the coalesced event type and payload envelope.
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

    // -----------------------------------------------------------------------------
    // Digest `latest` — recency, never iteration position
    // -----------------------------------------------------------------------------

    test('an out-of-order queue names the NEWEST event as latest, not the last-iterated one', () => {
        // The live enablement-day shape: the fresh message was enqueued FIRST, then a replay
        // batch of stale backlog events — and last-write-wins pointed at the backlog.
        const fresh = buildEnvelope('wake/sent_to_me', {
            subject: 'the fresh 11:21 message',
            sentAt : '2026-08-01T11:21:47.000Z'
        });
        const staleBatch = [1, 2, 3].map(n => buildEnvelope('wake/sent_to_me', {
            subject: `stale backlog probe ${n}`,
            sentAt : '2026-07-31T23:04:46.000Z'
        }));

        const digest = CoalescingEngineService._buildDigestEnvelope(
            buildSubscription(),
            [fresh, ...staleBatch],
            Date.now() - 150000
        );

        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('the fresh 11:21 message');
        expect(digest.payload.breakdown.sent_to_me.count).toBe(4)
    });

    test('arrival-ordered queues behave exactly as before (recency matches iteration)', () => {
        const stale = buildEnvelope('wake/sent_to_me', {subject: 'older', sentAt: '2026-07-31T23:04:46.000Z'});
        const fresh = buildEnvelope('wake/sent_to_me', {subject: 'newer', sentAt: '2026-08-01T11:21:47.000Z'});

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [stale, fresh], Date.now() - 150000);

        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('newer')
    });

    test('equal timestamps keep the last-enqueued one (no drift for same-instant events)', () => {
        const ts  = '2026-08-01T11:21:47.000Z',
              one = buildEnvelope('wake/sent_to_me', {subject: 'first', sentAt: ts}),
              two = buildEnvelope('wake/sent_to_me', {subject: 'second', sentAt: ts});

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [one, two], Date.now() - 150000);

        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('second')
    });

    test('timestamp-less payloads fall back to last-write-wins, never re-ordered by guesswork', () => {
        const noTs = subject => {
            const env = buildEnvelope('wake/sent_to_me', {subject});
            delete env.emittedAt;
            return env;
        };

        const first  = noTs('first-no-ts'),
              second = noTs('second-no-ts');

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [first, second], Date.now() - 150000);

        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('second-no-ts')
    });

    test('the envelope emittedAt is the recency fallback when the payload carries no sentAt', () => {
        const noSentAt = (subject, emittedAt) => {
            const env = buildEnvelope('wake/sent_to_me', {subject});
            env.emittedAt = emittedAt;
            return env;
        };

        const newerPayloadOlderPosition = noSentAt('newer-payload', '2026-08-01T11:21:47.000Z');
        const olderPayloadNewerPosition = noSentAt('older-payload', '2026-07-31T23:04:46.000Z');

        const digest = CoalescingEngineService._buildDigestEnvelope(
            buildSubscription(),
            [newerPayloadOlderPosition, olderPayloadNewerPosition],
            Date.now() - 150000
        );

        expect(digest.payload.breakdown.sent_to_me.latest.subject).toBe('newer-payload')
    });

    // -----------------------------------------------------------------------------
    // Digest `latest` — wire-faithful per-bucket payload clocks
    // -----------------------------------------------------------------------------

    test('permission_granted resolves latest by payload.grantedAt, not position', () => {
        // Wire shape per WakeSubscriptionService.mjs:1431-1433: {scope, grantedBy, grantedAt} — no sentAt.
        const fresh = buildEnvelope('wake/permission_granted', {scope: 'CAN_REVIEW', grantedBy: '@bob', grantedAt: '2026-08-01T11:21:47.000Z'});
        const stale = buildEnvelope('wake/permission_granted', {scope: 'CAN_MERGE',  grantedBy: '@bob', grantedAt: '2026-07-31T23:04:46.000Z'});

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [fresh, stale], Date.now() - 150000);

        expect(digest.payload.breakdown.permission_granted.latest.scope).toBe('CAN_REVIEW')
    });

    test('task_state_changed resolves latest by payload.lastModifiedAt, not position', () => {
        // Wire shape: the immutable typed-row payload carries the canonical transition clock.
        const fresh = buildEnvelope('wake/task_state_changed', {taskId: 'T1', newState: 'Working',   lastModifiedAt: '2026-08-01T11:21:47.000Z'});
        const stale = buildEnvelope('wake/task_state_changed', {taskId: 'T1', newState: 'Submitted', lastModifiedAt: '2026-07-31T23:04:46.000Z'});

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [fresh, stale], Date.now() - 150000);

        expect(digest.payload.breakdown.task_state_changed.latest.newState).toBe('Working')
    });

    test('a payload clock beats a newer-position envelope emittedAt', () => {
        // A replayed grant with a true delivery-time stamp must not lose to a fresh wrap of
        // an older logical event: grantedAt (11:21) wins over the later emittedAt.
        const stamped = buildEnvelope('wake/permission_granted', {scope: 'CAN_REVIEW', grantedBy: '@bob', grantedAt: '2026-08-01T11:21:47.000Z'});
        stamped.emittedAt = '2026-07-31T23:04:46.000Z';
        const wrappedFresh = buildEnvelope('wake/permission_granted', {scope: 'CAN_MERGE', grantedBy: '@bob', grantedAt: '2026-07-31T23:04:46.000Z'});

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [stamped, wrappedFresh], Date.now() - 150000);

        expect(digest.payload.breakdown.permission_granted.latest.scope).toBe('CAN_REVIEW')
    });

    test('heartbeat_pulse carries no payload clock and resolves by envelope emittedAt', () => {
        const newerWrapOlderPosition = buildEnvelope('wake/heartbeat_pulse', {targetIdentity: '@alice', pulseId: 'P-new'});
        newerWrapOlderPosition.emittedAt = '2026-08-01T11:21:47.000Z';
        const olderWrapNewerPosition = buildEnvelope('wake/heartbeat_pulse', {targetIdentity: '@alice', pulseId: 'P-old'});
        olderWrapNewerPosition.emittedAt = '2026-07-31T23:04:46.000Z';

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), [newerWrapOlderPosition, olderWrapNewerPosition], Date.now() - 150000);

        expect(digest.payload.breakdown.heartbeat_pulse.latest.pulseId).toBe('P-new')
    });

    test('all four breakdown buckets track recency, not position', () => {
        const events = [
            buildEnvelope('wake/sent_to_me',        {subject: 'fresh-stm',  sentAt: '2026-08-01T11:21:47.000Z'}),
            buildEnvelope('wake/task_state_changed', {subject: 'fresh-tsc',  sentAt: '2026-08-01T11:21:47.000Z'}),
            buildEnvelope('wake/permission_granted', {subject: 'fresh-pg',   sentAt: '2026-08-01T11:21:47.000Z'}),
            buildEnvelope('wake/heartbeat_pulse',    {subject: 'fresh-hbp',  sentAt: '2026-08-01T11:21:47.000Z'}),
            buildEnvelope('wake/sent_to_me',        {subject: 'stale-stm',  sentAt: '2026-07-31T23:04:46.000Z'}),
            buildEnvelope('wake/task_state_changed', {subject: 'stale-tsc',  sentAt: '2026-07-31T23:04:46.000Z'}),
            buildEnvelope('wake/permission_granted', {subject: 'stale-pg',   sentAt: '2026-07-31T23:04:46.000Z'}),
            buildEnvelope('wake/heartbeat_pulse',    {subject: 'stale-hbp',  sentAt: '2026-07-31T23:04:46.000Z'})
        ];

        const digest = CoalescingEngineService._buildDigestEnvelope(buildSubscription(), events, Date.now() - 150000),
              b      = digest.payload.breakdown;

        expect(b.sent_to_me.latest.subject).toBe('fresh-stm');
        expect(b.task_state_changed.latest.subject).toBe('fresh-tsc');
        expect(b.permission_granted.latest.subject).toBe('fresh-pg');
        expect(b.heartbeat_pulse.latest.subject).toBe('fresh-hbp');
        expect(b.sent_to_me.count).toBe(2);
        expect(b.sent_to_me.highestPriority).toBe('normal')
    });

    // -----------------------------------------------------------------------------
    // Read-state reconciliation
    //
    // The digest counted QUEUED EVENTS and never consulted read-state, so a message delivered, read
    // and acted on hours ago still contributed to the count and could be named `latest`. These arms
    // pin both the reconciliation and — more importantly — its FAIL-SAFE boundary: this is the whole
    // swarm's wake path, and suppressing a wake on uncertainty is worse than the wrong count it
    // replaces, because a wrong number is visible in the wake and a missing wake is visible to nobody.
    // -----------------------------------------------------------------------------

    test('an already-read message is excluded from the count and cannot be named latest', async () => {
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        }, {
            resolveDeliveryReadState: messageId => messageId === 'M-READ' ? {readAt: '2026-08-10T10:00:00.000Z'} : {}
        });

        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M-READ',   subject: 'handled hours ago'}, 10));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M-UNREAD', subject: 'actually new'}, 11));

        await new Promise(resolve => setTimeout(resolve, 100));

        const digest = deliverCalls[0].eventData;

        expect(digest.payload.breakdown.sent_to_me.count).toBe(1);
        expect(digest.payload.breakdown.sent_to_me.latest.messageId).toBe('M-UNREAD');
    });

    test('NON-VACUITY — the same two events both count when neither is read', async () => {
        // Without this arm the assertion above passes against a resolver that suppresses everything.
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        }, {
            resolveDeliveryReadState: () => ({})
        });

        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M-READ'},   10));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M-UNREAD'}, 11));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls[0].eventData.payload.breakdown.sent_to_me.count).toBe(2);
    });

    test('FAIL-SAFE — a resolver that THROWS renders the event rather than dropping it', async () => {
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        }, {
            resolveDeliveryReadState: () => { throw new Error('graph unavailable') }
        });

        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}, 10));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls.length).toBe(1);
        expect(deliverCalls[0].eventData.payload.breakdown.sent_to_me.count).toBe(1);
    });

    test('FAIL-SAFE — no resolver injected renders exactly as before read-state existed', async () => {
        CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        });

        const sub = buildSubscription({harnessTargetMetadata: {url: 'https://example.com/wake', coalesceWindow: 0.05}});
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M1'}, 10));
        CoalescingEngineService.enqueue(sub, buildEnvelope('wake/sent_to_me', {messageId: 'M2'}, 11));

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(deliverCalls[0].eventData.payload.breakdown.sent_to_me.count).toBe(2);
    });

    test('configure REFUSES a non-function resolver rather than silently ignoring it', () => {
        expect(() => CoalescingEngineService.configure({
            coalesceWindowSeconds : 30,
            flushRefractorySeconds: 120,
            flushHardCapSeconds   : 300
        }, {
            resolveDeliveryReadState: 'not-a-function'
        })).toThrow(/resolveDeliveryReadState/);
    });

    /**
     * @summary `configure` must accept the wake-dispatch config as a LIVE AiConfig node.
     *
     * **The production failure this exists to prevent, measured.** The first version of this feature
     * added `resolveDeliveryReadState` as one more key on the config bag, which forced the Memory Core
     * entrypoint to call `configure({...wakeDispatch, resolveDeliveryReadState})`. Every arm above
     * stayed green because they all hand `configure` a plain object literal — and a plain object
     * spreads perfectly. Production does not pass a plain object. It passes an `AiConfig` node, whose
     * `get` trap resolves override-else-inherit up the parent chain while its `ownKeys` trap
     * (`Provider#getTopLevelDataKeys`) enumerates **local `#dataConfigs` only**. The wake-dispatch
     * leaves are declared on the Tier-1 root, so the spread produced `{}` — measured, not inferred —
     * and mc-server died at boot on a validation error naming a leaf that was plainly set. Thirty-plus
     * integration specs then failed with `ECONNREFUSED`, every one of them downstream of that.
     *
     * **Why a real two-Provider hierarchy and not a mock.** A hand-rolled proxy asserting
     * "ownKeys returns []" would test my model of the trap rather than the trap. This builds the
     * actual primitive — a parent holding the data, a child resolving through it — so the arm fails if
     * `Provider`'s enumeration semantics ever diverge from what this repair assumes. The one
     * substitution against production is the leaf VALUES (30/120/300 rather than the shipped
     * 150/120/300); the parent/child resolution path, the proxy, and both traps are the real ones.
     */
    test('REGRESSION — configure accepts a live AiConfig node whose leaves are INHERITED, not local', () => {
        const
            parent = Neo.create(StateProvider, {
                data: {wakeDispatch: {coalesceWindowSeconds: 30, flushRefractorySeconds: 120, flushHardCapSeconds: 300}}
            }),
            child  = Neo.create(StateProvider, {data: {unrelatedLocalLeaf: 1}});

        child.getParent = () => parent;

        const node = child.data.wakeDispatch;

        // The trap itself, pinned first: this is WHY the spread failed, and if these two ever stop
        // disagreeing the regression below would pass for the wrong reason.
        expect(node.coalesceWindowSeconds, 'the named read must resolve up the parent chain').toBe(30);
        expect(Object.keys(node), 'enumeration must NOT see inherited leaves — the trap under test').toEqual([]);
        expect({...node}, 'spreading this node is measurably lossy').toEqual({});

        // The repair: configure must survive the node itself, by reference.
        expect(() => CoalescingEngineService.configure(node, {resolveDeliveryReadState: null})).not.toThrow();
        expect(CoalescingEngineService.defaultWindowSeconds).toBe(30);
        expect(CoalescingEngineService.refractoryMs).toBe(120000);
        expect(CoalescingEngineService.hardCapMs).toBe(300000);

        parent.destroy?.();
        child.destroy?.()
    });

    test('REGRESSION — the Memory Core entrypoint hands the node over without materializing it', () => {
        // The behavioural arm above proves `configure` CAN take a live node; it cannot prove the
        // entrypoint actually does. This is the call site that broke, asserted directly — a future
        // edit reintroducing the spread fails here even if it never runs a container.
        const serverSource = fs.readFileSync(
            path.join(repoRoot, 'ai/mcp/server/memory-core/Server.mjs'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        expect(serverSource, 'never spread an AiConfig node — `ownKeys` drops inherited leaves')
            .not.toMatch(/configure\(\s*\{\s*\.\.\.\s*wakeDispatch/);
        expect(serverSource, 'the node must still reach configure by reference')
            .toMatch(/CoalescingEngineService\.configure\(\s*wakeDispatch\s*,/)
    });

});
