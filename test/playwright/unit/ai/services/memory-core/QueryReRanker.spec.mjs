import {setup} from '../../../../setup.mjs';

const appName = 'QueryReRankerTest';
const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

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
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../.env'), quiet: true});

test.describe('StorageRouter Query Re-Ranker Defensive Handling', () => {
    test.skip(skipCiSubstrateData, 'CI-skip: Memory Core substrate data not seeded - bucket C (#10903)');

    let SDK, TextEmbeddingService, testSessionId;
    const testPid = process.pid;
    const testTs  = Date.now();

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const path = await import("path");
        const tmpDir = path.resolve(process.cwd(), "tmp");
        aiConfig.storagePaths.graph = path.join(tmpDir, "test-graph-" + Date.now() + "-" + Math.random().toString(36).substring(7) + ".db");

        // Isolate collections to prevent pollution
        aiConfig.collections.memory  = `test-reranker-mem-${testPid}-${testTs}`;
        aiConfig.collections.session = `test-reranker-sum-${testPid}-${testTs}`;

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        // Force offline mode — mock embeddings with deterministic 4096D vectors
        SDK.Memory_Config.data.embeddingProvider       = 'openAiCompatible';
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
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager(SDK);
    });

    test('StorageRouter re-ranker should NOT crash when ChromaDB returns empty/malformed query results', async () => {
        // The bug: StorageRouter.injectQueryReRanker patches collection.query()
        // and accesses searchResult.ids[0] without optional chaining.
        // If ChromaDB returns {ids: [], distances: [], metadatas: []} (empty) or
        // a malformed result, this crashes with "Cannot read properties of undefined (reading '0')".

        const StorageRouter = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
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
        const StorageRouter = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
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
        const SummaryService = (await import('../../../../../../ai/services/memory-core/SummaryService.mjs')).default;
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
    test.skip(skipCiSubstrateData, 'CI-skip: Memory Core substrate data not seeded - bucket C (#10903)');

    let SDK, TextEmbeddingService, driftSessionId;
    const testPid = process.pid;
    const testTs  = Date.now();

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        // Use SEPARATE isolated collections from the previous describe block
        aiConfig.collections.memory  = `test-drift-mem-${testPid}-${testTs}`;
        aiConfig.collections.session = `test-drift-sum-${testPid}-${testTs}`;

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.embeddingProvider       = 'openAiCompatible';
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
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager(SDK);
    });

    function insertGraphNode(sqlite, {id, label, userId, properties}) {
        sqlite.prepare('INSERT INTO Nodes (id, user_id, data) VALUES (?, ?, ?)').run(id, userId || null, JSON.stringify({
            id,
            label,
            properties
        }));
    }

    function insertActiveWakeSubscription(sqlite, agentIdentity) {
        insertGraphNode(sqlite, {
            id        : `WAKE_SUB:${crypto.randomUUID()}`,
            label     : 'WAKE_SUBSCRIPTION',
            userId    : agentIdentity,
            properties: {
                agentIdentity,
                harnessTarget: 'bridge-daemon',
                status       : 'active'
            }
        });
    }

    function insertAgentMemoryNode(sqlite, {sessionId, agentIdentity, timestampMs}) {
        insertGraphNode(sqlite, {
            id        : crypto.randomUUID(),
            label     : 'AGENT_MEMORY',
            userId    : agentIdentity,
            properties: {
                agentIdentity,
                sessionId,
                timestamp: new Date(timestampMs).toISOString()
            }
        });
    }

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

    test('#9959: findSessionsToSummarize should exclude externally active peer sessions from drift detection', async () => {
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const activeSessionId = `external-active-${crypto.randomUUID()}`;
        const agentIdentity   = `@external-active-${crypto.randomUUID()}`;
        const now             = Date.now();

        insertActiveWakeSubscription(sqlite, agentIdentity);
        insertAgentMemoryNode(sqlite, {sessionId: activeSessionId, agentIdentity, timestampMs: now});

        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();
        await collection.add({
            ids      : [`external-active-memory-${crypto.randomUUID()}`],
            documents: ['Externally active session memory'],
            metadatas: [{sessionId: activeSessionId, timestamp: now, type: 'agent-interaction'}]
        });

        const externallyActiveSessionIds = SDK.Memory_SessionService.getExternallyActiveSessionIds({now});
        expect(externallyActiveSessionIds.has(activeSessionId)).toBe(true);

        const sessionsToSummarize = await SDK.Memory_SessionService.findSessionsToSummarize(false);
        expect(sessionsToSummarize).not.toContain(activeSessionId);
    });

    test('#9959: externally active detection should protect parallel sessions for the same identity', async () => {
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const firstSessionId  = `external-active-a-${crypto.randomUUID()}`;
        const secondSessionId = `external-active-b-${crypto.randomUUID()}`;
        const agentIdentity   = `@parallel-active-${crypto.randomUUID()}`;
        const now             = Date.now();

        insertActiveWakeSubscription(sqlite, agentIdentity);
        insertAgentMemoryNode(sqlite, {sessionId: firstSessionId,  agentIdentity, timestampMs: now - 1000});
        insertAgentMemoryNode(sqlite, {sessionId: secondSessionId, agentIdentity, timestampMs: now});

        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();
        await collection.add({
            ids      : [
                `external-parallel-memory-a-${crypto.randomUUID()}`,
                `external-parallel-memory-b-${crypto.randomUUID()}`
            ],
            documents: [
                'First parallel externally active session memory',
                'Second parallel externally active session memory'
            ],
            metadatas: [
                {sessionId: firstSessionId,  timestamp: now - 1000, type: 'agent-interaction'},
                {sessionId: secondSessionId, timestamp: now,        type: 'agent-interaction'}
            ]
        });

        const externallyActiveSessionIds = SDK.Memory_SessionService.getExternallyActiveSessionIds({now});
        expect(externallyActiveSessionIds.has(firstSessionId)).toBe(true);
        expect(externallyActiveSessionIds.has(secondSessionId)).toBe(true);

        const sessionsToSummarize = await SDK.Memory_SessionService.findSessionsToSummarize(false);
        expect(sessionsToSummarize).not.toContain(firstSessionId);
        expect(sessionsToSummarize).not.toContain(secondSessionId);
    });

    test('#9959: explicit named-session summarization should bypass the externally active drift filter', async () => {
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const activeSessionId = `explicit-active-${crypto.randomUUID()}`;
        const agentIdentity   = `@explicit-active-${crypto.randomUUID()}`;
        const now             = Date.now();

        insertActiveWakeSubscription(sqlite, agentIdentity);
        insertAgentMemoryNode(sqlite, {sessionId: activeSessionId, agentIdentity, timestampMs: now});

        const externallyActiveSessionIds = SDK.Memory_SessionService.getExternallyActiveSessionIds({now});
        expect(externallyActiveSessionIds.has(activeSessionId)).toBe(true);

        const originalClaim     = SDK.Memory_SessionService.claimSummarizationJob;
        const originalSummarize = SDK.Memory_SessionService.summarizeSession;
        const originalComplete  = SDK.Memory_SessionService.completeSummarizationJob;
        const originalFail      = SDK.Memory_SessionService.failSummarizationJob;

        const calls = [];

        SDK.Memory_SessionService.claimSummarizationJob = (sessionId) => {
            calls.push({type: 'claim', sessionId});
            return true;
        };
        SDK.Memory_SessionService.summarizeSession = async (sessionId) => {
            calls.push({type: 'summarize', sessionId});
            return {
                sessionId,
                summaryId   : `summary_${sessionId}`,
                title       : 'Explicit Active Summary',
                memoryCount : 1
            };
        };
        SDK.Memory_SessionService.completeSummarizationJob = (sessionId) => {
            calls.push({type: 'complete', sessionId});
        };
        SDK.Memory_SessionService.failSummarizationJob = (sessionId) => {
            calls.push({type: 'fail', sessionId});
        };

        try {
            const result = await SDK.Memory_SessionService.summarizeSessions({sessionId: activeSessionId});

            expect(result.processed).toBe(1);
            expect(result.sessions[0].sessionId).toBe(activeSessionId);
            expect(calls).toEqual([
                {type: 'claim', sessionId: activeSessionId},
                {type: 'summarize', sessionId: activeSessionId},
                {type: 'complete', sessionId: activeSessionId}
            ]);
        } finally {
            SDK.Memory_SessionService.claimSummarizationJob     = originalClaim;
            SDK.Memory_SessionService.summarizeSession          = originalSummarize;
            SDK.Memory_SessionService.completeSummarizationJob  = originalComplete;
            SDK.Memory_SessionService.failSummarizationJob      = originalFail;
        }
    });

    test('#9959: findSessionsToSummarize should keep stale peer sessions eligible for self-healing', async () => {
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();

        const sqlite = GraphService.db?.storage?.db;
        expect(sqlite).toBeTruthy();

        const staleSessionId = `external-stale-${crypto.randomUUID()}`;
        const agentIdentity  = `@external-stale-${crypto.randomUUID()}`;
        const now            = Date.now();
        const staleTimestamp = now - 60_000;
        const idleThreshold  = 10_000;

        insertActiveWakeSubscription(sqlite, agentIdentity);
        insertAgentMemoryNode(sqlite, {sessionId: staleSessionId, agentIdentity, timestampMs: staleTimestamp});

        const collection = await SDK.Memory_ChromaManager.getMemoryCollection();
        await collection.add({
            ids      : [`external-stale-memory-${crypto.randomUUID()}`],
            documents: ['Externally stale session memory'],
            metadatas: [{sessionId: staleSessionId, timestamp: staleTimestamp, type: 'agent-interaction'}]
        });

        const externallyActiveSessionIds = SDK.Memory_SessionService.getExternallyActiveSessionIds({
            idleThresholdMs: idleThreshold,
            now
        });
        expect(externallyActiveSessionIds.has(staleSessionId)).toBe(false);

        const originalIdleThreshold = process.env.IDLE_THRESHOLD_MS;
        process.env.IDLE_THRESHOLD_MS = String(idleThreshold);

        try {
            const sessionsToSummarize = await SDK.Memory_SessionService.findSessionsToSummarize(false);
            expect(sessionsToSummarize).toContain(staleSessionId);
        } finally {
            if (originalIdleThreshold === undefined) {
                delete process.env.IDLE_THRESHOLD_MS;
            } else {
                process.env.IDLE_THRESHOLD_MS = originalIdleThreshold;
            }
        }
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
