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

test.describe('Neo.ai.services.shared.vector.chromaClientPrimitives — dynamic embedding function (#13692)', () => {
    test('generate() routes a batch through embedTexts (1h batch path), not per-text embedText (interactive 15s path)', async () => {
        // Regression guard: Chroma's generate(texts) used to be
        // `Promise.all(texts.map(t => embedText(t)))` — fanning every batch out as parallel
        // INTERACTIVE embeds. That applied the 15s contentionTimeoutMs to bulk work AND stormed
        // the single local embedder into self-contention. It must instead make ONE embedTexts
        // batch call (the path with the 1h timeout + sequential chunks).
        const calls    = {embedTexts: [], embedText: []},
              origTexts = TextEmbeddingService.embedTexts,
              origText  = TextEmbeddingService.embedText;

        TextEmbeddingService.embedTexts = async (texts, provider) => {
            calls.embedTexts.push({texts, provider});
            return texts.map((_, i) => [i]); // ordered number[][], Chroma's generate contract
        };
        TextEmbeddingService.embedText = async (text, provider) => {
            calls.embedText.push({text, provider});
            return [0];
        };

        try {
            const fn     = createDynamicTextEmbeddingFunction({providerResolver: () => 'openAiCompatible'}),
                  result = await fn.generate(['a', 'b', 'c']);

            expect(calls.embedText.length).toBe(0);              // never fan out to the interactive path
            expect(calls.embedTexts.length).toBe(1);             // exactly one batch call
            expect(calls.embedTexts[0].texts).toEqual(['a', 'b', 'c']);
            expect(calls.embedTexts[0].provider).toBe('openAiCompatible');
            expect(result).toEqual([[0], [1], [2]]);             // ordered embeddings flow back through
        } finally {
            TextEmbeddingService.embedTexts = origTexts;
            TextEmbeddingService.embedText  = origText;
        }
    });
});
