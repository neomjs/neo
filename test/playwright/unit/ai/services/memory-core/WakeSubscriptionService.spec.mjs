import {setup} from '../../../../setup.mjs';

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

import {test, expect} from '@playwright/test';
import crypto         from 'crypto';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

// Stub Neo.get to keep data-record boot behavior from masking wake-subscription coverage.
// The setup regression is outside this spec's delivery contract.
if (!Neo.get) Neo.get = () => null;

import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe('Neo.ai.services.memory-core.WakeSubscriptionService', () => {
    test.describe.configure({mode: 'serial'});
    let WakeSubscriptionService, GraphService, LifecycleService, CoalescingEngineService, callTool, originalAutoSave;
    let dbPath;

    test.beforeAll(async () => {
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        dbPath = path.join(tmpDir, `neo-wake-subscription-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        aiConfig.storagePaths.graph = dbPath;

        if (!aiConfig.collections) aiConfig.collections = {};
        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        GraphService            = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs')).default;
        CoalescingEngineService = (await import('../../../../../../ai/services/memory-core/CoalescingEngineService.mjs')).default;
        LifecycleService        = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        ({callTool}             = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'));

        const GraphMaintenanceService = (await import('../../../../../../ai/services/graph/GraphMaintenanceService.mjs')).default;
        globalThis.GraphMaintenanceService = GraphMaintenanceService;

        const { TestLifecycleHelper } = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, dbPath, fs, 'clear');

        if (!LifecycleService._initPromise) { await LifecycleService.initAsync(); } else { await LifecycleService.ready(); }

        originalAutoSave         = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager, TestLifecycleHelper } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, dbPath, fs, 'clear');
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
        GraphService.upsertNode({
            id        : 'AGENT:*',
            type      : 'BroadcastSentinel',
            name      : 'Broadcast',
            properties: {accountType: 'sentinel'}
        });
    });

    test.afterEach(async () => {
        WakeSubscriptionService.subscriptionCache.clear();
        WakeSubscriptionService.liveCursor = 0;
    });

    function insertDurableSubscription({
        subscriptionId = `WAKE_SUB:${crypto.randomUUID()}`,
        owner = '@alice',
        trigger = 'SENT_TO_ME',
        filters = {},
        harnessTarget = 'bridge-daemon',
        harnessTargetMetadata = {appName: 'Codex'},
        status = 'active',
        createdAt = '2026-05-04T20:00:00.000Z',
        updatedAt = createdAt
    } = {}) {
        const sqlite = GraphService.db.storage.db;
        const node = {
            id        : subscriptionId,
            label     : 'WAKE_SUBSCRIPTION',
            properties: {
                agentIdentity: owner,
                trigger,
                filters,
                harnessTarget,
                harnessTargetMetadata,
                createdAt,
                updatedAt,
                userId       : owner,
                sharedEntity : false,
                status
            }
        };
        const edgeId = `EDGE:${crypto.randomUUID()}`;
        const edge = {
            id        : edgeId,
            source    : owner,
            target    : subscriptionId,
            type      : 'SUBSCRIBES_TO',
            properties: {
                weight: 1,
                userId: owner
            }
        };

        sqlite.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)').run(subscriptionId, owner, JSON.stringify(node));
        sqlite.prepare('INSERT INTO Edges (id, user_id, source, target, type, data) VALUES (?, ?, ?, ?, ?, ?)')
            .run(edgeId, owner, owner, subscriptionId, 'SUBSCRIBES_TO', JSON.stringify(edge));

        return {subscriptionId, edgeId};
    }

    // -----------------------------------------------------------------------------
    // bootstrap
    // -----------------------------------------------------------------------------

    test.describe('bootstrap', () => {
        test('creates new subscription from identity template', async () => {
            // Give Alice a template
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
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

        test('bootstraps a volatile HarnessPresence overlay from boot address metadata (#12422)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({
                    action          : 'bootstrap',
                    bootId          : 'boot-addressed',
                    pid             : 12345,
                    now             : '2026-06-04T00:00:00.000Z',
                    overrideMetadata: {
                        instanceAddress: '/Users/example/.antigravity-instances/Neo',
                        addressType    : 'userDataDir'
                    },
                    presence: {
                        state       : 'idle',
                        wakePolicy  : 'immediate',
                        capabilities: ['turn/start']
                    }
                });

                const presenceNode = GraphService.db.nodes.get('HARNESS_PRESENCE:@alice:boot-addressed');
                expect(presenceNode.label).toBe('HARNESS_PRESENCE');
                expect(presenceNode.properties.agentIdentity).toBe('@alice');
                expect(presenceNode.properties.subscriptionId).toBe(res.subscriptionId);
                expect(presenceNode.properties.state).toBe('idle');
                expect(presenceNode.properties.wakePolicy).toBe('immediate');
                expect(presenceNode.properties.source).toBe('mcp-client');
                expect(presenceNode.properties.instanceAddress).toBe('/Users/example/.antigravity-instances/Neo');
                expect(presenceNode.properties.addressType).toBe('userDataDir');
                expect(presenceNode.properties.pid).toBe(12345);
                expect(presenceNode.properties.bootId).toBe('boot-addressed');
                expect(presenceNode.properties.lastSeenAt).toBe('2026-06-04T00:00:00.000Z');
                expect(presenceNode.properties.freshUntil).toBe('2026-06-04T00:05:00.000Z');
                expect(presenceNode.properties.expiresAt).toBe('2026-06-04T00:10:00.000Z');
                expect(presenceNode.properties.capabilities).toEqual(['turn/start']);
            });
        });

        test('returns existing subscription if it matches template (idempotent)', async () => {
            // Give Alice a template
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
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

        test('bootId mismatch plus dead pid retires stale HarnessPresence before upsert (#12422)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            GraphService.upsertNode({
                id        : 'HARNESS_PRESENCE:@alice:old-boot',
                type      : 'HARNESS_PRESENCE',
                name      : 'HarnessPresence @alice',
                properties: {
                    agentIdentity : '@alice',
                    subscriptionId: 'WAKE_SUB:old',
                    state         : 'idle',
                    wakePolicy    : 'immediate',
                    source        : 'mcp-client',
                    bootId        : 'old-boot',
                    pid           : 999999,
                    lastSeenAt    : '2026-06-04T00:00:00.000Z',
                    expiresAt     : '2026-06-04T00:10:00.000Z',
                    status        : 'active'
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.manage({
                    action: 'bootstrap',
                    bootId: 'new-boot',
                    now   : '2026-06-04T00:01:00.000Z',
                    pid   : process.pid
                });
            });

            const oldPresence = GraphService.db.nodes.get('HARNESS_PRESENCE:@alice:old-boot');
            const newPresence = GraphService.db.nodes.get('HARNESS_PRESENCE:@alice:new-boot');

            expect(oldPresence.properties.status).toBe('retired');
            expect(oldPresence.properties.retireReason).toBe('boot-mismatch-pid-dead');
            expect(newPresence.properties.status).toBe('active');
        });

        test('TTL backstop retires HarnessPresence even without a pid (#12422)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            GraphService.upsertNode({
                id        : 'HARNESS_PRESENCE:@alice:expired-boot',
                type      : 'HARNESS_PRESENCE',
                name      : 'HarnessPresence @alice',
                properties: {
                    agentIdentity : '@alice',
                    subscriptionId: 'WAKE_SUB:expired',
                    state         : 'idle',
                    wakePolicy    : 'immediate',
                    source        : 'mcp-client',
                    bootId        : 'expired-boot',
                    lastSeenAt    : '2026-06-04T00:00:00.000Z',
                    expiresAt     : '2026-06-04T00:10:00.000Z',
                    status        : 'active'
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.manage({
                    action: 'bootstrap',
                    bootId: 'ttl-boot',
                    now   : '2026-06-04T00:11:00.000Z',
                    pid   : process.pid
                });
            });

            const expiredPresence = GraphService.db.nodes.get('HARNESS_PRESENCE:@alice:expired-boot');
            expect(expiredPresence.properties.status).toBe('retired');
            expect(expiredPresence.properties.retireReason).toBe('ttl-expired');
        });

        test('recovers template from durable AgentIdentity row when cache is stale', async () => {
            GraphService.upsertNode({
                id        : '@neo-gpt',
                type      : 'AgentIdentity',
                name      : 'Codex',
                properties: {
                    displayName         : 'Codex',
                    modelFamily         : 'gpt',
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: {
                            adapter     : 'osascript',
                            appName     : 'Codex',
                            tabShortcut : null,
                            focusSeedKey: 'r'
                        }
                    }
                }
            });

            const cachedIdentity = GraphService.db.nodes.get('@neo-gpt');
            cachedIdentity.properties = {
                displayName: 'Codex stripped cache stub'
            };

            await RequestContextService.run({agentIdentityNodeId: '@neo-gpt'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap'});
                expect(res.status).toBe('created');
                expect(res.harnessTarget).toBe('bridge-daemon');

                const subscriptionNode = GraphService.db.nodes.get(res.subscriptionId);
                expect(subscriptionNode.properties.trigger).toBe('SENT_TO_ME');
                expect(subscriptionNode.properties.harnessTargetMetadata.adapter).toBe('osascript');
                expect(subscriptionNode.properties.harnessTargetMetadata.appName).toBe('Codex');
                expect(subscriptionNode.properties.harnessTargetMetadata.focusSeedKey).toBe('r');

                const hydratedIdentity = GraphService.db.nodes.get('@neo-gpt');
                expect(hydratedIdentity.properties.subscriptionTemplate.harnessTargetMetadata.adapter).toBe('osascript');
                expect(hydratedIdentity.properties.subscriptionTemplate.harnessTargetMetadata.appName).toBe('Codex');
                expect(hydratedIdentity.properties.subscriptionTemplate.harnessTargetMetadata.focusSeedKey).toBe('r');
            });
        });

        test('throws error if identity has no template', async () => {
            // Bob has no template
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                await expect(WakeSubscriptionService.manage({ action: 'bootstrap' }))
                    .rejects.toThrow("Cannot bootstrap subscription: no subscriptionTemplate found on AgentIdentity '@bob'.");
            });
        });

        // ------------------------------------------------------------------------
        // Cross-session duplicate-accumulation reconciler
        // ------------------------------------------------------------------------

        test('reconciles duplicate active subscriptions at bootstrap, keeping newest (#11182)', async () => {
            // Give Alice a template
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            // Seed 2 active subscriptions for @alice with identical route-tuple but
            // different creation times; only the newest route should remain active.
            const older = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:older-uuid',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-08T17:57:00.000Z',
                updatedAt            : '2026-05-08T17:57:00.000Z'
            });
            const newer = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:newer-uuid',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T17:09:00.000Z',
                updatedAt            : '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });

                // Bootstrap should return the NEWER subscription as existing (reconciler-kept).
                expect(res.subscriptionId).toBe(newer.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Verify durable state: older retired, newer still active.
            const sqlite = GraphService.db.storage.db;
            const olderRow = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(older.subscriptionId);
            const newerRow = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(newer.subscriptionId);

            const olderNode = JSON.parse(olderRow.data);
            const newerNode = JSON.parse(newerRow.data);

            expect(olderNode.properties.status).toBe('retired');
            expect(olderNode.properties.retiredAt).toBeDefined();
            expect(newerNode.properties.status).toBe('active');
        });

        test('reconciler is idempotent on canonical single-active state (#11182)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            const only = insertDurableSubscription({
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });

                expect(res.subscriptionId).toBe(only.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // The single subscription should remain ACTIVE (not erroneously retired).
            const sqlite = GraphService.db.storage.db;
            const row = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(only.subscriptionId);
            expect(JSON.parse(row.data).properties.status).toBe('active');
        });

        test('reconciler retires N-1 when 3+ duplicates exist, keeping newest (#11182)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            const oldest = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:oldest',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-06T12:00:00.000Z'
            });
            const middle = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:middle',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-08T12:00:00.000Z'
            });
            const newest = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:newest',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T12:00:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });

                expect(res.subscriptionId).toBe(newest.subscriptionId);
            });

            const sqlite = GraphService.db.storage.db;
            const states = [oldest, middle, newest].map(s => {
                const row = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(s.subscriptionId);
                return JSON.parse(row.data).properties.status;
            });

            expect(states).toEqual(['retired', 'retired', 'active']);
        });

        test('reconciler preserves distinct route-tuples for same owner (#11183 Cycle 1 GPT-RA1)', async () => {
            // Reconciler must group by canonical route-key (trigger + filters +
            // harnessTarget + appName), not flatten by owner. Two legitimate routes
            // for the same agent must BOTH survive.
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            // Route A: SENT_TO_ME + bridge-daemon + Antigravity (matches bootstrap template)
            const routeA = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:route-a',
                owner                : '@alice',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            // Route B: TASK_STATE_CHANGED + bridge-daemon + Antigravity (distinct trigger)
            const routeB = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:route-b',
                owner                : '@alice',
                trigger              : 'TASK_STATE_CHANGED',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T17:09:30.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });
                // Bootstrap re-uses Route A (matches template); does NOT collapse Route B.
                expect(res.subscriptionId).toBe(routeA.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Both routes survive: distinct route-tuples must NOT be reconciled as duplicates.
            const sqlite = GraphService.db.storage.db;
            const aRow = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(routeA.subscriptionId);
            const bRow = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(routeB.subscriptionId);

            expect(JSON.parse(aRow.data).properties.status).toBe('active');
            expect(JSON.parse(bRow.data).properties.status).toBe('active');
        });

        test('reconciler ignores already-retired or inactive subscriptions (#11182)', async () => {
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            // 1 already-retired + 1 active. Reconciler should treat as canonical (1 active).
            const retired = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:already-retired',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                status               : 'retired',
                createdAt            : '2026-05-08T17:57:00.000Z'
            });
            const active = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:still-active',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity'},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({ action: 'bootstrap' });

                expect(res.subscriptionId).toBe(active.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Already-retired stays retired; active stays active.
            const sqlite = GraphService.db.storage.db;
            const retiredRow = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(retired.subscriptionId);
            const activeRow  = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(active.subscriptionId);

            expect(JSON.parse(retiredRow.data).properties.status).toBe('retired');
            expect(JSON.parse(activeRow.data).properties.status).toBe('active');
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
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'antigravity'}
            })).rejects.toThrow("Invalid appName 'antigravity'. Must be one of: Antigravity, Claude, Codex");
        });
    });

    test('subscribe rejects partial generic instance addressing (#12422)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName        : 'Antigravity',
                    instanceAddress: '4242'
                }
            })).rejects.toThrow('Shape C instance addressing requires harnessTargetMetadata.addressType');
        });
    });

    test('subscribe rejects unknown generic addressType (#12422)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName        : 'Antigravity',
                    instanceAddress: 'frontmost',
                    addressType    : 'frontmost'
                }
            })).rejects.toThrow("Invalid addressType 'frontmost'. Must be one of: userDataDir, pid, tmuxSession, webhookUrl");
        });
    });

    test('subscribe rejects an addressType that resolves to no instance address (#13481)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName    : 'Claude',
                    addressType: 'userDataDir',
                    userDataDir: ''
                }
            })).rejects.toThrow("addressType 'userDataDir' requires a non-empty instance address");
        });
    });

    test('subscribe accepts a legacy userDataDir field as a complete instance address (#13481)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@grace-13481-legacy'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName    : 'Claude',
                    userDataDir: '/Users/x/.claude-grace'
                }
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('subscribe accepts a canonical instanceAddress + addressType pair (#13481)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@grace-13481-canonical'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    appName        : 'Claude',
                    addressType    : 'userDataDir',
                    instanceAddress: '/Users/x/.claude-grace'
                }
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('subscribe accepts canonical appName Antigravity', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity'}
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('subscribe accepts canonical appName Claude', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Claude'}
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('subscribe accepts canonical appName Codex', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Codex'}
            });
            expect(res.subscriptionId).toMatch(/^WAKE_SUB:/);
        });
    });

    test('subscribe reuses cache-cold durable active route instead of duplicating bridge wake delivery (#10717)', async () => {
        const {subscriptionId} = insertDurableSubscription({
            owner                : '@alice',
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {appName: 'Codex', focusSeedKey: 'r'}
        });

        expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
        WakeSubscriptionService.subscriptionCache.clear();

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Codex', focusSeedKey: 'space'}
            });

            expect(res.subscriptionId).toBe(subscriptionId);
            expect(res.status).toBe('existing');
            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
        });

        const refreshedNode = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(subscriptionId).data);
        expect(refreshedNode.properties.harnessTargetMetadata.focusSeedKey).toBe('space');

        const duplicateCount = GraphService.db.storage.db.prepare(`
            SELECT COUNT(*) as count FROM Nodes
            WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
              AND json_extract(data, '$.properties.agentIdentity') = '@alice'
              AND json_extract(data, '$.properties.trigger') = 'SENT_TO_ME'
              AND json_extract(data, '$.properties.harnessTarget') = 'bridge-daemon'
              AND json_extract(data, '$.properties.harnessTargetMetadata.appName') = 'Codex'
              AND COALESCE(json_extract(data, '$.properties.status'), 'active') = 'active'
        `).get().count;

        expect(duplicateCount).toBe(1);
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
                    focusSeedKey  : 'space',
                    tabShortcut   : '3'
                }
            });

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node.properties.harnessTargetMetadata.adapter).toBe('osascript');
            expect(node.properties.harnessTargetMetadata.appName).toBe('Claude');
            expect(node.properties.harnessTargetMetadata.coalesceWindow).toBe(0);
            expect(node.properties.harnessTargetMetadata.focusSeedKey).toBe('space');
            expect(node.properties.harnessTargetMetadata.tabShortcut).toBe('3');
        });
    });

    // The Codex `focusSeedKey: 'space'` round-trip is intentionally absent: runtime wake
    // dispatch fails closed without an explicit operator-validated focus seed. The
    // schema-layer shape remains covered by the Claude round-trip above, without implying
    // Space is the validated Codex configuration.

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

    test('unsubscribe removes cache-cold durable subscription rows visible to wake daemon (#10717)', async () => {
        const {subscriptionId, edgeId} = insertDurableSubscription({
            owner                : '@alice',
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {appName: 'Codex'}
        });

        expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
        expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(false);

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.unsubscribe({subscriptionId});
            expect(res).toEqual({subscriptionId, status: 'removed'});
        });

        const sqlite = GraphService.db.storage.db;
        expect(sqlite.prepare('SELECT id FROM Nodes WHERE id = ?').get(subscriptionId)).toBeUndefined();
        expect(sqlite.prepare('SELECT id FROM Edges WHERE id = ?').get(edgeId)).toBeUndefined();
        expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(false);
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
                harnessTargetMetadata: {coalesceWindow: 60, focusSeedKey: 'r'}
            });

            expect(updateRes.currentState.filters.priority).toBe('high');
            expect(updateRes.currentState.filters.taggedConcepts).toEqual(['critical']);
            expect(updateRes.currentState.harnessTargetMetadata.coalesceWindow).toBe(60);
            expect(updateRes.currentState.harnessTargetMetadata.focusSeedKey).toBe('r');
            expect(updateRes.currentState.agentIdentity).toBe('@alice');

            const node = GraphService.db.nodes.get(subscriptionId);
            expect(node.properties.filters.priority).toBe('high');
            expect(node.properties.harnessTargetMetadata.coalesceWindow).toBe(60);
            expect(node.properties.harnessTargetMetadata.focusSeedKey).toBe('r');
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

    test('list surfaces cache-cold durable caller-owned subscriptions that wake daemon would dispatch (#10717)', async () => {
        const {subscriptionId} = insertDurableSubscription({
            owner                : '@alice',
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {appName: 'Codex'}
        });

        expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
        WakeSubscriptionService.subscriptionCache.clear();

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.list();
            expect(res.subscriptions.map(sub => sub.id)).toContain(subscriptionId);
            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
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

    test('emitHeartbeatPulse writes only a heartbeat GraphLog row and replays through resync', async () => {
        const sqlite = GraphService.db.storage.db;
        const {subscriptionId} = insertDurableSubscription({
            trigger              : 'HEARTBEAT_PULSE',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {appName: 'Codex'}
        });
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});

        expect(emitted.status).toBe('emitted');
        expect(emitted.targetIdentity).toBe('@alice');
        expect(emitted.entityId).toMatch(/^HEARTBEAT_PULSE:@alice:/);
        expect(emitted.logId).toBeGreaterThan(before);

        const messageRows = sqlite.prepare(`
            SELECT COUNT(*) as count
            FROM Nodes
            WHERE json_extract(data, '$.label') = 'MESSAGE'
        `).get().count;
        const sentToRows = sqlite.prepare("SELECT COUNT(*) as count FROM Edges WHERE type = 'SENT_TO'").get().count;
        expect(messageRows).toBe(0);
        expect(sentToRows).toBe(0);

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.resync({subscriptionId, sinceLogId: before});

            expect(res.subscriptionId).toBe(subscriptionId);
            expect(res.eventsReplayed).toBe(1);
            expect(res.lastLogId).toBe(emitted.logId);
            expect(res.events[0]).toMatchObject({
                eventType    : 'wake/heartbeat_pulse',
                logId        : emitted.logId,
                agentIdentity: '@alice',
                subscriptionId,
                payload      : {
                    targetIdentity: '@alice'
                }
            });
        });
    });

    test('emitHeartbeatPulse is an idempotent no-op without an active bridge-daemon subscription', async () => {
        const sqlite = GraphService.db.storage.db;
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});
        const pulseRows = sqlite.prepare(`
            SELECT COUNT(*) as count
            FROM GraphLog
            WHERE log_id > ?
              AND entity_type = 'heartbeat_pulse'
        `).get(before).count;

        expect(emitted).toEqual({
            status        : 'skipped',
            reason        : 'no-active-bridge-daemon-subscription',
            targetIdentity: '@alice'
        });
        expect(pulseRows).toBe(0);
    });

    test('emitHeartbeatPulse fires when only a SENT_TO_ME bridge-daemon subscription exists (Epic #11993 gate fix)', async () => {
        // Production agents establish bridge-daemon routing through SENT_TO_ME subscriptions.
        const sqlite = GraphService.db.storage.db;
        const {subscriptionId} = insertDurableSubscription({
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {appName: 'Codex'}
        });
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});

        expect(emitted.status).toBe('emitted');
        expect(emitted.targetIdentity).toBe('@alice');
        expect(emitted.entityId).toMatch(/^HEARTBEAT_PULSE:@alice:/);
        expect(emitted.logId).toBeGreaterThan(before);

        // resync now delivers the pulse through that existing bridge-daemon route.
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.resync({subscriptionId, sinceLogId: before});
            expect(res.eventsReplayed).toBe(1);
            expect(res.events[0]).toMatchObject({
                eventType    : 'wake/heartbeat_pulse',
                agentIdentity: '@alice',
                subscriptionId,
                payload      : {targetIdentity: '@alice'}
            });
        });
    });

    test('emitHeartbeatPulse still no-ops when subscription is non-bridge-daemon (mcp-notifications / a2a-webhook)', async () => {
        // Non-bridge routes remain outside the heartbeat-pulse transport contract.
        const sqlite = GraphService.db.storage.db;
        insertDurableSubscription({
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'mcp-notifications',
            harnessTargetMetadata: {appName: 'noop'}
        });
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});

        expect(emitted.status).toBe('skipped');
        expect(emitted.reason).toBe('no-active-bridge-daemon-subscription');
        const pulseRows = sqlite.prepare(`
            SELECT COUNT(*) as count FROM GraphLog
            WHERE log_id > ? AND entity_type = 'heartbeat_pulse'
        `).get(before).count;
        expect(pulseRows).toBe(0);
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
            CoalescingEngineService.clearMcpServers();
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
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                // mcp-notifications bypasses coalescing window and pushes immediately
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
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
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
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

        test('does not emit SENT_TO_ME wake for already-read direct messages', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            GraphService.upsertNode({
                id        : 'MSG:READ-DIRECT',
                type      : 'MESSAGE',
                properties: {
                    from   : '@bob',
                    to     : '@alice',
                    subject: 'already handled',
                    readAt : '2026-06-04T12:00:00.000Z'
                }
            });
            GraphService.linkNodes('MSG:READ-DIRECT', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toEqual([]);
        });

        test('emits wake/permission_granted carrying payload.grantedAt for a CAN_* grant edge', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'PERMISSION_GRANTED',
                    harnessTarget: 'mcp-notifications'
                });
            });

            // A CAN_REPLY_TO grant edge from @bob to the subscription owner @alice. The wake eval reads
            // only the edge (type / source / target), so a raw link mirrors the real grant for this test.
            GraphService.upsertNode({id: '@bob', type: 'AGENT_IDENTITY', properties: {}});
            GraphService.linkNodes('@bob', '@alice', 'CAN_REPLY_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents.length).toBe(1);
            expect(emittedEvents[0].params.eventType).toBe('wake/permission_granted');
            expect(emittedEvents[0].params.payload.scope).toBe('CAN_REPLY_TO');
            expect(emittedEvents[0].params.payload.grantedBy).toBe('@bob');
            // payload.grantedAt is a documented wire-contract field — a delivery-time ISO stamp, distinct
            // from the envelope's emittedAt. Regression guard for the shared-evaluator consolidation.
            expect(typeof emittedEvents[0].params.payload.grantedAt).toBe('string');
        });

        test('emits only unread recipient receipts for broadcast SENT_TO_ME wake', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            GraphService.upsertNode({
                id        : 'MSG:BROADCAST-READ',
                type      : 'MESSAGE',
                properties: {from: '@bob', to: 'AGENT:*', subject: 'read receipt', readAt: null}
            });
            GraphService.linkNodes('MSG:BROADCAST-READ', 'AGENT:*', 'SENT_TO', 1.0);
            GraphService.linkNodes('MSG:BROADCAST-READ', '@alice', 'DELIVERED_TO', 1.0, {
                deliveredAt : '2026-06-04T12:00:00.000Z',
                readAt      : '2026-06-04T12:01:00.000Z',
                deliveryKind: 'broadcast'
            });

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toEqual([]);

            GraphService.upsertNode({
                id        : 'MSG:BROADCAST-UNREAD',
                type      : 'MESSAGE',
                properties: {from: '@bob', to: 'AGENT:*', subject: 'unread receipt', readAt: null}
            });
            GraphService.linkNodes('MSG:BROADCAST-UNREAD', 'AGENT:*', 'SENT_TO', 1.0);
            GraphService.linkNodes('MSG:BROADCAST-UNREAD', '@alice', 'DELIVERED_TO', 1.0, {
                deliveredAt : '2026-06-04T12:02:00.000Z',
                readAt      : null,
                deliveryKind: 'broadcast'
            });

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents.length).toBe(1);
            expect(emittedEvents[0].params.eventType).toBe('wake/sent_to_me');
            expect(emittedEvents[0].params.payload).toMatchObject({
                messageId  : 'MSG:BROADCAST-UNREAD',
                isBroadcast: true,
                subject    : 'unread receipt'
            });
        });

        test('does not duplicate receipt-backed broadcasts through the AGENT:* edge', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            GraphService.upsertNode({
                id        : 'MSG:BROADCAST-DEDUP',
                type      : 'MESSAGE',
                properties: {from: '@bob', to: 'AGENT:*', subject: 'dedupe', readAt: null}
            });
            GraphService.linkNodes('MSG:BROADCAST-DEDUP', 'AGENT:*', 'SENT_TO', 1.0);
            GraphService.linkNodes('MSG:BROADCAST-DEDUP', '@alice', 'DELIVERED_TO', 1.0, {
                deliveredAt : '2026-06-04T12:03:00.000Z',
                readAt      : null,
                deliveryKind: 'broadcast'
            });

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents.length).toBe(1);
            expect(emittedEvents[0].params.payload.messageId).toBe('MSG:BROADCAST-DEDUP');
        });

        test('legacy AGENT:* broadcasts still respect message-level readAt', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });
            });

            GraphService.upsertNode({
                id        : 'MSG:LEGACY-READ',
                type      : 'MESSAGE',
                properties: {
                    from   : '@bob',
                    to     : 'AGENT:*',
                    subject: 'legacy read',
                    readAt : '2026-06-04T12:04:00.000Z'
                }
            });
            GraphService.linkNodes('MSG:LEGACY-READ', 'AGENT:*', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toEqual([]);
        });

        test('does not emit for non-matching subscription', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications',
                    filters      : { priority: 'high' }
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
            CoalescingEngineService.addMcpServer(mockMcpServer);
            const initialCursor = WakeSubscriptionService.liveCursor;

            GraphService.upsertNode({id: 'MSG:4', type: 'MESSAGE', properties: {}});
            await WakeSubscriptionService.pump();

            expect(WakeSubscriptionService.liveCursor).toBeGreaterThan(initialCursor);
        });

        test('warms cache with active mcp-notifications subscriptions on first call', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

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
            CoalescingEngineService.addMcpServer(mockMcpServer);

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
            CoalescingEngineService.addMcpServer(mockMcpServer);

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

    test.describe('who_is_online (#13498 Substrate B)', () => {
        const T0   = '2026-06-19T12:00:00.000Z',
              T0ms = new Date(T0).getTime(),
              iso  = ms => new Date(ms).toISOString();

        function seedAgent(id, {participationStatus = 'active', family = 'claude'} = {}) {
            GraphService.upsertNode({
                id,
                type      : 'AgentIdentity',
                name      : id,
                properties: {participationStatus, family, displayName: id}
            });
        }

        function seedActivity(owner, {timestamp = T0} = {}) {
            // Mirrors a swarm (stdio) add_memory graph projection: an AGENT_MEMORY node carrying
            // agentIdentity + timestamp and NO userId (→ user_id NULL → RLS-visible to every caller,
            // as stdio-mode memories are). The who_is_online recency read keys on this node.
            GraphService.upsertNode({
                id        : `AGENT_MEMORY:${owner}:${timestamp}`,
                type      : 'AGENT_MEMORY',
                name      : `Memory: ${timestamp}`,
                properties: {agentIdentity: owner, timestamp, sessionId: 'sess-test'}
            });
        }

        function seedBeacon(owner, {turnId = 'turn-1', startedAt = T0, freshUntil, expiresAt} = {}) {
            // Mirrors TurnPresenceService.recordTurnPresence's active turn-presence node — the local
            // beacon who_is_online consults for the mid-turn rescue (fresh = freshUntil > now).
            GraphService.upsertNode({
                id        : `AGENT_TURN_PRESENCE:${owner}:${turnId}`,
                type      : 'AGENT_TURN_PRESENCE',
                name      : `TurnPresence ${owner}`,
                properties: {
                    agentIdentity : owner,
                    turnId,
                    startedAt,
                    lastProgressAt: startedAt,
                    status        : 'active',
                    freshUntil    : freshUntil || iso(T0ms + 5 * 60 * 1000),
                    expiresAt     : expiresAt  || iso(T0ms + 60 * 60 * 1000)
                }
            });
        }

        test('participationStatus hard gate: benched reports offline even with fresh activity (verbose)', async () => {
            seedAgent('@neo-benched', {participationStatus: 'operator_benched'});
            seedActivity('@neo-benched', {timestamp: T0});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-benched');

            expect(entry).toBeTruthy();
            expect(entry.online).toBe(false);
            expect(entry.participationStatus).toBe('operator_benched');
            expect(entry.reason).toContain('benched');
        });

        test('fresh add_memory activity → online (recency-primary, verbose)', async () => {
            seedAgent('@neo-active');
            seedActivity('@neo-active', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-active');

            expect(entry.online).toBe(true);
            expect(entry.reason).toContain('recent add_memory activity');
            expect(entry.signals.activityRecency.fresh).toBe(true);
        });

        test('stale add_memory activity → offline (past the freshness window, verbose)', async () => {
            seedAgent('@neo-stale');
            // last write 20 min ago — beyond the 15-min freshness window
            seedActivity('@neo-stale', {timestamp: iso(T0ms - 20 * 60 * 1000)});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-stale');

            expect(entry.online).toBe(false);
            expect(entry.reason).toContain('stale add_memory activity');
            expect(entry.signals.activityRecency.fresh).toBe(false);
            expect(entry.signals.turnPresence).toBeNull(); // no beacon → the rescue is a no-op, base verdict stands
        });

        test('stale add_memory but FRESH turn-presence beacon → online (local mid-turn rescue, verbose)', async () => {
            seedAgent('@neo-midturn');
            seedActivity('@neo-midturn', {timestamp: iso(T0ms - 20 * 60 * 1000)}); // memory stale
            seedBeacon('@neo-midturn', {freshUntil: iso(T0ms + 5 * 60 * 1000)});    // beacon fresh

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-midturn');

            expect(entry.online).toBe(true);
            expect(entry.reason).toContain('mid-turn rescue');
            expect(entry.signals.turnPresence.fresh).toBe(true);
        });

        test('stale add_memory + STALE beacon → offline (beacon non-gating, graceful, verbose)', async () => {
            seedAgent('@neo-stalebeacon');
            seedActivity('@neo-stalebeacon', {timestamp: iso(T0ms - 20 * 60 * 1000)}); // memory stale
            seedBeacon('@neo-stalebeacon', {freshUntil: iso(T0ms - 5 * 60 * 1000)});    // beacon active but not fresh

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-stalebeacon');

            expect(entry.online).toBe(false);
            expect(entry.reason).toContain('stale add_memory activity');
        });

        test('benched hard-gate is NOT rescued by a fresh beacon (verbose)', async () => {
            seedAgent('@neo-benched-beacon', {participationStatus: 'operator_benched'});
            seedBeacon('@neo-benched-beacon', {freshUntil: iso(T0ms + 5 * 60 * 1000)}); // fresh beacon

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-benched-beacon');

            expect(entry.online).toBe(false); // benched hard-gate sits above the rescue branch
            expect(entry.reason).toContain('benched');
        });

        test('no add_memory activity → offline (dark) + signals.activityRecency null (verbose)', async () => {
            seedAgent('@neo-dark');

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-dark');

            expect(entry.online).toBe(false);
            expect(entry.reason).toContain('no add_memory activity');
            expect(entry.signals.activityRecency).toBeNull();
        });

        test('roster-scoping: an agent\'s OWN activity marks it online regardless of the user_id tenant tag', async () => {
            seedAgent('@neo-foreign-tenant');
            // who_is_online is a ROSTER tool: it reports each rostered agent's OWN latest activity
            // (matched by agentIdentity), NOT per-caller tenant. Fresh activity tagged with a foreign
            // userId therefore still marks the agent online. The prior per-caller user_id RLS here hid
            // same-deployment teammates from each other. Cross-tenant isolation belongs at the roster
            // scope (a tenant-scoped _listAgentIdentityNodes) for a multi-tenant cloud, tracked separately.
            GraphService.upsertNode({
                id        : 'AGENT_MEMORY:@neo-foreign-tenant:fresh',
                type      : 'AGENT_MEMORY',
                name      : 'Memory: fresh',
                properties: {agentIdentity: '@neo-foreign-tenant', timestamp: iso(T0ms - 2 * 60 * 1000), userId: 'some-other-tenant', sessionId: 'sess-test'}
            });

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-foreign-tenant');

            expect(entry.online).toBe(true);
            expect(entry.signals.activityRecency.fresh).toBe(true);
        });

        test('terse default: {summary, online, idle, benched} identity arrays — no per-agent essay', async () => {
            seedAgent('@neo-t-online');
            seedActivity('@neo-t-online', {timestamp: iso(T0ms - 2 * 60 * 1000)});
            seedAgent('@neo-t-idle');                                              // active, no activity → idle
            seedAgent('@neo-t-benched', {participationStatus: 'temporarily_unreachable'});

            const result = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(typeof result.summary).toBe('string');
            expect(result.agents).toBeUndefined();
            expect(result.signalStatus).toBeUndefined();
            expect(result.online).toContain('@neo-t-online');
            expect(result.idle).toContain('@neo-t-idle');
            expect(result.idle).not.toContain('@neo-t-online');
            expect(result.benched).toContain('@neo-t-benched');
            expect(result.summary).toContain(`${result.online.length} online`);
        });

        test('verbose:true returns the full per-agent projection + signalStatus (no terse summary)', async () => {
            seedAgent('@neo-v');
            seedActivity('@neo-v', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            const result = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});

            expect(result.signalStatus).toContain('add_memory-recency');
            expect(result.beaconStatus).toBeUndefined();
            expect(result.summary).toBeUndefined();
            expect(Array.isArray(result.agents)).toBe(true);
            expect(result.agents.find(a => a.identity === '@neo-v').online).toBe(true);
        });

        test('signalStatus (verbose) names the add_memory-recency signal (no beacon field)', async () => {
            seedAgent('@neo-sig');

            const result = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});

            expect(result.signalStatus).toContain('add_memory-recency');
            expect(result.beaconStatus).toBeUndefined();
        });

        test('family filter narrows the roster (verbose)', async () => {
            seedAgent('@neo-claude-x', {family: 'claude'});
            seedAgent('@neo-gpt-x',    {family: 'gpt'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({family: 'gpt', verbose: true, now: new Date(T0)});
            const ids      = agents.map(a => a.identity);

            expect(ids).toContain('@neo-gpt-x');
            expect(ids).not.toContain('@neo-claude-x');
        });

        test('callable through the MCP callTool dispatch — terse default (registration + openapi)', async () => {
            seedAgent('@neo-dispatch');

            const res = await callTool('who_is_online', {});

            expect(typeof res.summary).toBe('string');
            expect(Array.isArray(res.online)).toBe(true);
            expect(Array.isArray(res.idle)).toBe(true);
            // @neo-dispatch is rostered + active but has no activity → idle
            expect(res.idle).toContain('@neo-dispatch');
        });
    });
});
