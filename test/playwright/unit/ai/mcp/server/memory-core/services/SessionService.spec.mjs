import {setup} from '../../../../../../setup.mjs';

const appName = 'MemoryCoreSessionServiceTest';

process.env.MODEL_PROVIDER = 'openAiCompatible';
process.env.OPENAI_COMPATIBLE_MODEL   = 'gemma4';

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
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../../../.env'), quiet: true});

test.describe('SessionService setSessionId', () => {
    let SDK, TextEmbeddingService, dummySessionId;

    test.beforeAll(async () => {
        const os = await import('os');
        const fs = await import('fs');

        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
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

        SDK                  = await import('../../../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        SDK.Memory_Config.data.modelProvider         = 'openAiCompatible';
        SDK.Memory_Config.data.neoEmbeddingProvider  = 'openAiCompatible';
        SDK.Memory_Config.data.chromaEmbeddingProvider = 'openAiCompatible';
        SDK.Memory_Config.data.autoSummarize         = false;

        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());
    });

    test.afterAll(async () => {
        try {
            if (SDK.Memory_ChromaManager && SDK.Memory_ChromaManager.client) {
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.memory});
                await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.session});
            }
        } catch (e) {}
        
        if (SDK?.Memory_LifecycleService) {
            SDK.Memory_LifecycleService._initPromise = null;
        }
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
        const RequestContextService = (await import('../../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        
        const sessionId1 = crypto.randomUUID();
        const sessionId2 = crypto.randomUUID();

        let currentId1;
        await RequestContextService.run({ sessionId: sessionId1 }, async () => {
            currentId1 = SDK.Memory_SessionService.currentSessionId;
        });

        let currentId2;
        await RequestContextService.run({ sessionId: sessionId2 }, async () => {
            currentId2 = SDK.Memory_SessionService.currentSessionId;
        });

        expect(currentId1).toBe(sessionId1);
        expect(currentId2).toBe(sessionId2);
        
        // Verify setSessionId fails inside a request context
        await RequestContextService.run({ sessionId: sessionId1 }, async () => {
            const result = await SDK.Memory_SessionService.setSessionId({ sessionId: crypto.randomUUID() });
            expect(result.error).toBe('Cannot manually override request-scoped sessions. Manage session identity via Mcp-Session-Id header.');
            expect(result.code).toBe('REQUEST_SCOPED_SESSION_ACTIVE');
        });
    });
});
