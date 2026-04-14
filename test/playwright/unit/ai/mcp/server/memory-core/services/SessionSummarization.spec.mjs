import {setup} from '../../../../../../setup.mjs';

const appName = 'MemoryCoreTest';

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
import InstanceManager from '../../../../../../../../src/manager/Instance.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../../../.env'), quiet: true});

test.describe('Memory Core Offline Summarization', () => {
    let SDK, TextEmbeddingService, dummySessionId;
    let localModelActive = false;

    // We must use dynamic imports in Playwright tests inside beforeAll or the test body
    // because Neo globals are established during setup()
    test.beforeAll(async () => {
        const os = await import('os');
        const fs = await import('fs');

        // Load and mock config FIRST before starting any services
        const aiConfig = (await import('../../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const testDbName              = `memory-core-session-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath              = path.join(tmpDir, testDbName);
        aiConfig.engines.neo.dataDir  = tmpDir;
        aiConfig.engines.neo.filename = testDbName;

        // Remove existing test db
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                  = await import('../../../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        // Force 'openAiCompatible' routing for this test
        SDK.Memory_Config.data.modelProvider         = 'openAiCompatible';
        SDK.Memory_Config.data.neoEmbeddingProvider  = 'openAiCompatible';
        SDK.Memory_Config.data.chromaEmbeddingProvider = 'openAiCompatible';
        SDK.Memory_Config.data.openAiCompatible.model          = 'gemma4:31b';
        SDK.Memory_Config.data.openAiCompatible.embeddingModel = 'qwen3-embedding';
        SDK.Memory_Config.data.autoSummarize         = false;

        // Adjust batch limit to speed up test execution
        SDK.Memory_Config.data.summarizationBatchLimit = 5;

        // Offline tests cannot hit APIs. Mock TextEmbeddingService for Qwen3-Embedding (4096D)
        TextEmbeddingService.embedText = async () => new Array(4096).fill(Math.random());

        // Check if openAiCompatible daemon and gemma4 are available
        try {
            const host = SDK.Memory_Config.data.openAiCompatible.host;
            const res  = await fetch(`${host}/v1/models`);
            if (res.ok) {
                const data      = await res.json();
                const hasGemma4 = data.data?.some(m => m.id.startsWith('gemma4'));
                if (hasGemma4) {
                    localModelActive = true;
                }
            }
        } catch (e) {
            console.log('[Playwright] openAiCompatible daemon not reachable, skipping active test logic.');
        }
    });

    test.afterAll(async () => {
        // Clean up dummy turns so we don't pollute the real memory core
        if (dummySessionId && localModelActive) {
            try {
                if (SDK.Memory_ChromaManager && SDK.Memory_ChromaManager.client) {
                    await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.memory});
                    await SDK.Memory_ChromaManager.client.deleteCollection({name: SDK.Memory_Config.data.collections.session});
                }
                console.log(`[Cleanup] Deleted dummy Chroma collections for session ${dummySessionId}.`);
            } catch (e) {
                console.warn(`[Cleanup] Failed to delete session ${dummySessionId}:`, e);
            }
        }
        
        if (SDK?.Memory_LifecycleService) {
            SDK.Memory_LifecycleService._initPromise = null;
        }
    });

    test('SessionService routes to openAiCompatible (gemma4) via SDK and correctly summarizes memories', async () => {
        test.setTimeout(300000); // 5 minutes to allow Gemma 4 to fully summarize on slow hardware

        if (!localModelActive) {
            test.skip(true, 'Skipping: openAiCompatible or gemma4 not found locally');
            return;
        }

        console.log('INIT DB Lifecycled...');
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }

        console.log('Waiting SessionService.ready() implicitly via SDK');
        await SDK.Memory_SessionService.ready();

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
        await SDK.Memory_ChromaManager.ready();

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
        const summaryCollection = await SDK.Memory_ChromaManager.getSummaryCollection();
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

    test('SessionService correctly map-reduces massive session histories to fix #9965', async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();

        const bigDummySessionId = crypto.randomUUID();
        await SDK.Memory_ChromaManager.ready();

        // Create a massive string > 10000 chars (approx 20,000 chars)
        const hugeString = new Array(20000).fill('A').join('');
        
        await SDK.Memory_Service.addMemory({
            prompt   : "Massive text request",
            thought  : "Thinking deeply...",
            response : hugeString,
            agent    : "developer",
            model    : "gemini-3.1-pro",
            sessionId: bigDummySessionId
        });

        // Mock the model.generateContent to avoid actual LLM calls and verify the exact prompt content
        const originalGenerateContent = SDK.Memory_SessionService.model ? SDK.Memory_SessionService.model.generateContent : null;
        let capturedPrompts = [];
        
        SDK.Memory_SessionService.model = {
            generateContent: async (prompt) => {
                capturedPrompts.push(prompt);
                
                // Emulate Sub-Summary string if it is a map chunk
                if (prompt.includes('Analyze this sequential segment')) {
                    return {
                        response: { text: () => "Mock chunk summary." }
                    };
                }

                return {
                    response: {
                        text: () => JSON.stringify({
                            title              : "Massive Session",
                            summary            : "It was huge",
                            memoryCount        : 1,
                            timeSpanString     : "0 minutes",
                            participatingAgents: ["developer"],
                            models             : ["gemini-3.1-pro"],
                            quality            : 5,
                            productivity       : 5,
                            topics             : ["testing"],
                            decisionList       : ["implemented map reduce"]
                        })
                    }
                };
            }
        };

        const result = await SDK.Memory_SessionService.summarizeSession(bigDummySessionId);
        
        // Restore
        if (originalGenerateContent) {
            SDK.Memory_SessionService.model.generateContent = originalGenerateContent;
        }

        // Verify map-reduce logic occurred due to large payload
        expect(capturedPrompts.length).toBeGreaterThan(1);
        
        // The last prompt should be the final compression that includes our compressed arrays
        const finalPrompt = capturedPrompts[capturedPrompts.length - 1];
        expect(finalPrompt.includes('[COMPRESSED SESSION SUB-SUMMARIES]')).toBe(true);
        expect(finalPrompt.length).toBeLessThan(12000); 
    });

    test('SessionService limits toolsUsed stringification to prevent prompt explosion', async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();

        const dummySessionId = crypto.randomUUID();
        await SDK.Memory_ChromaManager.ready();

        const massiveToolConfig = new Array(50000).fill('A').join('');
        const toolsUsed = [JSON.stringify({
            name: undefined,
            toolAction: undefined,
            content: massiveToolConfig
        })];

        await SDK.Memory_Service.addMemory({
            prompt   : "Massive tools",
            thought  : "Thinking...",
            response : "Done",
            agent    : "developer",
            model    : "gemini-3.1-pro",
            toolsUsed: toolsUsed,
            sessionId: dummySessionId
        });

        const originalGenerateContent = SDK.Memory_SessionService.model ? SDK.Memory_SessionService.model.generateContent : null;
        let capturedPrompts = [];
        
        SDK.Memory_SessionService.model = {
            generateContent: async (prompt) => {
                capturedPrompts.push(prompt);
                return {
                    response: {
                        text: () => JSON.stringify({
                            title: "Massive Session Tools", summary: "Done"
                        })
                    }
                };
            }
        };

        await SDK.Memory_SessionService.summarizeSession(dummySessionId);
        
        if (originalGenerateContent) {
            SDK.Memory_SessionService.model.generateContent = originalGenerateContent;
        }

        const finalPrompt = capturedPrompts[capturedPrompts.length - 1];
        // Ensure final prompt is kept reasonably sized despite huge tools logging JSON
        expect(finalPrompt.length).toBeLessThan(15000);
    });

    test('findSessionsToSummarize orders candidates newest first based on lastActivity', async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();

        const s1 = crypto.randomUUID();
        const s2 = crypto.randomUUID();
        const s3 = crypto.randomUUID();

        // Memory 1 is oldest
        await SDK.Memory_Service.addMemory({
            prompt: "Test s1", thought: "T1", response: "R1", agent: "dev", model: "gemini-3.1-pro", sessionId: s1
        });
        
        await new Promise(r => setTimeout(r, 100)); // Sleep to ensure timestamp difference

        // Memory 2 is middle
        await SDK.Memory_Service.addMemory({
            prompt: "Test s2", thought: "T2", response: "R2", agent: "dev", model: "gemini-3.1-pro", sessionId: s2
        });

        await new Promise(r => setTimeout(r, 100)); // Sleep

        // Memory 3 is newest
        await SDK.Memory_Service.addMemory({
            prompt: "Test s3", thought: "T3", response: "R3", agent: "dev", model: "gemini-3.1-pro", sessionId: s3
        });

        // Use findSessionsToSummarize explicitly
        const candidates = await SDK.Memory_SessionService.findSessionsToSummarize(true);

        // candidates should contain s1, s2, s3. Since s3 is newest, its index should be smaller than s2 and s1.
        expect(candidates.includes(s3)).toBe(true);
        expect(candidates.includes(s2)).toBe(true);
        expect(candidates.includes(s1)).toBe(true);

        const pos1 = candidates.indexOf(s1);
        const pos2 = candidates.indexOf(s2);
        const pos3 = candidates.indexOf(s3);

        expect(pos3).toBeLessThan(pos2);
        expect(pos2).toBeLessThan(pos1);
    });
});
