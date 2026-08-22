import {setup} from '../../../../setup.mjs';

const appName = 'MailboxServiceTest';

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
import fs             from 'fs-extra';
import fsPromises     from 'fs/promises';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import                            '../../../../../../src/manager/Instance.mjs';
import RequestContextService from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

test.describe.configure({ mode: 'serial' });

test.describe('Neo.ai.services.memory-core.MailboxService', () => {
    let MailboxService, GraphService, PermissionService, LifecycleService, SwarmHeartbeatService, buildMailboxDelta, callMemoryCoreTool, originalAutoSave, mailboxAiConfig, originalMailboxPolicy, readWalMessages, readPendingMessageWalRecords;
    let readBackgroundDeliveryState;
    let messageWalDir, getWakeDeliverySeries, readMessageWalSegmentLoadObservations;

    test.beforeAll(async () => {

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        // Load dynamically due to SQLite DB mount timing
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        getWakeDeliverySeries = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).getWakeDeliverySeries;
        readBackgroundDeliveryState = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).readBackgroundDeliveryState;
        readMessageWalSegmentLoadObservations = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).readMessageWalSegmentLoadObservations;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        SwarmHeartbeatService = (await import('../../../../../../ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs')).default;
        buildMailboxDelta = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).buildMailboxDelta;
        callMemoryCoreTool = (await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs')).callTool;
        const messageWalStore = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        readWalMessages              = messageWalStore.readWalMessages;
        readPendingMessageWalRecords = messageWalStore.readPendingMessageWalRecords;
        messageWalDir                = mailboxAiConfig.messageWal.dir;

        // Pin this suite to strict-isolation mode. These tests predate the
        // config-gated default and assert `'blocked'`-mode behavior (Unauthorized
        // throws on ungranted DMs, reachable-counterparty trust-lift semantics).
        // Explicit pin preserves their invariants regardless of the library default
        // shipped in the canonical template. Symmetric restore in afterAll per symmetric-cleanup
        // discipline — Playwright `fullyParallel` interleaves across files even when
        // describe mode is `serial`, so cross-file mutation of the singleton Config
        // needs both-ends guards.
        mailboxAiConfig.data.mailbox ??= {};
        originalMailboxPolicy = mailboxAiConfig.data.mailbox.defaultReplyPolicy;
        mailboxAiConfig.data.mailbox.defaultReplyPolicy = 'blocked';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        // Symmetric restore of the mailbox policy to whatever the library default
        // was before this suite ran.
        if (mailboxAiConfig?.data?.mailbox) {
            mailboxAiConfig.data.mailbox.defaultReplyPolicy = originalMailboxPolicy;
        }
        fs.removeSync(messageWalDir);
    });

    test.beforeEach(async () => {
        // Ensure a clean slate per test
        MailboxService.clearRelatedPullRequestStateCache();
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }
        fs.removeSync(messageWalDir);

        // Seed agents
        GraphService.upsertNode({ id: '@alice', type: 'AgentIdentity', name: 'Alice', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@bob', type: 'AgentIdentity', name: 'Bob', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });
    });

    function persistMessageNode(messageId) {
        GraphService.db.storage.db.prepare(`
            UPDATE Nodes SET data = ? WHERE id = ?
        `).run(JSON.stringify(GraphService.db.nodes.get(messageId)), messageId);
    }

    function retargetMessageEdge(messageId, type, target) {
        const edge = GraphService.db.edges.items.find(candidate =>
            candidate.source === messageId && candidate.type === type
        );

        expect(edge).toBeDefined();

        GraphService.upsertNode({id: target, type: 'AgentIdentity', name: `Legacy ${target}`, properties: {}});
        GraphService.db.edges.remove([edge]);
        GraphService.linkNodes(messageId, target, type, edge.weight ?? 1, edge.properties || {});
    }

    function clearGraphCacheWithoutStorageMutation() {
        // Suspend autoSave around the store clears or they are NOT storage-neutral: store
        // remove-mutations echo through onNodesMutate/onEdgesMutate into storage.removeNodes/
        // removeEdges — the raw version of this helper silently DELETED every cached row from
        // SQLite, invalidating any test premise that storage survives a cache reset.
        // Production cache-management paths (syncCache, LRU eviction) suspend the same way.
        const wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.autoSave = wasAutoSave;
        GraphService.db.vicinityLoadedNodes.clear();
        GraphService.db.lastAccessMap.clear();
    }

    /**
     * @summary Resolves one broadcast delivery receipt from the live graph fixture.
     * @param {String} messageId Message node id.
     * @param {String} recipient Recipient AgentIdentity id.
     * @returns {Object|undefined}
     */
    function getBroadcastDeliveryEdgeForTest(messageId, recipient) {
        return GraphService.db.edges.items.find(edge =>
            edge.source === messageId &&
            edge.target === recipient &&
            edge.type === 'DELIVERED_TO'
        );
    }

    /**
     * @summary Seeds one MESSAGE and its bounded carrier topology through the live graph owner.
     * @param {Object} options
     * @param {String} options.messageId
     * @param {String} [options.recipient='@bob']
     * @param {Boolean} [options.broadcast=false]
     * @param {*} [options.readAt=null]
     * @returns {void}
     */
    function seedReadStateCarrier({messageId, recipient='@bob', broadcast=false, readAt=null}) {
        GraphService.upsertNode({
            id        : messageId,
            type      : 'MESSAGE',
            name      : 'read-state diagnostic fixture',
            properties: {
                subject: 'diagnostic fixture',
                readAt
            }
        });

        GraphService.linkNodes(messageId, broadcast ? 'AGENT:*' : recipient, 'SENT_TO', 1, {});

        if (broadcast) {
            GraphService.linkNodes(messageId, recipient, 'DELIVERED_TO', 1, {readAt});
        }
    }

    /**
     * Damages one edge type of a message's GRAPH PROJECTION — cache and storage both — while leaving
     * the message WAL record intact. That is the state the repair path exists for: the WAL holds the
     * truth, the projection has lost a piece, and `repairMessageGraphIntegrity` rebuilds the piece
     * from the WAL.
     *
     * Evicting from cache alone proves nothing: `getAdjacentNodes` lazily reloads the vicinity from
     * storage, so the mark heals before it resolves and a cache-only test passes against the very
     * defect it claims to pin. autoSave stays ON here deliberately — the remove must echo through
     * onEdgesMutate into storage.removeEdges, which is precisely what the cache-only helper suspends.
     */
    function damageEdgeProjection(messageId, type) {
        const edges = GraphService.db.edges.items.filter(candidate =>
            candidate.source === messageId && candidate.type === type
        );

        GraphService.db.edges.remove(edges);
        GraphService.db.vicinityLoadedNodes.clear();
        GraphService.db.lastAccessMap.clear();

        return edges.length
    }

    /**
     * @summary Counts accepted-message payload reads while excluding compact `.graph.jsonl`
     * marker reads. The returned restore closure keeps the worker-global built-in module clean.
     * @returns {{getCount: Function, restore: Function}}
     */
    function instrumentMessageWalPayloadReads() {
        const originalReadFile = fsPromises.readFile;
        let   count            = 0;

        fsPromises.readFile = async (filePath, ...args) => {
            if (/message-wal-\d{4}-\d{2}-\d{2}\.jsonl$/.test(String(filePath))) count++;
            return originalReadFile(filePath, ...args)
        };

        return {
            getCount: () => count,
            restore : () => {
                fsPromises.readFile = originalReadFile;
            }
        }
    }

    /**
     * @summary Waits until an observed counter reaches `target`, or fails naming what it awaited.
     *
     * Replaces a fixed turn budget — `for (let turn = 0; turn < 50 && payloadReads < 2; turn++)` —
     * that could not distinguish *"the second read never happened"* from *"it has not happened yet"*.
     * On expiry that loop fell through into the value assertion, so a real defect and a busy machine
     * both reported `Received: 1`. At one worker the budget held; at four workers it did not.
     *
     * The deadline is a FAILURE bound, not a wait. The happy path ends the moment the condition holds,
     * so a slower machine costs nothing and only a genuine absence reaches the throw — which is the
     * whole difference from the budget it replaces.
     *
     * Polled at 25 ms rather than raced against a single `setTimeout(…, 10000)` for a specific reason:
     * a fixed second-scale timer in a unit spec is what `check-fixed-sleeps.mjs` exists to catch, and
     * neither of that guard's justifications would be truthful here. `wall-clock-under-test:` is false
     * (no elapsed time is asserted) and `out-waits:` is false (it out-waits no production constant) —
     * this timer never elapses when the code is right. Annotating it to buy silence would put a lie in
     * the one place the guard reads, so the wait stays under the threshold and needs no annotation.
     *
     * @param {Function} getCount Reads the observed counter.
     * @param {Number} target Count that ends the wait.
     * @param {String} awaited What is being waited for, quoted verbatim into the failure message.
     * @param {Number} [timeoutMs=10000] Failure bound.
     * @returns {Promise<void>}
     */
    async function waitForObservedCount(getCount, target, awaited, timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;

        while (getCount() < target) {
            if (Date.now() >= deadline) {
                throw new Error(
                    `Timed out after ${timeoutMs}ms awaiting ${awaited} — reached ${getCount()} of ${target}. ` +
                    'This wait ends on its condition, so the count is genuinely absent rather than late.'
                )
            }

            await new Promise(resolve => setTimeout(resolve, 25));
        }
    }

    test('addMessage enforces identity and routes correctly', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const promise = RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({ to: '@bob', subject: 'Hello', body: 'Test body' });
        });
        let res = await promise;

        expect(res.status).toBe('sent');
        expect(res.messageId).toMatch(/^MESSAGE:/);

        const node = GraphService.db.nodes.get(res.messageId);
        expect(node.properties.subject).toBe('Hello');

        // Verify edges
        let sentBy, sentTo;
        for (const edge of GraphService.db.edges.items) {
            if (edge.source === res.messageId) {
                if (edge.type === 'SENT_BY') sentBy = edge.target;
                if (edge.type === 'SENT_TO') sentTo = edge.target;
            }
        }
        expect(sentBy).toBe('@alice');
        expect(sentTo).toBe('@bob');

        const records = await readWalMessages({dir: messageWalDir});
        expect(records).toHaveLength(1);
        expect(records[0].id).toBe(res.messageId);
        expect(records[0].message.properties.subject).toBe('Hello');
        expect(records[0].routing).toMatchObject({sentBy: '@alice', to: '@bob', senderUserId: 'alice'});
        expect(records[0].planeId).toBe(mailboxAiConfig.plane.id);

        const pending = await readPendingMessageWalRecords({dir: messageWalDir});
        expect(pending).toHaveLength(0);
    });

    test('#16677: add_message returns its durable WAL receipt before graph projection', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const
            originalProject = MailboxService._projectMessageWalRecord,
            entered         = Promise.withResolvers(),
            release         = Promise.withResolvers();

        let projectionEntered = false;

        MailboxService._projectMessageWalRecord = async function(...args) {
            projectionEntered = true;
            entered.resolve();
            await release.promise;
            return originalProject.apply(this, args)
        };

        try {
            const outcome = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                return Promise.race([
                    callMemoryCoreTool('add_message', {
                        to     : '@bob',
                        subject: 'durable receipt boundary',
                        body   : 'graph projection is deliberately paused'
                    }).then(receipt => ({receipt})),
                    // wall-clock-under-test: the durable receipt must beat this 1s deadline arm —
                    // the race bound is the latency assertion
                    new Promise(resolve => setTimeout(() => resolve({deadline: true}), 1000))
                ])
            });

            expect(outcome.deadline).toBeUndefined();
            expect(outcome.receipt).toMatchObject({
                status          : 'sent',
                projectionStatus: 'pending'
            });
            expect(projectionEntered).toBe(false);

            const records = await readWalMessages({dir: messageWalDir});
            expect(records.map(record => record.id)).toContain(outcome.receipt.messageId);
            expect(GraphService.db.nodes.has(outcome.receipt.messageId)).toBe(false);

            await entered.promise;
            release.resolve();

            await expect.poll(() => GraphService.db.nodes.has(outcome.receipt.messageId)).toBe(true);
            await expect.poll(async () => (
                await readPendingMessageWalRecords({dir: messageWalDir})
            ).length).toBe(0);
        } finally {
            release.resolve();
            MailboxService._projectMessageWalRecord = originalProject;
        }
    });

    test('#16086: inspectReadState reads the owner SQLite without normal mailbox reads, repair, or mutation', async () => {
        const messageId = 'MESSAGE:inspect-read-state-direct';
        seedReadStateCarrier({messageId});

        const
            sqlite       = GraphService.db.storage.db,
            graphLogRows = sqlite.prepare('SELECT COUNT(*) AS count FROM GraphLog').get().count,
            beforeNode   = sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(messageId).data,
            beforeEdges  = sqlite.prepare('SELECT data FROM Edges WHERE source = ? ORDER BY id').all(messageId),
            forbidden    = [
                'getMessage',
                'listMessages',
                'repairMessageGraphIntegrity',
                'drainPendingMessageGraphProjections',
                'markRead',
                'archiveMessage'
            ],
            originals    = Object.fromEntries(forbidden.map(name => [name, MailboxService[name]]));

        try {
            for (const name of forbidden) {
                MailboxService[name] = () => {
                    throw new Error(`forbidden diagnostic dependency: ${name}`);
                };
            }

            const result = await RequestContextService.run(
                {agentIdentityNodeId: '@bob', userId: 'bob', source: 'env-var'},
                () => MailboxService.inspectReadState({messageId, recipient: '@bob'})
            );

            expect(result).toMatchObject({
                ok       : true,
                state    : 'unread',
                messageId,
                recipient: '@bob',
                route    : 'direct',
                carrier  : {kind: 'MESSAGE', rowId: messageId, readAt: null}
            });
        } finally {
            Object.assign(MailboxService, originals);
        }

        expect(sqlite.prepare('SELECT COUNT(*) AS count FROM GraphLog').get().count).toBe(graphLogRows);
        expect(sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(messageId).data).toBe(beforeNode);
        expect(sqlite.prepare('SELECT data FROM Edges WHERE source = ? ORDER BY id').all(messageId)).toEqual(beforeEdges);
    });

    test('#16086: inspectReadState enforces own/delegated inbox authority for broadcast carriers', async () => {
        const messageId = 'MESSAGE:inspect-read-state-broadcast';
        seedReadStateCarrier({
            messageId,
            broadcast: true,
            readAt   : '2026-07-28T08:01:00.000Z'
        });

        await expect(RequestContextService.run(
            {agentIdentityNodeId: '@alice', userId: 'alice', source: 'oidc'},
            () => MailboxService.inspectReadState({messageId, recipient: '@bob'})
        )).rejects.toThrow(/CAN_READ_INBOX_OF/);

        await RequestContextService.run(
            {agentIdentityNodeId: '@bob', userId: 'bob', source: 'oidc'},
            () => PermissionService.grantPermission({to: '@alice', scope: 'CAN_READ_INBOX_OF'})
        );

        const result = await RequestContextService.run(
            {agentIdentityNodeId: '@alice', userId: 'alice', source: 'oidc'},
            () => MailboxService.inspectReadState({messageId, recipient: '@bob'})
        );

        expect(result).toMatchObject({
            ok       : true,
            state    : 'read',
            messageId,
            recipient: '@bob',
            route    : 'broadcast',
            carrier  : {
                kind     : 'DELIVERED_TO',
                recipient: '@bob',
                readAt   : '2026-07-28T08:01:00.000Z'
            }
        });
    });

    test('#16086: inspect_deployment returns identical classifier output for stdio and HTTP identity contexts', async () => {
        const messageId = 'MESSAGE:inspect-deployment-read-state';
        seedReadStateCarrier({messageId});

        const {callTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        const outputs    = [];

        for (const source of ['env-var', 'oidc']) {
            outputs.push(await RequestContextService.run(
                {agentIdentityNodeId: '@bob', userId: 'bob', source},
                () => callTool('inspect_deployment', {
                    mailboxReadState: {messageId, recipient: '@bob'}
                })
            ));
        }

        expect(outputs[0].mailboxReadState).toMatchObject({
            ok       : true,
            state    : 'unread',
            messageId,
            recipient: '@bob',
            route    : 'direct'
        });
        expect(outputs[1].mailboxReadState).toEqual(outputs[0].mailboxReadState);
        await expect(MailboxService.inspectReadState({messageId, recipient: '@bob'}))
            .rejects.toThrow(/no agent identity context bound/);
    });

    /**
     * @summary The background wake resolver, driven against REAL graph rows — both storage shapes.
     *
     * **Why these arms exist.** The coalescer's own spec hand-injects `{readAt}`, which exercises the
     * consumer branch and is structurally incapable of falsifying the PRODUCER. Under that fixture a
     * resolver reading only broadcast `DELIVERED_TO` edges looked correct, while every READ DIRECT DM
     * came back `{}`, scored "unknown", and kept counting. @neo-gpt found it by tracing the reader
     * into the storage model instead of trusting its summary.
     *
     * The mailbox has two shapes and one rule: a per-recipient `DELIVERED_TO` edge carries broadcast
     * read-state, the MESSAGE node carries direct read-state. `seedReadStateCarrier` builds exactly
     * that, so these arms fail against a reader that knows only one half.
     *
     * The tri-state matters as much as the two shapes. `{}` meant BOTH "graph unavailable" and "row
     * absent", and collapsing them is what let a digest name a `latest` the recipient cannot open.
     */
    test('#16918: the background resolver reads DIRECT read-state off the MESSAGE node, not just the edge', () => {
        const messageId = 'MESSAGE:bg-direct-read';

        // Direct DM: readAt lives on the node and there is NO DELIVERED_TO edge at all.
        seedReadStateCarrier({messageId, recipient: '@bob', broadcast: false, readAt: '2026-08-10T10:00:00.000Z'});

        const state = readBackgroundDeliveryState(messageId, '@bob');

        expect(state.readAt, 'a read direct DM must report its committed readAt').toBe('2026-08-10T10:00:00.000Z');
        expect(state.present, 'and it must report the row as present').toBe(true);
        expect(state.missing).toBeUndefined()
    });

    test('#16918: NON-VACUITY — an UNREAD direct DM is present-without-readAt, not read', () => {
        // Without this the arm above passes against a resolver that reports every direct row as read.
        const messageId = 'MESSAGE:bg-direct-unread';

        seedReadStateCarrier({messageId, recipient: '@bob', broadcast: false, readAt: null});

        const state = readBackgroundDeliveryState(messageId, '@bob');

        expect(state.readAt, 'an unread row must not fabricate a readAt').toBeUndefined();
        expect(state.present, 'but it exists and is openable').toBe(true);
        expect(state.missing).toBeUndefined()
    });

    test('#16918: broadcast read-state still resolves off the per-recipient DELIVERED_TO edge', () => {
        // The half that already worked, pinned so the direct-shape repair cannot regress it.
        const messageId = 'MESSAGE:bg-broadcast-read';

        seedReadStateCarrier({messageId, recipient: '@bob', broadcast: true, readAt: '2026-08-10T11:00:00.000Z'});

        expect(readBackgroundDeliveryState(messageId, '@bob').readAt).toBe('2026-08-10T11:00:00.000Z')
    });

    test('#16918: an ABSENT message row reports `missing`, which is not the same answer as unread', () => {
        // AC-6. Nothing is seeded — the row genuinely does not exist. Reporting `{}` here is what let
        // the digest advertise a `latest` pointing at a message the recipient could never open.
        const state = readBackgroundDeliveryState('MESSAGE:bg-never-existed', '@bob');

        expect(state.missing, 'an absent row must be positively reported as missing').toBe(true);
        expect(state.present).toBeUndefined();
        expect(state.readAt).toBeUndefined()
    });

    test('addMessage stamps the normalized canonical user_id, keeping @-form only as the sender label (#13578)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({ to: '@bob', subject: 'Canon', body: 'body' });
        });

        const node = GraphService.db.nodes.get(res.messageId);
        // The user_id isolation column is the normalized form (no @); `from` stays the @-form sender label.
        expect(node.properties.userId).toBe('alice');
        expect(node.properties.from).toBe('@alice');

        // The pre-set mailbox edges carry the normalized user_id too (they bypass upsertNode's default stamp).
        const sentByEdge = GraphService.db.edges.items.find(e => e.source === res.messageId && e.type === 'SENT_BY');
        expect(sentByEdge.properties.userId).toBe('alice');
    });

    test('addMessage accepts durably when a required SENT_TO projection edge is culled (#13891)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'culled route',
                    body   : 'body'
                });
            });

            expect(res.status).toBe('sent');
            expect(res.projectionStatus).toBe('pending');
            expect(res.messageId).toMatch(/^MESSAGE:/);

            const records = await readWalMessages({dir: messageWalDir});
            expect(records).toHaveLength(1);
            expect(records[0].id).toBe(res.messageId);
            expect(records[0].message.properties.subject).toBe('culled route');
            expect(records[0].routing.to).toBe('@bob');

            const pending = await readPendingMessageWalRecords({dir: messageWalDir});
            expect(pending.map(record => record.id)).toEqual([res.messageId]);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('drainPendingMessageGraphProjections replays pending direct MESSAGE rows idempotently (#13892)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;
        let   res;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'replay me',
                    body   : 'body'
                });
            });
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }

        expect(res.projectionStatus).toBe('pending');
        expect((await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).map(record => record.id)).toEqual([res.messageId]);

        const firstDrain = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(firstDrain).toEqual({pending: 1, projected: 1, failed: 0});

        const secondDrain = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(secondDrain).toEqual({pending: 0, projected: 0, failed: 0});

        const sentTo = GraphService.db.edges.items.find(edge =>
            edge.source === res.messageId &&
            edge.type === 'SENT_TO' &&
            edge.target === '@bob'
        );

        expect(sentTo).toBeDefined();
        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);
    });

    test('#15038 legacy direct WAL replay persists only canonical identities and is idempotent', async () => {
        const
            messageId = 'MESSAGE:legacy-direct-identity-replay',
            sentAt    = new Date().toISOString(),
            record    = {
                id                    : messageId,
                timestamp             : Date.parse(sentAt),
                sentAt,
                graphProjectionVersion: 1,
                message               : {
                    id        : messageId,
                    type      : 'MESSAGE',
                    name      : 'legacy direct identities',
                    properties: {
                        subject     : 'legacy direct identities',
                        bodyText    : 'canonicalize on replay',
                        sentAt,
                        readAt      : null,
                        from        : '@@alice',
                        to          : 'AGENT:@bob',
                        userId      : 'alice',
                        sharedEntity: true
                    }
                },
                routing: {
                    sentBy             : 'AGENT:@alice',
                    to                 : 'bob',
                    senderUserId       : 'alice',
                    broadcastRecipients: []
                }
            };

        await MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false});
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false});

        const
            storedMessage = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(messageId).data),
            routingEdges  = GraphService.db.storage.db.prepare(
                "SELECT target, type FROM Edges WHERE source = ? AND type IN ('SENT_BY', 'SENT_TO') ORDER BY type"
            ).all(messageId);

        expect(storedMessage.properties).toMatchObject({from: '@alice', to: '@bob'});
        expect(routingEdges).toEqual([
            {target: '@alice', type: 'SENT_BY'},
            {target: '@bob', type: 'SENT_TO'}
        ]);

        for (const legacyId of ['@@alice', 'AGENT:@alice', 'bob', 'AGENT:@bob']) {
            const row = GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Nodes WHERE id = ?').get(legacyId);
            expect(row.count).toBe(0);
        }
    });

    test('#15038 legacy direct WAL replay refuses an existing wrong-type sender before writing', async () => {
        GraphService.upsertNode({id: '@alice', type: 'CLASS', name: 'Collision', properties: {}});

        const messageId = 'MESSAGE:wrong-type-direct-replay',
            record      = {
                id                    : messageId,
                timestamp             : Date.now(),
                graphProjectionVersion: 1,
                message               : {
                    id        : messageId,
                    type      : 'MESSAGE',
                    properties: {subject: 'refuse collision', bodyText: 'body', from: 'alice', to: 'bob'}
                },
                routing: {sentBy: 'alice', to: 'bob', broadcastRecipients: []}
            };

        await expect(MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false}))
            .rejects.toThrow(/endpoint @alice must be AgentIdentity; found CLASS/);

        expect(GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Nodes WHERE id = ?').get(messageId).count).toBe(0);
        expect(GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Edges WHERE source = ?').get(messageId).count).toBe(0);
    });

    test('listMessages/getMessage repair projected direct messages after graph row loss (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@bob',
                subject: 'repair row loss',
                body   : 'durable body'
            });
        });

        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);

        GraphService.db.storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run(res.messageId);
        clearGraphCacheWithoutStorageMutation();

        const bobInbox = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({status: 'all'});
        });

        expect(bobInbox.messages.map(message => message.messageId)).toContain(res.messageId);

        const repairedMessage = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({messageId: res.messageId});
        });

        expect(repairedMessage.subject).toBe('repair row loss');
        expect(repairedMessage.body).toBe('durable body');
        expect(repairedMessage.readAt).toBeNull();

        const repairCheck = await MailboxService.repairMessageGraphIntegrity({ids: [res.messageId]});
        expect(repairCheck).toMatchObject({scanned: 1, intact: 1, repaired: 0, failed: 0});
    });

    test('listMessages repairs a broadcast whose WHOLE DELIVERED_TO cohort was lost — read-path, no prior mark (#15369)', async () => {
        // @bob authorizes @alice; @alice broadcasts to AGENT:* (bob + charlie are the immutable
        // send-time audience). Multi-recipient intent proves a whole-cohort repair, not a one-edge
        // special case.
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });
        GraphService.upsertNode({
            id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: 'AGENT:*', subject: 'cohort loss', body: 'durable broadcast'});
        });

        // WAL truth is committed BEFORE we damage the projection — the repair source is real.
        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);
        expect((await readWalMessages({dir: messageWalDir}))[0].routing.broadcastRecipients).toEqual(['@bob', '@charlie']);

        // TOTAL cohort loss: strip every DELIVERED_TO edge (cache AND storage) while the MESSAGE node,
        // SENT_BY, and SENT_TO → AGENT:* all survive. The count trio (MESSAGE/SENT_BY/SENT_TO) therefore
        // still matches projectedCount, so the pre-fix gate is BLIND — this is the exact silent damage
        // class the read-gate could not see, and the only signal is the zero-DELIVERED_TO broadcast term.
        const removed = damageEdgeProjection(res.messageId, 'DELIVERED_TO');
        expect(removed, 'the broadcast must have had the full two-recipient cohort to lose').toBe(2);
        expect(
            GraphService.db.storage.db.prepare("SELECT COUNT(*) AS c FROM Edges WHERE source = ? AND type = 'DELIVERED_TO'").get(res.messageId).c,
            'storage cohort is truly gone — not a cache-only eviction that self-heals on reload'
        ).toBe(0);

        // The read path, NO prior mark: a recipient LISTS. The message stays visible via the surviving
        // SENT_TO → AGENT:* sentinel, so the loss is silent — but the per-recipient DELIVERED_TO cohort
        // (delivery + read-state) is gone. Pre-fix the blind gate early-returns at scanned:0, so the list
        // leaves the cohort broken; post-fix the broadcast-cohort term flips the gate and the WAL-backed
        // repair rebuilds it during the read.
        const bogusSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        fs.ensureDirSync(bogusSegment);

        try {
            const bobInbox = await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                return await MailboxService.listMessages({status: 'all'});
            });
            expect(bobInbox.messages.map(message => message.messageId)).toContain(res.messageId);
        } finally {
            fs.removeSync(bogusSegment);
        }

        expect(GraphService.db.storage.db.prepare(`
            SELECT target
              FROM Edges
             WHERE source = ?
               AND type = 'DELIVERED_TO'
             ORDER BY target
        `).all(res.messageId).map(row => row.target)).toEqual(['@bob', '@charlie']);

        // THE discriminating assertion (red-proof confirmed by disabling the new term): a follow-up
        // integrity scan finds the cohort already rebuilt by the read. Without the fix the list never
        // repairs, so this scan reports `repaired: 1` — the exact never-self-heals defect this closes.
        const repairCheck = await MailboxService.repairMessageGraphIntegrity({ids: [res.messageId]});
        expect(repairCheck).toMatchObject({scanned: 1, intact: 1, repaired: 0, failed: 0});
    });

    test('a legitimate zero-audience broadcast stays converged across repeated lists (#16767)', async () => {
        GraphService.removeNodes(['@bob']);

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'zero audience',
                body   : 'legitimate single-resident broadcast'
            });
        });
        const [record] = await readWalMessages({dir: messageWalDir});

        expect(record.id).toBe(res.messageId);
        expect(record.routing.broadcastRecipients).toEqual([]);
        expect(GraphService.db.storage.db.prepare(`
            SELECT COUNT(*) AS count
              FROM Edges
             WHERE source = ?
               AND type = 'DELIVERED_TO'
        `).get(res.messageId).count).toBe(0);

        const bogusSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        const reads        = instrumentMessageWalPayloadReads();
        fs.ensureDirSync(bogusSegment);

        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                const outbox = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                    return await MailboxService.listMessages({box: 'outbox', status: 'all'});
                });
                expect(outbox.messages.map(message => message.messageId)).toContain(res.messageId);
            }

            // Known zero lives in the compact projection marker. Neither the first nor second
            // list reopens an accepted payload, and the corrupt unrelated segment stays untouched.
            expect(reads.getCount()).toBe(0);
        } finally {
            reads.restore();
            fs.removeSync(bogusSegment);
        }
    });

    test('a historical broadcast without cohort evidence receives one durable compatibility disposition (#16767)', async () => {
        GraphService.removeNodes(['@bob']);

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'legacy audience',
                body   : 'accepted before cohort markers'
            });
        });
        const [record]    = await readWalMessages({dir: messageWalDir});
        const segmentKey  = record.segmentKey;
        const payloadPath = path.join(messageWalDir, `message-wal-${segmentKey}.jsonl`);
        const markerPath  = path.join(messageWalDir, `message-wal-${segmentKey}.graph.jsonl`);

        delete record.routing.broadcastRecipients;
        fs.writeFileSync(payloadPath, `${JSON.stringify(record)}\n`, 'utf8');

        const originalMarker = JSON.parse(fs.readFileSync(markerPath, 'utf8').trim());
        delete originalMarker.broadcastCohort;
        fs.writeFileSync(markerPath, `${JSON.stringify(originalMarker)}\n`, 'utf8');

        const bogusSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        const reads        = instrumentMessageWalPayloadReads();
        fs.ensureDirSync(bogusSegment);

        try {
            const first = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                return await MailboxService.listMessages({box: 'outbox', status: 'all'});
            });
            expect(first.messages.map(message => message.messageId)).toContain(res.messageId);
            expect(reads.getCount()).toBe(1);

            const markerEntries = fs.readFileSync(markerPath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
            expect(markerEntries.at(-1).broadcastCohort).toEqual({disposition: 'legacy-unknown'});

            const second = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                return await MailboxService.listMessages({box: 'outbox', status: 'all'});
            });
            expect(second.messages.map(message => message.messageId)).toContain(res.messageId);
            expect(reads.getCount(), 'the second list must consume the compatibility marker, not reread WAL').toBe(1);
        } finally {
            reads.restore();
            fs.removeSync(bogusSegment);
        }
    });

    test('a global discrepancy outside the caller view does not consume the bounded repair window (#16767)', async () => {
        GraphService.upsertNode({
            id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'bob only', body: 'unrelated to charlie'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        // Simulate a marker from before routing metadata was persisted. The first unrelated list may perform the one-time indexed
        // route migration read; the enriched marker must make every later unrelated list payload-free.
        const markerPath = fs.readdirSync(messageWalDir)
            .map(name => path.join(messageWalDir, name))
            .find(filePath => filePath.endsWith('.graph.jsonl'));
        const markerEntry = JSON.parse(fs.readFileSync(markerPath, 'utf8').trim());
        delete markerEntry.mailboxRouting;
        fs.writeFileSync(markerPath, `${JSON.stringify(markerEntry)}\n`, 'utf8');

        const bogusSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        const reads        = instrumentMessageWalPayloadReads();
        fs.ensureDirSync(bogusSegment);

        try {
            const repair = await MailboxService.repairMessageGraphIntegrity({
                target: '@charlie', box: 'inbox', limit: 1
            });

            expect(repair).toMatchObject({
                candidateCount: 1, matchedCandidateCount: 0, scanned: 0, repaired: 0, failed: 0
            });
            expect(reads.getCount()).toBe(1);

            const charlieInbox = await RequestContextService.run({agentIdentityNodeId: '@charlie'}, async () => {
                return await MailboxService.listMessages({status: 'all'});
            });
            expect(charlieInbox.messages).toEqual([]);
            expect(reads.getCount(), 'route migration must retire the unrelated candidate WAL tax').toBe(1);
        } finally {
            reads.restore();
            fs.removeSync(bogusSegment);
        }
    });

    test('a route-marker append failure remains an observable residual, never a list failure or repeated WAL tax (#16767)', async () => {
        GraphService.upsertNode({
            id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'marker append failure', body: 'bounded'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const markerPath = fs.readdirSync(messageWalDir)
            .map(name => path.join(messageWalDir, name))
            .find(filePath => filePath.endsWith('.graph.jsonl'));
        const markerEntry = JSON.parse(fs.readFileSync(markerPath, 'utf8').trim());
        delete markerEntry.mailboxRouting;
        fs.writeFileSync(markerPath, `${JSON.stringify(markerEntry)}\n`, 'utf8');

        const originalAppendFile = fsPromises.appendFile,
            reads                = instrumentMessageWalPayloadReads();

        fsPromises.appendFile = async (filePath, ...args) => {
            if (String(filePath).endsWith('.graph.jsonl')) throw new Error('injected marker EIO');
            return originalAppendFile(filePath, ...args)
        };

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@charlie', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({
                candidateCount       : 1,
                matchedCandidateCount: 0,
                scanned              : 0,
                failed               : 0,
                compatibility        : {persistenceFailed: 1}
            });
            expect(reads.getCount()).toBe(1);

            const second = await MailboxService.repairMessageGraphIntegrity({
                target: '@charlie', box: 'inbox', limit: 1
            });
            expect(second).toMatchObject({
                candidateCount       : 1,
                matchedCandidateCount: 0,
                scanned              : 0,
                failed               : 0,
                compatibility        : {cached: 1, persistenceFailed: 0}
            });
            expect(reads.getCount(), 'the immutable in-process route cache bounds a failed append').toBe(1);
        } finally {
            fsPromises.appendFile = originalAppendFile;
            reads.restore();
        }
    });

    test('an unreadable candidate segment backs off until its payload signature changes (#16767)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'unreadable candidate', body: 'retry on change'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const [record]  = await readWalMessages({dir: messageWalDir}),
            payloadPath = path.join(messageWalDir, `message-wal-${record.segmentKey}.jsonl`),
            payloadText = fs.readFileSync(payloadPath, 'utf8'),
            reads       = instrumentMessageWalPayloadReads();

        fs.removeSync(payloadPath);
        fs.ensureDirSync(payloadPath);

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({
                candidateCount          : 1, matchedCandidateCount: 1, scanned: 0,
                unreadableCandidateCount: 1, deferredUnreadableCandidateCount: 0
            });
            expect(reads.getCount()).toBe(1);

            const second = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(second).toMatchObject({
                candidateCount          : 1, matchedCandidateCount: 1, scanned: 0,
                unreadableCandidateCount: 1, deferredUnreadableCandidateCount: 1
            });
            expect(reads.getCount(), 'unchanged unreadable payload must stay behind backoff').toBe(1);

            fs.removeSync(payloadPath);
            fs.writeFileSync(payloadPath, payloadText, 'utf8');

            const third = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(third).toMatchObject({
                candidateCount: 1, matchedCandidateCount: 1, scanned: 1,
                repaired      : 1, failed: 0, unreadableCandidateCount: 0
            });
            expect(reads.getCount(), 'file-kind/signature change must retry immediately').toBe(2);
        } finally {
            reads.restore();
            if (fs.existsSync(payloadPath) && fs.statSync(payloadPath).isDirectory()) {
                fs.removeSync(payloadPath);
                fs.writeFileSync(payloadPath, payloadText, 'utf8');
            }
        }
    });

    test('an unreadable candidate is retried after its durable marker leaves and re-enters the index (#16767)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'marker generation', body: 'prune stale cooldown'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const [record]  = await readWalMessages({dir: messageWalDir}),
            payloadPath = path.join(messageWalDir, `message-wal-${record.segmentKey}.jsonl`),
            markerPath  = path.join(messageWalDir, `message-wal-${record.segmentKey}.graph.jsonl`),
            payloadText = fs.readFileSync(payloadPath, 'utf8'),
            markerText  = fs.readFileSync(markerPath, 'utf8'),
            reads       = instrumentMessageWalPayloadReads();

        // Keep the payload generation stable and unreadable for this id while removing only the
        // durable projection marker. The empty marker population must retire its old cooldown.
        fs.writeFileSync(payloadPath, '', 'utf8');

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({scanned: 0, unreadableCandidateCount: 1});
            expect(reads.getCount()).toBe(1);

            fs.removeSync(markerPath);
            const absent = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(absent).toMatchObject({candidateCount: 0, scanned: 0});

            fs.writeFileSync(markerPath, markerText, 'utf8');
            const restored = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(restored).toMatchObject({
                candidateCount          : 1, scanned: 0,
                unreadableCandidateCount: 1, deferredUnreadableCandidateCount: 0
            });
            expect(reads.getCount(), 'a marker generation change must retire stale candidate state').toBe(2);
        } finally {
            reads.restore();
            fs.writeFileSync(payloadPath, payloadText, 'utf8');
            fs.writeFileSync(markerPath, markerText, 'utf8');
        }
    });

    test('ordinary active-segment growth does not wake an older unreadable candidate (#16767)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'missing row', body: 'append-safe backoff'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const [record]      = await readWalMessages({dir: messageWalDir}),
            payloadPath     = path.join(messageWalDir, `message-wal-${record.segmentKey}.jsonl`),
            replacementPath = `${payloadPath}.replacement`,
            payloadText     = fs.readFileSync(payloadPath, 'utf8'),
            reads           = instrumentMessageWalPayloadReads();

        // Truncate in place so the marker survives but its indexed accepted row is absent.
        fs.writeFileSync(payloadPath, '', 'utf8');

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({scanned: 0, unreadableCandidateCount: 1});
            expect(reads.getCount()).toBe(1);

            // A different accepted-looking row grows the same inode. It cannot repair the older
            // id, so the cooldown must survive this ordinary active-day append.
            const unrelated = {
                ...record,
                id     : 'MESSAGE:unrelated-append',
                message: {...record.message, id: 'MESSAGE:unrelated-append'}
            };
            fs.appendFileSync(payloadPath, `${JSON.stringify(unrelated)}\n`, 'utf8');

            const second = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(second).toMatchObject({
                scanned: 0, unreadableCandidateCount: 1, deferredUnreadableCandidateCount: 1
            });
            expect(reads.getCount(), 'monotonic segment growth must not defeat the backoff').toBe(1);

            fs.writeFileSync(replacementPath, payloadText, 'utf8');
            fs.renameSync(replacementPath, payloadPath);

            const third = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(third).toMatchObject({scanned: 1, repaired: 1, failed: 0});
            expect(reads.getCount(), 'inode replacement must retry immediately').toBe(2);
        } finally {
            reads.restore();
            fs.removeSync(replacementPath);
            fs.removeSync(payloadPath);
            fs.writeFileSync(payloadPath, payloadText, 'utf8');
        }
    });

    test('an equal-size in-place payload correction wakes an unreadable candidate immediately (#16767)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'same-size correction', body: 'mtime is evidence'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const [record]    = await readWalMessages({dir: messageWalDir}),
            payloadPath   = path.join(messageWalDir, `message-wal-${record.segmentKey}.jsonl`),
            payloadText   = fs.readFileSync(payloadPath, 'utf8'),
            replacementId = 'MESSAGE:00000000-0000-4000-8000-000000000000',
            missingText   = payloadText.split(res.messageId).join(replacementId),
            originalStat  = fs.statSync(payloadPath),
            reads         = instrumentMessageWalPayloadReads();

        expect(replacementId.length).toBe(res.messageId.length);
        expect(Buffer.byteLength(missingText)).toBe(Buffer.byteLength(payloadText));
        fs.writeFileSync(payloadPath, missingText, 'utf8');

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({scanned: 0, unreadableCandidateCount: 1});
            expect(reads.getCount()).toBe(1);

            fs.writeFileSync(payloadPath, payloadText, 'utf8');
            const changedTime = new Date(Date.now() + 2000);
            fs.utimesSync(payloadPath, changedTime, changedTime);

            const correctedStat = fs.statSync(payloadPath);
            expect(correctedStat.ino).toBe(originalStat.ino);
            expect(correctedStat.size).toBe(originalStat.size);

            const second = await MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            expect(second).toMatchObject({scanned: 1, repaired: 1, failed: 0});
            expect(reads.getCount(), 'changed evidence at equal size must bypass the cooldown').toBe(2);
        } finally {
            reads.restore();
            fs.writeFileSync(payloadPath, payloadText, 'utf8');
        }
    });

    test('concurrent same-id repairs await one projection mutation (#16767)', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const res = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'single flight', body: 'one writer'});
        });
        expect(damageEdgeProjection(res.messageId, 'SENT_BY')).toBe(1);

        const originalProject = MailboxService._projectMessageWalRecord,
            originalReadFile  = fsPromises.readFile;
        let   projectCalls = 0,
            payloadReads   = 0,
            releasePayloadRead,
            announceReadEntered;
        const payloadReadGate = new Promise(resolve => {
            releasePayloadRead = resolve;
        });
        const readEntered = new Promise(resolve => {
            announceReadEntered = resolve;
        });

        fsPromises.readFile = async (filePath, ...args) => {
            if (/message-wal-\d{4}-\d{2}-\d{2}\.jsonl$/.test(String(filePath))) {
                payloadReads++;
                announceReadEntered();
                await payloadReadGate;
            }
            return originalReadFile(filePath, ...args)
        };

        MailboxService._projectMessageWalRecord = async function(record, options) {
            projectCalls++;
            return originalProject.call(this, record, options)
        };

        try {
            const first  = MailboxService.repairMessageGraphIntegrity({target: '@bob', box: 'inbox', limit: 1});
            const second = MailboxService.repairMessageGraphIntegrity({target: '@bob', box: 'inbox', limit: 1});

            await readEntered;
            // No wait, and no assertion. Both callers pass the SAME `target` rather than ids, so
            // both route through `getMailboxGraphProjectionRepairCandidates()` — whose coalescing
            // promise is process-wide rather than keyed (`MailboxService.mjs:1573`), and which the
            // id path skips entirely (`:2705`, `idFilter ? null : await …`). These two are therefore
            // already joined UPSTREAM of the segment load, and caller two cannot reach its decision
            // independently of caller one. A turn budget here had nothing to synchronise.
            //
            // The assertion that used to sit here was a strictly weaker form of the exact-count
            // check below — "one read so far" versus "one read in total" — and measured at zero
            // turns with the single-flight disabled, that check still fails. Detection never lived
            // here either.
            releasePayloadRead();

            const results = await Promise.all([first, second]);
            expect(projectCalls).toBe(1);
            expect(payloadReads, 'record loading and mutation must share the single-flight pipeline').toBe(1);
            expect(results.map(item => item.repaired).sort()).toEqual([0, 1]);
            expect(results.map(item => item.coalescedCandidateCount).sort()).toEqual([0, 1]);
            expect(results.every(item => item.failed === 0)).toBe(true);
        } finally {
            releasePayloadRead();
            fsPromises.readFile = originalReadFile;
            MailboxService._projectMessageWalRecord = originalProject;
        }
    });

    test('concurrent global and explicit repairs share one physical segment load (#16767)', async () => {
        GraphService.upsertNode({
            id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}
        });
        for (const recipient of ['@bob', '@charlie']) {
            await RequestContextService.run({agentIdentityNodeId: recipient}, async () => {
                await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
            });
        }

        const [bobMessage, charlieMessage] = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await Promise.all([
                MailboxService.addMessage({to: '@bob', subject: 'segment one', body: 'global path'}),
                MailboxService.addMessage({to: '@charlie', subject: 'segment two', body: 'explicit path'})
            ])
        });
        expect(damageEdgeProjection(bobMessage.messageId, 'SENT_BY')).toBe(1);
        expect(damageEdgeProjection(charlieMessage.messageId, 'SENT_BY')).toBe(1);

        const originalProject = MailboxService._projectMessageWalRecord,
            originalReadFile  = fsPromises.readFile;
        let   projectCalls = 0,
            payloadReads   = 0,
            releasePayloadRead,
            announceReadEntered;
        const payloadReadGate = new Promise(resolve => {
            releasePayloadRead = resolve;
        });
        const readEntered = new Promise(resolve => {
            announceReadEntered = resolve;
        });

        fsPromises.readFile = async (filePath, ...args) => {
            if (/message-wal-\d{4}-\d{2}-\d{2}\.jsonl$/.test(String(filePath))) {
                payloadReads++;
                announceReadEntered();
                await payloadReadGate;
            }
            return originalReadFile(filePath, ...args)
        };

        MailboxService._projectMessageWalRecord = async function(record, options) {
            projectCalls++;
            return originalProject.call(this, record, options)
        };

        try {
            // Baseline BEFORE either caller starts. The tallies are monotonic for the process, so
            // absolute readings would carry every segment load this suite already performed.
            const loadBaseline = readMessageWalSegmentLoadObservations();
            const globalRepair = MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            const explicitRepair = MailboxService.repairMessageGraphIntegrity({
                ids: [charlieMessage.messageId], limit: 1
            });

            await readEntered;
            // A RENDEZVOUS, not a budget. Unlike the same-target pair above, these two callers
            // DIVERGE before the join: the global path awaits the coalescing candidate scan while
            // the explicit-ids path skips it, so caller two's arrival is not coupled to caller one's.
            // Waiting a fixed number of turns for it is a budget standing in for a condition; this
            // waits for the condition. A timeout here means the second caller genuinely never
            // reached the decision, never that it was slow.
            await waitForObservedCount(
                () => readMessageWalSegmentLoadObservations().decisions - loadBaseline.decisions,
                2,
                'both repair callers to reach the segment-load join decision'
            );
            // Assert the JOIN, not the read count. Measured, and the reason this is not
            // `expect(payloadReads).toBe(1)` here: the decision lands strictly before any read it
            // opens has registered, so a read-count check at this point reads 1 whether the second
            // caller joined or opened its own, and passes vacuously with single-flight broken. The
            // read count is a proxy for joining and it resolves late; the join tally is the fact
            // itself, final in the same synchronous block as the decision.
            expect(readMessageWalSegmentLoadObservations().joins - loadBaseline.joins,
                'the second caller must JOIN the in-flight load rather than open its own').toBe(1);
            releasePayloadRead();

            const results = await Promise.all([globalRepair, explicitRepair]);
            expect(payloadReads, 'different ids in one segment must join before either read completes').toBe(1);
            // One decision per caller is the assumption the rendezvous rests on. If either path ever
            // spans a second segment, the wait above could be satisfied by one caller alone and
            // silently decay back into a race — this pins it so that says so instead.
            expect(readMessageWalSegmentLoadObservations().decisions - loadBaseline.decisions,
                'the rendezvous assumes exactly one join decision per caller').toBe(2);
            expect(projectCalls).toBe(2);
            expect(results.map(item => item.repaired)).toEqual([1, 1]);
            expect(results.every(item => item.failed === 0)).toBe(true);
        } finally {
            releasePayloadRead();
            fsPromises.readFile = originalReadFile;
            MailboxService._projectMessageWalRecord = originalProject;
        }
    });

    test('a marker-cohort change starts a new segment-load generation (#16767)', async () => {
        GraphService.upsertNode({
            id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}
        });
        for (const recipient of ['@bob', '@charlie']) {
            await RequestContextService.run({agentIdentityNodeId: recipient}, async () => {
                await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
            });
        }

        const bobMessage = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@bob', subject: 'old marker cohort', body: 'first load'});
        });
        const charlieMessage = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            return await MailboxService.addMessage({to: '@charlie', subject: 'new marker cohort', body: 'second load'});
        });
        expect(damageEdgeProjection(bobMessage.messageId, 'SENT_BY')).toBe(1);
        expect(damageEdgeProjection(charlieMessage.messageId, 'SENT_BY')).toBe(1);

        const markerPath = fs.readdirSync(messageWalDir)
                .map(name => path.join(messageWalDir, name))
                .find(filePath => filePath.endsWith('.graph.jsonl')),
            markerText   = fs.readFileSync(markerPath, 'utf8'),
            markerLines  = markerText.trim().split('\n'),
            oldCohort    = markerLines.filter(line => JSON.parse(line).id !== charlieMessage.messageId);

        expect(oldCohort.length).toBe(markerLines.length - 1);
        fs.writeFileSync(markerPath, `${oldCohort.join('\n')}\n`, 'utf8');

        const originalReadFile = fsPromises.readFile;
        let   payloadReads     = 0,
            releasePayloadRead,
            announceReadEntered;
        const payloadReadGate = new Promise(resolve => {
            releasePayloadRead = resolve;
        });
        const readEntered = new Promise(resolve => {
            announceReadEntered = resolve;
        });

        fsPromises.readFile = async (filePath, ...args) => {
            if (/message-wal-\d{4}-\d{2}-\d{2}\.jsonl$/.test(String(filePath))) {
                payloadReads++;
                announceReadEntered();
                await payloadReadGate;
            }
            return originalReadFile(filePath, ...args)
        };

        try {
            const oldGeneration = MailboxService.repairMessageGraphIntegrity({
                target: '@bob', box: 'inbox', limit: 1
            });
            await readEntered;

            // The payload is unchanged. Only its durable marker cohort grows while generation one
            // is parked in readFile; generation two must not join the old cohort-filtered result.
            fs.writeFileSync(markerPath, markerText, 'utf8');
            const newGeneration = MailboxService.repairMessageGraphIntegrity({
                ids: [charlieMessage.messageId], limit: 1
            });

            await waitForObservedCount(
                () => payloadReads, 2,
                'the new marker cohort to open its own physical segment read'
            );
            expect(payloadReads, 'a marker-only cohort change needs an independent segment result').toBe(2);
            releasePayloadRead();

            const results = await Promise.all([oldGeneration, newGeneration]);
            expect(results.map(item => item.repaired)).toEqual([1, 1]);
            expect(results.every(item => item.failed === 0)).toBe(true);
        } finally {
            releasePayloadRead();
            fsPromises.readFile = originalReadFile;
            fs.writeFileSync(markerPath, markerText, 'utf8');
        }
    });

    test('bounded repair advances past a persistent failed candidate instead of starving the next id (#16767)', async () => {
        GraphService.upsertNode({
            id: '@cursor-bob', type: 'AgentIdentity', name: 'Cursor Bob', properties: {accountType: 'agent'}
        });
        await RequestContextService.run({agentIdentityNodeId: '@cursor-bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const ids = [];
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ids.push((await MailboxService.addMessage({to: '@cursor-bob', subject: 'first', body: 'fails'})).messageId);
            ids.push((await MailboxService.addMessage({to: '@cursor-bob', subject: 'second', body: 'must advance'})).messageId);
        });
        ids.forEach(id => expect(damageEdgeProjection(id, 'SENT_BY')).toBe(1));

        const originalProject = MailboxService._projectMessageWalRecord,
            reads             = instrumentMessageWalPayloadReads();
        MailboxService._projectMessageWalRecord = async function(record, options) {
            if (record.id === ids[0]) throw new Error('deterministic first-candidate failure');
            return await originalProject.call(this, record, options)
        };

        try {
            const first = await MailboxService.repairMessageGraphIntegrity({
                target: '@cursor-bob', box: 'inbox', limit: 1
            });
            expect(first).toMatchObject({
                candidateCount: 2, matchedCandidateCount: 2, scanned: 1, repaired: 0, failed: 1,
                cursorStart   : 0, cursorNext: 1
            });

            const second = await MailboxService.repairMessageGraphIntegrity({
                target: '@cursor-bob', box: 'inbox', limit: 1
            });
            expect(second).toMatchObject({
                candidateCount              : 2, matchedCandidateCount: 2, scanned: 1, repaired: 1, failed: 0,
                deferredFailedCandidateCount: 1, cursorStart: 0, cursorNext: 0
            });

            const third = await MailboxService.repairMessageGraphIntegrity({
                target: '@cursor-bob', box: 'inbox', limit: 1
            });
            expect(third).toMatchObject({
                candidateCount              : 1, matchedCandidateCount: 1, scanned: 0, repaired: 0, failed: 0,
                deferredFailedCandidateCount: 1
            });

            const explicitRetry = await MailboxService.repairMessageGraphIntegrity({ids: [ids[0]], limit: 1});
            expect(explicitRetry).toMatchObject({scanned: 1, repaired: 0, failed: 1});
            expect(reads.getCount(), 'cooldown + explicit retry must reuse the immutable accepted record').toBe(2);

            expect(GraphService.db.storage.db.prepare(`
                SELECT COUNT(*) AS count
                  FROM Edges
                 WHERE source = ?
                   AND type = 'SENT_BY'
            `).get(ids[0]).count).toBe(0);
            expect(GraphService.db.storage.db.prepare(`
                SELECT COUNT(*) AS count
                  FROM Edges
                 WHERE source = ?
                   AND type = 'SENT_BY'
            `).get(ids[1]).count).toBe(1);
        } finally {
            reads.restore();
            MailboxService._projectMessageWalRecord = originalProject;
        }
    });

    test('a healthy DB of a DM + an INTACT broadcast reports no gap — the fix does NOT false-positive on DMs (#15369)', async () => {
        // The trap the fix must avoid (flagged by @neo-opus-ada): `deliveredToCount < projectedCount`
        // false-positives on any DM, forcing a full WAL scan every list. The precise term (a broadcast
        // with ZERO delivery rows) must leave a healthy tree — DM + intact broadcast — reporting no gap.
        // Instrument (the unrelated-WAL-segment pattern): a directory where a WAL segment file is expected makes any
        // spurious WAL scan throw; a healthy read that never scans reads clean past it.
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const dm = await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            const direct = await MailboxService.addMessage({to: '@bob', subject: 'a direct message', body: 'dm body'});
            await MailboxService.addMessage({to: 'AGENT:*', subject: 'an intact broadcast', body: 'bcast body'});
            return direct
        });

        const bogusSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        fs.ensureDirSync(bogusSegment);

        try {
            // no damage: the gap gate must be FALSE (no zero-delivery broadcast; the DM must not drag a
            // count term below projectedCount), so the read never scans WAL and never touches the bogus dir.
            const bobInbox = await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                return await MailboxService.listMessages({status: 'all'});
            });

            // both messages visible, and the read completed WITHOUT choking on the bogus segment
            expect(bobInbox.messages.map(message => message.messageId)).toContain(dm.messageId)
        } finally {
            fs.removeSync(bogusSegment);
        }
    });

    test('healthy reads and targeted getMessage repair do not open unrelated WAL segments (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@bob',
                subject: 'bounded repair',
                body   : 'target body'
            });
        });

        const unrelatedSegment = path.join(messageWalDir, 'message-wal-2001-01-01.jsonl');
        fs.ensureDirSync(unrelatedSegment);

        try {
            const healthyInbox = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({status: 'all'});
            });
            expect(healthyInbox.messages.map(message => message.messageId)).toContain(res.messageId);

            const healthyCount = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.countMessages({status: 'all'});
            });
            expect(healthyCount.count).toBe(1);

            GraphService.db.storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run(res.messageId);
            clearGraphCacheWithoutStorageMutation();

            const repairedMessage = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({messageId: res.messageId});
            });

            expect(repairedMessage.subject).toBe('bounded repair');
            expect(repairedMessage.body).toBe('target body');
        } finally {
            fs.removeSync(unrelatedSegment);
        }
    });

    test('post-sync canary: accepted unread self-message survives destructive graph clear (#14426)', async () => {
        const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.addMessage({
                to     : '@me',
                subject: 'post-sync canary',
                body   : 'still here'
            });
        });

        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);

        await GraphService.db.storage.clear();
        clearGraphCacheWithoutStorageMutation();

        const count = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.countMessages({status: 'unread'});
        });

        expect(count.count).toBe(1);

        const inbox = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.listMessages({status: 'unread'});
        });

        expect(inbox.messages).toHaveLength(1);
        expect(inbox.messages[0]).toMatchObject({
            messageId: res.messageId,
            subject  : 'post-sync canary',
            from     : '@alice',
            to       : '@alice',
            readAt   : null
        });

        const message = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.getMessage({messageId: res.messageId});
        });

        expect(message.body).toBe('still here');
        expect(message.readAt).toBeNull();
    });

    test('drainPendingMessageGraphProjections leaves failed required-edge replay pending (#13892)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'SENT_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : '@bob',
                    subject: 'still pending',
                    body   : 'body'
                });
            });

            expect(res.projectionStatus).toBe('pending');

            const summary = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
            expect(summary).toEqual({pending: 1, projected: 0, failed: 1});
            expect((await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).map(record => record.id)).toEqual([res.messageId]);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('addMessage accepts durably when a required broadcast DELIVERED_TO projection edge is culled (#13891)', async () => {
        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'DELIVERED_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: 'culled broadcast',
                    body   : 'body'
                });
            });

            expect(res.status).toBe('sent');
            expect(res.projectionStatus).toBe('pending');
            expect(res.messageId).toMatch(/^MESSAGE:/);

            const records = await readWalMessages({dir: messageWalDir});
            expect(records).toHaveLength(1);
            expect(records[0].id).toBe(res.messageId);
            expect(records[0].routing.to).toBe('AGENT:*');
            expect(records[0].routing.broadcastRecipients).toEqual(expect.arrayContaining(['@bob']));
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('broadcast replay uses WAL send-time audience snapshot, not the current graph audience (#13892)', async () => {
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });

        const originalLinkNodes = GraphService.linkNodes;
        let   res;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'DELIVERED_TO') {
                    return;
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: 'snapshot broadcast',
                    body   : 'body'
                });
            });
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }

        expect(res.projectionStatus).toBe('pending');

        GraphService.upsertNode({ id: '@dana', type: 'AgentIdentity', name: 'Dana', properties: {accountType: 'agent'} });

        const summary = await MailboxService.drainPendingMessageGraphProjections({ids: [res.messageId]});
        expect(summary).toEqual({pending: 1, projected: 1, failed: 0});

        const deliveryTargets = GraphService.db.edges.items
            .filter(edge => edge.source === res.messageId && edge.type === 'DELIVERED_TO')
            .map(edge => edge.target)
            .sort();

        expect(deliveryTargets).toEqual(['@bob', '@charlie']);
        expect(deliveryTargets).not.toContain('@dana');
    });

    test('#15038 legacy broadcast WAL replay preserves AGENT:* and canonicalizes recipients idempotently', async () => {
        const
            messageId = 'MESSAGE:legacy-broadcast-identity-replay',
            sentAt    = new Date().toISOString(),
            record    = {
                id                    : messageId,
                timestamp             : Date.parse(sentAt),
                sentAt,
                graphProjectionVersion: 1,
                message               : {
                    id        : messageId,
                    type      : 'MESSAGE',
                    name      : 'legacy broadcast identities',
                    properties: {
                        subject     : 'legacy broadcast identities',
                        bodyText    : 'canonicalize broadcast delivery on replay',
                        sentAt,
                        readAt      : null,
                        from        : 'AGENT:@alice',
                        to          : 'AGENT:*',
                        userId      : 'alice',
                        sharedEntity: true
                    }
                },
                routing: {
                    sentBy             : 'alice',
                    to                 : 'AGENT:*',
                    senderUserId       : 'alice',
                    broadcastRecipients: ['bob', '@@bob', 'AGENT:@bob']
                }
            };

        await MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false});
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false});

        const
            storedMessage = JSON.parse(GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(messageId).data),
            routingEdges  = GraphService.db.storage.db.prepare(
                "SELECT target, type FROM Edges WHERE source = ? AND type IN ('DELIVERED_TO', 'SENT_BY', 'SENT_TO') ORDER BY type"
            ).all(messageId);

        expect(storedMessage.properties).toMatchObject({from: '@alice', to: 'AGENT:*'});
        expect(routingEdges).toEqual([
            {target: '@bob', type: 'DELIVERED_TO'},
            {target: '@alice', type: 'SENT_BY'},
            {target: 'AGENT:*', type: 'SENT_TO'}
        ]);
        expect(GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Nodes WHERE id = ?').get('AGENT:*').count).toBe(1);

        for (const legacyId of ['bob', '@@bob', 'AGENT:@bob']) {
            const row = GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Nodes WHERE id = ?').get(legacyId);
            expect(row.count).toBe(0);
        }
    });

    test('#15038 legacy broadcast WAL replay refuses a wrong-type recipient before partial projection', async () => {
        GraphService.upsertNode({id: '@bob', type: 'CLASS', name: 'Collision', properties: {}});

        const messageId = 'MESSAGE:wrong-type-broadcast-replay',
            record      = {
                id                    : messageId,
                timestamp             : Date.now(),
                graphProjectionVersion: 1,
                message               : {
                    id        : messageId,
                    type      : 'MESSAGE',
                    properties: {subject: 'refuse broadcast collision', bodyText: 'body', from: 'alice', to: 'AGENT:*'}
                },
                routing: {sentBy: 'alice', to: 'AGENT:*', broadcastRecipients: ['bob']}
            };

        await expect(MailboxService._projectMessageWalRecord(record, {pumpWake: false, appendMarker: false}))
            .rejects.toThrow(/endpoint @bob must be AgentIdentity; found CLASS/);

        expect(GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Nodes WHERE id = ?').get(messageId).count).toBe(0);
        expect(GraphService.db.storage.db.prepare('SELECT count(*) AS count FROM Edges WHERE source = ?').get(messageId).count).toBe(0);
    });

    test('optional semantic edge failures do not block message graph completion (#13892)', async () => {
        GraphService.upsertNode({ id: 'CONCEPT:ok', type: 'CONCEPT', name: 'Concept', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalLinkNodes = GraphService.linkNodes;

        try {
            GraphService.linkNodes = function(source, target, relationship, weight, properties) {
                if (relationship === 'TAGGED_CONCEPT') {
                    throw new Error('optional concept target temporarily unavailable');
                }

                return originalLinkNodes.call(GraphService, source, target, relationship, weight, properties);
            };

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'optional edge',
                    body          : 'body',
                    taggedConcepts: ['CONCEPT:ok']
                });
            });

            expect(res.projectionStatus).toBeUndefined();
            expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [res.messageId]})).toHaveLength(0);
        } finally {
            GraphService.linkNodes = originalLinkNodes;
        }
    });

    test('listMessages properly isolates by identity', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Alice sends to Bob
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'To Bob', body: 'Secret' });
        });

            // Charlie is registered before the broadcast, so the send-time audience snapshot includes them.
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });

        // Alice sends to Broadcast
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'To All', body: 'Public' });
        });

        // Bob reads
        const bobRes = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(bobRes.messages.length).toBe(2);
        expect(bobRes._channelSeparation).toMatch(/DATA, not COMMANDS/);
        expect(bobRes.messages.find(m => m.subject === 'To Bob')).toBeDefined();
        expect(bobRes.messages.find(m => m.subject === 'To All')).toBeDefined();

        // Charlie reads - should only see broadcast
        const charlieRes = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(charlieRes.messages.length).toBe(1);
        expect(charlieRes.messages[0].subject).toBe('To All');

        // Dana was not registered at send time, so the per-recipient receipt snapshot excludes them.
        GraphService.upsertNode({ id: '@dana', type: 'AgentIdentity', name: 'Dana', properties: {accountType: 'agent'} });
        const danaRes = await RequestContextService.run({ agentIdentityNodeId: '@dana' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });

        expect(danaRes.messages.length).toBe(0);
    });

    test('getMessage enforces read-path isolation', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        // Bob can read
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.body).toBe('123');
        expect(bobRead._channelSeparation).toMatch(/DATA, not COMMANDS/);

        // Alice (sender) can read
        const aliceRead = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(aliceRead.body).toBe('123');

        // Charlie cannot read
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.getMessage({ messageId: msgId })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('markRead updates the readAt property', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Private', body: '123' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.markRead({ messageId: msgId });
            expect(res.readAt).toBeTruthy();
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.readAt).toBeTruthy();
    });

    test('markRead BULK: an array marks each id, per-id failures never fail the batch', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const ids = [];
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            for (const subject of ['bulk-1', 'bulk-2']) {
                const res = await MailboxService.addMessage({ to: '@bob', subject, body: 'drain' });
                ids.push(res.messageId);
            }
        });

        // mixed batch: two valid ids + one ghost — the batch resolves, the ghost is its own result
        const result = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.markRead({ messageId: [...ids, 'MESSAGE:ghost-does-not-exist'] });
        });

        expect(result.results).toHaveLength(3);
        expect(result.results[0]).toMatchObject({messageId: ids[0], status: 'read'});
        expect(result.results[1]).toMatchObject({messageId: ids[1], status: 'read'});
        expect(result.results[2]).toMatchObject({messageId: 'MESSAGE:ghost-does-not-exist', status: 'error'});
        expect(result.results[2].error).toMatch(/Message not found/);

        // Every valid id really read — asserted against STORAGE rather than the cache map.
        //
        // Storage, not the cache map: a durability claim should not be witnessed by a cache that is
        // designed to be invalidated and lazy-reloaded. The stored row is the thing the claim is
        // about, and it survives regardless of what the coherence layer does to the cache entry.
        for (const id of ids) {
            const stored = JSON.parse(
                GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id).data
            );

            expect(stored.properties.readAt, `${id} is durably read`).toBeTruthy();
        }
    });

    test('markRead BULK: an empty array is a clean no-op; auth is enforced PER ID', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'not-yours', body: 'auth' });
            msgId = res.messageId;
        });

        const empty = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.markRead({ messageId: [] });
        });
        expect(empty.results).toEqual([]);

        // charlie is NOT the recipient: the single-id path would throw — the batch captures it per-id
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });
        const denied = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            return await MailboxService.markRead({ messageId: [msgId] });
        });
        expect(denied.results).toHaveLength(1);
        expect(denied.results[0].status).toBe('error');
        expect(denied.results[0].error).toMatch(/Unauthorized/);
    });

    test('#15913 markRead recovers only the exact JSON-stringified MESSAGE-id array compatibility shape', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const ids = [];
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            for (const subject of ['serialized-1', 'serialized-2']) {
                const {messageId} = await MailboxService.addMessage({to: '@bob', subject, body: 'compat'});
                ids.push(messageId);
            }
        });

        const result = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({messageId: JSON.stringify(ids)})
        );

        expect(result.results).toHaveLength(2);
        expect(result.results.map(row => row.messageId)).toEqual(ids);
        expect(result.results.every(row => row.status === 'read')).toBe(true);

        const empty = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({messageId: '[]'})
        );
        expect(empty.results).toEqual([]);

        for (const invalid of [
            'not-json[',
            '{"messageId":["MESSAGE:ghost"]}',
            '["not-a-message-id"]',
            '["MESSAGE:ghost", 7]'
        ]) {
            await expect(RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({messageId: invalid})
            )).rejects.toThrow(`Message not found: ${invalid}`);
        }
    });

    test('#15913 markRead all mode drains one unpaginated direct+broadcast snapshot and preserves carrier ownership', async () => {
        GraphService.upsertNode({
            id        : '@charlie',
            type      : 'AgentIdentity',
            name      : 'Charlie',
            properties: {accountType: 'agent'}
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        let directId, broadcastId, archivedId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            ({messageId: directId} = await MailboxService.addMessage({
                to: '@bob', subject: 'read-all direct', body: 'direct'
            }));
            ({messageId: broadcastId} = await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'read-all broadcast', body: 'broadcast'
            }));
            ({messageId: archivedId} = await MailboxService.addMessage({
                to: '@bob', subject: 'read-all archived', body: 'archived'
            }));
        });

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.archiveMessage({messageId: archivedId})
        );

        // The drain now sweeps only mail the agent was SHOWN, so this listing is the precondition
        // the flow always had in practice. Routed through `callTool` deliberately: that is the
        // model-visible boundary where seen is recorded, and a direct service read would correctly
        // stamp nothing. This test's subject — bob's delivery edge marked, charlie's untouched — is
        // orthogonal to seen-state, so it keeps every assertion on the DEFAULT drain path rather
        // than moving to `includeUnseen`.
        const {callTool: listTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            listTool('list_messages', {box: 'inbox', status: 'unread'})
        );

        const receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true})
        );

        expect(receipt).toMatchObject({
            status         : 'read',
            matchedCount   : 2,
            readCount      : 2,
            durableCount   : 2,
            failureCount   : 0,
            nonDurableCount: 0,
            failures       : [],
            nonDurable     : []
        });
        expect(receipt.snapshotAt).toBeTruthy();
        expect(GraphService.db.nodes.get(directId).properties.readAt).toBeTruthy();
        // Storage, not the cache index: a narrow receipt write acknowledges only its own GraphLog
        // row, so an edge whose row was not the immediate next one is invalidated pending lazy
        // reload. The durable carrier is the claim here, and it is the one that survives either way.
        const edgeReadAt = target => {
            const row = GraphService.db.storage.db.prepare(
                `SELECT data FROM Edges WHERE type = 'DELIVERED_TO' AND source = ? AND target = ? LIMIT 1`
            ).get(broadcastId, target);

            return row ? (JSON.parse(row.data).properties?.readAt ?? null) : null
        };

        expect(edgeReadAt('@bob'), 'the recipient who drained carries the receipt').toBeTruthy();
        expect(edgeReadAt('@charlie'), 'and no other recipient does').toBeNull();
        expect(GraphService.db.nodes.get(archivedId).properties.readAt).toBeNull();

        const bobUnread = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.listMessages({box: 'inbox', status: 'unread'})
        );
        expect(bobUnread.messages).toEqual([]);

        const archivedUnread = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.listMessages({box: 'inbox', status: 'unread', includeArchived: true})
        );
        expect(archivedUnread.messages.map(message => message.messageId)).toEqual([archivedId]);

        const charlieUnread = await RequestContextService.run({agentIdentityNodeId: '@charlie'}, () =>
            MailboxService.listMessages({box: 'inbox', status: 'unread'})
        );
        expect(charlieUnread.messages.map(message => message.messageId)).toContain(broadcastId);
    });

    test('#15913 markRead all mode excludes legacy broadcasts with shared MESSAGE read state', async () => {
        const legacyBroadcastId = 'MESSAGE:read-all-legacy-shared-carrier';
        seedReadStateCarrier({messageId: legacyBroadcastId, recipient: 'AGENT:*'});

        const receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true})
        );

        expect(receipt).toMatchObject({
            status      : 'noop',
            matchedCount: 0,
            readCount   : 0
        });
        expect(GraphService.db.nodes.get(legacyBroadcastId).properties.readAt).toBeNull();

        for (const identity of ['@bob', '@alice']) {
            const unread = await RequestContextService.run({agentIdentityNodeId: identity}, () =>
                MailboxService.listMessages({box: 'inbox', status: 'unread'})
            );
            expect(unread.messages.map(message => message.messageId)).toContain(legacyBroadcastId);
        }
    });

    /**
     * The uncapped-depth guarantee was relocated, not removed. These 125 carriers are seeded straight
     * into the graph and never surfaced through the model-visible boundary, so under the default
     * drain they are unseen and correctly withheld. "Everything, listed or not" is now precisely what
     * the explicit widening flag means, so that is where the property lives.
     *
     * The default path keeps its own depth coverage: the backlog arm lists 120 messages through
     * `list_messages` and clears all of them in one call. Asserted twice, once per meaning.
     */
    test('#15913 markRead all+includeUnseen drains beyond the list_messages 100-row page size', async () => {
        for (let index = 0; index < 125; index++) {
            seedReadStateCarrier({messageId: `MESSAGE:read-all-depth-${index}`});
        }

        const receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true, includeUnseen: true})
        );

        expect(receipt).toMatchObject({
            status      : 'read',
            matchedCount: 125,
            readCount   : 125,
            durableCount: 125,
            failureCount: 0
        });

        const remaining = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.countMessages({box: 'inbox', status: 'unread'})
        );
        expect(remaining.count).toBe(0);
    });

    test('#15913 markRead all mode excludes post-snapshot arrivals and reports only exceptional rows', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const ids = [];
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            for (const subject of ['snapshot-ok', 'snapshot-failure', 'snapshot-non-durable']) {
                const {messageId} = await MailboxService.addMessage({to: '@bob', subject, body: 'snapshot'});
                ids.push(messageId);
            }
        });

        // The three seeded messages must be SHOWN before a default drain will sweep them, and the
        // model-visible boundary is where that is recorded. This test's subject — post-snapshot
        // arrivals excluded, exceptional rows reported — is orthogonal to seen-state, so the listing
        // is a precondition rather than a change of subject. It also strengthens the arm: the late
        // arrival is now excluded for two independent reasons, and the assertions still isolate the
        // snapshot one.
        const {callTool: seedListTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            seedListTool('list_messages', {box: 'inbox', status: 'unread'})
        );

        const originalMarkRead = MailboxService.markRead;
        let lateMessageId;

        MailboxService.markRead = async function(args) {
            if (Array.isArray(args.messageId)) {
                ({messageId: lateMessageId} = await RequestContextService.run(
                    {agentIdentityNodeId: '@alice'},
                    () => MailboxService.addMessage({to: '@bob', subject: 'post-snapshot', body: 'late'})
                ));
                return originalMarkRead.call(this, args);
            }

            if (args.messageId === ids[1]) {
                throw new Error('simulated per-id failure');
            }

            if (args.messageId === ids[2]) {
                return {
                    messageId: args.messageId,
                    readAt   : new Date().toISOString(),
                    status   : 'read',
                    durable  : false,
                    warning  : 'simulated non-durable write'
                };
            }

            return originalMarkRead.call(this, args);
        };

        let receipt;
        try {
            receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({all: true})
            );
        } finally {
            MailboxService.markRead = originalMarkRead;
        }

        expect(receipt).toMatchObject({
            status         : 'partial',
            matchedCount   : 3,
            readCount      : 2,
            durableCount   : 1,
            failureCount   : 1,
            nonDurableCount: 1,
            failures       : [{messageId: ids[1], error: 'simulated per-id failure'}],
            nonDurable     : [{messageId: ids[2], warning: 'simulated non-durable write'}]
        });
        expect(receipt).not.toHaveProperty('results');

        const unread = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.listMessages({box: 'inbox', status: 'unread'})
        );
        expect(unread.messages.map(message => message.messageId)).toEqual(
            expect.arrayContaining([ids[1], ids[2], lateMessageId])
        );
    });

    /**
     * `seenAt` is the state between *arrived* and *explicitly marked read*, and it is what lets a
     * bulk drain be discriminating. The authority question is where it may be recorded.
     *
     * **A previous attempt keyed it on caller identity — "the mailbox owner is reading" — and that
     * is falsified by the production caller.** `SwarmHeartbeatService.getRecentActivityTimestamps`
     * binds the polled agent as the request identity and then reads that agent's own inbox, so an
     * owner-identity test admits the daemon rather than excluding it, and the background sweep would
     * mark up to 100 rows per identity as seen for the whole roster on every pass. The verifying test
     * for that attempt bound a DIFFERENT identity and read under a permission grant, so it never
     * traversed the branch it claimed to protect.
     *
     * Caller identity proves mailbox AUTHORITY, not DISPLAY authority. Seen is therefore armed at the
     * model-visible MCP adapter boundary: direct service calls are non-stamping by construction, so
     * the heartbeat is safe because it never crosses that boundary — not because a predicate happens
     * to exclude it.
     */
    const seedFor = async (subjects, {sender = '@alice', recipient = '@bob'} = {}) => {
        await RequestContextService.run({agentIdentityNodeId: recipient}, () =>
            PermissionService.grantPermission({to: sender, scope: 'CAN_REPLY_TO'}));

        return RequestContextService.run({agentIdentityNodeId: sender}, async () => {
            const ids = [];

            for (const subject of subjects) {
                const {messageId} = await MailboxService.addMessage({to: recipient, subject, body: subject});
                ids.push(messageId)
            }

            return ids
        })
    };

    const seenAtOf = messageId => GraphService.db.nodes.get(messageId)?.properties?.seenAt ?? null;

    test('#17321 the production heartbeat shape stamps NOTHING — owner-bound, own inbox, direct service call', async () => {
        const [directed] = await seedFor(['heartbeat must not see this']);

        // EXACTLY SwarmHeartbeatService.getRecentActivityTimestamps: bind the polled agent as the
        // request identity, then read that same agent's inbox. An owner-identity guard reads this as
        // "the owner is looking at their own mail" and stamps. It is a background poll.
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.listMessages({box: 'inbox', to: '@bob', limit: 100, includeArchived: false}));

        expect(seenAtOf(directed), 'a direct service read is non-stamping by construction').toBeNull();

        // And the consequence that matters: the drain must still withhold it.
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true}));

        expect(GraphService.db.nodes.get(directed).properties.readAt,
            'mail the agent was never shown survives the drain').toBeNull()
    });

    test('#17321 the MCP adapter path DOES stamp — the paired control', async () => {
        // Without this, "stamp nothing anywhere" passes the arm above and the feature does nothing.
        const {callTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        const [directed] = await seedFor(['the agent actually saw this']);

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            callTool('list_messages', {box: 'inbox', status: 'unread'}));

        expect(seenAtOf(directed), 'crossing the model-visible boundary is what records seen').toBeTruthy();

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true}));

        expect(GraphService.db.nodes.get(directed).properties.readAt,
            'and a seen message IS swept').toBeTruthy()
    });

    test('#17321 listing a 120-message backlog still clears it in ONE call — the motivating case', async () => {
        // The flow any fix must not break: back after a day, cleared in one swipe with no paging.
        // Clearing already begins by listing, so every one of them is genuinely shown.
        const {callTool: backlogTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        await seedFor(Array.from({length: 120}, (unused, index) => `aged ${index}`));

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            backlogTool('list_messages', {box: 'inbox', status: 'unread', limit: 200}));

        const receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true}));

        expect(receipt.readCount, 'all 120 clear in a single call').toBe(120);
        expect(receipt.withheldUnseenCount, 'and nothing was withheld').toBe(0)
    });

    test('#17321 the receipt reports what it withheld, so a narrower drain is never silent', async () => {
        const {callTool: withheldTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');

        await seedFor(['shown']);
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            withheldTool('list_messages', {box: 'inbox', status: 'unread'}));
        await seedFor(['never shown one', 'never shown two']);

        const receipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({all: true}));

        expect(receipt.readCount, 'the shown message cleared').toBe(1);
        expect(receipt.withheldUnseenCount, 'the two unshown are counted, not hidden').toBe(2)
    });

    /** Storage-side truth, so a cache-only assertion cannot stand in for durability. */
    const storedSeenAtOf = messageId => {
        const row = GraphService.db.storage.db
            .prepare('SELECT data FROM Nodes WHERE id = ?').get(messageId);

        return row ? (JSON.parse(row.data).properties?.seenAt ?? null) : null
    };

    test('#17321 a FAILED seen write leaves cache and storage coherent, and the next listing RETRIES', async () => {
        // The defect this arm exists for is one the boundary correction introduced, not a
        // pre-existing one: the write-once guard reads the CACHED `seenAt`, so a cache-FIRST write
        // that then fails to persist marks the row seen for the life of the process while storage
        // still says null — and every later listing skips it, because the guard sees the value its
        // own failed attempt left behind. Writing cache only AFTER a confirmed durable write is what
        // keeps the retry possible: there is no state to undo, because none was published.
        const
            {callTool}  = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'),
            [directed]  = await seedFor(['the persist fails the first time']),
            storage     = GraphService.db.storage,
            originalSet = storage.setRecordPropertyIfAbsent.bind(storage);

        let failNext = true;

        // The seam is the NARROW writer, not `addNodes` — the seen path no longer replaces the record.
        storage.setRecordPropertyIfAbsent = (...args) => {
            if (failNext) {
                failNext = false;
                throw new Error('simulated storage failure');
            }

            return originalSet(...args)
        };

        try {
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                callTool('list_messages', {box: 'inbox', status: 'unread'}));

            // Coherent, not merely unset: cache must not claim a durability storage does not have.
            expect(seenAtOf(directed), 'cache is not published when the write fails').toBeNull();
            expect(storedSeenAtOf(directed), 'and storage never got it either').toBeNull();

            // The retry — the half a cache-first implementation fails.
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                callTool('list_messages', {box: 'inbox', status: 'unread'}));

            expect(seenAtOf(directed), 'the next listing retries the write').toBeTruthy();
            expect(storedSeenAtOf(directed), 'and this time it is durable').toBeTruthy()
        } finally {
            storage.setRecordPropertyIfAbsent = originalSet
        }
    });

    test('#17321 an interposed storage field SURVIVES the seen write — node carrier', async () => {
        // The whole-record hazard. The interposition MUST happen inside the write seam, not before
        // the listing: an earlier version of this arm interposed up front and passed even against a
        // document-replacing write, because the listing refreshes cache from storage and the field
        // was simply back in the record before the write ran. Vacuous, and it looked correct.
        //
        // Interposing at the seam pins the one ordering that matters — committed AFTER this process
        // last read the row, BEFORE it writes — which is exactly the cross-process race.
        const
            {callTool}  = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'),
            [directed]  = await seedFor(['an interposed field must survive']),
            storage     = GraphService.db.storage,
            sqlite      = storage.db,
            originalSet = storage.setRecordPropertyIfAbsent.bind(storage);

        let interposed = false;

        storage.setRecordPropertyIfAbsent = (...args) => {
            if (!interposed) {
                interposed = true;
                sqlite.prepare(
                    `UPDATE Nodes SET data = json_set(data, '$.properties.concurrentProbe', 'interposed') WHERE id = ?`
                ).run(directed)
            }

            return originalSet(...args)
        };

        try {
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                callTool('list_messages', {box: 'inbox', status: 'unread'}));
        } finally {
            storage.setRecordPropertyIfAbsent = originalSet
        }

        const stored = JSON.parse(
            sqlite.prepare('SELECT data FROM Nodes WHERE id = ?').get(directed).data
        ).properties;

        expect(interposed, 'precondition: the seam must actually have been reached').toBe(true);
        expect(stored.seenAt, 'the seen write landed').toBeTruthy();
        expect(stored.concurrentProbe, 'and it did not erase the interposed field').toBe('interposed')
    });

    test('#17321 the DELIVERED_TO carrier has the same failure/retry diagonal as the node', async () => {
        // Broadcasts carry seen state on the per-recipient edge, so the edge needs its own proof —
        // a node-only arm would leave the broadcast path free to regress independently.
        const
            {callTool}  = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'),
            storage     = GraphService.db.storage,
            originalSet = storage.setRecordPropertyIfAbsent.bind(storage);

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({
                to: 'AGENT:*', subject: 'broadcast seen state', body: 'edge carrier'
            }));

        const edgeSeenAt = () => {
            const row = storage.db.prepare(
                `SELECT data FROM Edges WHERE type = 'DELIVERED_TO' AND target = ? LIMIT 1`
            ).get('@bob');

            return row ? (JSON.parse(row.data).properties?.seenAt ?? null) : null
        };

        let failNext = true;

        storage.setRecordPropertyIfAbsent = (...args) => {
            if (failNext) {
                failNext = false;
                throw new Error('simulated edge storage failure');
            }

            return originalSet(...args)
        };

        try {
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                callTool('list_messages', {box: 'inbox', status: 'unread'}));

            expect(edgeSeenAt(), 'the failed edge write left storage clean').toBeNull();

            await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                callTool('list_messages', {box: 'inbox', status: 'unread'}));

            expect(edgeSeenAt(), 'and the next listing retries it on the edge too').toBeTruthy()
        } finally {
            storage.setRecordPropertyIfAbsent = originalSet
        }
    });

    /**
     * Interposes a storage-only field at the write seam, then runs `mutate` and reports whether the
     * interposed field survived. The interposition must land AFTER this process last read the row and
     * BEFORE it writes — interposing up front proves nothing, because the read that precedes the
     * write refreshes cache from storage and carries the field back in.
     */
    const survivesInterposition = async ({table, id, mutate}) => {
        const
            storage = GraphService.db.storage,
            sqlite  = storage.db,
            // Interpose on BOTH write paths, so the arm tests the PROPERTY (does the field survive)
            // rather than the implementation (is the narrow writer used). Hooking only the narrow
            // path makes a whole-record regression fail the precondition instead of the probe —
            // still red, but red for the wrong reason and far less diagnosable.
            originals = {
                setRecordProperty: storage.setRecordProperty.bind(storage),
                addNodes         : storage.addNodes.bind(storage),
                addEdges         : storage.addEdges.bind(storage)
            };

        let interposed = false;

        const interpose = () => {
            if (interposed) return;
            interposed = true;
            sqlite.prepare(
                `UPDATE ${table} SET data = json_set(data, '$.properties.concurrentProbe', 'interposed') WHERE id = ?`
            ).run(id)
        };

        for (const name of Object.keys(originals)) {
            storage[name] = (...args) => { interpose(); return originals[name](...args) }
        }

        try {
            await mutate()
        } finally {
            for (const [name, fn] of Object.entries(originals)) storage[name] = fn
        }

        const row = sqlite.prepare(`SELECT data FROM ${table} WHERE id = ?`).get(id);

        return {
            interposed,
            probe: row ? (JSON.parse(row.data).properties?.concurrentProbe ?? null) : null
        }
    };

    test('#17486 readAt survives an interposed storage field — NODE carrier', async () => {
        // The whole-record clobber, on the carrier that never had the edge overlay. Before the
        // migration this wrote the entire node from a cached copy, so a field committed inside the
        // write window was erased.
        const [directed] = await seedFor(['read receipt must not clobber']);

        const {interposed, probe} = await survivesInterposition({
            table : 'Nodes',
            id    : directed,
            mutate: () => RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({messageId: directed}))
        });

        expect(interposed, 'precondition: the write seam was reached').toBe(true);
        expect(probe, 'the interposed field survived the readAt write').toBe('interposed');
        expect(GraphService.db.nodes.get(directed).properties.readAt, 'and readAt landed').toBeTruthy()
    });

    test('#17486 archivedAt survives an interposed storage field — NODE carrier', async () => {
        // Same carrier, different receipt. A fix applied to readAt alone would leave this red, which
        // is the asymmetry the whole ticket exists to end.
        const [directed] = await seedFor(['archive must not clobber either']);

        const {interposed, probe} = await survivesInterposition({
            table : 'Nodes',
            id    : directed,
            mutate: () => RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.archiveMessage({messageId: directed}))
        });

        expect(interposed, 'precondition: the write seam was reached').toBe(true);
        expect(probe, 'the interposed field survived the archivedAt write').toBe('interposed')
    });

    test('#17486 readAt survives an interposed storage field — DELIVERED_TO carrier', async () => {
        // The AC's point: both carriers must demonstrably share ONE mechanism. Without an edge arm,
        // "they share a writer" is an assertion about the source rather than about behaviour.
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject: 'edge receipt', body: 'narrow write'}));

        const edgeId = GraphService.db.storage.db.prepare(
            `SELECT id FROM Edges WHERE type = 'DELIVERED_TO' AND target = ? LIMIT 1`
        ).get('@bob')?.id;

        expect(edgeId, 'precondition: the broadcast produced a delivery edge for @bob').toBeTruthy();

        const {interposed, probe} = await survivesInterposition({
            table : 'Edges',
            id    : edgeId,
            mutate: () => RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({all: true, includeUnseen: true}))
        });

        expect(interposed, 'precondition: the write seam was reached').toBe(true);
        expect(probe, 'the interposed field survived the edge readAt write').toBe('interposed')
    });

    test('#17486 readAt is NOT write-once — a second write still lands', async () => {
        // Guards the variant choice. `seenAt` takes the absence predicate because it means FIRST
        // shown; routing readAt through the same helper would silently drop every write after the
        // first, and every arm above would still pass.
        const
            [directed] = await seedFor(['read twice']),
            storage    = GraphService.db.storage,
            readAtOf   = () => JSON.parse(
                storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(directed).data
            ).properties?.readAt ?? null;

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({messageId: directed}));

        const first = readAtOf();

        expect(first).toBeTruthy();

        // A direct second write through the same narrow path must overwrite, not be refused.
        // The writers return the GraphLog id they produced (0 = no row matched), so a caller can
        // acknowledge its OWN log position instead of the global maximum. Truthiness is unchanged.
        expect(storage.setRecordProperty('Nodes', directed, 'readAt', '2099-01-01T00:00:00.000Z'),
            'the unconditional writer reports the log id it wrote').toBeGreaterThan(0);
        expect(readAtOf(), 'and the value actually changed').toBe('2099-01-01T00:00:00.000Z');

        // The paired control: the write-once variant refuses, which is why the two are separate.
        expect(storage.setRecordPropertyIfAbsent('Nodes', directed, 'readAt', '2100-01-01T00:00:00.000Z'),
            'the write-once variant refuses an already-set field').toBe(0)
    });

    /**
     * Deletes the record's storage row AT the write seam — after this process last read the row, and
     * immediately before the narrow UPDATE runs — then returns the receipt `mutate` produced.
     *
     * The timing carries the whole arm. Deleting up front never reaches the writer at all: the
     * authorization read ahead of it fails and the operation takes a not-found path, so the probe
     * would pass while `writeReceiptField` stayed untested. Deleting inside the writer reproduces
     * the exact state the outcome vocabulary exists for — an authorized, cached record whose row is
     * gone from storage — and it is the only way to reach `RECEIPT_WRITE.missingRow`.
     */
    const removeRowAtWriteSeam = async ({table, id, mutate}) => {
        const
            storage  = GraphService.db.storage,
            sqlite   = storage.db,
            original = storage.setRecordProperty.bind(storage);

        let removed = false;

        storage.setRecordProperty = (...args) => {
            if (!removed) {
                removed = true;
                sqlite.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
            }

            return original(...args)
        };

        try {
            // Sequenced, not inlined into the object literal: property values evaluate in source
            // order, so `{removed, receipt: await mutate()}` would capture `removed` as false.
            const receipt = await mutate();

            return {receipt, removed, survivingRows: sqlite.prepare(
                `SELECT COUNT(*) AS total FROM ${table} WHERE id = ?`
            ).get(id).total}
        } finally {
            storage.setRecordProperty = original
        }
    };

    test('#17486 a vanished NODE row yields an honest failure receipt, not a false read', async () => {
        // RA-2's node control. Before the outcome split, a narrow UPDATE that matched no row was
        // indistinguishable from a durable one at the boolean, so this returned status:'read' with
        // the no-storage warning — telling an operator their receipt lives in memory when the
        // helper had deliberately not touched cache and the value existed nowhere at all.
        const [directed] = await seedFor(['the row vanishes under the write']);

        const {receipt, removed, survivingRows} = await removeRowAtWriteSeam({
            table : 'Nodes',
            id    : directed,
            mutate: () => RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({messageId: directed}))
        });

        expect(removed,       'precondition: the write seam was reached and the row deleted there').toBe(true);
        expect(survivingRows, 'precondition: the UPDATE therefore had no row to match').toBe(0);

        expect(receipt.status,    'the receipt does not claim the message was read').toBe('not_applied');
        expect(receipt.durable,   'and does not claim durability').toBe(false);
        expect(receipt.retryable, 'and tells the caller the state is worth retrying').toBe(true);
        expect(receipt.warning, 'the wording must not be the no-storage one, which asserts an in-memory apply that did not happen')
            .not.toContain('applied in memory');

        // Cache is the other half of the honesty. `writeReceiptField` returns before mutating it, so
        // a subsequent read must not surface a readAt that reached neither storage nor RAM.
        expect(GraphService.db.nodes.get(directed)?.properties?.readAt ?? null,
            'and the in-memory copy was left unchanged rather than made to disagree with storage').toBeNull()
    });

    test('#17486 a vanished EDGE row fails the same way — one mechanism, both carriers', async () => {
        // RA-2's edge control. The node arm alone would leave "both carriers share one writer" as a
        // claim about the source; a broadcast receipt travels the DELIVERED_TO edge, and a fix that
        // only reached the node path would keep lying here.
        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject: 'edge row vanishes', body: 'narrow write'}));

        const edge = GraphService.db.edges.items.find(candidate =>
            candidate.type === 'DELIVERED_TO' && candidate.source === messageId && candidate.target === '@bob');

        expect(edge, 'precondition: the broadcast produced a delivery edge for @bob').toBeTruthy();

        const {receipt, removed, survivingRows} = await removeRowAtWriteSeam({
            table : 'Edges',
            id    : edge.id,
            mutate: () => RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
                MailboxService.markRead({messageId}))
        });

        expect(removed,       'precondition: the write seam was reached and the edge row deleted there').toBe(true);
        expect(survivingRows, 'precondition: the UPDATE therefore had no row to match').toBe(0);

        expect(receipt.status,    'the broadcast receipt does not claim the message was read').toBe('not_applied');
        expect(receipt.durable,   'and does not claim durability').toBe(false);
        expect(receipt.retryable, 'and tells the caller the state is worth retrying').toBe(true);
        expect(receipt.warning, 'with the same honest wording the node carrier uses')
            .not.toContain('applied in memory');

        expect(GraphService.db.edges.get(edge.id)?.properties?.readAt ?? null,
            'and the cached edge was left unchanged').toBeNull()
    });

    test('#17321 first-seen is write-once — a second listing does not restamp', async () => {
        // Without this, the cache-last ordering above could be "correct" by simply rewriting `seenAt`
        // on every listing, which would make the timestamp mean "last listed" instead of "first shown".
        const
            {callTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs'),
            [directed] = await seedFor(['stamped exactly once']);

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            callTool('list_messages', {box: 'inbox', status: 'unread'}));

        const firstSeenAt = seenAtOf(directed);

        expect(firstSeenAt).toBeTruthy();

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            callTool('list_messages', {box: 'inbox', status: 'unread'}));

        expect(seenAtOf(directed), 'seenAt means FIRST shown, not last listed').toBe(firstSeenAt);
        expect(storedSeenAtOf(directed), 'and storage agrees').toBe(firstSeenAt)
    });

    test('#15913 markRead all mode returns an explicit compact no-op and rejects ambiguous input', async () => {
        const {callTool} = await import('../../../../../../ai/mcp/server/memory-core/toolService.mjs');
        const receipt    = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            callTool('mark_read', {all: true})
        );

        expect(receipt).toMatchObject({
            status         : 'noop',
            matchedCount   : 0,
            readCount      : 0,
            durableCount   : 0,
            failureCount   : 0,
            nonDurableCount: 0,
            failures       : [],
            nonDurable     : []
        });

        await expect(MailboxService.markRead({
            all      : true,
            messageId: 'MESSAGE:ambiguous'
        })).rejects.toThrow(/either messageId or all: true/);
        await expect(MailboxService.markRead({})).rejects.toThrow(/requires messageId or all: true/);
    });

    test('#15253 a mark resolves through the same repair the read path uses — a cold cache is not a missing message', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: '@bob', subject: 'peer-process write', body: 'served but unmarkable'})
        );

        // The SENT_TO edge is what authorizes the mark, and it is the piece the read path repairs
        // from the WAL before serving.
        expect(damageEdgeProjection(messageId, 'SENT_TO')).toBeGreaterThan(0);


        // The mark is probed WITHOUT a preceding read. A read first would repair the projection and
        // hand the mark a healed graph — the test would then pass against the defect it claims to
        // pin, which is exactly what the first draft of this spec did.
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            const result = await MailboxService.markRead({messageId});
            expect(result).toMatchObject({messageId, status: 'read'});
            expect(result.readAt).toBeTruthy();
        });
    });

    test('#15027 markRead canonicalizes both bound identity and drifted direct SENT_TO targets', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        for (const target of ['bob', '@@bob', 'AGENT:@bob']) {
            const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
                MailboxService.addMessage({to: '@bob', subject: `legacy ${target}`, body: 'canonicalize both sides'})
            );

            retargetMessageEdge(messageId, 'SENT_TO', target);

            const result = await RequestContextService.run({agentIdentityNodeId: '@@bob'}, () =>
                MailboxService.markRead({messageId})
            );

            expect(result).toMatchObject({messageId, status: 'read'});
            expect(result.readAt).toBeTruthy();
        }
    });

    test('#15322 a broadcast recipient whose OWN delivery edge is damaged is repaired, not denied because peers survive', async () => {
        // Two recipients registered BEFORE the broadcast, so the send-time audience snapshot includes
        // both and each gets a per-recipient DELIVERED_TO edge.
        GraphService.upsertNode({id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: '@dana',    type: 'AgentIdentity', name: 'Dana',    properties: {accountType: 'agent'}});

        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject: 'broadcast to the herd', body: 'delivery edges per recipient'})
        );

        // Damage ONLY @charlie's DELIVERED_TO edge — storage AND cache, so `getAdjacentNodes` cannot
        // lazily heal it before the mark resolves. autoSave stays on (the damage must echo to storage);
        // this is the read-path repair lane's storage-damage instrument, narrowed to a single recipient.
        const charlieEdges = GraphService.db.edges.items.filter(edge =>
            edge.source === messageId && edge.type === 'DELIVERED_TO' && /charlie/i.test(String(edge.target))
        );
        // Control 1: the damage target exists. A scenario that damages nothing proves nothing.
        expect(charlieEdges.length, 'charlie must have a delivery edge to damage').toBe(1);
        GraphService.db.edges.remove(charlieEdges);
        GraphService.db.vicinityLoadedNodes.clear();
        GraphService.db.lastAccessMap.clear();

        // Control 2: a PEER's edge survives. That surviving edge is exactly what makes
        // `hasBroadcastDeliveryEdges` true and drives the false denial — without it, the branch that
        // throws would never be reached and the test would pass for the wrong reason.
        const survivingPeer = GraphService.db.edges.items.filter(edge =>
            edge.source === messageId && edge.type === 'DELIVERED_TO' && /dana/i.test(String(edge.target))
        );
        expect(survivingPeer.length, "dana's edge must survive — the false-denial precondition").toBe(1);

        // The defect: @charlie is a legitimate audience member, but her edge is missing from the
        // projection while @dana's survives, and the cheap projection check has no DELIVERED_TO term,
        // so no repair fires. markRead then throws `Unauthorized`. A mark must never deny authorization
        // from a projection it has not reconciled against durable WAL truth.
        const result = await RequestContextService.run({agentIdentityNodeId: '@charlie'}, () =>
            MailboxService.markRead({messageId})
        );

        expect(result).toMatchObject({messageId, status: 'read'});
        expect(result.readAt).toBeTruthy();

        // The mark must land on the RESTORED per-recipient edge, not the shared MESSAGE node — writing
        // the latter is the cross-recipient read-state collapse this lane also exists to prevent.
        const restored = GraphService.db.edges.getByIndex('source', messageId).find(edge =>
            edge.source === messageId &&
            edge.type === 'DELIVERED_TO' &&
            /charlie/i.test(String(edge.target))
        );
        expect(restored, 'charlie edge rebuilt from the WAL').toBeTruthy();

        const stored = GraphService.db.storage.db.prepare(
            "SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Edges WHERE source = ? AND target = ? AND type = 'DELIVERED_TO'"
        ).get(messageId, '@charlie');
        const storedMessage = GraphService.db.storage.db.prepare(
            "SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?"
        ).get(messageId);

        expect(stored?.readAt, 'the restored receipt carries the durable mark').toBe(result.readAt);
        expect(storedMessage?.readAt, 'the shared MESSAGE stays unread for other recipients').toBeNull();
    });

    test('#15322 a broadcast non-recipient registered AFTER send still fails closed — repair rebuilds only the snapshot', async () => {
        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: 'AGENT:*', subject: 'send-time audience only', body: 'no retroactive membership'})
        );

        // Registered AFTER the broadcast, so never in the WAL audience snapshot: repair must NOT invent
        // a delivery edge, and the denial must stand — the fix reconciles against truth, it does not
        // authorize everyone who asks.
        GraphService.upsertNode({id: '@late', type: 'AgentIdentity', name: 'Late', properties: {accountType: 'agent'}});

        await expect(RequestContextService.run({agentIdentityNodeId: '@late'}, () =>
            MailboxService.markRead({messageId})
        )).rejects.toThrow(/Unauthorized: you are not the recipient/);
    });

    test('#15027 persisted family aliases stay fail-closed instead of changing meaning with the roster', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: '@bob', subject: 'corrupt family alias', body: 'must not authorize'})
        );

        retargetMessageEdge(messageId, 'SENT_TO', 'AGENT:claude/opus');

        await expect(RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({messageId})
        )).rejects.toThrow(/Unauthorized: you are not the recipient/);
    });

    test('#15027 list/count canonicalize direct request and sender-filter identities', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const {messageId} = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: '@bob', subject: 'normalized filters', body: 'one message'})
        );

        retargetMessageEdge(messageId, 'SENT_TO', 'bob');
        retargetMessageEdge(messageId, 'SENT_BY', '@@alice');
        fs.removeSync(messageWalDir);

        await RequestContextService.run({agentIdentityNodeId: '@@bob'}, async () => {
            const listed  = await MailboxService.listMessages({to: 'bob', fromIdentity: '@@alice'});
            const counted = await MailboxService.countMessages({to: 'bob', fromIdentity: '@@alice'});

            expect(listed.messages.map(message => message.messageId)).toEqual([messageId]);
            expect(counted.count).toBe(1);
        });
    });

    test('#15027 sibling authorization paths canonicalize stored direct identity spellings', async () => {
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        const archived = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: '@bob', subject: 'archive alias', body: 'archive me'})
        );
        retargetMessageEdge(archived.messageId, 'SENT_TO', '@@bob');
        await expect(RequestContextService.run({agentIdentityNodeId: 'bob'}, () =>
            MailboxService.getMessage({messageId: archived.messageId})
        )).resolves.toMatchObject({messageId: archived.messageId});
        await expect(RequestContextService.run({agentIdentityNodeId: 'bob'}, () =>
            MailboxService.archiveMessage({messageId: archived.messageId})
        )).resolves.toMatchObject({status: 'archived'});

        const retracted = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({to: '@bob', subject: 'sender alias', body: 'retract me'})
        );
        retargetMessageEdge(retracted.messageId, 'SENT_BY', 'alice');
        await expect(RequestContextService.run({agentIdentityNodeId: '@@alice'}, () =>
            MailboxService.deleteMessage({messageId: retracted.messageId})
        )).resolves.toMatchObject({status: 'retracted'});

        const task = await RequestContextService.run({agentIdentityNodeId: '@alice'}, () =>
            MailboxService.addMessage({
                to     : '@bob',
                subject: 'task alias',
                body   : 'transition me',
                task   : {state: 'Submitted'}
            })
        );
        retargetMessageEdge(task.messageId, 'SENT_TO', 'AGENT:@bob');
        await expect(RequestContextService.run({agentIdentityNodeId: 'bob'}, () =>
            MailboxService.transitionTask({taskId: task.messageId, newState: 'Working'})
        )).resolves.toMatchObject({success: true, task: {state: 'Working'}});
    });

    test('surgical repair preserves a DM readAt while restoring a lost routing edge (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'survives repair', body: 'read me' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        // mark_read must be DURABLE, not a cache-only mutation — the storage row is what any
        // cache reload (restart, peer process, repair) re-hydrates from.
        const storedReadAt = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(storedReadAt.readAt).toBeTruthy();

        // Partial damage: the SENT_TO edge dies, the MESSAGE node (carrying readAt) stays intact.
        // The pre-fix repair re-projected the WHOLE record from the WAL — whose properties carry
        // the send-time readAt: null forever — resurrecting the message as unread.
        GraphService.db.storage.db.prepare('DELETE FROM Edges WHERE source = ? AND target = ? AND type = ?')
            .run(msgId, '@bob', 'SENT_TO');
        clearGraphCacheWithoutStorageMutation();

        const summary = await MailboxService.repairMessageGraphIntegrity({ids: [msgId]});
        expect(summary).toMatchObject({scanned: 1, repaired: 1, failed: 0});

        const restoredEdge = GraphService.db.storage.db
            .prepare('SELECT count(*) as count FROM Edges WHERE source = ? AND target = ? AND type = ?')
            .get(msgId, '@bob', 'SENT_TO');
        expect(restoredEdge.count).toBe(1);

        // The durable invariant: the repaired projection still carries the committed read-state
        // in STORAGE — the row every process re-hydrates from.
        const postRepair = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(postRepair.readAt).toBeTruthy();

        const readBack = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({messageId: msgId});
        });
        expect(readBack.readAt).toBeTruthy();
    });

    test('a FULL re-projection over an existing read DM preserves the committed readAt — the write choke-point is caller-proof (#14992)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'full replay must not unread me', body: 'committed' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        const {readWalMessagesByIds} = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        const [record]               = await readWalMessagesByIds({dir: messageWalDir, ids: [msgId]});
        expect(record?.id).toBe(msgId);

        // The empirical 2026-07-10 incident path: a projected record replayed through the FULL
        // path (marker loss, index divergence — whichever caller). The WAL properties carry the
        // send-time readAt: null forever; the node piece's storage-truth merge must win.
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false});

        const postReplay = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(postReplay.readAt).toBeTruthy();

        const readBack = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({messageId: msgId});
        });
        expect(readBack.readAt).toBeTruthy();
    });

    test('full replay preserves the COMPLETE graph-owned surface: broadcast delivery readAt AND the retraction tombstone (#14992)', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'replay me broadly', body: 'original content' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        const {readWalMessagesByIds} = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        const [record]               = await readWalMessagesByIds({dir: messageWalDir, ids: [msgId]});
        expect(record?.id).toBe(msgId);

        const edgeReadAt = () => GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Edges WHERE source = ? AND target = ? AND type = 'DELIVERED_TO'`)
            .get(msgId, '@bob');

        expect(edgeReadAt().readAt).toBeTruthy();

        // Full replay #1: per-recipient read-state lives on the DELIVERED_TO edge, not the node —
        // the reviewer falsifier: pre-fix, this re-link stamped the WAL's readAt: null over it.
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false});
        expect(edgeReadAt().readAt).toBeTruthy();

        // The sender's retraction is an IRREVERSIBLE decision: replay must never resurrect the
        // WAL's original subject/body over the tombstone.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.deleteMessage({ messageId: msgId });
        });

        // Full replay #2 over the tombstone + the read edge together.
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false});

        const node = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.retracted') AS retracted, json_extract(data, '$.properties.subject') AS subject, json_extract(data, '$.properties.bodyText') AS bodyText FROM Nodes WHERE id = ?`)
            .get(msgId);

        expect(node.retracted).toBeTruthy();
        expect(node.subject).toBe('[retracted by sender]');
        expect(node.bodyText).toBe('[retracted by sender]');
        expect(node.subject).not.toBe('replay me broadly');
        expect(edgeReadAt().readAt).toBeTruthy()
    });

    test('the drain heals a lost marker on an intact projection WITHOUT rewriting graph state (#14992)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'marker-lost but projected', body: 'intact' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        // Simulate the crash window between projection commit and marker append: the graph is
        // fully intact (node + edges + committed readAt), only the marker line vanishes.
        const markerFiles = fs.readdirSync(messageWalDir).filter(name => name.endsWith('.graph.jsonl'));
        for (const name of markerFiles) {
            const filePath = path.join(messageWalDir, name);
            const kept     = fs.readFileSync(filePath, 'utf8').split('\n').filter(line => line.trim() && !line.includes(msgId));
            fs.writeFileSync(filePath, kept.length ? kept.join('\n') + '\n' : '');
        }
        expect((await readPendingMessageWalRecords({dir: messageWalDir, ids: [msgId]})).map(record => record.id)).toEqual([msgId]);

        // Pre-fix, this drain FULL-re-projected the intact record — resurrecting readAt: null
        // (the rollback amplifier). Issues-first, it only heals the marker.
        const summary = await MailboxService.drainPendingMessageGraphProjections({ids: [msgId]});
        expect(summary).toEqual({pending: 1, projected: 1, failed: 0});

        const postDrain = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(postDrain.readAt).toBeTruthy();

        // marker healed: the record retired from the pending index
        expect(await readPendingMessageWalRecords({dir: messageWalDir, ids: [msgId]})).toHaveLength(0);
    });

    test('surgical repair does not append a second marker; only bounded metadata enrichment may do so (#14992, #16767)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'one marker only', body: 'no inflation' });
            msgId = res.messageId;
        });

        const countMarkerLines = () => fs.readdirSync(messageWalDir)
            .filter(name => name.endsWith('.graph.jsonl'))
            .reduce((count, name) => count + fs.readFileSync(path.join(messageWalDir, name), 'utf8')
                .split('\n').filter(line => line.includes(msgId)).length, 0);

        expect(countMarkerLines()).toBe(1);

        // Post-marker graph damage repairs the edge without another receipt (observed historical
        // inflation: 499 markers over 70 accepted records). One-time route/cohort compatibility
        // enrichment is the bounded exception: it appends metadata only when the original marker
        // predates those facts, never for ordinary surgical graph repair.
        GraphService.db.storage.db.prepare('DELETE FROM Edges WHERE source = ? AND target = ? AND type = ?')
            .run(msgId, '@bob', 'SENT_TO');
        clearGraphCacheWithoutStorageMutation();

        const summary = await MailboxService.repairMessageGraphIntegrity({ids: [msgId]});
        expect(summary).toMatchObject({scanned: 1, repaired: 1, failed: 0});

        expect(countMarkerLines()).toBe(1);
    });

    test('unread counts are stable across consecutive cold-cache listMessages calls — reads never revert reads (#14797)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'stable', body: 'count me once' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        clearGraphCacheWithoutStorageMutation();

        const firstPass = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({status: 'all'});
        });
        const secondPass = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({status: 'all'});
        });

        const unreadOf = result => result.messages.filter(message => !message.readAt).length;
        const target   = result => result.messages.find(message => message.messageId === msgId);

        // The invariant: a read operation never reverts a committed mark_read — so two
        // consecutive cold-cache reads agree with each other AND with the committed state.
        expect(target(firstPass)?.readAt).toBeTruthy();
        expect(target(secondPass)?.readAt).toBeTruthy();
        expect(unreadOf(secondPass)).toBe(unreadOf(firstPass));
    });

    test('a pure cold-cache vicinity re-hydration is storage-neutral (#14426)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'probe', body: 'probe body' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        const before = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(before.readAt).toBeTruthy();

        clearGraphCacheWithoutStorageMutation();

        // Read-only operation: hydrate the vicinity from storage. Storage must be bit-identical after.
        GraphService.db.getAdjacentNodes(msgId, 'outbound');

        const after = GraphService.db.storage.db
            .prepare(`SELECT json_extract(data, '$.properties.readAt') AS readAt FROM Nodes WHERE id = ?`)
            .get(msgId);
        expect(after.readAt).toBeTruthy();
    });

    test('surgical repair preserves a broadcast delivery readAt while restoring a lost sender edge (#14426)', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'broadcast survives', body: 'all hands' });
            msgId = res.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.markRead({ messageId: msgId });
        });

        // Partial damage away from the delivery edges: the read-state lives on @bob's
        // DELIVERED_TO edge and must survive the repair of the unrelated SENT_BY loss.
        GraphService.db.storage.db.prepare('DELETE FROM Edges WHERE source = ? AND target = ? AND type = ?')
            .run(msgId, '@alice', 'SENT_BY');
        clearGraphCacheWithoutStorageMutation();

        const summary = await MailboxService.repairMessageGraphIntegrity({ids: [msgId]});
        expect(summary).toMatchObject({scanned: 1, repaired: 1, failed: 0});

        const readBack = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({messageId: msgId});
        });
        expect(readBack.readAt).toBeTruthy();

        const restoredEdge = GraphService.db.storage.db
            .prepare('SELECT count(*) as count FROM Edges WHERE source = ? AND target = ? AND type = ?')
            .get(msgId, '@alice', 'SENT_BY');
        expect(restoredEdge.count).toBe(1);
    });

    test('listMessages outbox mode retrieves sent messages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'Outbox Msg 1', body: '1' });
            await MailboxService.addMessage({ to: '@bob', subject: 'Outbox Msg 2', body: '2' });

            const outboxRes = await MailboxService.listMessages({ box: 'outbox' });
            expect(outboxRes.messages.length).toBe(2);
            expect(outboxRes.messages[0].from).toBe('@alice');
            expect(outboxRes.messages[0].to).toBe('@bob');

            const inboxRes = await MailboxService.listMessages({ box: 'inbox' });
            expect(inboxRes.messages.length).toBe(0);
        });
    });

    test('#16960 listMessages projects only indexed routing candidates, never the full edge store', async () => {
        GraphService.upsertNode({id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: 'THREAD:indexed', type: 'THREAD', name: 'Indexed Thread', properties: {}});
        GraphService.upsertNode({id: 'ISSUE:indexed', type: 'ISSUE', name: 'Indexed Issue', properties: {}});
        GraphService.upsertNode({id: 'CONCEPT:indexed', type: 'CONCEPT', name: 'Indexed Concept', properties: {}});
        GraphService.upsertNode({id: 'UNRELATED:source', type: 'UNRELATED', name: 'Unrelated Source', properties: {}});

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
        });

        let directId, broadcastId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            directId = (await MailboxService.addMessage({
                to            : '@bob',
                subject       : 'indexed direct',
                body          : 'direct body',
                partOfThread  : 'THREAD:indexed',
                relatedTickets: ['ISSUE:indexed'],
                taggedConcepts: ['CONCEPT:indexed']
            })).messageId;
            broadcastId = (await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'indexed broadcast',
                body   : 'broadcast body'
            })).messageId;
        });

        // An unrelated target-@bob edge proves the target index is still type-filtered. It must
        // neither become a mailbox candidate nor force a cache-wide scan.
        GraphService.linkNodes('UNRELATED:source', '@bob', 'UNRELATED', 1, {});

        const db = GraphService.db;
        db.getAdjacentNodes('@bob', 'inbound');
        db.getAdjacentNodes('AGENT:*', 'inbound');
        db.getAdjacentNodes(directId, 'outbound');
        db.getAdjacentNodes(broadcastId, 'outbound');
        db.acknowledgeLocalMutations();

        const
            originalItems  = db.edges._items,
            originalRepair = MailboxService.repairMessageGraphIntegrity;

        // The secondary index maps own independent Sets. Poisoning only full-array iteration is a
        // mutation witness: the former outer and per-message `db.edges.items` walks throw, while
        // `getByIndex('target'|'source', ...)` remains fully functional.
        db.edges._items = new Proxy(originalItems, {
            get(target, property, receiver) {
                if (property === Symbol.iterator) {
                    throw new Error('full edge-store iteration is forbidden in listMessages');
                }
                return Reflect.get(target, property, receiver)
            }
        });
        MailboxService.repairMessageGraphIntegrity = async () => ({scanned: 0, repaired: 0, failed: 0});

        try {
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                const all = await MailboxService.listMessages({box: 'all'});
                expect(all.messages.map(message => message.subject).sort()).toEqual([
                    'indexed broadcast',
                    'indexed direct'
                ]);

                const direct = all.messages.find(message => message.messageId === directId);
                expect(direct).toMatchObject({
                    from          : '@alice',
                    to            : '@bob',
                    partOfThread  : 'THREAD:indexed',
                    relatedTickets: ['ISSUE:indexed']
                });

                const tagged = await MailboxService.listMessages({taggedConcepts: ['CONCEPT:indexed']});
                expect(tagged.messages.map(message => message.messageId)).toEqual([directId]);
            });
        } finally {
            MailboxService.repairMessageGraphIntegrity = originalRepair;
            db.edges._items = originalItems;
        }
    });

    test('#16960 indexed broadcast projection preserves first-match legacy receipt precedence', async () => {
        GraphService.upsertNode({id: 'bob', type: 'AgentIdentity', name: 'Legacy Bob', properties: {accountType: 'agent'}});

        let messageId;
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            messageId = (await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'duplicate legacy delivery',
                body   : 'receipt precedence'
            })).messageId;
        });

        const canonicalReceipt = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.markRead({messageId})
        );

        expect(canonicalReceipt.readAt).toBeTruthy();

        // Historical stores can contain an equivalent bare-id receipt beside the canonical one.
        // The former `getBroadcastDeliveryEdge(...).find(...)` contract selected the first match;
        // indexed projection must not silently let the later null receipt erase that read state.
        GraphService.linkNodes(messageId, 'bob', 'DELIVERED_TO', 1, {readAt: null});

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            const result  = await MailboxService.listMessages({status: 'read'});
            const message = result.messages.find(candidate => candidate.messageId === messageId);

            expect(message?.readAt).toBe(canonicalReceipt.readAt);
        });
    });

    test('listMessages pagination (limit/offset) boundary', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            for (let i = 0; i < 5; i++) {
                const res = await MailboxService.addMessage({ to: '@bob', subject: `Msg ${i}`, body: '...' });
                GraphService.db.nodes.get(res.messageId).properties.sentAt = new Date(1000000000000 + i * 1000).toISOString();
            }
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const page1 = await MailboxService.listMessages({ limit: 2, offset: 0 });
            expect(page1.messages.length).toBe(2);
            expect(page1.messages[0].subject).toBe('Msg 4'); // Sorted descending

            const page2 = await MailboxService.listMessages({ limit: 2, offset: 2 });
            expect(page2.messages.length).toBe(2);
            expect(page2.messages[0].subject).toBe('Msg 2');

            const page3 = await MailboxService.listMessages({ limit: 2, offset: 4 });
            expect(page3.messages.length).toBe(1);
            expect(page3.messages[0].subject).toBe('Msg 0');
        });
    });

    test('listMessages filters by threadId and fromIdentity', async () => {
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: 'thread-X', type: 'THREAD', name: 'Thread X', properties: {} });
        GraphService.upsertNode({ id: 'thread-Y', type: 'THREAD', name: 'Thread Y', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'A1', body: '...', partOfThread: 'thread-X' });
            await MailboxService.addMessage({ to: '@bob', subject: 'A2', body: '...', partOfThread: 'thread-Y' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'C1', body: '...', partOfThread: 'thread-X' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            // `fromIdentity` rather than `from` — the latter is blocked by AuthMiddleware
            // as a claim-of-authorship key. See MailboxService JSDoc.
            const filterFrom = await MailboxService.listMessages({ fromIdentity: '@alice' });
            expect(filterFrom.messages.length).toBe(2);

            const filterThread = await MailboxService.listMessages({ threadId: 'thread-X' });
            expect(filterThread.messages.length).toBe(2);

            const filterBoth = await MailboxService.listMessages({ fromIdentity: '@alice', threadId: 'thread-X' });
            expect(filterBoth.messages.length).toBe(1);
            expect(filterBoth.messages[0].subject).toBe('A1');
        });
    });

    test('listMessages PROJECTS partOfThread on the summary — thread membership is readable, not only filterable', async () => {
        GraphService.upsertNode({ id: 'thread-X', type: 'THREAD', name: 'Thread X', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'threaded', body: '...', partOfThread: 'thread-X' });
            await MailboxService.addMessage({ to: '@bob', subject: 'loose', body: '...' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const {messages} = await MailboxService.listMessages({ status: 'all' });
            const threaded   = messages.find(message => message.subject === 'threaded');
            const loose      = messages.find(message => message.subject === 'loose');

            // The PART_OF_THREAD edge was resolved for filtering but never returned, so every
            // consumer of the summary read a thread-less mailbox. Callers group threads from
            // this field; an unthreaded message must stay absent rather than carry a null.
            expect(threaded.partOfThread).toBe('thread-X');
            expect(Object.hasOwn(loose, 'partOfThread')).toBe(false);
        });
    });

    test('addMessage supports 6 new edge types and priority', async () => {
        GraphService.upsertNode({ id: 'SESSION:123', type: 'SESSION', name: 'S123', properties: {} });
        GraphService.upsertNode({ id: 'SESSION:456', type: 'SESSION', name: 'S456', properties: {} });
        GraphService.upsertNode({ id: 'ISSUE:10168', type: 'ISSUE', name: 'I10168', properties: {} });
        GraphService.upsertNode({ id: 'MESSAGE:abc', type: 'MESSAGE', name: 'MABC', properties: {} });
        GraphService.upsertNode({ id: 'THREAD:xyz', type: 'THREAD', name: 'TXYZ', properties: {} });
        GraphService.upsertNode({ id: 'CONCEPT:test', type: 'CONCEPT', name: 'CTest', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to             : '@bob',
                subject        : 'Rich semantics',
                body           : 'body',
                priority       : 'high',
                originSessionId: 'SESSION:123',
                relatedSessions: ['SESSION:456'],
                relatedTickets : ['ISSUE:10168'],
                inReplyTo      : 'MESSAGE:abc',
                partOfThread   : 'THREAD:xyz',
                taggedConcepts : ['CONCEPT:test']
            });
            msgId = res.messageId;
            expect(res.priority).toBe('high');
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.priority).toBe('high');
        expect(node.properties.from).toBe('@alice');
        expect(node.properties.to).toBe('@bob');
        expect(node.properties.inReplyTo).toBe('MESSAGE:abc');
        expect(node.properties.partOfThread).toBe('THREAD:xyz');
        expect(node.properties.taggedConcepts).toEqual(['test']);
        expect(node.properties.wakeSuppressed).toBe(false);

        let edges = GraphService.db.edges.items.filter(e => e.source === msgId);
        expect(edges.find(e => e.type === 'ORIGINATES_IN' && e.target === 'SESSION:123')).toBeDefined();
        expect(edges.find(e => e.type === 'RELATED_SESSION' && e.target === 'SESSION:456')).toBeDefined();
        expect(edges.find(e => e.type === 'REFERENCES_TICKET' && e.target === 'ISSUE:10168')).toBeDefined();
        expect(edges.find(e => e.type === 'IN_REPLY_TO' && e.target === 'MESSAGE:abc')).toBeDefined();
        expect(edges.find(e => e.type === 'PART_OF_THREAD' && e.target === 'THREAD:xyz')).toBeDefined();
        expect(edges.find(e => e.type === 'TAGGED_CONCEPT' && e.target === 'test')).toBeDefined();
        expect(GraphService.db.nodes.get('test').properties.canonicalConceptId).toBe('test');

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const byLegacyFilter = await MailboxService.listMessages({
                status        : 'all',
                taggedConcepts: ['CONCEPT:test']
            });

            expect(byLegacyFilter.messages.map(message => message.messageId)).toContain(msgId);
        });
    });

    test('addMessage persists wakeSuppressed mailbox-only messages as unread inbox items', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to            : '@alice',
                subject       : 'Sunset handover',
                body          : 'handover payload',
                taggedConcepts: ['sunset-protocol-handover'],
                wakeSuppressed: true
            });
            msgId = res.messageId;

            const inbox = await MailboxService.listMessages({ status: 'unread' });
            expect(inbox.messages.map(msg => msg.messageId)).toContain(msgId);

            const message = await MailboxService.getMessage({ messageId: msgId });
            expect(message.wakeSuppressed).toBe(true);
            expect(message.readAt).toBeNull();
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.wakeSuppressed).toBe(true);
        expect(node.properties.taggedConcepts).toEqual(['sunset-protocol-handover']);
        expect(node.properties.from).toBe('@alice');
        expect(node.properties.to).toBe('@alice');
        expect(node.properties.readAt).toBeNull();
    });

    test('addMessage rejects wakeSuppressed known-actionable direct lifecycle messages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({
                to            : '@bob',
                subject       : '[review][REQUEST_CHANGES] #13290 — close-target gate',
                body          : 'This must wake the PR author.',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for actionable direct lifecycle subject/);

            await expect(MailboxService.addMessage({
                to            : '@bob',
                subject       : 'urgent direct escalation',
                body          : 'High-priority direct messages must wake.',
                priority      : 'high',
                wakeSuppressed: true
            })).rejects.toThrow(/Cannot suppress wake for high-priority direct message/);
        });

        expect(GraphService.db.nodes.items.filter(node =>
            node.label === 'MESSAGE' &&
            node.properties?.wakeSuppressed === true
        )).toHaveLength(0);
    });

    test('addMessage defaults claim-class broadcasts to wakeSuppressed (#15987 — supersedes the #14100 polarity)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const ids = {};

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The default flip, red-proved: a claim BROADCAST with the flag OMITTED resolves to
            // quiet. Pre-flip this persisted false (fleet-wide wake); the collision defense lives
            // at the claim surfaces (assignee gate + intake claim-race re-check), not in the wake.
            ({messageId: ids.omittedBroadcast} = await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: '[lane-claim] #99999 — extract the foo helper',
                body   : 'Claiming the foo leaf.'
            }));

            // Explicit suppression is ACCEPTED — pre-flip the guard threw `collision-prone` here.
            ({messageId: ids.explicitBroadcast} = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[review-claim] PR #99998 — cross-family seat taken',
                body          : 'Seat claim.',
                wakeSuppressed: true
            }));

            // The contested-lane escalation survives as a sender ELECTION: explicit false wakes.
            ({messageId: ids.contested} = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lane-claim] #99997 — contested-lane resolution, do not re-file',
                body          : 'First-claim-timestamp-wins resolution; this one must wake.',
                wakeSuppressed: false
            }));

            // Direct claims are NOT fan-out noise: the quiet default is scoped to `AGENT:*`,
            // so a DM keeps the plain default (wakes) while explicit suppression is now legal.
            ({messageId: ids.directOmitted} = await MailboxService.addMessage({
                to     : '@bob',
                subject: '[lane-claim] #99996 — the bar leaf',
                body   : 'Claiming bar, direct.'
            }));
        });

        expect(GraphService.db.nodes.get(ids.omittedBroadcast).properties.wakeSuppressed).toBe(true);
        expect(GraphService.db.nodes.get(ids.explicitBroadcast).properties.wakeSuppressed).toBe(true);
        expect(GraphService.db.nodes.get(ids.contested).properties.wakeSuppressed).toBe(false);
        expect(GraphService.db.nodes.get(ids.directOmitted).properties.wakeSuppressed).toBe(false);
    });

    /**
     * @summary The quiet-by-default seam covers the collision CLASS, and only where a tag is structural.
     *
     * Every subject below is VERBATIM from the live `AGENT:*` corpus (2026-07-24T21:46Z →
     * 2026-07-25T13:07Z). That is deliberate: the predecessor `/^\s*\[lane-claim\]/i` passed every
     * hand-written fixture anyone had thought to author, while 8 of 15 real claims walked past it
     * because the fleet writes `[ticket-created][lane-claim][#N]`. The corpus is the reproducer —
     * the same subjects that once proved the wake-mandatory guard's coverage now prove the
     * default-quiet seam's coverage (the polarity flipped; the matcher did not).
     */
    test('#15905 corpus: collision signals default to suppressed in NON-LEADING tag positions and across the class (#15987)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The 8 real subjects the `^`-anchored predecessor let through, plus the wider class.
            const collisionSubjects = [
                '[ticket-created][lane-claim][#15900] ai:config-print — dump resolved AiConfig leaves at a head',
                '[ticket-created][lane-claim][#15886] the ESM-module-cache pollution class — split from #15874',
                '[ticket-created][lane-claim][#15899] + [pr-opened][PR #15901] the morph beat found a SECOND defect',
                '[ticket-created][lane-claim][#15875] the AC5 crash root-caused: logger.mjs carries a live A1 fallback',
                '[ticket-created][lane-claim][#15873] ADR 0012 §2.2 alignment + firing-history correction',
                '[ticket-created][lane-claim][#15868] Found it: the registry says createdAt is immutable, the reconciler deletes it',
                '[ticket-created][lane-claim][#15863] The 4th+5th engine-fact sites are PROSE',
                // Compound subject: the claim rides AFTER a `·` separator, not at the start.
                '[pr-updated][PR #15840][95f859b706] workstation tear-out is spec-proven · [ticket-created][lane-claim][#15895] the morph beat exposed a real engine gap',
                // A review SEAT is claimable — an observed collision had two families take the same seat.
                '[review-claim][PR #15867][6d81c7b332] GPT cross-family seat taken',
                // A RELEASE is as collision-relevant as a claim: silencing it leaves a free lane looking taken.
                '[claim-corrected][#15805 → #15803] my #15805 claim was premature — released with intake record',
                '[drive-claimed][wake-routing ideation] I take the sandbox drive'
            ];

            for (const subject of collisionSubjects) {
                // Flag OMITTED on purpose: the seam must derive quiet from the structural tag alone.
                const {messageId} = await MailboxService.addMessage({
                    to  : 'AGENT:*',
                    subject,
                    body: 'collision signal'
                });

                expect(GraphService.db.nodes.get(messageId).properties.wakeSuppressed, subject).toBe(true);
            }
        });
    });

    test('#15905 a message that MENTIONS a collision tag in prose is NOT default-suppressed (and stays suppressible)', async () => {
        // The matcher's negative arm, now guarding the DEFAULT: a substring matcher would silently
        // quiet every message *discussing* claims. All three subjects are real sends from the
        // wake-routing divergence. Explicit suppression stays legal; omission must NOT flip.
        const metaSubjects = [
            '[falsifier-positive][D#15904] the [lane-claim] guard is ^-anchored — 53% of LIVE lane-claims bypass #14100',
            '[evidence][wake-routing] the guard ALREADY exempts broadcasts — why [lane-claim] must never be suppressible',
            '[census-delivered][D#15904] the collision class is WIDER than lane-claims — 71% unguarded'
        ];

        const explicit = [];
        const omitted  = [];

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            for (const subject of metaSubjects) {
                const sentExplicit = await MailboxService.addMessage({
                    to            : 'AGENT:*',
                    subject,
                    body          : 'meta-discussion about the collision class',
                    wakeSuppressed: true
                });
                explicit.push(sentExplicit.messageId);

                const sentOmitted = await MailboxService.addMessage({
                    to     : 'AGENT:*',
                    subject: `${subject} (omitted-flag twin)`,
                    body   : 'meta-discussion about the collision class'
                });
                omitted.push(sentOmitted.messageId);
            }
        });

        for (const id of explicit) {
            expect(GraphService.db.nodes.get(id).properties.wakeSuppressed, 'meta subject must stay suppressible').toBe(true);
        }

        for (const id of omitted) {
            expect(GraphService.db.nodes.get(id).properties.wakeSuppressed, 'prose mention must not default-suppress').toBe(false);
        }
    });

    test('#15905 taggedConcepts is the structural signal — the quiet default fires with no tag in the subject at all', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The preferred contract: declared data, not prose a parser must interpret. A sender that
            // labels the message structurally gets the quiet default even with a bare subject.
            const {messageId} = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : 'taking the foo leaf',
                body          : 'no bracket tags anywhere in this subject',
                taggedConcepts: ['lane-claim']
            });

            expect(GraphService.db.nodes.get(messageId).properties.wakeSuppressed).toBe(true);
        });
    });

    /**
     * @summary The broadcast-delivery series reads shipped graph state, it does not count.
     *
     * Every assertion here pins a claim the JSDoc makes, because the series' whole value is that a
     * PRE-flip baseline is possible: a counter added today could only measure forward, while a
     * reader describes traffic that already happened. If the read silently changed shape, a
     * post-flip comparison would be against a differently-derived number and nobody would see it.
     */
    test('#15919 deliveries count BROADCAST fan-out only — a DM raises sends and not deliveries', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // The scope boundary, asserted rather than assumed: `DELIVERED_TO` edges exist for
        // AGENT:* fan-out only, so a DM is invisible to `deliveries` by construction. This is
        // the assertion that would have caught the original JSDoc claiming more than the
        // mechanism delivers — it failed RED against exactly that overstatement.
        const beforeDm = getWakeDeliverySeries({});

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({to: '@bob', subject: '[series] direct', body: 'd'});
        });

        const afterDm = getWakeDeliverySeries({});

        expect(afterDm.totals.sends, 'a DM is a send').toBeGreaterThan(beforeDm.totals.sends);
        expect(afterDm.totals.broadcastDeliveries, 'a DM has no broadcast delivery cohort').toBe(beforeDm.totals.broadcastDeliveries);

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({to: 'AGENT:*', subject: '[series] broadcast', body: 'b'});
        });

        const afterBroadcast = getWakeDeliverySeries({});

        expect(afterBroadcast.totals.broadcasts).toBeGreaterThan(afterDm.totals.broadcasts);
        expect(afterBroadcast.totals.broadcastDeliveries, 'a broadcast fans out').toBeGreaterThan(afterDm.totals.broadcastDeliveries);
        // perRecipient is the per-pair breakdown AC5 asks for, loudest inbox first.
        expect(afterBroadcast.perRecipient.length).toBeGreaterThan(0);
        expect(afterBroadcast.perRecipient[0].broadcastDeliveries)
            .toBeGreaterThanOrEqual(afterBroadcast.perRecipient.at(-1).broadcastDeliveries);
    });

    test('#15919 the window filters on the message sentAt, so the series is retroactive', async () => {
        // Self-seeding deliberately: reading another test's traffic would make this order-dependent,
        // which is the defect class this suite's own neighbourhood was bisected for. It seeds what
        // it asserts and depends on no sibling.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({to: 'AGENT:*', subject: '[series] window probe', body: 'w'});
        });

        // The retroactive property is the reason a pre-flip baseline exists at all: the message was
        // sent BEFORE this read and is still counted. A window excluding already-sent traffic would
        // make the reader a counter with extra steps, and no pre-flip baseline would be possible.
        const all    = getWakeDeliverySeries({}),
              future = getWakeDeliverySeries({since: '2099-01-01T00:00:00Z'}),
              past   = getWakeDeliverySeries({until: '2000-01-01T00:00:00Z'});

        expect(all.totals.broadcastDeliveries).toBeGreaterThan(0);
        expect(future.totals.broadcastDeliveries).toBe(0);
        expect(future.perRecipient).toEqual([]);
        expect(past.totals.broadcastDeliveries).toBe(0);
        expect(all.window).toEqual({since: null, until: null});
    });

    test('#15919 suppressed is the sender ELECTION, counted per delivery — not a wake outcome', async () => {
        const before = getWakeDeliverySeries({});

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[series] quiet broadcast',
                body          : 'q',
                wakeSuppressed: true
            });
        });

        const after = getWakeDeliverySeries({});

        // Suppression rides the MESSAGE node, so it must multiply across the delivery cohort —
        // one suppressed broadcast suppresses N deliveries, not one.
        expect(after.totals.suppressed).toBeGreaterThan(before.totals.suppressed);
        expect(after.totals.suppressed - before.totals.suppressed)
            .toBe(after.totals.broadcastDeliveries - before.totals.broadcastDeliveries);
    });

    test('#15376 a human-class sender defaults durable-quiet + priority-high; an explicit false elects the wake', async () => {
        GraphService.upsertNode({id: '@operator', type: 'AgentIdentity', name: 'Operator', properties: {accountType: 'human'}});

        let quietId, wakeId;
        await RequestContextService.run({ agentIdentityNodeId: '@operator' }, async () => {
            // No wakeSuppressed and no priority supplied → the operator-steering class defaults:
            // durable-quiet (a late wake is noise, not steering) + priority-high drain metadata.
            const quiet = await MailboxService.addMessage({
                to     : 'AGENT:*',
                subject: 'weekend focus: the FM ladder',
                body   : 'steering payload'
            });
            quietId = quiet.messageId;

            // Wake is the sender's PER-MESSAGE election: explicit false wakes like peer traffic.
            const wake = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : 'act now: rebase onto healed dev',
                body          : 'steering payload',
                wakeSuppressed: false
            });
            wakeId = wake.messageId;
        });

        const quietNode = GraphService.db.nodes.get(quietId);
        expect(quietNode.properties.wakeSuppressed).toBe(true);
        expect(quietNode.properties.priority).toBe('high');
        expect(quietNode.properties.senderPrincipalClass).toBe('human');

        const wakeNode = GraphService.db.nodes.get(wakeId);
        expect(wakeNode.properties.wakeSuppressed).toBe(false);
        expect(wakeNode.properties.priority).toBe('high');
        expect(wakeNode.properties.senderPrincipalClass).toBe('human');
    });

    test('#15376 operator-steering suppression is always safe — the shapes agents are rejected for are the human-class default mode', async () => {
        GraphService.upsertNode({id: '@operator', type: 'AgentIdentity', name: 'Operator', properties: {accountType: 'human'}});

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@operator', scope: 'CAN_REPLY_TO' });
        });

        // The exact shape the agent-sender reject test above refuses (high-priority direct,
        // suppressed) is legitimate quiet steering when the server-stamped class is human.
        await RequestContextService.run({ agentIdentityNodeId: '@operator' }, async () => {
            const direct = await MailboxService.addMessage({
                to            : '@bob',
                subject       : 'urgent direct escalation',
                body          : 'quiet steering to one peer',
                priority      : 'high',
                wakeSuppressed: true
            });
            expect(direct.messageId).toBeTruthy();

            const stored = GraphService.db.nodes.get(direct.messageId);
            expect(stored.properties.wakeSuppressed).toBe(true);
            expect(stored.properties.senderPrincipalClass).toBe('human');
        });
    });

    test('#15376 rows carry the write-time senderPrincipalClass stamp; absent stamps read unclassified — never inferred', async () => {
        GraphService.upsertNode({id: '@operator',   type: 'AgentIdentity', name: 'Operator',  properties: {accountType: 'human'}});
        GraphService.upsertNode({id: '@agentclass', type: 'AgentIdentity', name: 'Agent',     properties: {accountType: 'agent'}});
        GraphService.upsertNode({id: '@classless',  type: 'AgentIdentity', name: 'Classless', properties: {}});

        let operatorMsg, agentMsg, classlessMsg;
        await RequestContextService.run({ agentIdentityNodeId: '@operator' }, async () => {
            operatorMsg = (await MailboxService.addMessage({to: 'AGENT:*', subject: 'stamped human', body: 'x'})).messageId;
        });
        await RequestContextService.run({ agentIdentityNodeId: '@agentclass' }, async () => {
            agentMsg = (await MailboxService.addMessage({to: 'AGENT:*', subject: 'stamped agent', body: 'x'})).messageId;
        });
        await RequestContextService.run({ agentIdentityNodeId: '@classless' }, async () => {
            classlessMsg = (await MailboxService.addMessage({to: 'AGENT:*', subject: 'stamped unclassified', body: 'x'})).messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const {messages} = await MailboxService.listMessages({status: 'all'});
            const row        = id => messages.find(message => message.messageId === id);

            expect(row(operatorMsg).senderPrincipalClass).toBe('human');
            expect(row(agentMsg).senderPrincipalClass).toBe('agent');
            // An absent/unknown accountType stamps 'unclassified' at write — the read path never
            // re-resolves the sender node, so provenance cannot be rewritten after the fact.
            expect(row(classlessMsg).senderPrincipalClass).toBe('unclassified');

            const single = await MailboxService.getMessage({messageId: operatorMsg});
            expect(single.senderPrincipalClass).toBe('human');
        });

        // The true LEGACY shape: a pre-stamp MESSAGE node with no senderPrincipalClass property at
        // all. Strip the stamp in place and re-read — the projection's fallback must report the
        // honest absent-marker rather than inferring a class.
        delete GraphService.db.nodes.get(classlessMsg).properties.senderPrincipalClass;
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const {messages} = await MailboxService.listMessages({status: 'all'});
            expect(messages.find(message => message.messageId === classlessMsg).senderPrincipalClass).toBe('unclassified');
        });
    });

    test('addMessage still allows wakeSuppressed non-claim FYI/progress broadcasts (the scoping that avoids the blanket-ban trap)', async () => {
        let msgId;

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            // The guard is scoped to [lane-claim]: plain awareness/progress broadcasts stay suppressible,
            // so noise-reduction for true FYI is preserved (the blanket-ban the ticket explicitly avoids).
            const res = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lifecycle] 3 approvals acked — merge-eligible',
                body          : 'FYI lane-progress, no claim.',
                wakeSuppressed: true
            });
            msgId = res.messageId;
        });

        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.wakeSuppressed).toBe(true);
    });

    test('addMessage preserves explicit mailbox-only wakeSuppressed exceptions', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const baton = await MailboxService.addMessage({
                to            : '@bob',
                subject       : '[handoff] Lead Role Baton',
                body          : 'fromLead: @alice\ntoLead: @bob',
                taggedConcepts: ['lead-role-baton'],
                wakeSuppressed: true
            });

            const audit = await MailboxService.addMessage({
                to            : '@bob',
                subject       : '[alert] critical: errorRate 0.9 over threshold 0.1 (tenant tenant-x)',
                body          : 'KB audit alert.',
                priority      : 'high',
                wakeSuppressed: true
            });

            // A [lane-claim] now always wakes (collision-prevention); a TRUE awareness broadcast uses a
            // non-claim tag (lane-progress / FYI / ack) and stays suppressible — the scoping the guard preserves.
            const awareness = await MailboxService.addMessage({
                to            : 'AGENT:*',
                subject       : '[lane-progress] #13295 — non-overlapping awareness',
                body          : 'Broadcast awareness only.',
                wakeSuppressed: true
            });

            expect((await MailboxService.getMessage({ messageId: baton.messageId })).wakeSuppressed).toBe(true);
            expect((await MailboxService.getMessage({ messageId: audit.messageId })).wakeSuppressed).toBe(true);
            expect((await MailboxService.getMessage({ messageId: awareness.messageId })).wakeSuppressed).toBe(true);
        });
    });

    test('Reachable Counterparty exception permits replies without explicit grant', async () => {
        // Alice sends to Bob (alice can send to broadcast or we need to ensure alice can send)
        // Actually, to send initially, we need permission unless it is broadcast.
        // Let's grant Bob CAN_REPLY_TO Alice so Bob can start. No wait, Reachable Counterparty:
        // "if they ever sent us a message, we can reply"

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // 1. Alice sends to Bob (allowed via explicit grant)
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'Hi Bob', body: 'body' });
        });

        // 2. Bob sends to Alice (no explicit grant, but Bob is replying to Alice)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'Re: Hi Bob', body: 'body' });
            expect(res.status).toBe('sent');
        });

        // 3. Charlie tries to send to Alice (no grant, no history)
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.addMessage({ to: '@alice', subject: 'Spam', body: 'spam' })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('the strict-mode refusal names the POSTURE, so the reader is not sent to pairwise grants', async () => {
        // A refusal that says only "requires CAN_REPLY_TO" reads as a per-pair problem, and an operator
        // acts on it per pair: on a 15-member single-org deployment that is 210 directed grants, plus 28
        // per new hire, when one deployment-level policy change replaces all of them. The message has to
        // carry which cause it is.
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            // `@alice` is registered and charlie's earlier attempt FAILED, so it created no SENT_TO edge
            // and the pair still has no history — the trust-lift stays unlifted.
            let message = null;

            try {
                await MailboxService.addMessage({to: '@alice', subject: 'Hi', body: 'body'})
            } catch (error) {
                message = error.message
            }

            expect(message, 'the send must still be refused').toBeTruthy();

            // The policy is named, so the reader can tell "you need a grant" from "this deployment does
            // not permit intra-plane initiation" — the distinction the old wording erased.
            expect(message).toMatch(/mailbox\.defaultReplyPolicy='blocked'/);
            // And it must steer AWAY from the per-pair remedy rather than merely omitting it.
            expect(message).toMatch(/rather than granting each pair/);
            // The grant path stays discoverable — naming the posture must not hide the legitimate
            // per-pair remedy for a genuinely cross-boundary send.
            expect(message).toMatch(/CAN_REPLY_TO/)
        })
    });

    test('#10179 broadcast recipient can DM-reply to broadcaster without explicit grant', async () => {
        // Bob broadcasts (always-permitted — broadcast bypasses the CAN_REPLY_TO gate).
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'ping', body: 'body' });
        });

        // Alice — a broadcast recipient without explicit CAN_REPLY_TO — DM-replies to Bob.
        // Pre-fix, this was rejected with Unauthorized because the reachable-counterparty
        // iteration only matched SENT_TO edges whose target equaled the caller directly,
        // never the AGENT:* sentinel. Replicates the empirical 2026-04-22 Opus↔Gemini
            // handshake failure documented by the reachable-counterparty regression history.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Re: ping', body: 'body' });
            expect(res.status).toBe('sent');
        });
    });

    test('#10179 unrelated broadcast does NOT grant DM access to non-broadcaster', async () => {
        GraphService.upsertNode({ id: '@ed', type: 'AgentIdentity', name: 'Ed', properties: {accountType: 'agent'} });

        // Ed broadcasts. Alice and Bob receive it but have no other substrate signal.
        await RequestContextService.run({ agentIdentityNodeId: '@ed' }, async () => {
            await MailboxService.addMessage({ to: 'AGENT:*', subject: 'from ed', body: 'body' });
        });

        // Alice tries to DM Bob — must still be rejected. Ed's broadcast grants DM access
            // *to Ed* for every authenticated recipient (per reachable-counterparty trust lift), but does not
        // transitively grant Alice reply-access to unrelated third parties. Validates the
        // guard's core invariant survives the broadcast-receipt extension.
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({ to: '@bob', subject: 'Hi', body: 'body' })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('Role-based addressing dispatch modes', async () => {
        GraphService.upsertNode({ id: 'role:librarian', type: 'ROLE', name: 'Librarian', properties: {} });
        GraphService.upsertNode({ id: 'human:tobiu', type: 'HUMAN', name: 'Tobias', properties: {} });

        // Any agent can dispatch to a role or human without CAN_REPLY_TO
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: 'role:librarian', subject: 'Need book', body: 'body' });
            await MailboxService.addMessage({ to: 'human:tobiu', subject: 'Help', body: 'body' });
        });

        // Verify they were dispatched
        let librarianCount = 0;
        let humanCount     = 0;
        for (const edge of GraphService.db.edges.items) {
            if (edge.type === 'SENT_TO') {
                if (edge.target === 'role:librarian') librarianCount++;
                if (edge.target === 'human:tobiu') humanCount++;
            }
        }
        expect(librarianCount).toBe(1);
        expect(humanCount).toBe(1);

        // Reading requires CAN_READ_INBOX_OF if the target isn't the caller
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.listMessages({ to: 'role:librarian' })).rejects.toThrow(/Unauthorized/);

            // Grant bob permission to read librarian role
            GraphService.linkNodes('@bob', 'role:librarian', 'CAN_READ_INBOX_OF', 1.0);

            const res = await MailboxService.listMessages({ to: 'role:librarian' });
            expect(res.messages.length).toBe(1);
            expect(res.messages[0].to).toBe('role:librarian');
        });
    });

    test('#10180 AC4: countMessages matches listMessages.length for small inbox', async () => {
        // Pin equivalence between the direct-SQL count and the in-memory listMessages
        // length so future drift between the two paths surfaces as a test failure.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'count-1', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'count-2', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'count-3', body: '...' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const list  = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });

            expect(count.count).toBe(list.messages.length);
            expect(count.count).toBe(3);

            const allList  = await MailboxService.listMessages({ box: 'inbox', status: 'all' });
            const allCount = await MailboxService.countMessages({ box: 'inbox', status: 'all' });
            expect(allCount.count).toBe(allList.messages.length);
        });
    });

    test('#10180 AC3: countMessages returns correct value for inbox depth > 100 (no silent cap)', async () => {
        // Regression for the original 100-cap proxy pattern: getHealthcheckPreview
        // previously fetched `listMessages({limit: 100})` and counted unreads. An inbox
        // with > 100 unread messages would silently under-report. countMessages must
        // return the true value via direct SQL.
        const RECIPIENT    = '@countmany-bob';
        const SENDER       = '@countmany-alice';
        const TARGET_DEPTH = 150;

        // Seed agent identities matching the production convention.
        GraphService.upsertNode({ id: RECIPIENT, type: 'AgentIdentity', name: 'CountManyBob',   properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: SENDER,    type: 'AgentIdentity', name: 'CountManyAlice', properties: { accountType: 'agent' } });

        await RequestContextService.run({ agentIdentityNodeId: RECIPIENT }, async () => {
            await PermissionService.grantPermission({ to: SENDER, scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: SENDER }, async () => {
            for (let i = 0; i < TARGET_DEPTH; i++) {
                await MailboxService.addMessage({ to: RECIPIENT, subject: `bulk-${i}`, body: '...' });
            }
        });

        await RequestContextService.run({ agentIdentityNodeId: RECIPIENT }, async () => {
            const result = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(result.count).toBe(TARGET_DEPTH);
            expect(result.count).toBeGreaterThan(100); // explicit anti-regression assertion vs old proxy

            // getHealthcheckPreview now uses countMessages — should also be uncapped.
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(TARGET_DEPTH);
            expect(preview.inbox.length).toBe(3); // preview-surface limit unchanged
        });
    });

    test('#10180 AC1: countMessages outbox counts SENT_BY edges from caller', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await MailboxService.addMessage({ to: '@bob', subject: 'out-1', body: '...' });
            await MailboxService.addMessage({ to: '@bob', subject: 'out-2', body: '...' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const outbox = await MailboxService.countMessages({ box: 'outbox' });
            expect(outbox.count).toBe(2);
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const outbox = await MailboxService.countMessages({ box: 'outbox' });
            expect(outbox.count).toBe(0); // Bob hasn't sent any
        });
    });

    test('#10180 AC1: countMessages throws on unbound identity', async () => {
        await expect(MailboxService.countMessages({ box: 'inbox', status: 'unread' }))
            .rejects.toThrow(/no agent identity context bound/);
    });

    test('#10180 cycle-1 hardening: countMessages rejects unsupported box values explicitly', async () => {
        // Per review feedback: previously, `if (box === 'outbox') ... else ...`
        // silently aliased `box='all'` (deferred per PR body) AND any typo to the inbox query —
        // returning a plausible but partial-result count. This regression pins fail-fast semantics
        // on unsupported enums so callers see the deferred-vs-implemented boundary at call-time
        // rather than receiving silent partial-results.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.countMessages({ box: 'all' }))
                .rejects.toThrow(/unsupported box value 'all'/);
            await expect(MailboxService.countMessages({ box: 'unknown-typo' }))
                .rejects.toThrow(/unsupported box value 'unknown-typo'/);
            await expect(MailboxService.countMessages({ box: '' }))
                .rejects.toThrow(/unsupported box value/);

            // Sanity: supported values still work after the guard
            await expect(MailboxService.countMessages({ box: 'inbox' })).resolves.toMatchObject({ count: expect.any(Number) });
            await expect(MailboxService.countMessages({ box: 'outbox' })).resolves.toMatchObject({ count: expect.any(Number) });
        });
    });

    test('#10148 AC1+AC4: archiveMessage hides direct-DM from default listMessages; includeArchived surfaces', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'archive-me', body: 'body' });
            messageId = m.messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            // Pre-archive: appears in default listMessages
            const before = await MailboxService.listMessages({ box: 'inbox' });
            expect(before.messages.some(m => m.messageId === messageId)).toBe(true);

            // Archive it
            const archiveResult = await MailboxService.archiveMessage({ messageId });
            expect(archiveResult.status).toBe('archived');
            expect(archiveResult.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp shape
            expect(archiveResult.messageId).toBe(messageId);

            // Default listMessages now excludes it
            const after = await MailboxService.listMessages({ box: 'inbox' });
            expect(after.messages.some(m => m.messageId === messageId)).toBe(false);

            // includeArchived: true surfaces it with archivedAt in summary
            const withArchived = await MailboxService.listMessages({ box: 'inbox', includeArchived: true });
            const archived     = withArchived.messages.find(m => m.messageId === messageId);
            expect(archived).toBeDefined();
            expect(archived.archivedAt).toBe(archiveResult.archivedAt);
        });
    });

    test('#13091: countMessages excludes archived direct-DMs by default', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let archivedId;

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            archivedId = (await MailboxService.addMessage({ to: '@bob', subject: 'done', body: 'body' })).messageId;
            await MailboxService.addMessage({ to: '@bob', subject: 'still-open', body: 'body' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.archiveMessage({ messageId: archivedId });

            const list = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            expect(list.messages.map(msg => msg.messageId)).not.toContain(archivedId);

            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(list.messages.length);
            expect(count.count).toBe(1);

            const withArchived = await MailboxService.countMessages({
                box            : 'inbox',
                status         : 'unread',
                includeArchived: true
            });
            expect(withArchived.count).toBe(2);

            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(1);
            expect(preview.inbox.map(msg => msg.id)).not.toContain(archivedId);
        });
    });

    test('#13091: countMessages excludes archived per-recipient broadcasts by default', async () => {
        const
            senderIdentity   = '@neo-mailbox-archive-broadcast-sender',
            archivedIdentity = '@neo-mailbox-archive-broadcast-recipient',
            unreadIdentity   = '@neo-mailbox-archive-broadcast-unread';

        GraphService.upsertNode({ id: senderIdentity,   type: 'AgentIdentity', name: 'ArchiveBroadcastSender',    properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: archivedIdentity, type: 'AgentIdentity', name: 'ArchiveBroadcastRecipient', properties: { accountType: 'agent' } });
        GraphService.upsertNode({ id: unreadIdentity,   type: 'AgentIdentity', name: 'ArchiveBroadcastUnread',    properties: { accountType: 'agent' } });

        let messageId;

        await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
            messageId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'broadcast done', body: 'body' })).messageId;
        });

        await RequestContextService.run({ agentIdentityNodeId: archivedIdentity }, async () => {
            await MailboxService.archiveMessage({ messageId });

            const list = await MailboxService.listMessages({ box: 'inbox', status: 'unread' });
            expect(list.messages.map(msg => msg.messageId)).not.toContain(messageId);

            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(0);

            const withArchived = await MailboxService.countMessages({
                box            : 'inbox',
                status         : 'unread',
                includeArchived: true
            });
            expect(withArchived.count).toBe(1);
        });

        await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, async () => {
            const count = await MailboxService.countMessages({ box: 'inbox', status: 'unread' });
            expect(count.count).toBe(1);
        });
    });

    test('#10148 AC1: archiveMessage rejects non-recipient (sender + third-party)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed a third-party identity
        GraphService.upsertNode({ id: '@carol-archive', type: 'AgentIdentity', name: 'Carol', properties: { accountType: 'agent' } });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'not-yours-to-archive', body: '...' });
            messageId = m.messageId;
        });

        // Sender (Alice) cannot archive Bob's inbox copy
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.archiveMessage({ messageId })).rejects.toThrow(/Unauthorized.*not the recipient/);
        });

        // Third-party (Carol) cannot archive either
        await RequestContextService.run({ agentIdentityNodeId: '@carol-archive' }, async () => {
            await expect(MailboxService.archiveMessage({ messageId })).rejects.toThrow(/Unauthorized.*not the recipient/);
        });

        // Recipient (Bob) still can — sanity-check the permission gate is recipient-specific not just deny-by-default
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.archiveMessage({ messageId });
            expect(res.status).toBe('archived');
        });
    });

    test('#10148 AC2+AC3: deleteMessage sender-side retraction replaces subject + body with placeholder, preserves thread edges', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed a thread: original message + a reply that references it via inReplyTo
        let originalId, replyId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const original = await MailboxService.addMessage({ to: '@bob', subject: 'original-content', body: 'sensitive-original-body' });
            originalId = original.messageId;
            const reply = await MailboxService.addMessage({ to: '@bob', subject: 're: original', body: 'reply body', inReplyTo: originalId });
            replyId = reply.messageId;
        });

        // Sender (Alice) retracts the original
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const result = await MailboxService.deleteMessage({ messageId: originalId });
            expect(result.status).toBe('retracted');
            expect(result.retracted).toBe(true);
            expect(result.messageId).toBe(originalId);
        });

        // Direct node inspection: subject + bodyText overwritten; retracted flag set
        const node = GraphService.db.nodes.get(originalId);
        expect(node.properties.retracted).toBe(true);
        expect(node.properties.subject).toBe('[retracted by sender]');
        expect(node.properties.bodyText).toBe('[retracted by sender]');

        // Thread context preserved: SENT_BY + SENT_TO + reply's inReplyTo edges survive
        const edgesFromOriginal = [];
        const edgesToOriginal   = [];
        for (const e of GraphService.db.edges.items) {
            if (GraphService.db.edges.items.constructor) {} // no-op, shape sanity
            const src = e.isRecord ? e.get('source') : e.source;
            const tgt = e.isRecord ? e.get('target') : e.target;
            const typ = e.isRecord ? e.get('type')   : e.type;
            if (src === originalId) edgesFromOriginal.push({type: typ, target: tgt});
            if (tgt === originalId) edgesToOriginal.push({type: typ, source: src});
        }
        // SENT_BY → @alice + SENT_TO → @bob both still present
        expect(edgesFromOriginal.some(e => e.type === 'SENT_BY'   && e.target === '@alice')).toBe(true);
        expect(edgesFromOriginal.some(e => e.type === 'SENT_TO'   && e.target === '@bob')).toBe(true);
        // Reply's IN_REPLY_TO edge still points at the retracted original — thread context intact
        expect(edgesToOriginal.some(e => e.source === replyId && (e.type === 'IN_REPLY_TO' || e.type === 'inReplyTo'))).toBe(true);

        // Receiver views the retracted message with placeholder subject + retracted flag
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const list             = await MailboxService.listMessages({ box: 'inbox' });
            const retractedSummary = list.messages.find(m => m.messageId === originalId);
            expect(retractedSummary).toBeDefined();
            expect(retractedSummary.subject).toBe('[retracted by sender]');
            expect(retractedSummary.retracted).toBe(true);

            // getMessage returns placeholder body + subject too
            const full = await MailboxService.getMessage({ messageId: originalId });
            expect(full.subject).toBe('[retracted by sender]');
            expect(full.body).toBe('[retracted by sender]');
        });
    });

    test('#10148 AC2: deleteMessage rejects non-sender (recipient + third-party)', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        // Seed third-party
        GraphService.upsertNode({ id: '@carol-delete', type: 'AgentIdentity', name: 'CarolDelete', properties: { accountType: 'agent' } });

        let messageId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m = await MailboxService.addMessage({ to: '@bob', subject: 'not-yours-to-delete', body: '...' });
            messageId = m.messageId;
        });

        // Recipient (Bob) cannot retract — only the sender can
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.deleteMessage({ messageId })).rejects.toThrow(/Unauthorized.*only the sender can retract/);
        });

        // Third-party (Carol) cannot retract
        await RequestContextService.run({ agentIdentityNodeId: '@carol-delete' }, async () => {
            await expect(MailboxService.deleteMessage({ messageId })).rejects.toThrow(/Unauthorized.*only the sender can retract/);
        });

        // Sender (Alice) still can — sanity-check permission gate is sender-specific
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.deleteMessage({ messageId });
            expect(res.status).toBe('retracted');
        });
    });

    test('getHealthcheckPreview returns formatted mailbox metrics', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const m1 = await MailboxService.addMessage({ to: '@bob', subject: 'Msg 1', body: '...' });
            const m2 = await MailboxService.addMessage({ to: '@bob', subject: 'Msg 2', body: '...' });

            // artificially space them to ensure predictable sorting
            GraphService.db.nodes.get(m1.messageId).properties.sentAt = new Date(1000).toISOString();
            GraphService.db.nodes.get(m2.messageId).properties.sentAt = new Date(2000).toISOString();
        });

        // Test from Bob's perspective (Inbox)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(2);
            expect(preview.inbox.length).toBe(2);
            expect(preview.inbox[0].subject).toBe('Msg 2');
            expect(preview.outboxRecent.length).toBe(0);
        });

        // Test from Alice's perspective (Outbox)
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const preview = await MailboxService.getHealthcheckPreview();
            expect(preview.unreadCount).toBe(0);
            expect(preview.inbox.length).toBe(0);
            expect(preview.outboxRecent.length).toBe(2);
            expect(preview.outboxRecent[0].subject).toBe('Msg 2');
        });

        // Test no identity returns null
        const noIdentityPreview = await MailboxService.getHealthcheckPreview();
        expect(noIdentityPreview).toBeNull();
    });

    // ------------------------------------------------------------------
    // Regression coverage — production-convention addressing
    //
    // The tests above use the `AGENT:<name>` test-fixture convention. Production seeds
    // AgentIdentity nodes under bare `@login` (per ai/scripts/setup/seedAgentIdentities.mjs), and
    // `RequestContextService.getAgentIdentityNodeId()` returns that bare form. The divergence
    // between test and production conventions hid the SENT_TO cull bug for months — the
    // following block mirrors the REAL seed so end-to-end regressions catch it.
    // ------------------------------------------------------------------
    test.describe('#10174 production-convention addressing', () => {
        test.beforeEach(async () => {
            // Mirror the seedAgentIdentities.mjs convention + AGENT:* broadcast sentinel.
            GraphService.upsertNode({ id: '@opus',   type: 'AgentIdentity', name: 'Opus',   properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: '@gemini', type: 'AgentIdentity', name: 'Gemini', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: '@gpt',    type: 'AgentIdentity', name: 'GPT',    properties: { accountType: 'agent' } });
            // (`AGENT:*` already seeded by the outer beforeEach — retained because production
            //  uses the same sentinel id and this test block validates its addressability.)
        });

        test('bare `@login` addressing persists SENT_TO edge and surfaces in inbox', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@gemini', subject: 'direct ping', body: 'hello' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                // Core production-convention assertion: SENT_TO edge MUST persist. Pre-fix, GraphService.linkNodes
                // culled this silently because @gemini was a seeded AgentIdentity node — wait,
                // it should have worked. Actually: this specific case was the ONE that worked
                // pre-fix (bare `@login` IS the seeded form). The value of this test is as a
                // baseline against which the next two tests (`AGENT:@login` + `AGENT:*`) prove
                // the fix by not regressing what already worked.
                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@gemini');
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.length).toBe(1);
            expect(inbox.messages[0].subject).toBe('direct ping');
        });

        test('additional Claude identity routes by canonical identity while family alias stays ambiguous', async () => {
            GraphService.upsertNode({
                id        : '@neo-opus-4-7',
                type      : 'AgentIdentity',
                name      : 'Claude Opus 4.7',
                properties: {accountType: 'agent', modelFamily: 'claude'}
            });
            GraphService.upsertNode({
                id        : '@neo-opus-grace',
                type      : 'AgentIdentity',
                name      : 'Neo Claude Opus',
                properties: {accountType: 'agent', modelFamily: 'claude'}
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-grace' }, async () => {
                await PermissionService.grantPermission({ to: '@neo-opus-4-7', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-4-7' }, async () => {
                const res = await MailboxService.addMessage({
                    to     : '@neo-opus-grace',
                    subject: 'additional Claude direct ping',
                    body   : 'Canonical same-family Claude address must remain routable.'
                });

                expect(res.status).toBe('sent');
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:claude/opus',
                    subject: 'ambiguous Claude ping',
                    body   : 'Family alias must fail closed once two Claude identities exist.'
                })).rejects.toThrow(/Ambiguous 'to' alias.*modelFamily='claude'/);
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@neo-opus-grace' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });

            expect(inbox.messages.map(message => message.subject)).toContain('additional Claude direct ping');
        });

        test('`AGENT:@login` prefixed form normalizes to bare `@login` SENT_TO target', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                // The ambiguous tool-schema form — pre-fix, this was culled because the
                // literal 'AGENT:@gemini' string isn't a seeded node. Post-fix,
                // normalizeMailboxTarget strips the `AGENT:` prefix.
                const res = await MailboxService.addMessage({ to: 'AGENT:@gemini', subject: 'prefixed', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical bare `@login`, NOT the raw input `AGENT:@gemini`.
                expect(sentToEdge.target).toBe('@gemini');
            });

            // Recipient bound under bare `@gemini` sees the message via listMessages.
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.length).toBe(1);
            expect(inbox.messages[0].subject).toBe('prefixed');
        });

        test('#10259 missing `@` prefix auto-prepends to canonical `@login`', async () => {
            // The MORE COMMON typo case per tobi's polish request: author writes a bare
            // GitHub login (`gemini`) rather than the canonical `@`-prefixed form. Without
            // normalization, `linkNodes`' FK guard culls the SENT_TO edge because `gemini`
            // is not a seeded AgentIdentity node. With the prepend, it routes to the
            // canonical `@gemini` seed and the recipient sees the message.
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: 'gemini', subject: 'missing-prefix', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical `@`-prefixed form, NOT the raw bare input.
                expect(sentToEdge.target).toBe('@gemini');
            });

            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'missing-prefix')).toBeDefined();
        });

        test('#10259 missing-prefix normalization preserves canonical `@` and alternative schemes', async () => {
            // Load-bearing negative test: `@bob` should NOT be transformed to
            // `@@bob`. The `includes(':')` guard in normalizeMailboxTarget must
            // preserve the fixture path. Also covers `role:`/`human:` target patterns
            // by the same mechanism. Without this invariant, existing spec scenarios
            // seeded with `@alice` / `role:librarian` / `human:tobiu` would break.
            GraphService.upsertNode({ id: '@bob', type: 'AgentIdentity', name: 'Bob', properties: {accountType: 'agent'} });

            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: '@bob', subject: 'fixture-preserved', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@bob');  // unchanged
            });
        });

        test('#10259 accidental `@@login` double-prefix normalizes to canonical `@login`', async () => {
            // Defense-in-depth: if misformed automation or ID copy-paste
            // sends `to: '@@gemini'`, the normalizeMailboxTarget strip brings it back
            // to the canonical `@gemini` form before linkNodes' FK-style guard runs.
            // Without the strip, the SENT_TO edge gets culled because `@@gemini` is
            // not a seeded AgentIdentity node.
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@@gemini', subject: 'double-prefix', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                // Must be the canonical single-@ form, NOT the raw double-@ input.
                expect(sentToEdge.target).toBe('@gemini');
            });

            // Recipient bound under bare `@gemini` sees the message via listMessages.
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'double-prefix')).toBeDefined();
        });

        test('`@me` alias normalizes to the sentBy identity (Future-Self Routing)', async () => {
            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: '@me', subject: 'note to self', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('@opus');
            });

            // Opus should see their own message in the inbox
            const inbox = await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(inbox.messages.find(m => m.subject === 'note to self')).toBeDefined();
        });

        test('`@me` alias falls through when sentBy is absent', async () => {
            // Simulate missing identity context. The MailboxService guards against missing context
            // at the start of addMessage, so we expect an error to be thrown before normalization,
            // but if that guard is ever removed, the normalization safely falls through.
            await RequestContextService.run({ agentIdentityNodeId: null }, async () => {
                let error;
                try {
                    await MailboxService.addMessage({ to: '@me', subject: 'fallthrough', body: 'body' });
                } catch (e) {
                    error = e;
                }
                expect(error).toBeDefined();
                expect(error.message).toContain('no agent identity context bound');
            });
        });

        test('`AGENT:*` broadcast creates SENT_TO edge to the seeded sentinel and fans out', async () => {
            let messageId;
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'broadcast', body: 'body' });
                expect(res.status).toBe('sent');
                messageId = res.messageId;

                const sentToEdge = GraphService.db.edges.items.find(
                    e => e.source === messageId && e.type === 'SENT_TO'
                );
                expect(sentToEdge).toBeDefined();
                expect(sentToEdge.target).toBe('AGENT:*');

                const deliveryTargets = GraphService.db.edges.items
                    .filter(e => e.source === messageId && e.type === 'DELIVERED_TO')
                    .map(e => e.target)
                    .sort();

                expect(deliveryTargets).toEqual(expect.arrayContaining(['@gemini', '@gpt']));
                expect(deliveryTargets).not.toContain('@opus');
            });

            // Sender sees it in outbox
            const opusOutbox = await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                return await MailboxService.listMessages({ box: 'outbox' });
            });
            expect(opusOutbox.messages.length).toBe(1);

            // Every OTHER authenticated identity sees it in inbox via broadcast fan-out
            const geminiInbox = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                return await MailboxService.listMessages({ box: 'inbox' });
            });
            expect(geminiInbox.messages.length).toBe(1);
            expect(geminiInbox.messages[0].subject).toBe('broadcast');
        });

        test('#11029 broadcast markRead updates only the caller delivery receipt', async () => {
            const
                senderIdentity = '@neo-mailbox-markread-sender',
                readIdentity   = '@neo-mailbox-markread-reader',
                unreadIdentity = '@neo-mailbox-markread-unread';

            let messageId;

            GraphService.upsertNode({ id: senderIdentity, type: 'AgentIdentity', name: 'MarkReadSender', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: readIdentity,   type: 'AgentIdentity', name: 'MarkReadReader', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: unreadIdentity, type: 'AgentIdentity', name: 'MarkReadUnread', properties: { accountType: 'agent' } });

            await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'receipt split', body: 'body' });
                messageId = res.messageId;
            });

            await RequestContextService.run({ agentIdentityNodeId: readIdentity }, async () => {
                const before = await MailboxService.listMessages({ status: 'unread' });
                expect(before.messages.map(msg => msg.messageId)).toContain(messageId);

                const read = await MailboxService.markRead({ messageId });
                expect(read.status).toBe('read');

                const after = await MailboxService.listMessages({ status: 'unread' });
                expect(after.messages.map(msg => msg.messageId)).not.toContain(messageId);

                const full = await MailboxService.getMessage({ messageId });
                expect(full.readAt).toBe(read.readAt);
            });

            const messageNode = GraphService.db.nodes.get(messageId);
            expect(messageNode.properties.readAt).toBeNull();

            const geminiDelivery = GraphService.db.edges.items.find(e =>
                e.source === messageId && e.type === 'DELIVERED_TO' && e.target === readIdentity
            );
            const gptDelivery = GraphService.db.edges.items.find(e =>
                e.source === messageId && e.type === 'DELIVERED_TO' && e.target === unreadIdentity
            );

            expect(geminiDelivery.properties.readAt).toBeTruthy();
            expect(gptDelivery.properties.readAt).toBeNull();

            const gptUnread = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, async () => {
                return await MailboxService.listMessages({ status: 'unread' });
            });
            expect(gptUnread.messages.map(msg => msg.messageId)).toContain(messageId);

            const geminiDelta = await RequestContextService.run({ agentIdentityNodeId: readIdentity }, () => buildMailboxDelta());
            const gptDelta    = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, () => buildMailboxDelta());
            expect(geminiDelta.unreadCount).toBe(0);
            expect(gptDelta.unreadCount).toBe(1);

            try {
                SwarmHeartbeatService.identity = readIdentity;
                expect(await SwarmHeartbeatService.getUnreadCount()).toBe(0);
                SwarmHeartbeatService.identity = unreadIdentity;
                expect(await SwarmHeartbeatService.getUnreadCount()).toBe(1);
            } finally {
                SwarmHeartbeatService.identity = null;
            }
        });

        test('buildMailboxDelta counts unread and surfaces latest preview for bound identity', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                const first = await MailboxService.addMessage({ to: '@gemini', subject: 'one', body: '1' });
                // Force distinct sentAt so the ORDER BY ... LIMIT 1 is deterministic.
                GraphService.db.nodes.get(first.messageId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                // Writes reflect through to SQLite via the upsert path used by addEdge → autoSave
                // but explicit properties updates need a direct storage push or we rely on the
                // in-memory store matching SQLite; since the test uses `:memory:` SQLite there's
                // no cross-process coherence to worry about.
                const second = await MailboxService.addMessage({ to: '@gemini', subject: 'two', body: '2' });
                GraphService.db.nodes.get(second.messageId).properties.sentAt = '2026-04-22T14:00:00.000Z';

                // Persist the patched sentAt to SQLite so the SELECT json_extract(...) read
                // matches. addMessage wrote the original sentAt; we patched the in-memory copy
                // but still need to write that through.
                persistMessageNode(first.messageId);
                persistMessageNode(second.messageId);
            });

            const delta = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, () => {
                return buildMailboxDelta();
            });

            expect(delta).not.toBeNull();
            expect(delta.unreadCount).toBe(2);
            expect(delta.latestPreview).not.toBeNull();
            expect(delta.latestPreview.subject).toBe('two');  // newest-first ordering
            expect(delta.latestPreview.from).toBe('@opus');
            expect(delta.latestPreview.messageId).toMatch(/^MESSAGE:/);
        });

        test('#13091: buildMailboxDelta excludes archived direct-DMs from count and preview', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await PermissionService.grantPermission({ to: '@opus', scope: 'CAN_REPLY_TO' });
            });

            let visibleId, archivedId;

            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                visibleId = (await MailboxService.addMessage({ to: '@gemini', subject: 'visible', body: '1' })).messageId;
                GraphService.db.nodes.get(visibleId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                persistMessageNode(visibleId);

                archivedId = (await MailboxService.addMessage({ to: '@gemini', subject: 'archived-newer', body: '2' })).messageId;
                GraphService.db.nodes.get(archivedId).properties.sentAt = '2026-04-22T14:00:00.000Z';
                persistMessageNode(archivedId);
            });

            await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, async () => {
                await MailboxService.archiveMessage({ messageId: archivedId });

                const delta = buildMailboxDelta();

                expect(delta).not.toBeNull();
                expect(delta.unreadCount).toBe(1);
                expect(delta.latestPreview.messageId).toBe(visibleId);
                expect(delta.latestPreview.subject).toBe('visible');
            });
        });

        test('buildMailboxDelta returns null when identity is unbound (single-tenant fallthrough)', async () => {
            // No agentIdentityNodeId = unbound context, the stdio single-tenant case.
            const delta = await RequestContextService.run({}, () => {
                return buildMailboxDelta();
            });
            expect(delta).toBeNull();
        });

        test('buildMailboxDelta includes broadcast messages in unread count for all recipients', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@opus' }, async () => {
                await MailboxService.addMessage({ to: 'AGENT:*', subject: 'hello all', body: 'broadcast body' });
            });

            // Gemini's delta counts the broadcast even though it wasn't directly addressed
            const delta = await RequestContextService.run({ agentIdentityNodeId: '@gemini' }, () => {
                return buildMailboxDelta();
            });
            expect(delta).not.toBeNull();
            expect(delta.unreadCount).toBe(1);
            expect(delta.latestPreview.subject).toBe('hello all');
        });

        test('#13091: buildMailboxDelta excludes archived per-recipient broadcasts', async () => {
            const
                senderIdentity   = '@neo-mailbox-delta-broadcast-sender',
                archivedIdentity = '@neo-mailbox-delta-broadcast-recipient',
                unreadIdentity   = '@neo-mailbox-delta-broadcast-unread';

            GraphService.upsertNode({ id: senderIdentity,   type: 'AgentIdentity', name: 'DeltaBroadcastSender',    properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: archivedIdentity, type: 'AgentIdentity', name: 'DeltaBroadcastRecipient', properties: { accountType: 'agent' } });
            GraphService.upsertNode({ id: unreadIdentity,   type: 'AgentIdentity', name: 'DeltaBroadcastUnread',    properties: { accountType: 'agent' } });

            let visibleId, archivedId;

            await RequestContextService.run({ agentIdentityNodeId: senderIdentity }, async () => {
                visibleId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'visible broadcast', body: '1' })).messageId;
                GraphService.db.nodes.get(visibleId).properties.sentAt = '2026-04-22T13:00:00.000Z';
                persistMessageNode(visibleId);

                archivedId = (await MailboxService.addMessage({ to: 'AGENT:*', subject: 'archived broadcast', body: '2' })).messageId;
                GraphService.db.nodes.get(archivedId).properties.sentAt = '2026-04-22T14:00:00.000Z';
                persistMessageNode(archivedId);
            });

            await RequestContextService.run({ agentIdentityNodeId: archivedIdentity }, async () => {
                await MailboxService.archiveMessage({ messageId: archivedId });

                const delta = buildMailboxDelta();

                expect(delta).not.toBeNull();
                expect(delta.unreadCount).toBe(1);
                expect(delta.latestPreview.messageId).toBe(visibleId);
                expect(delta.latestPreview.subject).toBe('visible broadcast');
            });

            const unreadDelta = await RequestContextService.run({ agentIdentityNodeId: unreadIdentity }, () => buildMailboxDelta());
            expect(unreadDelta.unreadCount).toBe(2);
            expect(unreadDelta.latestPreview.messageId).toBe(archivedId);
        });

        test('BLOCKED_BY overrides CAN_REPLY_TO in blocked mode', async () => {
            // Bob grants Alice CAN_REPLY_TO
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
                // And then blocks her
                await PermissionService.grantPermission({ to: '@alice', scope: 'BLOCKED_BY' });
            });

            // Alice tries to DM Bob -> fails because BLOCKED_BY overrides
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({ to: '@bob', subject: 'Fail', body: 'Blocked' }))
                    .rejects.toThrow('Unauthorized: @bob has blocked messages from @alice.');
            });

            // Broadcasts bypass BLOCKED_BY
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'Broadcast', body: 'Passes' });
                expect(res.status).toBe('sent');
            });

            // Revoke the block
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.revokePermission({ to: '@alice', scope: 'BLOCKED_BY' });
            });

            // Alice tries to DM Bob again -> succeeds because CAN_REPLY_TO remains
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({ to: '@bob', subject: 'Success', body: 'Unblocked' });
                expect(res.status).toBe('sent');
            });
        });
    });

    // ------------------------------------------------------------------
    // Reject or resolve invalid `to:` in add_message instead of silent null-storage.
    //
    // Pre-fix the canonical `to:` field accepted any string, and `GraphService.linkNodes`
    // silently culled the SENT_TO edge when the target did not match a registered Node.
    // The MESSAGE node still stored the malformed value in its `to:` property; the missing
    // edge surfaced as `to: null` in `get_message` reads. Result: orphan messages invisible
    // to the intended recipient, breaking cross-skill A2A coordination.
    //
    // `validateMailboxTarget` (introduced in this PR) gates the failure surface: targets
    // that don't resolve to a real graph node OR an unambiguous `AGENT:<family>/<model>`
    // alias against `AgentIdentity.modelFamily` are rejected with a clear error.
    // ------------------------------------------------------------------
    test.describe('#11417 add_message reject/resolve invalid `to:`', () => {
        test('rejects unrecognized AGENT:<family>/<model> alias with explicit error', async () => {
            await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:nonsense/blob',
                    subject: 'Should reject',
                    body   : 'Pre-#11417 this stored as to: null and orphaned the message.'
                })).rejects.toThrow(/Unrecognized 'to' format.*AGENT:nonsense\/blob/);
            });
        });

        test('resolves AGENT:<family>/<model> alias when exactly one AgentIdentity matches', async () => {
            // Seed an AgentIdentity with a unique modelFamily so the alias-resolve path can hit.
            GraphService.upsertNode({
                id        : '@neo-test-agent',
                type      : 'AgentIdentity',
                name      : 'Test Agent',
                properties: { modelFamily: 'testfamily', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-test-agent' }, async () => {
                await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            });

            const res = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                return MailboxService.addMessage({
                    to     : 'AGENT:testfamily/anymodel',
                    subject: 'Alias-resolve path',
                    body   : 'AGENT:<family>/<model> should resolve when unambiguous.'
                });
            });

            expect(res.status).toBe('sent');

            // Verify the SENT_TO edge points at the resolved canonical identity, not null.
            let sentTo;
            for (const edge of GraphService.db.edges.items) {
                if (edge.source === res.messageId && edge.type === 'SENT_TO') {
                    sentTo = edge.target;
                }
            }
            expect(sentTo).toBe('@neo-test-agent');

            // Verify the MESSAGE node's to: property also carries the resolved canonical form,
            // not the alias and not null.
            const messageNode = GraphService.db.nodes.get(res.messageId);
            expect(messageNode.properties.to).toBe('@neo-test-agent');
        });

        test('rejects ambiguous AGENT:<family>/<model> alias when multiple AgentIdentities match', async () => {
            // Seed two AgentIdentities with the same modelFamily so the alias-resolve path
            // finds multiple candidates and rejects rather than picking arbitrarily.
            GraphService.upsertNode({
                id        : '@neo-test-a',
                type      : 'AgentIdentity',
                name      : 'Test A',
                properties: { modelFamily: 'multifam', accountType: 'agent' }
            });
            GraphService.upsertNode({
                id        : '@neo-test-b',
                type      : 'AgentIdentity',
                name      : 'Test B',
                properties: { modelFamily: 'multifam', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                await expect(MailboxService.addMessage({
                    to     : 'AGENT:multifam/anymodel',
                    subject: 'Ambiguous',
                    body   : 'Multiple AgentIdentities match modelFamily=multifam'
                })).rejects.toThrow(/Ambiguous 'to' alias.*multifam/);
            });
        });

        test('#14750 rostered residents resolve era-chain-first: a spoofed flat node property neither matches nor masks', async () => {
            // A rostered resident's graph node carries a WRONG flat modelFamily. The family fact
            // must read through the identity trail (era chain → currentEra.family), so:
            // (a) the alias for the TRUE family still finds the node;
            // (b) the alias for the SPOOFED family does NOT match it (the flat property is
            //     no longer the read for rostered residents).
            GraphService.upsertNode({
                id        : '@neo-gemini-pro',
                type      : 'AgentIdentity',
                name      : 'Gemini Pro',
                properties: { modelFamily: 'spoofed-family', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@neo-gemini-pro' }, async () => {
                await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to     : 'AGENT:gemini/pro',
                    subject: 'era-chain resolution',
                    body   : 'The identity trail, not the node property, owns the family fact.'
                });
                expect(res.status).toBe('sent');

                let sentTo;
                for (const edge of GraphService.db.edges.items) {
                    if (edge.source === res.messageId && edge.type === 'SENT_TO') {
                        sentTo = edge.target;
                    }
                }
                expect(sentTo).toBe('@neo-gemini-pro');

                await expect(MailboxService.addMessage({
                    to     : 'AGENT:spoofed-family/pro',
                    subject: 'spoof must not resolve',
                    body   : 'A flat property divergence cannot re-route a rostered resident.'
                })).rejects.toThrow(/Unrecognized 'to' format/);
            });
        });

        test('#14750 runtime-provisioned identities (unrostered) keep resolving via the flat node property — the second retirement witness', async () => {
            GraphService.upsertNode({
                id        : '@runtime-provisioned-x',
                type      : 'AgentIdentity',
                name      : 'Runtime Provisioned',
                properties: { modelFamily: 'provisioned-fam', accountType: 'agent' }
            });

            await RequestContextService.run({ agentIdentityNodeId: '@runtime-provisioned-x' }, async () => {
                await PermissionService.grantPermission({to: '@alice', scope: 'CAN_REPLY_TO'});
            });

            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to     : 'AGENT:provisioned-fam/any',
                    subject: 'fallback resolution',
                    body   : 'Graph-only identities read their own node property until era chains exist for them.'
                });
                expect(res.status).toBe('sent');
            });
        });
    });
});

/**
 * Mailbox reply policy — `'open'` mode behavior.
 *
 * Separate top-level describe so the config mutation + serial ordering are
 * self-contained. Mirrors the setup pattern of the parent suite (isolated tmp
 * SQLite + symmetric afterAll cleanup) but pins `defaultReplyPolicy: 'open'`
 * for the duration of these tests.
 *
 * Validates the three invariants of `'open'` mode:
 *   1. First-contact DM between two identities with no prior history and no
 *      `CAN_REPLY_TO` grant SUCCEEDS (the core UX deliverable).
 *   2. `PermissionService.grantPermission` remains callable and `CAN_REPLY_TO`
 *      edges remain graph-queryable — primitives unchanged, only enforcement
 *      path differs.
 *   3. Read-path scoping (`CAN_READ_INBOX_OF`) remains strict — reading
 *      another agent's inbox without a grant still throws Unauthorized.
 */
test.describe('Neo.ai.services.memory-core.MailboxService — open policy mode (#10252)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave, originalMailboxPolicy;

    test.beforeAll(async () => {

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        mailboxAiConfig.data.mailbox ??= {};
        originalMailboxPolicy = mailboxAiConfig.data.mailbox.defaultReplyPolicy;
        mailboxAiConfig.data.mailbox.defaultReplyPolicy = 'open';

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
        if (mailboxAiConfig?.data?.mailbox) {
            mailboxAiConfig.data.mailbox.defaultReplyPolicy = originalMailboxPolicy;
        }
    });

    test.beforeEach(async () => {
        MailboxService.clearRelatedPullRequestStateCache();
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        GraphService.upsertNode({ id: '@alice', type: 'AgentIdentity', name: 'Alice', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@bob', type: 'AgentIdentity', name: 'Bob', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });
    });

    test('first-contact DM succeeds without grant or prior history', async () => {
        // Charlie sends to Alice with no CAN_REPLY_TO edge and no prior message history.
        // Strict mode would throw Unauthorized here (see the parent suite's Reachable-
        // Counterparty Trust test); open mode accepts the send.
        const res = await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, () => {
            return MailboxService.addMessage({ to: '@alice', subject: 'First contact', body: 'hi' });
        });

        expect(res.status).toBe('sent');
        expect(res.messageId).toMatch(/^MESSAGE:/);
    });

    test('grantPermission remains callable and edges remain graph-queryable', async () => {
        // Even in 'open' mode, operators can still explicitly grant CAN_REPLY_TO.
        // The edge is created and visible via listPermissions — only the enforcement
        // path on addMessage is bypassed.
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const result = await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            expect(result.success).toBe(true);
        });

        // Alice (the grantee) can list her capabilities and sees the grant.
        const perms = await RequestContextService.run({ agentIdentityNodeId: '@alice' }, () => {
            return PermissionService.listPermissions();
        });

        expect(perms.capabilities).toContainEqual(expect.objectContaining({
            target: '@bob',
            scope : 'CAN_REPLY_TO'
        }));
    });

    test('read-path scoping stays strict — CAN_READ_INBOX_OF still enforced', async () => {
        // Bob sends Alice a message (allowed in open mode).
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'inbox test', body: 'body' });
            msgId = res.messageId;
        });

        // Charlie tries to read Alice's inbox — should fail regardless of reply policy.
        // Open mode only relaxes the WRITE gate; read-path isolation is a separate
        // scope (`CAN_READ_INBOX_OF`) and stays strict per the reply-policy boundary.
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.listMessages({ to: '@alice' })).rejects.toThrow(/Unauthorized/);
        });

        // Charlie also can't fetch the specific message by ID without the scope.
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.getMessage({ messageId: msgId })).rejects.toThrow(/Unauthorized/);
        });
    });

    test('broadcast sends and role/human targets behave identically in both modes', async () => {
        // Open mode does not change the always-allowed paths: broadcast sends,
        // self-sends, and role/human targets all continue to work regardless of policy.
        GraphService.upsertNode({ id: 'role:librarian', type: 'ROLE', name: 'Librarian', properties: {} });
        GraphService.upsertNode({ id: 'human:tobiu', type: 'HUMAN', name: 'Tobias', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const broadcast = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'announce', body: 'body' });
            expect(broadcast.status).toBe('sent');

            const toRole = await MailboxService.addMessage({ to: 'role:librarian', subject: 'need book', body: 'body' });
            expect(toRole.status).toBe('sent');

            const toHuman = await MailboxService.addMessage({ to: 'human:tobiu', subject: 'fyi', body: 'body' });
            expect(toHuman.status).toBe('sent');
        });
    });

    test('BLOCKED_BY overrides default-allow in open mode', async () => {
        // Bob blocks Alice
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'BLOCKED_BY' });
        });

        // Alice tries to DM Bob -> fails because BLOCKED_BY overrides open mode default
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({ to: '@bob', subject: 'Fail', body: 'Blocked' }))
                .rejects.toThrow('Unauthorized: @bob has blocked messages from @alice.');
        });

        // Bob can still DM Alice (directional block)
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.addMessage({ to: '@alice', subject: 'Passes', body: 'Directional' });
            expect(res.status).toBe('sent');
        });

        // Broadcasts bypass BLOCKED_BY
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: 'AGENT:*', subject: 'Broadcast', body: 'Passes' });
            expect(res.status).toBe('sent');
        });

        // Revoke the block
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.revokePermission({ to: '@alice', scope: 'BLOCKED_BY' });
        });

        // Alice tries to DM Bob again -> succeeds
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({ to: '@bob', subject: 'Success', body: 'Unblocked' });
            expect(res.status).toBe('sent');
        });
    });

    // A2A Task envelope primitive.
    // The write path clones caller-authored Task JSON, overwrites the server-owned assignee, and
    // roundtrips the resulting envelope through get_message + list_messages. State-machine
    // semantics + RBAC enforcement layer on top. Schema follows Option C hybrid: A2A spec subset + Neo
    // extensions (`expiresAt`, `Blocked`) per the originating Discussion graduation. See
    // https://a2a-protocol.org/latest/specification/.
    test('#10334 task envelope: roundtrips through addMessage/getMessage/listMessages', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const taskPayload = {
            state: 'Submitted',
            input: {
                parts: [
                    { kind: 'text', text: 'Please review PR #N' },
                    { kind: 'data', data: { prNumber: 12345 } }
                ]
            },
            metadata: {
                sessionId     : 'session-abc-123',
                relatedTickets: ['#10334', '#10311'],
                parentTask    : null
            },
            expectedOutput: { shape: 'review', locationHint: 'post as PR comment' },
            budget        : { deadline: '2026-04-30T00:00:00Z', maxTokens: 8000 },
            expiresAt     : '2026-04-30T00:00:00Z'
        };

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to     : '@bob',
                subject: 'Task delegation',
                body   : 'See task envelope',
                task   : taskPayload
            });
            msgId = res.messageId;
        });

        // Verify caller fields survive while assignment authority stays server-owned.
        const
            node       = GraphService.db.nodes.get(msgId),
            storedTask = {...taskPayload, assignee: '@bob'};

        expect(node.properties.task).toEqual(storedTask);
        expect(node.properties.taskAssignmentAuthority).toBe('memory-core.v1');

        // Verify getMessage returns task field
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.task).toEqual(storedTask);
        expect(bobRead.body).toBe('See task envelope');

        // Verify listMessages includes task field in summary
        const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        const found = bobList.messages.find(m => m.messageId === msgId);
        expect(found).toBeDefined();
        expect(found.task).toEqual(storedTask);
    });

    test('#13411 related PR state echo: getMessage/listMessages surface live state', async () => {
        const threadId = 'thread-related-pr-live-state';
        GraphService.upsertNode({ id: threadId, type: 'THREAD', name: 'Related PR live state', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalResolvePullRequestState = MailboxService.resolvePullRequestState,
            calls                             = [];

        MailboxService.resolvePullRequestState = async (number) => {
            calls.push(number);

            return number === 13411
                ? { ticket: '#13411', number, state: 'OPEN', mergedAt: null }
                : null
        };

        try {
            let msgId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'Review request',
                    body          : 'Please review the PR.',
                    partOfThread  : threadId,
                    relatedTickets: ['#13411', '#13412']
                });
                msgId = res.messageId;
            });

            const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({ messageId: msgId });
            });
            expect(bobRead.relatedTickets).toEqual(['#13411', '#13412']);
            expect(bobRead.relatedPullRequests).toEqual([
                { ticket: '#13411', number: 13411, state: 'OPEN', mergedAt: null }
            ]);

            const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({ status: 'all', threadId });
            });
            const found = bobList.messages.find(m => m.messageId === msgId);
            expect(found.relatedTickets).toEqual(['#13411', '#13412']);
            expect(found.relatedPullRequests).toEqual([
                { ticket: '#13411', number: 13411, state: 'OPEN', mergedAt: null }
            ]);
            expect(calls).toEqual([13411, 13412]);
        } finally {
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
    });

    test('#13411 related PR state echo: fetch failure omits echo but keeps message', async () => {
        const threadId = 'thread-related-pr-fetch-failure';
        GraphService.upsertNode({ id: threadId, type: 'THREAD', name: 'Related PR fetch failure', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        const originalResolvePullRequestState = MailboxService.resolvePullRequestState;
        let   calls                           = 0;
        MailboxService.resolvePullRequestState = async () => {
            calls++;
            return null
        };

        try {
            let msgId;
            await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
                const res = await MailboxService.addMessage({
                    to            : '@bob',
                    subject       : 'Review request',
                    body          : 'Please review the PR.',
                    partOfThread  : threadId,
                    relatedTickets: ['#13411']
                });
                msgId = res.messageId;
            });

            const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.getMessage({ messageId: msgId });
            });
            expect(bobRead.relatedTickets).toEqual(['#13411']);
            expect(bobRead.relatedPullRequests).toBeUndefined();
            expect(bobRead.body).toBe('Please review the PR.');

            const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
                return await MailboxService.listMessages({ status: 'all', threadId });
            });
            const found = bobList.messages.find(m => m.messageId === msgId);
            expect(found.relatedPullRequests).toBeUndefined();
            expect(calls).toBe(1);
        } finally {
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
    });

    test('#13411 related PR state echo: cloud deployment mode skips GitHub CLI resolution', async () => {
        const originalResolvePullRequestState = MailboxService.resolvePullRequestState,
            originalDeploymentMode            = mailboxAiConfig.orchestrator.deploymentMode;
        let calls = 0;

        MailboxService.resolvePullRequestState = async (number) => {
            calls++;
            return { ticket: `#${number}`, number, state: 'OPEN', mergedAt: null }
        };
        mailboxAiConfig.orchestrator.deploymentMode = 'cloud';

        try {
            const states = await MailboxService.resolveRelatedPullRequestStates(['#13411']);
            expect(states).toEqual([]);
            expect(calls).toBe(0);
        } finally {
            mailboxAiConfig.orchestrator.deploymentMode = originalDeploymentMode;
            MailboxService.resolvePullRequestState = originalResolvePullRequestState;
        }
    });

    test('#10334 task envelope: backward-compatible — messages without task field unaffected', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
        });

        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to: '@bob', subject: 'Plain message', body: 'No task envelope'
            });
            msgId = res.messageId;
        });

        // Node should NOT have task property
        const node = GraphService.db.nodes.get(msgId);
        expect(node.properties.task).toBeUndefined();

        // getMessage return should NOT have task field
        const bobRead = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.getMessage({ messageId: msgId });
        });
        expect(bobRead.task).toBeUndefined();
        expect(bobRead.body).toBe('No task envelope');

        // listMessages summary should NOT have task field
        const bobList = await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            return await MailboxService.listMessages({ status: 'all' });
        });
        const found = bobList.messages.find(m => m.messageId === msgId);
        expect(found.task).toBeUndefined();
    });
});

/**
 * A2A_TASK state-machine + transition authority + idempotency claim-and-lock
 */
test.describe('Neo.ai.services.memory-core.MailboxService — A2A_TASK (#10338)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;

    test.beforeAll(async () => {

        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
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

        GraphService.upsertNode({ id: '@alice', type: 'AgentIdentity', name: 'Alice', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@bob', type: 'AgentIdentity', name: 'Bob', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@charlie', type: 'AgentIdentity', name: 'Charlie', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast', properties: {} });

        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await PermissionService.grantPermission({ to: '@alice', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await PermissionService.grantPermission({ to: '@bob', scope: 'CAN_REPLY_TO' });
            await PermissionService.grantPermission({ to: '@charlie', scope: 'CAN_REPLY_TO' });
        });
    });

    function clearTaskCacheWithoutStorageMutation() {
        const wasAutoSave = GraphService.db.autoSave;

        GraphService.db.autoSave = false;
        GraphService.db.nodes.clear();
        GraphService.db.edges.clear();
        GraphService.db.autoSave = wasAutoSave;
        GraphService.db.vicinityLoadedNodes.clear();
        GraphService.db.lastAccessMap.clear();
    }

    function readStoredTask(taskId) {
        const row = GraphService.db.storage.db.prepare(`
            SELECT
                json_extract(data, '$.properties.task')                    AS task,
                json_extract(data, '$.properties.taskAssignmentAuthority') AS taskAssignmentAuthority,
                json_extract(data, '$.properties.lastModifiedAt')          AS lastModifiedAt
            FROM Nodes
            WHERE id = ?
        `).get(taskId);

        return {
            ...row,
            task: row?.task ? JSON.parse(row.task) : row?.task
        };
    }

    function readTaskEvents(taskId) {
        return GraphService.db.storage.db.prepare(`
            SELECT log_id, entity_id, entity_type, event_id, event_payload
            FROM GraphLog
            WHERE entity_id = ? AND entity_type = 'task_state_changed'
            ORDER BY log_id ASC
        `).all(taskId).map(row => ({
            ...row,
            event_payload: JSON.parse(row.event_payload)
        }))
    }

    test('addMessage and transitionTask enforce state enum validation', async () => {
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.addMessage({
                to  : '@bob', subject: 'task', body: 'body',
                task: { state: 'InvalidState' }
            })).rejects.toThrow(/Invalid task state: InvalidState/);

            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });

            await expect(MailboxService.transitionTask({
                taskId: res.messageId, newState: 'AlsoInvalid'
            })).rejects.toThrow(/Invalid new task state: AlsoInvalid/);
        });
    });

    test('successful transitions append one immutable typed event while mismatch paths append none (#15114)', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: '@bob', subject: 'typed transition event', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });

        const mismatch = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({
                taskId              : msgId,
                newState            : 'Working',
                expectedCurrentState: 'InputRequired'
            })
        );

        expect(mismatch).toMatchObject({success: false, rowsAffected: 0});
        expect(readTaskEvents(msgId)).toEqual([]);

        const transition = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
        );
        const [event] = readTaskEvents(msgId);

        expect(transition).toMatchObject({success: true, rowsAffected: 1});
        expect(event.event_id).toBeTruthy();
        expect(event.event_payload).toEqual({
            schemaVersion      : 'task-state-change.v1',
            taskId             : msgId,
            previousState      : 'Submitted',
            newState           : 'Working',
            originator         : '@alice',
            assignee           : '@bob',
            assignmentAuthority: 'memory-core.v1',
            lastModifiedAt     : readStoredTask(msgId).lastModifiedAt
        });

        const genericRows = GraphService.db.storage.db.prepare(`
            SELECT COUNT(*) AS count FROM GraphLog
            WHERE entity_id = ? AND entity_type = 'nodes'
        `).get(msgId).count;
        expect(genericRows).toBeGreaterThan(0);
    });

    test('Task state write rolls back when its typed event cannot commit (#15114)', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: '@bob', subject: 'event rollback', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });

        const storage        = GraphService.db.storage;
        const originalAppend = storage.appendGraphLogEvent;

        storage.appendGraphLogEvent = () => {
            throw new Error('injected typed-event failure')
        };

        try {
            await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
                await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Working'}))
                    .rejects.toThrow(/injected typed-event failure/);
            });
        } finally {
            storage.appendGraphLogEvent = originalAppend;
        }

        expect(readStoredTask(msgId).task).toMatchObject({state: 'Submitted', assignee: '@bob'});
        expect(readStoredTask(msgId).lastModifiedAt).toBeNull();
        expect(readTaskEvents(msgId)).toEqual([]);
    });

    test('Task assignment is server-owned for direct and broadcast messages without mutating caller input', async () => {
        const
            directInput    = {state: 'Submitted', assignee: '@charlie', metadata: {keep: true}},
            broadcastInput = {state: 'Submitted', assignee: '@charlie', metadata: {keep: true}};
        let directId, broadcastId, roleId;

        GraphService.upsertNode({id: 'role:task-triage', type: 'ROLE', name: 'Task triage', properties: {}});

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            directId = (await MailboxService.addMessage({
                to: '@bob', subject: 'direct server-owned assignee', body: 'body', task: directInput
            })).messageId;
            broadcastId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'broadcast unclaimed', body: 'body', task: broadcastInput
            })).messageId;
            roleId = (await MailboxService.addMessage({
                to  : 'role:task-triage', subject: 'non-agent target', body: 'body',
                task: {state: 'Submitted', assignee: '@bob'}
            })).messageId;
        });

        expect(directInput).toEqual({state: 'Submitted', assignee: '@charlie', metadata: {keep: true}});
        expect(broadcastInput).toEqual({state: 'Submitted', assignee: '@charlie', metadata: {keep: true}});

        const
            directNode    = GraphService.db.nodes.get(directId),
            broadcastNode = GraphService.db.nodes.get(broadcastId);

        expect(directNode.properties.task).toEqual({
            state: 'Submitted', assignee: '@bob', metadata: {keep: true}
        });
        expect(directNode.properties.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(broadcastNode.properties.task).toEqual({
            state: 'Submitted', assignee: null, metadata: {keep: true}
        });
        expect(broadcastNode.properties.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(GraphService.db.nodes.get(roleId).properties.task.assignee).toBeNull();

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(MailboxService.transitionTask({taskId: roleId, newState: 'Working'}))
                .rejects.toThrow(/Unauthorized|assignee/i);
        });

        const {readWalMessagesByIds} = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        const records                = await readWalMessagesByIds({
            dir: mailboxAiConfig.messageWal.dir,
            ids: [directId, broadcastId]
        });
        const recordsById = new Map(records.map(record => [record.id, record]));

        expect(recordsById.get(directId).message.properties.task.assignee).toBe('@bob');
        expect(recordsById.get(directId).message.properties.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(recordsById.get(broadcastId).message.properties.task.assignee).toBeNull();
        expect(recordsById.get(broadcastId).message.properties.taskAssignmentAuthority).toBe('memory-core.v1');

        const directRead = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.getMessage({messageId: directId})
        );
        const broadcastList = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.listMessages({status: 'all'})
        );

        expect(directRead.task.assignee).toBe('@bob');
        expect(broadcastList.messages.find(message => message.messageId === broadcastId).task.assignee).toBeNull();
    });

    test('broadcast claim is receipt-cohort-bound and persists one canonical winner', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'cohort claim', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });

        // Created after send: authenticated, but absent from the immutable delivery cohort.
        GraphService.upsertNode({
            id: '@late', type: 'AgentIdentity', name: 'Late', properties: {accountType: 'agent'}
        });

        await RequestContextService.run({agentIdentityNodeId: '@late'}, async () => {
            await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Working'}))
                .rejects.toThrow(/Unauthorized|delivery cohort|assignee/i);
        });
        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Working'}))
                .rejects.toThrow(/Unauthorized|delivery cohort|assignee/i);
        });

        const claim = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
        );
        const stored = readStoredTask(msgId);
        const cached = GraphService.db.nodes.get(msgId);

        expect(claim).toMatchObject({success: true, rowsAffected: 1, task: {state: 'Working', assignee: '@bob'}});
        expect(stored.task).toMatchObject({state: 'Working', assignee: '@bob'});
        expect(stored.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(stored.lastModifiedAt).toBeTruthy();
        expect(cached.properties.task).toEqual(stored.task);
        expect(cached.properties.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(cached.properties.lastModifiedAt).toBe(stored.lastModifiedAt);

        clearTaskCacheWithoutStorageMutation();

        const claimedRead = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.getMessage({messageId: msgId})
        );
        const claimedList = await RequestContextService.run({agentIdentityNodeId: '@charlie'}, () =>
            MailboxService.listMessages({status: 'all'})
        );

        expect(claimedRead.task).toMatchObject({state: 'Working', assignee: '@bob'});
        expect(claimedList.messages.find(message => message.messageId === msgId).task)
            .toMatchObject({state: 'Working', assignee: '@bob'});

        await RequestContextService.run({agentIdentityNodeId: '@charlie'}, async () => {
            await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Completed'}))
                .rejects.toThrow(/Unauthorized|assignee/i);
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Completed'}))
                .resolves.toMatchObject({success: true, task: {state: 'Completed', assignee: '@bob'}});
        });
    });

    test('race loser refreshes winner state, assignee, authority, and clock without a second write', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'two claimant race', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });
        const sqlite         = GraphService.db.storage.db;
        const nodeWriteCount = () => sqlite.prepare(`
            SELECT COUNT(*) AS count FROM GraphLog WHERE entity_id = ? AND entity_type = 'nodes'
        `).get(msgId).count;
        const writesBefore    = nodeWriteCount();
        const originalPrepare = sqlite.prepare;
        const winnerClock     = '2026-07-12T20:30:00.000Z';
        let   injected        = false, loser;

        // Interpose the peer winner after Charlie's authoritative read/RBAC pass but immediately
        // before Charlie prepares the guarded UPDATE. This is the actual cross-process race window;
        // mutating only the local cache cannot model it now that transitionTask reads SQLite first.
        sqlite.prepare = function(sql) {
            if (!injected && sql.includes("'$.properties.task.assignee'") && sql.includes('UPDATE Nodes')) {
                injected = true;
                originalPrepare.call(sqlite, `
                    UPDATE Nodes
                    SET data = json_set(
                        data,
                        '$.properties.task.state', 'Working',
                        '$.properties.task.assignee', '@bob',
                        '$.properties.taskAssignmentAuthority', 'memory-core.v1',
                        '$.properties.lastModifiedAt', ?
                    )
                    WHERE id = ? AND json_extract(data, '$.properties.task.state') = 'Submitted'
                `).run(winnerClock, msgId);
            }

            return originalPrepare.call(sqlite, sql);
        };

        try {
            loser = await RequestContextService.run({agentIdentityNodeId: '@charlie'}, () =>
                MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
            );
        } finally {
            sqlite.prepare = originalPrepare;
        }

        const winner = readStoredTask(msgId);

        expect(loser).toMatchObject({
            success     : false,
            rowsAffected: 0,
            task        : {state: 'Working', assignee: '@bob'}
        });
        expect(loser.reason).toMatch(/Race lost: state changed to Working/);
        expect(readStoredTask(msgId)).toEqual(winner);
        expect(GraphService.db.nodes.get(msgId).properties.task).toEqual(winner.task);
        expect(GraphService.db.nodes.get(msgId).properties.taskAssignmentAuthority).toBe(winner.taskAssignmentAuthority);
        expect(GraphService.db.nodes.get(msgId).properties.lastModifiedAt).toBe(winner.lastModifiedAt);
        expect(winner.lastModifiedAt).toBe(winnerClock);
        expect(nodeWriteCount()).toBe(writesBefore + 1);
        expect(readTaskEvents(msgId)).toEqual([]); // interposed winner bypasses this producer; loser emits none
    });

    test('legacy direct Task backfills its one canonical recipient before a later transition', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: '@bob', subject: 'legacy direct', body: 'body', task: {state: 'Working'}
            })).messageId;
        });

        GraphService.db.storage.db.prepare(`
            UPDATE Nodes
            SET data = json_remove(
                json_remove(data, '$.properties.task.assignee'),
                '$.properties.taskAssignmentAuthority'
            )
            WHERE id = ?
        `).run(msgId);
        clearTaskCacheWithoutStorageMutation();

        const result = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Completed'})
        );

        expect(result).toMatchObject({success: true, task: {state: 'Completed', assignee: '@bob'}});
        expect(readStoredTask(msgId)).toMatchObject({
            task                   : {state: 'Completed', assignee: '@bob'},
            taskAssignmentAuthority: 'memory-core.v1'
        });
    });

    test('untrusted legacy broadcast post-claim states fail closed even with a spoofed assignee', async () => {
        for (const state of ['Working', 'InputRequired']) {
            let msgId;

            await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
                msgId = (await MailboxService.addMessage({
                    to: 'AGENT:*', subject: `legacy ${state}`, body: 'body', task: {state}
                })).messageId;
            });

            GraphService.db.storage.db.prepare(`
                UPDATE Nodes
                SET data = json_set(
                    json_remove(data, '$.properties.taskAssignmentAuthority'),
                    '$.properties.task.assignee',
                    '@charlie'
                )
                WHERE id = ?
            `).run(msgId);
            clearTaskCacheWithoutStorageMutation();

            const actor = state === 'InputRequired' ? '@alice' : '@charlie';

            await RequestContextService.run({agentIdentityNodeId: actor}, async () => {
                await expect(MailboxService.transitionTask({
                    taskId  : msgId,
                    newState: state === 'InputRequired' ? 'Working' : 'Completed'
                })).rejects.toThrow(/owner.*unknown|unknown.*owner/i);
            });
        }
    });

    test('full WAL replay preserves committed Task state, winner, authority, and transition clock', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'replay claimed task', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
        );

        const committed              = readStoredTask(msgId);
        const {readWalMessagesByIds} = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        const [record]               = await readWalMessagesByIds({
            dir: mailboxAiConfig.messageWal.dir,
            ids: [msgId]
        });

        expect(record.message.properties.task).toMatchObject({state: 'Submitted', assignee: null});
        await MailboxService._projectMessageWalRecord(record, {pumpWake: false});

        expect(readStoredTask(msgId)).toEqual(committed);
    });

    test('existing-node full replay is storage-neutral across an interposed peer transition', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'replay race', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
        );

        const {readWalMessagesByIds} = await import('../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs');
        const [record]               = await readWalMessagesByIds({
            dir: mailboxAiConfig.messageWal.dir,
            ids: [msgId]
        });
        const
            sqlite          = GraphService.db.storage.db,
            originalPrepare = sqlite.prepare,
            peerClock       = '2026-07-12T21:15:00.000Z';
        let injected = false;

        sqlite.prepare = function(sql) {
            const statement = originalPrepare.call(sqlite, sql);

            if (sql.includes('SELECT count(*) AS count FROM Nodes WHERE id = ?')) {
                return {
                    get(...args) {
                        const result = statement.get(...args);

                        if (!injected && args[0] === msgId) {
                            injected = true;
                            originalPrepare.call(sqlite, `
                                UPDATE Nodes
                                SET data = json_set(
                                    data,
                                    '$.properties.task.state', 'Completed',
                                    '$.properties.lastModifiedAt', ?
                                )
                                WHERE id = ?
                            `).run(peerClock, msgId);
                        }

                        return result;
                    }
                };
            }

            return statement;
        };

        try {
            await MailboxService._projectMessageWalRecord(record, {pumpWake: false});
        } finally {
            sqlite.prepare = originalPrepare;
        }

        expect(injected).toBe(true);
        expect(readStoredTask(msgId)).toMatchObject({
            task                   : {state: 'Completed', assignee: '@bob'},
            taskAssignmentAuthority: 'memory-core.v1',
            lastModifiedAt         : peerClock
        });
    });

    test('post-marker Task node-loss repair restores non-claimable Unknown, never WAL Submitted', async () => {
        let msgId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            msgId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'lost claimed task', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });
        await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.transitionTask({taskId: msgId, newState: 'Working'})
        );

        GraphService.db.storage.db.prepare('DELETE FROM Nodes WHERE id = ?').run(msgId);
        clearTaskCacheWithoutStorageMutation();

        const repair = await MailboxService.repairMessageGraphIntegrity({ids: [msgId]});
        const stored = readStoredTask(msgId);

        expect(repair).toMatchObject({scanned: 1, repaired: 1, failed: 0});
        expect(stored).toMatchObject({
            task                   : {state: 'Unknown', assignee: null},
            taskAssignmentAuthority: 'memory-core.v1'
        });
        expect(stored.lastModifiedAt).toBeNull();

        const readBack = await RequestContextService.run({agentIdentityNodeId: '@bob'}, () =>
            MailboxService.getMessage({messageId: msgId})
        );
        expect(readBack.task).toMatchObject({state: 'Unknown', assignee: null});

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(MailboxService.transitionTask({taskId: msgId, newState: 'Working'}))
                .rejects.toThrow(/owner.*unknown|unknown.*owner/i);
        });
    });

    test('RBAC Matrix: Originator and Assignee authority', async () => {
        let msgId;
        // Alice creates task for Bob
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Bob (Assignee) can transition Submitted -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Working');
            expect(res.task.assignee).toBe('@bob');
        });

        // Bob (Assignee) can transition Working -> InputRequired
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'InputRequired' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('InputRequired');
            expect(res.task.assignee).toBe('@bob');
        });

        // Alice (Originator) can transition InputRequired -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Working');
            expect(res.task.assignee).toBe('@bob');
        });

        // Bob (Assignee) can transition Working -> Completed
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const res = await MailboxService.transitionTask({ taskId: msgId, newState: 'Completed' });
            expect(res.success).toBe(true);
            expect(res.task.state).toBe('Completed');
            expect(res.task.assignee).toBe('@bob');
        });

        // Test Canceled by Originator
        let msg2Id;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task2', body: 'body',
                task: { state: 'Submitted' }
            });
            msg2Id = res.messageId;

            const trans = await MailboxService.transitionTask({ taskId: msg2Id, newState: 'Canceled' });
            expect(trans.success).toBe(true);
            expect(trans.task.state).toBe('Canceled');
        });

        // Test Failed by Assignee
        let msg3Id;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task3', body: 'body',
                task: { state: 'Submitted' }
            });
            msg3Id = res.messageId;
        });
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await MailboxService.transitionTask({ taskId: msg3Id, newState: 'Working' });
            const trans = await MailboxService.transitionTask({ taskId: msg3Id, newState: 'Failed' });
            expect(trans.success).toBe(true);
            expect(trans.task.state).toBe('Failed');
        });
    });

    test('Unauthorized transition attempts throw errors', async () => {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to  : '@bob', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Alice (Originator) cannot transition Submitted -> Working
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Working' }))
                .rejects.toThrow(/Unauthorized: @alice as originator cannot transition/);
        });

        // Bob (Assignee) cannot transition Submitted -> Canceled
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Canceled' }))
                .rejects.toThrow(/Unauthorized: @bob as assignee cannot transition/);
        });

        // Charlie (Unrelated) cannot transition anything
        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Working' }))
                .rejects.toThrow(/Unauthorized: @charlie is neither originator nor assignee/);
        });

        expect(readTaskEvents(msgId)).toEqual([]);
    });

    test('expected-state mismatches disclose stored Task data only to authorized participants', async () => {
        let directId, ownerlessBroadcastId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            directId = (await MailboxService.addMessage({
                to  : '@bob', subject: 'mismatch privacy', body: 'body',
                task: {state: 'Submitted', metadata: {privateMarker: 'participant-only'}}
            })).messageId;
            ownerlessBroadcastId = (await MailboxService.addMessage({
                to  : 'AGENT:*', subject: 'legacy ownerless mismatch', body: 'body',
                task: {state: 'Working', metadata: {privateMarker: 'owner-unknown'}}
            })).messageId;
        });

        await RequestContextService.run({agentIdentityNodeId: '@charlie'}, async () => {
            await expect(MailboxService.transitionTask({
                taskId: directId, newState: 'Working', expectedCurrentState: 'Working'
            })).rejects.toThrow(/Unauthorized: @charlie is neither originator nor assignee/);
        });

        GraphService.db.storage.db.prepare(`
            UPDATE Nodes
            SET data = json_remove(data, '$.properties.taskAssignmentAuthority')
            WHERE id = ?
        `).run(ownerlessBroadcastId);
        clearTaskCacheWithoutStorageMutation();

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(MailboxService.transitionTask({
                taskId              : ownerlessBroadcastId,
                newState            : 'Completed',
                expectedCurrentState: 'Submitted'
            })).rejects.toThrow(/owner.*unknown|unknown.*owner/i);
        });
    });

    test('ambiguous Task routing fails closed before participant or state evaluation', async () => {
        let hybridId, multiOriginId;

        await RequestContextService.run({agentIdentityNodeId: '@alice'}, async () => {
            hybridId = (await MailboxService.addMessage({
                to: 'AGENT:*', subject: 'hybrid route', body: 'body', task: {state: 'Submitted'}
            })).messageId;
            multiOriginId = (await MailboxService.addMessage({
                to: '@bob', subject: 'multiple origins', body: 'body', task: {state: 'Submitted'}
            })).messageId;
        });

        GraphService.linkNodes(hybridId, '@bob', 'SENT_TO', 1);
        GraphService.linkNodes(multiOriginId, '@charlie', 'SENT_BY', 1);

        await RequestContextService.run({agentIdentityNodeId: '@bob'}, async () => {
            await expect(MailboxService.transitionTask({taskId: hybridId, newState: 'Working'}))
                .rejects.toThrow(/ambiguous recipients/);
            await expect(MailboxService.transitionTask({taskId: multiOriginId, newState: 'Working'}))
                .rejects.toThrow(/ambiguous originators/);
        });

        expect(readTaskEvents(hybridId)).toEqual([]);
        expect(readTaskEvents(multiOriginId)).toEqual([]);
    });

    test('claim-and-lock keeps later claim attempts bound to the persisted winner', async () => {
        let msgId;
        // Broadcast task -> ANY agent could potentially be assignee
        await RequestContextService.run({ agentIdentityNodeId: '@alice' }, async () => {
            const res = await MailboxService.addMessage({
                to  : 'AGENT:*', subject: 'task', body: 'body',
                task: { state: 'Submitted' }
            });
            msgId = res.messageId;
        });

        // Bob claims it
        await RequestContextService.run({ agentIdentityNodeId: '@bob' }, async () => {
            const resBob = await MailboxService.transitionTask({ taskId: msgId, newState: 'Working' });
            expect(resBob.success).toBe(true);
        });

        await RequestContextService.run({ agentIdentityNodeId: '@charlie' }, async () => {
            await expect(MailboxService.transitionTask({ taskId: msgId, newState: 'Working' }))
                .rejects.toThrow(/Unauthorized: @charlie is neither originator nor assignee/);
        });

        expect(readStoredTask(msgId).task).toMatchObject({state: 'Working', assignee: '@bob'});
    });
});

/**
 * TTL/Expired sweeper — cron-driven stale-task transition to Expired state.
 *
 * Maintenance-role bulk operation that complements the agent-flow `transitionTask` from
 * Tests the atomic `UPDATE-WHERE` semantics, idempotency, opt-in `expiresAt`
 * gating, terminal-state preservation, and bulk multi-state transition.
 */
test.describe('Neo.ai.services.memory-core.MailboxService — TTL Sweeper (#10339)', () => {
    test.describe.configure({ mode: 'serial' });
    let MailboxService, GraphService, PermissionService, LifecycleService, mailboxAiConfig, originalAutoSave;

    test.beforeAll(async () => {

        GraphService      = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        MailboxService    = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        PermissionService = (await import('../../../../../../ai/services/memory-core/PermissionService.mjs')).default;
        LifecycleService  = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        mailboxAiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }
        originalAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = true;
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager();
        GraphService.db.autoSave = originalAutoSave;
    });

    test.beforeEach(async () => {
        // Defensive: prior describe may have left autoSave false. Without it, upsertNode
        // mutations don't propagate to SQLite synchronously and downstream FK checks fail.
        GraphService.db.autoSave = true;

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
            }
        }

        // Seed identities under a TTL-suite-local prefix so cross-describe interleaving
        // (Playwright `fullyParallel` interleaves across files even with `mode: 'serial'`
        // per memory `feedback_symmetric_spec_cleanup`) cannot corrupt this suite's seeds.
        // Sweep itself bypasses RBAC; we only need identities for `addMessage` to attach
            // SENT_BY/SENT_TO edges. Default policy is `'open'` outside the strict-isolation pin window,
        // so no `CAN_REPLY_TO` grants are required.
        GraphService.upsertNode({ id: '@ttl-alice', type: 'AgentIdentity', name: 'TTL-Alice', properties: {accountType: 'agent'} });
        GraphService.upsertNode({ id: '@ttl-bob',   type: 'AgentIdentity', name: 'TTL-Bob',   properties: {accountType: 'agent'} });
    });

    /**
     * Helper: seed a task with a chosen state and expiresAt via addMessage. Returns msgId.
     */
    async function seedTask({ from = '@ttl-alice', to = '@ttl-bob', state, expiresAt }) {
        let msgId;
        await RequestContextService.run({ agentIdentityNodeId: from }, async () => {
            const task = { state };
            if (expiresAt !== undefined) task.expiresAt = expiresAt;
            const res = await MailboxService.addMessage({
                to, subject: `t-${state}-${Math.random().toString(36).slice(2,7)}`, body: 'body', task
            });
            msgId = res.messageId;
        });
        return msgId;
    }

    test('sweep transitions Submitted/Working/InputRequired tasks past expiresAt to Expired with typed events (#15114)', async () => {
        const past            = '2020-01-01T00:00:00Z';
        const submittedId     = await seedTask({ state: 'Submitted',     expiresAt: past });
        const workingId       = await seedTask({ state: 'Working',       expiresAt: past });
        const inputRequiredId = await seedTask({ state: 'InputRequired', expiresAt: past });

        // Sanity: seeds visible in cache pre-sweep, with proper task envelope. Diagnostic
        // assertions catch cross-spec contamination (e.g., agent identity nodes leaking
        // into the SQLite store) where our seed addMessage calls would silently fail and
        // leave msgIds undefined.
        expect(submittedId).toMatch(/^MESSAGE:/);
        const submittedSqlite = GraphService.db.storage.db.prepare(
            `SELECT json_extract(data, '$.properties.task.state') as state,
                    json_extract(data, '$.properties.task.expiresAt') as expiresAt
             FROM Nodes WHERE id = ?`
        ).get(submittedId);
        expect(submittedSqlite.state).toBe('Submitted');
        expect(submittedSqlite.expiresAt).toBe(past);

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.success).toBe(true);
        expect(result.sweptCount).toBe(3);

        for (const id of [submittedId, workingId, inputRequiredId]) {
            const node = GraphService.db.nodes.get(id);
            expect(node).toBeTruthy();
            expect(node.properties.task.state).toBe('Expired');
            expect(node.properties.lastModifiedAt).toBeTruthy();
        }

        const events = GraphService.db.storage.db.prepare(`
            SELECT entity_id, event_id, event_payload
            FROM GraphLog
            WHERE entity_type = 'task_state_changed'
            ORDER BY log_id ASC
        `).all().map(row => ({...row, event_payload: JSON.parse(row.event_payload)}));

        expect(events).toHaveLength(3);
        expect(new Set(events.map(event => event.event_id)).size).toBe(3);
        expect(events.map(event => event.event_payload.previousState).sort())
            .toEqual(['InputRequired', 'Submitted', 'Working']);
        for (const event of events) {
            expect(event.event_payload).toMatchObject({
                schemaVersion      : 'task-state-change.v1',
                taskId             : event.entity_id,
                newState           : 'Expired',
                originator         : '@ttl-alice',
                assignee           : '@ttl-bob',
                assignmentAuthority: 'memory-core.v1'
            });
            expect(event.event_payload.lastModifiedAt).toBeTruthy();
        }
    });

    test('sweep skips tasks without expiresAt (TTL is opt-in)', async () => {
        const noTtlId = await seedTask({ state: 'Submitted' });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);
        const node = GraphService.db.nodes.get(noTtlId);
        expect(node.properties.task.state).toBe('Submitted');
    });

    test('sweep skips tasks with future expiresAt', async () => {
        const futureId = await seedTask({ state: 'Submitted', expiresAt: '2099-12-31T23:59:59Z' });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);
        const node = GraphService.db.nodes.get(futureId);
        expect(node.properties.task.state).toBe('Submitted');
    });

    test('sweep skips already-terminal tasks (idempotent across terminal states)', async () => {
        const past = '2020-01-01T00:00:00Z';
        // Each terminal state. Even if expiresAt is past, terminal tasks must not be re-swept.
        const completedId = await seedTask({ state: 'Completed', expiresAt: past });
        const canceledId  = await seedTask({ state: 'Canceled',  expiresAt: past });
        const failedId    = await seedTask({ state: 'Failed',    expiresAt: past });
        const expiredId   = await seedTask({ state: 'Expired',   expiresAt: past });

        const result = await MailboxService.sweepExpiredTasks();

        expect(result.sweptCount).toBe(0);

        const completedNode = GraphService.db.nodes.get(completedId);
        const canceledNode  = GraphService.db.nodes.get(canceledId);
        const failedNode    = GraphService.db.nodes.get(failedId);
        const expiredNode   = GraphService.db.nodes.get(expiredId);

        expect(completedNode.properties.task.state).toBe('Completed');
        expect(canceledNode.properties.task.state).toBe('Canceled');
        expect(failedNode.properties.task.state).toBe('Failed');
        expect(expiredNode.properties.task.state).toBe('Expired');
    });

    test('sweep is idempotent across consecutive cycles', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

        const first = await MailboxService.sweepExpiredTasks();
        expect(first.sweptCount).toBe(1);

        // Second cycle — task is already Expired; no further work
        const second = await MailboxService.sweepExpiredTasks();
        expect(second.sweptCount).toBe(0);
        expect(GraphService.db.storage.db.prepare(`
            SELECT COUNT(*) AS count FROM GraphLog
            WHERE entity_id = ? AND entity_type = 'task_state_changed'
        `).get(id).count).toBe(1);

        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
    });

    test('sweep updates lastModifiedAt atomically with state', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

        const before = new Date().toISOString();
        const result = await MailboxService.sweepExpiredTasks();
        const after  = new Date().toISOString();

        expect(result.sweptCount).toBe(1);

        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
        expect(node.properties.lastModifiedAt).toBeTruthy();
        // lastModifiedAt MUST sit between the test boundaries — proves it was updated
        // by THIS sweep cycle, not seeded from addMessage (which has no lastModifiedAt).
        expect(node.properties.lastModifiedAt >= before).toBe(true);
        expect(node.properties.lastModifiedAt <= after).toBe(true);
    });

    test('sweep preserves a claimed broadcast winner and advances its transition clock', async () => {
        const id = await seedTask({
            to       : 'AGENT:*',
            state    : 'Submitted',
            expiresAt: '2020-01-01T00:00:00Z'
        });

        await RequestContextService.run({agentIdentityNodeId: '@ttl-bob'}, () =>
            MailboxService.transitionTask({taskId: id, newState: 'Working'})
        );

        const oldClock = '2000-01-01T00:00:00.000Z';
        GraphService.db.storage.db.prepare(`
            UPDATE Nodes
            SET data = json_set(data, '$.properties.lastModifiedAt', ?)
            WHERE id = ?
        `).run(oldClock, id);

        const result = await MailboxService.sweepExpiredTasks();
        const row    = GraphService.db.storage.db.prepare(`
            SELECT
                json_extract(data, '$.properties.task.state')               AS state,
                json_extract(data, '$.properties.task.assignee')            AS assignee,
                json_extract(data, '$.properties.taskAssignmentAuthority')   AS taskAssignmentAuthority,
                json_extract(data, '$.properties.lastModifiedAt')            AS lastModifiedAt
            FROM Nodes
            WHERE id = ?
        `).get(id);

        expect(result.sweptCount).toBe(1);
        expect(row).toMatchObject({
            state                  : 'Expired',
            assignee               : '@ttl-bob',
            taskAssignmentAuthority: 'memory-core.v1'
        });
        expect(row.lastModifiedAt).not.toBe(oldClock);
        expect(GraphService.db.nodes.get(id).properties.task.assignee).toBe('@ttl-bob');
        expect(GraphService.db.nodes.get(id).properties.taskAssignmentAuthority).toBe('memory-core.v1');
        expect(GraphService.db.nodes.get(id).properties.lastModifiedAt).toBe(row.lastModifiedAt);
    });

    test('sweep does not require an identity context (maintenance role bypasses RBAC)', async () => {
        const past = '2020-01-01T00:00:00Z';
        const id   = await seedTask({ state: 'Submitted', expiresAt: past });

        // Run sweep WITHOUT a RequestContextService.run wrapper — proves identity binding
        // is not consulted. Mirrors the cron-process invocation (no MCP request context).
        const result = await MailboxService.sweepExpiredTasks();

        expect(result.success).toBe(true);
        expect(result.sweptCount).toBe(1);
        const node = GraphService.db.nodes.get(id);
        expect(node.properties.task.state).toBe('Expired');
    });

    test('sweep handles mixed cohort — terminal + active + opt-in/out + future expiresAt', async () => {
        const past   = '2020-01-01T00:00:00Z';
        const future = '2099-12-31T23:59:59Z';

        const expiredCandidate = await seedTask({ state: 'Working',  expiresAt: past   });
        const futureCandidate  = await seedTask({ state: 'Working',  expiresAt: future });
        const noTtl            = await seedTask({ state: 'Working' });
        const alreadyTerminal  = await seedTask({ state: 'Completed', expiresAt: past  });

        const result = await MailboxService.sweepExpiredTasks();

        // Only the expiredCandidate matches all WHERE clauses
        expect(result.sweptCount).toBe(1);
        expect(GraphService.db.nodes.get(expiredCandidate).properties.task.state).toBe('Expired');
        expect(GraphService.db.nodes.get(futureCandidate).properties.task.state).toBe('Working');
        expect(GraphService.db.nodes.get(noTtl).properties.task.state).toBe('Working');
        expect(GraphService.db.nodes.get(alreadyTerminal).properties.task.state).toBe('Completed');
    });
});
