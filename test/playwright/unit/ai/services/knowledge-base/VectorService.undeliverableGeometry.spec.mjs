import {setup} from '../../../../setup.mjs';

const appName = 'KBUndeliverableGeometryTest';

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
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

/**
 * The undeliverable-at-geometry production-path proof, driven through `VectorService.embed()` — NOT
 * `embedChunks()` directly — so every link the direct harness bypasses is exercised for real: corpus re-selection
 * against the collection, the REAL poison store on disk (write at graduation, generation-keyed read,
 * batch-assembly filter on the next sweep), and the census returned to the ingest caller.
 *
 * The matrix is the Round-1 reviewer's falsifier: `[typical-A, monster, typical-B]` under a
 * MULTI-input transport shape (one provider request holding all three texts). Only the monster may
 * graduate; both typicals must persist; the fenced monster must never be dispatched again; and an
 * operator ceiling change must re-offer it automatically via the generation.
 */
test.describe.configure({mode: 'serial'});

function createSpyCollection() {
    const storedByIds = new Map();

    return {
        storedByIds,
        name: 'spy-knowledge-base',
        async upsert({ids, embeddings}) {
            ids.forEach((id, position) => storedByIds.set(id, embeddings?.[position]));
        },
        async get({limit = 2000, offset = 0} = {}) {
            return {ids: Array.from(storedByIds.keys()).slice(offset, offset + limit)}
        },
        async count() {
            return storedByIds.size
        },
        async delete({ids}) {
            ids.forEach(id => storedByIds.delete(id));
        }
    };
}

test.describe('VectorService.embed — undeliverable-at-geometry through the production path (#17129)', () => {
    let SDK, KB_VectorService, KB_Config, Memory_Config, TextEmbeddingService, ChromaManager;
    let originalEmbedTexts, originalBatchConfig, originalGetCollection, originalResumeStateDir, originalCeiling;
    let tmpDir, corpusFile;

    const isMonsterText = text => text.includes('monster body');

    const chunks = [
        {id: 'raw-a', type: 'guide', name: 'typical-a', hash: 'a'.repeat(64), content: 'typical body a'},
        {id: 'raw-m', type: 'guide', name: 'monster',   hash: 'b'.repeat(64), content: 'monster body'},
        {id: 'raw-b', type: 'guide', name: 'typical-b', hash: 'c'.repeat(64), content: 'typical body b'}
    ];

    const tenantContext = {tenantId: 't-undeliverable', repoSlug: 'org/undeliverable-geometry'};

    test.beforeAll(async () => {
        SDK                  = await import('../../../../../../ai/services.mjs');
        KB_Config            = SDK.KB_Config;
        Memory_Config        = SDK.Memory_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        const ChromaManagerModule = await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs');

        KB_VectorService = VectorServiceModule.default;
        ChromaManager    = ChromaManagerModule.default;

        originalEmbedTexts     = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        originalGetCollection  = ChromaManager.getKnowledgeBaseCollection;
        originalResumeStateDir = KB_VectorService.resumeStateDir;
        originalBatchConfig    = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };
        originalCeiling = Memory_Config.embeddingProvider === 'ollama'
            ? Memory_Config.ollama.embeddingTimeoutMs
            : Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs;

        tmpDir     = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-kb-undeliverable-'));
        corpusFile = path.join(tmpDir, 'corpus.jsonl');

        await fs.writeFile(corpusFile, chunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n');

        KB_VectorService.resumeStateDir = path.join(tmpDir, 'state');
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 3});
    });

    test.afterAll(async () => {
        TextEmbeddingService.embedTexts           = originalEmbedTexts;
        ChromaManager.getKnowledgeBaseCollection  = originalGetCollection;
        KB_VectorService.resumeStateDir           = originalResumeStateDir;
        Object.assign(KB_Config.data, originalBatchConfig);

        if (Memory_Config.embeddingProvider === 'ollama') {
            Memory_Config.ollama.embeddingTimeoutMs = originalCeiling;
        } else {
            Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs = originalCeiling;
        }

        await fs.remove(tmpDir);
    });

    test('the monster graduates with the real poison store; typicals persist; a ceiling raise re-offers it', async () => {
        const spy              = createSpyCollection();
        const dispatchedInputs = [];

        ChromaManager.getKnowledgeBaseCollection = async () => spy;

        // The multi-input transport shape: one provider request holds every text it is given, and a
        // request timeout is decorated with the producer span naming the WHOLE request — exactly what
        // `#embedOpenAiCompatibleBatch` stamps. Single-input requests answer exactly.
        TextEmbeddingService.embedTexts = async texts => {
            dispatchedInputs.push([...texts]);

            if (!texts.some(isMonsterText)) {
                return texts.map(() => new Array(384).fill(0))
            }

            const error = new Error('request timed out');

            error.code             = 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT';
            error.failedTextOffset = 0;
            error.failedTextCount  = texts.length;
            throw error
        };

        const runSweep = () => KB_VectorService.embed(corpusFile, {
            deleteStale: false,
            tenantContext
        }).then(value => value, error => error);

        // Sweep 1: one three-input request times out — suspicion only, no disposition may exist yet.
        const first = await runSweep();
        expect(first).toBeInstanceOf(Error);
        expect(first.undeliverableGraduation).toBeUndefined();
        expect(spy.storedByIds.size, 'a multi-input timeout persists nothing and fences nothing').toBe(0);

        // Sweep 2: isolation — typical-A embeds alone and persists; the monster's single-input
        // request earns its first exact strike; the sweep still ends on the timeout.
        const second = await runSweep();
        expect(second).toBeInstanceOf(Error);
        expect(second.undeliverableGraduation).toBeUndefined();
        expect(spy.storedByIds.size, 'the innocent isolation neighbour persists').toBe(1);

        // Sweep 3: second exact strike — graduation writes the REAL poison-store marker, and the
        // receipt rides the original timeout.
        const third = await runSweep();
        expect(third).toBeInstanceOf(Error);
        expect(third.code, 'the original timeout identity survives graduation').toBe('OPENAI_COMPATIBLE_REQUEST_TIMEOUT');
        expect(third.undeliverableGraduation).toMatchObject({attempts: 2});
        expect(third.undeliverableGraduation.chunkId).toMatch(/^[a-f0-9]{64}$/);
        expect(third.undeliverableGraduation.tokenEstimate).toBeGreaterThan(0);
        expect(third.undeliverableGraduation.effectiveCeilingMs).toBe(Number(originalCeiling));

        const monsterChunkId = third.undeliverableGraduation.chunkId;

        // Sweep 4: the persisted disposition filters the monster out of batch assembly — the store
        // read, the re-selection, and the census all run the production flow. Typical-B completes,
        // the repo attempt RETURNS (sibling rotation is possible), and the census names the monster.
        const monsterDispatchesBefore = dispatchedInputs.filter(texts => texts.some(isMonsterText)).length;
        const fourth                  = await runSweep();

        expect(fourth).not.toBeInstanceOf(Error);
        expect(fourth.embedded).toBe(1);
        expect(spy.storedByIds.size, 'both typicals persist; only the monster is excised').toBe(2);
        expect(fourth.poisonedChunks).toEqual([expect.objectContaining({
            chunkId   : monsterChunkId,
            reasonCode: 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY'
        })]);
        expect(
            dispatchedInputs.filter(texts => texts.some(isMonsterText)).length,
            'a fenced chunk must never re-dispatch to the provider'
        ).toBe(monsterDispatchesBefore);

        // Sweep 5: a no-op sweep against the fence keeps returning the census rather than silence.
        const fifth = await runSweep();
        expect(fifth).not.toBeInstanceOf(Error);
        expect(fifth.embedded).toBe(0);
        expect(fifth.poisonedChunks.map(entry => entry.chunkId)).toEqual([monsterChunkId]);

        // Operator ceiling raise: the effective call ceiling is part of the poison GENERATION, so the
        // stored disposition goes stale and the monster is re-offered automatically — no replay flag.
        if (Memory_Config.embeddingProvider === 'ollama') {
            Memory_Config.ollama.embeddingTimeoutMs = Number(originalCeiling) + 60_000;
        } else {
            Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs = Number(originalCeiling) + 60_000;
        }

        const sixth = await runSweep();

        expect(sixth, 'a raised ceiling re-offers the chunk, so the sweep meets the timeout again').toBeInstanceOf(Error);
        expect(
            dispatchedInputs.filter(texts => texts.some(isMonsterText)).length,
            'the generation change re-offered the previously fenced chunk'
        ).toBeGreaterThan(monsterDispatchesBefore);
    });
});

test.describe('VectorService.embed — DEATH-class graduation through the production path (#17336)', () => {
    let SDK, KB_VectorService, KB_Config, TextEmbeddingService, ChromaManager;
    let originalEmbedTexts, originalBatchConfig, originalGetCollection, originalResumeStateDir;
    let tmpDir, corpusFile;

    const isKillerText = text => text.includes('killer body');

    const chunks = [
        {id: 'd-a', type: 'guide', name: 'typical-a', hash: 'd'.repeat(64), content: 'typical body a'},
        {id: 'd-k', type: 'guide', name: 'killer',    hash: 'e'.repeat(64), content: 'killer body'},
        {id: 'd-b', type: 'guide', name: 'typical-b', hash: 'f'.repeat(64), content: 'typical body b'}
    ];

    const tenantContext = {tenantId: 't-death', repoSlug: 'org/death-class'};

    test.beforeAll(async () => {
        SDK                  = await import('../../../../../../ai/services.mjs');
        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        const VectorServiceModule = await import('../../../../../../ai/services/knowledge-base/VectorService.mjs');
        const ChromaManagerModule = await import('../../../../../../ai/services/knowledge-base/ChromaManager.mjs');

        KB_VectorService = VectorServiceModule.default;
        ChromaManager    = ChromaManagerModule.default;

        originalEmbedTexts     = TextEmbeddingService.embedTexts.bind(TextEmbeddingService);
        originalGetCollection  = ChromaManager.getKnowledgeBaseCollection;
        originalResumeStateDir = KB_VectorService.resumeStateDir;
        originalBatchConfig    = {
            batchSize : KB_Config.data.batchSize,
            batchDelay: KB_Config.data.batchDelay,
            maxRetries: KB_Config.data.maxRetries
        };

        tmpDir     = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-kb-death-'));
        corpusFile = path.join(tmpDir, 'corpus.jsonl');

        await fs.writeFile(corpusFile, chunks.map(chunk => JSON.stringify(chunk)).join('\n') + '\n');

        KB_VectorService.resumeStateDir = path.join(tmpDir, 'state');
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 3});
    });

    test.afterAll(async () => {
        TextEmbeddingService.embedTexts           = originalEmbedTexts;
        ChromaManager.getKnowledgeBaseCollection  = originalGetCollection;
        KB_VectorService.resumeStateDir           = originalResumeStateDir;
        Object.assign(KB_Config.data, originalBatchConfig);

        await fs.remove(tmpDir);
    });

    test('a killer chunk graduates on death-class evidence, and the corpus advances past it', async () => {
        const spy              = createSpyCollection();
        const dispatchedInputs = [];

        ChromaManager.getKnowledgeBaseCollection = async () => spy;

        // DEATH, not timeout — and the distinction is the red-proof. `ECONNRESET` is what a provider
        // that accepted the request and then stopped existing looks like on the wire. A timeout stub
        // here would exercise the pre-existing call-ceiling path and pass identically before and after
        // this change.
        TextEmbeddingService.embedTexts = async texts => {
            dispatchedInputs.push([...texts]);

            if (!texts.some(isKillerText)) {
                return texts.map(() => new Array(384).fill(0))
            }

            const error = new Error('socket hang up');

            error.code             = 'ECONNRESET';
            error.failedTextOffset = 0;
            error.failedTextCount  = texts.length;
            throw error
        };

        // MULTIPLE sweeps, and the reason is architectural rather than incidental: the isolation gate
        // is evaluated at BATCH ASSEMBLY, outside the retry loop, so suspicion recorded during a
        // failure is only acted on by a later sweep. The retry loop re-dispatches the identical batch.
        // The timeout automaton gets away with a single call because a timeout ENDS the sweep; a death
        // falls through to the retry path, so a one-sweep fixture can only ever observe the abort.
        const outcomes = [];

        for (let sweep = 0; sweep < 8; sweep++) {
            outcomes.push(await KB_VectorService.embed(corpusFile, {
                deleteStale: false,
                tenantContext
            }).then(value => value, error => error));
        }

        const outcome = outcomes.findLast(value => !(value instanceof Error)) ?? outcomes.at(-1);

        // Instrumentation first: what the sweep ACTUALLY dispatched, so the assertions below are
        // calibrated against observed interleaving rather than predicted interleaving.
        console.log('[#17336 fixture] dispatches:', JSON.stringify(dispatchedInputs.map(texts => texts.map(t => t.slice(0, 14)))));
        outcomes.forEach((value, index) => console.log(`[#17336 fixture] sweep ${index}:`, value instanceof Error
            ? `ERROR ${value.message}`
            : JSON.stringify({e: value?.embedded, grad: value?.deathGraduations, prog: value?.deathStrikeProgress, poison: (value?.poisonedChunks||[]).map(x=>({id:(x.chunkId||'').slice(0,8), r:x.reasonCode}))})));
        console.log('[#17336 fixture] stored ids:', JSON.stringify([...spy.storedByIds.keys()]));

        // The corpus advances past the killer: both typicals land. Asserted on count plus the
        // killer's ABSENCE rather than on two literal ids — production derives a chunk id by
        // hashing `hashInputs`, so the stored keys are content hashes and never the fixture's
        // logical names. An id-literal assertion here failed on shape and masked the assertion
        // below, which is the one that carries the ticket.
        // Aggregated across sweeps: graduation is a one-time event, so a per-sweep read lands on a
        // quiet sweep long after the graduating one.
        const graduations = outcomes
            .filter(value => !(value instanceof Error))
            .flatMap(value => value?.deathGraduations ?? []);

        // Exactly once, on death-class evidence, naming the code that proved liveness.
        expect(graduations).toHaveLength(1);
        expect(graduations[0].failureCode).toBe('KB_VECTOR_EMBED_TRANSPORT_CLOSED');
        expect(graduations[0].attempts).toBeGreaterThanOrEqual(2);

        const killerId = graduations[0].chunkId;

        // The corpus advances past the killer: both typicals land, and the killer is not among
        // them. Asserted on count plus the killer's absence rather than on two literal ids —
        // production derives a chunk id by hashing `hashInputs`, so stored keys are content hashes.
        expect(spy.storedByIds.size).toBe(2);
        expect([...spy.storedByIds.keys()]).not.toContain(killerId);

        // The discriminator: the killer ends up fenced under *geometry*, never a content verdict.
        const finalPoison = outcomes.findLast(value => !(value instanceof Error))?.poisonedChunks ?? [];

        expect(finalPoison.map(entry => entry.chunkId)).toContain(killerId);
        expect(finalPoison.find(entry => entry.chunkId === killerId).reasonCode)
            .toBe('KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY');
    });

    /**
     * @summary Moves the effective call ceiling, which is part of the poison generation coordinate.
     * @param {Number} deltaMs Offset from the process default.
     * @returns {void}
     */
    function shiftGeneration(deltaMs) {
        const Memory_Config = SDK.Memory_Config,
              base          = Memory_Config.embeddingProvider === 'ollama'
                  ? Memory_Config.ollama.embeddingTimeoutMs
                  : Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs;

        if (Memory_Config.embeddingProvider === 'ollama') {
            Memory_Config.ollama.embeddingTimeoutMs = Number(base) + deltaMs
        } else {
            Memory_Config.openAiCompatible.batchEmbeddingTimeoutMs = Number(base) + deltaMs
        }
    }

    /**
     * @summary Sweeps until a death graduation is observed, or the cap is reached.
     * @param {Number} [maxSweeps=8]
     * @returns {Promise<Object[]>} Graduation receipts observed across the sweeps.
     */
    async function sweepUntilGraduation(maxSweeps = 16) {
        const seen = [];

        for (let sweep = 0; sweep < maxSweeps && seen.length === 0; sweep++) {
            const value = await KB_VectorService.embed(corpusFile, {deleteStale: false, tenantContext})
                .then(result => result, error => error);


            if (!(value instanceof Error)) {
                seen.push(...(value.deathGraduations ?? []))
            }
        }

        return seen
    }

    /*
        // Asserted by making the boundary the ONLY thing that changes the answer.
        //
        // The tempting shape — graduate under A, graduate under B, compare `attempts` — is not
        // constructible here: graduation can complete inside a single sweep across its retries, and a
        // sweep that ends on the provider error carries no summary, so its receipt is unobservable.
        // Measured, not assumed: instrumenting it showed the disposition re-minted under the new
        // generation during an erroring sweep, which is correct behaviour that the assertion could
        // not see.
        //
        // So instead the killer STOPS killing after the boundary. No new death can then mask a
        // carried one, and `deathStrikeProgress` must be empty. With the strike carried across the
        // generation it still lists the chunk, which is the whole leak in one field.
     */
    test('NEGATIVE CONTROL: a strike does not survive the generation that authorised it', async () => {
        // Its own tenant, so the durable poison scope cannot carry in from a sibling arm. This file
        // is `mode: 'serial'` over a MODULE-level evidence map and an on-disk store keyed by tenant —
        // sharing one scope made arm order part of the contract, which is not a contract anyone
        // declared. Raising sweep budgets papers over that; scoping removes it.
        const scoped = {tenantId: 't-death-generation', repoSlug: 'org/death-generation'};
        const spy    = createSpyCollection();

        ChromaManager.getKnowledgeBaseCollection = async () => spy;

        let lethal = true;

        TextEmbeddingService.embedTexts = async texts => {
            if (!lethal || !texts.some(isKillerText)) {
                return texts.map(() => new Array(384).fill(0))
            }

            const error = new Error('socket hang up');

            error.code             = 'ECONNRESET';
            error.failedTextOffset = 0;
            error.failedTextCount  = texts.length;
            throw error
        };

        shiftGeneration(480_000);

        // Earn a real strike, and stop BELOW the threshold so nothing graduates and the evidence is
        // still transient rather than durable.
        let earned = null;

        for (let sweep = 0; sweep < 8 && earned === null; sweep++) {
            const value = await KB_VectorService.embed(corpusFile, {deleteStale: false, tenantContext: scoped})
                .then(result => result, error => error);

            if (!(value instanceof Error)) {
                earned = (value.deathStrikeProgress ?? []).find(entry => entry.strikes > 0) ?? null
            }
        }

        expect(earned, 'a strike must exist before the boundary or this control proves nothing').not.toBeNull();

        // Cross the boundary, and remove the cause. Any entry still listed after this is carried
        // evidence, because nothing on this side of the boundary can create one.
        shiftGeneration(600_000);
        lethal = false;

        const after = await KB_VectorService.embed(corpusFile, {deleteStale: false, tenantContext: scoped})
            .then(result => result, error => error);

        expect(after, 'with the killer no longer lethal the sweep must complete').not.toBeInstanceOf(Error);
        expect(after.deathStrikeProgress, 'a carried strike would still be listed here').toEqual([]);
    });

    /*
     * OUTSTANDING — the second control @neo-gpt asked for (a carried provider success breaking a
     * chunk's death chain) is NOT here, and the omission is deliberate rather than forgotten.
     *
     * The production code is fixed: both carry arms now delete the chunk's death entry alongside its
     * strike and suspicion. What is missing is a production-path assertion, and four fixture shapes
     * failed on the same wall: a PENDING death is only recorded on a sweep that ends on the provider
     * error, and an erroring sweep returns no summary — so the state the control needs to observe has
     * no observable. A discriminating pair (graduate-vs-not, keyed on whether a carry intervenes) was
     * the closest attempt and did not land either.
     *
     * Rather than ship an arm that passes without exercising the reset, this is stated and returned to
     * the reviewer, in the review response rather than here — a pull-request number in a durable
     * comment is exactly what `check-ticket-archaeology` exists to keep out.
     */
});
