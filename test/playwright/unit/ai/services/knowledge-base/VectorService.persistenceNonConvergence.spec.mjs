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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Persistence failure is an UNBOUNDED re-embed loop, and it must be visible as one.
 *
 * `embedChunks` computes an embedding and then upserts inside the same `try`. A persistence failure
 * therefore discards work the provider has already been paid for, marks the batch failed, and the
 * next sweep re-selects exactly the same chunks — they are not in the collection — and pays for them
 * again. Every sweep costs full provider time and stores nothing.
 *
 * **The loop is not the finding; its invisibility is.** From provider load alone this is
 * indistinguishable from an ingestion making progress: continuous inference, a corpus that is not
 * growing, and every per-sweep receipt reporting a handled failure. That is the shape a deployment
 * can sit in for months.
 *
 * These specs prove the loop exists (so the repair target is real) and that it is now DETECTABLE —
 * repeated content drives the re-embed ratio above 1 while distinct content holds it at 1, which is
 * the discriminator between "does not converge" and "legitimately busy".
 */
test.describe.configure({mode: 'serial'});

function createFailingCollection({failUpsert}) {
    const upsertAttempts = [];

    return {
        upsertAttempts,
        name: 'spy-knowledge-base',
        async upsert({ids}) {
            upsertAttempts.push([...ids]);

            if (failUpsert()) {
                throw new Error('collection unavailable: persistence rejected the write');
            }
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

test.describe('VectorService — persistence failure is an unbounded re-embed loop', () => {
    let KB_VectorService, KB_Config, TextEmbeddingService;
    let originalEmbedTexts, originalBatchConfig;

    test.beforeAll(async () => {
        const SDK = await import('../../../../../../ai/services.mjs');

        KB_Config            = SDK.KB_Config;
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;
        KB_VectorService     = (await import('../../../../../../ai/services/knowledge-base/VectorService.mjs')).default;

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
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
    });

    test('a persistence failure re-embeds the IDENTICAL set on every sweep (#16780 AC-2)', async () => {
        // The loop, made explicit. Three sweeps, persistence failing throughout, and the corpus never
        // grows — so each sweep re-selects the same ids and pays the provider again for vectors it
        // will discard. Asserted on what was SUBMITTED, because the cost is the submission.
        const corpus      = makeChunks(3),
              collection  = createFailingCollection({failUpsert: () => true}),
              submissions = [];

        TextEmbeddingService.embedTexts = async texts => {
            submissions.push([...texts]);
            return texts.map(() => new Array(384).fill(0))
        };

        for (let sweep = 0; sweep < 3; sweep++) {
            await KB_VectorService.embedChunks({collection, chunksToProcess: corpus})
                .then(() => null, () => null);
        }

        expect(submissions.length, 'every sweep re-submitted rather than converging')
            .toBeGreaterThanOrEqual(3);

        const distinctSubmitted = new Set(submissions.flat());

        expect(distinctSubmitted.size, 'three distinct texts, however many sweeps ran').toBe(3);
        expect(submissions.flat().length, 'but far more submissions than distinct inputs — the loop')
            .toBeGreaterThan(distinctSubmitted.size);
    });

    test('a CONVERGING sweep does not re-submit — the control (#16780 AC-2)', async () => {
        // Without this the test above proves only that embedChunks embeds things. The discriminator
        // is that a sweep whose writes PERSIST submits each text exactly once and the next sweep has
        // nothing to do. "Re-submitted" only means something against a case that does not.
        const corpus     = makeChunks(3),
              landed     = new Set(),
              collection = {
                  name: 'spy-knowledge-base',
                  async upsert({ids}) { ids.forEach(id => landed.add(id)) }
              };

        const submissions = [];

        TextEmbeddingService.embedTexts = async texts => {
            submissions.push([...texts]);
            return texts.map(() => new Array(384).fill(0))
        };

        for (let sweep = 0; sweep < 3; sweep++) {
            const remaining = corpus.filter(chunk => !landed.has(chunk.id));

            if (remaining.length === 0) break;

            await KB_VectorService.embedChunks({collection, chunksToProcess: remaining});
        }

        expect(landed.size, 'the corpus converged').toBe(3);
        expect(submissions.flat().length, 'each text submitted exactly once — no repetition to report').toBe(3);
    });
});
