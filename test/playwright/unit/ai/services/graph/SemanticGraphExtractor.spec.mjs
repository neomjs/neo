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
import {CHROMA_TEST_DATABASE} from '../../../../../../ai/services/shared/vector/chromaTestIsolation.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
} from '../../../../../../ai/services/memory-core/helpers/ConsumerFrictionHelper.mjs';

test.describe('Neo.ai.daemons.services.SemanticGraphExtractor', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService;
    let SemanticGraphExtractor;
    let SystemLifecycleService;
    let OpenAiCompatible;
    let aiConfig;
    let originalChromaDatabase;

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
        originalChromaDatabase        = aiConfig.engines.chroma.database;
        aiConfig.engines.chroma.database = CHROMA_TEST_DATABASE;

        // Graph services dispatch providers through buildGraphProvider. This test
        // stubs OpenAiCompatible.prototype.generate, so force that dispatch path.
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

        if (aiConfig?.engines?.chroma) {
            aiConfig.engines.chroma.database = originalChromaDatabase;
        }
    });

    test('should extract provenance edges and queue unresolved targets to lazy back-fill (#10152)', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

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
                                    justification: "Provenance test"
                                },
                                {
                                    source: "CONCEPT:TestConcept",
                                    target: "SESSION:non-existent-session",
                                    relationship: "DISCUSSED_IN",
                                    weight: 1.0,
                                    justification: "Provenance test 2"
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

        // Check if the lazy queue file was created and contains the edge
        expect(fs.existsSync(lazyQueueFile)).toBe(true);
        const queueContent = fs.readFileSync(lazyQueueFile, 'utf8');
        expect(queueContent).toContain('"relationship":"MENTIONED_IN"');
        expect(queueContent).toContain('"target":"MEMORY:non-existent-memory"');
        expect(queueContent).toContain('"relationship":"DISCUSSED_IN"');
        expect(queueContent).toContain('"target":"SESSION:non-existent-session"');

        // Check if RELATES_TO edge was added to the GraphService (since frontier exists)
        const edges = GraphService.db.edges.items;
        expect(edges.some(e => e.type === 'RELATES_TO' && e.source === 'CONCEPT:TestConcept')).toBe(true);

        // MENTIONED_IN shouldn't be in the DB directly because it targets a non-existent node
        expect(edges.some(e => e.type === 'MENTIONED_IN')).toBe(false);

        // Restore global function
        OpenAiCompatible.prototype.generate = baseGenerate;

        // Cleanup
        if (fs.existsSync(lazyQueueFile)) {
            fs.unlinkSync(lazyQueueFile);
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

    test('detects silent empty-response as context-overflow + aborts retry amplification (#12091)', async () => {
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

    test('uses configured graph-provider model for consumer friction telemetry (#12059)', async () => {
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

    test('preserves small-session single-pass Tri-Vector extraction below the safe processing limit (#12073)', async () => {
        const baseGenerate                          = OpenAiCompatible.prototype.generate;
        const originalGraphProvider                 = aiConfig.graphProvider;
        const originalContextLimitTokens            = aiConfig.localModels.chat.contextLimitTokens;
        const originalSafeProcessingLimitTokens     = aiConfig.localModels.chat.safeProcessingLimitTokens;
        let invocationCount = 0;

        try {
            aiConfig.graphProvider                            = 'openAiCompatible';
            aiConfig.localModels.chat.contextLimitTokens       = 100000;
            aiConfig.localModels.chat.safeProcessingLimitTokens = 100000;

            OpenAiCompatible.prototype.generate = async function() {
                invocationCount++;
                return {
                    content: JSON.stringify({
                        a2a_version: '1.0',
                        agent_id: 'Antigravity',
                        session_artifact: {
                            feature_namespace: null,
                            human_readable_summary: 'Small session summary',
                            roadmap_impact: null,
                            graph: {
                                nodes: [],
                                edges: []
                            }
                        }
                    })
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-small-session-vector-id',
                meta    : {sessionId: 'small-session-single-pass'},
                document: 'Small episodic history.'
            });

            expect(result).not.toBeNull();
            expect(invocationCount).toBe(1);

            const runInfo = SemanticGraphExtractor.getLastTriVectorRunInfo();
            expect(runInfo.status).toBe('completed');
            expect(runInfo.mode).toBe('single-pass');
            expect(runInfo.chunkingActivated).toBe(false);
            expect(runInfo.chunks).toEqual([]);
        } finally {
            aiConfig.graphProvider                            = originalGraphProvider;
            aiConfig.localModels.chat.contextLimitTokens       = originalContextLimitTokens;
            aiConfig.localModels.chat.safeProcessingLimitTokens = originalSafeProcessingLimitTokens;
            OpenAiCompatible.prototype.generate                = baseGenerate;
        }
    });

    test('includes chunk headers in Tri-Vector chunk token estimates (#12073)', () => {
        const systemInstruction = 'Extract graph facts.';
        const turns = [
            'First session turn. '.repeat(180),
            'Second session turn. '.repeat(180)
        ];
        const session = {
            id      : 'mock-header-estimate-vector-id',
            meta    : {sessionId: 'header-estimate-session'},
            document: turns.join('\n\n---\n\n')
        };
        const firstChunk = {
            index    : 0,
            document : turns[0],
            turnStart: 0,
            turnEnd  : 0
        };
        const bothTurnsChunk = {
            index    : 0,
            document : session.document,
            turnStart: 0,
            turnEnd  : 1
        };
        const firstHeaderEstimate = SemanticGraphExtractor.estimateTriVectorPromptTokens(
            systemInstruction,
            SemanticGraphExtractor.buildTriVectorChunkDocument(session, firstChunk, 9999)
        );
        const bothHeaderEstimate = SemanticGraphExtractor.estimateTriVectorPromptTokens(
            systemInstruction,
            SemanticGraphExtractor.buildTriVectorChunkDocument(session, bothTurnsChunk, 9999)
        );
        const safeProcessingLimitTokens = firstHeaderEstimate + 1;

        expect(SemanticGraphExtractor.estimateTriVectorPromptTokens(systemInstruction, session.document)).toBeGreaterThan(safeProcessingLimitTokens);
        expect(bothHeaderEstimate).toBeGreaterThan(safeProcessingLimitTokens);

        const chunks = SemanticGraphExtractor.createTriVectorChunks(session, {
            systemInstruction,
            safeProcessingLimitTokens
        });

        expect(chunks.length).toBe(2);

        const expectedChunkDocument = SemanticGraphExtractor.buildTriVectorChunkDocument(session, chunks[0], 9999);
        const bodyOnlyEstimate = SemanticGraphExtractor.estimateTriVectorPromptTokens(systemInstruction, chunks[0].document);

        expect(chunks[0].inputTokensEstimate).toBe(
            SemanticGraphExtractor.estimateTriVectorPromptTokens(systemInstruction, expectedChunkDocument)
        );
        expect(chunks[0].inputTokensEstimate).toBeGreaterThan(bodyOnlyEstimate);
    });

    test('runs turn-aligned chunks in deterministic order and deduplicates reduce payloads (#12073)', async () => {
        const baseGenerate                          = OpenAiCompatible.prototype.generate;
        const originalCreateTriVectorChunks         = SemanticGraphExtractor.createTriVectorChunks;
        const originalGraphProvider                 = aiConfig.graphProvider;
        const originalContextLimitTokens            = aiConfig.localModels.chat.contextLimitTokens;
        const originalSafeProcessingLimitTokens     = aiConfig.localModels.chat.safeProcessingLimitTokens;
        const prompts = [];
        const chunks = [
            {
                id                 : 'chunked-session:chunk:0',
                index              : 0,
                document           : 'Turn A',
                inputTokensEstimate: 20,
                turnStart          : 0,
                turnEnd            : 0
            },
            {
                id                 : 'chunked-session:chunk:1',
                index              : 1,
                document           : 'Turn B',
                inputTokensEstimate: 20,
                turnStart          : 1,
                turnEnd            : 1
            }
        ];

        try {
            aiConfig.graphProvider                            = 'openAiCompatible';
            aiConfig.localModels.chat.contextLimitTokens       = 100000;
            aiConfig.localModels.chat.safeProcessingLimitTokens = 100000;
            SemanticGraphExtractor.createTriVectorChunks        = () => chunks;

            OpenAiCompatible.prototype.generate = async function(messages) {
                const userPrompt = messages.find(item => item.role === 'user')?.content || '';
                prompts.push(userPrompt);

                const isSecondChunk = userPrompt.includes('Chunk 2/2');
                return {
                    content: JSON.stringify({
                        a2a_version: '1.0',
                        agent_id: 'Antigravity',
                        session_artifact: {
                            feature_namespace: 'Neo.ai.services.graph.SemanticGraphExtractor',
                            human_readable_summary: isSecondChunk ? 'Second chunk summary.' : 'First chunk summary.',
                            roadmap_impact: null,
                            graph: {
                                nodes: [
                                    {
                                        id: isSecondChunk ? 'CONCEPT:SharedConceptDuplicate' : 'CONCEPT:SharedConcept',
                                        type: 'CONCEPT',
                                        name: 'Shared Concept',
                                        description: 'Repeated across chunks',
                                        confidence: isSecondChunk ? 0.8 : 0.7,
                                        tags: isSecondChunk ? ['second'] : ['first']
                                    }
                                ],
                                edges: [
                                    {
                                        source: isSecondChunk ? 'CONCEPT:SharedConceptDuplicate' : 'CONCEPT:SharedConcept',
                                        target: 'frontier',
                                        relationship: 'RELATES_TO',
                                        weight: isSecondChunk ? 0.9 : 0.6,
                                        justification: 'Chunk evidence'
                                    }
                                ]
                            }
                        }
                    })
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-chunked-session-vector-id',
                meta    : {sessionId: 'chunked-session'},
                document: 'Turn A\n\n---\n\nTurn B'
            });

            expect(result).not.toBeNull();
            expect(prompts).toHaveLength(2);
            expect(prompts[0]).toContain('Chunk 1/2');
            expect(prompts[1]).toContain('Chunk 2/2');

            const artifact = result.session_artifact;
            expect(artifact.chunking.activated).toBe(true);
            expect(artifact.chunking.chunks.map(item => item.id)).toEqual([
                'chunked-session:chunk:0',
                'chunked-session:chunk:1'
            ]);
            expect(artifact.graph.nodes).toHaveLength(1);
            expect(artifact.graph.nodes[0].id).toBe('CONCEPT:SharedConcept');
            expect(artifact.graph.nodes[0].tags).toEqual(['first', 'second']);
            expect(artifact.graph.nodes[0].confidence).toBe(0.8);
            expect(artifact.graph.edges).toHaveLength(1);
            expect(artifact.graph.edges[0].source).toBe('CONCEPT:SharedConcept');
            expect(artifact.graph.edges[0].chunkSources).toEqual([
                'chunked-session:chunk:0',
                'chunked-session:chunk:1'
            ]);

            const runInfo = SemanticGraphExtractor.getLastTriVectorRunInfo();
            expect(runInfo.status).toBe('completed');
            expect(runInfo.mode).toBe('chunked');
            expect(runInfo.chunkingActivated).toBe(true);
            expect(runInfo.attempts).toBe(2);
            expect(runInfo.chunks.map(item => item.id)).toEqual([
                'chunked-session:chunk:0',
                'chunked-session:chunk:1'
            ]);
        } finally {
            aiConfig.graphProvider                            = originalGraphProvider;
            aiConfig.localModels.chat.contextLimitTokens       = originalContextLimitTokens;
            aiConfig.localModels.chat.safeProcessingLimitTokens = originalSafeProcessingLimitTokens;
            SemanticGraphExtractor.createTriVectorChunks        = originalCreateTriVectorChunks;
            OpenAiCompatible.prototype.generate                = baseGenerate;
        }
    });

    test('records failed chunk metadata without committing a partial reduce payload (#12073)', async () => {
        const baseGenerate                          = OpenAiCompatible.prototype.generate;
        const originalCreateTriVectorChunks         = SemanticGraphExtractor.createTriVectorChunks;
        const originalGraphProvider                 = aiConfig.graphProvider;
        const originalContextLimitTokens            = aiConfig.localModels.chat.contextLimitTokens;
        const originalSafeProcessingLimitTokens     = aiConfig.localModels.chat.safeProcessingLimitTokens;
        const chunks = [
            {
                id                 : 'failed-chunk-session:chunk:0',
                index              : 0,
                document           : 'Turn A',
                inputTokensEstimate: 20,
                turnStart          : 0,
                turnEnd            : 0
            },
            {
                id                 : 'failed-chunk-session:chunk:1',
                index              : 1,
                document           : 'Turn B',
                inputTokensEstimate: 20,
                turnStart          : 1,
                turnEnd            : 1
            }
        ];

        try {
            clearAggregatedFrictions();

            aiConfig.graphProvider                            = 'openAiCompatible';
            aiConfig.localModels.chat.contextLimitTokens       = 100000;
            aiConfig.localModels.chat.safeProcessingLimitTokens = 100000;
            SemanticGraphExtractor.createTriVectorChunks        = () => chunks;

            OpenAiCompatible.prototype.generate = async function(messages) {
                const userPrompt = messages.find(item => item.role === 'user')?.content || '';

                if (userPrompt.includes('Chunk 2/2')) {
                    return {content: ''};
                }

                return {
                    content: JSON.stringify({
                        a2a_version: '1.0',
                        agent_id: 'Antigravity',
                        session_artifact: {
                            feature_namespace: null,
                            human_readable_summary: 'First chunk summary.',
                            roadmap_impact: null,
                            graph: {
                                nodes: [],
                                edges: []
                            }
                        }
                    })
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-failed-chunk-vector-id',
                meta    : {sessionId: 'failed-chunk-session'},
                document: 'Turn A\n\n---\n\nTurn B'
            });

            expect(result).toBeNull();

            const runInfo = SemanticGraphExtractor.getLastTriVectorRunInfo();
            expect(runInfo.status).toBe('failed');
            expect(runInfo.mode).toBe('chunked');
            expect(runInfo.failureReason).toBe('tri-vector chunk extraction returned null');
            expect(runInfo.failures).toEqual([{
                chunkId: 'failed-chunk-session:chunk:1',
                chunkIndex: 1,
                reason: 'tri-vector chunk extraction returned null'
            }]);
        } finally {
            aiConfig.graphProvider                            = originalGraphProvider;
            aiConfig.localModels.chat.contextLimitTokens       = originalContextLimitTokens;
            aiConfig.localModels.chat.safeProcessingLimitTokens = originalSafeProcessingLimitTokens;
            SemanticGraphExtractor.createTriVectorChunks        = originalCreateTriVectorChunks;
            OpenAiCompatible.prototype.generate                = baseGenerate;
            clearAggregatedFrictions();
        }
    });
});
