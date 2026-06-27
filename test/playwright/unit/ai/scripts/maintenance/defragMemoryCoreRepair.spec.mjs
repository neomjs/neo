import {test, expect}          from '@playwright/test';
import {mkdtemp, readFile, rm} from 'fs/promises';
import os                      from 'os';
import path                    from 'path';
import {
    anyRepairNonClean,
    applyAutonomousSettlement,
    assertDefragTargetSupported,
    assertNoIncompleteDefragState,
    createUnrecoverablePreview,
    formatMemoryCoreRepairProgress,
    formatUnrecoverablePreview,
    promoteLoadedShadowCollection,
    repairMemoryCoreCollectionViaResumableShadow,
    repairMemoryCoreCollectionsViaFullEnumeration,
    runDefragChromaDBCli,
    writeDefragState
} from '../../../../../../ai/scripts/maintenance/defragChromaDB.mjs';
import AiConfig                     from '../../../../../../ai/mcp/server/memory-core/config.mjs';

/**
 * AC4 — the Memory Core defrag-wiring orchestration: full (uncapped) enumeration ->
 * resumable shadow repair, with fail-loud on unrecoverable rows. The seams
 * (auditFn / extractFn / repairCollectionFn) are injected so the orchestration is verified without a
 * live Chroma store.
 */
test.describe('repairMemoryCoreCollectionsViaFullEnumeration (#14020)', () => {
    const embeddingFunction = {name: 'dummy'},
          embedFn           = async docs => docs.map(() => [0.1, 0.2]);

    function makeSeams({coverage, extractResults = {}, repairResults = {}, client}) {
        const calls = {audit: [], extract: [], repair: [], clearState: [], writeState: []};

        return {
            calls,
            client            : client || {getCollection: async ({name}) => ({_name: name})},
            auditFn           : async args => { calls.audit.push(args);   return coverage; },
            extractFn         : async args => { calls.extract.push(args); return extractResults[args.collection._name]; },
            repairCollectionFn: async args => {
                calls.repair.push(args);
                return repairResults[args.collectionName] || {
                    collectionName: args.collectionName,
                    promotion     : {promoted: args.collectionName},
                    counts        : extractResults[args.collection._name]?.counts || {}
                };
            },
            clearStateFn: async args => { calls.clearState.push(args); },
            writeStateFn: async args => { calls.writeState.push(args); }
        };
    }

    test('full-enumeration audit feeds resumable repair per collection (happy path)', async () => {
        const coverage = {collections: [
                  {name: 'mc-memory', allIds: ['a', 'b', 'c'], missingVectorIds: ['c']},
                  {name: 'mc-graph',  allIds: ['x'],           missingVectorIds: []}
              ]},
              repairResults = {
                  'mc-memory': {collectionName: 'mc-memory', promotion: {promoted: 'mc-memory'}, counts: {total: 3, intact: 2, reEmbedded: 1, unrecoverable: 0}},
                  'mc-graph' : {collectionName: 'mc-graph',  promotion: {promoted: 'mc-graph'},  counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, repairResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory', 'mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: () => {}
        });

        // exactly one enumeration call, uncapped (includeFullIds), over the requested collections
        expect(calls.audit).toHaveLength(1);
        expect(calls.audit[0].includeFullIds).toBe(true);
        expect(calls.audit[0].collectionNames).toEqual(['mc-memory', 'mc-graph']);

        // mutating repair receives the FULL {allIds, missingVectorIds} from the coverage, per collection
        expect(calls.repair.map(c => c.allIds)).toEqual([['a', 'b', 'c'], ['x']]);
        expect(calls.repair.map(c => c.missingVectorIds)).toEqual([['c'], []]);

        // both repaired/promoted through the resumable seam
        expect(calls.repair.map(c => c.collectionName)).toEqual(['mc-memory', 'mc-graph']);
        expect(results).toHaveLength(2);
        expect(results.every(r => r.promotion && !r.aborted)).toBe(true);

        // clean success CLEARS the durable marker (no rerun-poisoning); the aborted marker is never written
        expect(calls.clearState).toEqual([{statePath: '/state'}]);
        expect(calls.writeState).toHaveLength(0);
    });

    test('duplicate collection names select the coverage row matching the live collection id', async () => {
        const coverage = {collections: [
                  {name: 'mc-graph', collectionId: 'stale-id', allIds: ['stale'], missingVectorIds: ['stale']},
                  {name: 'mc-graph', collectionId: 'live-id',  allIds: ['live'],  missingVectorIds: []}
              ]},
              repairResults = {
                  'mc-graph': {collectionName: 'mc-graph', promotion: {promoted: 'mc-graph'}, counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              client = {getCollection: async ({name}) => ({_name: name, id: 'live-id'})},
              {calls, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, repairResults, client});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.repair).toHaveLength(1);
        expect(calls.repair[0].allIds).toEqual(['live']);
        expect(calls.repair[0].missingVectorIds).toEqual([]);
        expect(results[0].promotion).toEqual({promoted: 'mc-graph'});
    });

    test('duplicate collection names fail before extraction when the live collection id cannot be matched', async () => {
        const coverage = {collections: [
                  {name: 'mc-graph', collectionId: 'stale-id', allIds: ['stale'], missingVectorIds: ['stale']},
                  {name: 'mc-graph', collectionId: 'other-id', allIds: ['other'], missingVectorIds: []}
              ]},
              client = {getCollection: async ({name}) => ({_name: name, id: 'live-id'})},
              {calls, auditFn, extractFn, repairCollectionFn} = makeSeams({coverage, client});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, repairCollectionFn, log: () => {}
        })).rejects.toThrow(/none match live collection id 'live-id'/);

        expect(calls.extract).toHaveLength(0);
        expect(calls.repair).toHaveLength(0);
    });

    test('fail-loud: unrecoverable rows abort that collection promotion (no silent drop)', async () => {
        const unrecoverable = [{id: 'b', reason: 'document-empty', message: 'document field was empty'}],
              logs          = [];
        const coverage      = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              repairResults = {
                  'mc-memory': {collectionName: 'mc-memory', aborted: true, shadowName: 'mc-memory-shadow-resume', loadedCount: 1, sourceCount: 2, unrecoverable, counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}}
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, repairResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', stateBase: {targetName: 'memory-core'},
            auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: message => logs.push(message)
        });

        expect(calls.repair).toHaveLength(1);
        expect(results[0].aborted).toBe(true);
        expect(results[0].unrecoverable).toEqual(unrecoverable);
        expect(results[0].counts.unrecoverable).toBe(1);

        // an aborted repair NEVER clears the marker; it rewrites an explicit aborted marker so the next run
        // blocks as DEFRAG_INCOMPLETE_STATE with an accurate diagnostic
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(1);
        expect(calls.writeState[0].statePath).toBe('/state');
        expect(calls.writeState[0].state.phase).toBe('memory-core-repair-aborted');
        expect(calls.writeState[0].state.targetName).toBe('memory-core');
        expect(calls.writeState[0].state.shadowName).toBe('mc-memory-shadow-resume');
        expect(calls.writeState[0].state.loadedCount).toBe(1);
        expect(calls.writeState[0].state.unrecoverablePreview).toEqual(unrecoverable);
        expect(calls.writeState[0].state.aborted).toEqual(['mc-memory']);
        expect(logs.some(message => message.includes('Reasons: b (document-empty: document field was empty)'))).toBe(true);
    });

    test('partial-promoted repair keeps recovered rows durable while retaining parked source', async () => {
        const coverage = {collections: [
                  {name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']},
                  {name: 'mc-graph',  allIds: ['g'],      missingVectorIds: []}
              ]},
              repairResults = {
                  'mc-memory': {
                      collectionName : 'mc-memory',
                      partialPromoted: true,
                      promotion      : {parkingName: 'mc-memory-parking', parkingDeleted: false},
                      shadowName     : 'mc-memory-shadow-resume',
                      loadedCount    : 1,
                      recoveredCount : 1,
                      sourceCount    : 2,
                      unrecoverable  : ['b'],
                      counts         : {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}
                  },
                  'mc-graph': {
                      collectionName: 'mc-graph',
                      promotion     : {promoted: 'mc-graph'},
                      counts        : {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}
                  }
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, repairResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory', 'mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', stateBase: {targetName: 'memory-core'},
            auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.repair.map(call => call.collectionName)).toEqual(['mc-memory', 'mc-graph']);
        expect(results[0].partialPromoted).toBe(true);
        expect(results[1].promotion).toEqual({promoted: 'mc-graph'});
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(1);
        expect(calls.writeState[0].state.phase).toBe('memory-core-repair-partial-promoted');
        expect(calls.writeState[0].state.parkingName).toBe('mc-memory-parking');
        expect(calls.writeState[0].state.unrecoverable).toEqual(['b']);
        expect(calls.writeState[0].state.unrecoverableByCollection).toEqual({'mc-memory': ['b']});
        expect(calls.writeState[0].state.partialPromoted).toEqual(['mc-memory']);
        expect(calls.writeState[0].state.promoted).toEqual(['mc-memory', 'mc-graph']);
        expect(anyRepairNonClean(results)).toBe(true);
    });

    test('resume state skips earlier collections and resumes the matching collection repair', async () => {
        const coverage = {collections: [
                  {name: 'mc-memory',   allIds: ['old'], missingVectorIds: []},
                  {name: 'mc-sessions', allIds: ['a'],   missingVectorIds: ['a']}
              ]},
              repairResults = {
                  'mc-sessions': {collectionName: 'mc-sessions', promotion: {promoted: 'mc-sessions'}, counts: {total: 1, intact: 0, reEmbedded: 1, unrecoverable: 0}}
              },
              resumeState = {
                  phase         : 'memory-core-repair-shadow-loading',
                  collectionName: 'mc-sessions',
                  shadowName    : 'mc-sessions-shadow-resume'
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, repairResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client,
            collections : ['mc-memory', 'mc-sessions'],
            snapshotPath: '/snap',
            persistDir  : '/persist',
            embedFn,
            embeddingFunction,
            statePath   : '/state',
            auditFn,
            extractFn,
            repairCollectionFn,
            clearStateFn,
            writeStateFn,
            resumeState,
            log         : () => {}
        });

        expect(calls.repair.map(call => call.collectionName)).toEqual(['mc-sessions']);
        expect(calls.repair[0].resumeState).toBe(resumeState);
        expect(results).toHaveLength(1);
        expect(results[0].promotion).toEqual({promoted: 'mc-sessions'});
        expect(calls.clearState).toEqual([{statePath: '/state'}]);
    });

    test('malformed resumable state fails closed instead of starting from zero', async () => {
        const coverage = {collections: [
                  {name: 'mc-memory', allIds: ['a'], missingVectorIds: ['a']}
              ]},
              {client, auditFn, extractFn, repairCollectionFn} = makeSeams({coverage});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client,
            collections : ['mc-memory'],
            snapshotPath: '/snap',
            persistDir  : '/persist',
            embedFn,
            embeddingFunction,
            statePath   : '/state',
            auditFn,
            extractFn,
            repairCollectionFn,
            resumeState : {
                phase: 'memory-core-repair-shadow-loading'
            },
            log: () => {}
        })).rejects.toThrow(/missing collectionName or shadowName/);
    });

    test('dry-run reports clean extraction without promotion or state-marker writes', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a', 'b'], embeddings: [[1], [2]], documents: ['', 'doc'], metadatas: [{}, {}]}, unrecoverable: [], counts: {total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', dryRun: true,
            auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.audit[0].includeFullIds).toBe(true);
        expect(calls.extract).toHaveLength(1);
        expect(calls.repair).toHaveLength(0);
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
        expect(results).toEqual([{
            collectionName: 'mc-memory',
            dryRun        : true,
            counts        : {total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0}
        }]);
    });

    test('dry-run reports unrecoverable rows without writing an aborted state marker', async () => {
        const unrecoverable = [{id: 'b', reason: 'metadata-row-missing', message: 'id was absent from the Chroma documents/metadatas read'}],
              logs          = [];
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable, counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}}
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', dryRun: true,
            auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: message => logs.push(message)
        });

        expect(calls.repair).toHaveLength(0);
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
        expect(results[0]).toMatchObject({
            collectionName: 'mc-memory',
            dryRun        : true,
            aborted       : true,
            unrecoverable,
            counts        : {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}
        });
        expect(logs.some(message => message.includes(
            'Reasons: b (metadata-row-missing: id was absent from the Chroma documents/metadatas read)'
        ))).toBe(true);
        expect(anyRepairNonClean(results)).toBe(true);
    });

    test('throws when the enumeration returns no coverage row for a requested collection', async () => {
        const {client, auditFn, extractFn, repairCollectionFn} = makeSeams({coverage: {collections: []}, extractResults: {}});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, repairCollectionFn, log: () => {}
        })).rejects.toThrow(/no coverage row for 'mc-memory'/);
    });

    test('omitting statePath skips all state-marker ops (no marker lifecycle without a path)', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a'], missingVectorIds: []}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable: [], counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, auditFn, extractFn, repairCollectionFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
    });
});

test.describe('repairMemoryCoreCollectionViaResumableShadow (#14020)', () => {
    const embeddingFunction = {name: 'dummy'},
          embedFn           = async docs => docs.map(() => [0.1, 0.2]);

    function createCollection({name, ids = []}) {
        const rows = new Map(ids.map(id => [id, {
            embedding: [1],
            metadata : {},
            document : `doc-${id}`
        }]));

        return {
            name,
            rows,
            calls: {
                add: [],
                get: []
            },
            async add(payload) {
                this.calls.add.push(payload);

                for (let i = 0; i < payload.ids.length; i++) {
                    rows.set(payload.ids[i], {
                        embedding: payload.embeddings[i],
                        metadata : payload.metadatas[i],
                        document : payload.documents[i]
                    });
                }
            },
            async count() {
                return rows.size;
            },
            async get({ids, limit, offset = 0, include = []} = {}) {
                this.calls.get.push({ids, limit, offset, include});

                if (ids) {
                    return {ids: ids.filter(id => rows.has(id))};
                }

                return {ids: Array.from(rows.keys()).slice(offset, offset + limit)};
            }
        };
    }

    function createClient(collections = {}) {
        const registry = new Map(Object.entries(collections));
        const created  = [];

        return {
            created,
            async createCollection({name}) {
                const collection = createCollection({name});
                registry.set(name, collection);
                created.push(collection);
                return collection;
            },
            async getCollection({name}) {
                const collection = registry.get(name);

                if (!collection) {
                    throw new Error(`Collection ${name} not found`);
                }

                return collection;
            }
        };
    }

    test('streams recovered batches into a shadow collection and checkpoints loaded count', async () => {
        const states       = [];
        const promoteCalls = [];
        const extractCalls = [];
        const client       = createClient();
        const live         = createCollection({name: 'mc-memory'});

        const result = await repairMemoryCoreCollectionViaResumableShadow({
            client,
            collectionName  : 'mc-memory',
            collection      : live,
            allIds          : ['a', 'b'],
            missingVectorIds: ['b'],
            embedFn,
            embeddingFunction,
            statePath       : '/state',
            stateBase       : {targetName: 'memory-core'},
            extractFn       : async args => {
                extractCalls.push(args);
                await args.onDataBatch({ids: ['a'], embeddings: [[1]], documents: ['doc-a'], metadatas: [{}]});
                await args.onDataBatch({ids: ['b'], embeddings: [[2]], documents: ['doc-b'], metadatas: [{}]});
                return {unrecoverable: [], counts: {total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0}};
            },
            promoteLoadedFn: async args => {
                promoteCalls.push(args);
                return {shadowName: args.shadowName, sourceCount: args.sourceIds.length, parkingDeleted: true};
            },
            writeStateFn: async args => states.push(args.state),
            timestamp   : 123,
            uuidFactory : () => 'uuid-1',
            log         : () => {}
        });

        expect(client.created).toHaveLength(1);
        expect(client.created[0].rows.size).toBe(2);
        expect(extractCalls[0].collectData).toBe(false);
        expect(extractCalls[0].skipIds).toEqual([]);
        expect(states.filter(state => state.phase === 'memory-core-repair-shadow-loading').map(state => state.loadedCount))
            .toEqual([0, 1, 2]);
        expect(promoteCalls[0].sourceIds).toEqual(['a', 'b']);
        expect(result.promotion).toEqual({shadowName: 'mc-memory-shadow-123-uuid-1', sourceCount: 2, parkingDeleted: true});
    });

    test('resumes from an existing shadow and skips already loaded ids', async () => {
        const states       = [];
        const extractCalls = [];
        const shadow       = createCollection({name: 'mc-memory-shadow-resume', ids: ['a']});
        const client       = createClient({'mc-memory-shadow-resume': shadow});
        const live         = createCollection({name: 'mc-memory'});

        await repairMemoryCoreCollectionViaResumableShadow({
            client,
            collectionName  : 'mc-memory',
            collection      : live,
            allIds          : ['a', 'b'],
            missingVectorIds: ['b'],
            embedFn,
            embeddingFunction,
            statePath       : '/state',
            resumeState     : {
                phase     : 'memory-core-repair-shadow-loading',
                shadowName: 'mc-memory-shadow-resume'
            },
            extractFn: async args => {
                extractCalls.push(args);
                await args.onDataBatch({ids: ['b'], embeddings: [[2]], documents: ['doc-b'], metadatas: [{}]});
                return {unrecoverable: [], counts: {total: 2, intact: 0, reEmbedded: 1, unrecoverable: 0, resumedExisting: 1}};
            },
            promoteLoadedFn: async () => ({promoted: true}),
            writeStateFn   : async args => states.push(args.state),
            log            : () => {}
        });

        expect(client.created).toHaveLength(0);
        expect(extractCalls[0].skipIds).toEqual(['a']);
        expect(shadow.rows.has('a')).toBe(true);
        expect(shadow.rows.has('b')).toBe(true);
        expect(states.filter(state => state.phase === 'memory-core-repair-shadow-loading').map(state => state.loadedCount))
            .toEqual([1, 2]);
    });

    test('partially promotes recovered shadow rows and retains parked source on unrecoverable rows', async () => {
        const states       = [];
        const promoteCalls = [];
        const client       = createClient();
        const live         = createCollection({name: 'mc-memory'});

        const result = await repairMemoryCoreCollectionViaResumableShadow({
            client,
            collectionName  : 'mc-memory',
            collection      : live,
            allIds          : ['a', 'b'],
            missingVectorIds: ['b'],
            embedFn,
            embeddingFunction,
            statePath       : '/state',
            stateBase       : {targetName: 'memory-core'},
            extractFn       : async args => {
                await args.onDataBatch({ids: ['a'], embeddings: [[1]], documents: ['doc-a'], metadatas: [{}]});
                return {unrecoverable: ['b'], counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}};
            },
            promoteLoadedFn: async args => {
                promoteCalls.push(args);
                return {shadowName: args.shadowName, parkingName: 'mc-memory-parking', parkingDeleted: false};
            },
            writeStateFn: async args => states.push(args.state),
            timestamp   : 123,
            uuidFactory : () => 'uuid-1',
            log         : () => {}
        });

        expect(promoteCalls).toHaveLength(1);
        expect(promoteCalls[0].sourceIds).toEqual(['a']);
        expect(promoteCalls[0].deleteParking).toBe(false);
        expect(result.partialPromoted).toBe(true);
        expect(result.recoveredCount).toBe(1);
        expect(result.unrecoverable).toEqual(['b']);
        expect(states.some(state => state.phase === 'memory-core-repair-aborted')).toBe(false);
        expect(states.find(state => state.partial === true)).toMatchObject({
            phase             : 'memory-core-repair-shadow-loaded',
            recoveredCount    : 1,
            unrecoverableCount: 1,
            unrecoverable     : ['b']
        });
    });
});

test.describe('runDefragChromaDBCli (#14020)', () => {
    test('runs standalone defrag inside the shared heavy-maintenance lease', async () => {
        const calls = {
            lease: [],
            run  : 0,
            exit : []
        };

        await runDefragChromaDBCli({
            runDefrag: async () => {
                calls.run++;
            },
            withLease: async (task, options) => {
                calls.lease.push(options);
                await task();
                return {status: 'acquired', result: undefined};
            },
            output: {
                log  : () => {},
                error: () => {}
            },
            exit: code => calls.exit.push(code)
        });

        expect(calls.run).toBe(1);
        expect(calls.lease).toEqual([{
            owner       : 'defrag',
            reason      : 'manual-cli',
            staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/maintenance/defragChromaDB.mjs'}
        }]);
        expect(calls.exit).toEqual([0]);
    });

    test('defers without running defrag when another heavy task holds the lease', async () => {
        const logs  = [];
        const calls = {
            run : 0,
            exit: []
        };

        await runDefragChromaDBCli({
            runDefrag: async () => {
                calls.run++;
            },
            withLease: async () => ({
                status: 'held',
                lease : {
                    owner     : 'sandman',
                    reason    : 'manual-cli',
                    pid       : 123,
                    acquiredAt: '2026-06-25T21:00:00.000Z'
                }
            }),
            output: {
                log  : message => logs.push(message),
                error: () => {}
            },
            exit: code => calls.exit.push(code)
        });

        expect(calls.run).toBe(0);
        expect(calls.exit).toEqual([0]);
        expect(logs.some(message => message.includes("Deferred: heavy-maintenance lease held by 'sandman'"))).toBe(true);
    });
});

test.describe('assertDefragTargetSupported — Memory Core opt-in gate (#14020)', () => {
    test('fails closed for memory-core by default (no opt-in)', () => {
        expect(() => assertDefragTargetSupported({targetName: 'memory-core'})).toThrow(/Memory Core defrag is disabled/);
    });

    test('allows memory-core only with the explicit allowMemoryCore opt-in', () => {
        expect(() => assertDefragTargetSupported({targetName: 'memory-core', allowMemoryCore: true})).not.toThrow();
    });

    test('knowledge-base is always allowed', () => {
        expect(() => assertDefragTargetSupported({targetName: 'knowledge-base'})).not.toThrow();
    });
});

test.describe('promoteLoadedShadowCollection — retained-parking lifecycle (#14068)', () => {
    const embeddingFunction = {name: 'dummy'};

    // Minimal Chroma double: getCollection returns the live collection until the shadow is promoted
    // onto the canonical name, then returns the promoted shadow. Records deletes + state-marker phases
    // so a test can assert the retained-vs-deleted parking behavior of the partial-promotion path.
    function makePromoteHarness({sourceIds = ['a', 'b']} = {}) {
        const states = [], deletedCollections = [];

        function makeCollection(name) {
            return {
                name,
                async count()                   { return sourceIds.length },
                async get({ids = []} = {})      { return {ids} },
                async modify({name: newName})   { this.name = newName }
            }
        }

        const live   = makeCollection('mc-memory'),
              shadow = makeCollection('mc-memory-shadow'),
              client = {
                  async getCollection({name}) {
                      if (name === 'mc-memory') {
                          return shadow.name === 'mc-memory' ? shadow : live
                      }
                      throw new Error(`unexpected getCollection(${name})`)
                  },
                  async deleteCollection({name}) { deletedCollections.push(name) }
              };

        return {
            client, deletedCollections, shadow, sourceIds, states,
            writeStateFn: async ({state}) => { states.push(state) }
        }
    }

    test('deleteParking:false retains the parked source and records parking-retained', async () => {
        const harness = makePromoteHarness();

        const result = await promoteLoadedShadowCollection({
            client          : harness.client,
            collectionName  : 'mc-memory',
            shadowCollection: harness.shadow,
            shadowName      : 'mc-memory-shadow',
            sourceIds       : harness.sourceIds,
            embeddingFunction,
            statePath       : '/state',
            deleteParking   : false,
            timestamp       : 123,
            uuidFactory     : () => 'uuid-1',
            writeStateFn    : harness.writeStateFn
        });

        expect(harness.deletedCollections).toEqual([]);
        expect(result.parkingDeleted).toBe(false);
        expect(harness.states.some(state => state.phase === 'parking-retained')).toBe(true);
        expect(harness.states.some(state => state.phase === 'parking-deleted')).toBe(false);
        expect(harness.states.find(state => state.phase === 'parking-retained').parkingName).toMatch(/^mc-memory-parking-/);
    });

    test('deleteParking:true (default) deletes the parked source and records parking-deleted', async () => {
        const harness = makePromoteHarness();

        const result = await promoteLoadedShadowCollection({
            client          : harness.client,
            collectionName  : 'mc-memory',
            shadowCollection: harness.shadow,
            shadowName      : 'mc-memory-shadow',
            sourceIds       : harness.sourceIds,
            embeddingFunction,
            statePath       : '/state',
            timestamp       : 123,
            uuidFactory     : () => 'uuid-1',
            writeStateFn    : harness.writeStateFn
        });

        expect(harness.deletedCollections).toHaveLength(1);
        expect(harness.deletedCollections[0]).toMatch(/^mc-memory-parking-/);
        expect(result.parkingDeleted).toBe(true);
        expect(harness.states.some(state => state.phase === 'parking-deleted')).toBe(true);
        expect(harness.states.some(state => state.phase === 'parking-retained')).toBe(false);
    });
});

test.describe('unrecoverable reason previews (#14023)', () => {
    test('keeps structured state previews and formats bounded operator logs', () => {
        const entries = [
            {id: 'a', reason: 'document-empty', message: 'document field was empty'},
            {id: 'b', reason: 'embedding-provider-error', message: 'context overflow'},
            'legacy-id'
        ];

        expect(createUnrecoverablePreview(entries, 2)).toEqual([
            {id: 'a', reason: 'document-empty', message: 'document field was empty'},
            {id: 'b', reason: 'embedding-provider-error', message: 'context overflow'}
        ]);
        expect(formatUnrecoverablePreview(entries, {limit: 2}))
            .toBe('a (document-empty: document field was empty); b (embedding-provider-error: context overflow); +1 more');
        expect(formatUnrecoverablePreview(['legacy-id'])).toBe('legacy-id (unknown)');
    });
});

test.describe('anyRepairNonClean — operator fail-loud predicate (#14062)', () => {
    test('true when any collection partial-promoted', () => {
        expect(anyRepairNonClean([
            {collectionName: 'mc-memory', partialPromoted: true, promotion: {}, unrecoverable: ['x']},
            {collectionName: 'mc-graph',  promotion: {}}
        ])).toBe(true);
    });

    test('true when any collection aborted', () => {
        expect(anyRepairNonClean([
            {collectionName: 'mc-memory', aborted: true, unrecoverable: ['x']}
        ])).toBe(true);
    });

    test('false when every collection promoted cleanly', () => {
        expect(anyRepairNonClean([
            {collectionName: 'mc-memory', promotion: {}},
            {collectionName: 'mc-graph',  promotion: {}}
        ])).toBe(false);
    });
});

test.describe('formatMemoryCoreRepairProgress — timestamped operator progress (#14017)', () => {
    const now            = '2026-06-25T18:45:00.000Z',
          collectionName = 'neo-agent-memory';

    test('timestamps representative repair phases while preserving progress details', () => {
        expect(formatMemoryCoreRepairProgress({
            collectionName,
            now,
            event: {
                phase : 'start',
                total : 22545,
                counts: {intact: 0, reEmbedded: 0, unrecoverable: 0}
            }
        })).toBe(`   [${now}] ⏳ 'neo-agent-memory': extraction starting (total=22545, intact=0, reEmbedded=0, unrecoverable=0)`);

        expect(formatMemoryCoreRepairProgress({
            collectionName,
            now,
            event: {
                phase    : 'intact-extract',
                percent  : 40,
                processed: 4000,
                total    : 8583,
                counts   : {intact: 4000}
            }
        })).toBe(`   [${now}] ⏳ 'neo-agent-memory': intact-vector extraction 40% (4000/8583; intact=4000)`);

        expect(formatMemoryCoreRepairProgress({
            collectionName,
            now,
            event: {
                phase    : 'missing-reembed',
                percent  : 30,
                processed: 5000,
                total    : 13962,
                counts   : {reEmbedded: 5000, unrecoverable: 0}
            }
        })).toBe(`   [${now}] ⏳ 'neo-agent-memory': missing-vector re-embed 30% (5000/13962; reEmbedded=5000, unrecoverable=0)`);

        expect(formatMemoryCoreRepairProgress({
            collectionName,
            now,
            event: {
                phase : 'complete',
                counts: {total: 22545, intact: 8583, reEmbedded: 13962, unrecoverable: 0}
            }
        })).toBe(`   [${now}] ✅ 'neo-agent-memory': extraction complete; counts {"total":22545,"intact":8583,"reEmbedded":13962,"unrecoverable":0}`);
    });

    test('timestamps fallback progress phases', () => {
        expect(formatMemoryCoreRepairProgress({
            collectionName,
            now,
            event: {
                phase    : 'unexpected-phase',
                percent  : 75,
                processed: 3,
                total    : 4
            }
        })).toBe(`   [${now}] ⏳ 'neo-agent-memory': unexpected-phase 75% (3/4)`);
    });
});

test.describe('applyAutonomousSettlement — a settled clean exit clears the non-clean marker', () => {
    const partial = (collectionName, residue, sourceCount, parkingName) => ({
        collectionName, partialPromoted: true, aborted: false, unrecoverable: residue, sourceCount,
        promotion: {parkingName}
    });

    test('all-bounded-terminal → settles, audits WITH the parking context, writes accepted-loss state, clears the marker', async () => {
        const audits = [], acceptedLossStates = [], cleared = [];

        const result = await applyAutonomousSettlement({
            results                 : [partial('mc-graph', [{id: 'a', reason: 'document-absent'}], 10000, 'mc-graph-parking-1')],
            statePath               : '/state/marker.json',
            auditDir                : '/state',
            appendFn                : async (entry, opts) => { audits.push({entry, opts}); },
            writeAcceptedLossStateFn: async (state, opts) => { acceptedLossStates.push({state, opts}); },
            clearFn                 : async opts => { cleared.push(opts); },
            now                     : () => '2026-06-27T13:31:00.000Z'
        });

        expect(result.settled).toBe(true);
        expect(cleared).toEqual([{statePath: '/state/marker.json'}]);
        expect(audits).toHaveLength(1);
        expect(audits[0].entry).toMatchObject({
            type           : 'auto-accepted-loss',
            collectionName : 'mc-graph',
            parkingName    : 'mc-graph-parking-1',
            strategyVersion: AiConfig.memoryRepair.strategyVersion
        });
        expect(audits[0].opts).toEqual({dir: '/state'});
        expect(acceptedLossStates).toHaveLength(1);
        expect(acceptedLossStates[0].opts).toEqual({dir: '/state'});
        expect(acceptedLossStates[0].state).toMatchObject({
            type           : 'auto-accepted-loss-state',
            phase          : 'memory-core-repair-recovered-with-accepted-loss',
            settledAt      : '2026-06-27T13:31:00.000Z',
            auditPath      : '/state/auto-accepted-loss.jsonl',
            defragStatePath: '/state/marker.json',
            collectionCount: 1,
            collections    : [{
                collectionName: 'mc-graph',
                parkingName   : 'mc-graph-parking-1',
                fingerprint   : audits[0].entry.fingerprint,
                acceptedIds   : ['a']
            }]
        });
    });

    test('any heal-path (transient) collection → NOT settled, no audit, marker left intact', async () => {
        const audits = [], cleared = [];

        const result = await applyAutonomousSettlement({
            results: [
                partial('mc-graph',  [{id: 'a', reason: 'document-absent'}],  10000, 'p1'),
                partial('mc-memory', [{id: 'b', reason: 'provider-timeout'}], 10000, 'p2')
            ],
            statePath: '/state/marker.json',
            auditDir : '/state',
            appendFn : async entry => { audits.push(entry); },
            clearFn  : async opts => { cleared.push(opts); }
        });

        expect(result.settled).toBe(false);
        expect(audits).toHaveLength(0);
        expect(cleared).toHaveLength(0);
    });

    test('the next maintenance pass is NOT blocked after a settled run (real marker lifecycle)', async () => {
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-defrag-settle-'));

        try {
            const statePath = path.join(tmpDir, 'defrag-state.json');

            // the repair wrote a non-clean marker; it WOULD block the next run (anchor the defect)
            await writeDefragState({statePath, state: {phase: 'memory-core-repair-partial-promoted', targetName: 'memory-core'}});
            await expect(assertNoIncompleteDefragState({statePath, allowedPhases: []})).rejects.toThrow(/Incomplete Chroma defrag state/);

            // a settled autonomous run (real clearDefragState + real audit append into tmpDir)
            const result = await applyAutonomousSettlement({
                results : [partial('mc-graph', [{id: 'a', reason: 'document-absent'}], 10000, 'parking-1')],
                statePath,
                auditDir: tmpDir,
                now     : () => '2026-06-27T13:31:00.000Z'
            });
            expect(result.settled).toBe(true);

            // the next run is now unblocked — the marker is resolved
            await expect(assertNoIncompleteDefragState({statePath, allowedPhases: []})).resolves.toBeUndefined();
            const acceptedLossState = JSON.parse(await readFile(path.join(tmpDir, 'auto-accepted-loss-state.json'), 'utf8'));
            expect(acceptedLossState.phase).toBe('memory-core-repair-recovered-with-accepted-loss');
            expect(acceptedLossState.collections[0].parkingName).toBe('parking-1');
        } finally {
            await rm(tmpDir, {recursive: true, force: true});
        }
    });
});
