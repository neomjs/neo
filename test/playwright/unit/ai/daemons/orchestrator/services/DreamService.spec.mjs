import {setup} from '../../../../../setup.mjs';

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
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import fs             from 'fs';
import path           from 'path';
import os             from 'os';
import {TestLifecycleHelper} from '../../../services/memory-core/util.mjs';

test.describe('Neo.ai.services.memory-core.DreamService', () => {
    let GraphService;
    let SystemLifecycleService;
    let DreamService;
    let MemorySessionIngestor;
    let SemanticGraphExtractor;
    let StorageRouter;
    let OpenAiCompatible;
    let TextEmbeddingService;
    let KBRecorderService;
    let logger;
    const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath; // Reassigned in beforeAll

    let originalGenerate;
    let originalAppendFile;
    let appendedContent = [];
    let providerPrompt = '';
    const freshVerifiedAt = new Date().toISOString();

    test.beforeAll(async () => {
        const
            aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
            kbConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph = testDbPath;
        aiConfig.autoIngestFileSystem = false; // Prevent differential sync during DreamService tests
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');
        aiConfig.remSleepBatchLimit ??= 10;
        kbConfig.data.memoryCoreDbPath = testDbPath;

        GraphService = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        DreamService = (await import('../../../../../../../ai/daemons/orchestrator/services/DreamService.mjs')).default;
        MemorySessionIngestor = (await import('../../../../../../../ai/services/ingestion/MemorySessionIngestor.mjs')).default;
        SemanticGraphExtractor = (await import('../../../../../../../ai/services/graph/SemanticGraphExtractor.mjs')).default;
        StorageRouter = (await import('../../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        OpenAiCompatible       = (await import('../../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        TextEmbeddingService   = (await import('../../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        KBRecorderService      = (await import('../../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        logger                 = (await import('../../../../../../../ai/mcp/server/memory-core/logger.mjs')).default;

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
        await KBRecorderService.ready();

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

        if (KBRecorderService?.db) {
            KBRecorderService.db.exec('DELETE FROM kb_query_log; DELETE FROM kb_query_faqs;');
        }
    });

    test.afterEach(async () => {
        // Symmetric cleanup per `feedback_symmetric_spec_cleanup.md`: `fullyParallel: true` lets
        // Playwright interleave this spec with ConceptService/ConceptIngestor specs in the same
        // worker, and `GraphService.db` is a shared singleton. Mirroring beforeEach here closes
        // the cross-spec door — the next queued test from any spec sees a clean graph, not our
        // trailing fixtures (CONCEPT nodes planted by the ORPHAN_CONCEPT detection test, etc.).
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
        // 'destroy' (not 'clear') so SystemLifecycleService._initPromise is reset to null.
        // Otherwise sibling specs (e.g. DreamServiceGoldenPath) hit
        //   `if (!_initPromise) initAsync() else ready()`
        // → take the `ready()` branch → never honor their own `aiConfig.storagePaths.graph`
        // → real `getContextFrontier()` returns null. Empirically traced via bisection.
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'destroy');

        if (KBRecorderService?.db) {
            KBRecorderService.db.exec('DELETE FROM kb_query_log; DELETE FROM kb_query_faqs;');
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
        // 3. Trigger session-scoped TEST_GAP inference after the cycle-scope split.
        await DreamService.inferTestGapsFromSession(payload);

        // Validate gaps are stored on the node correctly
        const updatedNode = GraphService.db.nodes.get('mock-file-1');
        expect(updatedNode.properties.capabilityGap).toBeDefined();
        // It should identify test gaps for structural gaps
        expect(updatedNode.properties.capabilityGap).toContain('[TEST_GAP]');
    });

    test('inferTestGapsFromSession links matching test files via VALIDATES edges (#9906)', async () => {
        GraphService.upsertNode({
            id        : 'covered-class',
            type      : 'CLASS',
            name      : 'ButtonFeature',
            properties: {}
        });
        GraphService.upsertNode({
            id        : 'test-file-button-feature',
            type      : 'FILE',
            name      : 'ButtonFeature.spec.mjs',
            properties: {path: 'test/playwright/unit/button/ButtonFeature.spec.mjs'}
        });

        const payload = {
            session_artifact: {
                graph: {
                    nodes: [{
                        id        : 'covered-class',
                        type      : 'CLASS',
                        name      : 'ButtonFeature',
                        confidence: 0.9
                    }],
                    edges: []
                }
            }
        };

        await DreamService.inferTestGapsFromSession(payload);

        const coveredNode = GraphService.db.nodes.get('covered-class');
        const edge = GraphService.db.edges.items.find(e =>
            e.source === 'test-file-button-feature' &&
            e.target === 'covered-class' &&
            e.type === 'VALIDATES'
        );

        expect(coveredNode.properties.capabilityGap).toBeUndefined();
        expect(edge).toBeTruthy();
        expect(edge.properties.evidenceKind).toBe('permanent-test-file');
        expect(edge.properties.evidencePath).toBe('test/playwright/unit/button/ButtonFeature.spec.mjs');
        expect(edge.properties.inferredBy).toBe('GapInferenceEngine.inferTestGapsFromSession');
        expect(edge.properties.validatedNodeName).toBe('ButtonFeature');
        expect(edge.properties.validatedNodeType).toBe('CLASS');
    });

    test('inferTestGapsFromSession does not link sibling token matches via VALIDATES edges (#12639)', async () => {
        GraphService.upsertNode({
            id        : 'button-feature-class',
            type      : 'CLASS',
            name      : 'ButtonFeature',
            properties: {}
        });
        GraphService.upsertNode({
            id        : 'button-store-class',
            type      : 'CLASS',
            name      : 'ButtonStore',
            properties: {}
        });
        GraphService.upsertNode({
            id        : 'test-file-button-store',
            type      : 'FILE',
            name      : 'ButtonStore.spec.mjs',
            properties: {path: 'test/playwright/unit/button/ButtonStore.spec.mjs'}
        });

        const payload = {
            session_artifact: {
                graph: {
                    nodes: [{
                        id        : 'button-feature-class',
                        type      : 'CLASS',
                        name      : 'ButtonFeature',
                        confidence: 0.9
                    }, {
                        id        : 'button-store-class',
                        type      : 'CLASS',
                        name      : 'ButtonStore',
                        confidence: 0.9
                    }],
                    edges: []
                }
            }
        };

        await DreamService.inferTestGapsFromSession(payload);

        const
            featureNode = GraphService.db.nodes.get('button-feature-class'),
            storeNode   = GraphService.db.nodes.get('button-store-class'),
            featureEdge = GraphService.db.edges.items.find(e =>
                e.source === 'test-file-button-store' &&
                e.target === 'button-feature-class' &&
                e.type === 'VALIDATES'
            ),
            storeEdge = GraphService.db.edges.items.find(e =>
                e.source === 'test-file-button-store' &&
                e.target === 'button-store-class' &&
                e.type === 'VALIDATES'
            );

        expect(featureNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(featureEdge).toBeUndefined();
        expect(storeNode.properties.capabilityGap).toBeUndefined();
        expect(storeEdge).toBeTruthy();
    });

    test('findUndigestedSessions fails loud when remSleepBatchLimit is malformed in the imported config', async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
              originalRemSleepBatchLimit = aiConfig.remSleepBatchLimit;

        aiConfig.remSleepBatchLimit = Number.NaN;

        try {
            await expect(DreamService.findUndigestedSessions()).rejects.toThrow(/Required AiConfig leaf "remSleepBatchLimit"/);
        } finally {
            aiConfig.remSleepBatchLimit = originalRemSleepBatchLimit ?? 10;
        }
    });

    test('should detect GUIDE_GAP via concept-graph edge traversal (no LLM verification)', async () => {
        // Capability-gap rewrite: replaces the pre-refactor regex + LLM Boolean verification path with
        // deterministic outbound-EXPLAINED_BY edge traversal. Two CONCEPT nodes planted in the
        // graph — one with EXPLAINED_BY (covered), one without (gap). Both above the tier-1
        // weight threshold (0.8) so threshold-filtering isn't what drives the asymmetry.

        // Concept 1: tier-1, unique, covered via EXPLAINED_BY — should NOT gap
        GraphService.upsertNode({
            id        : 'concept-covered',
            type      : 'CONCEPT',
            name      : 'Threading',
            properties: {name: 'Threading', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.0}
        });

        // Concept 2: tier-1, unique, NO EXPLAINED_BY — should gap
        GraphService.upsertNode({
            id        : 'concept-missing-guide',
            type      : 'CONCEPT',
            name      : 'RogueConcept',
            properties: {name: 'RogueConcept', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.3}
        });

        // Seed target stub nodes (SQLite FK constraint on edges.target → nodes.id) then the edges.
        // The "covered" concept needs EXPLAINED_BY (no guide gap), EXEMPLIFIED_BY (no example gap),
        // AND IMPLEMENTED_BY (no orphan gap) — otherwise it'd correctly emit one of
        // those signals instead of being fully covered.
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
        GraphService.upsertNode({
            id        : 'file:src/worker/Manager.mjs',
            type      : 'FILE',
            name      : 'file:src/worker/Manager.mjs',
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
        GraphService.db.addEdge({
            source: 'concept-covered',
            target: 'file:src/worker/Manager.mjs',
            type  : 'IMPLEMENTED_BY'
        });

        // Concept-graph pass is session-independent and hoisted to cycle-scope.
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

    test('should emit KB_DEMAND_GAP for repeated uncovered Agent FAQ demand (#10081)', async () => {
        const originalListAgentFaqs = KBRecorderService.listAgentFaqs;

        KBRecorderService.listAgentFaqs = () => ({
            faqs: [{
                clusterId              : 'kb-demand-cluster',
                canonicalQuery         : 'How should agents use ask_knowledge_base?',
                count                  : 3,
                relatedConceptIds      : ['concept-kb-demand'],
                hasStrongGuideCoverage: false
            }]
        });

        try {
            GraphService.upsertNode({
                id        : 'concept-kb-demand',
                type      : 'CONCEPT',
                name      : 'Knowledge Base Demand',
                properties: {
                    name       : 'Knowledge Base Demand',
                    tier       : 3,
                    uniqueToNeo: false,
                    verifiedAt : freshVerifiedAt,
                    weight     : 0.3
                }
            });

            await DreamService.inferConceptGraphGaps();

            const node = GraphService.db.nodes.get('concept-kb-demand');

            expect(node.properties.capabilityGap).toContain('[KB_DEMAND_GAP]');
            expect(node.properties.capabilityGap).toContain('How should agents use ask_knowledge_base?');
            expect(node.properties.capabilityGap).not.toContain('[GUIDE_GAP]');
        } finally {
            KBRecorderService.listAgentFaqs = originalListAgentFaqs;
        }
    });

    test('should detect EXAMPLE_GAP for concepts documented but lacking worked examples', async () => {
        // New signal: EXPLAINED_BY edge present, EXEMPLIFIED_BY edge absent.
        // Lower-severity than a missing guide; surfaced in a separate handoff section.
        GraphService.upsertNode({
            id        : 'concept-no-example',
            type      : 'CONCEPT',
            name      : 'Reactivity',
            properties: {name: 'Reactivity', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.0}
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
            properties: {name: 'MinorHelper', tier: 3, uniqueToNeo: false, verifiedAt: freshVerifiedAt, weight: 0.3}
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-low-weight');

        expect(node.properties?.capabilityGap).toBeUndefined();
    });

    test('threshold override via aiConfig.data.guideGapWeightThreshold changes emission behavior (#10086)', async () => {
        // The weight gate lives in config (not a file-local constant). Verifying that
        // GapInferenceEngine reads the live config value means curators can tune the handoff
        // silence level without code changes — the stated goal of the config-lift.
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const original = aiConfig.data.guideGapWeightThreshold;

        // Plant a concept whose weight (0.5) is BELOW the default 0.8 — normally no gap emitted.
        GraphService.upsertNode({
            id        : 'concept-mid-weight',
            type      : 'CONCEPT',
            name      : 'MidWeight',
            properties: {name: 'MidWeight', tier: 2, uniqueToNeo: false, verifiedAt: freshVerifiedAt, weight: 0.5}
        });

        try {
            // Override the threshold below the concept's weight. The same concept must now pass
            // the gate and emit gaps through the same branch logic — proving the config is
            // actually consulted at gate time, not captured at module load.
            aiConfig.data.guideGapWeightThreshold = 0.3;

            await DreamService.inferConceptGraphGaps();

            const node = GraphService.db.nodes.get('concept-mid-weight');
            expect(node.properties.capabilityGap).toBeDefined();
            expect(node.properties.capabilityGap).toContain('[GUIDE_GAP]');
            expect(node.properties.capabilityGap).toContain('[ORPHAN_CONCEPT]');
        } finally {
            aiConfig.data.guideGapWeightThreshold = original;
        }
    });

    test('should detect ORPHAN_CONCEPT for concepts with no IMPLEMENTED_BY edge (#10087)', async () => {
        // Concepts without source-code anchoring emit `[ORPHAN_CONCEPT]` via the durable
        // `capabilityGap` channel rather than the deprecated per-orphan `logger.warn` in
        // `ConceptIngestor`. Shares the same `GUIDE_GAP_WEIGHT_THRESHOLD` weight gate as
        // `[GUIDE_GAP]` / `[EXAMPLE_GAP]` so low-priority concepts don't flood the handoff.

        // Concept A: fully wired (EXPLAINED_BY + EXEMPLIFIED_BY + IMPLEMENTED_BY) — no gaps
        GraphService.upsertNode({
            id        : 'concept-anchored',
            type      : 'CONCEPT',
            name      : 'Anchored',
            properties: {name: 'Anchored', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.0}
        });

        // Concept B: has guide + example but NO implementation — ORPHAN_CONCEPT only
        GraphService.upsertNode({
            id        : 'concept-orphan',
            type      : 'CONCEPT',
            name      : 'OrphanExample',
            properties: {name: 'OrphanExample', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.0}
        });

        // Concept C: low weight, no edges — weight gate blocks ORPHAN_CONCEPT emission
        GraphService.upsertNode({
            id        : 'concept-low-orphan',
            type      : 'CONCEPT',
            name      : 'LowWeightOrphan',
            properties: {name: 'LowWeightOrphan', tier: 3, uniqueToNeo: false, verifiedAt: freshVerifiedAt, weight: 0.3}
        });

        // Seed stub nodes for edge targets (SQLite FK on edges.target → nodes.id)
        [
            'file:src/Anchored.mjs',
            'file:learn/guides/Anchored.md',
            'file:examples/anchored.mjs',
            'file:learn/guides/OrphanExample.md',
            'file:examples/orphan-example.mjs'
        ].forEach(id => GraphService.upsertNode({
            id, type: 'FILE', name: id, properties: {isConceptEdgeStub: true}
        }));

        // concept-anchored: all three edges present
        GraphService.db.addEdge({source: 'concept-anchored', target: 'file:src/Anchored.mjs',        type: 'IMPLEMENTED_BY'});
        GraphService.db.addEdge({source: 'concept-anchored', target: 'file:learn/guides/Anchored.md', type: 'EXPLAINED_BY'});
        GraphService.db.addEdge({source: 'concept-anchored', target: 'file:examples/anchored.mjs',    type: 'EXEMPLIFIED_BY'});

        // concept-orphan: guide + example only; missing IMPLEMENTED_BY
        GraphService.db.addEdge({source: 'concept-orphan', target: 'file:learn/guides/OrphanExample.md', type: 'EXPLAINED_BY'});
        GraphService.db.addEdge({source: 'concept-orphan', target: 'file:examples/orphan-example.mjs',   type: 'EXEMPLIFIED_BY'});

        // concept-low-orphan: no edges (weight gate should skip it)

        await DreamService.inferConceptGraphGaps();

        const anchored  = GraphService.db.nodes.get('concept-anchored');
        const orphan    = GraphService.db.nodes.get('concept-orphan');
        const lowOrphan = GraphService.db.nodes.get('concept-low-orphan');

        // Fully-wired concept → no capabilityGap writes
        expect(anchored.properties.capabilityGap).toBeUndefined();

        // Missing-implementation concept → ORPHAN_CONCEPT only (guide + example present)
        expect(orphan.properties.capabilityGap).toBeDefined();
        expect(orphan.properties.capabilityGap).toContain('[ORPHAN_CONCEPT]');
        expect(orphan.properties.capabilityGap).toContain('OrphanExample');
        expect(orphan.properties.capabilityGap).toContain('IMPLEMENTED_BY');
        expect(orphan.properties.capabilityGap).not.toContain('[GUIDE_GAP]');
        expect(orphan.properties.capabilityGap).not.toContain('[EXAMPLE_GAP]');

        // Low-weight concept → weight gate blocks all three signals
        expect(lowOrphan.properties?.capabilityGap).toBeUndefined();
    });

    test('unvalidated concepts (validated: false) should be silenced regardless of weight (#10036)', async () => {
        // Mined candidates from ConceptDiscoveryService carry `validated: false` until
        // a curator promotes them via nodes.jsonl edit. Low weight is the primary silencing
        // mechanism (weight gate), but `validated: false` is the explicit override — even if
        // an unvalidated candidate had a high weight, it must stay silent until reviewed.
        GraphService.upsertNode({
            id        : 'concept-unvalidated',
            type      : 'CONCEPT',
            name      : 'UnvalidatedCandidate',
            properties: {
                name       : 'UnvalidatedCandidate',
                tier       : 1,
                uniqueToNeo: true,
                verifiedAt : null,
                weight     : 1.3,
                validated  : false
            }
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-unvalidated');

        // Weight 1.3 >= 0.8 threshold → would normally emit GUIDE_GAP + ORPHAN_CONCEPT.
        // The `validated: false` flag must suppress all three concept-graph signals.
        expect(node.properties.capabilityGap).toBeUndefined();
    });

    test('should emit GUIDE_GAP and ORPHAN_CONCEPT together when concept lacks both EXPLAINED_BY and IMPLEMENTED_BY (#10087)', async () => {
        // Locks in the independence of ORPHAN_CONCEPT from the GUIDE_GAP / EXAMPLE_GAP branch.
        // GUIDE_GAP and EXAMPLE_GAP are mutually exclusive (one requires EXPLAINED_BY absent, the
        // other requires it present), but ORPHAN_CONCEPT is orthogonal — a concept can be both
        // undocumented AND unanchored. This compound case exercises the branch orthogonality that
        // the three-case test above doesn't hit directly.
        GraphService.upsertNode({
            id        : 'concept-fully-uncovered',
            type      : 'CONCEPT',
            name      : 'FullyUncovered',
            properties: {name: 'FullyUncovered', tier: 1, uniqueToNeo: true, verifiedAt: freshVerifiedAt, weight: 1.3}
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-fully-uncovered');

        expect(node.properties.capabilityGap).toBeDefined();
        expect(node.properties.capabilityGap).toContain('[GUIDE_GAP]');
        expect(node.properties.capabilityGap).toContain('[ORPHAN_CONCEPT]');
        expect(node.properties.capabilityGap).toContain('FullyUncovered');
        // EXAMPLE_GAP requires EXPLAINED_BY present; since we have neither edge, only GUIDE_GAP
        // fires from the if/else-if pair, never EXAMPLE_GAP.
        expect(node.properties.capabilityGap).not.toContain('[EXAMPLE_GAP]');
    });

    test('should emit CONCEPT_REVERIFY_DUE without mutating graph weight or edges (#10574)', async () => {
        const
            reviewWindowMs = 90 * 24 * 60 * 60 * 1000,
            staleDate      = new Date(Date.now() - reviewWindowMs - 1000).toISOString();

        [
            {id: 'concept-null-verified',    name: 'Null Verified',    verifiedAt: null},
            {id: 'concept-missing-verified', name: 'Missing Verified'},
            {id: 'concept-stale-verified',   name: 'Stale Verified',   verifiedAt: staleDate},
            {id: 'concept-invalid-verified', name: 'Invalid Verified', verifiedAt: 'not-an-iso-date'},
            {id: 'concept-non-iso-verified', name: 'Non ISO Verified', verifiedAt: 'May 1 2026'},
            {id: 'concept-fresh-verified',   name: 'Fresh Verified',   verifiedAt: freshVerifiedAt}
        ].forEach(record => {
            const properties = {
                name       : record.name,
                tier       : 3,
                uniqueToNeo: false,
                weight     : 0.3
            };

            if (Object.hasOwn(record, 'verifiedAt')) {
                properties.verifiedAt = record.verifiedAt;
            }

            GraphService.upsertNode({
                id  : record.id,
                type: 'CONCEPT',
                name: record.name,
                properties
            });
        });

        const edgeCountBefore = GraphService.db.edges.items.length;

        await DreamService.inferConceptGraphGaps();

        ['concept-null-verified', 'concept-missing-verified', 'concept-stale-verified', 'concept-invalid-verified', 'concept-non-iso-verified'].forEach(id => {
            const node = GraphService.db.nodes.get(id);
            expect(node.properties.capabilityGap).toContain('[CONCEPT_REVERIFY_DUE]');
            expect(node.properties.capabilityGap).not.toContain('[GUIDE_GAP]');
            expect(node.properties.capabilityGap).not.toContain('[ORPHAN_CONCEPT]');
            expect(node.properties.weight).toBe(0.3);
        });

        const fresh = GraphService.db.nodes.get('concept-fresh-verified');
        expect(fresh.properties.capabilityGap).toBeUndefined();
        expect(GraphService.db.edges.items.length).toBe(edgeCountBefore);
    });

    test('processUndigestedSessions calls inferTestGapsFromSession per-session and inferConceptGraphGaps once per cycle (hoist contract — #10085)', async () => {
        // Locks in the hoist contract: the concept-graph pass is ontology-scoped, so it
        // must fire exactly once per REM cycle regardless of session count — not N times inside
        // the per-session loop like the pre-refactor `executeCapabilityGapInference` wrapper did.
        // Guards against any future "simplification" that re-inlines the cycle-scope call back
        // into the session loop and silently reintroduces N×M traversal cost at ontology scale.

        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

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
            syncSession        : MemorySessionIngestor.syncSessionToGraph,
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
            MemorySessionIngestor.syncSessionToGraph = async () => ({
                errors          : [],
                memoriesSkipped : 0,
                memoriesUpserted: 0
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
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('processUndigestedSessions does not set graphDigested when memory ingestion reports errors (#10460)', async () => {
        // Regression guard: the Tri-Vector extractor can succeed from
        // `session.document` even when MemorySessionIngestor partially failed to upsert MEMORY
        // nodes. Keep such sessions undigested so the next REM cycle retries the missing graph
        // rows instead of permanently masking them behind `graphDigested: true`.

        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const mockSession = {
            id      : 'chroma-summary-partial',
            document: 'mock-document',
            meta    : {sessionId: 'agent-session-partial', title: 'Partial ingest session'}
        };

        let testGapCalls     = 0;
        let conceptGapCalls  = 0;
        let sessionUpdates   = 0;
        const infoMessages   = [];
        const warnMessages   = [];

        const orig = {
            provider           : aiConfig.modelProvider,
            findUndigested     : DreamService.findUndigestedSessions,
            sessionsCollection : DreamService.sessionsCollection,
            inferTest          : DreamService.inferTestGapsFromSession,
            inferConcept       : DreamService.inferConceptGraphGaps,
            runGarbageCol      : DreamService.runGarbageCollection,
            synthesizeGolden   : DreamService.synthesizeGoldenPath,
            triVector          : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession        : MemorySessionIngestor.syncSessionToGraph,
            syncConcepts       : ConceptIngestor.syncConceptsToGraph,
            syncFs             : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo        : TopologyInferenceEngine.extractTopology,
            getMemory          : StorageRouter.getMemoryCollection,
            loggerInfo         : logger.info,
            loggerWarn         : logger.warn,
            isProcessing       : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async () => { sessionUpdates++; }
            };
            DreamService.inferTestGapsFromSession = async () => { testGapCalls++; };
            DreamService.inferConceptGraphGaps    = async () => { conceptGapCalls++; };
            DreamService.runGarbageCollection     = async () => {};
            DreamService.synthesizeGoldenPath     = async () => {};

            SemanticGraphExtractor.executeTriVectorExtraction = async () => ({
                session_artifact: {graph: {nodes: [], edges: []}}
            });
            MemorySessionIngestor.syncSessionToGraph = async () => ({
                errors          : ['[memory:broken] simulated upsert failure'],
                memoriesSkipped : 1,
                memoriesUpserted: 2
            });
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            StorageRouter.getMemoryCollection       = async () => null;

            logger.info = (...args) => { infoMessages.push(args.join(' ')); };
            logger.warn = (...args) => { warnMessages.push(args.join(' ')); };

            await DreamService.processUndigestedSessions();

            expect(testGapCalls).toBe(1);
            expect(conceptGapCalls).toBe(1);
            expect(sessionUpdates).toBe(0);
            expect(infoMessages.some(msg => msg.includes('2 upserted, 1 skipped, 1 errors'))).toBe(true);
            expect(warnMessages.some(msg => msg.includes('agent-session-partial') && msg.includes('graphDigested will NOT be set'))).toBe(true);
        } finally {
            aiConfig.modelProvider                            = orig.provider;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            logger.info                                      = orig.loggerInfo;
            logger.warn                                      = orig.loggerWarn;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('Sub 9 hypothesis 9 (PRIMARY): real DreamService→SemanticGraphExtractor integration — empty-response overflow keeps the session undigested + surfaces friction, not silently completed (#12075)', async () => {
        // Integration complement to the Phase-A isolated extractor test
        // (SemanticGraphExtractor.spec `Sub 9 hypotheses 9 and 11`). Phase-A stubs the service
        // choreography; this drives the REAL processUndigestedSessions → SemanticGraphExtractor
        // handoff so a genuine empty-response overflow at the provider boundary flows through
        // DreamService's actual null-result handling. Per the Sub-9 avoided-trap, only the
        // peripheral pipeline phases (ingestors / topology / gap inference / golden-path / GC),
        // the storage backend, and the LLM boundary are neutralized — the DreamService↔
        // SemanticGraphExtractor choreography under test runs real. Hypothesis 9 (PRIMARY),
        // Discussion silent-failure enumeration §2.4.
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;
        const {clearAggregatedFrictions, getAggregatedFrictions} =
            await import('../../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs');

        const mockSession = {
            id      : 'chroma-summary-empty-overflow',
            document: 'Short episodic payload for the silent empty-response overflow integration guard.',
            meta    : {sessionId: 'agent-session-empty-overflow', title: 'Empty-overflow session'}
        };

        let sessionUpdates = 0;

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            conflictCount     : TopologyInferenceEngine.getTopologyConflictCount,
            getMemory         : StorageRouter.getMemoryCollection,
            generate          : OpenAiCompatible.prototype.generate,
            isProcessing      : DreamService.isProcessing
        };

        try {
            clearAggregatedFrictions();

            aiConfig.modelProvider    = 'mock-provider'; // skip the openAiCompatible legacy provider ping
            DreamService.isProcessing = false;

            // Storage backend (in-memory) — NOT the choreography under test.
            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async () => { sessionUpdates++; }
            };
            StorageRouter.getMemoryCollection   = async () => null;

            // Peripheral pipeline phases neutralized (not the DreamService↔SemanticGraphExtractor handoff).
            DreamService.inferTestGapsFromSession    = async () => {};
            DreamService.inferConceptGraphGaps       = async () => {};
            DreamService.runGarbageCollection        = async () => {};
            DreamService.synthesizeGoldenPath        = async () => {};
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesUpserted: 0, memoriesSkipped: 0});
            ConceptIngestor.syncConceptsToGraph      = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph  = async () => {};
            TopologyInferenceEngine.extractTopology  = async () => {};
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            // THE H9 TRIGGER: the provider boundary streams an empty body (LM Studio silent-overflow
            // signature). SemanticGraphExtractor.executeTriVectorExtraction runs REAL and must
            // classify this as context-overflow + return null (no retry amplification).
            OpenAiCompatible.prototype.generate = async function() { return {content: ''}; };

            const result = await DreamService.processUndigestedSessions();

            // The REAL extractor returned null; assert DreamService's integration handling propagated it.
            const sessionState = result.perSessionStates.find(s => s.sessionId === 'agent-session-empty-overflow');
            expect(sessionState).toBeDefined();
            expect(sessionState.triVector.status).toBe('failed');
            expect(sessionState.triVector.errorKind).toBe('null-result');
            expect(sessionState.failureReasons).toContain('tri-vector extraction returned null');

            // graphDigested NOT set → session stays undigested for the next REM cycle, not silently masked.
            expect(sessionState.graphDigestedFlag).toBe(false);
            expect(sessionUpdates).toBe(0);

            // The real SemanticGraphExtractor surfaced the overflow as friction (not a silent drop).
            const friction = getAggregatedFrictions().find(item => item.assetRef === 'agent-session-empty-overflow');
            expect(friction).toBeDefined();
            expect(friction.symptom).toBe('context-overflow');
        } finally {
            aiConfig.modelProvider                           = orig.provider;
            DreamService.findUndigestedSessions              = orig.findUndigested;
            DreamService.sessionsCollection                  = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession            = orig.inferTest;
            DreamService.inferConceptGraphGaps               = orig.inferConcept;
            DreamService.runGarbageCollection                = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                = orig.synthesizeGolden;
            MemorySessionIngestor.syncSessionToGraph         = orig.syncSession;
            ConceptIngestor.syncConceptsToGraph              = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph          = orig.syncFs;
            TopologyInferenceEngine.extractTopology          = orig.extractTopo;
            TopologyInferenceEngine.getTopologyConflictCount = orig.conflictCount;
            StorageRouter.getMemoryCollection                = orig.getMemory;
            OpenAiCompatible.prototype.generate              = orig.generate;
            DreamService.isProcessing                        = orig.isProcessing;
            clearAggregatedFrictions();
        }
    });

    test('Sub 9 hypothesis 11: real DreamService→SemanticGraphExtractor integration — JSON-repair exhaustion keeps the session undigested, not silently completed (#12075)', async () => {
        // Integration complement to the isolated JSON-repair retry test (which calls the extractor
        // directly and exercises success-after-retry). Here the provider returns malformed JSON
        // on every attempt, so the REAL extractor exhausts its retry budget through the REAL
        // processUndigestedSessions choreography and returns null — and DreamService must record
        // the failure + keep the session undigested rather than mask it behind graphDigested.
        // Only peripheral phases + storage + the LLM boundary are neutralized. Hypothesis 11,
        // Discussion silent-failure enumeration §2.4.
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const mockSession = {
            id      : 'chroma-summary-json-exhaustion',
            document: 'Short episodic payload for the JSON-repair-exhaustion integration guard.',
            meta    : {sessionId: 'agent-session-json-exhaustion', title: 'JSON-exhaustion session'}
        };

        let sessionUpdates  = 0;
        let invocationCount = 0;

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            conflictCount     : TopologyInferenceEngine.getTopologyConflictCount,
            getMemory         : StorageRouter.getMemoryCollection,
            generate          : OpenAiCompatible.prototype.generate,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider'; // skip the openAiCompatible legacy provider ping
            DreamService.isProcessing = false;

            // Storage backend (in-memory) — NOT the choreography under test.
            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async () => { sessionUpdates++; }
            };
            StorageRouter.getMemoryCollection   = async () => null;

            // Peripheral pipeline phases neutralized (not the DreamService↔SemanticGraphExtractor handoff).
            DreamService.inferTestGapsFromSession    = async () => {};
            DreamService.inferConceptGraphGaps       = async () => {};
            DreamService.runGarbageCollection        = async () => {};
            DreamService.synthesizeGoldenPath        = async () => {};
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesUpserted: 0, memoriesSkipped: 0});
            ConceptIngestor.syncConceptsToGraph      = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph  = async () => {};
            TopologyInferenceEngine.extractTopology  = async () => {};
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            // THE H11 TRIGGER: provider returns unparseable JSON on every attempt. The REAL extractor
            // runs its full retry budget (no valid payload ever) and returns null.
            OpenAiCompatible.prototype.generate = async function() {
                invocationCount++;
                return {content: '```json\n{ "a2a_version": "1.0", "agent_id": "Antigravity" '}; // truncated, never valid
            };

            const result = await DreamService.processUndigestedSessions();

            // The real retry loop ran to exhaustion through the real choreography.
            expect(invocationCount).toBeGreaterThan(1);

            // The REAL extractor returned null; assert DreamService's integration handling propagated it.
            const sessionState = result.perSessionStates.find(s => s.sessionId === 'agent-session-json-exhaustion');
            expect(sessionState).toBeDefined();
            expect(sessionState.triVector.status).toBe('failed');
            expect(sessionState.triVector.errorKind).toBe('null-result');
            expect(sessionState.failureReasons).toContain('tri-vector extraction returned null');

            // graphDigested NOT set → session stays undigested for the next REM cycle, not silently masked.
            expect(sessionState.graphDigestedFlag).toBe(false);
            expect(sessionUpdates).toBe(0);
        } finally {
            aiConfig.modelProvider                           = orig.provider;
            DreamService.findUndigestedSessions              = orig.findUndigested;
            DreamService.sessionsCollection                  = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession            = orig.inferTest;
            DreamService.inferConceptGraphGaps               = orig.inferConcept;
            DreamService.runGarbageCollection                = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                = orig.synthesizeGolden;
            MemorySessionIngestor.syncSessionToGraph         = orig.syncSession;
            ConceptIngestor.syncConceptsToGraph              = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph          = orig.syncFs;
            TopologyInferenceEngine.extractTopology          = orig.extractTopo;
            TopologyInferenceEngine.getTopologyConflictCount = orig.conflictCount;
            StorageRouter.getMemoryCollection                = orig.getMemory;
            OpenAiCompatible.prototype.generate              = orig.generate;
            DreamService.isProcessing                        = orig.isProcessing;
        }
    });

    test('processUndigestedSessions rethrows garbage-collection failures (#11698)', async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const orig = {
            provider      : aiConfig.modelProvider,
            findUndigested: DreamService.findUndigestedSessions,
            runGarbageCol : DreamService.runGarbageCollection,
            loggerError   : logger.error,
            isProcessing  : DreamService.isProcessing
        };

        const errors = [];

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [];
            DreamService.runGarbageCollection   = async () => {
                throw new Error('simulated apoptosis failure');
            };
            logger.error = (...args) => { errors.push(args); };

            await expect(DreamService.processUndigestedSessions()).rejects.toThrow('simulated apoptosis failure');

            expect(DreamService.isProcessing).toBe(false);
            expect(errors.some(args => args[0] === '[DreamService] Failed to process undigested sessions:')).toBe(true);
        } finally {
            aiConfig.modelProvider              = orig.provider;
            DreamService.findUndigestedSessions = orig.findUndigested;
            DreamService.runGarbageCollection   = orig.runGarbageCol;
            logger.error                        = orig.loggerError;
            DreamService.isProcessing           = orig.isProcessing;
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
                // console.log('MOCK TRIGGERED Nodes SELECT!');
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
             { id: 'rejected-task', properties: { state: 'OPEN', labels: ['needs-re-triage'] } },
             // Planted CONCEPT with ORPHAN_CONCEPT gap to verify the ⚠️ section renders
             // in sandman_handoff.md alongside the existing TEST/GUIDE/EXAMPLE sections.
             { id: 'concept-orphan-render-test', properties: {
                 state        : 'OPEN',
                 capabilityGap: JSON.stringify([
                     "[ORPHAN_CONCEPT] The CONCEPT 'Reactivity' has no IMPLEMENTED_BY edge — either anchor it to a source file or retire the concept from nodes.jsonl if aspirational/stale."
                 ]),
                 lastGapCheck: Date.now()
             } },
             { id: 'concept-reverify-render-test', properties: {
                 state        : 'OPEN',
                 capabilityGap: JSON.stringify([
                     "[CONCEPT_REVERIFY_DUE] The CONCEPT 'Config System' has verifiedAt=null and needs source-grounded re-verification."
                 ]),
                 lastGapCheck: Date.now()
             } },
             { id: 'concept-kb-demand-render-test', properties: {
                 state        : 'OPEN',
                 capabilityGap: JSON.stringify([
                     '[KB_DEMAND_GAP] Agents asked "how does reactive config work?" 4 times (cluster abc123) but the mapped Concept Ontology area lacks strong guide coverage.'
                 ]),
                 lastGapCheck: Date.now()
             } }
        ];

        GraphService.db.edges.getByIndex = (idx, val) => {
            return GraphService.db.edges.items.filter(e => e[idx] === val);
        };
        const originalLinkNodes          = GraphService.linkNodes;
        const originalGetContextFrontier = GraphService.getContextFrontier;
        GraphService.linkNodes          = () => {};
        GraphService.getContextFrontier = () => ({ nodes: [], edges: [] });

        const baseGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async () => ({
             content: JSON.stringify({ strategic_brief: "Math synthesis works natively." })
        });

        const baseEmbed = TextEmbeddingService.embedText;
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        // Setup markdown with a conflicting gap to verify dynamic stripping / injection sequence
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const handoffFile = aiConfig.handoffFilePath,
              originalModelProvider = aiConfig.modelProvider;

        // Restore actual file system write for this test specifically
        const mockWriteFile = fs.writeFileSync;
        fs.writeFileSync = originalAppendFile;

        fs.writeFileSync(handoffFile, '- **[Codebase Gap]** Node `Fake`: Exists\n\n## Computed Golden Path\nOld Path\n', 'utf8');

        aiConfig.modelProvider = 'openAiCompatible';

        try {
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

            // Planted CONCEPT with [ORPHAN_CONCEPT] must surface as a dedicated section
            expect(finalContent).toContain('⚠️ Orphaned Concepts');
            expect(finalContent).toContain('Reactivity');
            expect(finalContent).toContain('Concept Reverification Queue');
            expect(finalContent).toContain('Config System');
            expect(finalContent).toContain('Agent FAQ Demand Gaps');
            expect(finalContent).toContain('reactive config');

            // Run AGAIN to trigger duplication prevention natively
            await DreamService.synthesizeGoldenPath();
            const twiceContent = fs.readFileSync(handoffFile, 'utf8');

            // Count capabilities gaps to ensure idempotence
            const firstCount = finalContent.split('[Codebase Gap]').length;
            const secondCount = twiceContent.split('[Codebase Gap]').length;
            expect(secondCount).toBe(firstCount);
        } finally {
            OpenAiCompatible.prototype.generate = baseGenerate;
            TextEmbeddingService.embedText = baseEmbed;
            fs.writeFileSync = mockWriteFile;
            StorageRouter.getSummaryCollection = originalGetSummary;
            StorageRouter.getGraphCollection = originalGetGraph;
            aiConfig.modelProvider = originalModelProvider;

            if (originalPrepare) {
                 GraphService.db.storage.db.prepare = originalPrepare;
            } else {
                 delete GraphService.db.storage.db.prepare;
            }
            GraphService.linkNodes          = originalLinkNodes;
            GraphService.getContextFrontier = originalGetContextFrontier;
        }
    });

    test('should retry extraction on malformed JSON payload up to 3 times to fix #9913', async () => {
        let executionCount = 0;
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
              baseGenerate = OpenAiCompatible.prototype.generate,
              originalModelProvider = aiConfig.modelProvider;

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

        aiConfig.modelProvider = 'openAiCompatible';

        try {
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
        } finally {
            aiConfig.modelProvider = originalModelProvider;
            OpenAiCompatible.prototype.generate = baseGenerate;
        }
    });
});
