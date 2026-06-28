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

test.describe('VectorService.embedChunks — cooperative lease yield-point', () => {
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

        // Deterministic stub embedder — 384-dim zero vectors; the yield logic is provider-agnostic.
        TextEmbeddingService.embedTexts = async texts => texts.map(() => new Array(384).fill(0));
    });

    test.afterAll(() => {
        TextEmbeddingService.embedTexts = originalEmbedTexts;
        Object.assign(KB_Config.data, originalBatchConfig);
    });

    test.beforeEach(() => {
        Object.assign(KB_Config.data, {batchSize: 50, batchDelay: 0, maxRetries: 1});
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
        expect(spy.calls.upsert).toBe(2);
    });

    test('default (no predicate) embeds every batch — unchanged behavior, never yields', async () => {
        const spy    = createSpyCollection();
        const chunks = makeChunks(150);

        const result = await KB_VectorService.embedChunks({collection: spy, chunksToProcess: chunks});

        expect(result.yielded).toBe(false);
        expect(result.embedded).toBe(150);
        expect(spy.calls.upsert).toBe(3);
    });
});
