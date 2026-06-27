import {test, expect}                                                from '@playwright/test';
import Neo                                                           from '../../../../../../../src/Neo.mjs';
import * as core                                                     from '../../../../../../../src/core/_export.mjs';
import {createReEmbedMissingHeal, createReEmbedMissingHealOperation} from '../../../../../../../ai/services/memory-core/helpers/reEmbedMissingHeal.mjs';

// The autonomous re-embed-missing data-heal: audit the coverage gap → re-embed the orphaned rows from their
// documents → gate each recovered vector through the write invariant → upsert the survivors in place. These
// specs assert the ACT fires end-to-end (the recovered vectors are actually written), that it can never
// reintroduce the metadata-only corruption shape it repairs, and that it is fail-loud on every degraded path.

const DIM = 4;

// A valid DIM-length finite vector, and a wrong-dimension one the write invariant must reject.
function validVector() { return [0.10, 0.20, 0.30, 0.40]; }
function wrongDimVector() { return [0.10, 0.20]; }

// Minimal Chroma double: `.get` returns documents/metadatas only for ids whose metadata row still
// materializes (an absent id models the row that no longer exists → unrecoverable); `.upsert` is recorded.
function mockCollection(docsById = {}) {
    const upserts = [];

    return {
        upserts,
        async get({ids}) {
            const result = {ids: [], documents: [], metadatas: []};

            for (const id of ids) {
                if (Object.hasOwn(docsById, id)) {
                    result.ids.push(id);
                    result.documents.push(docsById[id].document);
                    result.metadatas.push(docsById[id].metadata ?? {});
                }
            }

            return result;
        },
        async upsert(payload) {
            upserts.push(payload);
        }
    };
}

function makeHeal({embedFn, missingVectorIds, expectedDimension = DIM} = {}) {
    return createReEmbedMissingHeal({
        embedFn,
        auditCoverage: async () => ({missingVectorIds}),
        expectedDimension
    });
}

test.describe('Neo.ai.services.memory-core.reEmbedMissingHeal', () => {
    test('re-embeds the missing rows from their documents and upserts the recovered vectors in place', async () => {
        const collection = mockCollection({
            a: {document: 'document a', metadata: {kind: 'turn'}},
            b: {document: 'document b', metadata: {kind: 'turn'}}
        });

        const heal    = makeHeal({embedFn: async docs => docs.map(() => validVector()), missingVectorIds: ['a', 'b']});
        const outcome = await heal({collection, now: 1_000});

        expect(outcome.status).toBe('healed');
        expect(outcome.detail).toMatchObject({reEmbedded: 2, attempted: 2, unrecoverable: 0, healedAt: 1_000});
        expect(outcome.detail.rejected.count).toBe(0);

        // The ACT fired: the recovered vectors were written back in place for exactly the missing ids.
        expect(collection.upserts).toHaveLength(1);
        expect(collection.upserts[0].ids).toEqual(['a', 'b']);
        expect(collection.upserts[0].embeddings).toEqual([validVector(), validVector()]);
        expect(collection.upserts[0].documents).toEqual(['document a', 'document b']);
    });

    test('no missing vectors → clean no-op: never a false heal, never a write', async () => {
        const collection = mockCollection({a: {document: 'document a'}});
        const heal       = makeHeal({embedFn: async docs => docs.map(() => validVector()), missingVectorIds: []});

        const outcome = await heal({collection, now: 2_000});

        expect(outcome.status).toBe('no-op');
        expect(outcome.detail.reEmbedded).toBe(0);
        expect(collection.upserts).toHaveLength(0);
    });

    test('rejects a wrong-dimension re-embed fail-loud — persists only the valid survivor, never the corruption shape', async () => {
        const collection = mockCollection({
            good: {document: 'document good'},
            bad : {document: 'document bad'}
        });

        // embedFn receives the batch in id order and returns one valid vector + one wrong-dimension vector.
        const heal    = makeHeal({embedFn: async docs => docs.map((doc, index) => index === 0 ? validVector() : wrongDimVector()), missingVectorIds: ['good', 'bad']});
        const outcome = await heal({collection, now: 3_000});

        expect(outcome.status).toBe('healed');          // progress was made on the valid row
        expect(outcome.detail.reEmbedded).toBe(1);
        expect(outcome.detail.rejected.count).toBe(1);
        expect(outcome.detail.rejected.byReason).toMatchObject({'wrong-dimension': 1});

        // Only the valid row reached the store — the half-written corruption shape is unrepresentable.
        expect(collection.upserts).toHaveLength(1);
        expect(collection.upserts[0].ids).toEqual(['good']);
        expect(collection.upserts[0].embeddings).toEqual([validVector()]);
    });

    test('missing rows that no longer materialize → failed, fail-loud unrecoverable count, no write', async () => {
        const collection = mockCollection({});   // 'gone' is absent from the metadata read
        const heal       = makeHeal({embedFn: async docs => docs.map(() => validVector()), missingVectorIds: ['gone']});

        const outcome = await heal({collection, now: 4_000});

        expect(outcome.status).toBe('failed');
        expect(outcome.detail.reEmbedded).toBe(0);
        expect(outcome.detail.unrecoverable).toBe(1);
        expect(outcome.detail.unrecoverableIds).toEqual(['gone']);
        expect(collection.upserts).toHaveLength(0);
    });

    test('fail-loud wiring: a missing collaborator throws at construction, never a silent no-op heal', () => {
        expect(() => createReEmbedMissingHeal({auditCoverage: async () => ({}), expectedDimension: DIM}))
            .toThrow(/embedFn/);
        expect(() => createReEmbedMissingHeal({embedFn: async () => [], expectedDimension: DIM}))
            .toThrow(/auditCoverage/);
        expect(() => createReEmbedMissingHeal({embedFn: async () => [], auditCoverage: async () => ({})}))
            .toThrow(/expectedDimension/);
        expect(() => createReEmbedMissingHeal({embedFn: async () => [], auditCoverage: async () => ({}), expectedDimension: 0}))
            .toThrow(/expectedDimension/);
    });
});

test.describe('Neo.ai.services.memory-core.createReEmbedMissingHealOperation (runtime adapter)', () => {
    test('matching collection: awaits ready, resolves the handle + re-audited ids, delegates to the pure op', async () => {
        const calls  = [],
              handle = {name: 'neo-agent-memory'};
        let   readied = false;

        const op = createReEmbedMissingHealOperation({
            reEmbedMissing         : args => { calls.push(args); return {status: 'healed', detail: {reEmbedded: 2}}; },
            ready                  : async () => { readied = true; },
            getMemoryCollection    : async () => handle,
            resolveMissingVectorIds: async name => name === 'neo-agent-memory' ? ['a', 'b'] : []
        });

        const outcome = await op({collection: 'neo-agent-memory', evidence: {countOnly: 2}, now: 1_000});

        expect(readied).toBe(true);
        expect(outcome).toMatchObject({status: 'healed'});
        expect(calls).toHaveLength(1);
        // the pure op receives the live HANDLE + the re-audited ids (NOT the count-only runtime evidence)
        expect(calls[0]).toMatchObject({collection: handle, evidence: {missingVectorIds: ['a', 'b']}, now: 1_000});
    });

    test('cross-store guard: a handle that is not the diagnosed collection no-ops without delegating', async () => {
        let delegated = false;

        const op = createReEmbedMissingHealOperation({
            reEmbedMissing         : () => { delegated = true; return {status: 'healed'}; },
            getMemoryCollection    : async () => ({name: 'neo-agent-memory'}),
            resolveMissingVectorIds: async () => ['x']
        });

        const outcome = await op({collection: 'some-other-collection', now: 2_000});

        expect(outcome.status).toBe('no-op');
        expect(outcome.detail.collectionName).toBe('some-other-collection');
        expect(delegated).toBe(false);
    });

    test('fail-loud wiring: a missing collaborator throws at construction', () => {
        expect(() => createReEmbedMissingHealOperation({getMemoryCollection: async () => ({}), resolveMissingVectorIds: async () => []}))
            .toThrow(/reEmbedMissing/);
        expect(() => createReEmbedMissingHealOperation({reEmbedMissing: () => {}, resolveMissingVectorIds: async () => []}))
            .toThrow(/getMemoryCollection/);
        expect(() => createReEmbedMissingHealOperation({reEmbedMissing: () => {}, getMemoryCollection: async () => ({})}))
            .toThrow(/resolveMissingVectorIds/);
    });
});
