import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'RepairMcStoredEmbeddingsTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../src/core/_export.mjs';
import {
    embedRecoverableDocuments,
    extractMemoryCoreCollectionData,
    truncateToByteBudget,
    truncateToEmbedTokenBudget
} from '../../../../../../ai/scripts/maintenance/repairMemoryCoreStoredEmbeddings.mjs';
import AiConfig         from '../../../../../../ai/mcp/server/memory-core/config.mjs';

/**
 * Mock Chroma collection: `rows` is `{ id: {embedding?, document?, metadata?} }`. `.get` returns only
 * the requested `include` fields, and only for ids present in `rows` (absent ids are simply not returned,
 * mirroring a metadata read that can't find an id).
 */
function makeCollection(rows) {
    return {
        get: async ({ids, include = []}) => {
            const out = {ids: []};
            if (include.includes('embeddings')) out.embeddings = [];
            if (include.includes('documents'))  out.documents  = [];
            if (include.includes('metadatas'))  out.metadatas  = [];

            for (const id of ids) {
                const row = rows[id];
                if (!row) continue;
                out.ids.push(id);
                if (out.embeddings) out.embeddings.push(row.embedding ?? null);
                if (out.documents)  out.documents.push(row.document ?? null);
                if (out.metadatas)  out.metadatas.push(row.metadata ?? {});
            }
            return out;
        }
    };
}

test.describe('extractMemoryCoreCollectionData — MC stored-embedding repair extraction', () => {
    test('intact-only collection: extracts all, re-embeds none, embedFn never called', async () => {
        const rows       = {a: {embedding: [1], document: 'da', metadata: {}}, b: {embedding: [2], document: 'db', metadata: {}}};
        let   embedCalls = 0;
        const embedFn    = async docs => { embedCalls++; return docs.map(() => [9]); };

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['a', 'b'], missingVectorIds: [], embedFn
        });

        expect(result.counts).toEqual({total: 2, intact: 2, reEmbedded: 0, unrecoverable: 0});
        expect(result.data.ids.sort()).toEqual(['a', 'b']);
        expect(embedCalls).toBe(0);
    });

    test('mixed: intact rows keep stored embeddings, missing rows are re-embedded from documents', async () => {
        const rows    = {a: {embedding: [1], document: 'da', metadata: {}}, m: {document: 'dm', metadata: {k: 1}}};
        const embedFn = async docs => docs.map(() => [7, 7]);

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['a', 'm'], missingVectorIds: ['m'], embedFn
        });

        expect(result.counts).toEqual({total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0});
        expect(result.data.embeddings[result.data.ids.indexOf('m')]).toEqual([7, 7]); // re-embedded
        expect(result.data.embeddings[result.data.ids.indexOf('a')]).toEqual([1]);    // stored, untouched
    });

    test('can stream recovered batches without retaining full collection data in memory', async () => {
        const rows    = {a: {embedding: [1], document: 'da', metadata: {}}, m: {document: 'dm', metadata: {k: 1}}};
        const batches = [];

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection(rows),
            allIds          : ['a', 'm'],
            missingVectorIds: ['m'],
            embedFn         : async docs => docs.map(() => [7]),
            batchSize       : 1,
            collectData     : false,
            onDataBatch     : async batchData => batches.push(batchData)
        });

        expect(result.data).toEqual({ids: [], embeddings: [], documents: [], metadatas: []});
        expect(result.counts).toEqual({total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0});
        expect(batches.map(batch => batch.ids)).toEqual([['a'], ['m']]);
    });

    test('skipIds prevents already shadow-loaded rows from being re-extracted or re-embedded', async () => {
        const rows       = {a: {embedding: [1], document: 'da', metadata: {}}, m: {document: 'dm', metadata: {k: 1}}};
        let   embedCalls = 0;

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection(rows),
            allIds          : ['a', 'm'],
            missingVectorIds: ['m'],
            skipIds         : ['a'],
            embedFn         : async docs => {
                embedCalls++;
                return docs.map(() => [7]);
            }
        });

        expect(result.data.ids).toEqual(['m']);
        expect(result.counts).toEqual({total: 2, intact: 0, reEmbedded: 1, unrecoverable: 0, resumedExisting: 1});
        expect(embedCalls).toBe(1);
    });

    test('missing-vector rows with empty or missing documents are unrecoverable with distinct reasons', async () => {
        const rows = {
            empty  : {document: '', metadata: {}},
            missing: {metadata: {}},
            n      : {document: 'dn', metadata: {}}
        };
        const embedFn = async docs => docs.map(() => [5]);

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection(rows),
            allIds          : ['empty', 'missing', 'n'],
            missingVectorIds: ['empty', 'missing', 'n'],
            embedFn
        });

        expect(result.unrecoverable).toEqual([
            {id: 'empty', reason: 'document-empty', message: 'document field was empty'},
            {id: 'missing', reason: 'document-missing', message: 'document field was missing from the Chroma metadata read'}
        ]);
        expect(result.unrecoverableIds).toEqual(['empty', 'missing']);
        expect(result.counts).toEqual({total: 3, intact: 0, reEmbedded: 1, unrecoverable: 2});
    });

    test('a de-duped turn (dropped document, split turn metadata) is reconstructed + re-embedded, not unrecoverable (#14218)', async () => {
        let   embeddedDocs = [];
        const embedFn      = async docs => { embeddedDocs = docs; return docs.map(() => [4, 4]); };
        const rows         = {
            intact : {embedding: [1, 1], document: 'doc-a', metadata: {type: 'agent-interaction'}},
            // missing-vector row whose stored document the de-dup dropped — only the split fields remain:
            deduped: {metadata: {type: 'agent-interaction', prompt: 'p', thought: 't', response: 'r'}}
        };

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['intact', 'deduped'], missingVectorIds: ['deduped'], embedFn
        });

        // The dropped turn-document is reconstructed from its split metadata (byte-identical to the write)
        // and re-embedded — recovered, NOT marked unrecoverable.
        expect(result.counts).toEqual({total: 2, intact: 1, reEmbedded: 1, unrecoverable: 0});
        expect(embeddedDocs).toEqual(['User Prompt: p\nAgent Thought: t\nAgent Response: r']);
    });

    test('a missing-vector NON-turn (summary) with a dropped document stays unrecoverable — no false recovery (#14218)', async () => {
        const embedFn = async docs => docs.map(() => [5]);
        // a summary (non-turn) is never reconstructed via the turn template; a dropped doc → unrecoverable
        const rows = {summary: {metadata: {type: 'session-summary'}}};

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['summary'], missingVectorIds: ['summary'], embedFn
        });

        expect(result.counts).toEqual({total: 1, intact: 0, reEmbedded: 0, unrecoverable: 1});
    });

    test('a missing id absent from the metadata read is unrecoverable', async () => {
        const rows    = {n: {document: 'dn', metadata: {}}}; // 'gone' is not in the row map
        const embedFn = async docs => docs.map(() => [5]);

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['n', 'gone'], missingVectorIds: ['n', 'gone'], embedFn
        });

        expect(result.unrecoverable).toEqual([{
            id     : 'gone',
            reason : 'metadata-row-missing',
            message: 'id was absent from the Chroma documents/metadatas read'
        }]);
        expect(result.unrecoverableIds).toEqual(['gone']);
        expect(result.counts.reEmbedded).toBe(1);
    });

    test('batch embed failure binary-splits to isolate only the failed doc as unrecoverable', async () => {
        const rows = {
            ok     : {document: 'small', metadata: {}},
            overcap: {document: 'too-large', metadata: {}},
            ok2    : {document: 'small-2', metadata: {}}
        };
        const calls = [];

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection(rows),
            allIds          : ['ok', 'overcap', 'ok2'],
            missingVectorIds: ['ok', 'overcap', 'ok2'],
            embedFn         : async docs => {
                calls.push(docs);

                if (docs.length > 1 || docs[0] === 'too-large') {
                    throw new Error('context overflow');
                }

                return [[docs[0].length]];
            }
        });

        // Binary-split: the full batch fails → the [small] half succeeds as a batch → the
        // [too-large, small-2] half fails → splits again, isolating [too-large] (the unrecoverable)
        // while [small-2] recovers. Survivors are re-batched where possible, not forced 1-by-1.
        expect(calls).toEqual([
            ['small', 'too-large', 'small-2'],
            ['small'],
            ['too-large', 'small-2'],
            ['too-large'],
            ['small-2']
        ]);
        expect(result.unrecoverable).toEqual([{
            id     : 'overcap',
            reason : 'embedding-provider-error',
            message: 'context overflow'
        }]);
        expect(result.unrecoverableIds).toEqual(['overcap']);
        expect(result.data.ids).toEqual(['ok', 'ok2']);
        expect(result.counts).toEqual({total: 3, intact: 0, reEmbedded: 2, unrecoverable: 1});
    });

    test('reports 10%-bucket progress for intact extraction and missing-vector re-embed', async () => {
        const intactIds  = Array.from({length: 10}, (_, i) => `i${i}`),
              missingIds = Array.from({length: 10}, (_, i) => `m${i}`),
              rows       = {};

        for (const id of intactIds) {
            rows[id] = {embedding: [1], document: `doc-${id}`, metadata: {}};
        }

        for (const id of missingIds) {
            rows[id] = {document: `doc-${id}`, metadata: {}};
        }

        const events = [];

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection(rows),
            allIds          : [...intactIds, ...missingIds],
            missingVectorIds: missingIds,
            batchSize       : 1,
            embedFn         : async docs => docs.map(() => [7]),
            onProgress      : event => events.push(event)
        });

        expect(result.counts).toEqual({total: 20, intact: 10, reEmbedded: 10, unrecoverable: 0});
        expect(events.filter(event => event.phase === 'intact-extract').map(event => event.percent))
            .toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
        expect(events.filter(event => event.phase === 'missing-reembed').map(event => event.percent))
            .toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
        expect(events.at(0)).toMatchObject({phase: 'start', percent: 0, processed: 0, total: 20});
        expect(events.at(-1)).toMatchObject({
            phase  : 'complete',
            percent: 100,
            counts : {total: 20, intact: 10, reEmbedded: 10, unrecoverable: 0}
        });
    });

    test('embedFn returning wrong-length results marks the row unrecoverable instead of crashing repair progress', async () => {
        const rows = {m: {document: 'dm', metadata: {}}};

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['m'], missingVectorIds: ['m'], embedFn: async () => []
        });

        expect(result.unrecoverable).toEqual([{
            id     : 'm',
            reason : 'embedding-result-malformed',
            message: 'embedFn returned 0 embeddings for 1 documents'
        }]);
        expect(result.unrecoverableIds).toEqual(['m']);
        expect(result.counts).toEqual({total: 1, intact: 0, reEmbedded: 0, unrecoverable: 1});
    });

    test('a missing embedFn throws (required param)', async () => {
        await expect(extractMemoryCoreCollectionData({
            collection: makeCollection({}), allIds: [], missingVectorIds: []
        })).rejects.toThrow(/embedFn .* is required/);
    });
});

test.describe('embedRecoverableDocuments — binary-split isolate-then-rebatch (#14081)', () => {
    test('isolates the failing doc to its exact index and re-batches survivors (not 1-by-1)', async () => {
        // POISON makes any batch containing it throw — the single-oversized-doc graph-recovery case.
        const docs               = ['d0', 'd1', 'd2', 'd3', 'd4', 'POISON', 'd6', 'd7'];
        let   maxSuccessfulBatch = 0;
        const embedFn            = async batch => {
            if (batch.includes('POISON')) {
                throw new Error('embedding-provider-error: context too small');
            }
            maxSuccessfulBatch = Math.max(maxSuccessfulBatch, batch.length);
            return batch.map(() => [1, 2]);
        };

        const {embeddings, failedIndexes, failures} = await embedRecoverableDocuments({
            embedFn, ids: docs.map((_, i) => `id-${i}`), documents: docs
        });

        // Failure pinned to the exact poison index; every survivor recovered.
        expect([...failedIndexes]).toEqual([5]);
        expect(failures[0].index).toBe(5);
        expect(embeddings[5]).toBeUndefined();
        for (const i of [0, 1, 2, 3, 4, 6, 7]) {
            expect(embeddings[i]).toEqual([1, 2]);
        }

        // Survivors were RE-BATCHED: at least one successful embed ran with >1 doc. The old
        // per-document fallback embedded every survivor individually, so its largest successful
        // batch would have been 1.
        expect(maxSuccessfulBatch).toBeGreaterThan(1);
    });

    test('all-success batch embeds in a single call, no splitting (happy path unchanged)', async () => {
        let   calls   = 0;
        const embedFn = async batch => { calls++; return batch.map(() => [3]); };

        const {embeddings, failedIndexes} = await embedRecoverableDocuments({
            embedFn, ids: ['a', 'b', 'c'], documents: ['a', 'b', 'c']
        });

        expect([...failedIndexes]).toEqual([]);
        expect(embeddings).toEqual([[3], [3], [3]]);
        expect(calls).toBe(1);
    });
});

test.describe('truncateToEmbedTokenBudget — oversized-document recovery (the Prevent floor)', () => {
    test('pins mc-repair-v1 to the current oversized-document embeddability behavior', async () => {
        const BUDGET            = 50,
              oversized         = 'z'.repeat(900),
              stillUnembeddable = '',
              prepared          = truncateToEmbedTokenBudget(oversized, BUDGET);

        expect(AiConfig.memoryRepair.strategyVersion).toBe('mc-repair-v1');
        expect(prepared.length).toBeGreaterThan(0);
        expect(prepared.length).toBeLessThan(oversized.length);
        expect(Math.ceil(Buffer.byteLength(prepared, 'utf8') / 3)).toBeLessThanOrEqual(BUDGET);

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection({
                recovered: {document: oversized, metadata: {}},
                terminal : {document: stillUnembeddable, metadata: {}}
            }),
            allIds          : ['recovered', 'terminal'],
            missingVectorIds: ['recovered', 'terminal'],
            embedFn         : async docs => docs.map(doc => {
                const candidate = truncateToEmbedTokenBudget(doc, BUDGET),
                      docTokens = Math.ceil(Buffer.byteLength(candidate, 'utf8') / 3);
                if (docTokens > BUDGET) {
                    const error = new Error('embedding context exceeded');
                    error.unrecoverableReason = 'embedding-context-exceeded';
                    throw error;
                }
                return [1, 2, 3];
            })
        });

        expect(result.counts).toEqual({total: 2, intact: 0, reEmbedded: 1, unrecoverable: 1});
        expect(result.data.ids).toEqual(['recovered']);
        expect(result.unrecoverable).toMatchObject([{id: 'terminal', reason: 'document-empty'}]);
    });

    test('returns text unchanged when within the token budget (no-op)', () => {
        const text = 'a short document';
        expect(truncateToEmbedTokenBudget(text, 1000)).toBe(text);
    });

    test('truncates an over-budget document to a prefix estimated to fit the budget', () => {
        const text = 'x'.repeat(30000),            // ~10000 tokens at ~3 bytes/token
              truncated = truncateToEmbedTokenBudget(text, 100);

        expect(truncated.length).toBeLessThan(text.length);
        expect(text.startsWith(truncated)).toBe(true);  // a genuine prefix, not a re-encoding
        expect(Math.ceil(Buffer.byteLength(truncated, 'utf8') / 3)).toBeLessThanOrEqual(100);
    });

    test('applies the dense-content safety margin — the truncated prefix lands UNDER budget, not just at it', () => {
        // Dense multi-byte content (CJK, 3 bytes/char): bytesToTokens under-estimates real tokens here, so
        // the ~0.9 margin shaves the prefix below the raw budget to keep dense docs recoverable.
        const text = '世'.repeat(4000),   // ~12000 bytes ≈ 4000 heuristic-tokens
              truncated = truncateToEmbedTokenBudget(text, 100);

        expect(text.startsWith(truncated)).toBe(true);
        // estimate sits at/below the margin (0.9 × 100), leaving headroom for the denser real tokenization
        expect(Math.ceil(Buffer.byteLength(truncated, 'utf8') / 3)).toBeLessThanOrEqual(90);
    });

    test('never splits a multi-byte UTF-8 character', () => {
        const text = '😀'.repeat(5000),            // 4 bytes each
              truncated = truncateToEmbedTokenBudget(text, 100);

        expect(truncated.length).toBeGreaterThan(0);
        expect(truncated.length).toBeLessThan(text.length);
        expect([...truncated].every(char => char === '😀')).toBe(true);  // no broken/replacement char
    });

    test('is a no-op for a non-positive budget or non-string input (degrades to current behavior)', () => {
        expect(truncateToEmbedTokenBudget('abc', 0)).toBe('abc');
        expect(truncateToEmbedTokenBudget('abc', -5)).toBe('abc');
        expect(truncateToEmbedTokenBudget(null, 100)).toBe(null);
    });

    test('truncateToByteBudget respects the byte budget and never cuts a multi-byte char in half', () => {
        expect(truncateToByteBudget('hello', 100)).toBe('hello');                                  // under budget → unchanged
        expect(Buffer.byteLength(truncateToByteBudget('a'.repeat(50), 10), 'utf8')).toBeLessThanOrEqual(10);
        expect(truncateToByteBudget('😀😀', 5)).toBe('😀');                                         // 4-byte char that overflows is dropped whole
    });

    test('a budget-aware embedFn RECOVERS an oversized document instead of marking it unrecoverable', async () => {
        const BUDGET = 50,                 // tiny test token budget
              oversized = 'y'.repeat(900);    // ~300 tokens — exceeds BUDGET

        // Mirror the production embedFn wrapper: truncate each doc to the budget, then embed. The fake
        // provider REJECTS input still over budget (its context assertion) and SUCCEEDS otherwise.
        const budgetAwareEmbedFn = async docs => docs.map(doc => {
            const prepared = truncateToEmbedTokenBudget(doc, BUDGET);

            if (Math.ceil(Buffer.byteLength(prepared, 'utf8') / 3) > BUDGET) {
                throw new Error('embedding context too small (context overflow)');
            }

            return [1, 2, 3];
        });

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection({m: {document: oversized, metadata: {}}}),
            allIds          : ['m'],
            missingVectorIds: ['m'],
            embedFn         : budgetAwareEmbedFn
        });

        expect(result.counts).toEqual({total: 1, intact: 0, reEmbedded: 1, unrecoverable: 0});
        expect(result.data.ids).toEqual(['m']);
        expect(result.unrecoverableIds).toEqual([]);
    });

    test('the gap this closes: without budget-aware truncation the same oversized document stays unrecoverable', async () => {
        const oversized = 'y'.repeat(900);
        // A raw embedFn (no truncation) that rejects the oversized doc — the pre-truncation behavior.
        const rawEmbedFn = async () => { throw new Error('embedding context too small (context overflow)'); };

        const result = await extractMemoryCoreCollectionData({
            collection      : makeCollection({m: {document: oversized, metadata: {}}}),
            allIds          : ['m'],
            missingVectorIds: ['m'],
            embedFn         : rawEmbedFn
        });

        expect(result.counts.reEmbedded).toBe(0);
        expect(result.counts.unrecoverable).toBe(1);
        expect(result.unrecoverableIds).toEqual(['m']);
    });
});
