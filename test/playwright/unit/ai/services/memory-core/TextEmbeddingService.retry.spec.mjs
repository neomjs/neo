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

import {test, expect}             from '@playwright/test';
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import fs                         from 'fs';
import http                       from 'http';
import os                         from 'os';
import path                       from 'path';
import aiConfig                   from '../../../../../../ai/mcp/server/memory-core/config.template.mjs';
import {buildEmbeddingProbeBlock} from '../../../../../../ai/services/shared/embeddingProbe.mjs';
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
    let TextEmbeddingService, server;
    let requestCount   = 0;
    let serverBehavior = 'succeed';
    let lastRequest;
    let allRequests;
    let inFlightRequests;
    let maxInFlightRequests;
    let testPort;
    let originalEmbeddingModel, originalHost, originalRetryCount, originalRetryDelay;
    let originalContentionRetryCount, originalContentionRetryDelay, originalContentionTimeout;
    let originalBatchEmbeddingChunkSize, originalBatchEmbeddingTimeoutMs, originalBatchEmbeddingYieldMs;
    let originalLmsPort;
    let originalLoadedModelsProbe;

    let EMBEDDING_RESIDENCY_NEVER_RESIDENT;

    test.beforeAll(async () => {
        ({default: TextEmbeddingService, EMBEDDING_RESIDENCY_NEVER_RESIDENT} = await import(
            '../../../../../../ai/services/memory-core/TextEmbeddingService.mjs'
        ));

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
                } else if (serverBehavior === 'fail-then-change-model') {
                    if (requestCount === 1) {
                        aiConfig.openAiCompatible.embeddingModel = 'runtime-retry-model-b';
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
                } else if (serverBehavior === 'delayed-single-succeed') {
                    setTimeout(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ data: [{ embedding: [1.4, 1.5, 1.6] }] }));
                    }, 100);
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
                } else if (serverBehavior === 'resident-then-evicted') {
                    // The mid-sync eviction shape: chunk 1 embeds normally, then the model is gone.
                    // A preflight that ran before chunk 1 cannot see this.
                    if (requestCount === 1) {
                        const inputs = lastRequest.body.input;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({data: inputs.map((_, index) => ({index, embedding: [index]}))}));
                        return;
                    }
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'The requested resource could not be found.' }));
                } else if (serverBehavior === 'sparse-batch') {
                    // One vector short, and the one returned is NOT index 0.
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({data: [{index: 1, embedding: [22]}]}));
                } else if (serverBehavior === 'gapped-batch') {
                    // Right count, wrong density: indices 0 and 2 for two inputs.
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({data: [{index: 0, embedding: [10]}, {index: 2, embedding: [22]}]}));
                } else if (serverBehavior === 'chunked-batch-succeed') {
                    const inputs = lastRequest.body.input;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        data: inputs.map((_, index) => ({
                            index,
                            embedding: [requestCount, index]
                        })).reverse()
                    }));
                } else if (serverBehavior === 'chunk-succeeds-then-dies') {
                    // Chunk 1 embeds normally (dense, per-input indexed); every later request fails with
                    // a non-retryable provider error — the failure-carry producer shape.
                    if (requestCount === 1) {
                        const inputs = lastRequest.body.input;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({data: inputs.map((_, index) => ({index, embedding: [100 + index]}))}));
                        return;
                    }
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Some other bad request error' }));
                } else if (serverBehavior === 'sparse-chunk-then-dies') {
                    // Chunk 1 "succeeds" SPARSE (one vector for two inputs) — poisoning the accumulated
                    // prefix — then the next request fails. The carry must refuse to decorate.
                    if (requestCount === 1) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({data: [{index: 0, embedding: [100]}]}));
                        return;
                    }
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Some other bad request error' }));
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
                        setTimeout(respond, 100);
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
        originalEmbeddingModel = aiConfig.openAiCompatible.embeddingModel;
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
        aiConfig.openAiCompatible.embeddingModel = originalEmbeddingModel;
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

    /*
     * The incident, reproduced. A production plane served `Qwen3-Embedding-8B-Q4_K_M` while
     * configured for `qwen3-embedding-0.6b`, across two deploys, every container healthy — and the
     * only symptom was slow embeddings, read as a performance problem rather than a configuration
     * one. Proving it took reading two literals out of a container log by hand.
     *
     * Neo already had the check and the right words for it; it was gated behind an LM Studio port
     * comparison, so identity verification existed for the developer laptop and not for the
     * deployment. These arms pin the widened gate and, just as importantly, the two ways it must
     * NOT harden into a refusal.
     */
    test('REGRESSION: a served model that is not the configured one is named, on a non-LMS endpoint', async () => {
        const originalUnitTestMode = Neo.config.unitTestMode;

        try {
            Neo.config.unitTestMode = false;
            // Not the LMS lane: the host port is the test server, the LMS port is something else.
            aiConfig.orchestrator.lms.port                        = '1234';
            aiConfig.openAiCompatible.embeddingModel              = 'qwen3-embedding-0.6b';
            // What `/v1/models` actually answered on the incident plane.
            TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{id: 'Qwen3-Embedding-8B-Q4_K_M'}];

            let thrown;
            try { await TextEmbeddingService.embedText('hello', 'openAiCompatible') } catch (error) { thrown = error }

            expect(thrown, 'a wrong served model must not embed silently — this is the whole incident').toBeTruthy();
            // The served identifier must be NAMED. "not resident" without it sends an operator back
            // to the container logs, which is the manual step this check exists to replace.
            expect(thrown.message).toContain('Qwen3-Embedding-8B-Q4_K_M');
            expect(thrown.message).toContain('qwen3-embedding-0.6b');
            expect(thrown.residencyDisposition).toBe(EMBEDDING_RESIDENCY_NEVER_RESIDENT);
        } finally {
            Neo.config.unitTestMode = originalUnitTestMode;
        }
    });

    test('CONTROL: the matching model on the same non-LMS path embeds normally', async () => {
        // Without this the arm above could pass by refusing everything — an identity check that
        // never confirms is indistinguishable from one that always rejects, and would take the lane
        // down rather than observe it.
        serverBehavior = 'succeed';

        const originalUnitTestMode = Neo.config.unitTestMode;

        try {
            Neo.config.unitTestMode                                = false;
            aiConfig.orchestrator.lms.port                         = '1234';
            aiConfig.openAiCompatible.embeddingModel               = 'qwen3-embedding-0.6b';
            TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{id: 'qwen3-embedding-0.6b'}];

            expect(await TextEmbeddingService.embedText('hello', 'openAiCompatible')).toEqual([0.1, 0.2, 0.3]);
        } finally {
            Neo.config.unitTestMode = originalUnitTestMode;
        }
    });

    test('an UNREACHABLE model list degrades to unknown rather than refusing the embed', async () => {
        // AC-5's other half. `/v1/models` is conventional, not guaranteed, and a transient 503 must
        // not take embedding down — an identity check that cannot run is an unanswered question, not
        // a confirmed mismatch. The inverse failure (probe outage reads as identity-confirmed) is
        // covered by the arm above, which throws on a real disagreement.
        serverBehavior = 'succeed';

        const originalUnitTestMode = Neo.config.unitTestMode;

        try {
            Neo.config.unitTestMode                                = false;
            aiConfig.orchestrator.lms.port                         = '1234';
            aiConfig.openAiCompatible.embeddingModel               = 'qwen3-embedding-0.6b';
            TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => { throw new Error('connect ECONNREFUSED') };

            expect(await TextEmbeddingService.embedText('hello', 'openAiCompatible')).toEqual([0.1, 0.2, 0.3]);
        } finally {
            Neo.config.unitTestMode = originalUnitTestMode;
        }
    });

    test('first-call-succeeds-no-retry path', async () => {
        serverBehavior = 'succeed';
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');
        expect(result).toEqual([0.1, 0.2, 0.3]);
        expect(requestCount, `observed requests=${JSON.stringify(allRequests)}`).toBe(1);
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

    test('LM Studio context-policy insufficiency wins over an input that only exceeds the invalid resident (#13944)', async () => {
        serverBehavior = 'succeed';
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [{
            id           : aiConfig.openAiCompatible.embeddingModel,
            contextLength: 8192
        }];

        const providerTruncatedInput = 'x'.repeat(12746 * 3);

        await expect(TextEmbeddingService.embedText(providerTruncatedInput, 'openAiCompatible'))
            .rejects.toMatchObject({
                code   : 'EMBEDDING_CONTEXT_INSUFFICIENT',
                message: expect.stringMatching(/loaded=8192, configured>=32768, safeProcessingLimitTokens=28672, inputEstimate=12746/)
            });

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

    test('model-not-resident preflight mints a source-owned cause code before the provider request (#16658)', async () => {
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => [];

        const error = await TextEmbeddingService.embedText('hello', 'openAiCompatible')
            .then(() => null, observed => observed);

        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe('EMBEDDING_MODEL_NOT_RESIDENT');
        expect(error.message).toContain('is not resident under its configured identifier');
        expect(requestCount, 'the resident-model preflight fails before transport').toBe(0);
    });

    test('openAiCompatible verifies identity provider-shaped on non-LMS endpoints, and still skips the LM Studio context probe (#13944)', async () => {
        serverBehavior = 'succeed';

        const originalUnitTestMode = Neo.config.unitTestMode;

        try {
            Neo.config.unitTestMode = false;
            aiConfig.orchestrator.lms.port = '1234';
            TextEmbeddingService.openAiCompatibleLoadedModelsProbe = null;

            allRequests.length = 0;

            const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible');

            expect(result).toEqual([0.1, 0.2, 0.3]);

            // Asserted as SHAPE rather than as a count. The original arm proved "no LM Studio probe"
            // with `requestCount === 1`, which never actually established it — `lms ps` is a CLI, so
            // it would not have shown up in an HTTP count either way. Identity verification is now
            // provider-shaped, so a second request exists BY DESIGN and a bare count would have to be
            // loosened to a number that asserts nothing.
            const urls = allRequests.map(entry => entry.url);

            expect(urls.filter(url => url.includes('/v1/models')), 'the provider-shaped identity probe must run').toHaveLength(1);
            expect(urls.filter(url => url.includes('/embeddings')), 'exactly one embedding request').toHaveLength(1);
            expect(lastRequest.body.input).toBe('hello');

            // The mock answers `/v1/models` with embedding rows carrying no `id`, so the parsed list
            // is EMPTY — the "endpoint does not really enumerate" case. That must degrade to unknown
            // and let the embed proceed, never harden into a confident not-resident refusal.
            expect(result, 'an unenumerable endpoint must not block embedding').toEqual([0.1, 0.2, 0.3]);
        } finally {
            Neo.config.unitTestMode = originalUnitTestMode;
        }
    });

    test('first-call-fails-second-call-succeeds path with mock client', async () => {
        serverBehavior = 'fail-then-succeed';
        const activities = [];
        const recorder   = {
            beginProviderActivity(entry) { activities.push({type: 'begin', id: 'retry-1', entry}); return 'retry-1' },
            startProviderActivity(id, startedAt) { activities.push({type: 'start', id, startedAt}) },
            refineProviderActivity(id, dispatchActivity) {
                activities.push({type: 'refine', id, dispatchActivity});
            },
            completeProviderActivity(id, outcome) { activities.push({type: 'complete', id, outcome}) }
        };
        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible', {
            operationStage          : 'kb-query-embedding',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        expect(result).toEqual([0.4, 0.5, 0.6]);
        expect(requestCount).toBe(2);
        expect(activities.map(item => item.type)).toEqual(['begin', 'start', 'refine', 'complete']);
        expect(activities[0].entry).toMatchObject({
            operationStage  : 'kb-query-embedding',
            priority        : 'interactive',
            provider        : 'openAiCompatible',
            queueDisposition: 'neo-queued',
            role            : 'embedding',
            service         : 'knowledge-base'
        });
        expect(activities[2].dispatchActivity).toEqual({model: lastRequest.body.model});
        expect(activities[3]).toMatchObject({id: 'retry-1', outcome: {success: true}});
    });

    test('exhausted-retry-final-failure path', async () => {
        serverBehavior = 'fail-all';
        aiConfig.openAiCompatible.unloadRetryCount = 2; // N=2

        const error = await TextEmbeddingService.embedText('hello', 'openAiCompatible')
            .then(() => null, observed => observed);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/Model was unloaded/);
        expect(error.code).toBe('EMBEDDING_MODEL_NOT_RESIDENT');

        // Initial request + 2 retries = 3 total requests
        expect(requestCount).toBe(3);
    });

    test('preserves per-attempt model routing and degrades a cross-model retry row to unknown', async () => {
        serverBehavior = 'fail-then-change-model';
        const refinements = [];
        const recorder    = {
            beginProviderActivity() { return 'model-retry-activity' },
            startProviderActivity() {},
            refineProviderActivity(id, activity) { refinements.push({id, activity}) },
            completeProviderActivity() {}
        };

        const result = await TextEmbeddingService.embedText('hello', 'openAiCompatible', {
            operationStage          : 'kb-query-embedding',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        expect(result).toEqual([0.4, 0.5, 0.6]);
        expect(allRequests.map(item => item.body.model)).toEqual([
            originalEmbeddingModel,
            'runtime-retry-model-b'
        ]);
        expect(refinements).toEqual([
            {id: 'model-retry-activity', activity: {model: originalEmbeddingModel}},
            {id: 'model-retry-activity', activity: {model: 'unknown'}}
        ]);
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

        const error = await TextEmbeddingService.embedText('hello', 'openAiCompatible')
            .then(() => null, observed => observed);

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/HTTP 404/);
        expect(error.code).toBe('EMBEDDING_MODEL_NOT_RESIDENT');

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

    test('a caller-owned probe deadline outlives the shorter contention ladder with one dispatch (#17111)', async () => {
        serverBehavior = 'delayed-single-succeed';
        aiConfig.openAiCompatible.contentionTimeoutMs       = 20;
        aiConfig.openAiCompatible.contentionRetryCount      = 2;
        aiConfig.openAiCompatible.contentionRetryDelayMs    = 10;

        const startedAt = Date.now();
        const result    = await buildEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText     : TextEmbeddingService.embedText.bind(TextEmbeddingService),
            input         : 'deadline-owned-probe',
            operationLabel: 'Deadline-owned embedding probe',
            timeoutMs     : 200
        });

        expect(result).toMatchObject({
            status    : 'healthy',
            provider  : 'openAiCompatible',
            dimensions: 3
        });
        expect(Date.now() - startedAt, 'the request remained alive beyond the old 80ms aggregate ladder')
            .toBeGreaterThanOrEqual(85);
        expect(requestCount, 'the caller deadline must not be converted into repeated provider aborts').toBe(1);
    });

    test('a caller deadline expires in the queue without dispatching behind active provider work (#17111)', async () => {
        serverBehavior = 'delayed-single-succeed';
        aiConfig.openAiCompatible.contentionTimeoutMs    = 250;
        aiConfig.openAiCompatible.contentionRetryCount   = 0;

        const laneHolder = TextEmbeddingService.embedText('active-provider-work', 'openAiCompatible');

        await waitForCondition(() => requestCount === 1, 'the first request to hold the provider lane');

        const result = await buildEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText     : TextEmbeddingService.embedText.bind(TextEmbeddingService),
            input         : 'queued-deadline-probe',
            operationLabel: 'Queued deadline embedding probe',
            timeoutMs     : 40
        });

        expect(result).toMatchObject({
            status             : 'failed',
            errorClassification: 'consumer-probe-timeout',
            errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
        });
        expect(requestCount, 'the queued probe must make zero provider calls').toBe(1);

        await expect(laneHolder).resolves.toEqual([1.4, 1.5, 1.6]);
        await new Promise(resolve => setTimeout(resolve, 25));

        expect(requestCount, 'releasing the lane must not dispatch the already-aborted probe').toBe(1);
    });

    test('a caller deadline shorter than one contention attempt aborts once with no post-abort retry (#17111)', async () => {
        serverBehavior = 'timeout-all';
        aiConfig.openAiCompatible.contentionTimeoutMs    = 100;
        aiConfig.openAiCompatible.contentionRetryCount   = 2;
        aiConfig.openAiCompatible.contentionRetryDelayMs = 25;

        const result = await buildEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText     : TextEmbeddingService.embedText.bind(TextEmbeddingService),
            input         : 'deadline-aborted-probe',
            operationLabel: 'Deadline-aborted embedding probe',
            timeoutMs     : 40
        });

        expect(result).toMatchObject({
            status             : 'failed',
            errorClassification: 'consumer-probe-timeout',
            errorCode          : 'EMBEDDING_PROBE_TIMEOUT'
        });
        expect(requestCount).toBe(1);

        await new Promise(resolve => setTimeout(resolve, 75));
        expect(requestCount, 'no retry may dispatch after the caller aborted the aggregate operation').toBe(1);
    });

    test('a deadline-bearing probe preserves an immediate terminal provider failure', async () => {
        serverBehavior = 'fail-other';

        const result = await buildEmbeddingProbeBlock({
            cfg: {
                embeddingProvider: 'openAiCompatible',
                vectorDimension  : 3
            },
            embedText     : TextEmbeddingService.embedText.bind(TextEmbeddingService),
            input         : 'terminal-failure-probe',
            operationLabel: 'Terminal failure embedding probe',
            timeoutMs     : 200
        });

        expect(result).toMatchObject({
            status             : 'failed',
            errorClassification: 'provider-failure',
            errorCode          : 'EMBEDDING_PROVIDER_ERROR'
        });
        expect(requestCount).toBe(1);
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

    test('a final queue timeout notifies the caller circuit before the queued repository dispatches', async () => {
        serverBehavior = 'timeout-all';
        // Wide enough that repo B finishes its async input prep and genuinely ENTERS the queue
        // before A's timeout fires. At 25ms B never enqueued, so `requestCount === 1` was true for
        // a reason unrelated to the circuit.
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = 400;

        const
            controller   = new AbortController(),
            circuitError = Object.assign(new Error('tenant sweep provider circuit is open'), {
                code: 'KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN'
            }),
            hookCalls         = [],
            onProviderTimeout = error => {
                hookCalls.push(error);
                controller.abort(circuitError)
            };

        // B must be GENUINELY QUEUED BEHIND A, not merely started second. An earlier draft launched
        // both together and asserted `requestCount === 1`; it passed with the notification deleted
        // AND with it delayed by a macrotask, because B was aborted before it ever reached the queue.
        // The assertion was true for a reason that had nothing to do with this fix. So: dispatch A,
        // wait until it actually holds the lane, and only then enqueue B.
        const repoA = TextEmbeddingService.embedTexts(['repo-a'], 'openAiCompatible', {
            onProviderTimeout,
            signal: controller.signal
        }).then(() => null, error => error);

        await waitForCondition(() => requestCount === 1, 'repo A to hold the provider lane');

        // Both callers are BATCH priority, so the interactive-overtake allowance in the selector
        // cannot reorder them: with no interactive task queued, the selection after A's rejection
        // is B. That is what makes `requestCount` a truthful statement about B.
        const repoB = TextEmbeddingService.embedTexts(['repo-b'], 'openAiCompatible', {
            onProviderTimeout,
            signal: controller.signal
        }).then(() => null, error => error);

        await new Promise(resolve => setTimeout(resolve, 50));

        const [errorA, errorB] = await Promise.all([repoA, repoB]);

        expect(errorA?.message, 'the dispatched repository keeps its own provider timeout')
            .toMatch(/openAiCompatible request timed out after 400ms/);

        expect(hookCalls, 'the final timeout notifies the caller circuit exactly once').toHaveLength(1);
        expect(hookCalls[0], 'the hook receives the source provider error, not a fabricated one').toBe(errorA);

        // The whole point of the ticket: B was queued behind A and must never reach the provider that
        // just proved broken. `timeout-all` never responds, so a dispatched B would have hung rather
        // than failed fast — a second request here is the defect, not a flake.
        expect(requestCount, 'repo B must make zero provider calls in this sweep').toBe(1);

        expect(errorB, 'the queued repository fails, rather than silently succeeding').toBeTruthy();
        expect(errorB, 'and it does not inherit A\'s timeout identity').not.toBe(errorA);
    });

    test('the queued repository stays protected even when the circuit-open is DEFERRED', async () => {
        // Scope note, because an earlier version of this comment claimed the opposite and was wrong.
        //
        // At THIS level the queue's own abort-listener removal wins the race in every deferral I
        // could construct (microtask and macrotask hook deferral, and delaying the drain's own
        // notification), so B never dispatches and this fixture CANNOT exercise the ordering
        // guarantee. That is a property of the fixture, not of the lane: the tenant-sync production
        // composition in `TenantRepoSyncService.spec.mjs` DOES exercise it, and deleting the drain's
        // notification there turns it red with B making a real provider call. Read that one for the
        // ordering proof; read this one for the narrower fact below.
        serverBehavior = 'timeout-all';
        aiConfig.openAiCompatible.batchEmbeddingTimeoutMs = 400;

        const
            controller   = new AbortController(),
            circuitError = Object.assign(new Error('tenant sweep provider circuit is open'), {
                code: 'KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN'
            }),
            hookCalls         = [],
            onProviderTimeout = error => {
                hookCalls.push(error);
                setTimeout(() => controller.abort(circuitError), 0)
            };

        const repoA = TextEmbeddingService.embedTexts(['repo-a'], 'openAiCompatible', {
            onProviderTimeout,
            signal: controller.signal
        }).then(() => null, error => error);

        await waitForCondition(() => requestCount === 1, 'repo A to hold the provider lane');

        const repoB = TextEmbeddingService.embedTexts(['repo-b'], 'openAiCompatible', {
            onProviderTimeout,
            signal: controller.signal
        }).then(() => null, error => error);

        await new Promise(resolve => setTimeout(resolve, 50));
        await Promise.all([repoA, repoB]);

        expect(hookCalls.length, 'the deferred hook still received the timeout').toBeGreaterThanOrEqual(1);
        expect(requestCount, 'queue-level abort removal alone keeps B at zero calls here').toBe(1);
    });

    test('a mid-batch provider failure carries the completed prefix on the ORIGINAL error (#17112)', async () => {
        serverBehavior = 'chunk-succeeds-then-dies';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;
        aiConfig.openAiCompatible.unloadRetryCount        = 0; // a non-retryable failure needs no ladder

        const outcome = await TextEmbeddingService.embedTexts(['t0', 't1', 't2', 't3'], 'openAiCompatible')
            .then(() => null, error => error);

        // The original identity survives — the caller's timeout/circuit classification reads it.
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toContain('Some other bad request error');

        // The carry contract: derived from what was SENT (1 completed chunk × width 2), vectors in
        // input order. Discarding these is what re-purchased completed provider work on every retry.
        expect(outcome.completedChunkCount).toBe(1);
        expect(outcome.totalChunkCount).toBe(2);
        expect(outcome.completedTextCount).toBe(2);
        expect(outcome.embeddings).toEqual([[100], [101]]);

        // The producer span: the failed REQUEST held texts [2, 4) — the consumer's undeliverable
        // attribution needs the member set, because blaming the batch head for a multi-input
        // request failure is how an innocent neighbour inherits a monster's strikes.
        expect(outcome.failedTextOffset).toBe(2);
        expect(outcome.failedTextCount).toBe(2);
    });

    test('a prefix that cannot prove positional binding leaves the failure UNCARRIED (#17112)', async () => {
        serverBehavior = 'sparse-chunk-then-dies';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;
        aiConfig.openAiCompatible.unloadRetryCount        = 0;

        const outcome = await TextEmbeddingService.embedTexts(['t0', 't1', 't2', 't3'], 'openAiCompatible')
            .then(() => null, error => error);

        // The sparse chunk-1 response (one vector for two inputs) means the accumulated data cannot
        // satisfy the positional-binding guard. Decorating anyway would hand the consumer a payload
        // it will slice onto wrong ids; the failure must travel with the original identity and
        // NO carry fields.
        expect(outcome).toBeInstanceOf(Error);
        expect(outcome.message).toContain('Some other bad request error');
        expect(outcome.completedTextCount).toBeUndefined();
        expect(outcome.embeddings).toBeUndefined();

        // The producer span survives even when the carry cannot: it binds nothing (pure indices into
        // what was sent), so an unprovable prefix must not strip the failed request's identity.
        expect(outcome.failedTextOffset).toBe(2);
        expect(outcome.failedTextCount).toBe(2);
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

    test('the lease yield predicate is consulted BETWEEN provider chunks, not only between the caller\'s batches (#16822)', async () => {
        serverBehavior = 'chunked-batch-succeed';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;

        const consultations = [];
        const error         = await TextEmbeddingService
            .embedTexts(['a', 'b', 'c', 'd', 'e'], 'openAiCompatible', {
                shouldYield: () => {
                    consultations.push(requestCount);
                    return true
                }
            })
            .then(() => null, observed => observed);

        // Without the inner consultation this call issues all three chunks and resolves; the interval between
        // two consultations would then be the caller's whole batch, which at stock leaves is 16h40m against a
        // 30-minute fairness bound.
        expect(error, 'a yielded batch must reject, never resolve with a partial array').toBeInstanceOf(Error);
        expect(error.code).toBe('EMBEDDING_BATCH_YIELDED');
        expect(error.completedChunkCount).toBe(1);
        expect(error.totalChunkCount).toBe(3);
        expect(error.message).toContain('1/3 provider chunk(s)');

        // One consultation, and it happened AFTER chunk 1 landed — so the second and third were never issued.
        expect(consultations, 'consulted once, with exactly one chunk already posted').toEqual([1]);
        expect(requestCount, 'chunks 2 and 3 must not reach the provider').toBe(1);
        expect(allRequests.map(item => item.body.input)).toEqual([['a', 'b']]);
    });

    test('the lease yield predicate is never consulted before the first provider chunk — forward progress (#16822)', async () => {
        serverBehavior = 'chunked-batch-succeed';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 5;

        let   consulted = 0;
        const result    = await TextEmbeddingService.embedTexts(['a', 'b'], 'openAiCompatible', {
            shouldYield: () => {
                consulted++;
                return true
            }
        });

        // A single-chunk batch under an always-true predicate must still land. An acquisition that yields
        // before doing any work is a livelock, not fairness — the same guarantee `embedChunks` makes at its
        // own boundary, and the reason the check is guarded on `completedChunkCount > 0`.
        expect(consulted, 'no consultation can precede the first chunk').toBe(0);
        expect(requestCount).toBe(1);
        expect(result).toEqual([[1, 0], [1, 1]]);
    });

    test('a predicate that never fires leaves batch chunking completely unchanged — negative control (#16822)', async () => {
        serverBehavior = 'chunked-batch-succeed';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;

        let   consulted = 0;
        const result    = await TextEmbeddingService.embedTexts(['a', 'b', 'c', 'd', 'e'], 'openAiCompatible', {
            shouldYield: () => {
                consulted++;
                return false
            }
        });

        // Byte-identical to the sibling test above that passes no predicate at all. A yield-point that alters
        // legitimate work is worse than none, because it will be switched off within a week.
        expect(consulted, 'consulted at each of the two inter-chunk boundaries').toBe(2);
        expect(requestCount).toBe(3);
        expect(allRequests.map(item => item.body.input)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
        expect(result).toEqual([[1, 0], [1, 1], [2, 0], [2, 1], [3, 0]]);
    });

    test('the residency preflight is a POINT CHECK licensing N requests — eviction after it is invisible (#16852)', async () => {
        serverBehavior = 'resident-then-evicted';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 1;
        aiConfig.openAiCompatible.unloadRetryCount        = 1;

        let probeCount = 0;

        // The provider reports the model resident. It is true when asked, and the preflight is
        // therefore correct — which is the whole point: correctness at t0 is not an invariant over
        // the batch that follows.
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => {
            probeCount++;
            return [{
                id           : aiConfig.openAiCompatible.embeddingModel,
                contextLength: aiConfig.localModels.embedding.contextLimitTokens
            }];
        };

        const error = await TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'openAiCompatible')
            .then(() => null, observed => observed);

        // ONE preflight for a batch that issues one request per chunk. The window between the check
        // and the last chunk is the entire batch duration — on the observed plane, long enough for a
        // chat-model load to evict the embedder mid-sweep. This is the mid-sync 404 the ticket
        // title: not a cold start, a residency change under a green check.
        expect(probeCount, 'residency is checked once per embedTexts call, not per provider request').toBe(1);

        expect(error).toBeInstanceOf(Error);

        // The load-bearing distinction. "Never resident" is a configuration fault — wrong identifier,
        // wrong host, model never loaded — and retrying cannot fix it. "Evicted mid-batch" means the
        // configuration was RIGHT and something took the slot, which is a capacity question. Both used
        // to mint EMBEDDING_MODEL_NOT_RESIDENT, so an operator was sent to re-check a config that was
        // already correct.
        expect(error.code, 'the code keeps its spelling — two downstream readers own it').toBe('EMBEDDING_MODEL_NOT_RESIDENT');
        expect(error.residencyDisposition, 'residency was observed at preflight, so this is an eviction').toBe('evicted-mid-batch');

        // Chunk 1 embedded against a resident model; chunk 2 found it gone and burned its bounded
        // unload retries against a provider that will not reload it. The batch then throws, and from
        // there the sweep-level stranding takes over — a different defect, one layer up.
        expect(requestCount, 'chunk 1 succeeded, chunk 2 + its retry both 404').toBe(3);
    });

    test('a model that was NEVER resident keeps the configuration-fault code (#16852, #16859)', async () => {
        serverBehavior = 'fail-all-404';

        let probeCount = 0;

        // Preflight finds nothing loaded, so the operation never observes residency. This is the
        // control that keeps the new code narrow: without it, reclassifying on 404 would relabel every
        // configuration fault as an eviction and destroy the distinction it exists to create.
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = async () => {
            probeCount++;
            return []
        };

        const error = await TextEmbeddingService.embedTexts(['a'], 'openAiCompatible')
            .then(() => null, observed => observed);

        expect(probeCount, 'the observed-negative arm performs exactly one residency preflight').toBe(1);
        expect(error.code).toBe('EMBEDDING_MODEL_NOT_RESIDENT');
        expect(error.residencyDisposition, 'never observed resident ⇒ configuration fault, not capacity').toBe('never-resident');
    });

    test('a preflight that never RAN leaves the disposition absent — unknown is not never (#16852)', async () => {
        // The third state, and the one a boolean erased. An openAiCompatible endpoint that is not
        // LM Studio skips the residency preflight entirely, so nothing is ever observed. Reporting
        // that as `never-resident` would mint a positive configuration-fault claim out of a check
        // that did not run — sending an operator to re-check an identifier nobody ever tested.
        //
        // The probe must be nulled EXPLICITLY: `beforeEach` installs a default that reports the model
        // loaded, so omitting this would silently test the resident path instead. Written the lazy way
        // first, and it returned `evicted-mid-batch` — the absent condition has to be established, not
        // assumed, or the test quietly measures the opposite of its name.
        TextEmbeddingService.openAiCompatibleLoadedModelsProbe = null;
        serverBehavior                                         = 'fail-all-404';

        const error = await TextEmbeddingService.embedTexts(['a'], 'openAiCompatible')
            .then(() => null, observed => observed);

        expect(error, 'the batch still fails loudly — only the CLASSIFICATION is withheld').toBeTruthy();
        expect(error.residencyDisposition,
            'an absence of observation is not an observation of absence').toBeUndefined();
    });

    test('a SPARSE provider response is refused rather than silently re-based to position 0 (#16826)', async () => {
        serverBehavior = 'sparse-batch';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 5;

        // @neo-gpt's falsifier: `[{index: 1, ...}]` sorts to position 0, so the caller binds input 1's
        // vector to input 0's id. Same array length downstream, no error — a permanently wrong row.
        await expect(TextEmbeddingService.embedTexts(['a', 'b'], 'openAiCompatible'))
            .rejects.toThrow(/returned 1 vector\(s\) for 2 input\(s\); refusing to bind vectors to inputs by position/);
    });

    test('a GAPPED provider response of the right length is refused too — count alone is not density (#16826)', async () => {
        serverBehavior = 'gapped-batch';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 5;

        // The case a length check cannot see: two vectors for two inputs, but indexed 0 and 2. Position 1
        // would silently receive input 2's vector. Density is a separate property from count.
        await expect(TextEmbeddingService.embedTexts(['a', 'b'], 'openAiCompatible'))
            .rejects.toThrow(/not densely indexed: position 1 carries provider index 2/);
    });

    test('an OUT-OF-ORDER dense response is accepted and re-ordered — the control (#16826)', async () => {
        serverBehavior = 'chunked-batch-succeed'; // returns each chunk's entries reversed
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 2;

        // Density is the requirement, not arrival order. A guard that rejected reordering would break the
        // provider's documented behaviour, so this control shares the property under test and must stay green.
        const result = await TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'openAiCompatible');

        expect(result).toEqual([[1, 0], [1, 1], [2, 0]]);
    });

    test('a non-function shouldYield fails loud rather than silently never yielding (#16822)', async () => {
        serverBehavior = 'chunked-batch-succeed';

        // The option surface is an explicit allow-list with typed validation; a predicate that is quietly
        // ignored reads on every surface as a lane that honours the fairness bound and does not.
        await expect(TextEmbeddingService.embedTexts(['a'], 'openAiCompatible', {shouldYield: true}))
            .rejects.toThrow('TextEmbeddingService: options.shouldYield must be a function');

        expect(requestCount).toBe(0);
    });

    test('interactive single embeddings queue ahead of subsequent batch chunks and preserve completion', async () => {
        serverBehavior = 'qos-priority';
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 1;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = 0;

        const activityById = new Map();
        const starts       = [];
        const refinements  = [];
        let   activityId   = 0;
        const recorder     = {
            beginProviderActivity(entry) {
                const id = `activity-${++activityId}`;
                activityById.set(id, entry);
                return id;
            },
            startProviderActivity(id) {
                starts.push(activityById.get(id).operationStage);
            },
            refineProviderActivity(id, dispatchActivity) {
                refinements.push({
                    model         : dispatchActivity.model,
                    operationStage: activityById.get(id).operationStage
                });
            },
            completeProviderActivity() {}
        };

        const batchPromise = TextEmbeddingService.embedTexts(['a', 'b', 'c'], 'openAiCompatible', {
            operationStage          : 'kb-tenant-ingestion-embedding',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        await waitForCondition(() => allRequests.length === 1, 'first batch chunk request');

        const interactivePromise = TextEmbeddingService.embedText('urgent', 'openAiCompatible', {
            operationStage          : 'kb-query-embedding',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        await waitForCondition(() => {
            return [...activityById.values()].some(entry => entry.operationStage === 'kb-query-embedding');
        }, 'interactive embedding queue admission');

        const runtimeModel = 'runtime-embedding-model-b';

        expect(starts).toHaveLength(1);
        aiConfig.openAiCompatible.embeddingModel = runtimeModel;

        const [batchResult, interactiveResult] = await Promise.all([batchPromise, interactivePromise]);

        expect(maxInFlightRequests).toBe(1);
        expect(allRequests.map(item => item.body.input)).toEqual([
            ['a'],
            'urgent',
            ['b'],
            ['c']
        ]);
        expect(starts).toEqual([
            'kb-tenant-ingestion-embedding',
            'kb-query-embedding',
            'kb-tenant-ingestion-embedding',
            'kb-tenant-ingestion-embedding'
        ]);
        expect(refinements).toEqual([
            {model: originalEmbeddingModel, operationStage: 'kb-tenant-ingestion-embedding'},
            {model: runtimeModel, operationStage: 'kb-query-embedding'},
            {model: runtimeModel, operationStage: 'kb-tenant-ingestion-embedding'},
            {model: runtimeModel, operationStage: 'kb-tenant-ingestion-embedding'}
        ]);
        expect(allRequests.map(item => item.body.model)).toEqual([
            originalEmbeddingModel,
            runtimeModel,
            runtimeModel,
            runtimeModel
        ]);
        expect(activityById.size).toBe(4);
        expect(interactiveResult).toEqual([2, 0]);
        expect(batchResult).toEqual([
            [1, 0],
            [3, 0],
            [4, 0]
        ]);
    });

    test('a waiting batch is admitted after one overtake with an interactive backlog (#17062)', async () => {
        serverBehavior = 'qos-priority';

        const enqueuedStages = [];
        let   activityId     = 0;
        const recorder       = {
            beginProviderActivity(entry) {
                enqueuedStages.push(entry.operationStage);
                return `activity-${++activityId}`;
            },
            startProviderActivity() {},
            refineProviderActivity() {},
            completeProviderActivity() {}
        };
        const blockerPromise = TextEmbeddingService.embedTexts(['a'], 'openAiCompatible', {
            operationStage          : 'blocker-batch',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        await waitForCondition(() => allRequests.length === 1, 'active blocker request');

        const waitingBatchPromise = TextEmbeddingService.embedTexts(['waiting-batch'], 'openAiCompatible', {
            operationStage          : 'waiting-batch',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        await waitForCondition(() => enqueuedStages.includes('waiting-batch'), 'waiting batch queue admission');

        const firstInteractivePromise = TextEmbeddingService.embedText('interactive-1', 'openAiCompatible', {
            operationStage          : 'interactive-1',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });
        const secondInteractivePromise = TextEmbeddingService.embedText('interactive-2', 'openAiCompatible', {
            operationStage          : 'interactive-2',
            providerActivityRecorder: recorder,
            service                 : 'knowledge-base'
        });

        await Promise.all([
            blockerPromise,
            waitingBatchPromise,
            firstInteractivePromise,
            secondInteractivePromise
        ]);

        expect(maxInFlightRequests).toBe(1);
        expect(allRequests.map(item => item.body.input)).toEqual([
            ['a'],
            'interactive-1',
            ['waiting-batch'],
            'interactive-2'
        ]);
    });
});
