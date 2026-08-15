import {test, expect} from '@playwright/test';
import {
    IMPLEMENTED_EMBEDDING_PROVIDERS,
    parseEmbeddingProviderEnv,
    resolveEmbeddingProviderModel
} from '../../../../ai/embeddingProviders.mjs';

// Pure module — no Neo runtime, no config singleton; the aiConfig tree is a plain stub. Mirrors
// planeConfig.spec.mjs (same config-legible module class).

test.describe('ai/embeddingProviders — the shared provider vocabulary', () => {
    test('the implemented set is exact, alphabetical, and frozen', () => {
        expect([...IMPLEMENTED_EMBEDDING_PROVIDERS]).toEqual(['gemini', 'openAiCompatible', 'ollama']);
        expect(Object.isFrozen(IMPLEMENTED_EMBEDDING_PROVIDERS)).toBe(true);
    });

    test('parseEmbeddingProviderEnv: unset is no opinion, a valid name passes through', () => {
        expect(parseEmbeddingProviderEnv('NEO_EMBEDDING_PROVIDER', {env: {}})).toBeUndefined();
        expect(parseEmbeddingProviderEnv('NEO_EMBEDDING_PROVIDER', {env: {NEO_EMBEDDING_PROVIDER: ''}})).toBeUndefined();
        expect(parseEmbeddingProviderEnv('NEO_EMBEDDING_PROVIDER', {env: {NEO_EMBEDDING_PROVIDER: 'gemini'}})).toBe('gemini');
    });

    test('parseEmbeddingProviderEnv: an unknown name throws a named diagnostic at config resolution', () => {
        // The defect this closes: `openaicompatible` (a typo) used to parse clean and silently
        // disabled the oversize-input guard on trees that keyed the guard on recognition.
        expect(() => parseEmbeddingProviderEnv('NEO_EMBEDDING_PROVIDER', {env: {NEO_EMBEDDING_PROVIDER: 'openaicompatible'}}))
            .toThrow(/NEO_EMBEDDING_PROVIDER="openaicompatible" is not an implemented embedding provider — expected one of: gemini, openAiCompatible, ollama/);
    });

    test('resolveEmbeddingProviderModel: every implemented provider resolves its own model leaf', () => {
        const aiConfig = {
            embeddingModel  : 'gemini-embedding-001',
            ollama          : {embeddingModel: 'qwen3-embedding'},
            openAiCompatible: {embeddingModel: 'text-embedding-qwen3-embedding-8b'}
        };

        expect(resolveEmbeddingProviderModel({embeddingProvider: 'ollama', aiConfig})).toBe('qwen3-embedding');
        expect(resolveEmbeddingProviderModel({embeddingProvider: 'openAiCompatible', aiConfig})).toBe('text-embedding-qwen3-embedding-8b');
        // The branch both hand-rolled resolvers lacked: gemini's model lives at the top-level leaf.
        expect(resolveEmbeddingProviderModel({embeddingProvider: 'gemini', aiConfig})).toBe('gemini-embedding-001');
        // An unrecognized provider keeps its own name as the diagnostic label.
        expect(resolveEmbeddingProviderModel({embeddingProvider: 'not-a-provider', aiConfig})).toBe('not-a-provider');
    });
});
