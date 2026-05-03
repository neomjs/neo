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

// Stub Neo.get to bypass Playwright boot regression (#10384) in data records.
// This workaround demonstrates that #10384 affects Phase 3 cross-spec tests,
// proving the regression affects newcomers. See triage note in PR #10387.
if (!Neo.get) Neo.get = () => null;

import RequestContextService from '../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.WakeSubscriptionService', () => {
    test.describe.configure({mode: 'serial'});
    let WakeSubscriptionService, GraphService, LifecycleService, CoalescingEngineService, callTool, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        dbPath = path.join(tmpDir, `neo-wake-subscription-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = dbPath;

        GraphService            = (await import('../../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/WakeSubscriptionService.mjs')).default;
        CoalescingEngineService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/CoalescingEngineService.mjs')).default;
        LifecycleService        = (await import('../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
        ({callTool}             = await import('../../../../../../../../ai/mcp/server/memory-core/services/toolService.mjs'));

        const GraphMaintenanceService = (await import('../../../../../../../../ai/daemons/services/GraphMaintenanceService.mjs')).default;
        globalThis.GraphMaintenanceService = GraphMaintenanceService;

        // Force re-initialization to break free from Playwright worker-reuse poisoning
        LifecycleService._initPromise = null;
        if (GraphService.db) {
            if (GraphService.db.storage && typeof GraphService.db.storage.close === 'function') {
                GraphService.db.storage.close();
            }
            GraphService.db = null;
        }
        GraphService._initPromise = null;
        if (Neo.idMap && Neo.idMap['memory-core-graph']) {
            Neo.idMap['memory-core-graph'].destroy();
            delete Neo.idMap['memory-core-graph'];
        }

        await LifecycleService.initAsync();

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
        WakeSubscriptionService.liveCursor = 0;

        GraphService.upsertNode({id: '@alice', type: 'AGENT', name: 'Alice', properties: {}});
        GraphService.upsertNode({id: '@bob',   type: 'AGENT', name: 'Bob',   properties: {}});
    });

    test.afterEach(async () => {
        WakeSubscriptionService.subscriptionCache.clear();
        WakeSubscriptionService.liveCursor = 0;
    });

    // -----------------------------------------------------------------------------
    // bootstrap
    // -----------------------------------------------------------------------------

    test.describe('bootstrap', () => {
        test('creates new subscription from identity template', async () => {
            // Give Alice a template
            GraphService.upsertNode({
                id: '@alice',
                type: 'AGENT',
                name: 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger: 'SENT_TO_ME',
                        harnessTarget: 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });
                expect(res.status).toBe('created');
                expect(res.subscriptionId).toMatch(/^WAKE_SUB:[0-9a-f-]{36}$/);
                expect(res.harnessTarget).toBe('bridge-daemon');

                const node = GraphService.db.nodes.get(res.subscriptionId);
                expect(node.properties.trigger).toBe('SENT_TO_ME');
                expect(node.properties.harnessTargetMetadata.appName).toBe('Antigravity');
            });
        });

        test('returns existing subscription if it matches template (idempotent)', async () => {
            // Give Alice a template
            GraphService.upsertNode({
                id: '@alice',
                type: 'AGENT',
                name: 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger: 'SENT_TO_ME',
                        harnessTarget: 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const first = await WakeSubscriptionService.manage({ action: 'bootstrap' });
                expect(first.status).toBe('created');

                const second = await WakeSubscriptionService.manage({ action: 'bootstrap' });
                expect(second.status).toBe('existing');
                expect(second.subscriptionId).toBe(first.subscriptionId);
            });
        });

        test('throws error if identity has no template', async () => {
            // Bob has no template
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                await expect(WakeSubscriptionService.manage({ action: 'bootstrap' }))
                    .rejects.toThrow("Cannot bootstrap subscription: no subscriptionTemplate found on AgentIdentity '@bob'.");
            });
        });
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

    test('subscribe with bridge-daemon but no appName throws', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon'
            })).rejects.toThrow('Shape C (bridge-daemon) requires harnessTargetMetadata.appName');
        });
    });

    test('subscribe rejects non-canonical appName', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {appName: 'antigravity'}
            })).rejects.toThrow("Invalid appName 'antigravity'. Must be one of: Antigravity, Claude");
        });
    });

    test('subscribe accepts canonical appName', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity'}
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('MCP tool preserves explicit bridge-daemon metadata fields', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await callTool('manage_wake_subscription', {
                action               : 'subscribe',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter       : 'osascript',
                    appName       : 'Claude',
                    coalesceWindow: 0,
                    tabShortcut   : '3'
                }
            });

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node.properties.harnessTargetMetadata.adapter).toBe('osascript');
            expect(node.properties.harnessTargetMetadata.appName).toBe('Claude');
            expect(node.properties.harnessTargetMetadata.coalesceWindow).toBe(0);
            expect(node.properties.harnessTargetMetadata.tabShortcut).toBe('3');
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
    // durability (GC)
    // -----------------------------------------------------------------------------

    test('WAKE_SUBSCRIPTION nodes survive GraphMaintenanceService GC (Apoptosis regression #10515)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });

            const subscriptionId = res.subscriptionId;

            // Assert subscription is alive
            expect(GraphService.db.nodes.get(subscriptionId)).toBeDefined();

            // Run full garbage collection sequence (simulate DreamService tick)
            const GraphMaintenanceService = globalThis.GraphMaintenanceService;
            await GraphMaintenanceService.runGarbageCollection();

            // Assert subscription SURVIVED the cull
            expect(GraphService.db.nodes.get(subscriptionId)).toBeDefined();

            // Assert the edge survived
            const edges = GraphService.db.edges.items.filter(e => e.target === subscriptionId);
            expect(edges.length).toBe(1);
            expect(edges[0].source).toBe('@alice');
        });
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
    // -----------------------------------------------------------------------------
    // pump()
    // -----------------------------------------------------------------------------

    test.describe('pump', () => {
        let emittedEvents = [];
        let mockMcpServer = {
            notification: async (event) => {
                emittedEvents.push(event);
            }
        };

        test.beforeEach(async () => {
            emittedEvents = [];
            CoalescingEngineService.setMcpServer(null);
            CoalescingEngineService.clearAll();
        });

        test('graceful no-op when CoalescingEngineService has no mcpServer registered', async () => {
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications'});
            });

            // Make a mutation
            GraphService.upsertNode({id: 'MSG:1', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:1', '@alice', 'SENT_TO', 1.0);

            // pump shouldn't fail and shouldn't emit
            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();
            expect(emittedEvents.length).toBe(0);
        });

        test('emits raw event for matching mcp-notifications subscription (bypass coalescing) after pump', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                // mcp-notifications bypasses coalescing window and pushes immediately
                await WakeSubscriptionService.subscribe({
                    trigger: 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            // Make a mutation
            GraphService.upsertNode({id: 'MSG:2', type: 'MESSAGE', properties: {from: '@bob', subject: 'hello'}});
            GraphService.linkNodes('MSG:2', '@alice', 'SENT_TO', 1.0);

            const originalEnqueue = CoalescingEngineService.enqueue;

            await WakeSubscriptionService.pump();

            // Wait for coalescing engine to dispatch
            await CoalescingEngineService.flushAll();

            CoalescingEngineService.enqueue = originalEnqueue;

            expect(emittedEvents.length).toBe(1);
            expect(emittedEvents[0].method).toBe('notifications/message');
            expect(emittedEvents[0].params.eventType).toBe('wake/sent_to_me');
            expect(emittedEvents[0].params.payload.messageId).toBe('MSG:2');
            expect(emittedEvents[0].params.payload.from).toBe('@bob');
            expect(emittedEvents[0].params.payload.subject).toBe('hello');
        });

        test('does not emit SENT_TO_ME wake for wakeSuppressed mailbox-only messages', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger: 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            GraphService.upsertNode({
                id        : 'MSG:SUPPRESSED',
                type      : 'MESSAGE',
                properties: {
                    from          : '@alice',
                    to            : '@alice',
                    subject       : 'Sunset handover',
                    readAt        : null,
                    taggedConcepts: ['sunset-protocol-handover'],
                    wakeSuppressed: true
                }
            });
            GraphService.linkNodes('MSG:SUPPRESSED', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents.length).toBe(0);
            expect(GraphService.db.nodes.get('MSG:SUPPRESSED').properties.readAt).toBeNull();
        });

        test('does not emit for non-matching subscription', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger: 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications',
                    filters: { priority: 'high' }
                });
            });

            // Make a mutation that does NOT match the filter
            GraphService.upsertNode({id: 'MSG:3', type: 'MESSAGE', properties: {from: '@bob', priority: 'low'}});
            GraphService.linkNodes('MSG:3', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();
            expect(emittedEvents.length).toBe(0);
        });

        test('advances liveCursor per delta.lastLogId', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);
            const initialCursor = WakeSubscriptionService.liveCursor;

            GraphService.upsertNode({id: 'MSG:4', type: 'MESSAGE', properties: {}});
            await WakeSubscriptionService.pump();

            expect(WakeSubscriptionService.liveCursor).toBeGreaterThan(initialCursor);
        });

        test('warms cache with active mcp-notifications subscriptions on first call', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            let subId;
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications'});
                subId = res.subscriptionId;
            });

            // Manually clear cache to simulate a fresh boot
            WakeSubscriptionService.subscriptionCache.clear();
            expect(WakeSubscriptionService.subscriptionCache.has(subId)).toBe(false);

            GraphService.upsertNode({id: 'MSG:5', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:5', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            // Should have lazily warmed the cache and successfully emitted
            expect(WakeSubscriptionService.subscriptionCache.has(subId)).toBe(true);
            expect(emittedEvents.length).toBe(1);
        });

        test('skips bridge-daemon / a2a-webhook / disabled targets', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger              : 'SENT_TO_ME',
                    harnessTarget        : 'bridge-daemon',
                    harnessTargetMetadata: {appName: 'Claude'}
                });
                await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'a2a-webhook', harnessTargetMetadata: {url: 'test'}});
                await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'disabled'});
            });

            GraphService.upsertNode({id: 'MSG:6', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:6', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();
            // None of the subscriptions target mcp-notifications
            expect(emittedEvents.length).toBe(0);
        });

        test('concurrent pump() invocations do not double-emit', async () => {
            CoalescingEngineService.setMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications'});
            });

            GraphService.upsertNode({id: 'MSG:7', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:7', '@alice', 'SENT_TO', 1.0);

            // Execute concurrent pumps
            await Promise.all([
                WakeSubscriptionService.pump(),
                WakeSubscriptionService.pump()
            ]);

            await CoalescingEngineService.flushAll();

            // If the race condition was present, both might emit the same event
            expect(emittedEvents.length).toBe(1);
        });
    });
});
