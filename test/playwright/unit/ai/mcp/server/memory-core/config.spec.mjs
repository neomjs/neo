import {setup} from '../../../../../setup.mjs';

const appName = 'MemoryCoreConfigProviderTest';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';

/**
 * @summary Coverage for #10804 embedding-provider config consolidation.
 *
 * The runtime config object is a Neo singleton, so these tests pin the standalone pure resolver
 * rather than importing the singleton. This covers the legacy
 * `NEO_CHROMA_EMBEDDING_PROVIDER` fallback/deprecation contract while keeping embedding
 * callsites on the unified `embeddingProvider` selector.
 *
 * @see Neo.ai.mcp.server.memory-core.Config#resolveEmbeddingProvider
 */
test.describe('Memory Core config #10804 — resolveEmbeddingProvider', () => {
    let resolveEmbeddingProvider, normalizeEmbeddingProviderConfig;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../../ai/mcp/server/memory-core/helpers/EmbeddingProviderConfig.mjs');
        resolveEmbeddingProvider = mod.resolveEmbeddingProvider;
        normalizeEmbeddingProviderConfig = mod.normalizeEmbeddingProviderConfig;
    });

    test('defaults to gemini when no provider selector is configured', () => {
        const warnings = [];

        expect(resolveEmbeddingProvider({
            env : {},
            warn: message => warnings.push(message)
        })).toBe('gemini');
        expect(warnings).toEqual([]);
    });

    test('unified env selector wins over conflicting legacy Chroma selector', () => {
        const warnings = [];

        expect(resolveEmbeddingProvider({
            env : {
                NEO_EMBEDDING_PROVIDER       : 'openAiCompatible',
                NEO_CHROMA_EMBEDDING_PROVIDER: 'gemini'
            },
            warn: message => warnings.push(message)
        })).toBe('openAiCompatible');
        expect(warnings.join('\n')).toMatch(/deprecated and conflicts/);
    });

    test('legacy Chroma env selector still feeds the unified provider with deprecation warning', () => {
        const warnings = [];

        expect(resolveEmbeddingProvider({
            env : {
                NEO_CHROMA_EMBEDDING_PROVIDER: 'ollama'
            },
            warn: message => warnings.push(message)
        })).toBe('ollama');
        expect(warnings.join('\n')).toMatch(/deprecated/);
    });

    test('custom config normalization preserves explicit embeddingProvider over legacy config fields', () => {
        const config = {
            embeddingProvider      : 'openAiCompatible',
            chromaEmbeddingProvider: 'ollama',
            neoEmbeddingProvider   : 'gemini'
        };
        const warnings = [];

        expect(normalizeEmbeddingProviderConfig(config, {}, message => warnings.push(message))).toBe(config);
        expect(config.embeddingProvider).toBe('openAiCompatible');
        expect(warnings.join('\n')).toMatch(/chromaEmbeddingProvider is deprecated and conflicts/);
        expect(warnings.join('\n')).toMatch(/neoEmbeddingProvider is deprecated and conflicts/);
    });

    test('custom legacy Chroma config overrides the default when unified selector is absent', () => {
        const defaults = {
            embeddingProvider: 'gemini'
        };
        const customConfig = {
            chromaEmbeddingProvider: 'openAiCompatible'
        };
        const warnings = [];

        expect(normalizeEmbeddingProviderConfig(defaults, {}, message => warnings.push(message), customConfig)).toBe(defaults);
        expect(defaults.embeddingProvider).toBe('openAiCompatible');
        expect(warnings.join('\n')).toMatch(/deprecated/);
    });
});
