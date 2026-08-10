import {setup} from '../../../../setup.mjs';

const appName = 'KBPersistenceNonConvergenceTest';

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

import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os                    from 'node:os';
import path                  from 'node:path';
import {test, expect}        from '@playwright/test';
import Database              from 'better-sqlite3';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import {snapshotAiConfig}    from '../memory-core/util.mjs';

/**
 * @summary Persistence failure is an UNBOUNDED re-embed loop, proven through PRODUCTION's own selector.
 *
 * `embedChunks` computes an embedding and upserts inside the same `try`. A persistence failure
 * discards work the provider has already been paid for, and the next sweep re-selects exactly the same
 * chunks — they are not in the collection — and pays for them again. Every sweep costs full provider
 * time and stores nothing.
 *
 * **The loop is not the finding; its invisibility is.** From provider load alone this is
 * indistinguishable from an ingestion making progress: continuous inference, a corpus that is not
 * growing, and every per-sweep receipt reporting a handled failure.
 *
 * ## Why selection must belong to production, and not to this file
 *
 * A spec that runs its own sweep loop and hands `embedChunks` the full corpus every pass measures
 * nothing: the repetition it reports is authored by the test, and a control that discriminates with
 * its own `filter(chunk => !landed.has(chunk.id))` is comparing two pieces of test code. The real
 * sweep selector is `VectorService.embed()`, which reads `existingIds` off the collection and selects
 * only what is missing — **that is the convergence mechanism itself**. A repair that stopped
 * re-selecting would be invisible to arms shaped that way, so a correct implementation would keep
 * them green.
 *
 * Both arms therefore run `runProductionSweep()` below, which is production all the way down, and the
 * only variable between them is whether the upsert persisted — the same discriminator production uses.
 *
 * ## The reporting terminal
 *
 * A process-local observer cannot see this at all: the recorder and the reader are different OS
 * processes, so a window owned by the embedding singleton in one process is unreadable in the other.
 * The shared identity ledger removes that boundary — `VectorService` passes
 * `providerActivityRecorder: KBRecorderService`, which stamps `source: 'knowledge-base'` into the
 * ledger on every admitted batch.
 *
 * The ratio arm therefore drives the REAL `embedTexts` with the provider stubbed **below** the seam.
 * Stubbing `embedTexts` skips the ledger write entirely and certifies the stub instead of the path.
 */
test.describe.configure({mode: 'serial'});

/**
 * @summary One collection double, one variable: whether the write persists.
 *
 * Modelling both arms with a single factory is deliberate. Two hand-written doubles can drift into
 * differing on something other than persistence, and then the arms stop being each other's falsifier
 * for a reason no reader can see.
 *
 * It refuses what ChromaDB refuses. A double that accepts any `{ids, embeddings}` pair deletes the
 * store's mandatory refusals, and every assertion downstream of that removal becomes a property of
 * the double rather than of the system — which is how a spec ends up proving the opposite of its
 * claim. When a test replaces a boundary, model what the boundary REJECTS, not only what it records.
 */
function createCollection({persists}) {
    const landed = new Set(), upsertAttempts = [];

    return {
        landed,
        upsertAttempts,
        name: 'spy-knowledge-base',

        async get({limit = 1000, offset = 0, include = []} = {}) {
            const slice = [...landed].slice(offset, offset + limit);

            return {
                ids      : slice,
                metadatas: include.includes('metadatas') ? slice.map(() => ({})) : [],
                documents: include.includes('documents') ? slice.map(() => '')   : []
            }
        },

        async delete({ids}) {
            ids.forEach(id => landed.delete(id));
        },

        async count() {
            return landed.size
        },

        async upsert({ids, embeddings, metadatas}) {
            upsertAttempts.push([...ids]);

            const lengths = [['ids', ids?.length], ['embeddings', embeddings?.length], ['metadatas', metadatas?.length]]
                .filter(([, length]) => Number.isFinite(length));

            if (lengths.some(([, length]) => length === 0)) {
                throw new Error('Non-empty lists are required for the record set');
            }

            if (new Set(lengths.map(([, length]) => length)).size > 1) {
                throw new Error('Unequal lengths for fields in the record set');
            }

            if (!persists) {
                throw new Error('collection unavailable: persistence rejected the write');
            }

            ids.forEach(id => landed.add(id));
        }
    }
}

function makeChunks(count) {
    return Array.from({length: count}, (_, i) => ({
        id     : `chunk-${i}`,
        type   : 'guide',
        name   : `symbol-${i}`,
        content: `body for chunk ${i}`
    }));
}

/**
 * @summary Writes the JSONL corpus `VectorService.embed()` reads, so the deployed entry point can be
 * driven with its own loader and its own selector rather than a hand-supplied chunk array.
 * @param {String} filePath Destination of the synthetic corpus.
 * @param {Number} chunkCount How many chunks to write.
 * @returns {void}
 */
function writeFixtureJsonl(filePath, chunkCount) {
    const lines = Array.from({length: chunkCount}, (_, i) => JSON.stringify({
        hash       : `chunk-${i}`,
        type       : 'method',
        name       : `method${i}`,
        className  : '',
        description: `synthetic chunk ${i}`,
        content    : `body ${i}`
    }));

    writeFileSync(filePath, lines.join('\n'), 'utf8');
}

test.describe('VectorService — persistence failure is an unbounded re-embed loop', () => {
    let KB_VectorService, KB_Config, MC_Config, TextEmbeddingService, KBRecorderService, KB_ChromaManager;
    let originalGetCollection, corpusPath;
    let selectResumableChunks, ensureEmbeddingIdentitySchema, getEmbeddingIdentityWindow;
    let restoreKBConfig, restoreMCConfig, originalOllamaProvider, originalRecorderDb;
    let db, tempDir;

    /**
     * @summary ONE sweep, decided by PRODUCTION.
     *
     * `readCollectionIds` asks the collection what actually landed, `selectResumableChunks` decides
     * what remains, `embedChunks` embeds exactly that. No selection logic lives in this file, which is
     * the whole repair: a change to how production selects moves these numbers.
     *
     * @param {Object} options
     * @param {Object} options.collection The collection double under test.
     * @param {Object[]} options.corpus The full current-corpus chunks.
     * @returns {Promise<{selected: Number}>} How many chunks production chose to embed this sweep.
     */
    async function runProductionSweep({collection, corpus}) {
        const existingIds = await KB_VectorService.readCollectionIds(collection),
              {remaining} = selectResumableChunks({chunks: corpus, existingIds});

        if (remaining.length === 0) {
            return {selected: 0}
        }

        await KB_VectorService.embedChunks({collection, chunksToProcess: remaining})
            .then(() => null, () => null);

        return {selected: remaining.length}
    }

    test.beforeAll(async () => {
        const SDK = await import('../../../../../../ai/services.mjs');

        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;
        MC_Config            = (await import('../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default;
        KB_VectorService     = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;
        KBRecorderService    = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;

        ({selectResumableChunks} = await import('../../../../../../ai/services/knowledge-base/helpers/resumableEmbedding.mjs'));
        ({ensureEmbeddingIdentitySchema, getEmbeddingIdentityWindow} =
            await import('../../../../../../ai/services/shared/embeddingIdentityLedger.mjs'));

        KB_ChromaManager = SDK.KB_ChromaManager;

        originalOllamaProvider = TextEmbeddingService.ollamaProvider;
        originalRecorderDb     = KBRecorderService.db;
        originalGetCollection  = KB_ChromaManager.getKnowledgeBaseCollection.bind(KB_ChromaManager);
    });

    test.afterAll(() => {
        TextEmbeddingService.ollamaProvider          = originalOllamaProvider;
        KBRecorderService.db                         = originalRecorderDb;
        KB_ChromaManager.getKnowledgeBaseCollection  = originalGetCollection;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();
    });

    test.beforeEach(() => {
        restoreMCConfig = snapshotAiConfig(MC_Config, ['embeddingProvider']);
        restoreKBConfig = snapshotAiConfig(KB_Config, ['data.batchSize', 'data.batchDelay', 'data.maxRetries']);

        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
        MC_Config.embeddingProvider = 'ollama';

        tempDir    = mkdtempSync(path.join(os.tmpdir(), 'neo-kb-nonconvergence-'));
        corpusPath = path.join(tempDir, 'corpus.jsonl');
        db         = new Database(path.join(tempDir, 'telemetry.sqlite'));
        db.pragma('journal_mode = WAL');
        ensureEmbeddingIdentitySchema(db);

        KBRecorderService.db = db;

        // Below the seam, deliberately. The real `embedTexts` must run so the KB recorder writes into
        // the shared ledger; stubbing `embedTexts` would bypass the terminal this spec exists to assert.
        TextEmbeddingService.ollamaProvider = {
            async embed(input) {
                const texts = Array.isArray(input) ? input : [input];
                return {embeddings: texts.map(() => new Array(384).fill(0.1))}
            }
        };
    });

    test.afterEach(() => {
        KB_ChromaManager.getKnowledgeBaseCollection = originalGetCollection;
        KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

        KBRecorderService.db = originalRecorderDb;

        if (db?.open) {
            db.close();
        }

        rmSync(tempDir, {force: true, recursive: true});

        restoreKBConfig?.();
        restoreMCConfig?.();
    });

    test('PRODUCTION re-selects the identical set on every sweep when persistence fails (#16780 AC-2)', async () => {
        // The numbers below are production's selection decisions, not this test's. That distinction is
        // the entire repair: the previous version handed `embedChunks` the full corpus itself, so it
        // would have produced [3, 3, 3] against a perfectly convergent implementation too.
        const corpus     = makeChunks(3),
              collection = createCollection({persists: false}),
              selected   = [];

        for (let sweep = 0; sweep < 3; sweep++) {
            selected.push((await runProductionSweep({collection, corpus})).selected);
        }

        expect(selected, 'production re-selected the SAME three chunks on every sweep — the loop')
            .toEqual([3, 3, 3]);
        expect(collection.landed.size, 'and nothing ever landed, so the corpus cannot bound the work')
            .toBe(0);
        expect(collection.upsertAttempts.length, 'three sweeps, three paid-for upsert attempts')
            .toBe(3);
    });

    test('the CONVERGING control: same boundary, writes land, production selects nothing (#16780 AC-2)', async () => {
        // The falsifier for the test above. It differs in exactly ONE respect — `persists: true` — and
        // every other line, including all selection, is identical and production-owned.
        const corpus     = makeChunks(3),
              collection = createCollection({persists: true}),
              selected   = [];

        for (let sweep = 0; sweep < 3; sweep++) {
            selected.push((await runProductionSweep({collection, corpus})).selected);
        }

        expect(selected, 'production selected the corpus once, then had nothing left to do')
            .toEqual([3, 0, 0]);
        expect(collection.landed.size, 'the corpus converged').toBe(3);
        expect(collection.upsertAttempts.length, 'exactly one upsert — no repetition to report').toBe(1);
    });

    test('the loop is VISIBLE at the shared ledger: ratio above 1, and exactly 1 when it converges (#16780 AC-2)', async () => {
        // The detection/report terminal. Both arms run the real `embedTexts`, so `VectorService` stamps
        // `source: 'knowledge-base'` into the shared identity ledger on every admitted batch.
        //
        // This is what makes the two arms above matter operationally. Selection behaviour alone is
        // invisible in production: a deployment sees provider load and cannot tell which arm it is in.
        // The ratio is the surface where "did the same work again" becomes expressible, and it has to
        // be a CROSS-PROCESS surface — the recorder and the reader are different OS processes.
        const corpus = makeChunks(3);

        const sinceTs = Date.now() - 1;

        const failing = createCollection({persists: false});
        for (let sweep = 0; sweep < 3; sweep++) {
            await runProductionSweep({collection: failing, corpus});
        }

        const loopWindow = getEmbeddingIdentityWindow(db, {sinceTs});

        expect(loopWindow.distinct, 'three distinct texts, however many sweeps ran').toBe(3);
        expect(loopWindow.submissions, 'but nine submissions — three sweeps of three').toBe(9);
        expect(loopWindow.ratio, 'a non-converging sweep reports repetition, which is the alarm')
            .toBeGreaterThan(1);

        // Same corpus, same code, persistence restored — on a FRESH ledger so the two arms cannot
        // contaminate each other's window.
        db.close();
        rmSync(path.join(tempDir, 'telemetry.sqlite'), {force: true});
        db = new Database(path.join(tempDir, 'telemetry.sqlite'));
        db.pragma('journal_mode = WAL');
        ensureEmbeddingIdentitySchema(db);
        KBRecorderService.db = db;

        const cleanSince = Date.now() - 1;
        const converging = createCollection({persists: true});

        for (let sweep = 0; sweep < 3; sweep++) {
            await runProductionSweep({collection: converging, corpus});
        }

        const cleanWindow = getEmbeddingIdentityWindow(db, {sinceTs: cleanSince});

        expect(cleanWindow.submissions, 'the converging sweep submitted each text exactly once').toBe(3);
        expect(cleanWindow.ratio, 'and holds the ratio at exactly 1 — a legitimately busy run is NOT flagged')
            .toBe(1);
    });

    test('the DEPLOYED sweep entry point re-selects across successive embed() calls (#16780 AC-2)', async () => {
        // The tests above drive the selection PRIMITIVES. This one drives `VectorService.embed()`, the
        // entry point a deployment actually runs — and that distinction is load-bearing, because
        // `embed()` carries its OWN inline selector rather than calling the shared helper. Binding only
        // the helper would leave the deployed path unverified: the same selection rule exists twice in
        // production, and a spec must say WHICH one it protects.
        //
        // Here `embed()` reads its own corpus off disk, reads existing ids off the collection, decides
        // what to embed, and writes. Nothing in this test selects anything.
        writeFixtureJsonl(corpusPath, 3);

        const submissionsPerSweep = [];
        let   sweepSubmissions    = 0;

        TextEmbeddingService.ollamaProvider = {
            async embed(input) {
                const texts = Array.isArray(input) ? input : [input];
                sweepSubmissions += texts.length;
                return {embeddings: texts.map(() => new Array(384).fill(0.1))}
            }
        };

        const runDeployedSweep = async collection => {
            sweepSubmissions = 0;
            KB_ChromaManager.getKnowledgeBaseCollection = async () => collection;
            KB_ChromaManager.invalidateKnowledgeBaseCollectionCache();

            await KB_VectorService.embed(corpusPath).then(() => null, () => null);
            submissionsPerSweep.push(sweepSubmissions);
        };

        const failing = createCollection({persists: false});

        await runDeployedSweep(failing);
        await runDeployedSweep(failing);

        expect(submissionsPerSweep, 'the deployed sweep paid the provider for the same corpus twice')
            .toEqual([3, 3]);
        expect(failing.landed.size, 'and stored nothing, so nothing bounds the next sweep either').toBe(0);

        // Same entry point, same corpus, persistence restored. `embed()` now sees its own writes and
        // selects nothing — the convergence its inline selector exists to produce.
        submissionsPerSweep.length = 0;

        const converging = createCollection({persists: true});

        await runDeployedSweep(converging);
        await runDeployedSweep(converging);

        expect(submissionsPerSweep, 'the second deployed sweep had nothing left to select')
            .toEqual([3, 0]);
        expect(converging.landed.size, 'because the first one actually landed').toBe(3);
    });
});
