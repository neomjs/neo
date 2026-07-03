import {setup} from '../../../../setup.mjs';

const appName = 'MemoryCoreTest';

process.env.NEO_MODEL_PROVIDER = 'openAiCompatible';
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

import {test, expect}   from '@playwright/test';
import Neo              from '../../../../../../src/Neo.mjs';
import * as core        from '../../../../../../src/core/_export.mjs';
import InstanceManager  from '../../../../../../src/manager/Instance.mjs';
import path             from 'path';
import {fileURLToPath}  from 'url';
import dotenv           from 'dotenv';
import {drainMemoryWal} from './util.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../../.env'), quiet: true});

test.describe('Memory Core Offline Summarization', () => {
    // Bucket A (#10903): heavy SLM (gemma4) dependency — no local LM Studio / Ollama in CI. ticket-ref-ok: bucket taxonomy is defined in that ticket
    // The per-test `localModelActive` guard below stays as a defensive fallback for local-dev
    // without gemma4 running, but the CI-side skip is the early exit that prevents `beforeAll`
    // from probing a nonexistent endpoint.
    test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: heavy SLM (gemma4) — bucket A (#10903)');

    let SDK, TextEmbeddingService, dummySessionId;
    let localModelActive = false;

    // We must use dynamic imports in Playwright tests inside beforeAll or the test body
    // because Neo globals are established during setup()
    test.beforeAll(async () => {
        const os = await import('os');
        const fs = await import('fs');

        // Load and mock config FIRST before starting any services
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const path = await import("path");
        const tmpDir = path.resolve(process.cwd(), "tmp");
        aiConfig.storagePaths.graph = path.join(tmpDir, "test-graph-" + Date.now() + "-" + Math.random().toString(36).substring(7) + ".db");



        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const testDbName              = `memory-core-session-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath              = path.join(tmpDir, testDbName);
        aiConfig.storagePaths.graph   = testDbPath;

        // Remove existing test db
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        aiConfig.collections.memory = `test-memory-${process.pid}-${Date.now()}`;
        aiConfig.collections.session = `test-session-${process.pid}-${Date.now()}`;

        SDK                  = await import('../../../../../../ai/services.mjs');
        TextEmbeddingService = (await import('../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;

        // Force 'openAiCompatible' routing for this test
        SDK.Memory_Config.data.modelProvider         = 'openAiCompatible';
        SDK.Memory_Config.data.embeddingProvider     = 'openAiCompatible';
        SDK.Memory_Config.data.openAiCompatible.host           = 'http://127.0.0.1:1234';
        SDK.Memory_Config.data.openAiCompatible.model          = 'gemma-4-31b-it';
        SDK.Memory_Config.data.openAiCompatible.embeddingModel = 'text-embedding-qwen3-embedding-8b';
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
                const hasGemma4 = data.data?.some(m => m.id.includes('gemma-4'));
                if (hasGemma4) {
                    localModelActive = true;
                }
            }
        } catch (e) {
            console.log('[Playwright] openAiCompatible daemon not reachable, skipping active test logic.');
        }
    });

    test.afterAll(async () => {
        const { cleanupChromaManager } = await import('./util.mjs');
        await cleanupChromaManager(SDK);
        if (dummySessionId && localModelActive) {
            console.log(`[Cleanup] Deleted dummy Chroma collections for session ${dummySessionId}.`);
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
        const hugeString = new Array(15000).fill('A').join('');
        turns.push({
            prompt  : "Can a massive block of text be evaluated without crashing?",
            thought : "We need to ensure map-reduce is gone and flash attention handles 15k chars.",
            response: hugeString,
            agent   : "developer",
            model   : "gemini-3.1-pro"
        });

        // Ensure database is ready before adding memories
        await SDK.Memory_ChromaManager.ready();

        const seededIds = [];
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
            } else {
                seededIds.push(addResult.id);
            }
        }

        // Flush the WAL-pending records through the daemon drain path so the summarization
        // read sees every turn.
        await drainMemoryWal({SDK, ids: seededIds});

        console.log(`[Playwright] Injected 5 dummy turns via SDK. Triggering Memory_SessionService.summarizeSession...`);
        const startTime = Date.now();

        // This invokes local Gemma 4
        const result = await SDK.Memory_SessionService.summarizeSession(dummySessionId);

        console.log(`[Playwright] Summarization complete! Took ${Math.round((Date.now() - startTime) / 1000)}s`);
        console.log('Summarization Result:', result);

        expect(result).not.toBeNull();
        expect(result.sessionId).toBe(dummySessionId);
        expect(result.memoryCount).toBe(6);
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

    test('SessionService correctly processes massive session histories natively without map-reduce', async () => {
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

        const bigAdd = await SDK.Memory_Service.addMemory({
            prompt   : "Massive text request",
            thought  : "Thinking deeply...",
            response : hugeString,
            agent    : "developer",
            model    : "gemini-3.1-pro",
            sessionId: bigDummySessionId
        });

        // Flush the WAL-pending record through the daemon drain path so the summarization
        // read sees the turn.
        await drainMemoryWal({SDK, ids: [bigAdd.id]});

        // Mock the model.generateContent to avoid actual LLM calls and verify the exact prompt content
        const originalGenerateContent = SDK.Memory_SessionService.model ? SDK.Memory_SessionService.model.generateContent : null;
        let capturedPrompts = [];

        SDK.Memory_SessionService.model = {
            generateContent: async (prompt) => {
                capturedPrompts.push(prompt);

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
                            decisionList       : ["bypassed map reduce natively"]
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

        // Verify ONLY ONE generation payload happened
        expect(capturedPrompts.length).toBe(1);

        // Output should be massive implicitly mapped correctly
        const finalPrompt = capturedPrompts[0];
        expect(finalPrompt.length).toBeGreaterThan(20000);
    });

    test('SessionService routes Qwen3 summaries through the OpenAiCompatible provider class', async () => {
        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();
        await SDK.Memory_ChromaManager.ready();

        const OpenAiCompatibleProvider = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        const qwenSessionId = crypto.randomUUID();
        const originalProviderConfig = {
            apiKey       : SDK.Memory_Config.data.openAiCompatible.apiKey,
            host         : SDK.Memory_Config.data.openAiCompatible.host,
            model        : SDK.Memory_Config.data.openAiCompatible.model,
            modelProvider: SDK.Memory_Config.data.modelProvider
        };
        const originalGenerate = OpenAiCompatibleProvider.prototype.generate;
        let capturedPrompt = '';
        let capturedProviderConfig = null;

        try {
            SDK.Memory_Config.data.modelProvider = 'openAiCompatible';
            SDK.Memory_Config.data.openAiCompatible.apiKey = 'qwen-secret';
            SDK.Memory_Config.data.openAiCompatible.host = 'http://127.0.0.1:11434';
            SDK.Memory_Config.data.openAiCompatible.model = 'qwen3-8b';

            OpenAiCompatibleProvider.prototype.generate = async function(prompt) {
                capturedPrompt = prompt;
                capturedProviderConfig = {
                    apiKey   : this.apiKey,
                    host     : this.host,
                    modelName: this.modelName
                };

                return {
                    content: JSON.stringify({
                        title              : "Qwen3 Summary",
                        summary            : "Validated local chat summarization through an OpenAI-compatible Qwen3 model.",
                        category           : "feature",
                        quality            : 90,
                        productivity       : 90,
                        impact             : 60,
                        complexity         : 30,
                        technologies       : ["neo.mjs", "memory-core", "qwen3"],
                        participatingAgents: ["developer"],
                        models             : ["qwen3-8b"]
                    })
                };
            };

            const qwenAdd = await SDK.Memory_Service.addMemory({
                prompt   : "Validate Qwen3 chat summarization",
                thought  : "Exercise the local OpenAI-compatible chat summary path.",
                response : "The summary should preserve structured metadata.",
                agent    : "developer",
                model    : "qwen3-8b",
                sessionId: qwenSessionId
            });

            // Flush the WAL-pending record through the daemon drain path so the summarization
            // read sees the turn.
            await drainMemoryWal({SDK, ids: [qwenAdd.id]});

            const result = await SDK.Memory_SessionService.summarizeSession(qwenSessionId);

            expect(capturedProviderConfig).toEqual({
                apiKey   : 'qwen-secret',
                host     : 'http://127.0.0.1:11434',
                modelName: 'qwen3-8b'
            });
            expect(capturedPrompt).toContain("Validate Qwen3 chat summarization");
            expect(result).not.toBeNull();
            expect(result.sessionId).toBe(qwenSessionId);
            expect(result.memoryCount).toBe(1);

            const summaryCollection = await SDK.Memory_ChromaManager.getSummaryCollection();
            const savedSummary = await summaryCollection.get({
                ids    : [result.summaryId],
                include: ['metadatas', 'documents']
            });

            expect(savedSummary.ids.length).toBe(1);
            expect(savedSummary.documents[0]).toContain("OpenAI-compatible Qwen3 model");
            expect(savedSummary.metadatas[0].title).toBe("Qwen3 Summary");
            expect(savedSummary.metadatas[0].models).toContain("qwen3-8b");
        } finally {
            OpenAiCompatibleProvider.prototype.generate = originalGenerate;
            SDK.Memory_Config.data.modelProvider = originalProviderConfig.modelProvider;
            SDK.Memory_Config.data.openAiCompatible.apiKey = originalProviderConfig.apiKey;
            SDK.Memory_Config.data.openAiCompatible.host = originalProviderConfig.host;
            SDK.Memory_Config.data.openAiCompatible.model = originalProviderConfig.model;
        }
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
            name      : undefined,
            toolAction: undefined,
            content   : massiveToolConfig
        })];

        const toolsAdd = await SDK.Memory_Service.addMemory({
            prompt   : "Massive tools",
            thought  : "Thinking...",
            response : "Done",
            agent    : "developer",
            model    : "gemini-3.1-pro",
            toolsUsed,
            sessionId: dummySessionId
        });

        // Flush the WAL-pending record through the daemon drain path so summarizeSession's
        // Chroma read below sees the just-written memory.
        await drainMemoryWal({SDK, ids: [toolsAdd.id]});

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
        const add1 = await SDK.Memory_Service.addMemory({
            prompt: "Test s1", thought: "T1", response: "R1", agent: "dev", model: "gemini-3.1-pro", sessionId: s1
        });

        await new Promise(r => setTimeout(r, 100)); // Sleep to ensure timestamp difference

        // Memory 2 is middle
        const add2 = await SDK.Memory_Service.addMemory({
            prompt: "Test s2", thought: "T2", response: "R2", agent: "dev", model: "gemini-3.1-pro", sessionId: s2
        });

        await new Promise(r => setTimeout(r, 100)); // Sleep

        // Memory 3 is newest
        const add3 = await SDK.Memory_Service.addMemory({
            prompt: "Test s3", thought: "T3", response: "R3", agent: "dev", model: "gemini-3.1-pro", sessionId: s3
        });

        // Flush the WAL-pending records through the daemon drain path so all three sessions are
        // visible below. (Ordering is unaffected: lastActivity derives from the write-time
        // metadata timestamp.)
        await drainMemoryWal({SDK, ids: [add1.id, add2.id, add3.id]});

        // Use findSessionsToSummarize explicitly. Inject a `now` well past the churn-gate idle window
        // so all three just-written sessions are eligible — this test asserts candidate
        // ORDERING (newest lastActivity first), not the gate's eligibility timing.
        const candidates = await SDK.Memory_SessionService.findSessionsToSummarize({now: Date.now() + 60 * 60 * 1000});

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

    test('SessionService performance: measure latency for 1 session via API', async () => {
        if (!localModelActive) {
            test.skip(true, 'Skipping: openAiCompatible or API not found locally');
            return;
        }

        if (!SDK.Memory_LifecycleService._initPromise) {
            await SDK.Memory_LifecycleService.initAsync();
        } else {
            await SDK.Memory_LifecycleService.ready();
        }
        await SDK.Memory_SessionService.ready();

        const perfSessionId = crypto.randomUUID();
        await SDK.Memory_ChromaManager.ready();

        // Inject 1 typical turn
        const perfAdd = await SDK.Memory_Service.addMemory({
            prompt   : "Quick performance test for remote API generation",
            thought  : "Measuring true API latency, avoiding map-reduce overhead.",
            response : "This is a brief response to establish baseline latency for 1 session generation.",
            agent    : "developer",
            model    : "gemini-3.1-pro",
            sessionId: perfSessionId
        });

        // Flush the WAL-pending record through the daemon drain path BEFORE the measurement
        // window so the summarization latency below stays a pure API measurement.
        await drainMemoryWal({SDK, ids: [perfAdd.id]});

        const start = Date.now();
        const result = await SDK.Memory_SessionService.summarizeSession(perfSessionId);
        const end = Date.now();

        const durationMs = end - start;

        expect(result).not.toBeNull();
        expect(result.sessionId).toBe(perfSessionId);
        expect(durationMs).toBeLessThan(40000);
    });
});
