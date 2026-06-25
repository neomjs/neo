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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../src/core/_export.mjs';
import InstanceManager       from '../../../../../../../src/manager/Instance.mjs';
import fs                    from 'fs';
import path                  from 'path';
import os                    from 'os';
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
    let   appendedContent = [];
    let   providerPrompt  = '';
    const freshVerifiedAt = new Date().toISOString();

    function createNlActionLogTable() {
        GraphService.db.storage.db.exec(`
            CREATE TABLE IF NOT EXISTS nl_action_log (
                id          TEXT PRIMARY KEY,
                agent_id    TEXT NOT NULL,
                session_id  TEXT,
                sequence_id TEXT NOT NULL,
                timestamp   INTEGER NOT NULL,
                tool        TEXT NOT NULL,
                args        TEXT NOT NULL,
                result      TEXT,
                success     INTEGER DEFAULT 0,
                duration_ms INTEGER,
                app_name    TEXT,
                reward      REAL DEFAULT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_nl_action_log_sequence  ON nl_action_log(sequence_id);
            CREATE INDEX IF NOT EXISTS idx_nl_action_log_session   ON nl_action_log(session_id);
            CREATE INDEX IF NOT EXISTS idx_nl_action_log_timestamp ON nl_action_log(timestamp);
        `);
    }

    function insertNlActionLogRow({
        id,
        sequenceId,
        timestamp,
        tool = 'create_component',
        args = {},
        result = {},
        success = 1
    }) {
        GraphService.db.storage.db.prepare(`
            INSERT INTO nl_action_log (
                id, agent_id, session_id, sequence_id, timestamp,
                tool, args, result, success, duration_ms, app_name
            ) VALUES (
                @id, 'neo-gpt-test', 'nl-action-digest-test', @sequenceId, @timestamp,
                @tool, @args, @result, @success, 12, 'DreamServiceTest'
            )
        `).run({
            id,
            sequenceId,
            timestamp,
            tool,
            args   : JSON.stringify(args),
            result : JSON.stringify(result),
            success: success ? 1 : 0
        });
    }

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
                    action : "alert",
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
                GraphService.db.storage.db.exec('DELETE FROM GraphLog; DROP TABLE IF EXISTS nl_action_log;');
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
                GraphService.db.storage.db.exec('DELETE FROM GraphLog; DROP TABLE IF EXISTS nl_action_log;');
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

        const tmpDir      = path.resolve(process.cwd(), 'tmp');
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
                        id              : 'node-feature-1',
                        type            : 'CLASS', // Changed from CONCEPT to bypass filter
                        name            : 'ButtonFeature',
                        description     : 'A newly formulated architectural concept.',
                        confidence      : 0.9,
                        logical_layer   : 'UI Components',
                        stability       : 'EXPERIMENTAL',
                        gravity_well    : true,
                        strategic_weight: 0.85,
                        tags            : ['Frontend', 'button'],
                        _resolvedId     : 'mock-file-1'
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
        const edge        = GraphService.db.edges.items.find(e =>
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

    test('executeNLActionDigest adds weak NL action VALIDATES evidence without erasing TEST_GAP (#9890)', async () => {
        createNlActionLogTable();

        GraphService.upsertNode({
            id        : 'class-neo-button-base',
            type      : 'CLASS',
            name      : 'Neo.button.Base',
            properties: {
                name         : 'Neo.button.Base',
                capabilityGap: JSON.stringify([
                    "[TEST_GAP] Structural node 'Neo.button.Base' lacks permanent Playwright coverage."
                ])
            }
        });

        const baseTimestamp = Date.now() - 5000;
        for (let i = 0; i < 4; i++) {
            insertNlActionLogRow({
                id        : `nl-success-${i}`,
                sequenceId: 'seq-weak-evidence',
                timestamp : baseTimestamp + i,
                args      : {parentId: 'root-container', config: {className: 'Neo.button.Base', componentId: 'button-instance-1'}},
                result    : {ok: true}
            });
        }
        insertNlActionLogRow({
            id        : 'nl-failure-0',
            sequenceId: 'seq-weak-evidence',
            timestamp : baseTimestamp + 10,
            args      : {parentId: 'root-container', config: {className: 'Neo.button.Base', componentId: 'button-instance-1'}},
            result    : {error: 'synthetic failure'},
            success   : 0
        });

        const result = await DreamService.executeNLActionDigest();

        const
            classNode    = GraphService.db.nodes.get('class-neo-button-base'),
            sequenceNode = GraphService.db.nodes.get('nl-action-sequence:seq-weak-evidence'),
            edge         = GraphService.db.edges.items.find(item =>
                item.source === 'nl-action-sequence:seq-weak-evidence' &&
                item.target === 'class-neo-button-base' &&
                item.type === 'VALIDATES'
            );

        expect(result.status).toBe('completed');
        expect(result.sequencesRead).toBe(1);
        expect(result.qualifyingSequences).toBe(1);
        expect(result.linkedEdges).toBe(1);
        expect(result.downgradedGaps).toBe(1);

        expect(sequenceNode).toBeTruthy();
        expect(sequenceNode.label).toBe('NL_ACTION_SEQUENCE');
        expect(sequenceNode.properties.successRate).toBe(0.8);
        expect(sequenceNode.properties.weakEvidence).toBe(true);

        expect(edge).toBeTruthy();
        expect(edge.properties.evidenceKind).toBe('neural-link-action-sequence');
        expect(edge.properties.weakEvidence).toBe(true);
        expect(edge.properties.weight).toBe(0.35);
        expect(edge.properties.successRate).toBe(0.8);
        expect(edge.properties.validationStrength).toBe('weak-runtime-interaction');
        expect(edge.properties.inferredBy).toBe('GapInferenceEngine.inferNlActionDigest');

        expect(classNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(classNode.properties.capabilityGap).toContain('[NL_ACTION_WEAK_EVIDENCE]');
        expect(classNode.properties.nlActionEvidence).toEqual(expect.arrayContaining([
            expect.objectContaining({
                sequenceId  : 'seq-weak-evidence',
                successRate : 0.8,
                weakEvidence: true,
                evidenceKind: 'neural-link-action-sequence'
            })
        ]));
    });

    test('executeNLActionDigest ignores sequences below the success threshold (#9890)', async () => {
        createNlActionLogTable();

        GraphService.upsertNode({
            id        : 'class-low-success',
            type      : 'CLASS',
            name      : 'Neo.grid.Container',
            properties: {
                name         : 'Neo.grid.Container',
                capabilityGap: JSON.stringify([
                    "[TEST_GAP] Structural node 'Neo.grid.Container' lacks permanent Playwright coverage."
                ])
            }
        });

        const baseTimestamp = Date.now() - 5000;
        for (let i = 0; i < 3; i++) {
            insertNlActionLogRow({
                id        : `low-success-${i}`,
                sequenceId: 'seq-low-success',
                timestamp : baseTimestamp + i,
                args      : {className: 'Neo.grid.Container'}
            });
        }
        for (let i = 0; i < 2; i++) {
            insertNlActionLogRow({
                id        : `low-failure-${i}`,
                sequenceId: 'seq-low-success',
                timestamp : baseTimestamp + 10 + i,
                args      : {className: 'Neo.grid.Container'},
                success   : 0
            });
        }

        const result = await DreamService.executeNLActionDigest();

        const
            classNode = GraphService.db.nodes.get('class-low-success'),
            edge      = GraphService.db.edges.items.find(item =>
                item.source === 'nl-action-sequence:seq-low-success' &&
                item.target === 'class-low-success' &&
                item.type === 'VALIDATES'
            );

        expect(result.status).toBe('completed');
        expect(result.sequencesRead).toBe(1);
        expect(result.qualifyingSequences).toBe(0);
        expect(result.linkedEdges).toBe(0);
        expect(result.downgradedGaps).toBe(0);
        expect(edge).toBeUndefined();
        expect(classNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(classNode.properties.capabilityGap).not.toContain('[NL_ACTION_WEAK_EVIDENCE]');
    });

    test('executeNLActionDigest skips cleanly when nl_action_log is absent (#9890)', async () => {
        const result = await DreamService.executeNLActionDigest();

        expect(result).toEqual({
            status: 'skipped',
            reason: 'nl-action-log-missing'
        });
    });

    test('executeNLActionDigest ignores read-tool args and nested result payload targets (#9890)', async () => {
        createNlActionLogTable();

        GraphService.upsertNode({
            id        : 'class-targeted-action',
            type      : 'CLASS',
            name      : 'Neo.button.TargetedAction',
            properties: {
                name         : 'Neo.button.TargetedAction',
                capabilityGap: JSON.stringify([
                    "[TEST_GAP] Structural node 'Neo.button.TargetedAction' lacks permanent Playwright coverage."
                ])
            }
        });
        GraphService.upsertNode({
            id        : 'class-result-only',
            type      : 'CLASS',
            name      : 'Neo.panel.ResultOnly',
            properties: {
                name         : 'Neo.panel.ResultOnly',
                capabilityGap: JSON.stringify([
                    "[TEST_GAP] Structural node 'Neo.panel.ResultOnly' lacks permanent Playwright coverage."
                ])
            }
        });

        insertNlActionLogRow({
            id        : 'result-overharvest-regression',
            sequenceId: 'seq-result-overharvest',
            timestamp : Date.now() - 5000,
            tool      : 'get_component_tree',
            args      : {className: 'Neo.button.TargetedAction', id: 'result-only-component'},
            result    : {
                root: {
                    className: 'Neo.panel.ResultOnly',
                    id       : 'result-only-component',
                    children : [{className: 'Neo.panel.ResultOnly'}]
                }
            }
        });

        const result = await DreamService.executeNLActionDigest();

        const
            targetEdge = GraphService.db.edges.items.find(item =>
                item.source === 'nl-action-sequence:seq-result-overharvest' &&
                item.target === 'class-targeted-action' &&
                item.type === 'VALIDATES'
            ),
            resultOnlyEdge = GraphService.db.edges.items.find(item =>
                item.source === 'nl-action-sequence:seq-result-overharvest' &&
                item.target === 'class-result-only' &&
                item.type === 'VALIDATES'
            ),
            targetNode     = GraphService.db.nodes.get('class-targeted-action'),
            resultOnlyNode = GraphService.db.nodes.get('class-result-only');

        expect(result.qualifyingSequences).toBe(0);
        expect(result.targetMatches).toBe(0);
        expect(targetEdge).toBeUndefined();
        expect(resultOnlyEdge).toBeUndefined();
        expect(targetNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(targetNode.properties.capabilityGap).not.toContain('[NL_ACTION_WEAK_EVIDENCE]');
        expect(resultOnlyNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(resultOnlyNode.properties.capabilityGap).not.toContain('[NL_ACTION_WEAK_EVIDENCE]');
    });

    test('executeNLActionDigest recomputes stale weak-evidence annotations (#9890)', async () => {
        createNlActionLogTable();

        GraphService.upsertNode({
            id        : 'class-stale-nl-evidence',
            type      : 'CLASS',
            name      : 'Neo.panel.StaleEvidence',
            properties: {
                name         : 'Neo.panel.StaleEvidence',
                capabilityGap: JSON.stringify([
                    "[TEST_GAP] Structural node 'Neo.panel.StaleEvidence' lacks permanent Playwright coverage. [NL_ACTION_WEAK_EVIDENCE] Old sequence evidence."
                ]),
                nlActionEvidence: [{sequenceId: 'old-seq'}]
            }
        });

        const result    = await DreamService.executeNLActionDigest();
        const classNode = GraphService.db.nodes.get('class-stale-nl-evidence');

        expect(result.resetWeakEvidenceAnnotations).toBe(1);
        expect(result.qualifyingSequences).toBe(0);
        expect(classNode.properties.capabilityGap).toContain('[TEST_GAP]');
        expect(classNode.properties.capabilityGap).not.toContain('[NL_ACTION_WEAK_EVIDENCE]');
        expect(classNode.properties.nlActionEvidence).toEqual([]);
    });

    test('findUndigestedSessions fails loud when remSleepBatchLimit is malformed in the imported config', async () => {
        const aiConfig                   = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
              originalRemSleepBatchLimit = aiConfig.remSleepBatchLimit;

        aiConfig.remSleepBatchLimit = Number.NaN;

        try {
            await expect(DreamService.findUndigestedSessions()).rejects.toThrow(/Required AiConfig leaf "remSleepBatchLimit"/);
        } finally {
            aiConfig.remSleepBatchLimit = originalRemSleepBatchLimit ?? 10;
        }
    });

    test('findUndigestedSessions mixes a fresh reserve with the aged Chroma tail (#13697)', async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const original = {
            summarizationBatchLimit: aiConfig.summarizationBatchLimit,
            remSleepBatchLimit     : aiConfig.remSleepBatchLimit,
            sessionsCollection     : DreamService.sessionsCollection
        };

        const rows = [
            {id: 'fresh-5', document: 'fresh 5', meta: {sessionId: 'fresh-5', timestamp: 5000}},
            {id: 'fresh-4', document: 'fresh 4', meta: {sessionId: 'fresh-4', timestamp: 4000}},
            {id: 'fresh-3', document: 'fresh 3', meta: {sessionId: 'fresh-3', timestamp: 3000}},
            {id: 'fresh-2', document: 'fresh 2', meta: {sessionId: 'fresh-2', timestamp: 2000}},
            {id: 'fresh-1', document: 'fresh 1', meta: {sessionId: 'fresh-1', timestamp: 1000}},
            {id: 'digested-old', document: 'digested', meta: {sessionId: 'digested-old', timestamp: 5, graphDigested: 'true'}},
            {id: 'old-3', document: 'old 3', meta: {sessionId: 'old-3', timestamp: 30}},
            {id: 'old-2', document: 'old 2', meta: {sessionId: 'old-2', timestamp: 20}},
            {id: 'old-1', document: 'old 1', meta: {sessionId: 'old-1', timestamp: 10}},
            {id: 'mid', document: 'mid', meta: {sessionId: 'mid', timestamp: 500}}
        ];
        const calls = [];

        aiConfig.summarizationBatchLimit = 6;
        aiConfig.remSleepBatchLimit      = 4;
        DreamService.sessionsCollection  = {
            async count() {
                return rows.length
            },
            async get({include, limit, offset = 0}) {
                calls.push({include, limit, offset});
                const page = rows.slice(offset, offset + limit);
                return {
                    ids      : page.map(row => row.id),
                    documents: page.map(row => row.document),
                    metadatas: page.map(row => row.meta)
                }
            }
        };

        try {
            const result = await DreamService.findUndigestedSessions();

            expect(calls).toEqual([
                {include: ['metadatas', 'documents'], limit: 6, offset: 0},
                {include: ['metadatas', 'documents'], limit: 6, offset: 4}
            ]);
            expect(result.map(row => row.id)).toEqual(['fresh-5', 'fresh-4', 'old-1', 'old-2']);
            expect(result.map(row => row.meta.sessionId)).toEqual(['fresh-5', 'fresh-4', 'old-1', 'old-2']);
        } finally {
            aiConfig.summarizationBatchLimit = original.summarizationBatchLimit ?? 2000;
            aiConfig.remSleepBatchLimit      = original.remSleepBatchLimit ?? 10;
            DreamService.sessionsCollection  = original.sessionsCollection;
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

        const covered      = GraphService.db.nodes.get('concept-covered');
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
                clusterId             : 'kb-demand-cluster',
                canonicalQuery        : 'How should agents use ask_knowledge_base?',
                count                 : 3,
                relatedConceptIds     : ['concept-kb-demand'],
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

    test('process/MX concepts should be excluded from code-doc gap audit (#13840)', async () => {
        GraphService.upsertNode({
            id        : 'concept-process-mx',
            type      : 'CONCEPT',
            name      : 'Coordination Saturation Cycle',
            properties: {
                name           : 'Coordination Saturation Cycle',
                tier           : 1,
                uniqueToNeo    : true,
                verifiedAt     : freshVerifiedAt,
                weight         : 1.3,
                validated      : true,
                ontologyLayer  : 'process-mx',
                codeGapEligible: false
            }
        });

        await DreamService.inferConceptGraphGaps();

        const node = GraphService.db.nodes.get('concept-process-mx');

        // Weight 1.3 and no edges would normally emit GUIDE_GAP + ORPHAN_CONCEPT. Process/MX
        // concepts are a separate operational vocabulary layer, not code ontology targets.
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
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
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
        let nlActionDigestCalls                    = 0;
        let conceptGapCalls                        = 0;
        let sessionUpdateCount                     = 0;
        let nlDigestCalledAfterLastSessionUpdate   = false;
        let conceptGapCalledAfterLastSessionUpdate = false;
        let conceptGapCalledAfterNlDigest          = false;

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            executeNlDigest   : DreamService.executeNLActionDigest,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => mockSessions;
            DreamService.sessionsCollection     = {
                update: async () => { sessionUpdateCount++; }
            };
            DreamService.inferTestGapsFromSession = async () => { testGapCalls++; };
            DreamService.executeNLActionDigest     = async () => {
                nlActionDigestCalls++;
                nlDigestCalledAfterLastSessionUpdate = (sessionUpdateCount === sessionCount);
                return {status: 'completed'};
            };
            DreamService.inferConceptGraphGaps    = async () => {
                conceptGapCalls++;
                conceptGapCalledAfterLastSessionUpdate = (sessionUpdateCount === sessionCount);
                conceptGapCalledAfterNlDigest          = (nlActionDigestCalls === 1);
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
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};

            await DreamService.processUndigestedSessions();

            expect(testGapCalls).toBe(sessionCount);
            expect(nlActionDigestCalls).toBe(1);
            expect(conceptGapCalls).toBe(1);
            expect(nlDigestCalledAfterLastSessionUpdate).toBe(true);
            expect(conceptGapCalledAfterLastSessionUpdate).toBe(true);
            expect(conceptGapCalledAfterNlDigest).toBe(true);
        } finally {
            aiConfig.modelProvider                            = orig.provider;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.executeNLActionDigest                = orig.executeNlDigest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('processUndigestedSessions threads complete raw memory turns into topology inference (#12073)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const rawTurns    = ['prompt turn body', 'response turn body'];
        const mockSession = {
            id      : 'chroma-summary-raw-turns',
            document: 'summary fallback should not reach topology',
            meta    : {sessionId: 'agent-session-raw-turns', title: 'Raw turn session'}
        };

        let triVectorDocument;
        let topologyArgs;

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            executeNlDigest   : DreamService.executeNLActionDigest,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            conflictCount     : TopologyInferenceEngine.getTopologyConflictCount,
            getMemory         : StorageRouter.getMemoryCollection,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {update: async () => {}};
            StorageRouter.getMemoryCollection   = async () => ({
                get: async () => ({documents: rawTurns})
            });
            DreamService.inferTestGapsFromSession = async () => {};
            DreamService.executeNLActionDigest    = async () => ({status: 'completed'});
            DreamService.inferConceptGraphGaps    = async () => {};
            DreamService.runGarbageCollection     = async () => {};
            DreamService.synthesizeGoldenPath     = async () => {};
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesSkipped: 0, memoriesUpserted: rawTurns.length});
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            SemanticGraphExtractor.executeTriVectorExtraction = async session => {
                triVectorDocument = session.document;
                return {session_artifact: {graph: {nodes: [], edges: []}}};
            };
            TopologyInferenceEngine.extractTopology = async (contextText, sessionId, options) => {
                topologyArgs = {contextText, sessionId, options};
                return {chunked: true, chunks: {total: 2, skipped: 0, processed: 2}, conflictCount: 0};
            };
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            await DreamService.processUndigestedSessions();

            expect(triVectorDocument).toBe(rawTurns.join('\n\n---\n\n'));
            expect(topologyArgs).toMatchObject({
                contextText: rawTurns.join('\n\n---\n\n'),
                sessionId  : 'agent-session-raw-turns',
                options    : {turnDocuments: rawTurns}
            });
        } finally {
            aiConfig.modelProvider                            = orig.provider;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.executeNLActionDigest                = orig.executeNlDigest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            TopologyInferenceEngine.getTopologyConflictCount  = orig.conflictCount;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('TopologyInferenceEngine chunks complete memory turns and bounds topology output (#12073)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const turnDocuments = Array.from({length: 15}, (_, index) => `turn-${index}\n${'x'.repeat(1200)}`);
        const providerCalls = [];

        const orig = {
            graphProvider : aiConfig.graphProvider,
            chatContext   : aiConfig.localModels.chat.contextLimitTokens,
            chatGraphChunk: aiConfig.localModels.chat.graphChunkLimitTokens,
            chatGraphOut  : aiConfig.localModels.chat.graphOutputLimitTokens,
            chatSafe      : aiConfig.localModels.chat.safeProcessingLimitTokens,
            graphReasoning: aiConfig.localModels.chat.graphReasoningEffort,
            openAiModel   : aiConfig.openAiCompatible.model,
            generate      : OpenAiCompatible.prototype.generate,
            loggerInfo    : logger.info
        };
        const infoCalls = [];

        try {
            aiConfig.graphProvider                                = 'openAiCompatible';
            aiConfig.openAiCompatible.model                       = 'topology-test-model';
            aiConfig.localModels.chat.contextLimitTokens          = 8192;
            aiConfig.localModels.chat.graphChunkLimitTokens       = 4800;
            aiConfig.localModels.chat.graphOutputLimitTokens      = 512;
            aiConfig.localModels.chat.safeProcessingLimitTokens   = 5000;
            aiConfig.localModels.chat.graphReasoningEffort        = 'none';
            logger.info = (...args) => infoCalls.push(args.join(' '));
            OpenAiCompatible.prototype.generate = async (prompt, providerOptions) => {
                providerCalls.push({prompt, providerOptions});
                return {content: '{"conflicts":[]}', finish_reason: 'stop'};
            };

            const result = await TopologyInferenceEngine.extractTopology(
                turnDocuments.join('\n\n---\n\n'),
                'topology-turns-test',
                {turnDocuments}
            );

            expect(result.chunked).toBe(true);
            expect(providerCalls.length).toBeGreaterThan(1);
            expect(result.chunks.total).toBe(providerCalls.length);
            expect(providerCalls[0].prompt).toContain('source turn indices');
            expect(providerCalls[0].prompt).toContain('turn-0');
            expect(providerCalls[0].prompt).not.toContain('turn-14');
            expect(providerCalls[0].providerOptions).toMatchObject({
                reasoning_effort    : 'none',
                responseSchemaName  : 'topologyConflicts',
                responseSchemaStrict: true,
                maxCompletionTokens : 512
            });
            expect(providerCalls[0].providerOptions.responseSchema.properties.conflicts.maxItems).toBe(5);
            expect(infoCalls.some(line => line.includes('conflicts=0') && line.includes('outputLimitTokens=512'))).toBe(true);
        } finally {
            aiConfig.graphProvider                              = orig.graphProvider;
            aiConfig.localModels.chat.contextLimitTokens        = orig.chatContext;
            aiConfig.localModels.chat.graphChunkLimitTokens     = orig.chatGraphChunk;
            aiConfig.localModels.chat.graphOutputLimitTokens    = orig.chatGraphOut;
            aiConfig.localModels.chat.safeProcessingLimitTokens = orig.chatSafe;
            aiConfig.localModels.chat.graphReasoningEffort      = orig.graphReasoning;
            aiConfig.openAiCompatible.model                     = orig.openAiModel;
            OpenAiCompatible.prototype.generate                 = orig.generate;
            logger.info                                         = orig.loggerInfo;
        }
    });

    test('TopologyInferenceEngine classifies non-empty invalid topology output as parse failure (#13995)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;
        const {
            clearAggregatedFrictions,
            getAggregatedFrictions
        } = await import('../../../../../../../ai/services/memory-core/helpers/consumerFrictionHelper.mjs');

        const orig = {
            graphProvider : aiConfig.graphProvider,
            chatContext   : aiConfig.localModels.chat.contextLimitTokens,
            chatGraphChunk: aiConfig.localModels.chat.graphChunkLimitTokens,
            chatGraphOut  : aiConfig.localModels.chat.graphOutputLimitTokens,
            chatSafe      : aiConfig.localModels.chat.safeProcessingLimitTokens,
            graphReasoning: aiConfig.localModels.chat.graphReasoningEffort,
            openAiModel   : aiConfig.openAiCompatible.model,
            generate      : OpenAiCompatible.prototype.generate,
            loggerWarn    : logger.warn
        };
        const warnCalls = [];

        try {
            clearAggregatedFrictions();

            aiConfig.graphProvider                              = 'openAiCompatible';
            aiConfig.openAiCompatible.model                     = 'topology-parse-test-model';
            aiConfig.localModels.chat.contextLimitTokens        = 8192;
            aiConfig.localModels.chat.graphChunkLimitTokens     = 4800;
            aiConfig.localModels.chat.graphOutputLimitTokens    = 512;
            aiConfig.localModels.chat.safeProcessingLimitTokens = 5000;
            aiConfig.localModels.chat.graphReasoningEffort      = 'none';
            logger.warn = (...args) => warnCalls.push(args.join(' '));
            OpenAiCompatible.prototype.generate = async () => ({
                content      : 'this is not json',
                finish_reason: 'stop'
            });

            for (let i = 0; i < 3; i++) {
                const result = await TopologyInferenceEngine.extractTopology(
                    'turn body',
                    'topology-parse-failure-test',
                    {turnDocuments: ['turn body']}
                );

                expect(result.conflictCount).toBe(0);
                expect(result.chunks.parseFailed).toBe(1);
                expect(result.chunks.processed).toBe(0);
            }

            expect(warnCalls.some(line => line.includes('Failed to parse topology-conflict payload'))).toBe(true);
            expect(getAggregatedFrictions().some(friction =>
                friction.consumer === 'TopologyInferenceEngine' &&
                friction.symptom === 'parse-failure' &&
                friction.model === 'topology-parse-test-model'
            )).toBe(true);
        } finally {
            clearAggregatedFrictions();
            aiConfig.graphProvider                              = orig.graphProvider;
            aiConfig.localModels.chat.contextLimitTokens        = orig.chatContext;
            aiConfig.localModels.chat.graphChunkLimitTokens     = orig.chatGraphChunk;
            aiConfig.localModels.chat.graphOutputLimitTokens    = orig.chatGraphOut;
            aiConfig.localModels.chat.safeProcessingLimitTokens = orig.chatSafe;
            aiConfig.localModels.chat.graphReasoningEffort      = orig.graphReasoning;
            aiConfig.openAiCompatible.model                     = orig.openAiModel;
            OpenAiCompatible.prototype.generate                 = orig.generate;
            logger.warn                                         = orig.loggerWarn;
        }
    });

    test('processUndigestedSessions does not set graphDigested when memory ingestion reports errors (#10460)', async () => {
        // Regression guard: the Tri-Vector extractor can succeed from
        // `session.document` even when MemorySessionIngestor partially failed to upsert MEMORY
        // nodes. Keep such sessions undigested so the next REM cycle retries the missing graph
        // rows instead of permanently masking them behind `graphDigested: true`.

        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const mockSession = {
            id      : 'chroma-summary-partial',
            document: 'mock-document',
            meta    : {sessionId: 'agent-session-partial', title: 'Partial ingest session'}
        };

        let   testGapCalls          = 0;
        let   conceptGapCalls       = 0;
        let   sessionUpdates        = 0;
        const sessionUpdatePayloads = [];
        const infoMessages          = [];
        const warnMessages          = [];

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            getMemory         : StorageRouter.getMemoryCollection,
            loggerInfo        : logger.info,
            loggerWarn        : logger.warn,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async (payload) => { sessionUpdates++; sessionUpdatePayloads.push(payload); }
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
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            StorageRouter.getMemoryCollection       = async () => null;

            logger.info = (...args) => { infoMessages.push(args.join(' ')); };
            logger.warn = (...args) => { warnMessages.push(args.join(' ')); };

            await DreamService.processUndigestedSessions();

            expect(testGapCalls).toBe(1);
            expect(conceptGapCalls).toBe(1);
            // An ingestion-error no longer no-ops. The session is updated to TRACK the failed attempt
            // (digestState/digestAttempts/deferReason), but graphDigested is still NOT set — so the
            // never-falsely-digested invariant (retried next cycle) holds and is strengthened.
            // Attempt 1 of MAX_DIGEST_ATTEMPTS → stays `undigested` (re-servable), not yet `deferred`.
            expect(sessionUpdates).toBe(1);
            const failedMeta = sessionUpdatePayloads[0].metadatas[0];
            expect(failedMeta.graphDigested).toBeUndefined();
            expect(failedMeta.digestState).toBe('undigested');
            expect(failedMeta.digestAttempts).toBe(1);
            expect(failedMeta.deferReason).toBe('ingestion-failure');
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
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            logger.info                                      = orig.loggerInfo;
            logger.warn                                      = orig.loggerWarn;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('findUndigestedSessions excludes bounded-out sessions and re-serves back-compat undigested rows (#13835)', async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const original = {
            summarizationBatchLimit: aiConfig.summarizationBatchLimit,
            remSleepBatchLimit     : aiConfig.remSleepBatchLimit,
            sessionsCollection     : DreamService.sessionsCollection
        };

        // Mix: a fresh undigested row, a legacy `deferred` row, a terminal `undigestible` row,
        // a digested row, and a back-compat row that predates digestState (no flag at all — must still
        // be served). The bounded-out states are excluded from the steady cadence.
        const rows = [
            {id: 'undigested-new', document: 'a', meta: {sessionId: 'undigested-new', timestamp: 5000}},
            {id: 'deferred-x',     document: 'b', meta: {sessionId: 'deferred-x', timestamp: 4000, digestState: 'deferred', deferReason: 'skip-over-band', digestAttempts: 3}},
            {id: 'undigestible-x', document: 'c', meta: {sessionId: 'undigestible-x', timestamp: 3000, digestState: 'undigestible', deferReason: 'under-band-choke', digestAttempts: 3}},
            {id: 'digested-x',     document: 'd', meta: {sessionId: 'digested-x', timestamp: 2000, graphDigested: true, digestState: 'digested'}},
            {id: 'undigested-old', document: 'e', meta: {sessionId: 'undigested-old', timestamp: 1000}}
        ];

        aiConfig.summarizationBatchLimit = 10;
        aiConfig.remSleepBatchLimit      = 10;
        DreamService.sessionsCollection  = {
            async count() { return rows.length },
            async get({limit, offset = 0}) {
                const page = rows.slice(offset, offset + limit);
                return {
                    ids      : page.map(row => row.id),
                    documents: page.map(row => row.document),
                    metadatas: page.map(row => row.meta)
                }
            }
        };

        try {
            const ids = (await DreamService.findUndigestedSessions()).map(row => row.id);
            // Load-reduction: bounded-out rows are excluded from the steady cadence.
            expect(ids).not.toContain('deferred-x');
            expect(ids).not.toContain('undigestible-x');
            // Digested stays excluded; back-compat undigested rows (no digestState) are still served.
            expect(ids).not.toContain('digested-x');
            expect(ids).toContain('undigested-new');
            expect(ids).toContain('undigested-old');
        } finally {
            aiConfig.summarizationBatchLimit = original.summarizationBatchLimit ?? 2000;
            aiConfig.remSleepBatchLimit      = original.remSleepBatchLimit ?? 10;
            DreamService.sessionsCollection  = original.sessionsCollection;
        }
    });

    test('processUndigestedSessions bounds the re-serve immediately for skip-over-band parser failures (#13984)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        // A provider-size precheck failure has already proven this payload cannot fit the current graph
        // parser budget. It must leave the steady cadence on the first classified failure rather than
        // re-paying the same model-lock cost until MAX attempts.
        const mockSession = {
            id      : 'chroma-summary-overband',
            document: 'x'.repeat(400_000),
            meta    : {sessionId: 'agent-session-overband', title: 'Over-band session'}
        };

        const sessionUpdatePayloads = [];
        const orig                  = {
            provider          : aiConfig.modelProvider,
            safeProcessing    : aiConfig.localModels.chat.safeProcessingLimitTokens,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            getMemory         : StorageRouter.getMemoryCollection,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider                                  = 'mock-provider';
            aiConfig.localModels.chat.safeProcessingLimitTokens      = 100_000;
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async (payload) => { sessionUpdatePayloads.push(payload); }
            };
            DreamService.inferTestGapsFromSession = async () => {};
            DreamService.inferConceptGraphGaps    = async () => {};
            DreamService.runGarbageCollection     = async () => {};
            DreamService.synthesizeGoldenPath     = async () => {};

            SemanticGraphExtractor.executeTriVectorExtraction = async () => ({
                ok                : false,
                deferReason       : 'skip-over-band',
                frictionSymptom   : 'size-precheck-skip',
                terminalForCadence: true,
                evidence          : {attempts: 1, note: 'unit over-band guardrail'}
            });
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesSkipped: 0, memoriesUpserted: 1});
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            StorageRouter.getMemoryCollection       = async () => null;

            await DreamService.processUndigestedSessions();

            expect(sessionUpdatePayloads.length).toBe(1);
            const meta = sessionUpdatePayloads[0].metadatas[0];
            expect(meta.graphDigested).toBeUndefined();   // never falsely-digested
            expect(meta.digestState).toBe('undigestible'); // first size-classified failure → bounded out
            expect(meta.digestAttempts).toBe(1);
            expect(meta.deferReason).toBe('skip-over-band');
        } finally {
            aiConfig.modelProvider                                  = orig.provider;
            aiConfig.localModels.chat.safeProcessingLimitTokens      = orig.safeProcessing;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('processUndigestedSessions defers typed under-band-choke once it reaches MAX (#13974)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        // Typed extractor failure semantics remove the payload-size guess: when the extractor reports
        // cadence-terminal under-band choke, DreamService may bound it out after maxDigestAttempts.
        const mockSession = {
            id      : 'chroma-summary-underband',
            document: 'tiny',
            meta    : {sessionId: 'agent-session-underband', title: 'Under-band null session', digestAttempts: 5}
        };

        const sessionUpdatePayloads = [];
        const orig                  = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            getMemory         : StorageRouter.getMemoryCollection,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async (payload) => { sessionUpdatePayloads.push(payload); }
            };
            DreamService.inferTestGapsFromSession = async () => {};
            DreamService.inferConceptGraphGaps    = async () => {};
            DreamService.runGarbageCollection     = async () => {};
            DreamService.synthesizeGoldenPath     = async () => {};

            SemanticGraphExtractor.executeTriVectorExtraction = async () => ({
                ok                : false,
                deferReason       : 'under-band-choke',
                frictionSymptom   : 'context-overflow',
                terminalForCadence: true,
                evidence          : {attempts: 1, note: 'unit under-band choke'}
            });
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesSkipped: 0, memoriesUpserted: 1});
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            StorageRouter.getMemoryCollection       = async () => null;

            await DreamService.processUndigestedSessions();

            expect(sessionUpdatePayloads.length).toBe(1);
            const meta = sessionUpdatePayloads[0].metadatas[0];
            expect(meta.graphDigested).toBeUndefined();    // never falsely-digested
            expect(meta.deferReason).toBe('under-band-choke');
            expect(meta.digestAttempts).toBe(6);            // 5 prior + this one
            expect(meta.digestState).toBe('undigestible');  // typed terminal descriptor → bounded out
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
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('processUndigestedSessions does NOT defer a transient ingestion-failure — it keeps retrying past MAX so a digestible session is never silently dropped (#13835)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        // The session has already failed 5 times (well past MAX) via TRANSIENT ingestion errors while its
        // extraction SUCCEEDS — it is digestible, only the graph-ingest keeps hitting soft errors (DB-busy
        // / embed-timeout). A transient failure must NOT be bounded out as `deferred`: that would silently
        // drop a digestible session from the graph forever. It stays `undigested` (re-served, retried) —
        // only permanent model-side un-digestibility defers.
        const mockSession = {
            id      : 'chroma-summary-transient',
            document: 'recoverable session payload',
            meta    : {sessionId: 'agent-session-transient', title: 'Transient ingest failure', digestAttempts: 5}
        };

        const sessionUpdatePayloads = [];
        const orig                  = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            getMemory         : StorageRouter.getMemoryCollection,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => [mockSession];
            DreamService.sessionsCollection     = {
                update: async (payload) => { sessionUpdatePayloads.push(payload); }
            };
            DreamService.inferTestGapsFromSession = async () => {};
            DreamService.inferConceptGraphGaps    = async () => {};
            DreamService.runGarbageCollection     = async () => {};
            DreamService.synthesizeGoldenPath     = async () => {};

            // Extraction SUCCEEDS (digestible) — only the ingest reports soft, transient errors.
            SemanticGraphExtractor.executeTriVectorExtraction = async () => ({status: 'ok'});
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: ['database is locked, retry'], memoriesSkipped: 0, memoriesUpserted: 0});
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            StorageRouter.getMemoryCollection       = async () => null;

            await DreamService.processUndigestedSessions();

            expect(sessionUpdatePayloads.length).toBe(1);
            const meta = sessionUpdatePayloads[0].metadatas[0];
            expect(meta.graphDigested).toBeUndefined();    // ingest failed → never falsely-digested
            expect(meta.deferReason).toBe('ingestion-failure');
            expect(meta.digestAttempts).toBe(6);            // 5 prior + this one
            expect(meta.digestState).toBe('undigested');    // TRANSIENT → keeps retrying, NOT bounded to `deferred`
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
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('processUndigestedSessions fault-isolates thrown per-session failures and digests remaining sessions (#13850)', async () => {
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
        const ConceptIngestor         = (await import('../../../../../../../ai/services/ingestion/ConceptIngestor.mjs')).default;
        const FileSystemIngestor      = (await import('../../../../../../../ai/services/memory-core/FileSystemIngestor.mjs')).default;
        const TopologyInferenceEngine = (await import('../../../../../../../ai/services/graph/TopologyInferenceEngine.mjs')).default;

        const mockSessions = [
            {
                id      : 'chroma-summary-poison',
                document: 'poison session payload',
                meta    : {sessionId: 'agent-session-poison', title: 'Poison Session'}
            },
            {
                id      : 'chroma-summary-good',
                document: 'good session payload',
                meta    : {sessionId: 'agent-session-good', title: 'Good Session'}
            }
        ];

        const sessionUpdatePayloads = [];
        let   conceptGapCalls       = 0;
        let   nlActionDigestCalls   = 0;
        let   garbageCalls          = 0;

        const orig = {
            provider          : aiConfig.modelProvider,
            findUndigested    : DreamService.findUndigestedSessions,
            sessionsCollection: DreamService.sessionsCollection,
            inferTest         : DreamService.inferTestGapsFromSession,
            executeNlDigest   : DreamService.executeNLActionDigest,
            inferConcept      : DreamService.inferConceptGraphGaps,
            runGarbageCol     : DreamService.runGarbageCollection,
            synthesizeGolden  : DreamService.synthesizeGoldenPath,
            triVector         : SemanticGraphExtractor.executeTriVectorExtraction,
            syncSession       : MemorySessionIngestor.syncSessionToGraph,
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
            syncConcepts      : ConceptIngestor.syncConceptsToGraph,
            syncFs            : FileSystemIngestor.syncWorkspaceToGraph,
            extractTopo       : TopologyInferenceEngine.extractTopology,
            conflictCount     : TopologyInferenceEngine.getTopologyConflictCount,
            getMemory         : StorageRouter.getMemoryCollection,
            isProcessing      : DreamService.isProcessing
        };

        try {
            aiConfig.modelProvider    = 'mock-provider';
            DreamService.isProcessing = false;

            DreamService.findUndigestedSessions = async () => mockSessions;
            DreamService.sessionsCollection     = {
                update: async (payload) => { sessionUpdatePayloads.push(payload); }
            };
            StorageRouter.getMemoryCollection       = async () => null;
            DreamService.inferTestGapsFromSession   = async () => {};
            DreamService.executeNLActionDigest      = async () => { nlActionDigestCalls++; return {status: 'completed'}; };
            DreamService.inferConceptGraphGaps      = async () => { conceptGapCalls++; };
            DreamService.runGarbageCollection       = async () => { garbageCalls++; };
            DreamService.synthesizeGoldenPath       = async () => {};
            MemorySessionIngestor.syncSessionToGraph = async () => ({errors: [], memoriesSkipped: 0, memoriesUpserted: 1});
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph     = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph = async () => {};
            TopologyInferenceEngine.extractTopology = async () => {};
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            SemanticGraphExtractor.executeTriVectorExtraction = async session => {
                if (session.meta.sessionId === 'agent-session-poison') {
                    throw new Error('simulated extractor crash');
                }

                return {session_artifact: {graph: {nodes: [], edges: []}}};
            };

            const result = await DreamService.processUndigestedSessions();

            const poisonState = result.perSessionStates.find(item => item.sessionId === 'agent-session-poison'),
                  goodState   = result.perSessionStates.find(item => item.sessionId === 'agent-session-good');

            expect(poisonState).toBeDefined();
            expect(poisonState.triVector.status).toBe('failed');
            expect(poisonState.triVector.errorKind).toBe('simulated extractor crash');
            expect(poisonState.failureReasons).toContain('simulated extractor crash');
            expect(poisonState.graphDigestedFlag).toBe(false);

            expect(goodState).toBeDefined();
            expect(goodState.triVector.status).toBe('completed');
            expect(goodState.graphDigestedFlag).toBe(true);

            expect(sessionUpdatePayloads).toHaveLength(1);
            expect(sessionUpdatePayloads[0]).toMatchObject({
                ids      : ['chroma-summary-good'],
                metadatas: [{sessionId: 'agent-session-good', graphDigested: true, digestState: 'digested'}]
            });
            expect(nlActionDigestCalls).toBe(1);
            expect(conceptGapCalls).toBe(1);
            expect(garbageCalls).toBe(1);
        } finally {
            aiConfig.modelProvider                            = orig.provider;
            DreamService.findUndigestedSessions               = orig.findUndigested;
            DreamService.sessionsCollection                   = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession             = orig.inferTest;
            DreamService.executeNLActionDigest                = orig.executeNlDigest;
            DreamService.inferConceptGraphGaps                = orig.inferConcept;
            DreamService.runGarbageCollection                 = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                 = orig.synthesizeGolden;
            SemanticGraphExtractor.executeTriVectorExtraction = orig.triVector;
            MemorySessionIngestor.syncSessionToGraph          = orig.syncSession;
            AdrIngestor.syncAdrsToGraph                       = orig.syncAdrs;
            ConceptIngestor.syncConceptsToGraph               = orig.syncConcepts;
            FileSystemIngestor.syncWorkspaceToGraph           = orig.syncFs;
            TopologyInferenceEngine.extractTopology           = orig.extractTopo;
            TopologyInferenceEngine.getTopologyConflictCount  = orig.conflictCount;
            StorageRouter.getMemoryCollection                 = orig.getMemory;
            DreamService.isProcessing                         = orig.isProcessing;
        }
    });

    test('Sub 9 hypothesis 9 (PRIMARY): real DreamService→SemanticGraphExtractor integration — empty-response overflow keeps the session undigested + surfaces friction, not silently completed (#12075)', async () => {
        // Integration complement to the Phase-A isolated extractor test
        // (SemanticGraphExtractor.spec `Sub 9 hypotheses 9 and 11`). Phase-A stubs the service
        // choreography; this drives the REAL processUndigestedSessions → SemanticGraphExtractor
        // handoff so a genuine empty-response overflow at the provider boundary flows through
        // DreamService's typed failure handling. Per the Sub-9 avoided-trap, only the
        // peripheral pipeline phases (ingestors / topology / gap inference / golden-path / GC),
        // the storage backend, and the LLM boundary are neutralized — the DreamService↔
        // SemanticGraphExtractor choreography under test runs real. Hypothesis 9 (PRIMARY),
        // Discussion silent-failure enumeration §2.4.
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
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
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
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
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph      = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph  = async () => {};
            TopologyInferenceEngine.extractTopology  = async () => {};
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            // THE H9 TRIGGER: the provider boundary streams an empty body (LM Studio silent-overflow
            // signature). SemanticGraphExtractor.executeTriVectorExtraction runs REAL and must classify
            // this as context-overflow + return a typed under-band-choke descriptor (no retry amplification).
            OpenAiCompatible.prototype.generate = async function() { return {content: ''}; };

            const result = await DreamService.processUndigestedSessions();

            // The REAL extractor returned a typed descriptor; assert DreamService propagated it.
            const sessionState = result.perSessionStates.find(s => s.sessionId === 'agent-session-empty-overflow');
            expect(sessionState).toBeDefined();
            expect(sessionState.triVector.status).toBe('failed');
            expect(sessionState.triVector.errorKind).toBe('under-band-choke');
            expect(sessionState.triVector.deferReason).toBe('under-band-choke');
            expect(sessionState.triVector.frictionSymptom).toBe('context-overflow');
            expect(sessionState.triVector.terminalForCadence).toBe(true);
            expect(sessionState.failureReasons.some(reason => reason.includes('Silent empty-response from provider'))).toBe(true);

            // graphDigested NOT set → session stays undigested for the next REM cycle, not silently masked.
            expect(sessionState.graphDigestedFlag).toBe(false);
            // The failed attempt is now TRACKED via a metadata update (digestState/digestAttempts/
            // deferReason) — but graphDigested stays unset, so the session is never falsely-digested.
            expect(sessionUpdates).toBe(1);

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
            AdrIngestor.syncAdrsToGraph                      = orig.syncAdrs;
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
        // processUndigestedSessions choreography and returns a typed schema-failure descriptor —
        // and DreamService must record the failure + keep the session undigested rather than mask it behind graphDigested.
        // Only peripheral phases + storage + the LLM boundary are neutralized. Hypothesis 11,
        // Discussion silent-failure enumeration §2.4.
        const aiConfig                = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        const AdrIngestor             = (await import('../../../../../../../ai/services/ingestion/AdrIngestor.mjs')).default;
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
            syncAdrs          : AdrIngestor.syncAdrsToGraph,
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
            AdrIngestor.syncAdrsToGraph              = async () => ({});
            ConceptIngestor.syncConceptsToGraph      = async () => ({});
            FileSystemIngestor.syncWorkspaceToGraph  = async () => {};
            TopologyInferenceEngine.extractTopology  = async () => {};
            TopologyInferenceEngine.getTopologyConflictCount = async () => 0;

            // THE H11 TRIGGER: provider returns unparseable JSON on every attempt. The REAL extractor
            // runs its full retry budget (no valid payload ever) and returns a typed descriptor.
            OpenAiCompatible.prototype.generate = async function() {
                invocationCount++;
                return {content: '```json\n{ "a2a_version": "1.0", "agent_id": "Antigravity" '}; // truncated, never valid
            };

            const result = await DreamService.processUndigestedSessions();

            // The real retry loop ran to exhaustion through the real choreography.
            expect(invocationCount).toBeGreaterThan(1);

            // The REAL extractor returned a typed descriptor; assert DreamService propagated it.
            const sessionState = result.perSessionStates.find(s => s.sessionId === 'agent-session-json-exhaustion');
            expect(sessionState).toBeDefined();
            expect(sessionState.triVector.status).toBe('failed');
            expect(sessionState.triVector.errorKind).toBe('schema-failure');
            expect(sessionState.triVector.deferReason).toBe('schema-failure');
            expect(sessionState.triVector.frictionSymptom).toBe('parse-failure');
            expect(sessionState.triVector.terminalForCadence).toBe(true);
            expect(sessionState.failureReasons.some(reason => reason.includes('Tri-Vector schema validation failed'))).toBe(true);

            // graphDigested NOT set → session stays undigested for the next REM cycle, not silently masked.
            expect(sessionState.graphDigestedFlag).toBe(false);
            // The failed attempt is now TRACKED via a metadata update (digestState/digestAttempts/
            // deferReason) — but graphDigested stays unset, so the session is never falsely-digested.
            expect(sessionUpdates).toBe(1);
        } finally {
            aiConfig.modelProvider                           = orig.provider;
            DreamService.findUndigestedSessions              = orig.findUndigested;
            DreamService.sessionsCollection                  = orig.sessionsCollection;
            DreamService.inferTestGapsFromSession            = orig.inferTest;
            DreamService.inferConceptGraphGaps               = orig.inferConcept;
            DreamService.runGarbageCollection                = orig.runGarbageCol;
            DreamService.synthesizeGoldenPath                = orig.synthesizeGolden;
            MemorySessionIngestor.syncSessionToGraph         = orig.syncSession;
            AdrIngestor.syncAdrsToGraph                      = orig.syncAdrs;
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
        const originalGetGraph   = StorageRouter.getGraphCollection;
        const originalPrepare    = GraphService.db.storage.db.prepare;

        StorageRouter.getSummaryCollection = async () => {
             return {
                 get: async () => ({ documents: [] })
             };
        };

        StorageRouter.getGraphCollection = async () => {
            return {
                query: async () => ({
                    ids      : [['issue-epic-hero', 'issue-task-blocked', 'issue-blocker', 'issue-weak-task', 'issue-rejected-task']],
                    distances: [[0.1, 0.2, 0.9, 0.8, 0.05]]
                }),
                get   : async () => ({ ids: [], metadatas: [] }),
                upsert: async () => {}
            };
        };

        GraphService.db.storage.db.prepare = function(sql) {
            // console.log("SQL PREPARE CALLED:", sql.substring(0, 50));
            if (sql.includes('SELECT') && sql.includes('Nodes')) {
                // console.log('MOCK TRIGGERED Nodes SELECT!');
                return {
                    all: () => [
                        { id: 'issue-epic-hero', data: JSON.stringify({ id: 'issue-epic-hero', name: 'Epic Hero', properties: { state: 'OPEN'} }), struct_score: 5.0 },
                        { id: 'issue-task-blocked', data: JSON.stringify({ id: 'issue-task-blocked', name: 'Blocked Task', properties: { state: 'OPEN'} }), struct_score: 10.0 },
                        { id: 'issue-blocker', data: JSON.stringify({ id: 'issue-blocker', name: 'Blocker Bug', properties: { state: 'OPEN'} }), struct_score: 1.0 },
                        { id: 'issue-weak-task', data: JSON.stringify({ id: 'issue-weak-task', name: 'Weak Task', properties: { state: 'OPEN'} }), struct_score: 0.1 },
                        { id: 'issue-rejected-task', data: JSON.stringify({ id: 'issue-rejected-task', name: 'Massive Stale Feature', properties: { state: 'OPEN', labels: ['needs-re-triage']} }), struct_score: 1000.0 }
                    ],
                    get: () => null,
                    run: () => {}
                };
            }
            return { all: () => [], get: () => null, run: () => {} };
        };

        // GraphService mock topology
        GraphService.db.edges.items = [
             { source: 'issue-blocker', target: 'issue-task-blocked', type: 'BLOCKS' }
        ];

        GraphService.db.nodes.items = [
             { id: 'issue-epic-hero', properties: { state: 'OPEN' } },
             { id: 'issue-task-blocked', properties: { state: 'OPEN' } },
             { id: 'issue-blocker', properties: { state: 'OPEN' } },
             { id: 'issue-weak-task', properties: { state: 'OPEN' } },
             { id: 'issue-rejected-task', properties: { state: 'OPEN', labels: ['needs-re-triage'] } },
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
        const aiConfig    = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
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
            const firstCount  = finalContent.split('[Codebase Gap]').length;
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
        let   executionCount = 0;
        const aiConfig       = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default,
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
                    a2a_version     : "1.0",
                    agent_id        : "Antigravity",
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
                meta    : { sessionId: 'playwright-retry-test' },
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
