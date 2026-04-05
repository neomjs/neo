import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreTest';

process.env.MODEL_PROVIDER = 'ollama';
process.env.OLLAMA_MODEL   = 'gemma4';

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

test.describe('Memory Core Offline Summarization', () => {
    let SDK, TextEmbeddingService, dummySessionId;
    let localModelActive = false;

    // We must use dynamic imports in Playwright tests inside beforeAll or the test body
    // because Neo globals are established during setup()
    test.beforeAll(async () => {
        const os = await import('os');
        const fs = await import('fs');

        // Load and mock config FIRST before starting any services
        const aiConfig                = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const testDbName              = `memory-core-session-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath              = path.join(os.tmpdir(), testDbName);
        aiConfig.engines.neo.dataDir  = os.tmpdir();
        aiConfig.engines.neo.filename = testDbName;

        // Remove existing test db
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        // Force 'ollama' routing for this test
        SDK.Memory_Config.data.modelProvider         = 'ollama';
        SDK.Memory_Config.data.embeddingProvider     = 'ollama';
        SDK.Memory_Config.data.ollama.model          = 'gemma4';
        SDK.Memory_Config.data.ollama.embeddingModel = 'gemma4';
        SDK.Memory_Config.data.autoSummarize         = false;

        // Adjust batch limit to speed up test execution
        SDK.Memory_Config.data.summarizationBatchLimit = 5;

        // Offline tests cannot hit Gemini's API. Mock TextEmbeddingService.
        TextEmbeddingService.embedText = async () => new Array(3072).fill(Math.random());

        // Check if Ollama daemon and gemma4 are available
        try {
            const host = SDK.Memory_Config.data.ollama.host;
            const res  = await fetch(`${host}/api/tags`);
            if (res.ok) {
                const data      = await res.json();
                const hasGemma4 = data.models?.some(m => m.name.startsWith('gemma4'));
                if (hasGemma4) {
                    localModelActive = true;
                }
            }
        } catch (e) {
            console.log('[Playwright] Ollama daemon not reachable, skipping active test logic.');
        }
    });

    test.afterAll(async () => {
        // Clean up dummy turns so we don't pollute the real memory core
        if (dummySessionId && localModelActive) {
            try {
                const memCol = await SDK.Memory_SQLiteVectorManager.getMemoryCollection();
                await memCol.delete({where: {sessionId: dummySessionId}});

                const sumCol = await SDK.Memory_SQLiteVectorManager.getSummaryCollection();
                await sumCol.delete({where: {sessionId: dummySessionId}});
                console.log(`[Cleanup] Deleted dummy session ${dummySessionId} from DB.`);
            } catch (e) {
                console.warn(`[Cleanup] Failed to delete session ${dummySessionId}:`, e);
            }
        }
    });

    test('SessionService routes to Ollama (gemma4) via SDK and correctly summarizes memories', async () => {
        test.setTimeout(300000); // 5 minutes to allow Gemma 4 to fully summarize on slow hardware

        if (!localModelActive) {
            test.skip(true, 'Skipping: Ollama or gemma4 not found locally');
            return;
        }

        console.log('INIT DB Lifecycled...');
        await SDK.Memory_LifecycleService.ready();

        console.log('Waiting SessionService.initAsync() implicitly via SDK');
        await SDK.Memory_SessionService.initAsync();

        dummySessionId = crypto.randomUUID();
        console.log(`[Playwright] Generating Dummy Turns for session ${dummySessionId}...`);

        const turns = [{
            prompt  : "How do I create a Neo.mjs button?",
            thought : "Query the UI library for buttons.",
            response: "Use Neo.button.Base configs.",
            agent   : "developer",
            model   : "gemini-3.1-pro"
        }, {
            prompt  : "Now make it red.",
            thought : "Use inline styles or cls.",
            response: "Add style: {color: 'red'} to the element.",
            agent   : "developer",
            model   : "gemini-3.1-pro"
        }, {
            prompt  : "Does it support icons?",
            thought : "Check iconCls.",
            response: "Yes, use the iconCls property.",
            agent   : "librarian",
            model   : "gemma4"
        }, {
            prompt  : "How to handle clicks?",
            thought : "DOM events dispatcher.",
            response: "Bind a click listener via domListeners property.",
            agent   : "librarian",
            model   : "gemma4"
        }, {
            prompt  : "Can a button float?",
            thought : "Neo components support floating.",
            response: "Set floating: true.",
            agent   : "developer",
            model   : "gemini-3.1-pro"
        }];

        // Ensure database is ready before adding memories
        await SDK.Memory_SQLiteVectorManager.ready();

        for (const turn of turns) {
            const addResult = await SDK.Memory_Service.addMemory({
                prompt   : turn.prompt,
                thought  : turn.thought,
                response : turn.response,
                agent    : turn.agent,
                model    : turn.model,
                sessionId: dummySessionId
            });
            if (addResult.error) {
                console.error('ADD_MEMORY ERROR:', addResult);
            }
        }

        console.log(`[Playwright] Injected 5 dummy turns via SDK. Triggering Memory_SessionService.summarizeSession...`);
        const startTime = Date.now();

        // This invokes local Gemma 4
        const result = await SDK.Memory_SessionService.summarizeSession(dummySessionId);

        console.log(`[Playwright] Summarization complete! Took ${Math.round((Date.now() - startTime) / 1000)}s`);
        console.log('Summarization Result:', result);

        expect(result).not.toBeNull();
        expect(result.sessionId).toBe(dummySessionId);
        expect(result.memoryCount).toBe(5);
        expect(result.summaryId).toBe(`summary_${dummySessionId}`);
        expect(result.title).toBeTruthy();

        // Verify summary actually got written
        const summaryCollection = await SDK.Memory_SQLiteVectorManager.getSummaryCollection();
        const savedSummary      = await summaryCollection.get({
            ids    : [result.summaryId],
            include: ['metadatas', 'documents']
        });

        expect(savedSummary.ids.length).toBe(1);
        const metadata = savedSummary.metadatas[0];

        console.log('[Playwright] Gemma 4 Summary generated:', savedSummary.documents[0]);
        console.log('[Playwright] Metadata Extracted:', metadata);
        expect(metadata.title).toBeDefined();
        expect(typeof metadata.quality).toBe('number');
        expect(typeof metadata.productivity).toBe('number');

        expect(metadata.participatingAgents).toBeDefined();
        expect(metadata.participatingAgents.includes('librarian')).toBe(true);
        expect(metadata.participatingAgents.includes('developer')).toBe(true);
        expect(metadata.models.includes('gemma4')).toBe(true);
    });
});
