import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'RepairMcStoredEmbeddingsTest', isMounted: () => true, vnodeInitialising: false}
});

import {test, expect}                    from '@playwright/test';
import Neo                               from '../../../../../../src/Neo.mjs';
import * as core                         from '../../../../../../src/core/_export.mjs';
import {extractMemoryCoreCollectionData} from '../../../../../../ai/scripts/maintenance/repairMemoryCoreStoredEmbeddings.mjs';

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

    test('a missing-vector row with no document is unrecoverable, not silently dropped', async () => {
        const rows    = {m: {document: '', metadata: {}}, n: {document: 'dn', metadata: {}}};
        const embedFn = async docs => docs.map(() => [5]);

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['m', 'n'], missingVectorIds: ['m', 'n'], embedFn
        });

        expect(result.unrecoverable).toEqual(['m']);
        expect(result.counts).toEqual({total: 2, intact: 0, reEmbedded: 1, unrecoverable: 1});
    });

    test('a missing id absent from the metadata read is unrecoverable', async () => {
        const rows    = {n: {document: 'dn', metadata: {}}}; // 'gone' is not in the row map
        const embedFn = async docs => docs.map(() => [5]);

        const result = await extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['n', 'gone'], missingVectorIds: ['n', 'gone'], embedFn
        });

        expect(result.unrecoverable).toEqual(['gone']);
        expect(result.counts.reEmbedded).toBe(1);
    });

    test('batch embed failure falls back to single-document isolation and marks only failed docs unrecoverable', async () => {
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

        expect(calls).toEqual([
            ['small', 'too-large', 'small-2'],
            ['small'],
            ['too-large'],
            ['small-2']
        ]);
        expect(result.unrecoverable).toEqual(['overcap']);
        expect(result.data.ids).toEqual(['ok', 'ok2']);
        expect(result.counts).toEqual({total: 3, intact: 0, reEmbedded: 2, unrecoverable: 1});
    });

    test('reports 10%-bucket progress for intact extraction and missing-vector re-embed', async () => {
        const intactIds = Array.from({length: 10}, (_, i) => `i${i}`),
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

        expect(result.unrecoverable).toEqual(['m']);
        expect(result.counts).toEqual({total: 1, intact: 0, reEmbedded: 0, unrecoverable: 1});
    });

    test('a missing embedFn throws (required param)', async () => {
        await expect(extractMemoryCoreCollectionData({
            collection: makeCollection({}), allIds: [], missingVectorIds: []
        })).rejects.toThrow(/embedFn .* is required/);
    });
});
