import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'RebuildMcVectorStoreTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {
    createEmbedFn,
    groupFailureReceipts,
    readAllIds,
    rebuildCollections,
    validateCliOptions
} from '../../../../../../ai/scripts/maintenance/rebuildMemoryCoreVectorStore.mjs';

/**
 * Falsifier-first suite: every test below encodes a reviewer-executable falsifier from the
 * predecessor's terminal reviews — provider-fate truth, bounded pressure, drained concurrency,
 * sparse-result rejection, semantic same-store refusal, id-set reconciliation, and true
 * no-write dry-run — plus the salvaged happy-path/resume/grouping behaviors.
 */

/** Mock Chroma collection with a UUID; supports ids-based and limit/offset get plus add. */
function makeCollection(rows = {}, id = `col-${Math.random().toString(36).slice(2, 8)}`) {
    const col = {
        id,
        rows,
        addCalls: [],
        get     : async ({ids, limit, offset = 0, include = []}) => {
            const pick = ids ?? Object.keys(rows).slice(offset, limit ? offset + limit : undefined);
            const out  = {ids: []};
            if (include.includes('documents'))  out.documents  = [];
            if (include.includes('metadatas'))  out.metadatas  = [];
            for (const rowId of pick) {
                const row = rows[rowId];
                if (!row) continue;
                out.ids.push(rowId);
                if (out.documents)  out.documents.push(row.document ?? null);
                if (out.metadatas)  out.metadatas.push(row.metadata ?? {});
            }
            return out;
        },
        add: async ({ids, embeddings, documents, metadatas}) => {
            col.addCalls.push({ids, embeddings});
            for (const vector of embeddings) {
                if (!Array.isArray(vector)) {
                    throw new Error(`target received a non-vector embedding: ${vector}`);
                }
            }
            ids.forEach((rowId, i) => { rows[rowId] = {document: documents[i], metadata: metadatas[i], embedding: embeddings[i]} });
        }
    };
    return col;
}

const makeClient = cols => ({
    getCollection        : async ({name}) => { if (!cols[name]) throw new Error(`no collection ${name}`); return cols[name] },
    getOrCreateCollection: async ({name}) => (cols[name] ??= makeCollection())
});

/** Client whose every mutating surface throws — the dry-run witness. */
const readOnlyClient = cols => ({
    getCollection        : async ({name}) => { if (!cols[name]) throw new Error(`no collection ${name}`); return cols[name] },
    getOrCreateCollection: async () => { throw new Error('dry-run must not create collections') }
});

const sourceRows = n => Object.fromEntries(
    Array.from({length: n}, (_, i) => [`id-${i}`, {document: `doc ${i}`, metadata: {type: 'memory'}}])
);

const fakeEmbedFn = async docs => docs.map((_, i) => [i, 0.5]);

const httpError = status => {
    const error = new Error(`embed HTTP ${status}`);
    error.httpStatus = status;
    return error;
};

test.describe('Neo.ai.scripts.maintenance.rebuildMemoryCoreVectorStore', () => {

    test('happy path: full rebuild re-embeds every source document into the fresh target, ok:true', async () => {
        const target  = {};
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(12))}),
            targetClient: makeClient(target),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            getBatch    : 5,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({
            name  : 'mem', source: 12, planned: 12, targetBefore: 0, targetAfter: 12, reEmbedded: 12,
            failed: [], stoppedEarly: false, missingAfterRun: {count: 0, sampleIds: []}
        });
        expect(Object.values(target.mem.rows).every(row => Array.isArray(row.embedding))).toBe(true);
    });

    test('FALSIFIER same-store: two URLs resolving to one collection UUID are REFUSED — no no-op blessing', async () => {
        const shared  = makeCollection(sourceRows(5), 'uuid-same');
        const embeds  = [];
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: shared}),
            targetClient: makeClient({mem: shared}),
            collections : ['mem'],
            embedFn     : async docs => { embeds.push(docs); return fakeEmbedFn(docs) },
            log         : () => {}
        });

        expect(receipt.ok).toBe(false);
        expect(receipt.collections[0].error).toBe('source-and-target-are-the-same-collection');
        expect(embeds).toEqual([]);
        expect(shared.addCalls).toEqual([]);
    });

    test('FALSIFIER id-set reconciliation: matching COUNTS with wrong ids still fail — missing ids are named', async () => {
        // Target pre-populated with 3 FOREIGN ids: counts alone would reconcile a lie.
        const target = makeCollection({
            'foreign-a': {document: 'x', metadata: {}, embedding: [1]},
            'foreign-b': {document: 'x', metadata: {}, embedding: [1]},
            'foreign-c': {document: 'x', metadata: {}, embedding: [1]}
        }, 'uuid-target');
        // The embedder fails EVERYTHING as unknown (terminal) so no planned id can land.
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(3), 'uuid-source')}),
            targetClient: makeClient({mem: target}),
            collections : ['mem'],
            embedFn     : async () => { throw new Error('opaque provider explosion') },
            log         : () => {}
        });

        const entry = receipt.collections[0];
        expect(receipt.ok).toBe(false);
        // Every planned id is accounted for AS A FAILURE (terminal unknown), none as landed.
        expect(entry.failed).toEqual([
            {reason: 'embedding-unknown', count: 3, retryable: false, sampleIds: ['id-0', 'id-1', 'id-2']}
        ]);
        expect(entry.missingAfterRun.count).toBe(0);
        // The foreign population is REPORTED (observability) without failing the run by itself.
        expect(entry.targetOnly).toMatchObject({count: 3});
        expect(entry.targetOnly.sampleIds.sort()).toEqual(['foreign-a', 'foreign-b', 'foreign-c']);
    });

    test('live-plane writes during a rebuild (target-only ids) are reported, never an error', async () => {
        const target  = makeCollection({'live-write-1': {document: 'new memory', metadata: {}, embedding: [9]}}, 'uuid-t');
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(4), 'uuid-s')}),
            targetClient: makeClient({mem: target}),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0].targetOnly).toMatchObject({count: 1, sampleIds: ['live-write-1']});
        expect(receipt.collections[0].targetAfter).toBe(5);
    });

    test('FALSIFIER dry-run: zero writes of any kind — a mutation-throwing client passes, absent target reported', async () => {
        const embeds  = [];
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(7), 'uuid-s')}),
            targetClient: readOnlyClient({}),
            collections : ['mem'],
            embedFn     : async docs => { embeds.push(docs); return fakeEmbedFn(docs) },
            dryRun      : true,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({source: 7, planned: 7, wouldCreateTarget: true, ok: true});
        expect(embeds).toEqual([]);
    });

    test('resume: planned ids already in the target are skipped, not re-embedded', async () => {
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(10), 'uuid-s')}),
            targetClient: makeClient({mem: makeCollection(sourceRows(4), 'uuid-t')}),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({targetBefore: 4, targetAfter: 10, reEmbedded: 6, resumedExisting: 4});
    });

    test('FALSIFIER provider fate: a persistent 401 stops WITHOUT burning the attempt budget and records terminal-config', async () => {
        let   calls   = 0;
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(6), 'uuid-s')}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : async () => { calls++; throw httpError(401) },
            embedRetry  : {attempts: 3, wait: async () => {}},
            log         : () => {}
        });

        const entry = receipt.collections[0];
        expect(receipt.ok).toBe(false);
        expect(calls).toBe(1);
        expect(entry.failed).toEqual([
            {reason: 'embedding-config-terminal', count: 6, retryable: false, sampleIds: ['id-0', 'id-1', 'id-2', 'id-3', 'id-4', 'id-5']}
        ]);
        expect(entry.stoppedEarly).toBe(false);
    });

    test('FALSIFIER bounded pressure: a persistent outage costs exactly `attempts` calls, then stops early as resumable', async () => {
        let   calls    = 0;
        const backoffs = [];
        const receipt  = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(8), 'uuid-s')}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : async () => { calls++; const e = new Error('fetch failed'); e.cause = {code: 'ECONNREFUSED'}; throw e },
            embedRetry  : {attempts: 3, backoffMs: 500, wait: async ms => { backoffs.push(ms) }},
            log         : () => {}
        });

        const entry = receipt.collections[0];
        expect(receipt.ok).toBe(false);
        // The predecessor amplified this to 45 calls via per-range budgets; the contract is 3.
        expect(calls).toBe(3);
        expect(backoffs).toEqual([500, 1000]);
        expect(entry.stoppedEarly).toBe(true);
        expect(entry.failed).toEqual([
            {reason: 'embedding-provider-error', count: 8, retryable: true, sampleIds: ['id-0', 'id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7']}
        ]);
        // A follow-up resume run retries exactly these ids — witnessed by the resumable rollup.
    });

    test('transient outage that RECOVERS within the budget completes clean (attempt 2 succeeds)', async () => {
        let   calls   = 0;
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(4), 'uuid-s')}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : async docs => { if (++calls === 1) throw httpError(503); return fakeEmbedFn(docs) },
            embedRetry  : {attempts: 3, wait: async () => {}},
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(calls).toBe(2);
        expect(receipt.collections[0]).toMatchObject({targetAfter: 4, reEmbedded: 4, failed: [], stoppedEarly: false});
    });

    test('receipt provenance carries endpoints, collection UUIDs, model, and dimension', async () => {
        const receipt = await rebuildCollections({
            sourceClient     : makeClient({mem: makeCollection(sourceRows(2), 'uuid-src')}),
            targetClient     : makeClient({mem: makeCollection({}, 'uuid-tgt')}),
            collections      : ['mem'],
            embedFn          : async docs => docs.map(() => new Array(8).fill(0.1)),
            provenance       : {sourceUrl: 'http://a:8000', targetUrl: 'http://b:8000', model: 'test-embedder'},
            expectedDimension: 8,
            log              : () => {}
        });

        expect(receipt.provenance).toEqual({sourceUrl: 'http://a:8000', targetUrl: 'http://b:8000', model: 'test-embedder', expectedDimension: 8});
        expect(receipt.collections[0]).toMatchObject({sourceCollectionId: 'uuid-src', targetCollectionId: 'uuid-tgt', ok: true});
    });

    test('groupFailureReceipts groups by reason, caps samples, and sorts largest first', () => {
        const entries = [
            ...Array.from({length: 12}, (_, i) => ({id: `e-${i}`, reason: 'embedding-provider-error', retryable: true})),
            {id: 'd-0', reason: 'document-empty', retryable: false},
            {id: 'd-1', reason: 'document-empty', retryable: false}
        ];

        expect(groupFailureReceipts(entries, 3)).toEqual([
            {reason: 'embedding-provider-error', count: 12, retryable: true,  sampleIds: ['e-0', 'e-1', 'e-2']},
            {reason: 'document-empty',           count: 2,  retryable: false, sampleIds: ['d-0', 'd-1']}
        ]);
        expect(groupFailureReceipts([])).toEqual([]);
    });

    test('readAllIds paginates past one page', async () => {
        const ids = await readAllIds(makeCollection(sourceRows(7)), 3);
        expect(ids).toHaveLength(7);
        expect(ids[6]).toBe('id-6');
    });

    test('pilot --limit slices the planned set without touching the rest', async () => {
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(20), 'uuid-s')}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            limit       : 5,
            log         : () => {}
        });

        expect(receipt.collections[0]).toMatchObject({source: 20, planned: 5, targetAfter: 5, ok: true});
        expect(receipt.ok).toBe(true);
    });

    test('FALSIFIER CLI validation: bad flags produce named errors, never a running process', () => {
        const base = {sourceUrl: 'http://a:8000', targetUrl: 'http://b:8000', embedUrl: 'http://c:1234/v1/embeddings', collections: 'mem'};

        expect(validateCliOptions(base)).toEqual([]);
        expect(validateCliOptions({...base, targetUrl: 'http://a:8000'})[0]).toContain('must differ');
        expect(validateCliOptions({...base, sourceUrl: 'not-a-url'})[0]).toContain('--source-url');
        expect(validateCliOptions({...base, collections: ' , '})[0]).toContain('--collections');
        expect(validateCliOptions({...base, embedAttempts: 0})[0]).toContain('--embed-attempts');
        expect(validateCliOptions({...base, embedBatch: -1})[0]).toContain('--embed-batch');
    });
});

test.describe('createEmbedFn — drained, validated provider pool', () => {

    const okResponse = input => ({
        ok  : true,
        json: async () => ({data: input.map((_, i) => ({index: i, embedding: [i, 0.5]}))})
    });

    test('batches requests and places embeddings by authoritative index (out-of-order response)', async () => {
        const calls     = [];
        const fetchImpl = async (url, {body}) => {
            const {input} = JSON.parse(body);
            calls.push(input.length);
            return {
                ok  : true,
                json: async () => ({data: input.map((_, i) => ({index: i, embedding: [i]})).reverse()})
            };
        };
        const embedFn = createEmbedFn({url: 'http://x', model: 'm', batch: 2, fetchImpl});
        const vecs    = await embedFn(['a', 'b', 'c']);

        expect(calls.sort()).toEqual([1, 2]);
        expect(vecs).toEqual([[0], [1], [0]]);
    });

    test('FALSIFIER sparse result: a response missing an index REJECTS as malformed — never an undefined hole', async () => {
        const fetchImpl = async (url, {body}) => {
            const {input} = JSON.parse(body);
            return {ok: true, json: async () => ({data: input.slice(1).map((_, i) => ({index: i + 1, embedding: [1]}))})};
        };
        const embedFn = createEmbedFn({url: 'http://x', model: 'm', batch: 4, fetchImpl});

        await expect(embedFn(['a', 'b'])).rejects.toMatchObject({unrecoverableReason: 'embedding-result-malformed'});
    });

    test('FALSIFIER duplicate index REJECTS as malformed', async () => {
        const fetchImpl = async () => ({ok: true, json: async () => ({data: [{index: 0, embedding: [1]}, {index: 0, embedding: [2]}]})});
        const embedFn   = createEmbedFn({url: 'http://x', model: 'm', batch: 4, fetchImpl});

        await expect(embedFn(['a', 'b'])).rejects.toMatchObject({unrecoverableReason: 'embedding-result-malformed'});
    });

    test('FALSIFIER drain: a failing chunk NEVER aborts in-flight siblings — the pool settles before rejecting', async () => {
        let   inFlight    = 0,
              maxInFlight = 0,
              resolved    = 0;
        const fetchImpl = async (url, {body}) => {
            const {input} = JSON.parse(body);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(resolve => setTimeout(resolve, input[0] === 'poison' ? 1 : 15));
            inFlight--;
            if (input[0] === 'poison') {
                return {ok: false, status: 503};
            }
            resolved++;
            return okResponse(input);
        };
        const embedFn = createEmbedFn({url: 'http://x', model: 'm', batch: 1, concurrency: 4, fetchImpl});

        // 'poison' fails FAST while three slow chunks are still in flight — the old fail-fast
        // pool threw here and orphaned them; the drained pool waits for all four.
        await expect(embedFn(['poison', 'slow-1', 'slow-2', 'slow-3'])).rejects.toMatchObject({httpStatus: 503});
        expect(inFlight).toBe(0);
        expect(resolved).toBe(3);
        expect(maxInFlight).toBeLessThanOrEqual(4);
    });

    test('HTTP status is carried on the rejection (fate classification depends on it)', async () => {
        const fetchImpl = async () => ({ok: false, status: 429});
        const embedFn   = createEmbedFn({url: 'http://x', model: 'm', fetchImpl});

        await expect(embedFn(['a'])).rejects.toMatchObject({httpStatus: 429});
    });
});
