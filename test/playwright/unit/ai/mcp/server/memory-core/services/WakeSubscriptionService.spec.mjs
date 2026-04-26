import {setup} from '../../../../../../setup.mjs';

const appName = 'WakeSubscriptionServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import fs                    from 'fs-extra';
import path                  from 'path';
import Neo                   from '../../../../../../../../src/Neo.mjs';

// Stub Neo.get to bypass Playwright boot regression (#10384) in data records
if (!Neo.get) Neo.get = () => null;

import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.WakeSubscriptionService', () => {
    test.describe.configure({mode: 'serial'});
    let WakeSubscriptionService, GraphService, LifecycleService, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        dbPath = path.join(tmpDir, `neo-wake-subscription-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        GraphService            = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/WakeSubscriptionService.mjs')).default;
        LifecycleService        = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = dbPath;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        originalAutoSave         = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        GraphService.db.autoSave = originalAutoSave;
        if (fs.existsSync(dbPath)) {
            try { fs.unlinkSync(dbPath); }            catch (e) {}
            try { fs.unlinkSync(dbPath + '-wal'); }   catch (e) {}
            try { fs.unlinkSync(dbPath + '-shm'); }   catch (e) {}
        }
    });

    test.beforeEach(async () => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        // Symmetric afterEach via beforeEach idempotence: also clear the in-memory cache
        // (per `feedback_symmetric_spec_cleanup.md` — Playwright fullyParallel can interleave
        // sibling specs in the same worker, so cross-singleton state must be reset).
        WakeSubscriptionService.subscriptionCache.clear();

        GraphService.upsertNode({id: '@alice', type: 'AGENT', name: 'Alice', properties: {}});
        GraphService.upsertNode({id: '@bob',   type: 'AGENT', name: 'Bob',   properties: {}});
    });

    test.afterEach(async () => {
        WakeSubscriptionService.subscriptionCache.clear();
    });

    // -----------------------------------------------------------------------------
    // subscribe
    // -----------------------------------------------------------------------------

    test('subscribe creates a WAKE_SUBSCRIPTION node + SUBSCRIBES_TO edge for the caller', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });

            expect(res.subscriptionId).toMatch(/^WAKE_SUB:[0-9a-f-]{36}$/);
            expect(res.harnessTarget).toBe('mcp-notifications');
            expect(res.signingKey).toBeUndefined(); // Only Shape B gets one

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node).toBeDefined();
            expect(node.label).toBe('WAKE_SUBSCRIPTION');
            expect(node.properties.agentIdentity).toBe('@alice');
            expect(node.properties.trigger).toBe('SENT_TO_ME');
            expect(node.properties.harnessTarget).toBe('mcp-notifications');
            expect(node.properties.status).toBe('active');

            const edges = GraphService.db.edges.items.filter(e => e.type === 'SUBSCRIBES_TO');
            expect(edges.length).toBe(1);
            expect(edges[0].source).toBe('@alice');
            expect(edges[0].target).toBe(res.subscriptionId);

            expect(WakeSubscriptionService.subscriptionCache.has(res.subscriptionId)).toBe(true);
        });
    });

    test('subscribe with a2a-webhook generates an HMAC signing key', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'TASK_STATE_CHANGED',
                harnessTarget        : 'a2a-webhook',
                harnessTargetMetadata: {url: 'https://example.com/wake'}
            });

            expect(res.signingKey).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node.properties.harnessTargetMetadata.signingKey).toBe(res.signingKey);
            expect(node.properties.harnessTargetMetadata.url).toBe('https://example.com/wake');
        });
    });

    test('subscribe with a2a-webhook but no url throws', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'a2a-webhook'
            })).rejects.toThrow('Shape B (a2a-webhook) requires harnessTargetMetadata.url');
        });
    });

    test('subscribe rejects invalid trigger', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger      : 'INVALID',
                harnessTarget: 'mcp-notifications'
            })).rejects.toThrow("Invalid trigger 'INVALID'");
        });
    });

    test('subscribe rejects invalid harnessTarget', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'invalid-target'
            })).rejects.toThrow("Invalid harnessTarget 'invalid-target'");
        });
    });

    test('subscribe throws without an agent identity context', async () => {
        await expect(WakeSubscriptionService.subscribe({
            trigger      : 'SENT_TO_ME',
            harnessTarget: 'mcp-notifications'
        })).rejects.toThrow('no agent identity context bound');
    });

    // -----------------------------------------------------------------------------
    // unsubscribe
    // -----------------------------------------------------------------------------

    test('unsubscribe removes the WAKE_SUBSCRIPTION node + SUBSCRIBES_TO edge', async () => {
        let subscriptionId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });
            subscriptionId = res.subscriptionId;

            const removeRes = await WakeSubscriptionService.unsubscribe({subscriptionId});
            expect(removeRes.status).toBe('removed');

            expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
            expect(GraphService.db.edges.items.filter(e => e.target === subscriptionId).length).toBe(0);
            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(false);
        });
    });

    test('unsubscribe denies cross-owner access', async () => {
        let subscriptionId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            }));
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(WakeSubscriptionService.unsubscribe({subscriptionId}))
                .rejects.toThrow('Permission denied');
        });

        // Subscription still exists
        expect(GraphService.db.nodes.get(subscriptionId)).toBeDefined();
    });

    // -----------------------------------------------------------------------------
    // update
    // -----------------------------------------------------------------------------

    test('update mutates filters + harnessTargetMetadata, preserves agentIdentity', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'mcp-notifications',
                harnessTargetMetadata: {coalesceWindow: 30}
            });

            const updateRes = await WakeSubscriptionService.update({
                subscriptionId,
                filters              : {priority: 'high', taggedConcepts: ['critical']},
                harnessTargetMetadata: {coalesceWindow: 60}
            });

            expect(updateRes.currentState.filters.priority).toBe('high');
            expect(updateRes.currentState.filters.taggedConcepts).toEqual(['critical']);
            expect(updateRes.currentState.harnessTargetMetadata.coalesceWindow).toBe(60);
            expect(updateRes.currentState.agentIdentity).toBe('@alice');

            const node = GraphService.db.nodes.get(subscriptionId);
            expect(node.properties.filters.priority).toBe('high');
            expect(node.properties.harnessTargetMetadata.coalesceWindow).toBe(60);
        });
    });

    test('update denies cross-owner access', async () => {
        let subscriptionId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            }));
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(WakeSubscriptionService.update({
                subscriptionId,
                filters: {priority: 'high'}
            })).rejects.toThrow('Permission denied');
        });
    });

    // -----------------------------------------------------------------------------
    // list
    // -----------------------------------------------------------------------------

    test('list returns only the caller-owned subscriptions', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME',         harnessTarget: 'mcp-notifications'});
            await WakeSubscriptionService.subscribe({trigger: 'TASK_STATE_CHANGED', harnessTarget: 'disabled'});
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications'});
        });

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.list();
            expect(res.subscriptions.length).toBe(2);
            for (const sub of res.subscriptions) {
                expect(sub.agentIdentity).toBe('@alice');
            }
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            const res = await WakeSubscriptionService.list();
            expect(res.subscriptions.length).toBe(1);
            expect(res.subscriptions[0].agentIdentity).toBe('@bob');
        });
    });

    test('list with subscriptionId returns single subscription if owned, empty otherwise', async () => {
        let aliceSubId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({subscriptionId: aliceSubId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            }));
        });

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.list({subscriptionId: aliceSubId});
            expect(res.subscriptions.length).toBe(1);
            expect(res.subscriptions[0].id).toBe(aliceSubId);
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            const res = await WakeSubscriptionService.list({subscriptionId: aliceSubId});
            expect(res.subscriptions.length).toBe(0);
        });
    });

    // -----------------------------------------------------------------------------
    // manage dispatcher
    // -----------------------------------------------------------------------------

    test('manage dispatches to the correct action handler', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.manage({
                action       : 'subscribe',
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'disabled'
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);

            const listRes = await WakeSubscriptionService.manage({action: 'list'});
            expect(listRes.subscriptions.length).toBe(1);

            const removeRes = await WakeSubscriptionService.manage({action: 'unsubscribe', subscriptionId: res.subscriptionId});
            expect(removeRes.status).toBe('removed');
        });
    });

    test('manage rejects invalid action', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.manage({action: 'nonexistent'}))
                .rejects.toThrow("Invalid action 'nonexistent'");
        });
    });

    // -----------------------------------------------------------------------------
    // resync (basic structural — full GraphLog-replay correctness deferred to Shape A/B/C subs)
    // -----------------------------------------------------------------------------

    test('resync returns empty events when GraphLog has no matching deltas after sinceLogId', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });

            // Use a very high sinceLogId so no entries match
            const res = await WakeSubscriptionService.resync({
                subscriptionId,
                sinceLogId: 999999
            });

            expect(res.subscriptionId).toBe(subscriptionId);
            expect(res.events).toEqual([]);
            expect(res.eventsReplayed).toBe(0);
        });
    });
});
