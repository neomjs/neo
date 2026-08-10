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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

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
 * Serial: these mutate the shared embedding-provider selector and the `ollamaProvider` singleton.
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection() {
    const upserts = [];

    return {
        upserts,
        name: 'spy-knowledge-base',
        async upsert({ids, embeddings}) {
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
    let originalProvider, originalBatchConfig, originalOllamaProvider;

    test.beforeAll(async () => {
        const SDK = await import('../../../../../../ai/services.mjs');

        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;
        MC_Config            = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        KB_VectorService     = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;

        originalProvider       = MC_Config.embeddingProvider;
        originalOllamaProvider = TextEmbeddingService.ollamaProvider;
        originalBatchConfig    = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };
    });

    test.afterAll(() => {
        MC_Config.embeddingProvider         = originalProvider;
        TextEmbeddingService.ollamaProvider = originalOllamaProvider;
        Object.assign(KB_Config.data, originalBatchConfig);
    });

    test.beforeEach(() => {
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
        MC_Config.embeddingProvider = 'ollama';
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
        // The positional-binding defect class, on the provider a deployment actually runs. openAiCompatible got
        // a density guard; the ollama branch returns `result.embeddings || []` with no length check,
        // so a response carrying two vectors for three inputs would upsert chunk-2's id with no
        // vector — or chunk-1's vector under chunk-2's id — with no error anywhere.
        //
        // A wrong row is worse than a failed batch: the batch retries, the row is believed.
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
        // `result.embeddings || []` turns a malformed response into "zero vectors, no error". The
        // caller then upserts N ids against an empty array, and the corpus stays empty while every
        // surface reports a completed sweep — the two-month signature exactly.
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
