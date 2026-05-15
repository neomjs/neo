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

test.describe.serial('TextEmbeddingService #11393 — openAiCompatible retry on model unload', () => {
    let SDK, TextEmbeddingService, server;
    let requestCount = 0;
    let serverBehavior = 'succeed'; // 'succeed', 'fail-then-succeed', 'fail-all', 'fail-shape-b-then-succeed', 'fail-all-shape-b'
    let testPort;
    let originalHost, originalRetryCount, originalRetryDelay;

    test.beforeAll(async () => {
        SDK = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = SDK.Memory_TextEmbeddingService;

        // Start a mock HTTP server
        server = http.createServer((req, res) => {
            requestCount++;
            
            if (serverBehavior === 'succeed') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
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

        await new Promise(resolve => server.listen(0, resolve));
        testPort = server.address().port;
    });

    test.afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    test.beforeEach(() => {
        requestCount = 0;
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
