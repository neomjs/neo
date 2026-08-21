import {setup} from '../../../../setup.mjs';

const appName = 'KBLeaseYieldTest';

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
 * Cooperative heavy-maintenance-lease yield-point coverage for `VectorService.embedChunks`.
 *
 * The kbSync side of the heavy-maintenance-lease fairness contract: a long re-embed must release the lease
 * at a BATCH BOUNDARY so a starved heavy task (`githubWorkflowSync`) can interleave, then resume from the
 * preserved shadow — never starving it indefinitely. The producer side (`HeavyMaintenanceLeaseService.
 * shouldYield`) decides WHEN; this is the consumer that ACTS on it between batches.
 *
 * These tests drive `embedChunks` directly with an in-memory spy collection and a stubbed embedder,
 * asserting the three load-bearing properties:
 *   - the yield fires BETWEEN batches (the loop stops, no partial batch),
 *   - at least one batch always lands per acquisition (forward progress — never a livelock),
 *   - the default (no predicate) path is unchanged (every batch embeds, `yielded:false`).
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection() {
    const calls       = {upsert: 0};
    const upsertedIds = [];
    // id -> vector, so a test can assert WHICH vector landed under WHICH id. Recording ids alone cannot
    // see a misalignment, and neither can identical vectors — both halves are required.
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
 * A vector that names its own chunk. An all-zero embedder makes every misalignment invisible: the
 * assertion passes whether or not the vector under `chunk-3` is chunk 3's. This is the fixture flaw
 * that let a positional-binding defect through review — the test could not fail on it.
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

test.describe('VectorService.embedChunks — cooperative lease yield-point', () => {
    let SDK, KB_VectorService, KB_Config, Memory_Config, TextEmbeddingService, EMBEDDING_BATCH_YIELDED_CODE;
    let originalEmbedTexts, originalBatchConfig;

    test.beforeAll(async () => {
        SDK                  = await import('../../../../../../ai/services.mjs');
        KB_Config            = SDK.KB_Config;
        Memory_Config        = SDK.Memory_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        ({EMBEDDING_BATCH_YIELDED_CODE} = await import(
            '../../../../../../ai/services/memory-core/TextEmbeddingService.mjs'
        ));

        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        KB_VectorService          = VectorServiceModule.default;

        originalEmbedTexts  = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        originalBatchConfig = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };

        // Deterministic stub embedder — 384-dim zero vectors; the yield logic is provider-agnostic.
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));
    });

    test.afterAll(() => {
        TextEmbeddingService.embedTexts = originalEmbedTexts;
        Object.assign(KB_Config.data, originalBatchConfig);
    });

    test.beforeEach(() => {
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
        // Re-applied per test: the inner-yield cases below swap in their own embedder, and a leaked stub
        // would silently change what a later test is measuring.
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));
    });

    test('yields BETWEEN batches — stops the loop, first batch still lands (forward progress)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150); // 3 batches at batchSize 50

        // Predicate true from the first between-batch checkpoint (i=50) onward.
        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => true
        });

        // Only the i=0 batch embedded before the i>0 checkpoint yielded — never zero (no livelock).
        expect(result.yielded).toBe(true);
        expect(result.embedded).toBe(50);
        expect(result).toMatchObject({settled: 50, remaining: 100});
        expect(spy.calls.upsert).toBe(1);
        expect(spy.upsertedIds).toHaveLength(50);
    });

    test('yields after N batches when the predicate flips mid-run', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(200); // 4 batches

        let checks = 0;
        // Between-batch checkpoints fire at i=50,100,150; yield on the second one (i=100).
        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => ++checks >= 2
        });

        expect(result.yielded).toBe(true);
        expect(result.embedded).toBe(100); // the i=0 and i=50 batches landed
        expect(result).toMatchObject({settled: 100, remaining: 100});
        expect(spy.calls.upsert).toBe(2);
    });

    test('rechecks AFTER batchDelay before purchasing another complete batch (#17414)', async () => {
        const spy             = createSpyCollection(),
              chunks          = makeChunks(6),
              originalTimeout = KB_VectorService.timeout;

        Object.assign(KB_Config.data, {batchSize: 2, batchDelay: 50});

        let delayCompleted = false;

        // Deterministic delay seam: the first between-batch vote is false, the delay then moves the
        // lease across its bound. A loop that votes only BEFORE waiting buys one extra full batch.
        KB_VectorService.timeout = async () => {
            delayCompleted = true
        };

        try {
            const result = await KB_VectorService.embedChunks({
                collection     : spy,
                chunksToProcess: chunks,
                shouldYield    : () => delayCompleted
            });

            expect(result.yielded).toBe(true);
            expect(result.embedded, 'the delay completed before batch 2, so only batch 1 may land').toBe(2);
            expect(result).toMatchObject({settled: 2, remaining: 4});
            expect(spy.calls.upsert).toBe(1);
        } finally {
            KB_VectorService.timeout = originalTimeout
        }
    });

    test('default (no predicate) embeds every batch — unchanged behavior, never yields', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150);

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks});

        expect(result.yielded).toBe(false);
        expect(result.embedded).toBe(150);
        expect(result).toMatchObject({settled: 150, remaining: 0});
        expect(spy.calls.upsert).toBe(3);
    });

    test('an INNER yield is reported as a yield, and is not retried (#16822)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150); // 3 batches at batchSize 50

        // 3, not the deployed 5: the retry arm backs off `2 ** retries` seconds, so a maxRetries-5 mutation
        // run exhausts the 30s test timeout before it exhausts the retries — and a timeout-red would leave
        // this test looking falsifiable while proving only that something hung.
        Object.assign(KB_Config.data, {maxRetries: 3});

        let embedCalls = 0;

        TextEmbeddingService.embedTexts = async texts => {
            embedCalls++;
            // Batch 1 lands; batch 2 abandons mid-way at a provider-chunk boundary.
            if (embedCalls === 1) return texts.map(() => new Array(384).fill(0));

            // A yield error is only well-formed if it declares how many inputs it completed and carries
            // exactly that many vectors — the contract that makes positional binding safe.
            const error = new Error('openAiCompatible batch embedding yielded the heavy-maintenance lease after 1/10 provider chunk(s)');
            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 1;
            error.totalChunkCount     = 10;
            error.completedTextCount  = 5;
            error.embeddings          = chunks.slice(50, 55).map(chunk => makeEmbedding(chunkIndexOf(chunk)));
            throw error
        };

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false // the OUTER checkpoint never fires: the yield must arrive from within
        }).then(value => value, error => ({error}));

        // Captured rather than awaited bare, so the failure this test exists to catch reads as its own
        // sentence. Against the untyped `catch (err)` the yield falls into the retry arm, the batch is
        // re-attempted until the budget is gone, and `embedChunks` then throws — so the caller sees a
        // hard ingestion failure where the truth was an orderly, resumable release.
        expect(result.error, `the yield must not surface as an ingestion failure: ${result.error?.message}`).toBeUndefined();

        // The load-bearing number. Each extra attempt re-issues provider work the holder deliberately
        // stopped, so the fairness fix becomes a maxRetries-fold amplifier of the hold it exists to bound —
        // silently, because every attempt looks like an ordinary transient embedding failure.
        expect(embedCalls, 'a yield is a decision, not a transient failure — exactly one attempt per batch').toBe(2);
        expect(result.yielded, 'the caller must learn to release the lease').toBe(true);

        // Progress made before the yield is durable and is what `selectResumableChunks` skips next sweep:
        // batch 1 in full, plus the 5 inputs batch 2 completed before releasing.
        expect(result.embedded).toBe(55);
        expect(result).toMatchObject({settled: 55, remaining: 95});
        expect(spy.calls.upsert).toBe(2);
        expect(spy.upsertedIds).toHaveLength(55);
    });

    test('an inner yield stops the OUTER sweep even if the predicate flips back to false (#16822)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(200); // 4 batches

        let embedCalls = 0;

        TextEmbeddingService.embedTexts = async (texts, provider, {shouldYield} = {}) => {
            embedCalls++;
            if (embedCalls !== 2) return chunks.slice((embedCalls - 1) * 50, embedCalls * 50).map(chunk => makeEmbedding(chunkIndexOf(chunk)));

            const error = new Error('openAiCompatible batch embedding yielded the heavy-maintenance lease after 1/10 provider chunk(s)');
            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 1;
            error.totalChunkCount     = 10;
            error.completedTextCount  = 5;
            error.embeddings          = chunks.slice(50, 55).map(chunk => makeEmbedding(chunkIndexOf(chunk)));
            throw error
        };

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        });

        // Leaving the outer `for` on the strength of the next between-batch checkpoint would work only while
        // the predicate stays true. It is a lease-expiry predicate consulted across minutes of provider work,
        // so "still true one batch later" is an assumption, not a property — batches 3 and 4 would resume
        // under a lease the holder has already decided to release.
        expect(embedCalls, 'batches 3 and 4 must not run').toBe(2);
        expect(result.yielded).toBe(true);
        expect(result.embedded, 'batch 1 in full, plus the 5 inputs batch 2 completed before releasing').toBe(55);
        expect(result).toMatchObject({settled: 55, remaining: 145});
        expect(spy.calls.upsert).toBe(2);
    });

    test('an ordinary embedding failure is still retried — the yield carve-out did not widen (#16822)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        Object.assign(KB_Config.data, {maxRetries: 3});

        let embedCalls = 0;

        TextEmbeddingService.embedTexts = async texts => {
            embedCalls++;
            if (embedCalls < 3) throw new Error('openAiCompatible embedding error HTTP 503: busy');
            return texts.map(() => new Array(384).fill(0))
        };

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        });

        // A carve-out that quiets a retry path opens a silent channel if it classifies too broadly. Only the
        // typed yield code may skip the retry arm; everything else keeps the behaviour it had.
        expect(embedCalls).toBe(3);
        expect(result.yielded).toBe(false);
        expect(result.embedded).toBe(50);
        expect(result).toMatchObject({settled: 50, remaining: 0});
    });

    test('an inner yield PERSISTS the chunks it already paid for (#16822)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        TextEmbeddingService.embedTexts = async () => {
            const error = new Error('openAiCompatible batch embedding yielded the heavy-maintenance lease after 2/10 provider chunk(s), 10 embedding(s) carried');
            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 2;
            error.totalChunkCount     = 10;
            error.completedTextCount  = 10;
            error.embeddings          = Array.from({length: 10}, (_, i) => makeEmbedding(i));
            throw error
        };

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        });

        // The prefix must land, and it must land under the RIGHT ids — the first 10 in order, never a
        // suffix and never a re-indexed set. Persisting nothing is the livelock; persisting misaligned is
        // worse than the livelock.
        expect(result.yielded).toBe(true);
        expect(result.embedded, 'completed provider work must count as embedded').toBe(10);
        expect(result).toMatchObject({settled: 10, remaining: 40});
        expect(spy.upsertedIds).toEqual(chunks.slice(0, 10).map(chunk => chunk.id));

        // Each id must carry ITS OWN vector. With an all-zero embedder the assertion above passes under a
        // one-position shift; naming the chunk inside the vector is what makes the binding observable.
        chunks.slice(0, 10).forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} must store its own vector, not a neighbour's`
            ).toBe(chunkIndexOf(chunk));
        });
    });

    test('a yield whose payload disagrees with its stated completed count is REFUSED, not upserted (#16826)', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50);

        // The sparse-provider shape @neo-gpt named: one vector missing, so every later vector would slide
        // onto its neighbour's id. There is no length mismatch downstream to catch it — the count has to be
        // checked against what was SENT.
        TextEmbeddingService.embedTexts = async () => {
            const error = new Error('openAiCompatible batch embedding yielded the heavy-maintenance lease after 2/10 provider chunk(s)');
            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 2;
            error.totalChunkCount     = 10;
            error.completedTextCount  = 10;
            error.embeddings          = Array.from({length: 9}, (_, i) => makeEmbedding(i)); // one short
            throw error
        };

        const outcome = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => false
        }).then(() => null, error => error);

        // Refusing loudly beats storing 9 vectors under the wrong 9 ids. A wrong row in a vector store is
        // not self-correcting: nothing downstream ever re-reads it against its source.
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toContain('refusing to bind vectors to chunk ids by position');
        expect(spy.calls.upsert, 'nothing may be written on a disagreement').toBe(0);
    });

    test('repeated acquisitions that always yield still MONOTONICALLY advance and terminate (#16822)', async () => {
        const spy         = createSpyCollection();
        const allChunks   = makeChunks(150);
        const embeddedIds = new Set();

        let sweepChunks = [];

        // Every acquisition yields after exactly two provider chunks — the pathological case: 2 x 20min
        // exceeds the 30min bound before chunk 3, on every single acquisition, forever.
        TextEmbeddingService.embedTexts = async texts => {
            const carried = Math.min(10, texts.length);
            const error   = new Error(`openAiCompatible batch embedding yielded the heavy-maintenance lease after 2/10 provider chunk(s), ${carried} embedding(s) carried`);
            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 2;
            error.totalChunkCount     = 10;
            error.completedTextCount  = carried;
            // Each vector names the chunk it belongs to, so the closing assertion can prove the corpus is
            // correctly BOUND and not merely complete. A count reaching 150 says nothing about whether
            // chunk-7's vector sits under chunk-7.
            error.embeddings          = sweepChunks.slice(0, carried).map(chunk => makeEmbedding(chunkIndexOf(chunk)));
            throw error
        };

        const progress = [];
        let   sweeps   = 0;

        // The resume contract: each sweep re-selects only what is not already stored.
        while (embeddedIds.size < allChunks.length && sweeps < 40) {
            sweeps++;

            sweepChunks = allChunks.filter(chunk => !embeddedIds.has(chunk.id));

            const before = embeddedIds.size,
                  result = await KB_VectorService.embedChunks({
                      collection     : spy,
                      chunksToProcess: sweepChunks,
                      shouldYield    : () => false
                  });

            spy.upsertedIds.forEach(id => embeddedIds.add(id));
            spy.upsertedIds.length = 0;
            progress.push(embeddedIds.size);

            expect(result.yielded).toBe(true);
            expect(
                embeddedIds.size,
                `sweep ${sweeps} stored nothing new — this is the livelock: completed provider chunks discarded, the same prefix re-selected forever`
            ).toBeGreaterThan(before);
        }

        // 150 chunks, 10 durable per acquisition. Termination is the assertion; the 40-sweep ceiling exists
        // only so a livelock fails as a red test instead of hanging the suite.
        expect(embeddedIds.size).toBe(150);
        expect(sweeps).toBe(15);
        expect(progress).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]);

        // Complete is not the same as correct. Across 15 resumed sweeps every chunk must hold ITS OWN
        // vector — a one-position slide anywhere would still reach 150 and still terminate.
        allChunks.forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} holds the wrong vector — the corpus is complete but misbound`
            ).toBe(chunkIndexOf(chunk));
        });
    });

    test('the per-chunk checkpoint interval fits inside the fairness bound it must respect (#16822)', async () => {
        const {unloadRetryCount, batchEmbeddingTimeoutMs} = Memory_Config.openAiCompatible,
              {maxActiveHoldMs}                           = Memory_Config.orchestrator.heavyMaintenance;

        // Worst case between two consultations AFTER the repair: one provider chunk, including its unload
        // retries, each of which carries the full request timeout.
        const worstCaseCheckpointIntervalMs = (1 + unloadRetryCount) * batchEmbeddingTimeoutMs;

        expect(
            worstCaseCheckpointIntervalMs,
            `a cooperative bound is only a bound if the holder can reach a checkpoint inside it: ` +
            `(1 + unloadRetryCount=${unloadRetryCount}) * batchEmbeddingTimeoutMs=${batchEmbeddingTimeoutMs} ` +
            `= ${worstCaseCheckpointIntervalMs}ms vs maxActiveHoldMs=${maxActiveHoldMs}ms`
        ).toBeLessThan(maxActiveHoldMs);

        // The pre-repair interval, kept as an executable record of what was actually wrong: the same three
        // leaves multiplied by the caller's batch fan-out and its retry budget. This assertion is expected to
        // hold — it documents that moving the checkpoint, not retuning any leaf, is what closed the gap.
        //
        // Read from `originalBatchConfig`, captured before `beforeEach` narrows the harness: reading
        // `KB_Config` here would measure this spec's own 50/1 fixture and call it the deployment's bound.
        const preRepairIntervalMs = originalBatchConfig.maxRetries
            * Math.ceil(originalBatchConfig.batchSize / Memory_Config.openAiCompatible.batchEmbeddingChunkSize)
            * worstCaseCheckpointIntervalMs;

        expect(
            preRepairIntervalMs,
            'the interval this repair removed was multiples of the bound, not a near miss'
        ).toBeGreaterThan(maxActiveHoldMs);
    });
});
