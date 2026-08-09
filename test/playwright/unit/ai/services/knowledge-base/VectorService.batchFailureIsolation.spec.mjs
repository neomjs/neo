import {setup} from '../../../../setup.mjs';

const appName = 'KBBatchFailureIsolationTest';

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
 * Batch-failure isolation for `VectorService.embedChunks`.
 *
 * The defect: a batch that exhausted its retries aborted the whole sweep. That is not a delay, it is a
 * permanent strand — `embed()` rebuilds `chunksToProcess` by walking the corpus IN ORDER and keeping what the
 * collection does not already hold, so succeeded batches drop out while the failed one stays first in line.
 * Every later batch is re-abandoned at the identical index on every future sweep, forever.
 *
 * The cooperative-yield arm of this same loop was hardened against exactly this shape — *"a holder that yields
 * at the same chunk every time never advances"* — and the failure arm had no equivalent.
 *
 * **The cross-sweep spec below is the one that convicts the defect.** A single-sweep test passes against the
 * broken tree: within one sweep the abort and the skip are only distinguishable by what comes after, and the
 * strand is a property of what the NEXT sweep re-selects. Any repair validated only in-sweep is unproven.
 *
 * The zero-success ceiling is the load-bearing other half: removing the abort entirely would turn a provider
 * outage into a full-corpus walk at `maxRetries * timeout` per batch — strictly worse than the bug. That case
 * must still stop at the first batch, and must still THROW, so a total outage cannot report as a clean run.
 *
 * Serial mode: specs mutate the shared `KB_Config.data` batch leaves and the `TextEmbeddingService.embedTexts`
 * singleton.
 */
test.describe.configure({mode: 'serial'});

/**
 * In-memory stand-in for the Chroma collection. Records upserted ids so a test can assert exactly which
 * chunks landed — a count alone cannot tell "the remainder embedded" from "the first batch embedded twice".
 */
function createSpyCollection() {
    const calls       = {upsert: 0};
    const upsertedIds = [];

    return {
        calls,
        upsertedIds,
        name: 'spy-knowledge-base',
        async upsert({ids}) {
            calls.upsert++;
            upsertedIds.push(...ids);
        }
    };
}

function makeChunks(count) {
    return Array.from({length: count}, (_, i) => ({
        id     : `chunk-${i}`,
        type   : 'guide',
        name   : `symbol-${i}`,
        content: `deterministic small body for chunk ${i}`
    }));
}

test.describe('VectorService.embedChunks — one failing batch must not strand the remainder (#16843)', () => {
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
        // `maxRetries: 1` deliberately: the retry arm backs off `2 ** retries` seconds, so a larger value buys
        // no coverage and spends real wall-clock. One attempt per batch is enough to reach exhaustion.
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));
    });

    test('a poisoned batch is skipped and every LATER batch still embeds', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150); // 3 batches at batchSize 50

        let providerCalls = 0;

        // Batch 2 fails deterministically; batches 1 and 3 succeed.
        TextEmbeddingService.embedTexts = async texts => {
            providerCalls++;
            if (providerCalls === 2) {
                throw new Error('provider rejected this payload');
            }
            return texts.map(() => new Array(384).fill(0));
        };

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks});

        // The remainder is the whole point: batch 3 must not be collateral damage from batch 2.
        expect(result.embedded).toBe(100);
        expect(spy.upsertedIds).toContain('chunk-0');
        expect(spy.upsertedIds).toContain('chunk-149');
        expect(spy.upsertedIds).not.toContain('chunk-50');

        expect(result.failedBatches).toHaveLength(1);
        expect(result.failedBatches[0].batchIndex).toBe(2);
        expect(result.failedBatches[0].chunkIds).toContain('chunk-50');
        expect(result.failedBatches[0].reason).toContain('provider rejected this payload');
    });

    test('CROSS-SWEEP: a second sweep embeds the chunks that follow the poisoned batch', async () => {
        // The spec that actually convicts the defect. Against the pre-fix tree sweep 1 aborts at batch 2, and
        // sweep 2 re-selects from batch 2 and aborts there again — so chunks 100-149 are never embedded by any
        // number of sweeps. Modelled faithfully: `embed()` derives the next work set by excluding ids the
        // collection already holds, in corpus order, which is what this loop reproduces.
        const spy    = createSpyCollection();
        const corpus = makeChunks(150);

        TextEmbeddingService.embedTexts = async texts => {
            if (texts.some(text => text.includes('for chunk 50'))) {
                throw new Error('provider rejected this payload');
            }
            return texts.map(() => new Array(384).fill(0));
        };

        const runSweep = async () => {
            const landed          = new Set(spy.upsertedIds);
            const chunksToProcess = corpus.filter(chunk => !landed.has(chunk.id));

            if (chunksToProcess.length === 0) {
                return {skipped: true};
            }

            try {
                return await KB_VectorService.embedChunks({collection: spy, chunksToProcess});
            } catch (error) {
                return {threw: error.message};
            }
        };

        const sweepOne     = await runSweep();
        const landedAfter1 = new Set(spy.upsertedIds);

        // THE CONVICTING ASSERTION. Pre-fix, sweep 1 aborts at the poisoned batch and chunks 100-149 are never
        // written — not by this sweep and, because the next sweep re-selects the same failing prefix, not by any
        // sweep that follows. Their presence here is the entire repair.
        expect(landedAfter1.has('chunk-100')).toBe(true);
        expect(landedAfter1.has('chunk-149')).toBe(true);
        expect(landedAfter1.has('chunk-0')).toBe(true);
        expect(sweepOne.failedBatches).toHaveLength(1);

        // The poisoned chunks are isolated, not smuggled in.
        expect(landedAfter1.has('chunk-50')).toBe(false);
        expect(landedAfter1.size).toBe(100);

        const sweepTwo = await runSweep();

        // Sweep 2's work set is the poisoned batch and nothing else, so nothing embeds in it — which is
        // indistinguishable from a provider outage from inside that sweep, and is correctly reported the same
        // way: it throws, loudly, rather than returning a success-shaped result over an empty run. That is the
        // intended steady state. The corpus holds every recoverable chunk and the unrecoverable ones keep
        // announcing themselves instead of silently freezing everything behind them.
        expect(sweepTwo.threw).toMatch(/Failed to process batch 1/);
        expect(new Set(spy.upsertedIds).size).toBe(100);
    });

    test('CEILING: a sweep where NOTHING embeds still throws, and stops at the first batch', async () => {
        // The load-bearing other half. Skipping unconditionally would walk a dead provider across the entire
        // corpus at `maxRetries * timeout` per batch. A total outage must cost one batch, and must throw so the
        // caller records a failure instead of a success-shaped receipt over an empty run.
        const spy    = createSpyCollection();
        const chunks = makeChunks(150); // 3 batches

        let providerCalls = 0;

        TextEmbeddingService.embedTexts = async () => {
            providerCalls++;
            throw new Error('provider is down');
        };

        await expect(
            KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks})
        ).rejects.toThrow(/Failed to process batch 1/);

        // One batch, one attempt (maxRetries: 1) — NOT one per batch in the corpus.
        expect(providerCalls).toBe(1);
        expect(spy.calls.upsert).toBe(0);
    });

    test('a healthy sweep is unchanged — no failures recorded, every batch lands', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150);

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks});

        expect(result.embedded).toBe(150);
        expect(result.failedBatches).toHaveLength(0);
        expect(spy.calls.upsert).toBe(3);
    });

    test('a cooperative yield is NOT recorded as a batch failure', async () => {
        // The yield arm is a decision, not an error. Conflating them would re-break the fairness fix and would
        // also pollute the ingest receipt with failures that never happened.
        const spy    = createSpyCollection();
        const chunks = makeChunks(150);

        const result = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: chunks,
            shouldYield    : () => true
        });

        expect(result.yielded).toBe(true);
        expect(result.embedded).toBe(50);
        expect(result.failedBatches).toHaveLength(0);
    });
});
