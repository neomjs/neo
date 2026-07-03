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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';
import fs                    from 'fs';
import path                  from 'path';
import {TestLifecycleHelper} from '../../services/memory-core/util.mjs';
import {
    clearAggregatedFrictions,
    getAggregatedFrictions
} from '../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs';
import {readActiveRemCallState} from '../../../../../../ai/services/memory-core/helpers/remRunStateStore.mjs';

test.describe('Neo.ai.daemons.services.SemanticGraphExtractor', () => {
    test.describe.configure({mode: 'serial'});

    let GraphService;
    let SemanticGraphExtractor;
    let SystemLifecycleService;
    let OpenAiCompatible;
    let rootAiConfig;
    let aiConfig;
    let suiteOverrides;

    const ENV = {
        CHAT_CONTEXT_LIMIT_TOKENS        : 'NEO_LOCAL_MODELS_CHAT_CONTEXT_LIMIT_TOKENS',
        CHAT_SAFE_PROCESSING_LIMIT_TOKENS: 'NEO_LOCAL_MODELS_CHAT_SAFE_PROCESSING_LIMIT_TOKENS',
        GRAPH_CHUNK_LIMIT_TOKENS         : 'NEO_LOCAL_MODELS_CHAT_GRAPH_CHUNK_LIMIT_TOKENS',
        GRAPH_OUTPUT_LIMIT_TOKENS        : 'NEO_LOCAL_MODELS_CHAT_GRAPH_OUTPUT_LIMIT_TOKENS',
        GRAPH_PROVIDER                   : 'NEO_GRAPH_PROVIDER',
        LAZY_EDGES_QUEUE_PATH            : 'NEO_LAZY_EDGES_QUEUE_PATH',
        MEMORY_DB_PATH_TEST              : 'NEO_MEMORY_DB_PATH_TEST',
        MODEL_PROVIDER                   : 'NEO_MODEL_PROVIDER',
        OLLAMA_MODEL                     : 'NEO_OLLAMA_MODEL',
        REM_RUN_STATE_DIR                : 'NEO_REM_RUN_STATE_DIR',
        UNIT_TEST_MODE                   : 'UNIT_TEST_MODE'
    };

    const memoryCoreEnvNames = new Set([
        ENV.LAZY_EDGES_QUEUE_PATH,
        ENV.MEMORY_DB_PATH_TEST,
        ENV.REM_RUN_STATE_DIR,
        ENV.UNIT_TEST_MODE
    ]);

    const setConfigOverrides = overrides => {
        for (const [envName, value] of Object.entries(overrides)) {
            const config = memoryCoreEnvNames.has(envName) ? aiConfig : rootAiConfig;
            config.setEnvOverride(envName, value);
        }
    };

    const testDbName = `memory-core-semantic-extractor-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        rootAiConfig = (await import('../../../../../../ai/config.mjs')).default;
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, {recursive: true});
        }
        testDbPath = path.join(tmpDir, testDbName);
        suiteOverrides = {
            [ENV.MEMORY_DB_PATH_TEST]  : aiConfig.storagePaths.graphTest,
            [ENV.LAZY_EDGES_QUEUE_PATH]: aiConfig.lazyEdgesQueuePath,
            [ENV.UNIT_TEST_MODE]       : aiConfig.storagePaths.useTestDatabase,
            [ENV.MODEL_PROVIDER]       : aiConfig.modelProvider
        };

        setConfigOverrides({
            [ENV.MEMORY_DB_PATH_TEST]  : testDbPath,
            [ENV.LAZY_EDGES_QUEUE_PATH]: path.join(tmpDir, `lazy-edges-${process.pid}-${Date.now()}.jsonl`),
            [ENV.UNIT_TEST_MODE]       : true
        });

        // Graph services dispatch through buildGraphProvider using the configured
        // modelProvider. This test stubs OpenAiCompatible.prototype.generate, so
        // force that dispatch path for deterministic provider mocking.
        setConfigOverrides({[ENV.MODEL_PROVIDER]: 'openAiCompatible'});

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
        if (suiteOverrides) {
            setConfigOverrides(suiteOverrides);
        }
    });

    test('Sub 9 hypothesis 12: provenance Memory/Session edges are lazy-queued, not silently culled (#12617, #10172)', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;

        try {
            OpenAiCompatible.prototype.generate = async function(messages) {
                return {
                    content: JSON.stringify({
                        a2a_version     : "1.0",
                        agent_id        : "Antigravity",
                        session_artifact: {
                            graph: {
                                nodes: [
                                    {
                                        id         : "CONCEPT:TestConcept",
                                        type       : "CONCEPT",
                                        name       : "TestConcept",
                                        description: "Test concept for provenance edges"
                                    }
                                ],
                                edges: [
                                    {
                                        source       : "CONCEPT:TestConcept",
                                        target       : "MEMORY:non-existent-memory",
                                        relationship : "MENTIONED_IN",
                                        weight       : 1.0,
                                        justification: "Uppercase compatibility provenance test"
                                    },
                                    {
                                        source       : "CONCEPT:TestConcept",
                                        target       : "session:non-existent-session",
                                        relationship : "DISCUSSED_IN",
                                        weight       : 1.0,
                                        justification: "Canonical lowercase provenance test"
                                    },
                                    {
                                        source      : "CONCEPT:TestConcept",
                                        target      : "frontier",
                                        relationship: "RELATES_TO"
                                    }
                                ]
                            }
                        }
                    })
                };
            };

            const session = {
                id      : 'mock-semantic-vector-id',
                meta    : { sessionId: 'playwright-provenance-test' },
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
            expect(edges.some(e => e.type === 'RELATES_TO' && e.source === 'test-concept')).toBe(true);

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
            expect(result).toContain("mailbox-service");
            expect(result).toContain("neo-ai-services-memory-core-mailbox-service");
            expect(result).toContain("auto-emit");
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
                        a2a_version     : "1.0",
                        agent_id        : "Antigravity",
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
                        a2a_version     : "1.0",
                        agent_id        : "Antigravity",
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
        const baseGenerate    = OpenAiCompatible.prototype.generate;
        let   invocationCount = 0;

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

            // AC4: returns a typed failure descriptor (no retry-loop amplification)
            expect(result).toMatchObject({
                ok                : false,
                deferReason       : 'under-band-choke',
                frictionSymptom   : 'context-overflow',
                terminalForCadence: true
            });

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

    test('truncated non-empty tri-vector output records friction and aborts repair amplification (#13918)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        let invocationCount = 0;

        try {
            clearAggregatedFrictions();

            setConfigOverrides({
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 50000
            });

            OpenAiCompatible.prototype.generate = async function(messages) {
                invocationCount++;

                return {
                    content      : '{"a2a_version":"1.0","session_artifact":',
                    finish_reason: 'length'
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-truncated-response-vector-id',
                meta    : {sessionId: 'truncated-response-overflow-session'},
                document: 'Mock episodic history for truncated non-empty response detection.'
            });

            expect(result).toMatchObject({
                ok                : false,
                deferReason       : 'under-band-choke',
                frictionSymptom   : 'context-overflow',
                terminalForCadence: true,
                evidence          : {finishReason: 'length'}
            });
            expect(invocationCount).toBe(1);

            const frictions = getAggregatedFrictions();
            const friction  = frictions.find(item => item.assetRef === 'truncated-response-overflow-session');

            expect(friction).toBeDefined();
            expect(friction.symptom).toBe('context-overflow');
            expect(friction.note).toContain("finish_reason='length'");
            expect(friction.note).toContain('Aborting repair loop');
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
            clearAggregatedFrictions();
        }
    });

    test('REM marathon raw-turn path exposes active diagnostics and output budget before provider return (#13984)', async () => {
        const originalOverrides = {
                  [ENV.GRAPH_PROVIDER]   : aiConfig.graphProvider,
                  [ENV.REM_RUN_STATE_DIR]: aiConfig.remRunStateDir
              },
              expectedContextLimitTokens   = aiConfig.localModels.chat.contextLimitTokens,
              expectedSafeProcessingTokens = aiConfig.localModels.chat.safeProcessingLimitTokens,
              expectedGraphOutputLimit     = aiConfig.localModels.chat.graphOutputLimitTokens,
              expectedGraphModel           = aiConfig.openAiCompatible.model,
              baseGenerate                 = OpenAiCompatible.prototype.generate,
              remRunStateDir                = path.resolve(process.cwd(), 'tmp', `active-rem-call-${process.pid}-${Date.now()}`),
              turnDocuments                 = Array.from(
                  {length: 192},
                  (_, index) => `raw-turn-${index}\n${'x'.repeat(3500)}`
              );

        let activeOnDiskAfterCall, result;
        const providerCalls = [];

        try {
            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]   : 'openAiCompatible',
                [ENV.REM_RUN_STATE_DIR]: remRunStateDir
            });

            OpenAiCompatible.prototype.generate = async function(messages, options) {
                const activeDuringCall       = {...SemanticGraphExtractor.activeTriVectorCall},
                      activeOnDiskDuringCall = await readActiveRemCallState({dir: remRunStateDir});

                providerCalls.push({messages, options, activeDuringCall, activeOnDiskDuringCall});

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : 'Neo.ai.REM',
                            human_readable_summary: `bounded raw-turn chunk ${providerCalls.length}`,
                            graph                 : {nodes: [], edges: []}
                        }
                    })
                };
            };

            result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-marathon-rem-vector-id',
                meta    : {sessionId: '2d993feb-ea2f-4468-8fbd-c53e62365f4d'},
                document: turnDocuments.join('\n\n---\n\n'),
                turnDocuments
            });
            activeOnDiskAfterCall = await readActiveRemCallState({dir: remRunStateDir});
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
            fs.rmSync(remRunStateDir, {recursive: true, force: true});
        }

        expect(providerCalls.length).toBeGreaterThan(1);
        expect(result.session_artifact.chunking.chunked).toBe(true);
        expect(result.session_artifact.chunking.chunks.length).toBe(providerCalls.length);
        expect(result.session_artifact.chunking.chunks.flatMap(chunk => chunk.turnIndices).length).toBe(turnDocuments.length);

        const secondCall = providerCalls[1] || providerCalls[0];

        expect(secondCall.options).toMatchObject({
            maxCompletionTokens: expectedGraphOutputLimit,
            operationLabel     : expect.stringContaining('2d993feb-ea2f-4468-8fbd-c53e62365f4d')
        });
        expect(secondCall.activeDuringCall).toMatchObject({
            phase                    : 'triVector',
            sessionId                : '2d993feb-ea2f-4468-8fbd-c53e62365f4d',
            assetRef                 : expect.stringContaining(':chunk:'),
            chunkIndex               : secondCall.activeDuringCall.chunkIndex,
            chunkCount               : providerCalls.length,
            turnIndices              : expect.any(Array),
            chunkTokens              : expect.any(Number),
            provider                 : 'openAiCompatible',
            model                    : expectedGraphModel,
            outputLimitTokens        : expectedGraphOutputLimit,
            contextLimitTokens       : expectedContextLimitTokens,
            safeProcessingLimitTokens: expectedSafeProcessingTokens
        });
        expect(secondCall.activeOnDiskDuringCall).toMatchObject(secondCall.activeDuringCall);
        expect(secondCall.activeDuringCall.promptTokensEstimate).toBeGreaterThan(0);
        expect(secondCall.activeDuringCall.promptPlusOutputTokens).toBeLessThanOrEqual(expectedContextLimitTokens);
        expect(secondCall.activeDuringCall.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(SemanticGraphExtractor.activeTriVectorCall).toBeNull();
        expect(activeOnDiskAfterCall).toBeNull();
    });

    test('REM provider diagnostics fingerprint each request without cross-session payload bleed (#13994)', async () => {
        const originalOverrides = {
                  [ENV.GRAPH_PROVIDER]: aiConfig.graphProvider
              },
              baseGenerate      = OpenAiCompatible.prototype.generate,
              firstNeedle       = 'FIRST_SESSION_13994_UNIQUE_PAYLOAD_NEEDLE',
              secondNeedle      = 'SECOND_SESSION_13994_UNIQUE_PAYLOAD_NEEDLE',
              providerCalls     = [];

        try {
            setConfigOverrides({[ENV.GRAPH_PROVIDER]: 'openAiCompatible'});

            OpenAiCompatible.prototype.generate = async function(messages) {
                providerCalls.push({
                    messages: messages.map(message => ({...message})),
                    active  : {...SemanticGraphExtractor.activeTriVectorCall}
                });

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : 'Neo.ai.REM',
                            human_readable_summary: `fingerprinted request ${providerCalls.length}`,
                            graph                 : {nodes: [], edges: []}
                        }
                    })
                };
            };

            await SemanticGraphExtractor.executeTriVectorExtraction({
                id  : 'mock-first-fingerprint-vector-id',
                meta: {sessionId: 'first-fingerprint-session'},
                document: `First session content ${firstNeedle}`
            });
            await SemanticGraphExtractor.executeTriVectorExtraction({
                id  : 'mock-second-fingerprint-vector-id',
                meta: {sessionId: 'second-fingerprint-session'},
                document: `Second session content ${secondNeedle}`
            });
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
        }

        expect(providerCalls.length).toBe(2);

        const firstCall  = providerCalls[0],
              secondCall = providerCalls[1];

        expect(firstCall.messages[1].content).toContain(firstNeedle);
        expect(secondCall.messages[1].content).toContain(secondNeedle);
        expect(secondCall.messages[1].content).not.toContain(firstNeedle);
        expect(secondCall.active).toMatchObject({
            phase              : 'triVector',
            sessionId          : 'second-fingerprint-session',
            requestMessageCount: 2
        });
        expect(secondCall.active.requestMessageFingerprints).toHaveLength(2);
        expect(secondCall.active.requestMessageFingerprints[1]).toMatchObject({
            index              : 1,
            role               : 'user',
            bytes              : Buffer.byteLength(secondCall.messages[1].content, 'utf8'),
            tokensEstimate     : expect.any(Number),
            contentSha256Prefix: expect.stringMatching(/^[a-f0-9]{16}$/)
        });

        const fingerprintPayload = JSON.stringify(secondCall.active.requestMessageFingerprints);
        expect(fingerprintPayload).not.toContain(firstNeedle);
        expect(fingerprintPayload).not.toContain(secondNeedle);
    });

    test('REM parser fails before dispatch when prompt plus output reserve exceeds context (#13984)', async () => {
        let providerCalled = false;

        clearAggregatedFrictions();

        const result = await SemanticGraphExtractor.extractTriVectorPayload({
            session: {
                id  : 'mock-over-budget-rem-vector-id',
                meta: {sessionId: '2d993feb-ea2f-4468-8fbd-c53e62365f4d'}
            },
            document        : 'small document that still breaches the artificial prompt plus output reserve',
            assetRef        : '2d993feb-ea2f-4468-8fbd-c53e62365f4d:chunk:1',
            consumerProvider: 'openAiCompatible',
            provider        : {
                generate: async function() {
                    providerCalled = true;
                    return {content: '{}'};
                }
            },
            consumerModel         : 'google/gemma-4-26b-a4b',
            consumerContextTokens : 20,
            consumerSafeTokens    : 1000,
            graphOutputLimitTokens: 20,
            graphReasoningEffort  : 'none',
            triVectorSchema       : {type: 'object'},
            systemInstruction     : 'sys',
            chunkIndex            : 1,
            chunkCount            : 2,
            turnIndices           : [96, 191],
            chunkTokens           : 70549
        });

        expect(providerCalled).toBe(false);
        expect(result).toMatchObject({
            ok                : false,
            deferReason       : 'under-band-choke',
            frictionSymptom   : 'context-overflow',
            terminalForCadence: true,
            evidence          : {
                sessionId             : '2d993feb-ea2f-4468-8fbd-c53e62365f4d',
                chunkIndex            : 1,
                chunkCount            : 2,
                outputLimitTokens     : 20,
                contextLimitTokens    : 20,
                promptPlusOutputTokens: expect.any(Number)
            }
        });
        expect(result.evidence.promptPlusOutputTokens).toBeGreaterThan(20);
        expect(SemanticGraphExtractor.activeTriVectorCall).toBeNull();

        clearAggregatedFrictions();
    });

    test('over-band tri-vector repair prompt records friction instead of appending feedback (#13918)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        let invocationCount = 0;

        try {
            clearAggregatedFrictions();

            setConfigOverrides({
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 50000
            });

            OpenAiCompatible.prototype.generate = async function(messages) {
                invocationCount++;

                return {
                    content: 'malformed-json'.repeat(20000)
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-over-band-repair-vector-id',
                meta    : {sessionId: 'over-band-repair-session'},
                document: 'Mock episodic history for over-band repair retry detection.'
            });

            expect(result).toMatchObject({
                ok                : false,
                deferReason       : 'under-band-choke',
                frictionSymptom   : 'context-overflow',
                terminalForCadence: true
            });
            expect(invocationCount).toBe(1);

            const frictions = getAggregatedFrictions();
            const friction  = frictions.find(item => item.assetRef === 'over-band-repair-session');

            expect(friction).toBeDefined();
            expect(friction.symptom).toBe('context-overflow');
            expect(friction.inputTokensEstimate).toBeGreaterThan(50000);
            expect(friction.note).toContain('Repair retry prompt estimate');
            expect(friction.note).toContain('Aborting instead of appending');
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
            clearAggregatedFrictions();
        }
    });

    test('under-band malformed tri-vector output still uses one JSON repair retry (#13918)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        let invocationCount = 0;

        try {
            clearAggregatedFrictions();

            setConfigOverrides({
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 50000
            });

            OpenAiCompatible.prototype.generate = async function(messages) {
                invocationCount++;

                if (invocationCount === 1) {
                    return {content: 'not-json'};
                }

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : null,
                            human_readable_summary: 'Recovered after a bounded JSON repair retry.',
                            graph                 : {
                                nodes: [],
                                edges: []
                            }
                        }
                    })
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-under-band-repair-vector-id',
                meta    : {sessionId: 'under-band-repair-session'},
                document: 'Mock episodic history for bounded repair retry detection.'
            });

            expect(result).not.toBeNull();
            expect(result.session_artifact.human_readable_summary).toBe('Recovered after a bounded JSON repair retry.');
            expect(invocationCount).toBe(2);
            expect(getAggregatedFrictions().find(item => item.assetRef === 'under-band-repair-session')).toBeUndefined();
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
            clearAggregatedFrictions();
        }
    });

    test('Sub 9 hypotheses 2, 8, 9: guardrail telemetry uses configured graph-provider model (#12617, #12059)', async () => {
        const originalOverrides = {
            [ENV.GRAPH_PROVIDER]                   : aiConfig.graphProvider,
            [ENV.OLLAMA_MODEL]                     : aiConfig.ollama.model,
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens,
            [ENV.GRAPH_OUTPUT_LIMIT_TOKENS]        : aiConfig.localModels.chat.graphOutputLimitTokens
        };

        try {
            clearAggregatedFrictions();

            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]                   : 'ollama',
                [ENV.OLLAMA_MODEL]                     : 'gemma4-real-model',
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 1,
                [ENV.GRAPH_OUTPUT_LIMIT_TOKENS]        : 1
            });

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-consumer-model-vector-id',
                meta    : {sessionId: 'consumer-model-telemetry-session'},
                document: 'Force guardrail pre-check so provider.generate is never invoked.'
            });

            expect(result).toMatchObject({
                ok                : false,
                deferReason       : 'skip-over-band',
                frictionSymptom   : 'size-precheck-skip',
                terminalForCadence: true
            });

            const frictions = getAggregatedFrictions();
            const friction  = frictions.find(item => item.assetRef === 'consumer-model-telemetry-session:chunk:0');

            expect(friction).toBeDefined();
            expect(friction.model).toBe('gemma4-real-model');
            expect(friction.model).not.toBe('ollama');
            expect(result.evidence.assetRef).toBe('consumer-model-telemetry-session:chunk:0');
            expect(result.evidence.chunkId).toBe('consumer-model-telemetry-session:chunk:0');
        } finally {
            setConfigOverrides(originalOverrides);
            clearAggregatedFrictions();
        }
    });

    test('chunk-aware Tri-Vector preserves small-session single-pass behavior (#12073)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.GRAPH_PROVIDER]                   : aiConfig.graphProvider,
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        const providerCalls = [];

        try {
            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]                   : 'openAiCompatible',
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 50000
            });

            OpenAiCompatible.prototype.generate = async function(messages) {
                providerCalls.push(messages);

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : 'Neo.ai.Small',
                            human_readable_summary: 'Small session used the original single-pass path.',
                            graph                 : {nodes: [], edges: []}
                        }
                    })
                };
            };

            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id           : 'mock-small-vector-id',
                meta         : {sessionId: 'small-trivector-session'},
                document     : 'turn-a\n\n---\n\nturn-b',
                turnDocuments: ['turn-a', 'turn-b']
            });

            expect(providerCalls.length).toBe(1);
            expect(providerCalls[0][1].content).toContain('turn-a\n\n---\n\nturn-b');
            expect(result.session_artifact.chunking).toBeUndefined();
            expect(result.session_artifact.human_readable_summary).toBe('Small session used the original single-pass path.');
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
        }
    });

    test('chunk-aware Tri-Vector applies graph chunk limit and reserves output context (#13984)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.GRAPH_PROVIDER]                   : aiConfig.graphProvider,
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens,
            [ENV.GRAPH_CHUNK_LIMIT_TOKENS]         : aiConfig.localModels.chat.graphChunkLimitTokens,
            [ENV.GRAPH_OUTPUT_LIMIT_TOKENS]        : aiConfig.localModels.chat.graphOutputLimitTokens
        };
        const providerCalls = [];

        try {
            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]                   : 'openAiCompatible',
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 40000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 50000,
                [ENV.GRAPH_CHUNK_LIMIT_TOKENS]         : 50000,
                [ENV.GRAPH_OUTPUT_LIMIT_TOKENS]        : 8192
            });

            OpenAiCompatible.prototype.generate = async function(messages, options) {
                providerCalls.push({
                    messages,
                    options,
                    activeDuringCall: {...SemanticGraphExtractor.activeTriVectorCall}
                });

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : 'Neo.ai.OutputReserve',
                            human_readable_summary: `reserve-aware summary ${providerCalls.length}`,
                            graph                 : {nodes: [], edges: []}
                        }
                    })
                };
            };

            const turnDocuments = Array.from({length: 2}, (_, index) => `turn-${index}\n${'x'.repeat(54000)}`);
            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-output-reserve-vector-id',
                meta    : {sessionId: 'output-reserve-trivector-session'},
                document: turnDocuments.join('\n\n---\n\n'),
                turnDocuments
            });

            expect(providerCalls.length).toBeGreaterThan(1);
            expect(result.session_artifact.chunking.chunked).toBe(true);

            for (const call of providerCalls) {
                expect(call.options.maxCompletionTokens).toBe(8192);
                expect(call.activeDuringCall.promptPlusOutputTokens).toBeLessThanOrEqual(40000);
                expect(call.activeDuringCall.outputLimitTokens).toBe(8192);
            }
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
        }
    });

    test('chunk-aware Tri-Vector maps chunks, reduces deterministically, and dedupes by type/name (#12073)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.GRAPH_PROVIDER]                   : aiConfig.graphProvider,
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        const providerCalls = [];

        try {
            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]                   : 'openAiCompatible',
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 5000
            });

            OpenAiCompatible.prototype.generate = async function(messages) {
                const userContent = messages[1].content;
                providerCalls.push(userContent);

                const index = providerCalls.length - 1;

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : index === 0 ? 'Neo.ai.Chunked' : null,
                            human_readable_summary: `summary-${index}`,
                            roadmap_impact: index === 1 ? 'second chunk impact' : null,
                            graph         : {
                                nodes: [
                                    {
                                        id         : `CLASS:Shared${index}`,
                                        type: 'CLASS',
                                        name: 'SharedThing',
                                        description: `Shared description ${index}`,
                                        tags       : [`chunk-${index}`]
                                    },
                                    {
                                        id         : `CONCEPT:Chunk${index}`,
                                        type       : 'CONCEPT',
                                        name       : `Chunk${index}`,
                                        description: `Unique chunk ${index}`
                                    }
                                ],
                                edges: [
                                    {
                                        source       : `CLASS:Shared${index}`,
                                        target       : `CONCEPT:Chunk${index}`,
                                        relationship: 'RELATES_TO',
                                        weight      : index + 1,
                                        justification: `chunk ${index}`
                                    }
                                ]
                            }
                        }
                    })
                };
            };

            const turnDocuments = Array.from({length: 4}, (_, index) => `turn-${index}\n${'x'.repeat(6000)}`);
            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-chunked-vector-id',
                meta    : {sessionId: 'chunked-trivector-session'},
                document: turnDocuments.join('\n\n---\n\n'),
                turnDocuments
            });

            expect(providerCalls.length).toBeGreaterThan(1);
            expect(result.session_artifact.chunking.chunked).toBe(true);
            expect(result.session_artifact.chunking.chunks.length).toBe(providerCalls.length);
            expect(result.session_artifact.graph.nodes.filter(node => node.name === 'SharedThing').length).toBe(1);
            expect(result.session_artifact.graph.edges.some(edge => edge.source === 'CLASS:Shared1')).toBe(false);
            expect(result.session_artifact.graph.edges.some(edge => edge.source === 'CLASS:Shared0')).toBe(true);
            expect(result.session_artifact.human_readable_summary).toContain('summary-0');
            expect(result.session_artifact.human_readable_summary).toContain('summary-1');
            expect(result.session_artifact.roadmap_impact).toBe('second chunk impact');
            expect(GraphService.db.nodes.get('shared0')).toBeTruthy();
            expect(GraphService.db.nodes.get('shared1')).toBeFalsy();
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
        }
    });

    test('chunk-aware Tri-Vector aborts reduce before graph commit when a chunk fails (#12073)', async () => {
        const baseGenerate      = OpenAiCompatible.prototype.generate;
        const originalOverrides = {
            [ENV.GRAPH_PROVIDER]                   : aiConfig.graphProvider,
            [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : aiConfig.localModels.chat.contextLimitTokens,
            [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: aiConfig.localModels.chat.safeProcessingLimitTokens
        };
        let invocationCount = 0;

        try {
            setConfigOverrides({
                [ENV.GRAPH_PROVIDER]                   : 'openAiCompatible',
                [ENV.CHAT_CONTEXT_LIMIT_TOKENS]        : 100000,
                [ENV.CHAT_SAFE_PROCESSING_LIMIT_TOKENS]: 5000
            });

            OpenAiCompatible.prototype.generate = async function() {
                invocationCount++;

                if (invocationCount === 2) {
                    return {content: ''};
                }

                return {
                    content: JSON.stringify({
                        a2a_version     : '1.0',
                        agent_id        : 'Antigravity',
                        session_artifact: {
                            feature_namespace     : 'Neo.ai.Partial',
                            human_readable_summary: 'partial chunk success',
                            graph                 : {
                                nodes: [{
                                    id         : 'CLASS:PartialChunk',
                                    type       : 'CLASS',
                                    name       : 'PartialChunk',
                                    description: 'Must not be committed when a later chunk fails.'
                                }],
                                edges: []
                            }
                        }
                    })
                };
            };

            const turnDocuments = Array.from({length: 3}, (_, index) => `turn-${index}\n${'x'.repeat(6000)}`);
            const result = await SemanticGraphExtractor.executeTriVectorExtraction({
                id      : 'mock-chunk-failure-vector-id',
                meta    : {sessionId: 'chunk-failure-trivector-session'},
                document: turnDocuments.join('\n\n---\n\n'),
                turnDocuments
            });

            expect(result).toMatchObject({
                ok                : false,
                deferReason       : 'under-band-choke',
                frictionSymptom   : 'context-overflow',
                terminalForCadence: true
            });
            expect(result.evidence.chunkId).toBe('chunk-failure-trivector-session:chunk:1');
            expect(result.evidence.chunkIndex).toBe(1);
            expect(result.evidence.chunkCount).toBeGreaterThan(1);
            expect(GraphService.db.nodes.get('CLASS:PartialChunk')).toBeFalsy();
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            setConfigOverrides(originalOverrides);
            clearAggregatedFrictions();
        }
    });
});
