import { setup } from '../../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ChromaEmbeddingFunctionTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                       from '@playwright/test';
import Neo                                  from '../../../../../../../src/Neo.mjs';
import * as core                            from '../../../../../../../src/core/_export.mjs';
import {createDynamicTextEmbeddingFunction} from '../../../../../../../ai/services/shared/vector/chromaClientPrimitives.mjs';
import TextEmbeddingService                 from '../../../../../../../ai/services/memory-core/TextEmbeddingService.mjs';
import {runWithProviderActivityContext}     from '../../../../../../../ai/services/shared/providerActivityLedger.mjs';

test.describe('Neo.ai.services.shared.vector.chromaClientPrimitives — dynamic embedding function (#13692)', () => {
    test('generate() routes a batch through embedTexts (1h batch path), not per-text embedText (interactive 15s path)', async () => {
        // Regression guard: Chroma's generate(texts) used to be
        // `Promise.all(texts.map(t => embedText(t)))` — fanning every batch out as parallel
        // INTERACTIVE embeds. That applied the 15s contentionTimeoutMs to bulk work AND stormed
        // the single local embedder into self-contention. It must instead make ONE embedTexts
        // batch call (the path with the 1h timeout + sequential chunks).
        const calls     = {embedTexts: [], embedText: []},
              origTexts = TextEmbeddingService.embedTexts,
              origText  = TextEmbeddingService.embedText;

        TextEmbeddingService.embedTexts = async (texts, provider, options) => {
            calls.embedTexts.push({texts, provider, options});
            return texts.map((_, i) => [i]); // ordered number[][], Chroma's generate contract
        };
        TextEmbeddingService.embedText = async (text, provider) => {
            calls.embedText.push({text, provider});
            return [0];
        };

        try {
            const fn = createDynamicTextEmbeddingFunction({
                      providerResolver: () => 'openAiCompatible',
                      service         : 'memory-core'
                  }),
                  unknownResult = await fn.generate(['a']),
                  walResult     = await runWithProviderActivityContext({
                      operationStage: 'mc-wal-drain-embedding',
                      service       : 'memory-core'
                  }, () => fn.generate(['b', 'c']));

            expect(calls.embedText.length).toBe(0);              // never fan out to the interactive path
            expect(calls.embedTexts.length).toBe(2);             // exactly one batch call per generate
            expect(calls.embedTexts[0].texts).toEqual(['a']);
            expect(calls.embedTexts[0].provider).toBe('openAiCompatible');
            expect(calls.embedTexts[0].options).toEqual({
                operationLabel: 'Chroma dynamic text embedding',
                operationStage: 'unknown',
                service       : 'memory-core'
            });
            expect(calls.embedTexts[1].options).toEqual({
                operationLabel: 'Chroma dynamic text embedding',
                operationStage: 'mc-wal-drain-embedding',
                service       : 'memory-core'
            });
            expect(fn.getConfig()).toEqual({});
            expect(unknownResult).toEqual([[0]]);
            expect(walResult).toEqual([[0], [1]]);               // ordered embeddings flow back through
        } finally {
            TextEmbeddingService.embedTexts = origTexts;
            TextEmbeddingService.embedText  = origText;
        }
    });
});
