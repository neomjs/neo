import {setup} from '../../../../setup.mjs';

const appName = 'KBOllamaIngestSeamTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../../src/Neo.mjs';
import * as core          from '../../../../../../src/core/_export.mjs';
import {snapshotAiConfig} from '../memory-core/util.mjs';

/**
 * @summary The KB ingest path driven through the NATIVE OLLAMA provider seam.
 *
 * Every other KB ingest spec replaces `TextEmbeddingService.embedTexts` with a fake. That is correct
 * for what those specs test — VectorService's batch and slice bookkeeping is genuinely above the
 * provider seam — but it means the suite has **never dispatched through that seam**, and no KB spec
 * drives `embeddingProvider: 'ollama'` at all.
 *
 * So two halves were each covered and their composition was not:
 *
 *   - above the seam: VectorService bookkeeping, provider-agnostic, stubbed — green on both providers
 *   - below the seam: `embedTexts(texts, 'ollama')` shape — covered in `TextEmbeddingService.spec.mjs`
 *   - the JOIN: `embedChunks` running with the provider set to ollama — nothing
 *
 * That gap is why "the fixes are provider-independent by construction" could not be told apart from
 * "nobody asked". These tests ask. They cannot prove a real model answers correctly — that needs a
 * plane — but they prove the code path binds vectors to ids correctly when it does.
 *
 * **Scope corrected after review.** The malformed-response cases below are a CONTRACT defect, not a
 * data-corruption one: ChromaDB refuses both mismatched and empty record sets before any API call,
 * so a misbound set never reached a corpus. The guard moves the failure to the layer that can name
 * it. The collection double models those refusals for exactly that reason — see its comment.
 *
 * Serial: these mutate the shared embedding-provider selector and the `ollamaProvider` singleton.
 */
test.describe.configure({mode: 'serial'});

/**
 * @summary A collection double that REFUSES what the real one refuses.
 *
 * The first version of this accepted any `{ids, embeddings}` pair, and that deleted an invariant
 * rather than simulating one. ChromaDB 3.5.0 validates the record set BEFORE any API call — unequal
 * field lengths throw `ChromaValueError: Unequal lengths for fields …`, and a zero-length list
 * throws `Non-empty lists are required for …`. A permissive double removes both, and every
 * assertion downstream of that removal becomes a property of the double instead of the system.
 *
 * That is how this spec originally "proved" misbound vectors reaching a corpus that cannot accept
 * them. When a test replaces a boundary, model what the boundary REJECTS, not only what it records.
 */
function createSpyCollection() {
    const upserts = [];

    return {
        upserts,
        name: 'spy-knowledge-base',
        async upsert({ids, embeddings, metadatas}) {
            const lengths = [['ids', ids?.length], ['embeddings', embeddings?.length], ['metadatas', metadatas?.length]]
                .filter(([, length]) => Number.isFinite(length));

            if (lengths.some(([, length]) => length === 0)) {
                throw new Error(`Non-empty lists are required for ${lengths.filter(([, l]) => l === 0).map(([f]) => f).join(', ')}`);
            }

            if (new Set(lengths.map(([, length]) => length)).size > 1) {
                throw new Error(`Unequal lengths for fields ${lengths.map(([field]) => field).join(', ')}`);
            }

            upserts.push({ids: [...ids], embeddings});
        }
    };
}

function makeChunks(count) {
    return Array.from({length: count}, (_, i) => ({
        id     : `chunk-${i}`,
        type   : 'guide',
        name   : `symbol-${i}`,
        content: `body for chunk ${i}`
    }));
}

test.describe('VectorService KB ingest — the native Ollama provider seam', () => {
    let KB_VectorService, KB_Config, MC_Config, TextEmbeddingService;
    let restoreKBConfig, restoreMCConfig, originalOllamaProvider;

    test.beforeAll(async () => {
        const SDK = await import('../../../../../../ai/services.mjs');

        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;
        MC_Config            = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        KB_VectorService     = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;

        originalOllamaProvider = TextEmbeddingService.ollamaProvider;
    });

    test.afterAll(() => {
        TextEmbeddingService.ollamaProvider = originalOllamaProvider;
    });

    test.beforeEach(() => {
        // The shipped snapshot primitive rather than a hand-rolled save/restore. It captures by
        // resolved value — the Provider's getOwnPropertyDescriptor trap misses leaves its get trap
        // resolves — and it throws if a leaf does not already resolve, which a hand-rolled capture
        // silently tolerates and then cannot undo.
        restoreMCConfig = snapshotAiConfig(MC_Config, ['embeddingProvider']);
        restoreKBConfig = snapshotAiConfig(KB_Config, [
            'data.batchSize',
            'data.batchDelay',
            'data.maxRetries'
        ]);

        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
        MC_Config.embeddingProvider = 'ollama';
    });

    test.afterEach(() => {
        restoreKBConfig?.();
        restoreMCConfig?.();
    });

    test('the collection double REFUSES what ChromaDB refuses — the instrument\'s own control', async () => {
        // Pins the double's fidelity so a permissive one cannot be reintroduced. The first version of
        // this spec accepted any {ids, embeddings} pair and thereby "proved" misbound vectors landing
        // in a corpus that cannot accept them — the assertion was a property of the double.
        //
        // ChromaDB 3.5.0 validates the record set BEFORE any API call, so these two refusals are
        // mandatory, not incidental. Verified against the installed client rather than assumed.
        const spy = createSpyCollection();

        const unequal = await spy.upsert({ids: ['a', 'b', 'c'], embeddings: [[0.1], [0.2]], metadatas: [{}, {}, {}]})
            .then(() => null, error => error);
        const empty = await spy.upsert({ids: ['a'], embeddings: [], metadatas: [{}]})
            .then(() => null, error => error);

        expect(unequal?.message, 'three ids against two vectors is refused, not stored').toContain('Unequal lengths');
        expect(empty?.message, 'a zero-length vector list is refused too').toContain('Non-empty lists');
        expect(spy.upserts, 'and neither reached the store').toEqual([]);
    });

    test('rows LAND end to end through the ollama seam — the client requirement, in CI', async () => {
        // Asserts rows landing, not that a call was made. A spec that only counted dispatches would
        // pass against a path that upserts nothing, which is the exact shape of the two-month
        // incident: work issued, corpus still empty.
        const spy = createSpyCollection();

        TextEmbeddingService.ollamaProvider = {
            async embed(input) {
                const texts = Array.isArray(input) ? input : [input];
                return {embeddings: texts.map((_, i) => [0.1 + i, 0.2, 0.3])}
            }
        };

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: makeChunks(3)});

        expect(result.embedded, 'three chunks in, three embedded').toBe(3);
        expect(spy.upserts).toHaveLength(1);
        expect(spy.upserts[0].ids).toEqual(['chunk-0', 'chunk-1', 'chunk-2']);
        expect(spy.upserts[0].embeddings, 'one vector per id, in id order')
            .toEqual([[0.1, 0.2, 0.3], [1.1, 0.2, 0.3], [2.1, 0.2, 0.3]]);
    });

    test('a SHORT ollama response is refused, not bound to ids by position', async () => {
        // The ollama branch returned `result.embeddings` with no length check, so a response carrying
        // two vectors for three inputs travelled to the collection as a mismatched record set.
        //
        // What this does NOT do, corrected after @neo-gpt probed the installed client: it does not
        // reach the corpus. ChromaDB 3.5.0 refuses unequal field lengths before any API call, so the
        // sweep already failed loud. The guard's value is WHERE the failure surfaces — local to the
        // input count, naming both numbers — rather than three layers down as an opaque store error,
        // and it protects callers that do not terminate at Chroma.
        const spy = createSpyCollection();

        TextEmbeddingService.ollamaProvider = {
            async embed(input) {
                const texts = Array.isArray(input) ? input : [input];
                return {embeddings: texts.slice(1).map(() => [0.1, 0.2, 0.3])}   // one short
            }
        };

        const thrown = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: makeChunks(3)})
            .then(() => null, error => error);

        expect(spy.upserts, 'a short response must never reach the collection').toEqual([]);
        expect(thrown, 'and with nothing embedded the sweep must fail LOUD, not report a clean run').toBeTruthy();

        // Asserted as it behaves on `dev`, deliberately. The total-outage arm currently mints a bare
        // Error, so the operator receives "batch failed" and the REASON — that the provider returned
        // a short response — does not survive the hop. The cause-preservation that restores it is an
        // open change on another branch; this assertion is written against what ships today rather
        // than against what will ship, so it cannot be green for the wrong reason.
        expect(thrown.message).toContain('Failed to process batch');
    });

    test('a MISSING embeddings field is refused rather than becoming an empty array', async () => {
        // `result.embeddings || []` turned a malformed response into "zero vectors, no error" at THIS
        // layer. The store refuses it too — a zero-length list throws `Non-empty lists are required`
        // — so again the correction is diagnostic locality, not corruption prevention: an operator
        // sees "no vectors for 2 inputs" instead of a store-level complaint about an empty field.
        const spy = createSpyCollection();

        TextEmbeddingService.ollamaProvider = {
            async embed() {
                return {}   // no `embeddings` key at all
            }
        };

        const thrown = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: makeChunks(2)})
            .then(() => null, error => error);

        expect(spy.upserts, 'nothing may be written from a response that carried no vectors').toEqual([]);
        expect(thrown, 'a malformed response must abort the sweep, not resolve it').toBeTruthy();
    });
});
