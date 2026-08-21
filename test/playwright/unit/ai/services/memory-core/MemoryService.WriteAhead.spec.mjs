import {setup} from '../../../../setup.mjs';

const appName = 'MemoryWriteAheadTest';

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

import {test, expect}                                from '@playwright/test';
import Neo                                           from '../../../../../../src/Neo.mjs';
import logger                                        from '../../../../../../ai/mcp/server/memory-core/logger.mjs';
import RequestContextService                         from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';
import {appendWalEmbedMarker, readPendingWalRecords} from '../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';
import {drainMemoryWal}                              from './util.mjs';
import {getProviderActivityContext}                  from '../../../../../../ai/services/shared/providerActivityLedger.mjs';

/**
 * add_memory never-fail write path (write-ahead decouple) — falsifier coverage:
 *
 *   AC1 validation gate — empty/whitespace fields are rejected BEFORE any write.
 *   AC2 never-fail      — the write path never touches the content store at all (the embed
 *                         daemon owns the drain), so a down OR hung store can neither fail nor
 *                         stall the tool; the payload is durable in the WAL (pending) either way.
 *   AC3 recency         — graph projection is derived/fail-soft: a just-written turn is immediately
 *                         visible to query_recent_turns through the WAL pending-overlay even when
 *                         graph projection has not caught up, and that overlay serves content for
 *                         BOTH detail levels.
 *   Graph backstop      — graph-pending WAL records have a hosted re-drive path after process
 *                         restart or exhausted in-process retries; embed reconciliation alone does
 *                         not hide graph-pending work.
 *   Drain reconcile     — the daemon drain path (`drainWalOnce` via the `drainMemoryWal` spec
 *                         helper) embeds pending records and marks them reconciled, and never
 *                         re-embeds a purge-tombstoned record.
 *
 * Test isolation by construction: UNIT_TEST_MODE resolves memoryWal.dir → a per-worker-unique
 * temp directory and the graph → ':memory:'; the shared AiConfig singleton is never mutated
 * (the shared-singleton write ban). The spec reads the RESOLVED `memoryWal.dir` leaf from the same config instance
 * the service reads (assertion-targeting only) — pinning a different dir via env is worker-order
 * dependent, because another spec in the worker may construct the singleton first.
 */
let MEMORY_ACCEPTED_MESSAGE;

test.describe('Neo.ai.services.memory-core.MemoryService.writeAhead', () => {
    test.describe.configure({mode: 'serial'});

    let MemoryService, GraphService, LifecycleService, TextEmbeddingService, TurnPresenceService, StorageRouter,
        originalGetMemoryCollection, originalEmbedText, memStore, collectionMode, collectionTouches,
        testPlaneId, testWalDir;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        testWalDir     = aiConfig.memoryWal.dir;
        testPlaneId    = aiConfig.plane.id;

        GraphService         = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        ({default: MemoryService, MEMORY_ACCEPTED_MESSAGE} =
            await import('../../../../../../ai/services/memory-core/MemoryService.mjs'));
        LifecycleService     = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        TurnPresenceService  = (await import('../../../../../../ai/services/memory-core/TurnPresenceService.mjs')).default;
        StorageRouter        = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;

        // Controllable content-store fake: 'ok' embeds into an in-memory map, 'throw' fails the
        // embed, 'hang' never resolves — the two failure shapes AC2 pins (error AND stall).
        // `collectionTouches` counts resolution attempts: AC2's strongest form is that the write
        // path performs ZERO of them (the embed daemon is the only collection consumer).
        memStore                    = new Map();
        collectionMode              = 'ok';
        collectionTouches           = 0;
        originalGetMemoryCollection = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => {
            collectionTouches++;
            if (collectionMode === 'throw') throw new Error('chroma down (spec)');
            if (collectionMode === 'hang')  return new Promise(() => {}); // never settles
            return {
                add: async ({ids = [], metadatas = []} = {}) => { ids.forEach((id, i) => memStore.set(id, metadatas[i] || {})); },
                get: async ({ids = []} = {}) => {
                    const found = ids.filter(id => memStore.has(id));
                    return {ids: found, metadatas: found.map(id => memStore.get(id))};
                }
            };
        };

        if (!LifecycleService._initPromise) {
            await LifecycleService.initAsync();
        } else {
            await LifecycleService.ready();
        }

        // Offline tests cannot hit a real embedder; restored in afterAll so the stub never leaks
        // into sibling specs sharing the worker.
        originalEmbedText              = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        GraphService.upsertNode({id: '@agent-wal', type: 'AgentIdentity', name: 'AgentWal', properties: {}});
    });

    test.afterAll(async () => {
        if (originalGetMemoryCollection) StorageRouter.getMemoryCollection = originalGetMemoryCollection;
        if (originalEmbedText)           TextEmbeddingService.embedText     = originalEmbedText;
        const {cleanupChromaManager} = await import('./util.mjs');
        await cleanupChromaManager();
        // No rm of testWalDir: it is the per-worker config-resolved temp dir, shared with sibling
        // specs in the same worker process; the OS temp root reclaims it.
    });

    const asTenant = fn => RequestContextService.run({userId: 'tenant-wal', agentIdentityNodeId: '@agent-wal'}, fn);

    test('AC1: empty/whitespace fields are rejected before any write', async () => {
        const before = (await readPendingWalRecords({dir: testWalDir})).length;

        const result = await asTenant(() => MemoryService.addMemory({prompt: '', thought: '   ', response: 'real'}));

        expect(result.code).toBe('MEMORY_VALIDATION_ERROR');
        expect(result.message).toContain('prompt');
        expect(result.message).toContain('thought');
        expect(result.message).not.toContain('response');

        // Rejected payloads must not reach the WAL (nor, transitively, the embed path).
        expect((await readPendingWalRecords({dir: testWalDir})).length).toBe(before);
    });

    test('the response distinguishes ACCEPTED from QUERYABLE, and reports a measured backlog', async () => {
        // The disclosure the write path previously omitted. `message: "Memory successfully added"` was
        // true about acceptance and read as queryability, so an immediate read-back returning nothing
        // read as data loss — which on a live deployment cost three sessions and wrote a phantom
        // outage into the corpus as durable history.
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'visibility prompt', thought: 'visibility thought', response: 'visibility response'
        }));

        // Durable AND not-yet-SEMANTICALLY-queryable, stated as separate facts rather than one word.
        expect(result.id).toBeTruthy();
        expect(result.error).toBeUndefined();
        expect(result.visibility.semanticQueryable).toBe(false);
        expect(result.visibility.state).toBe('embed-deferred');
        expect(result.visibility.thisWritePending).toBe(true);

        // The axis that must NOT be understated. `query_recent_turns` is served by the WAL overlay, so
        // it returns this write now — the sibling `AC3` test below proves that end-to-end with the
        // embed down. An unqualified "not queryable" would steer a caller away from the one read that
        // works, trading the phantom-data-loss conclusion for its mirror image.
        expect(result.visibility.recencyQueryable).toBe(true);

        // The signal must be ACTIONABLE, not a prose caveat: a depth a caller can branch on, and one
        // that counts this write, so a fresh write is never reported as 0 pending.
        expect(result.visibility.pendingDrainDepth).toBeGreaterThan(0);
        expect(typeof result.visibility.oldestPendingAgeMs).toBe('number');

        const [acceptedRecord] = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});

        expect(acceptedRecord.planeId).toBe(testPlaneId);

        // It must not swing the other way either — the write IS durable, so nothing in the response
        // may read as failure or partial success.
        expect(result.message).not.toMatch(/fail|error|partial|lost|unsaved/i);

        // No fabricated ETA. There is no drain cadence to derive one from, and a plausible number with
        // nothing behind it is the exact class of value this disclosure exists to remove.
        expect(result.visibility.expectedVisibleBy).toBeUndefined();

        // The caveat has to steer AWAY from the retry, because retrying was the observed behaviour and
        // it duplicates the memory without making the first copy visible sooner.
        expect(result.visibility.hint).toMatch(/retry/i);
    });

    test('accepted and queryable cannot collapse back into one boolean', async () => {
        // Refactor guard, per the AC. The failure this protects is subtle: someone folds `visibility`
        // into `message`, or makes `queryable` mirror the save's success, and the response silently
        // returns to answering the wrong question while every other test stays green.
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'collapse prompt', thought: 'collapse thought', response: 'collapse response'
        }));

        // Independent per-axis fields. A single boolean cannot express "durable, recency-readable now,
        // semantically searchable later" — and the axes must disagree here, which is the whole point.
        expect(result.visibility).toBeTruthy();
        expect(result.visibility.semanticQueryable).toBe(false);
        expect(result.visibility.recencyQueryable).toBe(true);
        expect(result.id).toBeTruthy();

        // The collapse guard proper: no field may be a bare `queryable` again. That name is what made
        // the previous revision assert something false about `query_recent_turns`, so its reappearance
        // is the regression signal.
        expect(result.visibility.queryable).toBeUndefined();

        // POSITIVE CONTROL on the drain surface: with writes pending it must NOT claim everything is
        // searchable. Without this, `allWritesSemanticallyQueryable` could be hardcoded true and the
        // poll a caller is told to trust would confirm visibility that does not exist.
        const drain = await MemoryService.describeDrainState();

        expect(drain.observable).toBe(true);
        expect(drain.state).toBe('pending');
        expect(drain.stallThresholdMs).toBeGreaterThan(0);
        expect(drain.pendingDrainDepth).toBeGreaterThan(0);
        expect(drain.allWritesSemanticallyQueryable).toBe(false);
    });

    test('RA2: when the embed marker lands BEFORE the disclosure is read, the envelope says reconciled', async () => {
        // The race the previous revision could not express. `queryable` and `state` were hard-coded, so
        // a write whose embed marker had already landed still reported `state: 'deferred'` alongside
        // `pendingDrainDepth: 0` and `thisWritePending: false` — three fields describing two
        // incompatible worlds. Euclid's exact-head probe reproduced it directly.
        //
        // This drives `describeWriteVisibility` on an ALREADY-MARKED record, so a hard-coded
        // deferral fails here while a marker-derived one passes.
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'race prompt', thought: 'race thought', response: 'race response'
        }));

        expect(result.visibility.state).toBe('embed-deferred');

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});

        expect(pending).toHaveLength(1);

        // Mark it exactly as the embed daemon would, then re-read the SAME disclosure.
        await appendWalEmbedMarker(
            {id: result.id, segmentKey: pending[0].segmentKey, embeddedAt: new Date().toISOString()},
            {dir: testWalDir}
        );

        const after = await MemoryService.describeWriteVisibility({
            memoryId  : result.id,
            walDir    : testWalDir,
            segmentKey: pending[0].segmentKey
        });

        // Derived, and internally consistent: nothing may claim deferral while the marker exists.
        expect(after.semanticQueryable).toBe(true);
        expect(after.state).toBe('reconciled');
        expect(after.thisWritePending).toBe(false);
        expect(after.recencyQueryable).toBe(true);

        // The coherence invariant stated directly, so any future field added to this envelope has to
        // respect it rather than merely happening to.
        expect(after.semanticQueryable).toBe(!after.thisWritePending);
    });

    test('RA2: semanticQueryable is derived from a marker read, NOT from absence in the pending set', async () => {
        // Fail-open guard. `pending.some(r => r.id === X)` is false both when X reconciled AND when X
        // is not in the WAL at all, so deriving "your write is searchable" from that absence would
        // report an UNOBSERVED record as reconciled. An id that was never written is the cheapest
        // probe for that: it is absent from the pending set, and must NOT come back queryable.
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'derive prompt', thought: 'derive thought', response: 'derive response'
        }));

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});

        expect(pending).toHaveLength(1);

        const phantom = await MemoryService.describeWriteVisibility({
            memoryId  : 'MEMORY:never-written-phantom-id',
            walDir    : testWalDir,
            segmentKey: pending[0].segmentKey
        });

        // Absence must read as "not reconciled", never as "reconciled".
        expect(phantom.semanticQueryable).toBe(false);
        expect(phantom.state).toBe('embed-deferred');
    });

    test('AC2: a DOWN content store cannot fail the save — the write path never touches it', async () => {
        collectionMode = 'throw';
        const touchesBefore = collectionTouches;

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'embed-down prompt', thought: 'embed-down thought', response: 'embed-down response'
        }));

        expect(result.code).toBeUndefined();
        expect(result.error).toBeUndefined();
        expect(result.id).toBeTruthy();
        expect(result.message).toBe(MEMORY_ACCEPTED_MESSAGE);

        // The response-side budget disclosure: every accepted save self-reports where its
        // response time went, so a slow save is its own diagnosis record instead of a bare
        // transport timeout. `presenceTerminal` is CLOSED over completed | deferred | failed.
        expect(result.stageTimings).toBeTruthy();
        expect(typeof result.stageTimings.walMs).toBe('number');
        expect(result.mailbox).toBeNull();
        expect(result.stageTimings.mailboxMs).toBeNull();
        expect(result.stageTimings.mailboxTerminal).toBe('omitted');
        expect(result.stageTimings.mailboxReason).toBe('synchronous-query-outside-accepted-write-contract');
        expect(typeof result.stageTimings.visibilityMs).toBe('number');
        expect(typeof result.stageTimings.postWalMs).toBe('number');
        expect(result.stageTimings.postWalBudgetMs).toBe(1_000);
        expect(['completed', 'deferred', 'failed']).toContain(result.stageTimings.presenceTerminal);

        // Strongest form of never-fail: addMemory performed ZERO collection resolutions —
        // the embed daemon is the only consumer of the content store on the memory write side.
        expect(collectionTouches).toBe(touchesBefore);

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);
        expect(pending[0].metadata.prompt).toBe('embed-down prompt');

        collectionMode = 'ok';
    });

    test('AC4: hung post-WAL disclosures return within one budget and never execute the synchronous mailbox CTE', async () => {
        const originalPresence   = TurnPresenceService.recordTurnPresence;
        const originalVisibility = MemoryService.describeWriteVisibility;
        const sqlite             = GraphService.db.storage.db;
        const originalPrepare    = sqlite.prepare;
        let mailboxQueryAttempts = 0;

        // This is a production-path tripwire, not a source-string assertion. Restoring
        // `buildMailboxDelta()` to addMemory reaches this exact better-sqlite3 producer and makes
        // the test red even though that helper catches its own query error and returns `null`.
        sqlite.prepare = function(sql, ...args) {
            if (/\bWITH\s+unread_messages\s+AS\b/i.test(String(sql))) {
                mailboxQueryAttempts++;
                throw new Error('synchronous mailbox query reached the accepted-write response');
            }

            return originalPrepare.call(this, sql, ...args);
        };
        TurnPresenceService.recordTurnPresence = () => new Promise(() => {});
        MemoryService.describeWriteVisibility  = () => new Promise(() => {});

        const startedAt = Date.now();

        try {
            const result  = await asTenant(() => MemoryService.addMemory({
                prompt  : 'bounded response prompt',
                thought : 'bounded response thought',
                response: 'bounded response result'
            }));
            const elapsed = Date.now() - startedAt;

            expect(result.id).toBeTruthy();
            expect(result.mailbox).toBeNull();
            expect(result.stageTimings.mailboxMs).toBeNull();
            expect(result.stageTimings.mailboxTerminal).toBe('omitted');
            expect(result.stageTimings.mailboxReason).toBe('synchronous-query-outside-accepted-write-contract');
            expect(result.stageTimings.presenceTerminal).toBe('deferred');
            expect(result.visibility).toMatchObject({
                recencyQueryable : true,
                semanticQueryable: null,
                state            : 'embed-state-unavailable',
                pendingDrainDepth: null,
                thisWritePending : null
            });
            expect(result.stageTimings.postWalBudgetMs).toBe(1_000);
            expect(result.stageTimings.postWalMs).toBeLessThanOrEqual(result.stageTimings.postWalBudgetMs);
            expect(elapsed).toBeLessThan(1_500);
            expect(mailboxQueryAttempts).toBe(0);
        } finally {
            sqlite.prepare                           = originalPrepare;
            TurnPresenceService.recordTurnPresence = originalPresence;
            MemoryService.describeWriteVisibility  = originalVisibility;
        }
    });

    test('#17342: a failed presence terminal carries a sanitized reason, not a bare constant', async () => {
        const originalPresence = TurnPresenceService.recordTurnPresence;

        // A realistic shape for this defect class: the throw carries a credential-looking token and
        // ragged whitespace, so the arm exercises the reduction rather than a tidy string.
        TurnPresenceService.recordTurnPresence = () => Promise.reject(
            new Error('presence write rejected\n\n  token=ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII   mid-work')
        );

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt  : 'failed presence prompt',
                thought : 'failed presence thought',
                response: 'failed presence result'
            }));

            expect(result.stageTimings.presenceTerminal).toBe('failed');

            const reason = result.stageTimings.presenceReason;

            expect(reason).toBeTruthy();
            expect(reason).toContain('presence write rejected');
            // collapsed, bounded, and the credential family masked — the whole point is that this
            // field can be read by an operator without becoming a leak.
            expect(reason).not.toMatch(/\s{2,}/);
            expect(reason.length).toBeLessThanOrEqual(240);
            expect(reason).not.toContain('ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIII');
        } finally {
            TurnPresenceService.recordTurnPresence = originalPresence;
        }
    });

    test('#17342 CONTROL: a completed presence terminal carries NO reason', async () => {
        // Without this pair the arm above is satisfied by a build that attaches a reason to every
        // save, which would make the field useless as a signal.
        const result = await asTenant(() => MemoryService.addMemory({
            prompt  : 'completed presence prompt',
            thought : 'completed presence thought',
            response: 'completed presence result'
        }));

        expect(result.stageTimings.presenceTerminal).toBe('completed');
        expect(result.stageTimings.presenceReason ?? null).toBeNull();
    });

    test('AC4: a presence rejection after the local deadline is handled exactly once', async () => {
        const originalPresence = TurnPresenceService.recordTurnPresence;
        const originalWarn     = logger.warn;
        const warnings         = [];
        const unhandled        = [];
        let rejectPresence;

        TurnPresenceService.recordTurnPresence = () => new Promise((resolve, reject) => {
            rejectPresence = reject;
        });
        logger.warn = (...args) => warnings.push(args.map(String).join(' '));

        const onUnhandled = error => unhandled.push(error);
        process.on('unhandledRejection', onUnhandled);

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt  : 'late presence prompt',
                thought : 'late presence thought',
                response: 'late presence result'
            }));

            expect(result.stageTimings.presenceTerminal).toBe('deferred');

            rejectPresence(new Error('late presence rejection (spec)'));
            await new Promise(resolve => setImmediate(() => setImmediate(resolve)));

            expect(unhandled).toEqual([]);
            expect(warnings.filter(line => line.includes('Late turn-presence terminal failed'))).toHaveLength(1);
        } finally {
            process.removeListener('unhandledRejection', onUnhandled);
            TurnPresenceService.recordTurnPresence = originalPresence;
            logger.warn                             = originalWarn;
        }
    });

    test('AC2: a HUNG content store cannot stall the save — nothing on the write path awaits it', async () => {
        collectionMode = 'hang';
        const touchesBefore = collectionTouches;

        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'hang prompt', thought: 'hang thought', response: 'hang response'
        }));
        // Reaching these assertions at all proves nothing on the write path awaited the hung
        // collection promise — and the touch counter proves it was never even resolved.
        expect(result.id).toBeTruthy();
        expect(result.error).toBeUndefined();
        expect(collectionTouches).toBe(touchesBefore);

        collectionMode = 'ok';
    });

    test('AC3: graph projection failure cannot fail the save and recency uses the pending WAL overlay', async () => {
        const originalUpsertNode   = GraphService.upsertNode;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        GraphService.upsertNode       = () => { throw new Error('graph down (spec)'); };
        MemoryService.buildMiniSummary = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'graph-down prompt', thought: 'graph-down thought', response: 'graph-down response'
            }));

            expect(result.code).toBeUndefined();
            expect(result.error).toBeUndefined();
            expect(result.id).toBeTruthy();
            expect(result.message).toBe(MEMORY_ACCEPTED_MESSAGE);

            // Let the scheduled projection attempt run and fail under the stub. The failure must
            // stay logged/fail-soft, not turn into a rejected add_memory result or unhandled throw.
            await new Promise(resolve => setImmediate(resolve));

            const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
            expect(pending).toHaveLength(1);

            const recent = await asTenant(() => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 1, detail: 'full', projection: 'private'}));

            expect(recent.count).toBe(1);
            expect(recent.turns[0].id).toBe(result.id);
            expect(recent.turns[0].projectionPending).toBe(true);
            expect(recent.turns[0].prompt).toBe('graph-down prompt');
            expect(recent.turns[0].response).toBe('graph-down response');
            expect(recent.turns[0].thought).toBe('graph-down thought');
        } finally {
            GraphService.upsertNode        = originalUpsertNode;
            MemoryService.buildMiniSummary = originalBuildSummary;
        }
    });

    test('graph-pending WAL records are re-driven by the hosted graph projection drain', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'graph-drain prompt', thought: 'graph-drain thought', response: 'graph-drain response'
            }));

            expect(result.id).toBeTruthy();

            const graphPendingBefore = await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            });
            expect(graphPendingBefore).toHaveLength(1);

            const embedSummary = await drainMemoryWal({ids: [result.id]});
            expect(embedSummary.embedded).toBe(1);
            expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]}))).toHaveLength(0);

            // Embed reconciliation is deliberately separate from graph reconciliation: an
            // embedded-but-unprojected record must stay visible to the graph drain.
            expect((await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            }))).toHaveLength(1);

            const graphSummary = await MemoryService.drainPendingGraphProjections({ids: [result.id]});

            expect(graphSummary).toEqual({pending: 1, projected: 1, failed: 0});
            expect((await readPendingWalRecords({
                dir       : testWalDir,
                ids       : [result.id],
                markerType: 'graph'
            }))).toHaveLength(0);

            const recent = await asTenant(() => MemoryService.queryRecentTurns({
                agentIdentity: '@me',
                limit        : 20,
                detail       : 'full',
                projection   : 'private'
            }));
            const turn = recent.turns.find(item => item.id === result.id);

            expect(turn).toBeTruthy();
            expect(turn.projectionPending).toBe(false);
            expect(turn.prompt).toBe('graph-drain prompt');
            expect(turn.response).toBe('graph-drain response');
            expect(turn.thought).toBe('graph-drain thought');
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('the AUTHORED_BY provenance edge persists a normalized user_id (#13578)', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;
        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt: 'authored-by prompt', thought: 'authored-by thought', response: 'authored-by response'
            }));
            await MemoryService.drainPendingGraphProjections({ids: [result.id]});

            // The AUTHORED_BY provenance edge for THIS write (source === result.id, not an earlier serial
            // edge): target stays the @-form author identity, but the user_id column is the normalized form.
            const authoredBy = GraphService.db.edges.items.find(e => e.type === 'AUTHORED_BY' && e.source === result.id);
            expect(authoredBy).toBeTruthy();
            expect(authoredBy.target).toBe('@agent-wal');
            expect(authoredBy.properties.userId).toBe('agent-wal');
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('RA1: the newest graph-pending turn stays recency-visible when the segment exceeds the page size', async () => {
        const originalSchedule     = MemoryService._scheduleMemoryGraphProjection;
        const originalBuildSummary = MemoryService.buildMiniSummary;

        // Leave every write graph-pending (never projected), and silence summarization noise.
        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary               = async () => null;

        try {
            const writes = [];

            // Write more turns than the recency page size below, all graph-pending in the same
            // UTC-day segment. A 2ms gap gives each a strictly-increasing timestamp so "newest" is
            // unambiguous under the (timestamp, id) ordering.
            for (let i = 0; i < 5; i++) {
                writes.push(await asTenant(() => MemoryService.addMemory({
                    prompt: `ra1 prompt ${i}`, thought: `ra1 thought ${i}`, response: `ra1 response ${i}`
                })));
                await new Promise(resolve => setTimeout(resolve, 2));
            }

            const newest = writes[writes.length - 1];

            // Page size 3 < 5 pending. A raw read-limit would walk the append-ordered segment and
            // return the OLDEST 3, dropping the newest just-written turn; the recency-eligible bound
            // (sort + slice in queryRecentTurns) must keep it visible and first.
            const recent = await asTenant(() => MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 3}));

            expect(recent.turns.map(turn => turn.id)).toContain(newest.id);
            expect(recent.turns[0].id).toBe(newest.id);
            expect(recent.turns[0].projectionPending).toBe(true);
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });

    test('AC3: with the embed down, a just-written turn is immediately recency-visible and the WAL overlay serves BOTH detail levels', async () => {
        collectionMode = 'throw';

        const {write, summaryResult, fullResult} = await asTenant(async () => {
            const write = await MemoryService.addMemory({
                prompt: 'overlay prompt', thought: 'overlay thought', response: 'overlay response'
            });
            return {
                write,
                summaryResult: await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 20}),
                fullResult   : await MemoryService.queryRecentTurns({agentIdentity: '@me', limit: 20, detail: 'full', projection: 'private'})
            };
        });

        // The row is immediately visible even if graph projection has not caught up yet.
        expect(summaryResult.count).toBeGreaterThan(0);
        // No Chroma content exists yet — the summary fallback comes from the WAL pending-overlay.
        const summaryTurn = summaryResult.turns.find(turn => turn.id === write.id);
        expect(summaryTurn).toBeTruthy();
        expect(summaryTurn.summary).toContain('overlay prompt');
        expect(summaryTurn.summaryFallback).toBe(true);

        // detail:'full' hydration equally falls back to the WAL payload.
        const fullTurn = fullResult.turns.find(turn => turn.id === write.id);
        expect(fullTurn).toBeTruthy();
        expect(fullTurn.prompt).toBe('overlay prompt');
        expect(fullTurn.response).toBe('overlay response');
        expect(fullTurn.thought).toBe('overlay thought');

        collectionMode = 'ok';
    });

    test('purge tombstone: a record tombstoned before the drain is never re-embedded', async () => {
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'purge-race prompt', thought: 'purge-race thought', response: 'purge-race response'
        }));
        expect(result.id).toBeTruthy();

        const pending = await readPendingWalRecords({dir: testWalDir, ids: [result.id]});
        expect(pending).toHaveLength(1);

        // Purge tombstone lands BEFORE any drain runs (mirrors SessionService.purgeSession's
        // tombstone-before-delete ordering): the marker reconciles the record, so the daemon's
        // pending read never surfaces it again.
        await appendWalEmbedMarker({id: result.id, segmentKey: pending[0].segmentKey}, {dir: testWalDir});

        const summary = await drainMemoryWal({ids: [result.id]});

        expect(summary.pending).toBe(0);              // the tombstoned record is not pending work
        expect(memStore.has(result.id)).toBe(false);  // nothing resurrected into the content store
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(0); // reconciled
    });

    test('the daemon drain reconciles a pending record (embedded + marker written)', async () => {
        const result = await asTenant(() => MemoryService.addMemory({
            prompt: 'happy prompt', thought: 'happy thought', response: 'happy response'
        }));

        expect(result.id).toBeTruthy();

        // New write-path contract: addMemory leaves the record PENDING — only the daemon drains.
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(1);

        // One targeted production drain cycle (the exact daemon logic) — deterministic, no polling.
        const summary = await drainMemoryWal({ids: [result.id]});

        expect(summary.embedded).toBe(1);
        expect(memStore.has(result.id)).toBe(true);
        expect((await readPendingWalRecords({dir: testWalDir, ids: [result.id]})).length).toBe(0);
    });

    test('attributes deferred provider work to the WAL drain and mini-summary instead of add_memory', async () => {
        const
            originalSchedule     = MemoryService._scheduleMemoryGraphProjection,
            originalBuildSummary = MemoryService.buildMiniSummary,
            events               = [],
            touchesBefore        = collectionTouches;

        MemoryService._scheduleMemoryGraphProjection = () => {};
        MemoryService.buildMiniSummary = async () => {
            events.push({kind: 'unexpected-inline-summary'});
            return {summary: null, cause: 'unexpected-inline-summary'};
        };

        try {
            const result = await asTenant(() => MemoryService.addMemory({
                prompt  : 'stage prompt',
                thought : 'stage thought',
                response: 'stage response'
            }));

            await new Promise(resolve => setImmediate(resolve));

            expect(result.id).toBeTruthy();
            expect(collectionTouches).toBe(touchesBefore);
            expect(memStore.has(result.id)).toBe(false);
            expect(events).toEqual([]);
            expect(getProviderActivityContext()).toBeNull();

            const drain = await drainMemoryWal({
                ids       : [result.id],
                collection: {
                    add: async ({ids = [], metadatas = []}) => {
                        events.push({kind: 'embedding', ...getProviderActivityContext()});
                        ids.forEach((id, index) => memStore.set(id, metadatas[index] || {}));
                    }
                }
            });

            expect(drain.embedded).toBe(1);
            expect(memStore.has(result.id)).toBe(true);
            expect(events).toEqual([{
                kind          : 'embedding',
                operationStage: 'mc-wal-drain-embedding',
                service       : 'memory-core'
            }]);
            expect(getProviderActivityContext()).toBeNull();

            const summary = await originalBuildSummary.call(MemoryService, {
                prompt    : 'stage prompt',
                response  : 'stage response',
                buildModel: () => ({
                    generateContent: async (providerPrompt, options) => {
                        events.push({
                            kind          : 'chat',
                            operationStage: options.operationStage,
                            priority      : options.priority
                        });
                        return {response: {text: () => 'provider-stage summary'}};
                    }
                })
            });

            expect(summary).toEqual({summary: 'provider-stage summary', cause: null});
            expect(events).toEqual([{
                kind          : 'embedding',
                operationStage: 'mc-wal-drain-embedding',
                service       : 'memory-core'
            }, {
                kind          : 'chat',
                operationStage: 'mc-mini-summary',
                priority      : 'batch'
            }]);
        } finally {
            MemoryService._scheduleMemoryGraphProjection = originalSchedule;
            MemoryService.buildMiniSummary               = originalBuildSummary;
        }
    });
});
