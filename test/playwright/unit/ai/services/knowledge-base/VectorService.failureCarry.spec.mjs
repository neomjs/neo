import {setup} from '../../../../setup.mjs';

const appName = 'KBFailureCarryTest';

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
 * Work conservation on the FAILURE path of `VectorService.embedChunks`.
 *
 * The yield arm already persists the completed prefix a lease-yield carries. A provider FAILURE
 * mid-batch discarded it: the timeout arm ended the sweep with the prefix unpersisted, and the retry
 * arm re-ran the whole batch — so every completed-but-unpersisted embedding was re-purchased on every
 * attempt and on every later sweep. On a slow lane that composes into full compute at a constant
 * corpus count: the plane-observed "all discarded" loop.
 *
 * These tests drive `embedChunks` with the leaseYield spec's spy-collection harness and a stubbed
 * embedder that throws errors decorated with the carry contract (`completedTextCount`, `embeddings`),
 * asserting the four load-bearing properties:
 *   - a timeout-class failure persists its carried prefix BEFORE the sweep ends,
 *   - a retryable failure persists the prefix and retries ONLY the remainder,
 *   - a payload disagreeing with its stated count is refused, never sliced positionally,
 *   - an uncarried failure keeps its existing behavior (nothing persisted, classification unchanged).
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection() {
    const calls       = {upsert: 0};
    const upsertedIds = [];
    // id -> vector, so a test can assert WHICH vector landed under WHICH id. Recording ids alone
    // cannot see a misalignment, and neither can identical vectors — both halves are required.
    const storedByIds = new Map();

    return {
        calls,
        storedByIds,
        upsertedIds,
        name: 'spy-knowledge-base',
        async upsert({ids, embeddings}) {
            calls.upsert++;
            upsertedIds.push(...ids);
            ids.forEach((id, position) => storedByIds.set(id, embeddings?.[position]));
        }
    };
}

/**
 * A vector that names its own chunk — an all-zero embedder cannot fail on a positional slide.
 */
function makeEmbedding(chunkIndex) {
    const vector = new Array(384).fill(0);

    vector[0] = chunkIndex;

    return vector
}

function chunkIndexOf(chunk) {
    return Number(chunk.id.replace('chunk-', ''))
}

function makeChunks(count) {
    return Array.from({length: count}, (_, i) => ({
        id     : `chunk-${i}`,
        type   : 'guide',
        name   : `symbol-${i}`,
        content: `deterministic small body for chunk ${i}`
    }));
}

/**
 * Builds a failure decorated with the carry contract the producer attaches: the ORIGINAL
 * error identity (message + code) with the completed prefix alongside it.
 */
function makeCarriedFailure({code, completedChunkCount, totalChunkCount, completedTextCount, embeddings}) {
    const error = new Error('openAiCompatible embedding error HTTP 500: provider died mid-batch');

    if (code) error.code = code;
    error.completedChunkCount = completedChunkCount;
    error.totalChunkCount     = totalChunkCount;
    error.completedTextCount  = completedTextCount;
    error.embeddings          = embeddings;

    return error
}

test.describe('VectorService.embedChunks — failure-path work conservation (#17112)', () => {
    let SDK, KB_VectorService, KB_Config, TextEmbeddingService;
    let originalEmbedTexts, originalBatchConfig;

    test.beforeAll(async () => {
        SDK                  = await import('../../../../../../ai/services.mjs');
        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        KB_VectorService          = VectorServiceModule.default;

        originalEmbedTexts  = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        originalBatchConfig = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };
    });

    test.afterAll(() => {
        TextEmbeddingService.embedTexts = originalEmbedTexts;
        Object.assign(KB_Config.data, originalBatchConfig);
    });

    test.beforeEach(() => {
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 3});
    });

    test('a timeout-class failure PERSISTS its carried prefix before the sweep ends', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        TextEmbeddingService.embedTexts = async () => {
            throw makeCarriedFailure({
                code               : 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT',
                completedChunkCount: 2,
                totalChunkCount    : 10,
                completedTextCount : 10,
                embeddings         : Array.from({length: 10}, (_, i) => makeEmbedding(i))
            });
        };

        const outcome = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        }).then(() => null, error => error);

        // The sweep still ends — a timeout means OUR wait ended, not the provider's work, and queueing
        // more batches behind a possibly-running predecessor stays wrong. What changes is what survives:
        // the 10 completed embeddings are durable, so the next sweep's re-selection excludes them.
        expect(outcome, 'the timeout classification must still end the sweep').toBeInstanceOf(Error);
        expect(outcome.code).toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(spy.calls.upsert, 'the carried prefix must be persisted before the sweep ends').toBe(1);
        expect(spy.upsertedIds).toEqual(chunks.slice(0, 10).map(chunk => chunk.id));

        // Under the RIGHT ids: each vector names its chunk, so a one-position slide fails here.
        chunks.slice(0, 10).forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} must store its own vector, not a neighbour's`
            ).toBe(chunkIndexOf(chunk));
        });
    });

    test('a retryable failure persists the prefix and retries ONLY the un-persisted remainder', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        const receivedTextCounts = [];

        let embedCalls = 0;

        TextEmbeddingService.embedTexts = async texts => {
            embedCalls++;
            receivedTextCounts.push(texts.length);

            // Attempt 1: 10 completed, then a retryable (non-timeout) failure.
            if (embedCalls === 1) {
                throw makeCarriedFailure({
                    completedChunkCount: 2,
                    totalChunkCount    : 10,
                    completedTextCount : 10,
                    embeddings         : chunks.slice(0, 10).map(chunk => makeEmbedding(chunkIndexOf(chunk)))
                });
            }

            // Attempt 2 succeeds for whatever it was asked to embed.
            return texts.map((_, position) => makeEmbedding(chunkIndexOf(chunks[10 + position])))
        };

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        });

        // The retry must not re-purchase the 10 persisted embeddings: attempt 1 sees all 50 inputs,
        // attempt 2 exactly the 40 that were never completed. Re-sending 50 is the re-purchase loop
        // this repair removes — it passes every other assertion here, so the count is load-bearing.
        expect(receivedTextCounts).toEqual([50, 40]);
        expect(result.embedded).toBe(50);
        expect(spy.calls.upsert, 'one prefix persist plus one remainder persist').toBe(2);
        expect(spy.upsertedIds).toEqual(chunks.map(chunk => chunk.id));

        chunks.forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} must store its own vector across the persist/retry boundary`
            ).toBe(chunkIndexOf(chunk));
        });
    });

    test('a carried payload disagreeing with its stated count is REFUSED, never sliced positionally', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50);

        TextEmbeddingService.embedTexts = async () => {
            throw makeCarriedFailure({
                completedChunkCount: 2,
                totalChunkCount    : 10,
                completedTextCount : 10,
                embeddings         : Array.from({length: 9}, (_, i) => makeEmbedding(i)) // one short
            });
        };

        const outcome = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        }).then(() => null, error => error);

        // One missing vector slides every later one onto its neighbour's id with no length mismatch
        // downstream — refusing loudly beats storing 9 vectors under the wrong 9 ids.
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toContain('refusing to bind vectors to chunk ids by position');
        expect(spy.calls.upsert, 'nothing may be written on a disagreement').toBe(0);
    });

    test('an UNCARRIED timeout keeps its existing behavior: sweep ends, nothing persisted', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50);

        TextEmbeddingService.embedTexts = async () => {
            const error = new Error('request timed out');

            error.code = 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT';
            throw error
        };

        const outcome = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        }).then(() => null, error => error);

        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.code).toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(spy.calls.upsert).toBe(0);
    });
});
