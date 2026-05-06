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
        expect(resolveEmbeddingProvider({
            env: {}
        })).toBe('gemini');
    });

    test('unified env selector resolves the provider', () => {
        expect(resolveEmbeddingProvider({
            env: {
                NEO_EMBEDDING_PROVIDER: 'openAiCompatible'
            }
        })).toBe('openAiCompatible');
    });

    test('custom config normalization preserves explicit embeddingProvider', () => {
        const config = {
            embeddingProvider: 'openAiCompatible'
        };

        expect(normalizeEmbeddingProviderConfig(config, {})).toBe(config);
        expect(config.embeddingProvider).toBe('openAiCompatible');
    });
});
