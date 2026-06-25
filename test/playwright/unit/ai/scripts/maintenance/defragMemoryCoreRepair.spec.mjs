import {test, expect}                                                                                 from '@playwright/test';
import {
    anyRepairAborted,
    assertDefragTargetSupported,
    formatMemoryCoreRepairProgress,
    repairMemoryCoreCollectionsViaFullEnumeration
} from '../../../../../../ai/scripts/maintenance/defragChromaDB.mjs';

/**
 * AC4 — the Memory Core defrag-wiring orchestration: full (uncapped) enumeration ->
 * extract + re-embed -> shadow-promotion, with fail-loud on unrecoverable rows. The seams
 * (auditFn / extractFn / promoteFn) are injected so the orchestration is verified without a
 * live Chroma store.
 */
test.describe('repairMemoryCoreCollectionsViaFullEnumeration (#13634 AC4)', () => {
    const embeddingFunction = {name: 'dummy'},
          embedFn           = async docs => docs.map(() => [0.1, 0.2]);

    function makeSeams({coverage, extractResults, client}) {
        const calls = {audit: [], extract: [], promote: [], clearState: [], writeState: []};

        return {
            calls,
            client      : client || {getCollection: async ({name}) => ({_name: name})},
            auditFn     : async args => { calls.audit.push(args);   return coverage; },
            extractFn   : async args => { calls.extract.push(args); return extractResults[args.collection._name]; },
            promoteFn   : async args => { calls.promote.push(args); return {promoted: args.collectionName}; },
            clearStateFn: async args => { calls.clearState.push(args); },
            writeStateFn: async args => { calls.writeState.push(args); }
        };
    }

    test('full-enumeration audit feeds extract + promote per collection (happy path)', async () => {
        const coverage = {collections: [
                  {name: 'mc-memory', allIds: ['a', 'b', 'c'], missingVectorIds: ['c']},
                  {name: 'mc-graph',  allIds: ['x'],           missingVectorIds: []}
              ]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a', 'b', 'c'], embeddings: [[1], [2], [3]], documents: ['', '', ''], metadatas: [{}, {}, {}]}, unrecoverable: [], counts: {total: 3, intact: 2, reEmbedded: 1, unrecoverable: 0}},
                  'mc-graph' : {data: {ids: ['x'], embeddings: [[9]], documents: [''], metadatas: [{}]},             unrecoverable: [], counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory', 'mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        // exactly one enumeration call, uncapped (includeFullIds), over the requested collections
        expect(calls.audit).toHaveLength(1);
        expect(calls.audit[0].includeFullIds).toBe(true);
        expect(calls.audit[0].collectionNames).toEqual(['mc-memory', 'mc-graph']);

        // extract receives the FULL {allIds, missingVectorIds} from the coverage, per collection
        expect(calls.extract.map(c => c.allIds)).toEqual([['a', 'b', 'c'], ['x']]);
        expect(calls.extract.map(c => c.missingVectorIds)).toEqual([['c'], []]);

        // both promoted with their recovered data
        expect(calls.promote.map(c => c.collectionName)).toEqual(['mc-memory', 'mc-graph']);
        expect(calls.promote[0].data.ids).toEqual(['a', 'b', 'c']);
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
              extractResults = {
                  'mc-graph': {data: {ids: ['live'], embeddings: [[9]], documents: [''], metadatas: [{}]}, unrecoverable: [], counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              client = {getCollection: async ({name}) => ({_name: name, id: 'live-id'})},
              {calls, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults, client});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.extract).toHaveLength(1);
        expect(calls.extract[0].allIds).toEqual(['live']);
        expect(calls.extract[0].missingVectorIds).toEqual([]);
        expect(results[0].promotion).toEqual({promoted: 'mc-graph'});
    });

    test('duplicate collection names fail before extraction when the live collection id cannot be matched', async () => {
        const coverage = {collections: [
                  {name: 'mc-graph', collectionId: 'stale-id', allIds: ['stale'], missingVectorIds: ['stale']},
                  {name: 'mc-graph', collectionId: 'other-id', allIds: ['other'], missingVectorIds: []}
              ]},
              client = {getCollection: async ({name}) => ({_name: name, id: 'live-id'})},
              {calls, auditFn, extractFn, promoteFn} = makeSeams({coverage, extractResults: {}, client});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, log: () => {}
        })).rejects.toThrow(/none match live collection id 'live-id'/);

        expect(calls.extract).toHaveLength(0);
        expect(calls.promote).toHaveLength(0);
    });

    test('fail-loud: unrecoverable rows abort that collection promotion (no silent drop)', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable: ['b'], counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}}
              },
              {calls, client, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', stateBase: {targetName: 'memory-core'},
            auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.promote).toHaveLength(0);              // never promoted
        expect(results[0].aborted).toBe(true);
        expect(results[0].unrecoverable).toEqual(['b']);
        expect(results[0].counts.unrecoverable).toBe(1);

        // an aborted repair NEVER clears the marker; it rewrites an explicit aborted marker so the next run
        // blocks as DEFRAG_INCOMPLETE_STATE with an accurate diagnostic
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(1);
        expect(calls.writeState[0].statePath).toBe('/state');
        expect(calls.writeState[0].state.phase).toBe('memory-core-repair-aborted');
        expect(calls.writeState[0].state.targetName).toBe('memory-core');
        expect(calls.writeState[0].state.aborted).toEqual(['mc-memory']);
    });

    test('dry-run reports clean extraction without promotion or state-marker writes', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a', 'b'], embeddings: [[1], [2]], documents: ['', 'doc'], metadatas: [{}, {}]}, unrecoverable: [], counts: {total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', dryRun: true,
            auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.audit[0].includeFullIds).toBe(true);
        expect(calls.extract).toHaveLength(1);
        expect(calls.promote).toHaveLength(0);
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
        expect(results).toEqual([{
            collectionName: 'mc-memory',
            dryRun        : true,
            counts        : {total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0}
        }]);
    });

    test('dry-run reports unrecoverable rows without writing an aborted state marker', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable: ['b'], counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}}
              },
              {calls, client, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', dryRun: true,
            auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.promote).toHaveLength(0);
        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
        expect(results[0]).toMatchObject({
            collectionName: 'mc-memory',
            dryRun        : true,
            aborted       : true,
            unrecoverable : ['b'],
            counts        : {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}
        });
        expect(anyRepairAborted(results)).toBe(true);
    });

    test('throws when the enumeration returns no coverage row for a requested collection', async () => {
        const {client, auditFn, extractFn, promoteFn} = makeSeams({coverage: {collections: []}, extractResults: {}});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, log: () => {}
        })).rejects.toThrow(/no coverage row for 'mc-memory'/);
    });

    test('omitting statePath skips all state-marker ops (no marker lifecycle without a path)', async () => {
        const coverage       = {collections: [{name: 'mc-memory', allIds: ['a'], missingVectorIds: []}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable: [], counts: {total: 1, intact: 1, reEmbedded: 0, unrecoverable: 0}}
              },
              {calls, client, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn} = makeSeams({coverage, extractResults});

        await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, auditFn, extractFn, promoteFn, clearStateFn, writeStateFn, log: () => {}
        });

        expect(calls.clearState).toHaveLength(0);
        expect(calls.writeState).toHaveLength(0);
    });
});

test.describe('assertDefragTargetSupported — Memory Core opt-in gate (#13634 AC4)', () => {
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

test.describe('anyRepairAborted — operator fail-loud predicate (#13634 AC4)', () => {
    test('true when any collection aborted — the CLI exits non-zero on this', () => {
        expect(anyRepairAborted([
            {collectionName: 'mc-memory', promotion: {}},
            {collectionName: 'mc-graph',  aborted: true, unrecoverable: ['x'], counts: {unrecoverable: 1}}
        ])).toBe(true);
    });

    test('false when every collection promoted cleanly', () => {
        expect(anyRepairAborted([
            {collectionName: 'mc-memory', promotion: {}},
            {collectionName: 'mc-graph',  promotion: {}}
        ])).toBe(false);
    });

    test('false for an empty result set', () => {
        expect(anyRepairAborted([])).toBe(false);
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
