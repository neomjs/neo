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

import RequestContextService       from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {buildWakeReceiverManifest} from '../../../../../../ai/daemons/wake/buildReceiverManifest.mjs';

// The per-machine receiver address a real boot envelope supplies. No committed file can hold it,
// which is why bootstrap derives the transport but must be GIVEN the address.
const BOOT_URL = 'http://host.docker.internal:3199/wake';

test.describe('Neo.ai.services.memory-core.WakeSubscriptionService', () => {
    test.describe.configure({mode: 'serial'});
    let WakeSubscriptionService, GraphService, LifecycleService, CoalescingEngineService,
        WebhookDeliveryService, callTool, originalAutoSave, originalWebhookDeliver, AiConfig;

    test.beforeAll(async () => {
        // Isolation is by construction: `storagePaths.graph` resolves `graphTest` (`:memory:`) and
        // `collections.*` resolve to per-process randomized `test-*` names under `UNIT_TEST_MODE`.
        GraphService            = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        WakeSubscriptionService = (await import('../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs')).default;
        // The window assertions read the resolved leaves rather than restating literals, so a
        // deployment override moves the fixture with the config instead of falsifying it.
        // The canonical committed template, never the repo-local ignored overlay: a test that
        // asserts against the overlay would pass or fail on one machine's uncommitted edits.
        AiConfig                = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        CoalescingEngineService = (await import('../../../../../../ai/services/memory-core/CoalescingEngineService.mjs')).default;
        WebhookDeliveryService  = (await import('../../../../../../ai/services/memory-core/WebhookDeliveryService.mjs')).default;
        LifecycleService        = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        ({callTool}             = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'));

        const GraphMaintenanceService = (await import('../../../../../../ai/services/graph/GraphMaintenanceService.mjs')).default;
        globalThis.GraphMaintenanceService = GraphMaintenanceService;

        const { TestLifecycleHelper } = await import('./util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, null, fs, 'clear');

        if (!LifecycleService._initPromise) { await LifecycleService.initAsync(); } else { await LifecycleService.ready(); }

        originalAutoSave         = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
        originalWebhookDeliver   = WebhookDeliveryService.deliver;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager, TestLifecycleHelper } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        WebhookDeliveryService.deliver = originalWebhookDeliver;
        await TestLifecycleHelper.cleanupGraphService(GraphService, LifecycleService, null, fs, 'clear');
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
        CoalescingEngineService.configure(AiConfig.orchestrator.wakeDispatch);
        WebhookDeliveryService.configure(AiConfig.orchestrator.wakeDispatch);

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
        // Defaults to the DERIVED shape, because that is what bootstrap now produces and what a
        // post-migration plane stores. Specs that need the legacy transport pass it explicitly.
        harnessTarget = 'a2a-webhook',
        harnessTargetMetadata = {appName: 'Codex', url: BOOT_URL},
        status = 'active',
        createdAt = '2026-05-04T20:00:00.000Z',
        updatedAt = createdAt
    } = {}) {
        const sqlite = GraphService.db.storage.db;
        const node   = {
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
        const edge   = {
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

    function appendTaskEvent({
        eventId = `task-event-${crypto.randomUUID()}`,
        taskId = 'MSG:TASK-TYPED',
        previousState = 'Submitted',
        newState = 'Working',
        originator = '@bob',
        assignee = '@alice',
        assignmentAuthority = 'memory-core.v1',
        lastModifiedAt = '2026-07-12T20:01:02.003Z'
    } = {}) {
        return GraphService.db.storage.appendGraphLogEvent({
            entityId : taskId,
            eventId,
            eventType: 'task_state_changed',
            payload  : {
                schemaVersion: 'task-state-change.v1',
                taskId,
                previousState,
                newState,
                originator,
                assignee,
                assignmentAuthority,
                lastModifiedAt
            }
        })
    }

    // -----------------------------------------------------------------------------
    // bootstrap
    // -----------------------------------------------------------------------------

    test.describe('bootstrap', () => {
        test('creates new subscription from identity template, DERIVING the transport over a stale one', async () => {
            // The template deliberately still declares `bridge-daemon`, because that is the live
            // shape: cleaning the seed in `identityRoots.mjs` does not rewrite `subscriptionTemplate`
            // on nodes already persisted in a graph. Deriving — rather than trusting a cleaned
            // template — is what makes bootstrap arm a seat on a plane that already has the stale
            // value stored. Reading the template would reproduce the original defect on every
            // existing deployment while passing on a fresh one.
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        filters              : {priority: 'high'},
                        harnessTarget        : 'bridge-daemon',
                        harnessTargetMetadata: { appName: 'Antigravity' }
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                // `overrideMetadata` is the boot envelope's channel. The receiver URL is per-machine
                // and reaches bootstrap only this way — no committed file can hold it.
                const res = await WakeSubscriptionService.manage({
                    action          : 'bootstrap',
                    overrideMetadata: {url: BOOT_URL, adapter: 'osascript'}
                });
                expect(res.status).toBe('created');
                expect(res.subscriptionId).toMatch(/^WAKE_SUB:[0-9a-f-]{36}$/);

                // The whole point: NOT the template's 'bridge-daemon'. That target is withdrawn by
                // `buildReceiverManifest`, so a row minted from it can never become a route.
                expect(res.harnessTarget).toBe('a2a-webhook');

                const node = GraphService.db.nodes.get(res.subscriptionId);
                expect(node.properties.trigger).toBe('SENT_TO_ME');
                expect(node.properties.filters.priority).toBe('high');
                expect(node.properties.harnessTarget).toBe('a2a-webhook');
                // GUI hints from the template survive — they are policy, not transport.
                expect(node.properties.harnessTargetMetadata.appName).toBe('Antigravity');
                // And the key the template could never carry is minted on this branch.
                expect(node.properties.harnessTargetMetadata.signingKey).toMatch(/^[0-9a-f]{64}$/);
            });
        });

        test('a seat carrying a legacy transport gets a SECOND row, and the legacy one is never retired', async () => {
            // The migration end-state, pinned because the mechanism is counter-intuitive and my PR
            // body first described it wrongly. `_reconcileDuplicateSubscriptions` groups by canonical
            // route key, and `_buildSubscriptionRouteKey` includes `harnessTarget` verbatim — so a
            // stored `bridge-daemon` row and a derived `a2a-webhook` row are two singleton groups and
            // neither is ever N-1'd. There is no self-heal. What neutralizes the legacy row is the
            // manifest builder, which withdraws that target with a named reason; nothing retires it.
            //
            // Asserted rather than narrated so nobody can "fix" this back into a self-heal claim: the
            // reconciler's route-key grouping is what protects legitimate multi-route seats, and
            // blanket-retiring non-deliverable targets would destroy Shape C setups.
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        filters              : {},
                        harnessTargetMetadata: {appName: 'Antigravity'}
                    }
                }
            });

            const legacy = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:legacy-uuid',
                owner                : '@alice',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity'}
            });

            const readStatus = id => JSON.parse(
                GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id).data
            ).properties.status;

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({
                    action          : 'bootstrap',
                    overrideMetadata: {url: BOOT_URL, adapter: 'osascript'}
                });

                // A second row is minted: the derived route tuple cannot match the stored one.
                expect(res.status).toBe('created');
                expect(res.subscriptionId).not.toBe(legacy.subscriptionId);
                expect(res.harnessTarget).toBe('a2a-webhook');

                // And the legacy row is STILL ACTIVE — not retired, on this boot or any later one.
                // It stays visible as `active` on lifecycle surfaces while being unpublishable.
                expect(readStatus(legacy.subscriptionId)).toBe('active');

                // A second bootstrap changes nothing: reconcile still sees two singleton groups.
                const again = await WakeSubscriptionService.manage({
                    action          : 'bootstrap',
                    overrideMetadata: {url: BOOT_URL, adapter: 'osascript'}
                });

                expect(again.subscriptionId).toBe(res.subscriptionId);
                expect(readStatus(legacy.subscriptionId)).toBe('active');
            });
        });

        test('without a receiver URL it REFUSES by name instead of minting a dark row', async () => {
            // The behaviour change that matters most on a live plane, and it is a refusal rather
            // than an arming. Before, bootstrap read `bridge-daemon` off the template, minted a row
            // the manifest builder withdraws by design, and returned `status: 'created'` — a silent
            // false success that left the seat reading `active` while unreachable.
            //
            // Now the derived target reaches `subscribe()`'s Shape-B validation, which names the one
            // input nothing supplies yet: the per-machine receiver URL. A named refusal the boot
            // path logs beats a success that arms nobody — and it is why this ticket's remaining
            // half is "where does the URL come from", not "why is the seat dark".
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        filters              : {priority: 'high'},
                        harnessTargetMetadata: {appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await expect(WakeSubscriptionService.manage({action: 'bootstrap'}))
                    .rejects.toThrow(/requires harnessTargetMetadata\.url/);

                // And it left nothing behind — a refusal that half-created a row would be worse
                // than the silent success it replaces.
                const owned = Object.values(GraphService.db.nodes.items || {})
                    .filter(n => n.label === 'WAKE_SUBSCRIPTION' && n.properties?.agentIdentity === '@alice');
                expect(owned).toEqual([]);
            });
        });

        test('the bootstrapped row is one the manifest builder accepts — the two agree by construction', async () => {
            // Cross-side agreement, asserted rather than assumed: bootstrap's output must be a row
            // `buildWakeReceiverManifest` will publish. Before this, bootstrap minted `bridge-daemon`
            // rows the builder withdraws by design — success on one side, refusal on the other, and
            // nothing compared them.
            GraphService.upsertNode({
                id        : '@alice',
                type      : 'AGENT',
                name      : 'Alice',
                properties: {
                    subscriptionTemplate: {
                        trigger              : 'SENT_TO_ME',
                        filters              : {priority: 'high'},
                        harnessTargetMetadata: {appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
                    }
                }
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({
                          action          : 'bootstrap',
                          overrideMetadata: {url: BOOT_URL, adapter: 'tmux', tmuxSession: 'spec'}
                      }),
                      node = GraphService.db.nodes.get(res.subscriptionId);

                const record = {
                    id                   : res.subscriptionId,
                    agentIdentity        : '@alice',
                    status               : 'active',
                    harnessTarget        : node.properties.harnessTarget,
                    harnessTargetMetadata: node.properties.harnessTargetMetadata
                };

                const {manifest, skipped} = buildWakeReceiverManifest({
                    subscriptions : [record],
                    callerIdentity: '@alice'
                });

                expect(Object.keys(manifest.routes)).toContain(res.subscriptionId);
                expect(skipped).toEqual([]);
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
                        addressType    : 'userDataDir',
                        // A real boot envelope for a deliverable route carries the receiver URL
                        // alongside the instance tuple; the derived Shape-B target requires it.
                        url            : BOOT_URL
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
                const first = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});
                expect(first.status).toBe('created');

                const second = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});
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
                    action          : 'bootstrap',
                    overrideMetadata: {url: BOOT_URL},
                    bootId          : 'new-boot',
                    now             : '2026-06-04T00:01:00.000Z',
                    pid             : process.pid
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
                    action          : 'bootstrap',
                    overrideMetadata: {url: BOOT_URL},
                    bootId          : 'ttl-boot',
                    now             : '2026-06-04T00:11:00.000Z',
                    pid             : process.pid
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
                        filters              : {priority: 'high'},
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
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});
                expect(res.status).toBe('created');
                // Recovered from the durable row, but the transport is still derived — the durable
                // template's stale 'bridge-daemon' is read for policy and ignored for transport.
                expect(res.harnessTarget).toBe('a2a-webhook');

                const subscriptionNode = GraphService.db.nodes.get(res.subscriptionId);
                expect(subscriptionNode.properties.trigger).toBe('SENT_TO_ME');
                expect(subscriptionNode.properties.filters.priority).toBe('high');
                expect(subscriptionNode.properties.harnessTargetMetadata.adapter).toBe('osascript');
                expect(subscriptionNode.properties.harnessTargetMetadata.appName).toBe('Codex');
                expect(subscriptionNode.properties.harnessTargetMetadata.focusSeedKey).toBe('r');

                const hydratedIdentity = GraphService.db.nodes.get('@neo-gpt');
                expect(hydratedIdentity.properties.subscriptionTemplate.filters.priority).toBe('high');
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
            // Seeded in the post-derivation shape so this test measures what it is named for —
            // duplicate reconciliation — rather than incidentally measuring route matching. A
            // seat whose stored rows still carry the old transport is a different case: those rows
            // land in a different route group and are never reconciled, pinned by the legacy-transport
            // bootstrap test above.
            const seededRoute = {harnessTarget: 'a2a-webhook', harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL}};

            const older = insertDurableSubscription({
                subscriptionId: 'WAKE_SUB:older-uuid',
                owner         : '@alice',
                ...seededRoute,
                createdAt: '2026-05-08T17:57:00.000Z',
                updatedAt: '2026-05-08T17:57:00.000Z'
            });
            const newer = insertDurableSubscription({
                subscriptionId: 'WAKE_SUB:newer-uuid',
                owner         : '@alice',
                ...seededRoute,
                createdAt: '2026-05-10T17:09:00.000Z',
                updatedAt: '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});

                // Bootstrap should return the NEWER subscription as existing (reconciler-kept).
                expect(res.subscriptionId).toBe(newer.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Verify durable state: older retired, newer still active.
            const sqlite   = GraphService.db.storage.db;
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
                // Must equal the MERGED metadata bootstrap computes (template hints + boot-envelope
                // address), or the route-idempotency check misses and mints a second row.
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});

                expect(res.subscriptionId).toBe(only.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // The single subscription should remain ACTIVE (not erroneously retired).
            const sqlite = GraphService.db.storage.db;
            const row    = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(only.subscriptionId);
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
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-06T12:00:00.000Z'
            });
            const middle = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:middle',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-08T12:00:00.000Z'
            });
            const newest = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:newest',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-10T12:00:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});

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

            // Route A: SENT_TO_ME + the DERIVED transport + Antigravity — the tuple bootstrap now
            // computes. The discriminator under test is the trigger, not the transport.
            const routeA = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:route-a',
                owner                : '@alice',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'a2a-webhook',
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            // Route B: TASK_STATE_CHANGED + bridge-daemon + Antigravity (distinct trigger)
            const routeB = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:route-b',
                owner                : '@alice',
                trigger              : 'TASK_STATE_CHANGED',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-10T17:09:30.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});
                // Bootstrap re-uses Route A (matches template); does NOT collapse Route B.
                expect(res.subscriptionId).toBe(routeA.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Both routes survive: distinct route-tuples must NOT be reconciled as duplicates.
            const sqlite = GraphService.db.storage.db;
            const aRow   = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(routeA.subscriptionId);
            const bRow   = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(routeB.subscriptionId);

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
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                status               : 'retired',
                createdAt            : '2026-05-08T17:57:00.000Z'
            });
            const active = insertDurableSubscription({
                subscriptionId       : 'WAKE_SUB:still-active',
                owner                : '@alice',
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL},
                createdAt            : '2026-05-10T17:09:00.000Z'
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.manage({action: 'bootstrap', overrideMetadata: {url: BOOT_URL}});

                expect(res.subscriptionId).toBe(active.subscriptionId);
                expect(res.status).toBe('existing');
            });

            // Already-retired stays retired; active stays active.
            const sqlite     = GraphService.db.storage.db;
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
            })).rejects.toThrow("Invalid appName 'antigravity'. Must be one of: Antigravity, Claude, Codex, OpenCode");
        });
    });

    test('subscribe accepts OpenCode as a canonical appName (#16279)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const result = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {appName: 'OpenCode'}
            });

            expect(result.subscriptionId ?? result.id ?? result.subscription?.id).toBeTruthy();
        });
    });

    test('kimi-pull-bridge selection retires stale kimi-server web coordinates atomically (#15665)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            // Subscribe: pull-bridge metadata carrying stale web coordinates arrives retired.
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter  : 'kimi-pull-bridge',
                    cwd      : '/seat/checkout',
                    lockPath : '/stale/instances/dead.json',
                    tokenPath: '/stale/server.token'
                }
            });

            const stored = WakeSubscriptionService.subscriptionCache.get(res.subscriptionId);
            expect(stored.harnessTargetMetadata.adapter).toBe('kimi-pull-bridge');
            expect(stored.harnessTargetMetadata).not.toHaveProperty('lockPath');
            expect(stored.harnessTargetMetadata).not.toHaveProperty('tokenPath');

            // Update: a legacy kimi-server route switching to the pull-bridge retires coordinates.
            const legacy = await WakeSubscriptionService.subscribe({
                trigger              : 'TASK_STATE_CHANGED',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter  : 'kimi-server',
                    lockPath : '/stale/instances/dead.json',
                    tokenPath: '/stale/server.token'
                }
            });

            const updated = await WakeSubscriptionService.update({
                subscriptionId       : legacy.subscriptionId,
                harnessTargetMetadata: {adapter: 'kimi-pull-bridge'}
            });

            expect(updated.currentState.harnessTargetMetadata.adapter).toBe('kimi-pull-bridge');
            expect(updated.currentState.harnessTargetMetadata).not.toHaveProperty('lockPath');
            expect(updated.currentState.harnessTargetMetadata).not.toHaveProperty('tokenPath');
        });
    });

    test('subscribe with the opencode-server adapter succeeds WITHOUT appName (#15394 — the route is publicly registerable)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {
                    adapter     : 'opencode-server',
                    envelopePath: '/tmp/test-opencode-wake-envelope.json'
                }
            });

            expect(res.subscriptionId).toMatch(/^WAKE_SUB:[0-9a-f-]{36}$/);

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node.properties.harnessTarget).toBe('bridge-daemon');
            expect(node.properties.harnessTargetMetadata.adapter).toBe('opencode-server');
            expect(node.properties.harnessTargetMetadata.envelopePath).toBe('/tmp/test-opencode-wake-envelope.json');
            expect(node.properties.harnessTargetMetadata.appName).toBeUndefined();
        });
    });

    test('subscribe with the opencode-server adapter defaults envelopePath (daemon-side default applies)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const res = await WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {adapter: 'opencode-server'}
            });

            const node = GraphService.db.nodes.get(res.subscriptionId);
            expect(node.properties.harnessTargetMetadata.adapter).toBe('opencode-server');
            expect(node.properties.harnessTargetMetadata.envelopePath).toBeUndefined();
        });
    });

    test('subscribe rejects an unknown adapter', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {adapter: 'opencode-serve'}
            })).rejects.toThrow("Invalid adapter 'opencode-serve'. Must be one of: osascript, tmux, codex-app-server, opencode-server");
        });
    });

    test('subscribe with bridge-daemon + a non-opencode adapter still requires appName', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.subscribe({
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                harnessTargetMetadata: {adapter: 'tmux'}
            })).rejects.toThrow('Shape C (bridge-daemon) requires harnessTargetMetadata.appName');
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
                harnessTargetMetadata: {appName: 'Antigravity', url: BOOT_URL}
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

    test('resync replays ordered Task snapshots with stable source ids and fresh emission ids (#15114)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'TASK_STATE_CHANGED',
                harnessTarget: 'mcp-notifications'
            });
            const sqlite = GraphService.db.storage.db;
            const before = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            appendTaskEvent({
                eventId       : 'task-event-working',
                previousState : 'Submitted',
                newState      : 'Working',
                lastModifiedAt: '2026-07-12T20:01:02.003Z'
            });
            appendTaskEvent({
                eventId       : 'task-event-input',
                previousState : 'Working',
                newState      : 'InputRequired',
                lastModifiedAt: '2026-07-12T20:01:05.006Z'
            });

            const first  = await WakeSubscriptionService.resync({subscriptionId, sinceLogId: before});
            const second = await WakeSubscriptionService.resync({subscriptionId, sinceLogId: before});

            expect(first.eventsReplayed).toBe(2);
            expect(first.events.map(event => event.sourceEventId))
                .toEqual(['task-event-working', 'task-event-input']);
            expect(first.events.every(event => typeof event.eventId === 'string')).toBe(true);
            expect(first.events.map(event => event.payload.previousState))
                .toEqual(['Submitted', 'Working']);
            expect(first.events.map(event => event.payload.newState))
                .toEqual(['Working', 'InputRequired']);
            expect(second.events.map(event => event.sourceEventId))
                .toEqual(first.events.map(event => event.sourceEventId));
            expect(second.events.map(event => event.eventId))
                .not.toEqual(first.events.map(event => event.eventId));
        });
    });

    // -----------------------------------------------------------------------------
    // poll-digest — derive-at-read: the pull half of wake delivery for clients without host listeners
    // -----------------------------------------------------------------------------

    test('poll-digest derives the digest from GraphLog state above the client watermark (#16741)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'TASK_STATE_CHANGED',
                harnessTarget: 'mcp-notifications'
            });
            const sqlite = GraphService.db.storage.db;
            const before = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            appendTaskEvent({
                eventId       : 'poll-task-working',
                previousState : 'Submitted',
                newState      : 'Working',
                lastModifiedAt: '2026-08-09T14:00:02.003Z'
            });
            appendTaskEvent({
                eventId       : 'poll-task-input',
                previousState : 'Working',
                newState      : 'InputRequired',
                lastModifiedAt: '2026-08-09T14:00:05.006Z'
            });

            const res = await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: before});

            expect(res.subscriptionId).toBe(subscriptionId);
            expect(res.pending).toBe(2);
            expect(res.eventsReplayed).toBe(2);
            expect(typeof res.digest).toBe('string');
            expect(res.digest.length).toBeGreaterThan(0);
            expect(res.digestPriority).toBe('normal');
            expect(res.watermark).toBeGreaterThan(before);
        });
    });

    test('poll-digest empty answer is a closed state carrying its reason — never a verdict', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });

            const res = await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: 999999});

            expect(res.pending).toBe(0);
            expect(res.digest).toBeUndefined();
            expect(typeof res.reason).toBe('string');
            expect(res.watermark).toBe(999999);
        });
    });

    test('poll-digest stamps observational lastPollAt — a timestamp only, never the client watermark (#17102)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            });

            await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: 424242});

            const node = [...GraphService.db.nodes.items].find(candidate => candidate.id === subscriptionId);

            expect(typeof node.properties.lastPollAt).toBe('string');
            expect(Number.isNaN(Date.parse(node.properties.lastPollAt))).toBe(false);

            // The plane stays cursor-stateless: the poll's watermark must never persist under
            // any spelling — a stored cursor would silently convert the observational stamp
            // into server-held delivery state.
            for (const forbidden of ['lastPollWatermark', 'watermark', 'sinceLogId', 'cursor']) {
                expect(node.properties[forbidden]).toBeUndefined()
            }

            // The owner's list projection carries the stamp — the exposure IS the placement.
            const {subscriptions} = await WakeSubscriptionService.list({subscriptionId});

            expect(subscriptions[0].lastPollAt).toBe(node.properties.lastPollAt)
        });
    });

    test('a foreign-owner poll is refused BEFORE the stamp: rejection leaves no observational trace (#17102)', async () => {
        let subscriptionId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            }))
        });

        await RequestContextService.run({agentIdentityNodeId: '@mallory'}, async () => {
            await expect(WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: 0}))
                .rejects.toThrow(/Permission denied/)
        });

        const node = [...GraphService.db.nodes.items].find(candidate => candidate.id === subscriptionId);

        expect(node.properties.lastPollAt).toBeUndefined()
    });

    test('poll-digest watermarks are client-held: advancing past events empties the next poll, replay still sees them', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const {subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'TASK_STATE_CHANGED',
                harnessTarget: 'mcp-notifications'
            });
            const sqlite = GraphService.db.storage.db;
            const before = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            appendTaskEvent({
                eventId       : 'poll-watermark-task',
                previousState : 'Submitted',
                newState      : 'Working',
                lastModifiedAt: '2026-08-09T14:05:02.003Z'
            });

            const first = await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: before});
            expect(first.pending).toBe(1);

            // The client-held watermark advancing past the event empties the next poll —
            // nothing is queued server-side; the stateless self-healing contract.
            const second = await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: first.watermark});
            expect(second.pending).toBe(0);
            expect(second.reason).toBeTruthy();

            // A replay at the original watermark still sees the event — never server-persisted.
            const replay = await WakeSubscriptionService.pollDigest({subscriptionId, sinceLogId: before});
            expect(replay.pending).toBe(1);
        });
    });

    test('poll-digest rejects a subscription owned by a different identity', async () => {
        let subscriptionId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({subscriptionId} = await WakeSubscriptionService.subscribe({
                trigger      : 'SENT_TO_ME',
                harnessTarget: 'mcp-notifications'
            }));
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(WakeSubscriptionService.pollDigest({subscriptionId}))
                .rejects.toThrow('Permission denied');
        });
    });

    test("manage routes the 'poll-digest' action to pollDigest", async () => {
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(WakeSubscriptionService.manage({action: 'poll-digest'}))
                .rejects.toThrow("Missing 'subscriptionId' parameter.");
        });
    });

    test('emitHeartbeatPulse writes only a heartbeat GraphLog row and replays through resync', async () => {
        const sqlite           = GraphService.db.storage.db;
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

    test('emitHeartbeatPulse is an idempotent no-op without an active Shape B/C subscription', async () => {
        const sqlite = GraphService.db.storage.db;
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted   = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});
        const pulseRows = sqlite.prepare(`
            SELECT COUNT(*) as count
            FROM GraphLog
            WHERE log_id > ?
              AND entity_type = 'heartbeat_pulse'
        `).get(before).count;

        expect(emitted).toEqual({
            status        : 'skipped',
            reason        : 'no-active-interrupt-subscription',
            targetIdentity: '@alice'
        });
        expect(pulseRows).toBe(0);
    });

    test('emitHeartbeatPulse fires when only a SENT_TO_ME bridge-daemon subscription exists (Epic #11993 gate fix)', async () => {
        // Production agents establish bridge-daemon routing through SENT_TO_ME subscriptions.
        const sqlite           = GraphService.db.storage.db;
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

    test('emitHeartbeatPulse still no-ops when only an mcp-notifications subscription exists', async () => {
        // Shape A remains outside the turn-priced host-interrupt transport contract.
        const sqlite = GraphService.db.storage.db;
        insertDurableSubscription({
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'mcp-notifications',
            harnessTargetMetadata: {appName: 'noop'}
        });
        const before = sqlite.prepare('SELECT MAX(log_id) as maxId FROM GraphLog').get().maxId || 0;

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});

        expect(emitted.status).toBe('skipped');
        expect(emitted.reason).toBe('no-active-interrupt-subscription');
        const pulseRows = sqlite.prepare(`
            SELECT COUNT(*) as count FROM GraphLog
            WHERE log_id > ? AND entity_type = 'heartbeat_pulse'
        `).get(before).count;
        expect(pulseRows).toBe(0);
    });

    test('emitHeartbeatPulse fires when only an a2a-webhook subscription exists', async () => {
        insertDurableSubscription({
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'a2a-webhook',
            harnessTargetMetadata: {url: 'http://127.0.0.1:18080/wake', signingKey: 'test-key'}
        });

        const emitted = await WakeSubscriptionService.emitHeartbeatPulse({targetIdentity: '@alice'});

        expect(emitted.status).toBe('emitted');
        expect(emitted.entityId).toMatch(/^HEARTBEAT_PULSE:@alice:/);
    });
    // -----------------------------------------------------------------------------
    // pump()
    // -----------------------------------------------------------------------------

    test.describe('pump', () => {
        let emittedEvents = [];
        let webhookEvents = [];
        let mockMcpServer = {
            notification: async (event) => {
                emittedEvents.push(event);
            }
        };

        test.beforeEach(async () => {
            emittedEvents = [];
            webhookEvents = [];
            CoalescingEngineService.clearMcpServers();
            CoalescingEngineService.clearAll();
            WebhookDeliveryService.deliver = async (subscription, eventData) => {
                webhookEvents.push({subscription, eventData});
                return 'delivered';
            };
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

        test('preserves the typed Task snapshot/id and ignores later generic MESSAGE rewrites (#15114)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({
                    trigger      : 'TASK_STATE_CHANGED',
                    harnessTarget: 'mcp-notifications'
                });
            });

            appendTaskEvent({
                eventId       : 'task-event-pump',
                taskId        : 'MSG:TASK-AUTHORITATIVE-CLOCK',
                previousState : 'Working',
                newState      : 'InputRequired',
                lastModifiedAt: '2026-07-12T20:01:02.003Z'
            });

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toHaveLength(1);
            expect(emittedEvents[0].params).toMatchObject({
                eventType    : 'wake/task_state_changed',
                eventId      : expect.any(String),
                sourceEventId: 'task-event-pump',
                agentIdentity: '@alice',
                payload      : {
                    taskId        : 'MSG:TASK-AUTHORITATIVE-CLOCK',
                    previousState : 'Working',
                    newState      : 'InputRequired',
                    originator    : '@bob',
                    assignee      : '@alice',
                    lastModifiedAt: '2026-07-12T20:01:02.003Z'
                }
            });

            GraphService.upsertNode({
                id        : 'MSG:TASK-AUTHORITATIVE-CLOCK',
                type      : 'MESSAGE',
                properties: {
                    from                   : '@bob',
                    lastModifiedAt         : '2026-07-12T20:01:02.003Z',
                    readAt                 : new Date().toISOString(),
                    taskAssignmentAuthority: 'memory-core.v1',
                    task                   : {state: 'InputRequired', assignee: '@alice'}
                }
            });
            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toHaveLength(1);
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

        test('dispatches the first event to a cache-cold durable mcp-notifications route after restart (#16258)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            const {subscriptionId} = insertDurableSubscription({
                harnessTarget        : 'mcp-notifications',
                harnessTargetMetadata: {}
            });

            expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
            WakeSubscriptionService.subscriptionCache.clear();

            GraphService.upsertNode({
                id        : 'MSG:COLD-MCP-ROUTE',
                type      : 'MESSAGE',
                properties: {from: '@bob', subject: 'first post-restart event'}
            });
            GraphService.linkNodes('MSG:COLD-MCP-ROUTE', '@alice', 'SENT_TO', 1.0);
            const expectedCursor = GraphService.db.storage.db
                .prepare('SELECT MAX(log_id) as maxId FROM GraphLog')
                .get().maxId;

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
            expect(WakeSubscriptionService.liveCursor).toBe(expectedCursor);
            expect(emittedEvents).toHaveLength(1);
            expect(emittedEvents[0].params.payload.messageId).toBe('MSG:COLD-MCP-ROUTE');
        });

        test('dispatches the first event to a cache-cold durable a2a-webhook route after restart (#16258)', async () => {
            const {subscriptionId} = insertDurableSubscription({
                harnessTarget        : 'a2a-webhook',
                harnessTargetMetadata: {
                    url       : 'http://127.0.0.1:3199/wake',
                    signingKey: 'test-signing-key'
                }
            });

            expect(GraphService.db.nodes.get(subscriptionId) || null).toBeNull();
            WakeSubscriptionService.subscriptionCache.clear();

            GraphService.upsertNode({
                id  : 'MSG:COLD-WEBHOOK-ROUTE',
                type: 'MESSAGE',
                // Production MESSAGE rows always carry the canonical `sentAt` (MailboxService
                // stamps it); the digest path age-gates on it, so the fixture must too.
                properties: {from: '@bob', subject: 'first post-restart webhook', sentAt: new Date().toISOString()}
            });
            GraphService.linkNodes('MSG:COLD-WEBHOOK-ROUTE', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
            expect(webhookEvents).toHaveLength(1);
            expect(webhookEvents[0].eventData.payload.sourceEventIds).toContain('MSG:COLD-WEBHOOK-ROUTE');
        });

        test('pumps a cache-cold durable route whose `status` was never written (#16331)', async () => {
            // The hot push path used to compare `sub.status === 'active'` directly. Hydration
            // preserves an absent `status` as absent rather than synthesizing one, so a legacy row
            // was published into the manifest by the builder and then never dispatched here — a
            // route that reads armed on every surface and delivers nothing. This is the delivery-
            // critical half of the convergence; the manifest/health pair alone cannot witness it.
            CoalescingEngineService.addMcpServer(mockMcpServer);

            const {subscriptionId} = insertDurableSubscription({
                harnessTarget        : 'mcp-notifications',
                harnessTargetMetadata: {}
            });

            // Strip the property from the PERSISTED row. Passing `status: undefined` to the helper
            // does not work — its `status = 'active'` default parameter fires on undefined, so the
            // row comes back fully active and the spec would silently test the ordinary case.
            GraphService.db.storage.db
                .prepare(`UPDATE Nodes SET data = json_remove(data, '$.properties.status') WHERE id = ?`)
                .run(subscriptionId);

            // POSITIVE CONTROL on the fixture: the persisted row must really lack the property, not
            // carry an empty or null one. This assertion is what caught the default-parameter trap
            // above; without it the test below passes against a row that was never the specimen.
            const persisted = JSON.parse(
                GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(subscriptionId).data
            );
            expect(Object.hasOwn(persisted.properties, 'status')).toBe(false);

            WakeSubscriptionService.subscriptionCache.clear();

            GraphService.upsertNode({
                id        : 'MSG:COLD-NO-STATUS',
                type      : 'MESSAGE',
                properties: {from: '@bob', subject: 'event for a row with no status'}
            });
            GraphService.linkNodes('MSG:COLD-NO-STATUS', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
            expect(emittedEvents).toHaveLength(1);
            expect(emittedEvents[0].params.payload.messageId).toBe('MSG:COLD-NO-STATUS');
        });

        test('a durable route explicitly marked `retired` is still NOT pumped (#16331)', async () => {
            // The negative half. Absence is the ONLY defaulted case; an explicitly written terminal
            // status must stay inert. Without this, the spec above would also pass against a policy
            // that simply admitted everything.
            CoalescingEngineService.addMcpServer(mockMcpServer);

            insertDurableSubscription({
                harnessTarget        : 'mcp-notifications',
                harnessTargetMetadata: {},
                status               : 'retired'
            });

            WakeSubscriptionService.subscriptionCache.clear();

            GraphService.upsertNode({
                id        : 'MSG:COLD-RETIRED',
                type      : 'MESSAGE',
                properties: {from: '@bob', subject: 'event for a retired row'}
            });
            GraphService.linkNodes('MSG:COLD-RETIRED', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents).toHaveLength(0);
        });

        test('refreshes non-deliverable durable routes and removes deleted cached routes (#16258)', async () => {
            const retired = insertDurableSubscription({
                subscriptionId: 'WAKE_SUB:durable-retired',
                harnessTarget : 'a2a-webhook',
                status        : 'retired'
            });
            const disabled = insertDurableSubscription({
                subscriptionId: 'WAKE_SUB:durable-disabled',
                harnessTarget : 'disabled'
            });
            const degraded = insertDurableSubscription({
                subscriptionId: 'WAKE_SUB:durable-degraded',
                harnessTarget : 'a2a-webhook',
                status        : 'degraded'
            });
            const deletedId = 'WAKE_SUB:deleted-route';

            for (const id of [retired.subscriptionId, disabled.subscriptionId, degraded.subscriptionId, deletedId]) {
                WakeSubscriptionService.subscriptionCache.set(id, {
                    id,
                    agentIdentity: '@alice',
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'a2a-webhook',
                    status       : 'active'
                });
            }

            GraphService.upsertNode({id: 'MSG:NON-DELIVERABLE-ROUTES', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:NON-DELIVERABLE-ROUTES', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(WakeSubscriptionService.subscriptionCache.get(retired.subscriptionId).status).toBe('retired');
            expect(WakeSubscriptionService.subscriptionCache.get(disabled.subscriptionId).harnessTarget).toBe('disabled');
            expect(WakeSubscriptionService.subscriptionCache.get(degraded.subscriptionId).status).toBe('degraded');
            expect(WakeSubscriptionService.subscriptionCache.has(deletedId)).toBe(false);
            expect(webhookEvents).toEqual([]);
        });

        test('retains graph-resident warmup when raw SQLite is unavailable (#16258)', async () => {
            let subscriptionId;
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                ({subscriptionId} = await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                }));
            });

            WakeSubscriptionService.subscriptionCache.clear();

            const storage = GraphService.db.storage;
            const sqlite  = storage.db;
            storage.db    = null;
            try {
                WakeSubscriptionService._warmPushSubscriptions();
            } finally {
                storage.db = sqlite;
            }

            expect(WakeSubscriptionService.subscriptionCache.has(subscriptionId)).toBe(true);
        });

        test('dispatches a2a-webhook while skipping bridge-daemon and disabled targets', async () => {
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

            GraphService.upsertNode({id: 'MSG:6', type: 'MESSAGE', properties: {from: '@bob', sentAt: new Date().toISOString()}});
            GraphService.linkNodes('MSG:6', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(emittedEvents.length).toBe(0);
            expect(webhookEvents).toHaveLength(1);
            expect(webhookEvents[0].eventData.eventType).toBe('wake/digest');
            expect(webhookEvents[0].eventData.payload.sourceEventIds).toContain('MSG:6');
        });

        test('refreshes a cached webhook route after it degrades', async () => {
            let subscriptionId;

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const result = await WakeSubscriptionService.subscribe({
                    trigger              : 'SENT_TO_ME',
                    harnessTarget        : 'a2a-webhook',
                    harnessTargetMetadata: {url: 'test'}
                });
                subscriptionId = result.subscriptionId;
            });

            const subscription = GraphService.db.nodes.get(subscriptionId);
            GraphService.upsertNode({
                id        : subscriptionId,
                type      : 'WAKE_SUBSCRIPTION',
                properties: {
                    ...subscription.properties,
                    status: 'degraded'
                }
            });
            GraphService.upsertNode({id: 'MSG:DEGRADED-WEBHOOK', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:DEGRADED-WEBHOOK', '@alice', 'SENT_TO', 1.0);

            await WakeSubscriptionService.pump();
            await CoalescingEngineService.flushAll();

            expect(WakeSubscriptionService.subscriptionCache.get(subscriptionId).status).toBe('degraded');
            expect(webhookEvents).toEqual([]);
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

        test('yields between bounded GraphLog pages before the full backlog is drained (#16677)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'TASK_STATE_CHANGED', harnessTarget: 'mcp-notifications'});
            });

            const sqlite = GraphService.db.storage.db;
            WakeSubscriptionService.liveCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            const sourceEventIds = [];
            for (let index = 0; index < 5; index++) {
                const sourceEventId = `task-page-event-${index}`;
                sourceEventIds.push(sourceEventId);
                appendTaskEvent({eventId: sourceEventId, taskId: `MSG:PAGE-${index}`});
            }

            const initialCursor   = WakeSubscriptionService.liveCursor;
            const finalCursor     = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId;
            const originalSize    = WakeSubscriptionService.pumpBatchSize;
            let   cursorAtControl = null;

            WakeSubscriptionService.pumpBatchSize = 2;

            try {
                const controlTurn = new Promise(resolve => setImmediate(() => {
                    cursorAtControl = WakeSubscriptionService.liveCursor;
                    resolve();
                }));
                const pump = WakeSubscriptionService.pump();

                await controlTurn;
                expect(cursorAtControl).toBeGreaterThan(initialCursor);
                expect(cursorAtControl).toBeLessThan(finalCursor);

                await pump;
                await CoalescingEngineService.flushAll();

                expect(WakeSubscriptionService.liveCursor).toBe(finalCursor);
                expect(emittedEvents.map(event => event.params.sourceEventId)).toEqual(sourceEventIds);
            } finally {
                WakeSubscriptionService.pumpBatchSize = originalSize;
            }
        });

        test('folds a pump trigger and new event arriving during a paged drain into the same single-flight (#16677)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'TASK_STATE_CHANGED', harnessTarget: 'mcp-notifications'});
            });

            const sqlite = GraphService.db.storage.db;
            WakeSubscriptionService.liveCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            for (let index = 0; index < 4; index++) {
                appendTaskEvent({eventId: `task-concurrent-event-${index}`, taskId: `MSG:CONCURRENT-${index}`});
            }

            const originalSize = WakeSubscriptionService.pumpBatchSize;
            WakeSubscriptionService.pumpBatchSize = 2;

            try {
                const appendDuringYield = new Promise(resolve => setImmediate(() => {
                    appendTaskEvent({eventId: 'task-concurrent-event-tail', taskId: 'MSG:CONCURRENT-TAIL'});
                    void WakeSubscriptionService.pump();
                    resolve();
                }));

                await Promise.all([WakeSubscriptionService.pump(), appendDuringYield]);
                await CoalescingEngineService.flushAll();

                const finalCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId;
                expect(WakeSubscriptionService.liveCursor).toBe(finalCursor);
                expect(emittedEvents.map(event => event.params.sourceEventId)).toEqual([
                    'task-concurrent-event-0',
                    'task-concurrent-event-1',
                    'task-concurrent-event-2',
                    'task-concurrent-event-3',
                    'task-concurrent-event-tail'
                ]);
            } finally {
                WakeSubscriptionService.pumpBatchSize = originalSize;
            }
        });

        test('yields before draining a coalesced sub-page tail (#16677)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'TASK_STATE_CHANGED', harnessTarget: 'mcp-notifications'});
            });

            const storage = GraphService.db.storage;
            const sqlite  = storage.db;
            WakeSubscriptionService.liveCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            const firstLogId = appendTaskEvent({
                eventId: 'task-coalesced-page-event',
                taskId : 'MSG:COALESCED-PAGE'
            }).logId;
            const originalGetLatestLogId = storage.getLatestLogId;
            let   latestReadCount        = 0;
            let   tailLogId              = null;
            let   cursorAtControl        = null;

            storage.getLatestLogId = function() {
                latestReadCount += 1;
                // The first read freezes the snapshot; the second is its tail check. Injecting here
                // models an external writer advancing the shared journal between those statements.
                if (latestReadCount === 2) {
                    tailLogId = appendTaskEvent({
                        eventId: 'task-coalesced-tail-event',
                        taskId : 'MSG:COALESCED-TAIL'
                    }).logId;
                }

                return originalGetLatestLogId.call(this);
            };

            try {
                const controlTurn = new Promise(resolve => setImmediate(() => {
                    cursorAtControl = WakeSubscriptionService.liveCursor;
                    resolve();
                }));
                const pump = WakeSubscriptionService.pump();

                await Promise.all([controlTurn, pump]);
                expect(cursorAtControl).toBe(firstLogId);
                expect(cursorAtControl).toBeLessThan(tailLogId);

                await CoalescingEngineService.flushAll();

                expect(WakeSubscriptionService.liveCursor).toBe(tailLogId);
                expect(emittedEvents.map(event => event.params.sourceEventId)).toEqual([
                    'task-coalesced-page-event',
                    'task-coalesced-tail-event'
                ]);
            } finally {
                storage.getLatestLogId = originalGetLatestLogId;
            }
        });

        test('evaluates a repeatedly rewritten entity once per frozen paged snapshot (#16677)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'SENT_TO_ME', harnessTarget: 'mcp-notifications'});
            });

            GraphService.upsertNode({id: 'MSG:PAGED-REWRITE', type: 'MESSAGE', properties: {from: '@bob'}});
            GraphService.linkNodes('MSG:PAGED-REWRITE', '@alice', 'SENT_TO', 1.0);

            const sqlite = GraphService.db.storage.db;
            WakeSubscriptionService.liveCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            GraphService.linkNodes('MSG:PAGED-REWRITE', '@alice', 'SENT_TO', 1.0, {revision: 1});
            GraphService.linkNodes('MSG:PAGED-REWRITE', '@alice', 'SENT_TO', 1.0, {revision: 2});
            GraphService.linkNodes('MSG:PAGED-REWRITE', '@alice', 'SENT_TO', 1.0, {revision: 3});

            const originalSize = WakeSubscriptionService.pumpBatchSize;
            const finalLogId   = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId;
            WakeSubscriptionService.pumpBatchSize = 1;

            try {
                await WakeSubscriptionService.pump();
                await CoalescingEngineService.flushAll();

                expect(emittedEvents).toHaveLength(1);
                expect(emittedEvents[0].params.payload.messageId).toBe('MSG:PAGED-REWRITE');
                expect(WakeSubscriptionService.liveCursor).toBe(finalLogId);
            } finally {
                WakeSubscriptionService.pumpBatchSize = originalSize;
            }
        });

        test('does not advance the cursor past a page whose evaluation fails (#16677)', async () => {
            CoalescingEngineService.addMcpServer(mockMcpServer);

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.subscribe({trigger: 'TASK_STATE_CHANGED', harnessTarget: 'mcp-notifications'});
            });

            const sqlite = GraphService.db.storage.db;
            WakeSubscriptionService.liveCursor = sqlite.prepare('SELECT MAX(log_id) AS maxId FROM GraphLog').get().maxId || 0;

            const logIds = [];
            for (let index = 0; index < 4; index++) {
                logIds.push(appendTaskEvent({eventId: `task-failure-event-${index}`, taskId: `MSG:FAILURE-${index}`}).logId);
            }

            const originalSize     = WakeSubscriptionService.pumpBatchSize;
            const originalEvaluate = WakeSubscriptionService._evaluateTypedEventAgainstSubscription;
            WakeSubscriptionService.pumpBatchSize = 2;
            WakeSubscriptionService._evaluateTypedEventAgainstSubscription = (trace, subscription) => {
                if (trace.event_id === 'task-failure-event-3') throw new Error('injected page failure');
                return originalEvaluate.call(WakeSubscriptionService, trace, subscription);
            };

            try {
                await WakeSubscriptionService.pump();
                await CoalescingEngineService.flushAll();

                expect(WakeSubscriptionService.liveCursor).toBe(logIds[1]);
                expect(emittedEvents.map(event => event.params.sourceEventId)).toEqual([
                    'task-failure-event-0',
                    'task-failure-event-1'
                ]);

                WakeSubscriptionService._evaluateTypedEventAgainstSubscription = originalEvaluate;
                await WakeSubscriptionService.pump();
                await CoalescingEngineService.flushAll();

                expect(WakeSubscriptionService.liveCursor).toBe(logIds[3]);
                expect(emittedEvents.map(event => event.params.sourceEventId)).toEqual([
                    'task-failure-event-0',
                    'task-failure-event-1',
                    'task-failure-event-2',
                    'task-failure-event-3'
                ]);
            } finally {
                WakeSubscriptionService.pumpBatchSize = originalSize;
                WakeSubscriptionService._evaluateTypedEventAgainstSubscription = originalEvaluate;
            }
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

        test('#14750 rostered residents project + filter era-chain-first: a spoofed flat family neither reports nor routes', async () => {
            // A rostered resident's graph node carries a WRONG flat family. Both the family
            // FILTER and the liveness PROJECTION must read through the identity trail, so the
            // true family finds it, the spoofed family does not, and the report tells the truth.
            seedAgent('@neo-gemini-pro', {family: 'spoofed-fam'});

            const trueFamily = await WakeSubscriptionService.whoIsOnline({family: 'gemini', verbose: true, now: new Date(T0)});
            const entry      = trueFamily.agents.find(a => a.identity === '@neo-gemini-pro');

            expect(entry).toBeTruthy();
            expect(entry.family).toBe('gemini');

            const spoofFamily = await WakeSubscriptionService.whoIsOnline({family: 'spoofed-fam', verbose: true, now: new Date(T0)});
            expect(spoofFamily.agents.find(a => a.identity === '@neo-gemini-pro')).toBeUndefined();
        });

        test('#14750 runtime-provisioned identities (unrostered) keep filtering via the flat node property — the retirement witness', async () => {
            seedAgent('@runtime-provisioned-w', {family: 'provisioned-fam'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({family: 'provisioned-fam', verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@runtime-provisioned-w');

            expect(entry).toBeTruthy();
            expect(entry.family).toBe('provisioned-fam');
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

        test('fresh add_memory + fresh beacon → activity speaks the verdict, and the beacon OBSERVATION still reaches the row (verbose)', async () => {
            // The coexistence case the band vocabulary needs: observation and verdict precedence
            // are DIFFERENT concerns. An actively-working agent (fresh add_memory AND a fresh
            // beacon) must carry the vouched horizons on its verbose row — coupling the beacon
            // read to the rescue branch made them vanish exactly when the agent was most alive.
            seedAgent('@neo-coexist');
            seedActivity('@neo-coexist', {timestamp: iso(T0ms - 60 * 1000)});   // memory FRESH
            seedBeacon('@neo-coexist', {
                freshUntil: iso(T0ms + 7 * 60 * 1000),
                expiresAt : iso(T0ms + 45 * 60 * 1000)
            });

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-coexist');

            // the verdict: fresh activity speaks first — the rescue precedence is untouched
            expect(entry.online).toBe(true);
            expect(entry.reason).toContain('recent add_memory activity');

            // the observation: the beacon rides the row with its vouched horizons verbatim
            expect(entry.signals.turnPresence.fresh).toBe(true);
            expect(entry.signals.turnPresence.freshUntil).toBe(iso(T0ms + 7 * 60 * 1000));
            expect(entry.signals.turnPresence.expiresAt).toBe(iso(T0ms + 45 * 60 * 1000));
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

        test('no add_memory activity ever → state neverConnected, NOT idle (verbose)', async () => {
            seedAgent('@neo-dark');

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry    = agents.find(a => a.identity === '@neo-dark');

            expect(entry.online).toBe(false);
            // Membership, not freshness: an identity that has never written here is not "idle".
            expect(entry.state).toBe('neverConnected');
            expect(entry.state).not.toBe('idle');
            expect(entry.reason).toContain('never connected to this deployment');
            expect(entry.signals.activityRecency).toBeNull();
        });

        test('#16058 regression A — an 8-hour-stale identity reports dark, never idle', async () => {
            seedAgent('@neo-8h-stale');
            seedActivity('@neo-8h-stale', {timestamp: iso(T0ms - 8 * 60 * 60 * 1000)});

            const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry   = verbose.agents.find(a => a.identity === '@neo-8h-stale');

            expect(entry.state).toBe('dark');
            expect(entry.online).toBe(false);
            expect(entry.signals.activityRecency.withinIdle).toBe(false);

            const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(terse.dark).toContain('@neo-8h-stale');
            expect(terse.idle).not.toContain('@neo-8h-stale');
        });

        test('first turn: NO add_memory row yet but a fresh beacon reports ONLINE, never neverConnected', async () => {
            // The absence of a durable write is not evidence of never-connected while a live
            // observation contradicts it. A newly rostered peer has no AGENT_MEMORY row on its very
            // first turn — the moment it is most present — so asserting membership from that absence
            // routes around a working peer. Every current-observation signal must be exhausted first.
            seedAgent('@neo-first-turn');
            seedBeacon('@neo-first-turn', {freshUntil: iso(T0ms + 5 * 60 * 1000)});

            const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry   = verbose.agents.find(a => a.identity === '@neo-first-turn');

            expect(entry.online).toBe(true);
            expect(entry.state).toBe('online');
            expect(entry.state).not.toBe('neverConnected');
            expect(entry.signals.activityRecency).toBeNull(); // genuinely no write on record
            expect(entry.reason).toContain('first turn');

            const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(terse.online).toContain('@neo-first-turn');
            expect(terse.neverConnected).not.toContain('@neo-first-turn');
        });

        test('#16058 regression B — a 33-minute-quiet identity with a fresh beacon reports ONLINE', async () => {
            // The false-negative that misroutes work: add_memory lands at turn boundaries, so an
            // agent on a long turn goes quiet on that signal precisely while it is busiest.
            seedAgent('@neo-33m-working');
            seedActivity('@neo-33m-working', {timestamp: iso(T0ms - 33 * 60 * 1000)});
            seedBeacon('@neo-33m-working', {freshUntil: iso(T0ms + 5 * 60 * 1000)});

            const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const entry   = verbose.agents.find(a => a.identity === '@neo-33m-working');

            expect(entry.online).toBe(true);
            expect(entry.state).toBe('online');
            expect(entry.signals.activityRecency.fresh).toBe(false); // the write IS stale — the beacon carries it

            const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(terse.online).toContain('@neo-33m-working');
            expect(terse.idle).not.toContain('@neo-33m-working');
            expect(terse.dark).not.toContain('@neo-33m-working');
        });

        test('the DECLARED OpenAPI response schema matches what the tool actually returns', async () => {
            // Output schemas are passthrough, so exact-head CI stays green while `tools/list`
            // advertises a shape the implementation stopped returning — the description prose and the
            // schema live twenty lines apart and nothing connects them. This pins the declared
            // contract against the live payload so the two cannot drift silently again.
            const yaml = await fs.readFile(
                path.resolve(process.cwd(), 'ai/mcp/server/memory-core/openapi.yaml'), 'utf8');
            const declared = yaml.slice(yaml.indexOf('operationId: who_is_online'));

            seedAgent('@neo-schema-pin');

            const result = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            // Every terse key the implementation returns must be a declared property.
            Object.keys(result).forEach(key => expect(declared).toContain(`${key}:`));

            // And the five states must be declared as the per-agent enum, so a sixth bucket cannot
            // ship without the contract naming it.
            ['online', 'idle', 'dark', 'neverConnected', 'benched']
                .forEach(state => expect(declared).toContain(state));
            expect(declared).toContain('enum: [online, idle, dark, neverConnected, benched]');
        });

        test('#16058 — the summary states the windows it applied', async () => {
            seedAgent('@neo-window-note');

            const result = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            // A bare count is uninterpretable without its calibration; the numbers come from the
            // resolved leaves so an override is reflected rather than a documented constant.
            expect(result.windows.activityFreshMs).toBe(AiConfig.whoIsOnline.activityFreshMs);
            expect(result.windows.idleCutoffMs).toBe(AiConfig.whoIsOnline.idleCutoffMs);
            expect(result.summary).toContain('online ≤');
            expect(result.summary).toContain('idle ≤');
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

        test('terse default: five honest buckets as identity arrays — no per-agent essay', async () => {
            seedAgent('@neo-t-online');
            seedActivity('@neo-t-online', {timestamp: iso(T0ms - 2 * 60 * 1000)});
            seedAgent('@neo-t-idle');                                                  // stale, inside the cutoff
            seedActivity('@neo-t-idle', {timestamp: iso(T0ms - 90 * 60 * 1000)});
            seedAgent('@neo-t-dark');                                                  // stale, beyond the cutoff
            seedActivity('@neo-t-dark', {timestamp: iso(T0ms - 9 * 60 * 60 * 1000)});
            seedAgent('@neo-t-never');                                                 // rostered, never observed here
            seedAgent('@neo-t-benched', {participationStatus: 'temporarily_unreachable'});

            const result = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(typeof result.summary).toBe('string');
            expect(result.agents).toBeUndefined();
            expect(result.signalStatus).toBeUndefined();
            expect(result.online).toContain('@neo-t-online');
            expect(result.idle).toContain('@neo-t-idle');
            expect(result.dark).toContain('@neo-t-dark');
            expect(result.neverConnected).toContain('@neo-t-never');
            expect(result.benched).toContain('@neo-t-benched');

            // The buckets must partition: no identity may appear in two of them, which is the
            // property that makes the summary counts add up to the roster.
            expect(result.idle).not.toContain('@neo-t-online');
            expect(result.idle).not.toContain('@neo-t-dark');
            expect(result.idle).not.toContain('@neo-t-never');
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
            expect(result.beaconStatus).toBeUndefined(); // one status string, not a second field

            // Contract truth: the prose must state the precedence the code actually applies. It
            // previously said add_memory was the signal "no harness beacon" — which stopped being
            // true the moment presence began deciding verdicts, and a description that misdescribes
            // its own precedence is read by every agent as authority.
            expect(result.signalStatus).toContain('turn-presence');
            expect(result.signalStatus).not.toContain('no harness beacon');
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
            expect(Array.isArray(res.dark)).toBe(true);
            expect(Array.isArray(res.neverConnected)).toBe(true);
            // @neo-dispatch is rostered + active but has never written here → neverConnected, not idle.
            // The full wire shape crosses the dispatch boundary, so the new buckets are reachable by
            // an actual tool caller rather than only through the service method.
            expect(res.neverConnected).toContain('@neo-dispatch');
            expect(res.idle).not.toContain('@neo-dispatch');
        });

        test('#17225 AC2 — the inversion red-proof: a beaconless mid-turn peer and an idle-but-fresh-write peer carry identical unobservable axes', async () => {
            // The ticket's fixture, beaconless by construction (today's fleet-wide truth: nothing
            // emits turn-presence, so the mid-turn rescue cannot fire). One peer mid-turn with a
            // stale write, one idle peer with a fresh one. The recency observation honestly
            // differs — and that is ALL the tool may claim. Every axis the tool cannot observe
            // must answer `unknown` for BOTH, so no served axis can rank the idle peer as more
            // available than the working one.
            seedAgent('@neo-ac2-midturn');
            seedActivity('@neo-ac2-midturn', {timestamp: iso(T0ms - 20 * 60 * 1000)}); // stale, no beacon
            seedAgent('@neo-ac2-idlefresh');
            seedActivity('@neo-ac2-idlefresh', {timestamp: iso(T0ms - 2 * 60 * 1000)}); // fresh

            const {agents}  = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const midturn   = agents.find(a => a.identity === '@neo-ac2-midturn');
            const idlefresh = agents.find(a => a.identity === '@neo-ac2-idlefresh');

            // The presence observation differs honestly — recency is the one signal this tool owns.
            expect(midturn.state).toBe('idle');
            expect(idlefresh.state).toBe('online');

            // Every composed axis the tool cannot observe: unknown for BOTH, never a verdict.
            const unobserved = {throttle: 'unknown', lifecycle: 'unknown', liveness: 'unknown'};
            expect(midturn.axes).toEqual(unobserved);
            expect(idlefresh.axes).toEqual(unobserved);
            expect(idlefresh.axes).toEqual(midturn.axes);
        });

        test('#17225 AC1 — the payload declares its own plane: a container-side add_memory-recency proxy, never an availability verdict', async () => {
            seedAgent('@neo-ac1');
            seedActivity('@neo-ac1', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            const terse    = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});
            const presence = terse.axes?.presence?.capability;

            expect(presence).toBeTruthy();
            expect(presence.plane).toBe('container');
            expect(presence.signal).toContain('add_memory');
            expect(presence.state).toBe('wired');
            expect(presence.confidence).toBe('observed');
            // The envelope echoes the projection's observation bound — it never mints its own.
            expect(presence.capturedAt).toBe(terse.generatedAt);
            expect(presence.reason).toContain('not an availability verdict');

            // Terse and verbose carry the same declaration — the plane honesty is not paywalled
            // behind the diagnostics surface.
            const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            expect(verbose.axes.presence.capability).toEqual(presence);
        });

        test('#17225 AC3 — unobservable axes: declared in terse, served as degraded/none envelopes in verbose', async () => {
            // The terse-by-default contract (diagnostics behind the optional param, never bloat the
            // context window) bounds WHAT the default answer pays for: the presence envelope is the
            // answer's honesty and stays; three byte-identical "nothing published" envelopes on
            // every call would be diagnostics in the default path. So terse DECLARES the host axes
            // unobserved, and verbose serves the full FM-grammar envelopes.
            seedAgent('@neo-ac3');
            seedActivity('@neo-ac3', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            expect(terse.axes.unobserved).toEqual(['throttle', 'lifecycle', 'liveness']);
            expect(terse.axes.throttle, 'diagnostics stay out of the default answer').toBeUndefined();
            expect(terse.axes.lifecycle).toBeUndefined();
            expect(terse.axes.liveness).toBeUndefined();
            expect(terse.axes.presence?.capability?.state).toBe('wired');

            const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});

            for (const axis of ['throttle', 'lifecycle', 'liveness']) {
                const capability = verbose.axes?.[axis]?.capability;

                expect(capability, `${axis} envelope`).toBeTruthy();
                expect(capability.state).toBe('degraded');        // absence of truth is declared, never hidden
                expect(capability.confidence).toBe('none');       // never rendered as fine
                expect(typeof capability.reason).toBe('string');  // the hole names itself
                expect(capability.capturedAt).toBe(verbose.generatedAt);
            }
        });

        test('#17225 AC5 — the presence vocabulary is imported from the Fleet taxonomy, never re-declared in the MC tree', async () => {
            const servicePath = path.resolve(process.cwd(), 'ai/services/memory-core/WakeSubscriptionService.mjs');
            const serviceSrc  = await fs.readFile(servicePath, 'utf8');

            // The import is the admission: fleetPresenceStateAdapter is the vocabulary's ONE
            // exporting home, so the FM's downstream mapping can never drift from the tool's words.
            expect(serviceSrc).toContain("from '../fleet/fleetPresenceStateAdapter.mjs'");

            // The grep control, positive-controlled first: an absence-assertion never shown capable
            // of presence is indistinguishable from a test that does nothing. The detector flags any
            // 150-char window holding >= 3 DISTINCT vocabulary words as quoted literals — the shape a
            // re-declared list takes in any spelling (array, reordered, double-quoted, switch/case
            // cluster) — while scattered single uses stay silent.
            const VOCAB    = ['online', 'idle', 'dark', 'benched', 'neverConnected'],
                  detector = src => {
                      const hits = [...src.matchAll(/(['"])(online|idle|dark|benched|neverConnected)\1/g)];

                      for (let i = 0; i < hits.length; i++) {
                          const windowed = hits.filter(h => h.index >= hits[i].index && h.index < hits[i].index + 150);

                          if (new Set(windowed.map(h => h[2])).size >= 3) return true;
                      }

                      return false;
                  };

            // The positive controls — each spelling a re-declaration could take, including the four
            // evasions a naive ordered single-quote pattern misses.
            expect(detector(`const S = ['online', 'idle', 'dark', 'benched', 'neverConnected']`)).toBe(true);
            expect(detector(`const S = ['neverConnected', 'dark', 'online']`)).toBe(true);
            expect(detector('const S = ["online", "idle", "dark"]')).toBe(true);
            expect(detector(`switch (s) { case 'online': case 'idle': case 'dark': return s; }`)).toBe(true);
            // and the negative control: one scattered use is a usage, not a vocabulary.
            expect(detector(`row.state = 'online';`)).toBe(false);

            // The sweep itself: recursive — subdirectories are exactly where a second copy would hide.
            const root = path.resolve(process.cwd(), 'ai/services/memory-core'),
                  walk = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
                      const abs = path.join(dir, entry.name);

                      return entry.isDirectory() ? walk(abs) : (entry.name.endsWith('.mjs') ? [abs] : []);
                  });

            for (const file of walk(root)) {
                const src = await fs.readFile(file, 'utf8');
                expect(detector(src), `${path.relative(root, file)} re-declares the presence vocabulary`).toBe(false);
            }
        });

        // AC4 fixture: a MESSAGE node of the review-lifecycle trail — `from`/`to`/`subject`/`sentAt`
        // ride the node properties exactly as MailboxService writes them; the subject is the
        // protocol surface the disposition classifier reads. Ids carry the production `MESSAGE:`
        // prefix because the service read pre-filters on it.
        function seedReviewPing({id, from, subject, sentAt, to = 'AGENT:*'}) {
            GraphService.upsertNode({
                id        : `MESSAGE:${id}`,
                type      : 'MESSAGE',
                name      : subject,
                properties: {from, to, subject, sentAt}
            });
        }

        test('#17225 AC4 — the load axis counts open re-review loops: a peer holding N reads N, a zero peer reads zero', async () => {
            seedAgent('@neo-ac4-reviewer');
            seedActivity('@neo-ac4-reviewer', {timestamp: iso(T0ms - 2 * 60 * 1000)});
            seedAgent('@neo-ac4-quiet');
            seedActivity('@neo-ac4-quiet', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            // Two OPEN loops: a CHANGES_REQUESTED review-ping per PR, no later disposition.
            seedReviewPing({id: 'AC4-CR-1', from: '@neo-ac4-reviewer', sentAt: iso(T0ms - 60 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #101 @ aaa1111111] two edits'});
            seedReviewPing({id: 'AC4-CR-2', from: '@neo-ac4-reviewer', sentAt: iso(T0ms - 30 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #102 @ bbb2222222] one edit'});
            // One CLOSED loop: the same reviewer's later APPROVED ping retires the CR.
            seedReviewPing({id: 'AC4-CR-3', from: '@neo-ac4-reviewer', sentAt: iso(T0ms - 2 * 60 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #103 @ ccc3333333] nits'});
            seedReviewPing({id: 'AC4-OK-3', from: '@neo-ac4-reviewer', sentAt: iso(T0ms - 45 * 60 * 1000),
                subject: '[APPROVED][PR #103 @ ddd4444444] all addressed'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-reviewer');
            const quiet    = agents.find(a => a.identity === '@neo-ac4-quiet');

            expect(reviewer.reviewLoad.open).toBe(2);
            expect(reviewer.reviewLoad.loops.map(loop => loop.pr).sort()).toEqual([101, 102]);
            // The ticket's positive control: a peer whose load is genuinely zero reads ZERO —
            // a counted absence, never an unknown axis.
            expect(quiet.reviewLoad.open).toBe(0);
            expect(quiet.reviewLoad.loops).toEqual([]);
        });

        test('#17225 AC4 — a returned ball reads as the re-review obligation it is', async () => {
            seedAgent('@neo-ac4-returned');
            seedActivity('@neo-ac4-returned', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            seedReviewPing({id: 'AC4-CR-4', from: '@neo-ac4-returned', sentAt: iso(T0ms - 60 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #201 @ eee5555555] three actions'});
            // The author returns the ball: a re-review request ADDRESSED to the reviewer.
            seedReviewPing({id: 'AC4-RR-4', from: '@neo-ac4-author', to: '@neo-ac4-returned', sentAt: iso(T0ms - 10 * 60 * 1000),
                subject: '[re-review request][PR #201 @ fff6666666] all RAs discharged'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-returned');

            expect(reviewer.reviewLoad.open).toBe(1);
            expect(reviewer.reviewLoad.returned).toBe(1);
            expect(reviewer.reviewLoad.loops[0]).toMatchObject({pr: 201, returned: true});
        });

        test('#17225 AC4 — non-disposition mentions of the magic words neither open nor close a loop', async () => {
            seedAgent('@neo-ac4-robust');
            seedActivity('@neo-ac4-robust', {timestamp: iso(T0ms - 2 * 60 * 1000)});
            // The author is rostered TOO, so a phantom loop opened for the sender is observable —
            // an unrostered author would make this assertion vacuous.
            seedAgent('@neo-ac4-author');
            seedActivity('@neo-ac4-author', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            // A stale-approval WARNING names APPROVED but is not a disposition ping.
            seedReviewPing({id: 'AC4-STALE', from: '@neo-ac4-robust', sentAt: iso(T0ms - 20 * 60 * 1000),
                subject: '[approval STALE — do not merge on it][PR #301 @ 999aaaaaaa] GitHub still shows APPROVED from the dead head'});
            // An author's re-review request may QUOTE the RC vocabulary; the first tag is not a disposition.
            seedReviewPing({id: 'AC4-QUOTE', from: '@neo-ac4-author', to: '@neo-ac4-robust', sentAt: iso(T0ms - 15 * 60 * 1000),
                subject: '[re-review request][PR #302 @ 888bbbbbbb] your CHANGES_REQUESTED items are all discharged'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-robust');
            const author   = agents.find(a => a.identity === '@neo-ac4-author');

            expect(reviewer.reviewLoad.open).toBe(0);
            // The author never reviewed: quoting the vocabulary opens nothing for the sender either.
            expect(author.reviewLoad.open).toBe(0);
        });

        test('#17225 AC4 — terse carries the sparse reviewLoad map plus the wired container-plane load envelope', async () => {
            seedAgent('@neo-ac4-terse');
            seedActivity('@neo-ac4-terse', {timestamp: iso(T0ms - 2 * 60 * 1000)});
            seedAgent('@neo-ac4-terse-quiet');
            seedActivity('@neo-ac4-terse-quiet', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            seedReviewPing({id: 'AC4-CR-5', from: '@neo-ac4-terse', sentAt: iso(T0ms - 30 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #401 @ 123abcdef0] one blocking edit'});

            const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

            // Sparse by construction: a zero-load peer pays no entry — absent IS zero.
            expect(terse.reviewLoad['@neo-ac4-terse']).toBe(1);
            expect(terse.reviewLoad['@neo-ac4-terse-quiet']).toBeUndefined();

            const load = terse.axes?.load?.capability;
            expect(load).toBeTruthy();
            expect(load.plane).toBe('container');
            expect(load.signal).toBe('a2a-review-lifecycle');
            expect(load.state).toBe('wired');
            expect(load.confidence).toBe('observed');
            expect(load.capturedAt).toBe(terse.generatedAt);
            // The envelope names its own blind class: a review that never pinged is invisible here.
            expect(load.reason).toContain('ping');
        });

        test('#17225 AC4 — a loop older than the trail horizon ages out, declared not hidden', async () => {
            seedAgent('@neo-ac4-horizon');
            seedActivity('@neo-ac4-horizon', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            seedReviewPing({id: 'AC4-OLD', from: '@neo-ac4-horizon', sentAt: iso(T0ms - 31 * 24 * 60 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #501 @ 000fffffff1] ancient loop'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-horizon');

            expect(reviewer.reviewLoad.open).toBe(0);
        });

        test('#17267 review — an UNREADABLE trail degrades the load envelope; it never serves a counted zero over absence', async () => {
            seedAgent('@neo-ac4-degraded');
            seedActivity('@neo-ac4-degraded', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            const realDb = GraphService.db;

            try {
                // Branch 1: the store handle is absent entirely — the answer still returns (an
                // empty roster is the bigger outage's truth, not this axis's concern), the load
                // envelope degrades, and the sparse map is OMITTED rather than present-but-empty
                // (which would read as "everyone is zero" over absence of observation).
                GraphService.db = {storage: {db: null}};

                const terse = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

                expect(terse.axes.load.capability.state).toBe('degraded');
                expect(terse.axes.load.capability.confidence).toBe('none');
                expect(typeof terse.axes.load.capability.reason).toBe('string');
                expect('reviewLoad' in terse).toBe(false);

                // Branch 2: the trail read ALONE throws (a contended store) — the roster answer
                // must survive its axis failing. The stub kills only the MESSAGE query.
                const realSqlite = realDb.storage.db;

                GraphService.db = {storage: {db: {
                    prepare: sql => {
                        if (sql.includes('MESSAGE')) throw new Error('disk i/o error');
                        return realSqlite.prepare(sql)
                    }
                }}};

                const thrown = await WakeSubscriptionService.whoIsOnline({now: new Date(T0)});

                expect(thrown.axes.load.capability.state).toBe('degraded');
                expect(thrown.axes.load.capability.reason).toContain('disk i/o error');
                expect(thrown.online).toContain('@neo-ac4-degraded');

                const verbose = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
                const entry   = verbose.agents.find(a => a.identity === '@neo-ac4-degraded');

                expect(entry.reviewLoad).toBeNull(); // honest absence, distinct from the counted zero
            } finally {
                GraphService.db = realDb
            }
        });

        test('#17267 review — a dual-mention subject RETIRES the loop: the first disposition word wins', async () => {
            seedAgent('@neo-ac4-dual');
            seedActivity('@neo-ac4-dual', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            seedReviewPing({id: 'AC4-D1', from: '@neo-ac4-dual', sentAt: iso(T0ms - 60 * 60 * 1000),
                subject: '[review-posted][CHANGES_REQUESTED][PR #601 @ aaaa0000001] two edits'});
            // The approval names the prior RC vocabulary — the disposition it IS beats the one it QUOTES.
            seedReviewPing({id: 'AC4-D2', from: '@neo-ac4-dual', sentAt: iso(T0ms - 30 * 60 * 1000),
                subject: '[review-posted][PR #601 @ bbbb0000002] APPROVED — all CHANGES_REQUESTED items verified'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-dual');

            expect(reviewer.reviewLoad.open).toBe(0);
        });

        test('#17267 review — a REQUEST_CHANGES-tagged ping opens a loop (the tag-set and word-set agree)', async () => {
            seedAgent('@neo-ac4-rcform');
            seedActivity('@neo-ac4-rcform', {timestamp: iso(T0ms - 2 * 60 * 1000)});

            seedReviewPing({id: 'AC4-RC', from: '@neo-ac4-rcform', sentAt: iso(T0ms - 30 * 60 * 1000),
                subject: '[REQUEST_CHANGES][PR #701 @ cccc0000003] two edits'});

            const {agents} = await WakeSubscriptionService.whoIsOnline({verbose: true, now: new Date(T0)});
            const reviewer = agents.find(a => a.identity === '@neo-ac4-rcform');

            expect(reviewer.reviewLoad.open).toBe(1);
            expect(reviewer.reviewLoad.loops[0].pr).toBe(701);
        });
    });

    test.describe('rotateKey — the repair door for a row that lost its signing key', () => {
        const shapeB = (overrides = {}) => insertDurableSubscription({
            harnessTarget        : 'a2a-webhook',
            harnessTargetMetadata: {url: 'http://127.0.0.1:3199/wake', adapter: 'osascript', appName: 'Claude'},
            ...overrides
        }).subscriptionId;

        test('re-issues a key IN PLACE — the subscription id survives, which is the whole point', async () => {
            // Recovery by unsubscribe+subscribe allocates a NEW id, and that id is what the manifest,
            // the receiver route table, delivery receipts and the degrade all index on. Re-identification
            // is not repair.
            const id = shapeB();

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const result = await WakeSubscriptionService.rotateKey({subscriptionId: id});

                expect(result.subscriptionId).toBe(id);
                expect(result.status).toBe('rotated');
                expect(result.hadKey).toBe(false);
                expect(result.signingKey).toMatch(/^[0-9a-f]{64}$/);
            });
        });

        test('preserves the rest of the metadata — a wholesale replace would drop the url', async () => {
            const id = shapeB();

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await WakeSubscriptionService.rotateKey({subscriptionId: id});
            });

            const stored = GraphService.db.nodes.get(id).properties.harnessTargetMetadata;

            expect(stored.url).toBe('http://127.0.0.1:3199/wake');
            expect(stored.adapter).toBe('osascript');
            expect(stored.appName).toBe('Claude');
            expect(stored.signingKey).toMatch(/^[0-9a-f]{64}$/);
        });

        test('REFUSES a foreign owner — re-issuing another seat lets the caller sign that seat wakes', async () => {
            const id = shapeB({owner: '@alice'});

            await RequestContextService.run({agentIdentityNodeId: '@mallory'}, async () => {
                await expect(WakeSubscriptionService.rotateKey({subscriptionId: id}))
                    .rejects.toThrow(/Permission denied/);
            });
        });

        test('the foreign attempt leaves no key behind — the refusal is before the mint', async () => {
            const id = shapeB({owner: '@alice'});

            await RequestContextService.run({agentIdentityNodeId: '@mallory'}, async () => {
                await WakeSubscriptionService.rotateKey({subscriptionId: id}).catch(() => {});
            });

            expect(GraphService.db.nodes.get(id).properties.harnessTargetMetadata.signingKey).toBeUndefined();
        });

        test('rotates an EXISTING key too, and says which it did', async () => {
            const id = shapeB({
                harnessTargetMetadata: {url: 'http://127.0.0.1:3199/wake', signingKey: 'b'.repeat(64)}
            });

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const result = await WakeSubscriptionService.rotateKey({subscriptionId: id});

                expect(result.hadKey).toBe(true);
                expect(result.signingKey).not.toBe('b'.repeat(64));
            });
        });

        test('refuses a target that carries no key at all', async () => {
            const id = insertDurableSubscription({harnessTarget: 'bridge-daemon'}).subscriptionId;

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                await expect(WakeSubscriptionService.rotateKey({subscriptionId: id}))
                    .rejects.toThrow(/carries no signing key/);
            });
        });

        test('refuses an unbound identity rather than defaulting to an owner', async () => {
            const id = shapeB();

            await expect(WakeSubscriptionService.rotateKey({subscriptionId: id})).rejects.toThrow();
        });

        test('reaches the service through the MCP action name', async () => {
            // A method with no tool-surface route is unreachable; the dispatch string is the contract.
            const id = shapeB();

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const result = await WakeSubscriptionService.manage({action: 'rotate-key', subscriptionId: id});

                expect(result.status).toBe('rotated');
            });
        });
    });

    test.describe('fleet-identities — the fleet-telemetry read', () => {
        const bridgeArgs = {
            action               : 'subscribe',
            trigger              : 'SENT_TO_ME',
            harnessTarget        : 'bridge-daemon',
            harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', coalesceWindow: 0}
        };

        test('returns sorted deduplicated ACTIVE holder identities — absent status included by policy, retired excluded', async () => {
            GraphService.upsertNode({id: '@fleet-zed',  type: 'AGENT', name: 'Zed',  properties: {}});
            GraphService.upsertNode({id: '@fleet-yara', type: 'AGENT', name: 'Yara', properties: {}});
            GraphService.upsertNode({id: '@fleet-xico', type: 'AGENT', name: 'Xico', properties: {}});

            // zed holds TWO active rows (dedupe witness); yara's only row is retired via the real
            // lifecycle verb; xico's row has its status REMOVED raw — the unreachable-but-not-
            // impossible state whose meaning the shared policy owns (absent ⇒ active).
            await RequestContextService.run({agentIdentityNodeId: '@fleet-zed'}, async () => {
                await callTool('manage_wake_subscription', bridgeArgs);
                await callTool('manage_wake_subscription', bridgeArgs);
            });

            await RequestContextService.run({agentIdentityNodeId: '@fleet-yara'}, async () => {
                const {subscriptionId} = await callTool('manage_wake_subscription', bridgeArgs);

                await callTool('manage_wake_subscription', {action: 'unsubscribe', subscriptionId});
            });

            await RequestContextService.run({agentIdentityNodeId: '@fleet-xico'}, async () => {
                await callTool('manage_wake_subscription', bridgeArgs);
            });

            GraphService.db.storage.db.prepare(`
                UPDATE Nodes SET data = json_remove(data, '$.properties.status')
                WHERE json_extract(data, '$.label') = 'WAKE_SUBSCRIPTION'
                  AND json_extract(data, '$.properties.agentIdentity') = '@fleet-xico'
            `).run();

            const res = await RequestContextService.run({agentIdentityNodeId: '@alice'},
                () => callTool('manage_wake_subscription', {action: 'fleet-identities'}));

            // The two declared keys and NOTHING else — no rows, no owner properties.
            expect(Object.keys(res).sort()).toEqual(['identities', 'observations']);

            const {identities} = res;

            expect(identities.filter(identity => identity === '@fleet-zed')).toHaveLength(1);
            expect(identities).toContain('@fleet-xico');
            expect(identities).not.toContain('@fleet-yara');
            expect(identities).toEqual([...identities].sort());
        });

        test('the fleet-wide recency disclosure: another caller reads an identity\'s poll stamp as the REDACTED observation pair — never owner row material', async () => {
            GraphService.upsertNode({id: '@fleet-poller', type: 'AGENT', name: 'Poller', properties: {}});
            GraphService.upsertNode({id: '@fleet-silent', type: 'AGENT', name: 'Silent', properties: {}});

            let subscriptionId;

            await RequestContextService.run({agentIdentityNodeId: '@fleet-poller'}, async () => {
                ({subscriptionId} = await callTool('manage_wake_subscription', bridgeArgs));

                await callTool('manage_wake_subscription', {action: 'poll-digest', subscriptionId})
            });

            await RequestContextService.run({agentIdentityNodeId: '@fleet-silent'}, async () => {
                await callTool('manage_wake_subscription', bridgeArgs)
            });

            // A THIRD party — neither owner — derives recency from the fleet read: the exact
            // reachability the owner-only `list` cannot provide (storage is not exposure).
            const {observations} = await RequestContextService.run({agentIdentityNodeId: '@alice'},
                () => callTool('manage_wake_subscription', {action: 'fleet-identities'}));

            const
                poller = observations.find(row => row.identity === '@fleet-poller'),
                silent = observations.find(row => row.identity === '@fleet-silent');

            // Every observation row is EXACTLY the redacted pair — endpoint, filter, and
            // key-adjacent owner material must never ride the roster read.
            for (const row of observations) {
                expect(Object.keys(row).sort()).toEqual(['identity', 'lastPollAt'])
            }

            expect(typeof poller.lastPollAt).toBe('string');
            expect(Number.isNaN(Date.parse(poller.lastPollAt))).toBe(false);

            // Absence of polls stays absence-of-signal for the route-health consumer.
            expect(silent.lastPollAt).toBeNull();

            // Sorted by identity, and the identities projection is the observations projection.
            expect(observations.map(row => row.identity)).toEqual(observations.map(row => row.identity).sort())
        });

        test('an unbound caller is refused — authenticated-caller telemetry, not an open scan', async () => {
            await expect(WakeSubscriptionService.fleetIdentities()).rejects.toThrow(/identity/i)
        });
    });

    test.describe('route delivery annotation (#17619) — a stored row answers whether its transport builds a route', () => {
        test('a stored non-deliverable row reads back its withdrawal reason instead of a bare active', async () => {
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                // The schema still accepts the value and the row stores it; what changed is that
                // the owner can now see the transport never builds a route without reading the
                // manifest builder's source.
                const res = await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });

                const {subscriptions} = await WakeSubscriptionService.list();
                const row             = subscriptions.find(entry => entry.id === res.subscriptionId);

                expect(row.status).toBe('active');
                expect(row.routeDeliverable).toBe(false);
                expect(row.routeWithdrawalReason).toContain('mcp-notifications');
                expect(row.routeWithdrawalReason).toContain('not deliverable');
            });
        });

        test('a deliverable row carries routeDeliverable true and no withdrawal reason', async () => {
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.subscribe({
                    trigger              : 'SENT_TO_ME',
                    harnessTarget        : 'a2a-webhook',
                    harnessTargetMetadata: {url: 'https://example.com/wake-annotated'}
                });

                const {subscriptions} = await WakeSubscriptionService.list();
                const row             = subscriptions.find(entry => entry.id === res.subscriptionId);

                expect(row.routeDeliverable).toBe(true);
                // Absence of the reason IS the deliverable signal — the annotation never carries
                // a null placeholder that a consumer must know to ignore.
                expect(row).not.toHaveProperty('routeWithdrawalReason');
            });
        });

        test('the previously silent combination is now visible: subscribe succeeds, manifest omits, list says why', async () => {
            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                const res = await WakeSubscriptionService.subscribe({
                    trigger      : 'SENT_TO_ME',
                    harnessTarget: 'mcp-notifications'
                });

                const node = GraphService.db.nodes.get(res.subscriptionId);
                // The builder refuses an all-skipped build (fail-loud empty-manifest guard), so the
                // withdrawn row rides alongside a deliverable one — the skipped list is still the
                // assertion surface for the row under test.
                const deliverable = {
                    id                   : 'WAKE_SUB:deliverable-spec',
                    agentIdentity        : '@alice',
                    status               : 'active',
                    harnessTarget        : 'a2a-webhook',
                    harnessTargetMetadata: {url: 'https://example.com/wake', signingKey: 'a'.repeat(64)}
                };
                const {manifest, skipped} = buildWakeReceiverManifest({
                    subscriptions : [deliverable, {
                        id                   : res.subscriptionId,
                        agentIdentity        : '@alice',
                        status               : 'active',
                        harnessTarget        : node.properties.harnessTarget,
                        harnessTargetMetadata: node.properties.harnessTargetMetadata
                    }],
                    callerIdentity: '@alice'
                });

                expect(manifest.routes['WAKE_SUB:deliverable-spec']).toBeDefined();
                expect(manifest.routes[res.subscriptionId]).toBeUndefined();
                expect(skipped.map(entry => entry.subscriptionId)).toContain(res.subscriptionId);

                const {subscriptions} = await WakeSubscriptionService.list();
                const row             = subscriptions.find(entry => entry.id === res.subscriptionId);
                expect(row.routeDeliverable).toBe(false);
                expect(row.routeWithdrawalReason).toContain('not deliverable');
            });
        });
    });
});
