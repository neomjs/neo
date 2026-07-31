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
    rebuildCollections
} from '../../../../../../ai/scripts/maintenance/rebuildMemoryCoreVectorStore.mjs';

/**
 * Mock Chroma collection over `rows` ({id: {document, metadata}}). Supports BOTH get shapes the
 * runner exercises: ids-based (extraction) and limit/offset paging (readAllIds). `add` appends
 * into `rows` so resume + targetAfter reconciliation run against real mutation.
 */
function makeCollection(rows = {}) {
    const col = {
        rows,
        addCalls: [],
        get     : async ({ids, limit, offset = 0, include = []}) => {
            const pick = ids ?? Object.keys(rows).slice(offset, limit ? offset + limit : undefined);
            const out  = {ids: []};
            if (include.includes('documents'))  out.documents  = [];
            if (include.includes('metadatas'))  out.metadatas  = [];
            for (const id of pick) {
                const row = rows[id];
                if (!row) continue;
                out.ids.push(id);
                if (out.documents)  out.documents.push(row.document ?? null);
                if (out.metadatas)  out.metadatas.push(row.metadata ?? {});
            }
            return out;
        },
        add: async ({ids, embeddings, documents, metadatas}) => {
            col.addCalls.push({ids, embeddings});
            ids.forEach((id, i) => { rows[id] = {document: documents[i], metadata: metadatas[i], embedding: embeddings[i]} });
        }
    };
    return col;
}

const makeClient = cols => ({
    getCollection        : async ({name}) => { if (!cols[name]) throw new Error(`no collection ${name}`); return cols[name] },
    getOrCreateCollection: async ({name}) => (cols[name] ??= makeCollection())
});

const sourceRows = n => Object.fromEntries(
    Array.from({length: n}, (_, i) => [`id-${i}`, {document: `doc ${i}`, metadata: {type: 'memory'}}])
);

// Deterministic fake embedder: one vector per document, first component encodes order.
const fakeEmbedFn = async docs => docs.map((_, i) => [i, 0.5]);

test.describe('Neo.ai.scripts.maintenance.rebuildMemoryCoreVectorStore', () => {

    test('full rebuild re-embeds every source document into the fresh target', async () => {
        const source  = {mem: makeCollection(sourceRows(12))};
        const target  = {};
        const receipt = await rebuildCollections({
            sourceClient: makeClient(source),
            targetClient: makeClient(target),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            getBatch    : 5,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({name: 'mem', source: 12, planned: 12, targetBefore: 0, targetAfter: 12, reEmbedded: 12});
        expect(receipt.collections[0].failed).toEqual([]);
        // Embeddings actually landed on the target rows (not merely accepted).
        expect(Object.values(target.mem.rows).every(row => Array.isArray(row.embedding))).toBe(true);
    });

    test('resume: ids already in the target are skipped, not re-embedded', async () => {
        const source = {mem: makeCollection(sourceRows(10))};
        const target = {mem: makeCollection(sourceRows(4))}; // id-0..id-3 already present

        const receipt = await rebuildCollections({
            sourceClient: makeClient(source),
            targetClient: makeClient(target),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({targetBefore: 4, targetAfter: 10, reEmbedded: 6, resumedExisting: 4});
    });

    test('failed rows surface as per-reason receipts, flip ok to false, and the done-line carries the fate rollup', async () => {
        const rows = sourceRows(6);
        rows['id-3'].document = null; // no document, non-turn metadata -> terminal content problem

        const lines   = [];
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(rows)}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            log         : line => lines.push(line)
        });

        expect(receipt.ok).toBe(false);
        // Per-reason receipt row, not a per-row dump: fate stamped, samples capped.
        expect(receipt.collections[0].failed).toEqual([
            {reason: 'document-missing', count: 1, retryable: false, sampleIds: ['id-3']}
        ]);
        expect(receipt.collections[0].targetAfter).toBe(5);
        expect(lines.at(-1)).toContain('failed=1 (0 resumable, 1 terminal)');
    });

    test('a transient embed outage is absorbed by bounded retry — no failed receipts', async () => {
        let   failuresLeft = 1;
        const embedFn      = async docs => {
            if (failuresLeft-- > 0) throw new Error('queue timeout');
            return docs.map((_, i) => [i]);
        };

        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(4))}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn,
            embedRetry  : {attempts: 2, wait: async () => {}},
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({targetAfter: 4, reEmbedded: 4, failed: []});
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

    test('pilot --limit slices the planned set without touching the rest', async () => {
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(20))}),
            targetClient: makeClient({}),
            collections : ['mem'],
            embedFn     : fakeEmbedFn,
            limit       : 5,
            log         : () => {}
        });

        expect(receipt.collections[0]).toMatchObject({source: 20, planned: 5, targetAfter: 5});
        expect(receipt.ok).toBe(true);
    });

    test('dry-run counts and writes nothing', async () => {
        const target  = {};
        const receipt = await rebuildCollections({
            sourceClient: makeClient({mem: makeCollection(sourceRows(7))}),
            targetClient: makeClient(target),
            collections : ['mem'],
            embedFn     : async () => { throw new Error('must not embed on dry-run') },
            dryRun      : true,
            log         : () => {}
        });

        expect(receipt.ok).toBe(true);
        expect(receipt.collections[0]).toMatchObject({source: 7, dryRun: true});
        expect(target.mem.addCalls).toEqual([]);
    });

    test('readAllIds paginates past one page', async () => {
        const ids = await readAllIds(makeCollection(sourceRows(7)), 3);
        expect(ids).toHaveLength(7);
        expect(ids[6]).toBe('id-6');
    });

    test('createEmbedFn batches requests and restores index order', async () => {
        const calls     = [];
        const fetchImpl = async (url, {body}) => {
            const {input} = JSON.parse(body);
            calls.push(input.length);
            return {
                ok  : true,
                json: async () => ({
                    // Deliberately out of order: index must be authoritative.
                    data: input.map((_, i) => ({index: i, embedding: [i]})).reverse()
                })
            };
        };
        const embedFn = createEmbedFn({url: 'http://x', model: 'm', batch: 2, fetchImpl});
        const vecs    = await embedFn(['a', 'b', 'c']);

        // Chunks fire concurrently, so call order is not deterministic — the multiset is.
        expect(calls.sort()).toEqual([1, 2]);
        expect(vecs).toEqual([[0], [1], [0]]);
    });

    test('createEmbedFn keeps chunk placement correct under concurrency with unequal latencies', async () => {
        const fetchImpl = async (url, {body}) => {
            const {input} = JSON.parse(body);
            // First chunk (contains 'a0') resolves SLOWER than later chunks — placement must
            // come from chunk offsets, never from completion order.
            await new Promise(resolve => setTimeout(resolve, input[0] === 'a0' ? 30 : 1));
            return {
                ok  : true,
                json: async () => ({data: input.map((doc, i) => ({index: i, embedding: [Number(doc.slice(1))]}))})
            };
        };
        const embedFn = createEmbedFn({url: 'http://x', model: 'm', batch: 2, concurrency: 3, fetchImpl});
        const vecs    = await embedFn(['a0', 'a1', 'a2', 'a3', 'a4']);

        expect(vecs).toEqual([[0], [1], [2], [3], [4]]);
    });
});
