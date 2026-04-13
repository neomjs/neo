import {setup} from '../../../../../../setup.mjs';

const appName = 'QueryReRankerTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../../../.env'), quiet: true});

test.describe('StorageRouter Query Re-Ranker Defensive Handling', () => {
    let SDK, TextEmbeddingService, testSessionId;
    const testPid = process.pid;
    const testTs  = Date.now();

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        // Isolate collections to prevent pollution
        aiConfig.collections.memory  = `test-reranker-mem-${testPid}-${testTs}`;
        aiConfig.collections.session = `test-reranker-sum-${testPid}-${testTs}`;

        SDK                  = await import('../../../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        // Force offline mode — mock embeddings with deterministic 4096D vectors
        SDK.Memory_Config.data.chromaEmbeddingProvider = 'openAiCompatible';
        SDK.Memory_Config.data.neoEmbeddingProvider    = 'openAiCompatible';
        SDK.Memory_Config.data.autoSummarize           = false;

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());

        // Boot lifecycle
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }

        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();

        testSessionId = crypto.randomUUID();

        // Seed 3 memories into the isolated collection
        const turns = [
            {prompt: 'What is Neo.mjs?',    thought: 'Framework analysis.',   response: 'A multi-worker UI framework.'},
            {prompt: 'How does VDOM work?',  thought: 'Rendering pipeline.',   response: 'Delta-based virtual DOM.'},
            {prompt: 'What are workers?',    thought: 'Thread architecture.',  response: 'Dedicated threads for App/Data/VDom.'}
        ];

        for (const turn of turns) {
            await SDK.Memory_Service.addMemory({
                ...turn,
                sessionId: testSessionId,
                agent    : 'test-agent',
                model    : 'test-model'
            });
        }
    });

    test.afterAll(async () => {
        try {
            if (SDK.Memory_ChromaManager?.client) {
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.memory});
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.session});
            }
        } catch (e) {
            console.warn(`[Cleanup] Failed to delete test collections:`, e.message);
        }

        if (SDK?.Memory_LifecycleService) {
            SDK.Memory_LifecycleService._initPromise = null;
        }
    });

    test('StorageRouter re-ranker should NOT crash when ChromaDB returns empty/malformed query results', async () => {
        // The bug: StorageRouter.injectQueryReRanker patches collection.query()
        // and accesses searchResult.ids[0] without optional chaining.
        // If ChromaDB returns {ids: [], distances: [], metadatas: []} (empty) or
        // a malformed result, this crashes with "Cannot read properties of undefined (reading '0')".

        const StorageRouter = (await import('../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs')).default;
        await StorageRouter.ready();

        // Get a re-ranked collection proxy
        const collection = await StorageRouter.getMemoryCollection();

        // Test 1: Query with a filter that matches no documents
        // This forces ChromaDB to return empty arrays, which triggers the re-ranker crash
        const result = await collection.query({
            queryTexts: ['nonexistent query that should match nothing relevant'],
            nResults  : 5,
            where     : {sessionId: 'completely-nonexistent-session-id-' + Date.now()}
        });

        // Should return gracefully, not crash
        expect(result).toBeDefined();
        expect(result.ids).toBeDefined();

        // The result should either be empty or have empty inner arrays
        const ids = result.ids?.[0] || [];
        expect(Array.isArray(ids)).toBe(true);
    });

    test('StorageRouter re-ranker should handle valid queries without crashing', async () => {
        const StorageRouter = (await import('../../../../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs')).default;
        await StorageRouter.ready();

        const collection = await StorageRouter.getMemoryCollection();

        // Query against our seeded data — should work
        const result = await collection.query({
            queryTexts: ['Neo.mjs framework architecture'],
            nResults  : 3,
            where     : {sessionId: testSessionId}
        });

        expect(result).toBeDefined();
        expect(result.ids?.[0]?.length).toBeGreaterThan(0);
        expect(result._reRanked).toBe(true);
    });

    test('MemoryService.queryMemories should not crash on semantic search', async () => {
        // This is the end-to-end path that was failing:
        // queryMemories → collection.query (patched by re-ranker) → crash
        const result = await SDK.Memory_Service.queryMemories({
            query    : 'virtual DOM rendering',
            nResults : 3,
            sessionId: testSessionId
        });

        // Should return a valid result structure, not an error object
        expect(result.error).toBeUndefined();
        expect(result.query).toBe('virtual DOM rendering');
        expect(result.count).toBeGreaterThan(0);
        expect(result.results[0].id).toBeDefined();
        expect(result.results[0].relevanceScore).toBeGreaterThan(0);
    });

    test('SummaryService.querySummaries should not crash on empty collections', async () => {
        // The summary collection is empty (no summarization run)
        // This should return gracefully, not crash
        const SummaryService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/SummaryService.mjs')).default;
        await SummaryService.ready();

        const result = await SummaryService.querySummaries({
            query   : 'framework testing',
            nResults: 3
        });

        // Should return either valid empty results or an error object, NOT throw
        expect(result).toBeDefined();
        // Either it succeeded with 0 results or returned an error object (graceful failure)
        if (!result.error) {
            expect(result.count).toBeDefined();
        }
    });
});

test.describe('SessionService Drift Detection — Timestamp Filtering', () => {
    let SDK, TextEmbeddingService, driftSessionId;
    const testPid = process.pid;
    const testTs  = Date.now();

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        // Use SEPARATE isolated collections from the previous describe block
        aiConfig.collections.memory  = `test-drift-mem-${testPid}-${testTs}`;
        aiConfig.collections.session = `test-drift-sum-${testPid}-${testTs}`;

        SDK                  = await import('../../../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.chromaEmbeddingProvider = 'openAiCompatible';
        SDK.Memory_Config.data.neoEmbeddingProvider    = 'openAiCompatible';
        SDK.Memory_Config.data.autoSummarize           = false;

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());

        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }

        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();
    });

    test.afterAll(async () => {
        try {
            if (SDK.Memory_ChromaManager?.client) {
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.memory});
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.session});
            }
        } catch (e) {
            console.warn(`[Cleanup] Failed to delete drift test collections:`, e.message);
        }

        if (SDK?.Memory_LifecycleService) {
            SDK.Memory_LifecycleService._initPromise = null;
        }
    });

    test('findSessionsToSummarize should detect unsummarized sessions with epoch timestamps', async () => {
        driftSessionId = crypto.randomUUID();

        // Add memories with proper epoch timestamps (Date.now())
        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();

        const now = Date.now();
        await collection.add({
            ids      : [`drift-test-1-${testTs}`, `drift-test-2-${testTs}`],
            documents: ['Test memory 1', 'Test memory 2'],
            metadatas: [
                {sessionId: driftSessionId, timestamp: now - 1000, type: 'agent-interaction'},
                {sessionId: driftSessionId, timestamp: now,        type: 'agent-interaction'}
            ]
        });

        // Verify the memories were stored
        const stored = await collection.get({
            where  : {sessionId: driftSessionId},
            include: ['metadatas']
        });

        expect(stored.ids.length).toBe(2);

        // The timestamp should be stored as a number (epoch ms)
        const storedTimestamp = stored.metadatas[0].timestamp;
        expect(typeof storedTimestamp).toBe('number');

        // Now test drift detection — this session should be flagged
        const sessionsToSummarize = await SDK.Memory_SessionService.findSessionsToSummarize(false);

        expect(sessionsToSummarize).toContain(driftSessionId);
    });

    test('findSessionsToSummarize should exclude the active session from drift detection', async () => {
        const activeSessionId = SDK.Memory_SessionService.currentSessionId;

        // Add memories for the CURRENT session
        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();
        const now = Date.now();

        await collection.add({
            ids      : [`active-test-${testTs}`],
            documents: ['Active session memory'],
            metadatas: [{sessionId: activeSessionId, timestamp: now, type: 'agent-interaction'}]
        });

        const sessionsToSummarize = await SDK.Memory_SessionService.findSessionsToSummarize(false);

        // The active session should NOT be in the list
        expect(sessionsToSummarize).not.toContain(activeSessionId);
    });

    test('ChromaDB $gt filter should correctly compare epoch timestamps', async () => {
        // Direct ChromaDB timestamp filtering test
        // This validates your hypothesis about potential date/type issues
        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();

        const recentTimestamp  = Date.now() - (1000 * 60 * 60);      // 1 hour ago
        const ancientTimestamp = Date.now() - (60 * 24 * 60 * 60 * 1000); // 60 days ago

        const ancientSessionId = `ancient-session-${testTs}`;

        await collection.add({
            ids      : [`ancient-mem-${testTs}`],
            documents: ['Ancient memory'],
            metadatas: [{sessionId: ancientSessionId, timestamp: ancientTimestamp, type: 'agent-interaction'}]
        });

        // Query with 30-day window — should NOT include the ancient memory
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentResults = await collection.get({
            where  : {timestamp: {'$gt': thirtyDaysAgo}},
            include: ['metadatas']
        });

        const recentSessionIds = recentResults.metadatas.map(m => m.sessionId);
        expect(recentSessionIds).not.toContain(ancientSessionId);

        // Query with ALL time — should include it
        const allResults = await collection.get({
            include: ['metadatas']
        });

        const allSessionIds = allResults.metadatas.map(m => m.sessionId);
        expect(allSessionIds).toContain(ancientSessionId);
    });
});
