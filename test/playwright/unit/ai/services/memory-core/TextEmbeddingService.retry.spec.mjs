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
import http           from 'http';
import aiConfig       from '../../../../../../ai/mcp/server/memory-core/config.mjs';

async function waitForCondition(condition, message, timeoutMs = 250) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }

    throw new Error(`Timed out waiting for ${message}`);
}

test.describe.serial('TextEmbeddingService #11393/#11402/#12487/#12509 — openAiCompatible retry, QoS, and lms server start support', () => {
    let SDK, TextEmbeddingService, server;
    let requestCount = 0;
    let serverBehavior = 'succeed';
    let lastRequest;
    let allRequests;
    let inFlightRequests;
    let maxInFlightRequests;
    let testPort;
    let originalHost, originalRetryCount, originalRetryDelay;
    let originalContentionRetryCount, originalContentionRetryDelay, originalContentionTimeout;
    let originalBatchEmbeddingChunkSize, originalBatchEmbeddingYieldMs;

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
        originalBatchEmbeddingYieldMs = aiConfig.openAiCompatible.batchEmbeddingYieldMs;

        aiConfig.openAiCompatible.host = `http://127.0.0.1:${testPort}`;
        aiConfig.openAiCompatible.unloadRetryCount = 3;
        aiConfig.openAiCompatible.unloadRetryDelayMs = 10; // fast for tests
        aiConfig.openAiCompatible.contentionRetryCount = 2;
        aiConfig.openAiCompatible.contentionRetryDelayMs = 10;
        aiConfig.openAiCompatible.contentionTimeoutMs = 25;
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = 5;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = 0;
    });

    test.afterEach(() => {
        aiConfig.openAiCompatible.host = originalHost;
        aiConfig.openAiCompatible.unloadRetryCount = originalRetryCount;
        aiConfig.openAiCompatible.unloadRetryDelayMs = originalRetryDelay;
        aiConfig.openAiCompatible.contentionRetryCount = originalContentionRetryCount;
        aiConfig.openAiCompatible.contentionRetryDelayMs = originalContentionRetryDelay;
        aiConfig.openAiCompatible.contentionTimeoutMs = originalContentionTimeout;
        aiConfig.openAiCompatible.batchEmbeddingChunkSize = originalBatchEmbeddingChunkSize;
        aiConfig.openAiCompatible.batchEmbeddingYieldMs = originalBatchEmbeddingYieldMs;
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

    test('batch embeddings preserve the long batch timeout instead of using the interactive contention timeout', async () => {
        serverBehavior = 'delayed-batch-succeed';
        aiConfig.openAiCompatible.contentionTimeoutMs = 1;

        const result = await TextEmbeddingService.embedTexts(['first', 'second'], 'openAiCompatible');

        expect(result).toEqual([
            [3.1, 3.2, 3.3],
            [4.1, 4.2, 4.3]
        ]);
        expect(requestCount).toBe(1);
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

        const interactivePromise = TextEmbeddingService.embedText('urgent', 'openAiCompatible');
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
