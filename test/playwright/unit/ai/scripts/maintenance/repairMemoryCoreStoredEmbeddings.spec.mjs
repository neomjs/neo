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

    test('embedFn returning a wrong-length result throws (fail loud)', async () => {
        const rows = {m: {document: 'dm', metadata: {}}};

        await expect(extractMemoryCoreCollectionData({
            collection: makeCollection(rows), allIds: ['m'], missingVectorIds: ['m'], embedFn: async () => []
        })).rejects.toThrow(/returned 0 embeddings for 1 documents/);
    });

    test('a missing embedFn throws (required param)', async () => {
        await expect(extractMemoryCoreCollectionData({
            collection: makeCollection({}), allIds: [], missingVectorIds: []
        })).rejects.toThrow(/embedFn .* is required/);
    });
});
