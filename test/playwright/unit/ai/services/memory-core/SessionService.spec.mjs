import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreSessionServiceTest';
const skipCiSubstrateData = !!process.env.NEO_TEST_SKIP_CI;

process.env.NEO_MODEL_PROVIDER        = 'openAiCompatible';
process.env.NEO_OPENAI_COMPATIBLE_MODEL = 'gemma4';

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
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';
import {captureAiConfigKeys} from '../../../../fixtures/aiConfigIsolation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../.env'), quiet: true});

test.describe('SessionService setSessionId', () => {
    test.skip(skipCiSubstrateData, 'CI-skip: Memory Core substrate data not seeded - bucket C (#10903)');

    let SDK, TextEmbeddingService, dummySessionId;
    let restoreAiConfig;

    test.beforeAll(async () => {
        const os = await import('os');
        const fs = await import('fs');

        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const path = await import("path");
        const tmpDir = path.resolve(process.cwd(), "tmp");
        restoreAiConfig = captureAiConfigKeys(aiConfig, ['storagePaths.graph', 'collections']);
        aiConfig.storagePaths.graph = path.join(tmpDir, "test-graph-" + Date.now() + "-" + Math.random().toString(36).substring(7) + ".db");

        
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const testDbName              = `memory-core-session-service-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath              = path.join(tmpDir, testDbName);

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.modelProvider         = 'openAiCompatible';
        SDK.Memory_Config.data.embeddingProvider     = 'openAiCompatible';
        SDK.Memory_Config.data.autoSummarize         = false;

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager(SDK);
        restoreAiConfig?.();
    });

    test.beforeEach(async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();
    });

    test('setSessionId happy path: mutates currentSessionId', async () => {
        const oldId = SDK.Memory_SessionService.currentSessionId;
        const newId = crypto.randomUUID();
        
        const result = await SDK.Memory_SessionService.setSessionId({ sessionId: newId });
        
        expect(result.success).toBe(true);
        expect(result.sessionId).toBe(newId);
        expect(result.replacedSessionId).toBe(oldId);
        expect(SDK.Memory_SessionService.currentSessionId).toBe(newId);
    });

    test('setSessionId idempotency: no mutation if same ID', async () => {
        const currentId = SDK.Memory_SessionService.currentSessionId;
        
        const result = await SDK.Memory_SessionService.setSessionId({ sessionId: currentId });
        
        expect(result.success).toBe(true);
        expect(result.message).toBe("Session ID unchanged.");
        expect(SDK.Memory_SessionService.currentSessionId).toBe(currentId);
    });

    test('setSessionId invalid input: throws ZodError via SDK validation', async () => {
        const currentId = SDK.Memory_SessionService.currentSessionId;
        
        await expect(SDK.Memory_SessionService.setSessionId({})).rejects.toThrow();
        await expect(SDK.Memory_SessionService.setSessionId({ sessionId: null })).rejects.toThrow();
        
        // Ensure state wasn't mutated
        expect(SDK.Memory_SessionService.currentSessionId).toBe(currentId);
    });

    test('setSessionId AC verification: empty session is abandoned', async () => {
        const emptySessionId = crypto.randomUUID();
        
        // Force the empty session as current
        SDK.Memory_SessionService.currentSessionId = emptySessionId;
        
        const newId = crypto.randomUUID();
        const result = await SDK.Memory_SessionService.setSessionId({ sessionId: newId });
        
        expect(result.success).toBe(true);
        expect(result.replacedSessionId).toBe(emptySessionId);
        expect(SDK.Memory_SessionService.currentSessionId).toBe(newId);
        
        // Note: The AC states we abandon it, meaning we do nothing to Chroma for a zero-memory session,
        // it simply leaves no footprint because it wasn't tracked anyway.
    });

    test('concurrent-client request context maintains isolation', async () => {
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        const sessionId1 = crypto.randomUUID();
        const sessionId2 = crypto.randomUUID();

        await Promise.all([
            RequestContextService.run({ sessionId: sessionId1 }, async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const memoryResult1 = await SDK.Memory_Service.addMemory({
                    prompt: 'test prompt 1',
                    response: 'test response 1',
                    thought: 'test thought 1'
                });
                expect(memoryResult1.sessionId).toBe(sessionId1);

                const listResult = await SDK.Memory_Service.listMemories({ sessionId: sessionId1 });
                expect(listResult.memories.length).toBe(1);
                expect(listResult.memories[0].sessionId).toBe(sessionId1);
            }),
            RequestContextService.run({ sessionId: sessionId2 }, async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const memoryResult2 = await SDK.Memory_Service.addMemory({
                    prompt: 'test prompt 2',
                    response: 'test response 2',
                    thought: 'test thought 2'
                });
                expect(memoryResult2.sessionId).toBe(sessionId2);

                const listResult = await SDK.Memory_Service.listMemories({ sessionId: sessionId2 });
                expect(listResult.memories.length).toBe(1);
                expect(listResult.memories[0].sessionId).toBe(sessionId2);
            })
        ]);

        // Verify setSessionId fails inside a request context
        await RequestContextService.run({ sessionId: sessionId1 }, async () => {
            const result = await SDK.Memory_SessionService.setSessionId({ sessionId: crypto.randomUUID() });
            expect(result.error).toBe('Cannot manually override request-scoped sessions. Manage session identity via Mcp-Session-Id header.');
            expect(result.code).toBe('REQUEST_SCOPED_SESSION_ACTIVE');
        });
    });

    test('purgeSession deletes target session memories and summaries, leaves others intact', async () => {
        const targetSessionId = crypto.randomUUID();
        const otherSessionId = crypto.randomUUID();

        // Add memory to target session
        await SDK.Memory_Service.addMemory({
            prompt: 'target prompt',
            response: 'target response',
            thought: 'target thought',
            sessionId: targetSessionId
        });

        // Add memory to other session
        await SDK.Memory_Service.addMemory({
            prompt: 'other prompt',
            response: 'other response',
            thought: 'other thought',
            sessionId: otherSessionId
        });

        // Manually add summaries just to be sure we test both collections
        await SDK.Memory_SessionService.sessionsCollection.upsert({
            ids: ['sum_target', 'sum_other'],
            metadatas: [
                { sessionId: targetSessionId },
                { sessionId: otherSessionId }
            ],
            documents: ['target summary', 'other summary']
        });

        const result = await SDK.Memory_SessionService.purgeSession({ sessionId: targetSessionId });
        expect(result.success).toBe(true);
        expect(result.deletedMemories).toBeGreaterThan(0);
        expect(result.deletedSummaries).toBeGreaterThan(0);

        // Verify target session is gone
        const targetMemories = await SDK.Memory_Service.listMemories({ sessionId: targetSessionId });
        expect(targetMemories.memories.length).toBe(0);

        const targetSummaries = await SDK.Memory_SessionService.sessionsCollection.get({
            where: { sessionId: targetSessionId }
        });
        expect(targetSummaries.ids.length).toBe(0);

        // Verify other session remains
        const otherMemories = await SDK.Memory_Service.listMemories({ sessionId: otherSessionId });
        expect(otherMemories.memories.length).toBe(1);

        const otherSummaries = await SDK.Memory_SessionService.sessionsCollection.get({
            where: { sessionId: otherSessionId }
        });
        expect(otherSummaries.ids.length).toBe(1);
    });

    test('purgeSession deletes orphaned SummarizationJobs and respects multi-tenant isolation', async () => {
        const GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        const RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;

        const targetSessionId = crypto.randomUUID();
        const otherSessionId = crypto.randomUUID();
        const testUserId = 'test-user-123';

        // Add dummy SummarizationJobs directly via SQLite
        const db = GraphService.db?.storage?.db;
        db.prepare('INSERT INTO SummarizationJobs (session_id, status) VALUES (?, ?)').run(targetSessionId, 'pending');
        db.prepare('INSERT INTO SummarizationJobs (session_id, status) VALUES (?, ?)').run(otherSessionId, 'pending');

        // Verify rows exist
        const countBefore = db.prepare('SELECT COUNT(*) as count FROM SummarizationJobs WHERE session_id IN (?, ?)').get(targetSessionId, otherSessionId);
        expect(countBefore.count).toBe(2);

        // Add memory to target session under test user
        await RequestContextService.run({ sessionId: targetSessionId, userId: testUserId }, async () => {
            await SDK.Memory_Service.addMemory({
                prompt: 'target prompt',
                response: 'target response',
                thought: 'target thought',
                sessionId: targetSessionId
            });

            // Purge the session from within the tenant context
            const result = await SDK.Memory_SessionService.purgeSession({ sessionId: targetSessionId });
            expect(result.success).toBe(true);
        });

        // Verify target jobs were deleted, but other session jobs remain
        const targetJobsAfter = db.prepare('SELECT COUNT(*) as count FROM SummarizationJobs WHERE session_id = ?').get(targetSessionId);
        expect(targetJobsAfter.count).toBe(0);

        const otherJobsAfter = db.prepare('SELECT COUNT(*) as count FROM SummarizationJobs WHERE session_id = ?').get(otherSessionId);
        expect(otherJobsAfter.count).toBe(1);

        // Verify tenant isolation: try to purge a session that belongs to a different user, or without the proper tenant.
        // We'll create another memory under SHARED_USER_ID, then try to delete it from testUserId context.
        const sharedSessionId = crypto.randomUUID();
        await SDK.Memory_Service.addMemory({
            prompt: 'shared prompt',
            response: 'shared response',
            thought: 'shared thought',
            sessionId: sharedSessionId
        });

        await RequestContextService.run({ sessionId: sharedSessionId, userId: testUserId }, async () => {
            const result = await SDK.Memory_SessionService.purgeSession({ sessionId: sharedSessionId });
            // Since where condition expects userId = testUserId, it won't find the SHARED_USER_ID memory.
            expect(result.success).toBe(true);
            expect(result.deletedMemories).toBe(0); // Should be 0 deleted because of tenant isolation
        });

        // Verify shared memory is still there
        const sharedMemories = await SDK.Memory_Service.listMemories({ sessionId: sharedSessionId });
        expect(sharedMemories.memories.length).toBe(1);
    });
});
