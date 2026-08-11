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
import {
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE
} from '../../../../../../ai/provider/createTimeoutError.mjs';
import {KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN}
    from '../../../../../../ai/services/knowledge-base/helpers/embedFailureClassification.mjs';

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
    let SDK, KB_VectorService, KB_Config, TextEmbeddingService, ChromaManager;
    let originalEmbedTexts, originalBatchConfig;

    test.beforeAll(async () => {
        SDK                  = await import('../../../../../../ai/services.mjs');
        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        KB_VectorService          = VectorServiceModule.default;
        ChromaManager             = (await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs')).default;

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

    test('ZERO chunks issues ZERO provider submissions — the attribution control (#16780 AC-1)', async () => {
        // This is a control, not a repair: `embedChunks` already returns early on an empty input.
        // Pinning it is the point. A deployment was observed holding ~4 cores of inference against an EMPTY
        // corpus, and the only way that observation becomes attributable is if "Neo submits nothing
        // when there is nothing to embed" is a guaranteed property rather than a current one.
        //
        // With this pinned, sustained provider load beside zero pending work cannot be our
        // submissions — it is a stranded or wedged runner, which is a different ticket and a
        // different fix. Without it, an operator cannot rule us out and every such incident starts
        // by re-deriving whether the loop is looping.
        //
        // Asserted at the PROVIDER boundary rather than on the return value: a function can report
        // `embedded: 0` while still having called out, and it is the call that burns the core.
        const spy = createSpyCollection();

        let providerCalls = 0;

        TextEmbeddingService.embedTexts = async texts => {
            providerCalls++;
            return texts.map(() => new Array(384).fill(0))
        };

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: []});

        expect(providerCalls, 'nothing to embed must reach the provider zero times').toBe(0);
        expect(spy.upsertedIds, 'and nothing may be written').toEqual([]);
        expect(result).toEqual({embedded: 0, skipped: 0, yielded: false});
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

    test('#16973: a provider timeout ends the whole sweep after one offer and the next sweep resumes', async () => {
        const originalSetTimeout = globalThis.setTimeout;

        // Mutation control: on the pre-repair loop this compresses the 2s/4s/8s/16s ladder so the
        // provider-call assertion fails immediately instead of making the suite spend 30 seconds proving it.
        globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, 0, ...args);

        try {
            Object.assign(KB_Config.data, {batchSize: 1, batchDelay: 0, maxRetries: 5});

            for (const code of [
                PROVIDER_TIMEOUT_CODE,
                OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
                'ETIMEDOUT',
                'ESOCKETTIMEDOUT'
            ]) {
                const
                    spy          = createSpyCollection(),
                    chunks       = makeChunks(3),
                    timeoutError = Object.assign(new Error(`provider timeout: ${code}`), {
                        code,
                        timeoutMs: 1800000
                    });
                let providerCalls = 0;

                TextEmbeddingService.embedTexts = async texts => {
                    providerCalls++;

                    if (providerCalls === 1) {
                        return texts.map(() => new Array(384).fill(0))
                    }

                    throw timeoutError
                };

                const thrown = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks})
                    .then(() => null, error => error);

                expect(thrown, `${code} must survive as the original typed failure`).toBe(timeoutError);
                expect(providerCalls,
                    `${code}: batch 1 lands, batch 2 times out once, and batch 3 must never dispatch`).toBe(2);
                expect(spy.upsertedIds, `${code}: the durable prefix remains landed`).toEqual(['chunk-0']);

                const remaining = chunks.filter(chunk => !spy.upsertedIds.includes(chunk.id));

                TextEmbeddingService.embedTexts = async texts => {
                    providerCalls++;
                    return texts.map(() => new Array(384).fill(0))
                };

                const resumed = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: remaining});

                expect(resumed.embedded, `${code}: the later scheduler-shaped pass lands only the remainder`)
                    .toBe(2);
                expect(spy.upsertedIds, `${code}: the successful prefix is not re-bought`).toEqual([
                    'chunk-0', 'chunk-1', 'chunk-2'
                ]);
                expect(providerCalls, `${code}: one landed + one timed out + two resumed provider calls`).toBe(4);
            }
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    test('#16973 phase guard: a timeout-shaped upsert error retries only the write', async () => {
        const originalSetTimeout = globalThis.setTimeout;

        globalThis.setTimeout = (fn, ms, ...args) => originalSetTimeout(fn, 0, ...args);

        try {
            Object.assign(KB_Config.data, {batchSize: 1, batchDelay: 0, maxRetries: 2});

            const chunks        = makeChunks(1);
            let   providerCalls = 0,
                upsertCalls   = 0;

            TextEmbeddingService.embedTexts = async texts => {
                providerCalls++;
                return texts.map(() => new Array(384).fill(0))
            };

            const collection = {
                name: 'timeout-shaped-write-spy',
                async upsert() {
                    upsertCalls++;

                    if (upsertCalls === 1) {
                        throw Object.assign(new Error('vector-store write timed out'), {
                            code     : PROVIDER_TIMEOUT_CODE,
                            timeoutMs: 1800000
                        })
                    }
                }
            };

            const result = await KB_VectorService.embedChunks({collection, chunksToProcess: chunks});

            expect(result.embedded).toBe(1);
            expect(upsertCalls, 'the persistence attempt remains retryable').toBe(2);
            expect(providerCalls, 'cached vectors prevent a write retry from re-entering the provider').toBe(1);
        } finally {
            globalThis.setTimeout = originalSetTimeout;
        }
    });

    test('#16995: circuit-open is provider-phase terminal and preserves the exact controls', async () => {
        Object.assign(KB_Config.data, {batchSize: 1, batchDelay: 0, maxRetries: 5});

        const
            spy               = createSpyCollection(),
            controller        = new AbortController(),
            onProviderTimeout = () => {},
            circuitError      = Object.assign(new Error('tenant provider circuit open'), {
                code: KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN
            });
        let providerCalls = 0,
            observedOptions;

        TextEmbeddingService.embedTexts = async (texts, provider, options) => {
            providerCalls++;
            observedOptions = options;
            throw circuitError
        };

        const thrown = await KB_VectorService.embedChunks({
            collection     : spy,
            chunksToProcess: makeChunks(2),
            signal          : controller.signal,
            onProviderTimeout
        }).then(() => null, error => error);

        expect(thrown, 'the never-dispatched repository keeps its bounded circuit reason').toBe(circuitError);
        expect(providerCalls, 'an open circuit is not retried five times as provider work').toBe(1);
        expect(observedOptions.signal).toBe(controller.signal);
        expect(observedOptions.onProviderTimeout).toBe(onProviderTimeout);
        expect(spy.upsertedIds).toEqual([]);
    });

    test('CALLER BOUNDARY: shadow-swap REFUSES to promote when a batch failed', async () => {
        // The defect this guards, found by @neo-gpt against the real seam: `embedChunks` is shared by
        // BOTH stale strategies, and a hole means opposite things to them. Incrementally a skipped batch
        // is recoverable — the canonical collection keeps what landed and the next sweep re-selects the
        // rest. Under shadow-swap the shadow REPLACES a complete live corpus, so the same hole is
        // permanent loss behind a success-shaped receipt: live parked, incomplete shadow promoted.
        //
        // Asserted on the RENAMES rather than the return value, because the return value is exactly what
        // looked healthy. Neither collection may be renamed.
        const renames        = [];
        const collectionStub = name => ({
            name,
            async count()  { return 0 },
            async get()    { return {ids: []} },
            async upsert() {},
            async modify({name: newName}) { renames.push(`${name}->${newName}`) }
        });

        // Drives the REAL `embedViaShadowSwap`. An earlier version of this spec re-implemented the
        // promotion decision in the test and was mutation-tested: deleting the production guard left it
        // green. A guard asserted against a copy of itself is worse than none, because it reads covered.
        const originalEmbedChunks = KB_VectorService.embedChunks.bind(KB_VectorService);
        const originalClient      = ChromaManager.client;
        const originalInvalidate  = ChromaManager.invalidateKnowledgeBaseCollectionCache.bind(ChromaManager);

        const shadow = collectionStub('shadow');

        ChromaManager.client = {
            async createCollection() { return shadow },
            async getCollection()    { return shadow },
            async deleteCollection()  {}
        };
        ChromaManager.invalidateKnowledgeBaseCollectionCache = () => {};

        const runWith = async embedOutcome => {
            KB_VectorService.embedChunks = async () => embedOutcome;
            return KB_VectorService.embedViaShadowSwap({
                liveCollection  : collectionStub('live'),
                knowledgeBase   : makeChunks(3),
                idsToDeleteCount: 0
            })
        };

        try {
            await expect(runWith({
                embedded     : 1,
                skipped      : 0,
                yielded      : false,
                failedBatches: [{batchIndex: 2, chunkIds: ['chunk-50'], reason: 'provider rejected this payload'}]
            })).rejects.toThrow(/KB_EMBEDDING_BATCH_FAILED/);

            expect(renames, 'neither collection may be renamed when the shadow is incomplete').toEqual([]);
        } finally {
            KB_VectorService.embedChunks                        = originalEmbedChunks;
            ChromaManager.client                                = originalClient;
            ChromaManager.invalidateKnowledgeBaseCollectionCache = originalInvalidate
        }
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

    test('a total outage carries the provider classification past this hop (#16852)', async () => {
        // The total-outage arm mints a FRESH Error, one hop before the receipt an operator reads.
        // Minting it bare discarded everything the provider had worked out about why — the better the
        // diagnosis upstream, the more this hop threw away. A discriminator that dies here is an
        // intention, not an instrument.
        const spy    = createSpyCollection(),
              chunks = makeChunks(50);

        TextEmbeddingService.embedTexts = async () => {
            const err = new Error('embedding model not resident');

            err.code                   = 'EMBEDDING_MODEL_NOT_RESIDENT';
            err.residencyDisposition   = 'evicted-mid-batch';

            throw err
        };

        const thrown = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks})
            .then(() => null, error => error);

        expect(thrown, 'nothing embedded ⇒ the sweep aborts by throwing').toBeTruthy();
        expect(thrown.residencyDisposition,
            'the classification must survive the re-throw, or no operator ever sees it').toBe('evicted-mid-batch');
        expect(thrown.cause?.code, 'the original failure stays reachable, not just its message')
            .toBe('EMBEDDING_MODEL_NOT_RESIDENT');
    });

    test('an UNCLASSIFIED outage does not acquire a classification in transit (#16852)', async () => {
        // The negative control. Carrying the field forward must never mean inventing one: a failure
        // with no residency observation has to arrive unclassified, or the discriminator becomes
        // noise that always says something.
        const spy    = createSpyCollection(),
              chunks = makeChunks(50);

        TextEmbeddingService.embedTexts = async () => {
            throw new Error('provider socket closed')
        };

        const thrown = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks})
            .then(() => null, error => error);

        expect(thrown).toBeTruthy();
        expect(thrown.residencyDisposition,
            'absent upstream must stay absent downstream').toBeUndefined();
    });
});
