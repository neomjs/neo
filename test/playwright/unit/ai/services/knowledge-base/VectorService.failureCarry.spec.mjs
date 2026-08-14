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

import {test, expect}                 from '@playwright/test';
import Neo                            from '../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../src/core/_export.mjs';
import {EMBEDDING_BATCH_YIELDED_CODE} from '../../../../../../ai/services/memory-core/TextEmbeddingService.mjs';

/**
 * Work conservation and undeliverable-at-geometry attribution on the failure path of
 * `VectorService.embedChunks`.
 *
 * The carry half: the yield arm already persists the completed prefix a lease-yield carries; a
 * provider FAILURE mid-batch used to discard it, so every completed-but-unpersisted embedding was
 * re-purchased on every attempt and every later sweep.
 *
 * The attribution half: a provider timeout names the REQUEST, not a member. Strikes therefore accrue
 * only from requests that held exactly one input — via a single-chunk dispatch or the producer's
 * `failedTextOffset`/`failedTextCount` span — while a multi-input timeout only marks its members as
 * isolation suspects, each of which is then offered alone to earn exact evidence. Strikes are
 * generation-keyed, reset on any dispatched non-timeout provider outcome, and guarded against
 * overlapping attempts counting one wall-clock failure twice.
 *
 * Every arm passes its own `poisonGenerationId`: the automaton is deliberately process-local and
 * generation-scoped, so per-arm generations are what keep arms hermetic.
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
 * Per-arm embedding-generation id. The undeliverable automaton is generation-scoped module state,
 * so giving each arm its own generation is the hermetic-isolation mechanism, not a convenience.
 */
function makeGenerationId(seed) {
    return seed.repeat(64).slice(0, 64)
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

/**
 * Builds a timeout decorated with the producer's failed-request span — what the OpenAI-compatible
 * transport now stamps on every request failure. `failedTextCount: 1` is the exact-attribution shape.
 */
function makeTimeout({failedTextOffset, failedTextCount} = {}) {
    const error = new Error('request timed out');

    error.code = 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT';

    if (Number.isInteger(failedTextOffset)) error.failedTextOffset = failedTextOffset;
    if (Number.isInteger(failedTextCount))  error.failedTextCount  = failedTextCount;

    return error
}

test.describe('VectorService.embedChunks — failure-path work conservation (#17112) + undeliverable attribution (#17129)', () => {
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
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('a')
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
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('b')
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

    test('a TRANSIENT prefix-write failure retries the WRITE inside the shared budget — never re-entering the provider', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        // First upsert call rejects (transient storage failure), every later call delegates.
        // The invariant under test is the cached-vector rule the ordinary path already holds:
        // vectors in hand retry the WRITE — a write failure must consume retry budget, not
        // escape the accounting and lose the carried work.
        const realUpsert  = spy.upsert.bind(spy);
        let   upsertCalls = 0;

        spy.upsert = async payload => {
            upsertCalls++;
            if (upsertCalls === 1) throw new Error('transient storage failure');
            return realUpsert(payload)
        };

        const receivedTextCounts = [];
        let   embedCalls         = 0;

        TextEmbeddingService.embedTexts = async texts => {
            embedCalls++;
            receivedTextCounts.push(texts.length);

            if (embedCalls === 1) {
                throw makeCarriedFailure({
                    completedChunkCount: 2,
                    totalChunkCount    : 10,
                    completedTextCount : 10,
                    embeddings         : chunks.slice(0, 10).map(chunk => makeEmbedding(chunkIndexOf(chunk)))
                });
            }

            return texts.map((_, position) => makeEmbedding(chunkIndexOf(chunks[10 + position])))
        };

        const result = await KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('c')
        });

        // Three write calls: the rejected prefix attempt, the successful prefix retry, and the
        // remainder — while the provider is entered exactly twice ([50, 40]): the write retry
        // must never re-purchase provider work.
        expect(upsertCalls).toBe(3);
        expect(receivedTextCounts).toEqual([50, 40]);
        expect(result.embedded).toBe(50);
        expect(spy.upsertedIds).toEqual(chunks.map(chunk => chunk.id));

        chunks.forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} must store its own vector across the write-retry boundary`
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
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('d')
        }).then(() => null, error => error);

        // One missing vector slides every later one onto its neighbour's id with no length mismatch
        // downstream — refusing loudly beats storing 9 vectors under the wrong 9 ids.
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toContain('refusing to bind vectors to chunk ids by position');
        expect(spy.calls.upsert, 'nothing may be written on a disagreement').toBe(0);
    });

    test('a transient YIELD-prefix write failure retries the write under the same shared contract', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50); // 1 batch

        // The symmetry gap a reviewer named: the failure arm got the budgeted write retry while the
        // yield arm still wrote bare — a transient rejection there escaped before `yielded: true`
        // could return with durable progress, so the next acquisition re-purchased the prefix.
        const realUpsert  = spy.upsert.bind(spy);
        let   upsertCalls = 0;

        spy.upsert = async payload => {
            upsertCalls++;
            if (upsertCalls === 1) throw new Error('transient storage failure');
            return realUpsert(payload)
        };

        let embedCalls = 0;

        TextEmbeddingService.embedTexts = async () => {
            embedCalls++;

            const error = new Error('openAiCompatible batch embedding yielded the heavy-maintenance lease after 2/10 provider chunk(s), 10 embedding(s) carried');

            error.code                = EMBEDDING_BATCH_YIELDED_CODE;
            error.completedChunkCount = 2;
            error.totalChunkCount     = 10;
            error.completedTextCount  = 10;
            error.embeddings          = chunks.slice(0, 10).map(chunk => makeEmbedding(chunkIndexOf(chunk)));
            throw error
        };

        const result = await KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('e')
        });

        // One rejected write, one successful retry, ZERO extra provider entries — the yield stays a
        // decision, and its paid-for prefix survives the storage hiccup.
        expect(upsertCalls).toBe(2);
        expect(embedCalls, 'a write retry must never re-enter the provider').toBe(1);
        expect(result.yielded).toBe(true);
        expect(result.embedded).toBe(10);
        expect(spy.upsertedIds).toEqual(chunks.slice(0, 10).map(chunk => chunk.id));

        chunks.slice(0, 10).forEach(chunk => {
            expect(
                spy.storedByIds.get(chunk.id)?.[0],
                `${chunk.id} must store its own vector across the yield write-retry boundary`
            ).toBe(chunkIndexOf(chunk));
        });
    });

    test('an UNCARRIED timeout keeps its existing behavior: sweep ends, nothing persisted', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(50);

        TextEmbeddingService.embedTexts = async () => { throw makeTimeout() };

        const outcome = await KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            poisonGenerationId: makeGenerationId('f')
        }).then(() => null, error => error);

        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.code).toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(spy.calls.upsert).toBe(0);
    });

    test('a MID-BATCH monster graduates via the producer span — the carry pins it, innocents persist, the receipt is exact', async () => {
        const spy = createSpyCollection();
        // The monster is DELIBERATELY at index 1, not 0: under head-blame attribution the first
        // timeout would strike sig-0 (an innocent), and this arm's graduation assertion would fail.
        // This is the mutation-sensitivity the Round-1 review demanded.
        const chunks = Array.from({length: 5}, (_, i) => ({
            id: `sig-${i}`, type: 'guide', name: `s${i}`, content: i === 1 ? 'monster body' : `typical body ${i}`
        }));
        const isMonsterText = text => text.includes('monster body');

        const persisted    = [];
        const generationId = makeGenerationId('0');

        // A chunkSize=1 transport (the constrained plane's llama.cpp shape): every input is its own
        // provider request, so the producer span always names exactly one text. A monster at
        // position N fails with the first N requests completed and carried.
        TextEmbeddingService.embedTexts = async texts => {
            const monsterIndex = texts.findIndex(isMonsterText);

            if (monsterIndex === -1) {
                return texts.map(() => new Array(384).fill(0))
            }

            if (monsterIndex === 0) {
                throw makeTimeout({failedTextOffset: 0, failedTextCount: 1})
            }

            throw Object.assign(makeTimeout({failedTextOffset: monsterIndex, failedTextCount: 1}), {
                completedChunkCount: monsterIndex,
                totalChunkCount    : texts.length,
                completedTextCount : monsterIndex,
                embeddings         : Array.from({length: monsterIndex}, () => new Array(384).fill(0))
            })
        };

        // Production re-selection: a later sweep only offers what the collection does not hold.
        const remaining = () => chunks.filter(chunk => !spy.storedByIds.has(chunk.id));

        const runSweep = (extra = {}) => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : remaining(),
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId,
            ...extra
        }).then(value => value, error => error);

        // Sweep 1: the carry persists sig-0, the span names sig-1 exactly — strike 1, no graduation.
        const first = await runSweep();
        expect(first).toBeInstanceOf(Error);
        expect(persisted).toHaveLength(0);
        expect(spy.upsertedIds, 'the innocent prefix persists before the sweep ends').toEqual(['sig-0']);

        // Sweep 2: the monster is now first; a single-input span strikes it again — graduation, with
        // the exact receipt ON the original timeout, whose identity survives.
        const second = await runSweep();
        expect(second).toBeInstanceOf(Error);
        expect(second.code, 'the original timeout identity survives graduation').toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(persisted).toEqual([{chunkId: 'sig-1', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
        expect(second.undeliverableGraduation).toMatchObject({chunkId: 'sig-1', attempts: 2});
        expect(second.undeliverableGraduation.tokenEstimate).toBeGreaterThan(0);
        expect(second.undeliverableGraduation.effectiveCeilingMs).toBeGreaterThan(0);

        // Sweep 3 with the graduated chunk excluded (the production filter is the existing
        // knownPoisonEntries flow): the remainder completes — the head-of-line block is gone.
        const third = await runSweep({knownPoisonEntries: persisted.map(entry => ({...entry}))});

        expect(third.embedded, 'every chunk behind the excised monster embeds').toBe(3);
        expect(spy.upsertedIds).toEqual(['sig-0', 'sig-2', 'sig-3', 'sig-4']);
        expect(third.poisonedChunks.map(entry => entry.chunkId), 'the census carries the excised chunk').toEqual(['sig-1']);
    });

    test('a MULTI-input timeout never strikes: [typical-A, monster, typical-B] isolates, only the monster graduates', async () => {
        const spy    = createSpyCollection();
        const chunks = [
            {id: 'mx-a', type: 'guide', name: 'a', content: 'typical body a'},
            {id: 'mx-m', type: 'guide', name: 'm', content: 'monster body'},
            {id: 'mx-b', type: 'guide', name: 'b', content: 'typical body b'}
        ];
        const isMonsterText = text => text.includes('monster body');

        const persisted        = [];
        const dispatchedInputs = [];
        const generationId     = makeGenerationId('1');

        // A multi-input transport (parallel=4 → one POST holding all three texts): a timeout names
        // the whole request via the producer span. Single-input requests behave exactly.
        TextEmbeddingService.embedTexts = async texts => {
            dispatchedInputs.push([...texts]);

            if (!texts.some(isMonsterText)) {
                return texts.map(() => new Array(384).fill(0))
            }

            throw makeTimeout({failedTextOffset: 0, failedTextCount: texts.length})
        };

        const remaining = () => chunks.filter(chunk => !spy.storedByIds.has(chunk.id));

        const runSweep = (extra = {}) => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : remaining(),
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId,
            ...extra
        }).then(value => value, error => error);

        // Sweep 1: one three-input POST times out. NOTHING may be struck — under head-blame, typical-A
        // would take this strike and a second sweep would fence an innocent durably.
        const first = await runSweep();
        expect(first).toBeInstanceOf(Error);
        expect(persisted).toHaveLength(0);
        expect(spy.upsertedIds).toEqual([]);

        // Sweep 2: isolation — typical-A is offered ALONE, embeds, and clears; the monster is offered
        // alone, times out, and earns its FIRST exact strike; the sweep ends on that timeout.
        const second = await runSweep();
        expect(second).toBeInstanceOf(Error);
        expect(persisted, 'one exact strike is not graduation').toHaveLength(0);
        expect(spy.upsertedIds, 'the innocent neighbour persists during isolation').toEqual(['mx-a']);

        // Sweep 3: the monster isolates again — second exact strike, graduation with the receipt.
        const third = await runSweep();
        expect(third).toBeInstanceOf(Error);
        expect(persisted).toEqual([{chunkId: 'mx-m', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
        expect(third.undeliverableGraduation).toMatchObject({chunkId: 'mx-m', attempts: 2});

        // Sweep 4: the fence filters the monster; typical-B completes; the census carries the monster.
        const monsterDispatchesBefore = dispatchedInputs.filter(texts => texts.some(isMonsterText)).length;
        const fourth                  = await runSweep({knownPoisonEntries: persisted.map(entry => ({...entry}))});

        expect(fourth.embedded).toBe(1);
        expect(spy.upsertedIds).toEqual(['mx-a', 'mx-b']);
        expect(fourth.poisonedChunks.map(entry => entry.chunkId)).toEqual(['mx-m']);
        expect(
            dispatchedInputs.filter(texts => texts.some(isMonsterText)).length,
            'a graduated chunk must never be dispatched to the provider again'
        ).toBe(monsterDispatchesBefore);

        // Terminal accounting: only the monster ever graduated; both typicals persisted.
        expect(persisted).toHaveLength(1);
    });

    test('a dispatched NON-timeout failure resets the consecutive chain: timeout → 500 → timeout never graduates', async () => {
        const spy    = createSpyCollection();
        const chunks = [{id: 'rst-0', type: 'guide', name: 'r0', content: 'reset body'}];

        Object.assign(KB_Config.data, {maxRetries: 1}); // one 500 exhausts the batch without backoff sleeps

        const persisted    = [];
        const generationId = makeGenerationId('2');
        let   mode         = 'timeout';

        TextEmbeddingService.embedTexts = async texts => {
            if (mode === 'timeout') throw makeTimeout({failedTextOffset: 0, failedTextCount: 1});
            if (mode === 'http500') throw new Error('HTTP 500: provider hiccup');
            return texts.map(() => new Array(384).fill(0))
        };

        const runSweep = () => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId
        }).then(value => value, error => error);

        await runSweep();                    // timeout — exact strike 1
        mode = 'http500';
        await runSweep();                    // dispatched non-timeout outcome — the chain RESETS
        mode = 'timeout';
        const third = await runSweep();      // timeout — strike 1 again, NOT 2

        expect(third).toBeInstanceOf(Error);
        expect(persisted, 'a non-timeout outcome between two timeouts breaks "consecutive"').toHaveLength(0);

        const fourth = await runSweep();     // timeout — NOW consecutive: strike 2, graduation

        expect(fourth).toBeInstanceOf(Error);
        expect(persisted).toEqual([{chunkId: 'rst-0', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
    });

    test('provider success followed by a STORAGE failure still resets: timeout → success/write-fail → timeout never graduates', async () => {
        const spy    = createSpyCollection();
        const chunks = [{id: 'psf-0', type: 'guide', name: 'p0', content: 'storage-failure body'}];

        Object.assign(KB_Config.data, {maxRetries: 1});

        const persisted    = [];
        const generationId = makeGenerationId('3');
        let   mode         = 'timeout';

        TextEmbeddingService.embedTexts = async texts => {
            if (mode === 'timeout') throw makeTimeout({failedTextOffset: 0, failedTextCount: 1});
            return texts.map(() => new Array(384).fill(0))
        };

        const realUpsert = spy.upsert.bind(spy);
        let   failWrites = false;

        spy.upsert = async payload => {
            if (failWrites) throw new Error('storage refused the write');
            return realUpsert(payload)
        };

        const runSweep = () => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId
        }).then(value => value, error => error);

        await runSweep();                    // timeout — exact strike 1

        mode = 'success'; failWrites = true;
        const storageFail = await runSweep(); // provider SUCCEEDS, storage fails — non-timeout outcome, chain resets
        expect(storageFail).toBeInstanceOf(Error);

        mode = 'timeout'; failWrites = false;
        const third = await runSweep();      // timeout — strike 1 again, NOT 2

        expect(third).toBeInstanceOf(Error);
        expect(persisted, 'the provider half succeeded, so two timeouts around it are not consecutive').toHaveLength(0);

        const fourth = await runSweep();     // timeout — consecutive now: graduation

        expect(fourth).toBeInstanceOf(Error);
        expect(persisted).toEqual([{chunkId: 'psf-0', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
    });

    test('two OVERLAPPING timeouts count once: attempts dispatched before either strike cannot fabricate a consecutive pair', async () => {
        const spy    = createSpyCollection();
        const chunks = [{id: 'ovl-0', type: 'guide', name: 'o0', content: 'overlap body'}];

        const persisted    = [];
        const generationId = makeGenerationId('4');
        const rejecters    = [];
        let   deferred     = true;

        TextEmbeddingService.embedTexts = async () => {
            if (!deferred) throw makeTimeout({failedTextOffset: 0, failedTextCount: 1});

            return new Promise((_, reject) => rejecters.push(reject))
        };

        const runSweep = () => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId
        }).then(value => value, error => error);

        const waitFor = async predicate => {
            for (let i = 0; i < 200 && !predicate(); i++) {
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            expect(predicate()).toBe(true);
        };

        // Both attempts dispatch BEFORE either observes a failure — the overlapping shape.
        const sweepA = runSweep();
        await waitFor(() => rejecters.length === 1);
        const sweepB = runSweep();
        await waitFor(() => rejecters.length === 2);

        rejecters[0](makeTimeout({failedTextOffset: 0, failedTextCount: 1}));
        const outcomeA = await sweepA;
        rejecters[1](makeTimeout({failedTextOffset: 0, failedTextCount: 1}));
        const outcomeB = await sweepB;

        expect(outcomeA).toBeInstanceOf(Error);
        expect(outcomeB).toBeInstanceOf(Error);
        expect(persisted, 'two overlapping observations of one failure window are ONE strike, not a pair').toHaveLength(0);

        // A genuinely sequential third attempt completes the pair honestly.
        deferred = false;
        const third = await runSweep();

        expect(third).toBeInstanceOf(Error);
        expect(persisted).toEqual([{chunkId: 'ovl-0', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
    });

    test('strikes are GENERATION-keyed: a timeout under generation A and one under generation B never combine', async () => {
        const spy    = createSpyCollection();
        const chunks = [{id: 'gen-0', type: 'guide', name: 'g0', content: 'generation body'}];

        const persisted = [];

        TextEmbeddingService.embedTexts = async () => { throw makeTimeout({failedTextOffset: 0, failedTextCount: 1}) };

        const runSweep = generationId => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            onPoisonEntries   : async entries => { persisted.push(...entries) },
            poisonGenerationId: generationId
        }).then(value => value, error => error);

        const genA = makeGenerationId('5');
        const genB = makeGenerationId('6');

        await runSweep(genA);                // strike 1 under A
        await runSweep(genB);                // generation change resets — strike 1 under B, NOT 2

        expect(persisted, 'evidence gathered under one ceiling is not evidence under another').toHaveLength(0);

        await runSweep(genB);                // consecutive under B: graduation

        expect(persisted).toEqual([{chunkId: 'gen-0', reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'}]);
    });

    test('a failing disposition writer FAILS OPEN: the original timeout propagates and the chunk stays offered', async () => {
        const spy    = createSpyCollection();
        const chunks = Array.from({length: 2}, (_, i) => ({
            id: `fo-${i}`, type: 'guide', name: `f${i}`, content: `fail-open body ${i}`
        }));

        // The producer span names the head exactly, so the strikes are exact — the writer is the
        // only thing failing in this arm.
        TextEmbeddingService.embedTexts = async () => { throw makeTimeout({failedTextOffset: 0, failedTextCount: 1}) };

        const runSweep = () => KB_VectorService.embedChunks({
            collection        : spy,
            chunksToProcess   : chunks,
            shouldYield       : () => false,
            onPoisonEntries   : async () => { throw new Error('disposition store unavailable') },
            poisonGenerationId: makeGenerationId('7')
        }).then(() => null, error => error);

        await runSweep();              // exact strike 1
        const second = await runSweep(); // exact strike 2 — graduation attempted, writer throws

        // The persist failure must neither mask the timeout nor suppress the chunk.
        expect(second).toBeInstanceOf(Error);
        expect(second.code).toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(second.message).not.toContain('disposition store unavailable');
        expect(second.undeliverableGraduation, 'no receipt may be minted for a disposition that did not persist').toBeUndefined();
    });

    test('the poison generation carries the effective embed call ceiling, so a ceiling change re-offers suppressed chunks', async () => {
        const Memory_Config = SDK.Memory_Config;
        const generation    = KB_VectorService.resolveEmbeddingPoisonGeneration();

        const expectedCeiling = Memory_Config.embeddingProvider === 'ollama'
            ? Number(Memory_Config.ollama.embeddingTimeoutMs)
            : Number(Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs);

        expect(generation.embedCallCeilingMs, 'suppression evidence is only valid under the ceiling it was gathered at').toBe(expectedCeiling);
        expect(Number.isFinite(generation.embedCallCeilingMs)).toBe(true);
    });
});
