import {setup} from '../../../../setup.mjs';

const appName = 'EmbeddingDimensionTest';

setup({
    neoConfig: {
        unitTestMode: true
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

test.describe('embeddingDimension — pure embedding-dimension helpers (GoldenPathSynthesizer SRP extraction)', () => {
    let getEmbeddingVectorLength;
    let getEmbeddingModelName;
    let buildEmbeddingDimensionMismatchMessage;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/embeddingDimension.mjs');
        getEmbeddingVectorLength               = mod.getEmbeddingVectorLength;
        getEmbeddingModelName                  = mod.getEmbeddingModelName;
        buildEmbeddingDimensionMismatchMessage = mod.buildEmbeddingDimensionMismatchMessage;
    });

    test('getEmbeddingVectorLength returns the integer length of a vector, null for non-vector payloads', () => {
        expect(getEmbeddingVectorLength([1, 2, 3])).toBe(3);
        expect(getEmbeddingVectorLength([])).toBe(0);
        expect(getEmbeddingVectorLength(null)).toBe(null);
        expect(getEmbeddingVectorLength(undefined)).toBe(null);
        expect(getEmbeddingVectorLength({})).toBe(null);
        expect(getEmbeddingVectorLength({length: 2.5})).toBe(null);
    });

    test('getEmbeddingModelName resolves the model per provider, null for unknown / missing config', () => {
        const config = {
            openAiCompatible: {embeddingModel: 'text-embedding-3-small'},
            ollama          : {embeddingModel: 'nomic-embed-text'},
            embeddingModel  : 'gemini-embedding-001'
        };

        expect(getEmbeddingModelName(config, 'openAiCompatible')).toBe('text-embedding-3-small');
        expect(getEmbeddingModelName(config, 'ollama')).toBe('nomic-embed-text');
        expect(getEmbeddingModelName(config, 'gemini')).toBe('gemini-embedding-001');
        expect(getEmbeddingModelName(config, 'unknownProvider')).toBe(null);

        // Missing provider sub-config falls back to null (the `|| null` guard), never throws.
        expect(getEmbeddingModelName({}, 'openAiCompatible')).toBe(null);
        expect(getEmbeddingModelName({}, 'ollama')).toBe(null);
        expect(getEmbeddingModelName({}, 'gemini')).toBe(null);
    });

    test('buildEmbeddingDimensionMismatchMessage names both dimensions + falls back for unset provider/model', () => {
        const msg = buildEmbeddingDimensionMismatchMessage({
            provider           : 'gemini',
            model              : 'gemini-embedding-001',
            configuredDimension: 768,
            actualDimension    : 1536
        });

        expect(msg).toContain('[GoldenPathSynthesizer]');
        expect(msg).toContain('provider=gemini');
        expect(msg).toContain('model=gemini-embedding-001');
        expect(msg).toContain('configuredVectorDimension=768');
        expect(msg).toContain('actualEmbeddingDimension=1536');

        const fallback = buildEmbeddingDimensionMismatchMessage({
            provider           : null,
            model              : null,
            configuredDimension: 768,
            actualDimension    : null
        });

        expect(fallback).toContain('provider=<unset>');
        expect(fallback).toContain('model=<unknown>');
        expect(fallback).toContain('actualEmbeddingDimension=null');
    });
});
