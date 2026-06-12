import {setup} from '../../../../setup.mjs';

const appName = 'SemanticGraphExtractorTest';

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
import fs             from 'fs';
import path           from 'path';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
} from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';

test.describe('Neo.ai.daemons.services.SemanticGraphExtractor', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService;
    let SemanticGraphExtractor;
    let SystemLifecycleService;
    let OpenAiCompatible;
    let aiConfig;

    const testDbName = `memory-core-semantic-extractor-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph   = testDbPath;
        aiConfig.lazyEdgesQueuePath   = path.join(tmpDir, `lazy-edges-${process.pid}-${Date.now()}.jsonl`);
        aiConfig.autoIngestFileSystem = false;

        // Graph services dispatch through buildGraphProvider using the configured
        // modelProvider. This test stubs OpenAiCompatible.prototype.generate, so
        // force that dispatch path for deterministic provider mocking.
        aiConfig.modelProvider = 'openAiCompatible';

        GraphService           = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        SemanticGraphExtractor = (await import('../../../../../../ai/services/graph/SemanticGraphExtractor.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        OpenAiCompatible       = (await import('../../../../../../ai/provider/OpenAiCompatible.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (!SystemLifecycleService._initPromise) {
            await SystemLifecycleService.initAsync();
        } else {
            await SystemLifecycleService.ready();
        }
    });

    test.beforeEach(() => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterEach(() => {
        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
            if (GraphService.db.storage?.db) {
                GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(async () => {
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');
    });

    test('Sub 9 hypothesis 12: provenance Memory/Session edges are lazy-queued, not silently culled (#12617, #10172)', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

        try {
            OpenAiCompatible.prototype.generate = async function(messages) {
                return {
                    content: JSON.stringify({
                        a2a_version: "1.0",
                        agent_id: "Antigravity",
                        session_artifact: {
                            graph: {
                                nodes: [
                                    {
                                        id: "CONCEPT:TestConcept",
                                        type: "CONCEPT",
                                        name: "TestConcept",
                                        description: "Test concept for provenance edges"
                                    }
                                ],
                                edges: [
                                    {
                                        source: "CONCEPT:TestConcept",
                                        target: "MEMORY:non-existent-memory",
                                        relationship: "MENTIONED_IN",
                                        weight: 1.0,
                                        justification: "Uppercase compatibility provenance test"
                                    },
                                    {
                                        source: "CONCEPT:TestConcept",
                                        target: "session:non-existent-session",
                                        relationship: "DISCUSSED_IN",
                                        weight: 1.0,
                                        justification: "Canonical lowercase provenance test"
                                    },
                                    {
                                        source: "CONCEPT:TestConcept",
                                        target: "frontier",
                                        relationship: "RELATES_TO"
                                    }
                                ]
                            }
                        }
                    })
                };
            };

            const session = {
                id: 'mock-semantic-vector-id',
                meta: { sessionId: 'playwright-provenance-test' },
                document: "Mock episodic history for provenance"
            };

            const lazyQueueFile = aiConfig.lazyEdgesQueuePath;
            if (fs.existsSync(lazyQueueFile)) {
                fs.unlinkSync(lazyQueueFile);
            }

            const result = await SemanticGraphExtractor.executeTriVectorExtraction(session);

            expect(result).not.toBeNull();
            expect(result.session_artifact.graph.edges.length).toBe(3);

            // Check if the lazy queue file was created and contains canonical endpoints.
            expect(fs.existsSync(lazyQueueFile)).toBe(true);
            const queueContent = fs.readFileSync(lazyQueueFile, 'utf8');
            expect(queueContent).toContain('"relationship":"MENTIONED_IN"');
            expect(queueContent).toContain('"target":"memory:non-existent-memory"');
            expect(queueContent).toContain('"relationship":"DISCUSSED_IN"');
            expect(queueContent).toContain('"target":"session:non-existent-session"');
            expect(queueContent).not.toContain('"target":"MEMORY:non-existent-memory"');
            expect(queueContent).not.toContain('"target":"SESSION:non-existent-session"');

            // Check if RELATES_TO edge was added to the GraphService (since frontier exists)
            const edges = GraphService.db.edges.items;
            expect(edges.some(e => e.type === 'RELATES_TO' && e.source === 'CONCEPT:TestConcept')).toBe(true);

            // MENTIONED_IN shouldn't be in the DB directly because it targets a non-existent node
            expect(edges.some(e => e.type === 'MENTIONED_IN')).toBe(false);

            // Cleanup
            if (fs.existsSync(lazyQueueFile)) {
                fs.unlinkSync(lazyQueueFile);
            }
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
        }
    });
    test('should extract concepts from message bodies', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

        try {
            OpenAiCompatible.prototype.generate = async function(messages) {
                return {
                    content: JSON.stringify({
                        concepts: [
                            "CONCEPT:mailbox-service",
                            "CLASS:Neo.ai.services.memory-core.MailboxService",
                            "invalid-concept", // should be filtered out
                            "CONCEPT:auto-emit"
                        ]
                    })
                };
            };

            const result = await SemanticGraphExtractor.extractMessageConcepts("Let's add auto-emit to MailboxService");

            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3);
            expect(result).toContain("CONCEPT:mailbox-service");
            expect(result).toContain("CLASS:Neo.ai.services.memory-core.MailboxService");
            expect(result).toContain("CONCEPT:auto-emit");
            expect(result).not.toContain("invalid-concept"); // properly filtered
        } finally {
            // Restore global function
            OpenAiCompatible.prototype.generate = baseGenerate;
        }
    });

    test('should handle API failure gracefully during message concept extraction', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

        try {
            OpenAiCompatible.prototype.generate = async function(messages) {
                throw new Error("fetch failed");
            };

            const result = await SemanticGraphExtractor.extractMessageConcepts("Test body");

            expect(result).not.toBeNull();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        } finally {
            // Restore global function
            OpenAiCompatible.prototype.generate = baseGenerate;
        }
    });

    test('should handle missing or malformed graph nodes/edges gracefully', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

        try {
            // Case 1: graph missing nodes and edges entirely
            OpenAiCompatible.prototype.generate = async function(messages) {
                return {
                    content: JSON.stringify({
                        a2a_version: "1.0",
                        agent_id: "Antigravity",
                        session_artifact: {
                            graph: {}
                        }
                    })
                };
            };

            let result = await SemanticGraphExtractor.executeTriVectorExtraction({ id: 'mock-1', meta: { sessionId: 'mock-session-1' }, document: 'test' });
            expect(result.session_artifact.graph.nodes).toEqual([]);
            expect(result.session_artifact.graph.edges).toEqual([]);

            // Case 2: graph nodes and edges are truthy non-arrays (e.g., objects)
            OpenAiCompatible.prototype.generate = async function(messages) {
                return {
                    content: JSON.stringify({
                        a2a_version: "1.0",
                        agent_id: "Antigravity",
                        session_artifact: {
                            graph: {
                                nodes: { someObject: true },
                                edges: "this is not an array"
                            }
                        }
                    })
                };
            };

            result = await SemanticGraphExtractor.executeTriVectorExtraction({ id: 'mock-2', meta: { sessionId: 'mock-session-2' }, document: 'test' });
            expect(result.session_artifact.graph.nodes).toEqual([]);
            expect(result.session_artifact.graph.edges).toEqual([]);

        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
        }
    });

    test('Sub 9 hypotheses 9 and 11: empty-response overflow records friction and aborts retry amplification (#12617, #12091)', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;
        let invocationCount = 0;

        try {
            clearAggregatedFrictions();

            // Stub provider to return empty content (LM Studio silent-overflow signature:
            // stream opens and closes immediately with no body, no thrown error).
            OpenAiCompatible.prototype.generate = async function(messages) {
                invocationCount++;
                return {content: ''};
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-empty-response-vector-id',
                meta    : {sessionId: 'empty-response-overflow-session'},
                document: 'Mock episodic history for silent empty-response detection.'
            });

            // AC4: returns null (no retry-loop amplification)
            expect(result).toBeNull();

            // AC6 (e): retry loop did NOT fire — single invocation only
            expect(invocationCount).toBe(1);

            const frictions = getAggregatedFrictions();
            const friction  = frictions.find(item => item.assetRef === 'empty-response-overflow-session');

            // AC2: emits via existing primitive — no new symptom enum entry needed
            expect(friction).toBeDefined();
            expect(friction.symptom).toBe('context-overflow');

            // AC3: note carries empty-response-specific diagnostic
            expect(friction.note).toContain('Silent empty-response from provider');
            expect(friction.note).toContain('Prompt chars:');

            // AC6 (e): deterministic-symptom auto-surface (no 3-emission threshold)
            const aggregated = frictions.find(item => item.assetRef === 'empty-response-overflow-session');
            expect(aggregated).toBeDefined();
            expect(aggregated.count).toBe(1);

            // Suggestion derived from existing primitive map: context-overflow → compress-payload
            expect(friction.suggestionKind).toBe('compress-payload');
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            clearAggregatedFrictions();
        }
    });

    test('Sub 9 hypotheses 2, 8, 9: guardrail telemetry uses configured graph-provider model (#12617, #12059)', async () => {
        const originalGraphProvider                  = aiConfig.graphProvider;
        const originalOllamaModel                    = aiConfig.ollama?.model;
        const originalContextLimitTokens             = aiConfig.localModels.chat.contextLimitTokens;
        const originalSafeProcessingLimitTokens      = aiConfig.localModels.chat.safeProcessingLimitTokens;

        try {
            clearAggregatedFrictions();

            aiConfig.graphProvider                             = 'ollama';
            aiConfig.ollama.model                              = 'gemma4-real-model';
            aiConfig.localModels.chat.contextLimitTokens        = 8;
            aiConfig.localModels.chat.safeProcessingLimitTokens = 1;

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-consumer-model-vector-id',
                meta    : {sessionId: 'consumer-model-telemetry-session'},
                document: 'Force guardrail pre-check so provider.generate is never invoked.'
            });

            expect(result).toBeNull();

            const frictions = getAggregatedFrictions();
            const friction  = frictions.find(item => item.assetRef === 'consumer-model-telemetry-session');

            expect(friction).toBeDefined();
            expect(friction.model).toBe('gemma4-real-model');
            expect(friction.model).not.toBe('ollama');
        } finally {
            aiConfig.graphProvider                             = originalGraphProvider;
            aiConfig.ollama.model                              = originalOllamaModel;
            aiConfig.localModels.chat.contextLimitTokens        = originalContextLimitTokens;
            aiConfig.localModels.chat.safeProcessingLimitTokens = originalSafeProcessingLimitTokens;
            clearAggregatedFrictions();
        }
    });
});
