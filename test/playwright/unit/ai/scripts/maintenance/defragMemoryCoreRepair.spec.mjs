import {test, expect}                                                                                 from '@playwright/test';
import {anyRepairAborted, assertDefragTargetSupported, repairMemoryCoreCollectionsViaFullEnumeration} from '../../../../../../ai/scripts/maintenance/defragChromaDB.mjs';

/**
 * AC4 — the Memory Core defrag-wiring orchestration: full (uncapped) enumeration ->
 * extract + re-embed -> shadow-promotion, with fail-loud on unrecoverable rows. The seams
 * (auditFn / extractFn / promoteFn) are injected so the orchestration is verified without a
 * live Chroma store.
 */
test.describe('repairMemoryCoreCollectionsViaFullEnumeration (#13634 AC4)', () => {
    const embeddingFunction = {name: 'dummy'},
          embedFn           = async docs => docs.map(() => [0.1, 0.2]);

    function makeSeams({coverage, extractResults}) {
        const calls = {audit: [], extract: [], promote: []};

        return {
            calls,
            client   : {getCollection: async ({name}) => ({_name: name})},
            auditFn  : async args => { calls.audit.push(args);   return coverage; },
            extractFn: async args => { calls.extract.push(args); return extractResults[args.collection._name]; },
            promoteFn: async args => { calls.promote.push(args); return {promoted: args.collectionName}; }
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
              {calls, client, auditFn, extractFn, promoteFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory', 'mc-graph'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, log: () => {}
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
    });

    test('fail-loud: unrecoverable rows abort that collection promotion (no silent drop)', async () => {
        const coverage = {collections: [{name: 'mc-memory', allIds: ['a', 'b'], missingVectorIds: ['b']}]},
              extractResults = {
                  'mc-memory': {data: {ids: ['a'], embeddings: [[1]], documents: [''], metadatas: [{}]}, unrecoverable: ['b'], counts: {total: 2, intact: 1, reEmbedded: 0, unrecoverable: 1}}
              },
              {calls, client, auditFn, extractFn, promoteFn} = makeSeams({coverage, extractResults});

        const {results} = await repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, log: () => {}
        });

        expect(calls.promote).toHaveLength(0);              // never promoted
        expect(results[0].aborted).toBe(true);
        expect(results[0].unrecoverable).toEqual(['b']);
        expect(results[0].counts.unrecoverable).toBe(1);
    });

    test('throws when the enumeration returns no coverage row for a requested collection', async () => {
        const {client, auditFn, extractFn, promoteFn} = makeSeams({coverage: {collections: []}, extractResults: {}});

        await expect(repairMemoryCoreCollectionsViaFullEnumeration({
            client, collections: ['mc-memory'], snapshotPath: '/snap', persistDir: '/persist',
            embedFn, embeddingFunction, statePath: '/state', auditFn, extractFn, promoteFn, log: () => {}
        })).rejects.toThrow(/no coverage row for 'mc-memory'/);
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
