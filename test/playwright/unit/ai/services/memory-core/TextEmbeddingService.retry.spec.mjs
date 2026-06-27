import {setup} from '../../../../setup.mjs';

const appName = 'TextEmbeddingServiceRetryTest';

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
import fs             from 'fs';
import http           from 'http';
import os             from 'os';
import path           from 'path';
import aiConfig       from '../../../../../../ai/mcp/server/memory-core/config.mjs';
import {
    clearLmsEmbeddingInputSuffixCache,
    readGgufTokenizerMetadata,
    resolveLmsEmbeddingInputSuffix,
    withLmsEmbeddingInputSuffix
} from '../../../../../../ai/services/shared/vector/lmsEmbeddingInputSuffix.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
} from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';

async function waitForCondition(condition, message, timeoutMs = 250) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    throw new Error(`Timed out waiting for ${message}`);
}

function u32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value);
    return buffer;
}

function u64(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt(value));
    return buffer;
}

function ggufString(value) {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([u64(bytes.length), bytes]);
}

function ggufMetadataEntry(key, type, valueBuffer) {
    return Buffer.concat([ggufString(key), u32(type), valueBuffer]);
}

function ggufStringArray(values) {
    return Buffer.concat([
        u32(8),
        u64(values.length),
        ...values.map(value => ggufString(value))
    ]);
}

function buildMinimalGguf({tokens, eosTokenId, eotTokenId, addEosToken = true}) {
    const entries = [
        ggufMetadataEntry('tokenizer.ggml.tokens', 9, ggufStringArray(tokens)),
        ggufMetadataEntry('tokenizer.ggml.eos_token_id', 4, u32(eosTokenId)),
        ggufMetadataEntry('tokenizer.ggml.eot_token_id', 4, u32(eotTokenId)),
        ggufMetadataEntry('tokenizer.ggml.add_eos_token', 7, Buffer.from([addEosToken ? 1 : 0]))
    ];

    return Buffer.concat([
        Buffer.from('GGUF'),
        u32(3),
        u64(0),
        u64(entries.length),
        ...entries
    ]);
}

test.describe.serial('TextEmbeddingService #11393/#11402/#12487/#12509 — openAiCompatible retry, QoS, and lms server start support', () => {
    let SDK, TextEmbeddingService, server;
    let requestCount   = 0;
    let serverBehavior = 'succeed';
    let lastRequest;
    let allRequests;
    let inFlightRequests;
    let maxInFlightRequests;
    let testPort;
    let originalHost, originalRetryCount, originalRetryDelay;
    let originalContentionRetryCount, originalContentionRetryDelay, originalContentionTimeout;
    let originalBatchEmbeddingChunkSize, originalBatchEmbeddingTimeoutMs, originalBatchEmbeddingYieldMs;
    let originalLmsPort;
    let originalLoadedModelsProbe;

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        server = http.createServer((req, res) => {
            requestCount++;

            let body = '';

            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                lastRequest = {
                    method: req.method,
                    url   : req.url,
                    body  : body ? JSON.parse(body) : null
                };
                allRequests.push(lastRequest);

                if (serverBehavior === 'succeed') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
                } else if (serverBehavior === 'lms-server-start-succeed') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        data: [{index: 0, embedding: [1.1, 1.2, 1.3]}]
                    }));
                } else if (serverBehavior === 'lms-server-start-batch-succeed') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        data: [
                            {index: 1, embedding: [2.1, 2.2, 2.3]},
                            {index: 0, embedding: [1.1, 1.2, 1.3]}
                        ]
                    }));
                } else if (serverBehavior === 'fail-then-succeed') {
                    if (requestCount === 1) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Model was unloaded while the request was still in queue..' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ data: [{ embedding: [0.4, 0.5, 0.6] }] }));
                    }
                } else if (serverBehavior === 'fail-all') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Model was unloaded while the request was still in queue..' }));
                } else if (serverBehavior === 'fail-shape-b-then-succeed') {
                    if (requestCount === 1) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Failed to load model "text-embedding-qwen3-embedding-8b". Error: Operation canceled.' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ data: [{ embedding: [0.7, 0.8, 0.9] }] }));
                    }
                } else if (serverBehavior === 'fail-all-shape-b') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to load model "text-embedding-qwen3-embedding-8b". Error: Operation canceled.' }));
                } else if (serverBehavior === 'fail-404-then-succeed') {
                    if (requestCount === 1) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'The requested resource could not be found.' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ data: [{ embedding: [0.11, 0.22, 0.33] }] }));
                    }
                } else if (serverBehavior === 'fail-all-404') {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'The requested resource could not be found.' }));
                } else if (serverBehavior === 'fail-other') {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Some other bad request error' }));
                } else if (serverBehavior === 'timeout-then-succeed') {
                    if (requestCount === 1) {
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ data: [{ embedding: [1.4, 1.5, 1.6] }] }));
                } else if (serverBehavior === 'timeout-all') {
                    return;
                } else if (serverBehavior === 'http-timeout-then-succeed') {
                    if (requestCount === 1) {
                        res.writeHead(503, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Embedding server busy while prior batch is queued' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ data: [{ embedding: [1.7, 1.8, 1.9] }] }));
                } else if (serverBehavior === 'delayed-batch-succeed') {
                    setTimeout(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            data: [
                                {index: 0, embedding: [3.1, 3.2, 3.3]},
                                {index: 1, embedding: [4.1, 4.2, 4.3]}
                            ]
                        }));
                    }, 50);
                } else if (serverBehavior === 'chunked-batch-succeed') {
                    const inputs = lastRequest.body.input;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        data: inputs.map((_, index) => ({
                            index,
                            embedding: [requestCount, index]
                        })).reverse()
                    }));
                } else if (serverBehavior === 'qos-priority') {
                    inFlightRequests++;
                    maxInFlightRequests = Math.max(maxInFlightRequests, inFlightRequests);

                    const inputs       = lastRequest.body.input,
                          requestIndex = requestCount,
                          respond      = () => {
                              const data = Array.isArray(inputs) ?
                                  inputs.map((_, index) => ({
                                      index,
                                      embedding: [requestIndex, index]
                                  })) :
                                  [{index: 0, embedding: [requestIndex, 0]}];

                              res.writeHead(200, { 'Content-Type': 'application/json' });
                              res.end(JSON.stringify({data}));
                              inFlightRequests--;
                          };

                    if (Array.isArray(inputs) && inputs[0] === 'a') {
                        setTimeout(respond, 25);
                    } else {
                        respond();
                    }
                }
            });
        });

        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        testPort = server.address().port;
    });

    test.afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    test.beforeEach(() => {
        requestCount = 0;
        lastRequest  = null;
        allRequests  = [];
        inFlightRequests = 0;
        maxInFlightRequests = 0;
        originalHost = aiConfig.openAiCompatible.host;
        originalRetryCount = aiConfig.openAiCompatible.unloadRetryCount;
        originalRetryDelay = aiConfig.openAiCompatible.unloadRetryDelayMs;
        originalContentionRetryCount = aiConfig.openAiCompatible.contentionRetryCount;
        originalContentionRetryDelay = aiConfig.openAiCompatible.contentionRetryDelayMs;
        originalContentionTimeout = aiConfig.openAiCompatible.contentionTimeoutMs;
        originalBatchEmbeddingChunkSize = aiConfig.openAiCompatible.batchEmbeddingChunkSize;
        originalBatchEmbeddingTimeoutMs = aiConfig.openAiCompatible.batchEmbeddingTimeoutMs;
        originalBatchEmbeddingYieldMs = aiConfig.openAiCompatible.batchEmbeddingYieldMs;
        originalLmsPort = aiConfig.orchestrator.lms.port;
        originalLoadedModelsProbe = TextEmbeddingService.openAiCompatibleLoadedModelsProbe;

        aiConfig.openAiCompatible.host = `http://127.0.0.1:${testPort}`;
        aiConfig.openAiCompatible.unloadRetryCount = 3;
        aiConfig.openAiCompatible.unloadRetryDelayMs = 10; // fast for tests
        aiConfig.openAiCompatible.contentionRetryCount = 2;
        aiConfig.openAiCompatible.contentionRetryDelayMs = 10;
        aiConfig.openAiCompatible.contentionTimeoutMs = 25;
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 5;
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = 1000;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = 0;
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{
            id           : aiConfig.openAiCompatible.embeddingModel,
            contextLength: aiConfig.localModels.embedding.contextLimitTokens
        }];
    });

    test.afterEach(() => {
        aiConfig.openAiCompatible.host = originalHost;
        aiConfig.openAiCompatible.unloadRetryCount = originalRetryCount;
        aiConfig.openAiCompatible.unloadRetryDelayMs = originalRetryDelay;
        aiConfig.openAiCompatible.contentionRetryCount = originalContentionRetryCount;
        aiConfig.openAiCompatible.contentionRetryDelayMs = originalContentionRetryDelay;
        aiConfig.openAiCompatible.contentionTimeoutMs = originalContentionTimeout;
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = originalBatchEmbeddingChunkSize;
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = originalBatchEmbeddingTimeoutMs;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = originalBatchEmbeddingYieldMs;
        aiConfig.orchestrator.lms.port = originalLmsPort;
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = originalLoadedModelsProbe;
        clearAggregatedFrictions();
    });

    test('first-call-succeeds-no-retry path', async () => {
        serverBehavior = 'succeed';
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');
        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(requestCount).toBe(1);
    });

    test('lms server start-compatible single embedding uses the standard OpenAI-compatible endpoint', async () => {
        serverBehavior = 'lms-server-start-succeed';

        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');

        expect(result).toEqual([1.1, 1.2, 1.3]);
        expect(requestCount).toBe(1);
        expect(lastRequest).toMatchObject({
            method: 'POST',
            url   : '/v1/embeddings',
            body  : {
                model: aiConfig.openAiCompatible.embeddingModel,
                input: 'hello'
            }
        });
    });

    test('lms server start-compatible batch embeddings preserve TextEmbeddingService ordering', async () => {
        serverBehavior = 'lms-server-start-batch-succeed';

        const result = await TextEmbeddingService.embedTexts(['first', 'second'], 'openAiCompatible');

        expect(result).toEqual([
            [1.1, 1.2, 1.3],
            [2.1, 2.2, 2.3]
        ]);
        expect(requestCount).toBe(1);
        expect(lastRequest).toMatchObject({
            method: 'POST',
            url   : '/v1/embeddings',
            body  : {
                model: aiConfig.openAiCompatible.embeddingModel,
                input: ['first', 'second']
            }
        });
    });

    test('LMS suffix helper reads the GGUF EOS token instead of the chat EOT token (#14015)', async () => {
        clearLmsEmbeddingInputSuffixCache();

        const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-lms-gguf-suffix-')),
              ggufPath = path.join(tmpDir, 'minimal-qwen3-embedding.gguf');

        try {
            fs.writeFileSync(ggufPath, buildMinimalGguf({
                tokens    : ['<|pad|>', '<|endoftext|>', '<|im_end|>'],
                eosTokenId: 1,
                eotTokenId: 2
            }));

            const metadata = readGgufTokenizerMetadata(ggufPath),
                  row      = {id: 'embedding-model', format: 'gguf', path: ggufPath};

            expect(metadata).toMatchObject({
                addEosToken: true,
                eosTokenId : 1,
                eotTokenId : 2
            });
            expect(resolveLmsEmbeddingInputSuffix(row)).toBe('<|endoftext|>');
            expect(withLmsEmbeddingInputSuffix('hello<|im_end|>', row)).toBe('hello<|im_end|><|endoftext|>');
        } finally {
            fs.rmSync(tmpDir, {recursive: true, force: true});
            clearLmsEmbeddingInputSuffixCache();
        }
    });

    test('LMS GGUF embeddings append metadata-derived EOS suffix to request inputs (#14015)', async () => {
        serverBehavior = 'lms-server-start-succeed';
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{
            id           : aiConfig.openAiCompatible.embeddingModel,
            contextLength: aiConfig.localModels.embedding.contextLimitTokens,
            format       : 'gguf',
            architecture : 'qwen3',
            eosTokenText : '<|endoftext|>'
        }];

        const singleInput = 'last-token-is-semantic-content';

        await TextEmbeddingService.embedText(singleInput, 'openAiCompatible');

        expect(lastRequest.body.input).toBe(`${singleInput}<|endoftext|>`);
        expect(singleInput).toBe('last-token-is-semantic-content');

        serverBehavior = 'lms-server-start-batch-succeed';

        const batchInput = [
            'batch-first-without-provider-separator',
            'batch-second-with-provider-eos<|endoftext|>'
        ];

        await TextEmbeddingService.embedTexts(batchInput, 'openAiCompatible');

        expect(lastRequest.body.input).toEqual([
            'batch-first-without-provider-separator<|endoftext|>',
            'batch-second-with-provider-eos<|endoftext|>'
        ]);
        expect(batchInput).toEqual([
            'batch-first-without-provider-separator',
            'batch-second-with-provider-eos<|endoftext|>'
        ]);
    });

    test('openAiCompatible refuses single embeddings when LM Studio loaded context is below the configured embedding context (#13944)', async () => {
        serverBehavior = 'succeed';
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{
            id           : aiConfig.openAiCompatible.embeddingModel,
            contextLength: 8192
        }];

        const providerTruncatedInput = 'x'.repeat(12746 * 3);

        await expect(TextEmbeddingService.embedText(providerTruncatedInput, 'openAiCompatible'))
            .rejects.toThrow(/loaded=8192, configured>=32768, inputEstimate=12746/);

        expect(requestCount).toBe(0);
    });

    test('openAiCompatible refuses batch embeddings before any provider-truncated request is posted (#13944)', async () => {
        serverBehavior = 'chunked-batch-succeed';
        let probeCount = 0;
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => {
            probeCount++;
            return [{
                id           : aiConfig.openAiCompatible.embeddingModel,
                contextLength: 8192
            }];
        };

        const providerTruncatedInput = 'x'.repeat(12746 * 3);

        await expect(TextEmbeddingService.embedTexts(['short', providerTruncatedInput], 'openAiCompatible'))
            .rejects.toThrow(/LM Studio embedding context too small/);

        expect(probeCount).toBe(1);
        expect(requestCount).toBe(0);
    });

    test('openAiCompatible skips LM Studio context probe for non-LMS endpoints (#13944)', async () => {
        serverBehavior = 'succeed';

        const originalUnitTestMode = Neo.config.unitTestMode;

        try {
            Neo.config.unitTestMode = false;
            aiConfig.orchestrator.lms.port = '1234';
            TextEmbeddingService.openAiCompatibleLoadedModelsProbe = null;

            const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');

            expect(result).toEqual([0.1, 0.2, 0.3]);
            expect(requestCount).toBe(1);
            expect(lastRequest.body.input).toBe('hello');
        } finally {
            Neo.config.unitTestMode = originalUnitTestMode;
        }
    });

    test('first-call-fails-second-call-succeeds path with mock client', async () => {
        serverBehavior = 'fail-then-succeed';
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');
        expect(result).toEqual([0.4, 0.5, 0.6]);
        expect(requestCount).toBe(2);
    });

    test('exhausted-retry-final-failure path', async () => {
        serverBehavior = 'fail-all';
        aiConfig.openAiCompatible.unloadRetryCount = 2; // N=2

        await expect(TextEmbeddingService.embedText('hello', 'openAiCompatible'))
            .rejects.toThrow(/Model was unloaded/);

        // Initial request + 2 retries = 3 total requests
        expect(requestCount).toBe(3);
    });

    test('first-call-fails-shape-b-second-call-succeeds path with mock client', async () => {
        serverBehavior = 'fail-shape-b-then-succeed';
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');
        expect(result).toEqual([0.7, 0.8, 0.9]);
        expect(requestCount).toBe(2);
    });

    test('exhausted-retry-final-failure path with shape b', async () => {
        serverBehavior = 'fail-all-shape-b';
        aiConfig.openAiCompatible.unloadRetryCount = 2; // N=2

        await expect(TextEmbeddingService.embedText('hello', 'openAiCompatible'))
            .rejects.toThrow(/Failed to load model.*Operation canceled/);

        // Initial request + 2 retries = 3 total requests
        expect(requestCount).toBe(3);
    });

    test('propagates non-unload HTTP 400 errors immediately without retries', async () => {
        serverBehavior = 'fail-other';

        await expect(TextEmbeddingService.embedText('hello', 'openAiCompatible'))
            .rejects.toThrow(/Some other bad request error/);

        expect(requestCount).toBe(1); // No retries
    });

    test('HTTP 404 model-not-resident retries with wait and succeeds (Shape C, #14247)', async () => {
        serverBehavior = 'fail-404-then-succeed';
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');
        expect(result).toEqual([0.11, 0.22, 0.33]);
        expect(requestCount).toBe(2);
    });

    test('HTTP 404 fails loud after bounded retries — no infinite loop (Shape C, #14247)', async () => {
        serverBehavior = 'fail-all-404';
        aiConfig.openAiCompatible.unloadRetryCount = 2; // N=2

        await expect(TextEmbeddingService.embedText('hello', 'openAiCompatible'))
            .rejects.toThrow(/HTTP 404/);

        // Initial request + 2 bounded retries = 3 total requests (no infinite loop on a permanent 404)
        expect(requestCount).toBe(3);
    });

    test('contention-timeout single embedding retries and succeeds', async () => {
        serverBehavior = 'timeout-then-succeed';
        aiConfig.openAiCompatible.contentionRetryCount = 1;

        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');

        expect(result).toEqual([1.4, 1.5, 1.6]);
        expect(requestCount).toBe(2);
    });

    test('contention-timeout single embedding fails after bounded retries', async () => {
        serverBehavior = 'timeout-all';
        aiConfig.openAiCompatible.contentionRetryCount = 1;

        await expect(TextEmbeddingService.embedText('hello', 'openAiCompatible'))
            .rejects.toThrow(/openAiCompatible request timed out/);

        // Initial request + 1 contention retry = 2 total requests
        expect(requestCount).toBe(2);
    });

    test('HTTP contention status single embedding retries and succeeds', async () => {
        serverBehavior = 'http-timeout-then-succeed';
        aiConfig.openAiCompatible.contentionRetryCount = 1;

        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');

        expect(result).toEqual([1.7, 1.8, 1.9]);
        expect(requestCount).toBe(2);
    });

    test('batch embeddings use the batch timeout instead of the interactive contention timeout', async () => {
        serverBehavior = 'delayed-batch-succeed';
        aiConfig.openAiCompatible.contentionTimeoutMs = 1;
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = 100;

        const result = await TextEmbeddingService.embedTexts(['first', 'second'], 'openAiCompatible');

        expect(result).toEqual([
            [3.1, 3.2, 3.3],
            [4.1, 4.2, 4.3]
        ]);
        expect(requestCount).toBe(1);
    });

    test('batch embeddings time out through the batch timeout and surface ConsumerFriction (#14036)', async () => {
        serverBehavior = 'timeout-all';
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = 25;
        clearAggregatedFrictions();

        for (let i = 0; i < 3; i++) {
            await expect(TextEmbeddingService.embedTexts([`stuck batch ${i}`], 'openAiCompatible'))
                .rejects.toThrow(/openAiCompatible request timed out after 25ms/);
        }

        expect(requestCount).toBe(3);
        expect(getAggregatedFrictions()).toEqual([
            expect.objectContaining({
                assetRef      : `openAiCompatible:${aiConfig.openAiCompatible.embeddingModel}`,
                consumer      : 'TextEmbeddingService.openAiCompatible',
                model         : aiConfig.openAiCompatible.embeddingModel,
                symptom       : 'timeout',
                emissionPoint : 'post-invocation-failure',
                suggestionKind: 'unknown',
                serviceDomain : 'memory-core',
                count         : 3
            })
        ]);
    });

    test('batch embeddings split large requests into yieldable chunks and preserve global ordering', async () => {
        serverBehavior = 'chunked-batch-succeed';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = 0;

        const result = await TextEmbeddingService.embedTexts(['a', 'b', 'c', 'd', 'e'], 'openAiCompatible');

        expect(requestCount).toBe(3);
        expect(allRequests.map(item => item.body.input)).toEqual([
            ['a', 'b'],
            ['c', 'd'],
            ['e']
        ]);
        expect(result).toEqual([
            [1, 0],
            [1, 1],
            [2, 0],
            [2, 1],
            [3, 0]
        ]);
    });

    test('interactive single embeddings queue ahead of subsequent batch chunks and preserve completion', async () => {
        serverBehavior = 'qos-priority';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 1;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = 0;

        const batchPromise = TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'openAiCompatible');

        await waitForCondition(() => allRequests.length === 1, 'first batch chunk request');

        const interactivePromise               = TextEmbeddingService.embedText('urgent', 'openAiCompatible');
        const [batchResult, interactiveResult] = await Promise.all([batchPromise, interactivePromise]);

        expect(maxInFlightRequests).toBe(1);
        expect(allRequests.map(item => item.body.input)).toEqual([
            ['a'],
            'urgent',
            ['b'],
            ['c']
        ]);
        expect(interactiveResult).toEqual([2, 0]);
        expect(batchResult).toEqual([
            [1, 0],
            [3, 0],
            [4, 0]
        ]);
    });
});
