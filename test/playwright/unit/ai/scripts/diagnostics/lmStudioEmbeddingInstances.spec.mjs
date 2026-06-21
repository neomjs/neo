import {test, expect} from '@playwright/test';

/**
 * @summary Unit coverage for the LM Studio embedding-instance diagnostic.
 *
 * Verifies the recurrence guard can distinguish a clean single loaded embedding worker
 * from LM Studio duplicate instance suffixes without mutating the local model server.
 *
 * @see ai/scripts/diagnostics/lmStudioEmbeddingInstances.mjs
 */
test.describe('lmStudioEmbeddingInstances diagnostic (#13539)', () => {
    let parseArgs;
    let analyzeEmbeddingInstances;
    let formatReport;
    let getCanonicalModelId;
    let normalizeModelsPayload;
    let runDiagnostic;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/diagnostics/lmStudioEmbeddingInstances.mjs');

        parseArgs                 = mod.parseArgs;
        analyzeEmbeddingInstances = mod.analyzeEmbeddingInstances;
        formatReport              = mod.formatReport;
        getCanonicalModelId       = mod.getCanonicalModelId;
        normalizeModelsPayload    = mod.normalizeModelsPayload;
        runDiagnostic             = mod.runDiagnostic;
    });

    test('parseArgs uses environment defaults and CLI overrides', () => {
        const fromEnv = parseArgs([], {
            NEO_LM_STUDIO_MODELS_URL           : 'http://lm-studio:1234/api/v0/models',
            NEO_LM_STUDIO_EMBEDDING_PREFIX     : 'text-embedding-qwen3',
            NEO_LM_STUDIO_MAX_LOADED_EMBEDDINGS: '2',
            NEO_LM_STUDIO_MODELS_TIMEOUT_MS    : '9000'
        });

        expect(fromEnv).toMatchObject({
            url            : 'http://lm-studio:1234/api/v0/models',
            embeddingPrefix: 'text-embedding-qwen3',
            maxLoaded      : 2,
            timeoutMs      : 9000,
            json           : false
        });

        const fromCli = parseArgs([
            '--url', 'http://127.0.0.1:1234/api/v0/models',
            '--embedding-prefix', 'text-embedding-',
            '--max-loaded', '1',
            '--timeout-ms', '4000',
            '--json'
        ], {});

        expect(fromCli).toMatchObject({
            url            : 'http://127.0.0.1:1234/api/v0/models',
            embeddingPrefix: 'text-embedding-',
            maxLoaded      : 1,
            timeoutMs      : 4000,
            json           : true
        });
    });

    test('rejects invalid numeric flags', () => {
        expect(() => parseArgs(['--max-loaded', '1.5'])).toThrow('--max-loaded requires a non-negative integer');
        expect(() => parseArgs(['--timeout-ms', '-1'])).toThrow('--timeout-ms requires a non-negative integer');
        expect(() => parseArgs([], {NEO_LM_STUDIO_MAX_LOADED_EMBEDDINGS: 'NaN'})).toThrow('NEO_LM_STUDIO_MAX_LOADED_EMBEDDINGS requires a non-negative integer');
    });

    test('normalizes LM Studio response shapes and canonicalizes instance suffixes', () => {
        const payload = {data: [{id: 'text-embedding-qwen3-embedding-8b:3', state: 'loaded'}]};

        expect(normalizeModelsPayload(payload)).toEqual(payload.data);
        expect(getCanonicalModelId('text-embedding-qwen3-embedding-8b:3')).toBe('text-embedding-qwen3-embedding-8b');
        expect(getCanonicalModelId('text-embedding-qwen3-embedding-8b')).toBe('text-embedding-qwen3-embedding-8b');
    });

    test('passes when exactly one matching embedding worker is loaded', () => {
        const analysis = analyzeEmbeddingInstances({
            data: [
                {id: 'gemma-4-31b-it', type: 'vlm', state: 'loaded'},
                {id: 'text-embedding-qwen3-embedding-8b', type: 'embeddings', state: 'loaded'},
                {id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings', state: 'not-loaded'}
            ]
        });

        expect(analysis.ok).toBe(true);
        expect(analysis.loadedCount).toBe(1);
        expect(analysis.duplicateGroups).toEqual([]);
        expect(analysis.reasons).toEqual([]);
        expect(formatReport(analysis)).toContain('OK');
    });

    test('fails on duplicate LM Studio instance suffixes for the same embedding model', () => {
        const analysis = analyzeEmbeddingInstances({
            data: [
                {id: 'text-embedding-qwen3-embedding-8b', type: 'embeddings', state: 'loaded'},
                {id: 'text-embedding-qwen3-embedding-8b:2', type: 'embeddings', state: 'loaded'},
                {id: 'text-embedding-qwen3-embedding-8b:3', type: 'embeddings', state: 'loaded'},
                {id: 'text-embedding-qwen3-embedding-8b:4', type: 'embeddings', state: 'loaded'}
            ]
        });

        expect(analysis.ok).toBe(false);
        expect(analysis.loadedCount).toBe(4);
        expect(analysis.duplicateGroups).toEqual([{
            canonicalId: 'text-embedding-qwen3-embedding-8b',
            ids        : [
                'text-embedding-qwen3-embedding-8b',
                'text-embedding-qwen3-embedding-8b:2',
                'text-embedding-qwen3-embedding-8b:3',
                'text-embedding-qwen3-embedding-8b:4'
            ],
            count: 4
        }]);
        expect(analysis.reasons).toEqual(['loaded-count-exceeded', 'duplicate-instance-suffixes']);
        expect(formatReport(analysis)).toContain('FAIL');
    });

    test('fails when distinct loaded embedding workers exceed the configured max', () => {
        const analysis = analyzeEmbeddingInstances({
            data: [
                {id: 'text-embedding-qwen3-embedding-8b', type: 'embeddings', state: 'loaded'},
                {id: 'text-embedding-nomic-embed-text-v1.5', type: 'embeddings', state: 'loaded'}
            ]
        }, {maxLoaded: 1});

        expect(analysis.ok).toBe(false);
        expect(analysis.duplicateGroups).toEqual([]);
        expect(analysis.reasons).toEqual(['loaded-count-exceeded']);
    });

    test('runDiagnostic fetches models through an injectable fetch implementation', async () => {
        const calls = [];
        const analysis = await runDiagnostic({
            url      : 'http://example.test/api/v0/models',
            timeoutMs: 1000,
            fetchImpl: async (url, options) => {
                calls.push({url, hasSignal: Boolean(options.signal)});

                return {
                    ok  : true,
                    json: async () => ({data: [{id: 'text-embedding-qwen3-embedding-8b', type: 'embeddings', state: 'loaded'}]})
                };
            }
        });

        expect(calls).toEqual([{url: 'http://example.test/api/v0/models', hasSignal: true}]);
        expect(analysis.ok).toBe(true);
    });
});
