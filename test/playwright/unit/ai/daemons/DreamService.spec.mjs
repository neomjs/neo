import {setup} from '../../../setup.mjs';

const appName = 'DreamServiceTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path'
import os             from 'os';

test.describe('Neo.ai.mcp.server.memory-core.services.DreamService', () => {
    let GraphService;
    let SystemLifecycleService;
    let DreamService;
    let SemanticGraphExtractor;
    let StorageRouter;
    let OpenAiCompatible;
    let TextEmbeddingService;
    const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath; // Reassigned in beforeAll

    let originalGenerate;
    let originalAppendFile;
    let appendedContent = [];
    let providerPrompt = '';

    test.beforeAll(async () => {
        const aiConfig                = (await import('../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph = testDbPath;
        aiConfig.autoIngestFileSystem = false; // Prevent differential sync during DreamService tests
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');

        GraphService = (await import('../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        DreamService = (await import('../../../../../ai/daemons/DreamService.mjs')).default;
        SemanticGraphExtractor = (await import('../../../../../ai/daemons/services/SemanticGraphExtractor.mjs')).default;
        StorageRouter = (await import('../../../../../ai/mcp/server/memory-core/managers/StorageRouter.mjs')).default;
        OpenAiCompatible       = (await import('../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        SystemLifecycleService = (await import('../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService   = (await import('../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();
        }

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

        // Monkey patch OpenAiCompatible
        originalGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async function(prompt) {
            providerPrompt = prompt;
            return {
                content: JSON.stringify({
                    action: "alert",
                    message: "- **[Codebase Gap]** Node `ButtonFeature`: Mock Gap detected."
                })
            };
        };

        // Monkey patch fs.writeFileSync
        originalAppendFile = fs.writeFileSync;
        fs.writeFileSync = function(filePath, data, options) {
            if (filePath.endsWith('mock_sandman_handoff.md')) {
                appendedContent.push({ filePath, data });
            } else {
                return originalAppendFile(filePath, data, options);
            }
        };
    });

    test.beforeEach(async () => {
        appendedContent = [];
        providerPrompt  = [];

        if (GraphService.db) {
            GraphService.db.nodes.clear();
            GraphService.db.edges.clear();
            GraphService.db.vicinityLoadedNodes.clear();

            if (GraphService.db.storage?.db) {
                await GraphService.db.storage.clear();
                GraphService.db.storage.db.exec('DELETE FROM GraphLog');
                GraphService.db.lastSyncId = 0;
            }
        }
    });

    test.afterAll(async () => {
        if (GraphService?.db) {
            if (GraphService.db.storage?.db) {
                try { GraphService.db.storage.db.close(); } catch (e) {}
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        if (SystemLifecycleService) {
            SystemLifecycleService._initPromise = null;
        }

        if (fs.existsSync(testDbPath)) {
            try { fs.unlinkSync(testDbPath); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-wal`)) try { fs.unlinkSync(`${testDbPath}-wal`); } catch (e) {}
            if (fs.existsSync(`${testDbPath}-shm`)) try { fs.unlinkSync(`${testDbPath}-shm`); } catch (e) {}
        }
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        const mockHandoff = path.join(tmpDir, 'mock_sandman_handoff.md');
        if (fs.existsSync(mockHandoff)) {
            try { fs.unlinkSync(mockHandoff); } catch (e) {}
        }

        // Restore patches
        if (originalGenerate)   OpenAiCompatible.prototype.generate = originalGenerate;
        if (originalAppendFile) fs.writeFileSync = originalAppendFile;
    });

    test('should extract Graph nodes and flag deterministic capability gaps without mutating physical files', async () => {
        // 1. Manually populate SQLite graph with mocked FileSystem state
        GraphService.upsertNode({
            id         : 'mock-file-1',
            type       : 'FILE',
            name       : 'Button.mjs',
            description: 'Mock button class',
            properties : {path: 'src/button/Button.mjs'}
        });

        const payload = {
            session_artifact: {
                graph: {
                    nodes: [{
                        id           : 'node-feature-1',
                        type         : 'CLASS', // Changed from CONCEPT to bypass filter
                        name         : 'ButtonFeature',
                        description  : 'A newly formulated architectural concept.',
                        confidence   : 0.9,
                        logical_layer: 'UI Components',
                        stability    : 'EXPERIMENTAL',
                        gravity_well : true,
                        strategic_weight: 0.85,
                        tags         : ['Frontend', 'button'],
                        _resolvedId  : 'mock-file-1'
                    }],
                    edges: []
                }
            }
        };

        const session = {
            meta: {sessionId: 'playwright-test-session'}
        };

        // Suppress QueryService dynamic import execution during this deterministic test
        const originalImport = global.import;
        // 3. Trigger session-scoped TEST_GAP inference (post-#10085 scope split)
        await DreamService.inferTestGapsFromSession(payload);

        // Validate gaps are stored on the node correctly
        const updatedNode = GraphService.db.nodes.get('mock-file-1');
        expect(updatedNode.properties.capabilityGap).toBeDefined();
        // It should identify test gaps for structural gaps
        expect(updatedNode.properties.capabilityGap).toContain('[TEST_GAP]');
    });

    test('should detect GUIDE_GAP via concept-graph edge traversal (no LLM verification)', async () => {
        // #10035 rewrite: replaces the pre-refactor regex + LLM Boolean verification path with
        // deterministic outbound-EXPLAINED_BY edge traversal. Two CONCEPT nodes planted in the
        // graph — one with EXPLAINED_BY (covered), one without (gap). Both above the tier-1
        // weight threshold (0.8) so threshold-filtering isn't what drives the asymmetry.

        // Concept 1: tier-1, unique, covered via EXPLAINED_BY — should NOT gap
        GraphService.upsertNode({
            id        : 'concept-covered',
            type      : 'CONCEPT',
            name      : 'Threading',
            properties: {name: 'Threading', tier: 1, uniqueToNeo: true, weight: 1.0}
        });

        // Concept 2: tier-1, unique, NO EXPLAINED_BY — should gap
        GraphService.upsertNode({
            id        : 'concept-missing-guide',
            type      : 'CONCEPT',
            name      : 'RogueConcept',
            properties: {name: 'RogueConcept', tier: 1, uniqueToNeo: true, weight: 1.3}
        });

        // Seed target stub nodes (SQLite FK constraint on edges.target → nodes.id) then the edges.
        // The "covered" concept needs BOTH EXPLAINED_BY (no guide gap) and EXEMPLIFIED_BY
        // (no example gap) — otherwise it'd correctly emit [EXAMPLE_GAP].
        GraphService.upsertNode({
            id        : 'file:learn/guides/Threading.md',
            type      : 'FILE',
            name      : 'file:learn/guides/Threading.md',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.upsertNode({
            id        : 'file:examples/threading/demo.mjs',
            type      : 'FILE',
            name      : 'file:examples/threading/demo.mjs',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.db.addEdge({
            source: 'concept-covered',
            target: 'file:learn/guides/Threading.md',
            type  : 'EXPLAINED_BY'
        });
        GraphService.db.addEdge({
            source: 'concept-covered',
            target: 'file:examples/threading/demo.mjs',
            type  : 'EXEMPLIFIED_BY'
        });

        // Concept-graph pass is session-independent (hoisted to cycle-scope in #10085).
        await DreamService.inferConceptGraphGaps();

        const covered     = GraphService.db.nodes.get('concept-covered');
        const missingGuide = GraphService.db.nodes.get('concept-missing-guide');

        expect(covered.properties.capabilityGap).toBeUndefined();

        expect(missingGuide.properties.capabilityGap).toBeDefined();
        expect(missingGuide.properties.capabilityGap).toContain('[GUIDE_GAP]');
        expect(missingGuide.properties.capabilityGap).toContain('RogueConcept');
        expect(missingGuide.properties.capabilityGap).toContain('EXPLAINED_BY');
        expect(missingGuide.properties.lastGapCheck).toBeGreaterThan(0);
    });

    test('should detect EXAMPLE_GAP for concepts documented but lacking worked examples', async () => {
        // #10035 new signal: EXPLAINED_BY edge present, EXEMPLIFIED_BY edge absent.
        // Lower-severity than a missing guide; surfaced in a separate handoff section.
        GraphService.upsertNode({
            id        : 'concept-no-example',
            type      : 'CONCEPT',
            name      : 'Reactivity',
            properties: {name: 'Reactivity', tier: 1, uniqueToNeo: true, weight: 1.0}
        });

        GraphService.upsertNode({
            id        : 'file:learn/guides/Reactivity.md',
            type      : 'FILE',
            name      : 'file:learn/guides/Reactivity.md',
            properties: {isConceptEdgeStub: true}
        });
        GraphService.db.addEdge({
            source: 'concept-no-example',
            target: 'file:learn/guides/Reactivity.md',
            type  : 'EXPLAINED_BY'
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-no-example');

        expect(node.properties.capabilityGap).toBeDefined();
        expect(node.properties.capabilityGap).toContain('[EXAMPLE_GAP]');
        expect(node.properties.capabilityGap).toContain('Reactivity');
        expect(node.properties.capabilityGap).not.toContain('[GUIDE_GAP]');
    });

    test('should skip low-weight concepts even when lacking EXPLAINED_BY', async () => {
        // Weight threshold (0.8) prevents flooding the handoff with tier-3 noise. A tier-3 concept
        // with no uniqueness and no coverage deficit yet scores below 0.8 → no gap emitted.
        GraphService.upsertNode({
            id        : 'concept-low-weight',
            type      : 'CONCEPT',
            name      : 'MinorHelper',
            properties: {name: 'MinorHelper', tier: 3, uniqueToNeo: false, weight: 0.3}
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-low-weight');

        expect(node.properties?.capabilityGap).toBeUndefined();
    });

    test('processUndigestedSessions calls inferTestGapsFromSession per-session and inferConceptGraphGaps once per cycle (hoist contract — #10085)', async () => {
        // Locks in the #10085 Item 1 contract: the concept-graph pass is ontology-scoped, so it
        // must fire exactly once per REM cycle regardless of session count — not N times inside
        // the per-session loop like the pre-refactor `executeCapabilityGapInference` wrapper did.
        // Guards against any future "simplification" that re-inlines the cycle-scope call back
        // into the session loop and silently reintroduces N×M traversal cost at ontology scale.

        const aiConfig                = (await import('../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../ai/daemons/services/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../ai/mcp/server/memory-core/services/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../ai/daemons/services/TopologyInferenceEngine.mjs')).default;

        const sessionCount = 3;
        const mockSessions = Array.from({length: sessionCount}, (_, i) => ({
            id      : `sess-${i}`,
            document: 'mock-document',
            meta    : {sessionId: `sess-${i}`, title: `Mock Session ${i}`}
        }));

        let testGapCalls                           = 0;
        let conceptGapCalls                        = 0;
        let sessionUpdateCount                     = 0;
        let conceptGapCalledAfterLastSessionUpdate = false;

        const orig = {
            provider           : aiConfig.modelProvider,
            findUndigested     : DreamService.findUndigestedSessions,
            sessionsCollection : DreamService.sessionsCollection,
            inferTest          : DreamService.inferTestGapsFromSession,
            inferConcept       : DreamService.inferConceptGraphGaps,
            runGarbageCol      : DreamService.runGarbageCollection,
            synthesizeGolden   : DreamService.synthesizeGoldenPath,
            triVector          : SemanticGraphExtractor.executeTriVectorExtraction,
            syncConcepts       : ConceptIngestor.syncConceptsToGraph,
            syncFs             : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo        : TopologyInferenceEngine.extractTopology,
            isProcessing       : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => mockSessions;
            DreamService.sessionsCollection     = {
                update: async () => { sessionUpdateCount++; }
            };
            DreamService.inferTestGapsFromSession = async () => { testGapCalls++; };
            DreamService.inferConceptGraphGaps    = async () => {
                conceptGapCalls++;
                conceptGapCalledAfterLastSessionUpdate = (sessionUpdateCount === sessionCount);
            };
            DreamService.runGarbageCollection = async () => {};
            DreamService.synthesizeGoldenPath = async () => {};

            SemanticGraphExtractor.executeTriVectorExtraction = async () => ({
                session_artifact: {graph: {nodes: [], edges: []}}
            });
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};

            await DreamService.processUndigestedSessions();

            expect(testGapCalls).toBe(sessionCount);
            expect(conceptGapCalls).toBe(1);
            expect(conceptGapCalledAfterLastSessionUpdate).toBe(true);
        } finally {
            aiConfig.modelProvider                            = orig.provider;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('synthesizeGoldenPath should mathematically select and inject Golden Path while rejecting BLOCKS', async () => {
        // Mock StorageRouter to return deterministic ChromaDB metric formats
        const originalGetSummary = StorageRouter.getSummaryCollection;
        const originalGetGraph = StorageRouter.getGraphCollection;
        const originalPrepare = GraphService.db.storage.db.prepare;
        
        StorageRouter.getSummaryCollection = async () => {
             return {
                 get: async () => ({ documents: [] })
             };
        };

        StorageRouter.getGraphCollection = async () => {
            return {
                query: async () => ({
                    ids: [['epic-1', 'task-blocked', 'blocker', 'weak-task', 'rejected-task']],
                    distances: [[0.1, 0.2, 0.9, 0.8, 0.05]]
                }),
                get: async () => ({ ids: [], metadatas: [] }),
                upsert: async () => {}
            };
        };
        
        GraphService.db.storage.db.prepare = function(sql) {
            // console.log("SQL PREPARE CALLED:", sql.substring(0, 50));
            if (sql.includes('SELECT') && sql.includes('Nodes')) {
                console.log('MOCK TRIGGERED Nodes SELECT!');
                return {
                    all: () => [
                        { id: 'epic-1', data: JSON.stringify({ id: 'epic-1', name: 'Epic Hero', properties: { state: 'OPEN'} }), struct_score: 5.0 },
                        { id: 'task-blocked', data: JSON.stringify({ id: 'task-blocked', name: 'Blocked Task', properties: { state: 'OPEN'} }), struct_score: 10.0 },
                        { id: 'blocker', data: JSON.stringify({ id: 'blocker', name: 'Blocker Bug', properties: { state: 'OPEN'} }), struct_score: 1.0 },
                        { id: 'weak-task', data: JSON.stringify({ id: 'weak-task', name: 'Weak Task', properties: { state: 'OPEN'} }), struct_score: 0.1 },
                        { id: 'rejected-task', data: JSON.stringify({ id: 'rejected-task', name: 'Massive Stale Feature', properties: { state: 'OPEN', labels: ['needs-re-triage']} }), struct_score: 1000.0 }
                    ],
                    get: () => null,
                    run: () => {}
                };
            }
            return { all: () => [], get: () => null, run: () => {} };
        };

        // GraphService mock topology
        GraphService.db.edges.items = [
             { source: 'blocker', target: 'task-blocked', type: 'BLOCKS' }
        ];

        GraphService.db.nodes.items = [
             { id: 'epic-1', properties: { state: 'OPEN' } },
             { id: 'task-blocked', properties: { state: 'OPEN' } },
             { id: 'blocker', properties: { state: 'OPEN' } },
             { id: 'weak-task', properties: { state: 'OPEN' } },
             { id: 'rejected-task', properties: { state: 'OPEN', labels: ['needs-re-triage'] } }
        ];

        GraphService.db.edges.getByIndex = (idx, val) => {
            return GraphService.db.edges.items.filter(e => e[idx] === val);
        };
        GraphService.linkNodes = () => {};
        GraphService.getContextFrontier = () => ({ nodes: [], edges: [] });

        const baseGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async () => ({
             content: JSON.stringify({ strategic_brief: "Math synthesis works natively." })
        });
        
        const baseEmbed = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        // Setup markdown with a conflicting gap to verify dynamic stripping / injection sequence
        const aiConfig = (await import('../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const handoffFile = aiConfig.handoffFilePath;
        
        // Restore actual file system write for this test specifically
        const mockWriteFile = fs.writeFileSync;
        fs.writeFileSync = originalAppendFile;

        fs.writeFileSync(handoffFile, '- **[Codebase Gap]** Node `Fake`: Exists\n\n## Computed Golden Path\nOld Path\n', 'utf8');

        // Execute Golden Path Synthesizer
        await DreamService.synthesizeGoldenPath();
        
        const finalContent = fs.readFileSync(handoffFile, 'utf8');

        // Verification Loop
        expect(finalContent).toContain('Epic Hero');
        expect(finalContent).toContain('Weak Task'); 
        expect(finalContent).not.toContain('Blocked Task'); // REJECTED topologically by GraphService
        expect(finalContent).not.toContain('Massive Stale Feature'); // REJECTED mathematically by Negative ROI penalty
        expect(finalContent).toContain('Math synthesis works natively.');
        expect(finalContent.indexOf('- **[Codebase Gap]**')).toBeLessThan(finalContent.indexOf('## Computed Golden Path'));
        expect(finalContent).not.toContain('Old Path');

        // Run AGAIN to trigger duplication prevention natively
        await DreamService.synthesizeGoldenPath();
        const twiceContent = fs.readFileSync(handoffFile, 'utf8');
        
        // Count capabilities gaps to ensure idempotence
        const firstCount = finalContent.split('[Codebase Gap]').length;
        const secondCount = twiceContent.split('[Codebase Gap]').length;
        expect(secondCount).toBe(firstCount);

        // Restore
        OpenAiCompatible.prototype.generate = baseGenerate;
        TextEmbeddingService.embedText = baseEmbed;
        fs.writeFileSync = mockWriteFile;
        StorageRouter.getSummaryCollection = originalGetSummary;
        StorageRouter.getGraphCollection = originalGetGraph;
        if (originalPrepare) {
             GraphService.db.storage.db.prepare = originalPrepare;
        } else {
             delete GraphService.db.storage.db.prepare;
        }
    });

    test('should retry extraction on malformed JSON payload up to 3 times to fix #9913', async () => {
        let executionCount = 0;
        const baseGenerate = OpenAiCompatible.prototype.generate;
        
        // Mock to fail twice with invalid JSON, then succeed on the 3rd attempt
        OpenAiCompatible.prototype.generate = async function(messages) {
            executionCount++;
            providerPrompt = messages; // Save for assertion
            
            if (executionCount < 3) {
                // Return malformed payload mimicking local hallucination
                return {
                    content: "```json\n{ \"a2a_version\": \"1.0\", \"agent_id\": \"Antigravity\" " // Unfinished, no graph
                };
            }
            
            // On attempt 3, return valid Tri-Vector
            return {
                content: JSON.stringify({
                    a2a_version: "1.0",
                    agent_id: "Antigravity",
                    session_artifact: {
                        graph: {
                            nodes: [],
                            edges: []
                        }
                    }
                })
            };
        };

        const session = {
            meta: { sessionId: 'playwright-retry-test' },
            document: "Mock episodic history"
        };

        const result = await SemanticGraphExtractor.executeTriVectorExtraction(session);

        // Assert that the LLM was called 3 times natively due to the retry loop wrapping
        expect(executionCount).toBe(3);
        
        // Assert the returned result is strictly not null since attempt 3 passed
        expect(result).not.toBeNull();
        expect(result.session_artifact).toBeDefined();

        // Check if the feedback logic was appended to the provider messages
        const lastMessage = providerPrompt[providerPrompt.length - 1];
        expect(lastMessage.role).toBe('user');
        expect(lastMessage.content).toContain('failed internal schema validation');

        // Restore global function
        OpenAiCompatible.prototype.generate = baseGenerate;
    });
});
