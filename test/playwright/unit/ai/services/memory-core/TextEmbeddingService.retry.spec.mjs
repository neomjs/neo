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

test.describe.serial('TextEmbeddingService #11393/#11402 — openAiCompatible retry and lms server start support', () => {
    let SDK, TextEmbeddingService, server;
    let requestCount = 0;
    let serverBehavior = 'succeed';
    let lastRequest;
    let testPort;
    let originalHost, originalRetryCount, originalRetryDelay;

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
        originalHost = aiConfig.openAiCompatible.host;
        originalRetryCount = aiConfig.openAiCompatible.unloadRetryCount;
        originalRetryDelay = aiConfig.openAiCompatible.unloadRetryDelayMs;

        aiConfig.openAiCompatible.host = `http://127.0.0.1:${testPort}`;
        aiConfig.openAiCompatible.unloadRetryCount = 3;
        aiConfig.openAiCompatible.unloadRetryDelayMs = 10; // fast for tests
    });

    test.afterEach(() => {
        aiConfig.openAiCompatible.host = originalHost;
        aiConfig.openAiCompatible.unloadRetryCount = originalRetryCount;
        aiConfig.openAiCompatible.unloadRetryDelayMs = originalRetryDelay;
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
});
