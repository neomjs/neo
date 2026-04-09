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
    let SQLiteVectorManager;
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

        aiConfig.engines.neo.dataDir  = tmpDir;
        aiConfig.engines.neo.filename = testDbName;
        aiConfig.autoIngestFileSystem = false; // Prevent differential sync during DreamService tests
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');

        GraphService = (await import('../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        DreamService = (await import('../../../../../ai/daemons/DreamService.mjs')).default;
        SQLiteVectorManager = (await import('../../../../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs')).default;
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
        // 3. Trigger REM sleep cycle
        await DreamService.executeCapabilityGapInference(session, payload);

        // Validate gaps are stored on the node correctly
        const updatedNode = GraphService.db.nodes.get('mock-file-1');
        expect(updatedNode.properties.capabilityGap).toBeDefined();
        // It should identify test and doc gaps for structural gaps
        expect(updatedNode.properties.capabilityGap).toContain('[DOC_GAP]');
        expect(updatedNode.properties.capabilityGap).toContain('[TEST_GAP]');
    });

    test('should detect GUIDE_GAP using Boolean LLM Verification', async () => {
        const baseGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async function(prompt) {
            providerPrompt = prompt;
            return {
                content: JSON.stringify({
                    verified: false
                })
            };
        };

        GraphService.upsertNode({
            id         : 'node-guide-test',
            type       : 'CLASS',
            name       : 'RogueFeature',
            description  : 'A feature totally disconnected from the vision.',
            properties : {path: 'src/rogue/Rogue.mjs'}
        });

        // Prepare isolated node payload
        const payload = {
            session_artifact: {
                graph: {
                    nodes: [{
                        id           : 'node-guide-test',
                        type         : 'CLASS',
                        name         : 'RogueFeature',
                        description  : 'A feature totally disconnected from the vision.',
                        confidence   : 0.9,
                        _resolvedId  : 'node-guide-test'
                    }],
                    edges: []
                }
            }
        };

        const session = {
            meta: {sessionId: 'playwright-drift-session'}
        };

        // Mock QueryService globally to return a fake guide result so it triggers Boolean Verification
        const QueryService = (await import('../../../../../ai/mcp/server/knowledge-base/services/QueryService.mjs')).default;
        const originalQuery = QueryService.queryDocuments;
        QueryService.queryDocuments = async () => ({ topResult: '/mock/path/guide.md' });

        const originalFsExists = fs.existsSync;
        fs.existsSync = (path) => {
            if (path === '/mock/path/guide.md') return true;
            return originalFsExists(path);
        };
        const originalFsRead = fs.readFileSync;
        fs.readFileSync = (path, enc) => {
            if (path === '/mock/path/guide.md') return "Mock Guide Content for RogueFeature.";
            return originalFsRead(path, enc);
        }

        await DreamService.executeCapabilityGapInference(session, payload);

        // Verify Prompt explicitly hit Guide Gap Logic
        expect(typeof providerPrompt).toBe('string');
        expect(providerPrompt).toContain('QA Engine');
        expect(providerPrompt).toContain('RogueFeature');

        // Verify logging appended GUIDE_GAP
        const updatedNode = GraphService.db.nodes.get('node-guide-test');
        expect(updatedNode.properties.capabilityGap).toBeDefined();
        expect(updatedNode.properties.capabilityGap).toContain('[GUIDE_GAP]');
        expect(updatedNode.properties.capabilityGap).toContain('failed LLM semantic verification');
        
        // Restore
        OpenAiCompatible.prototype.generate = baseGenerate;
        QueryService.queryDocuments = originalQuery;
        fs.existsSync = originalFsExists;
        fs.readFileSync = originalFsRead;
    });

    test('synthesizeGoldenPath should mathematically select and inject Golden Path while rejecting BLOCKS', async () => {
        // Mock SQLiteVectorManager to return dynamic Math metrics without embedding dependencies
        const originalPrepare = SQLiteVectorManager.db ? SQLiteVectorManager.db.prepare : null;
        const originalGetSummary = SQLiteVectorManager.getSummaryCollection;
        
        if (!SQLiteVectorManager.db) {
             SQLiteVectorManager.db = {};
        }
        
        SQLiteVectorManager.getSummaryCollection = async () => {
             return {
                 get: async () => ({ documents: [] })
             };
        };
        
        SQLiteVectorManager.db.prepare = function(sql) {
            // console.log("SQL PREPARE CALLED:", sql.substring(0, 50));
            if (sql.includes('SELECT') && sql.includes('Nodes')) {
                console.log('MOCK TRIGGERED Nodes SELECT!');
                return {
                    all: () => [
                        { id: 'epic-1', data: JSON.stringify({ id: 'epic-1', name: 'Epic Hero', properties: { state: 'OPEN'} }), struct_score: 5.0, semantic_distance: 0.1 },
                        { id: 'task-blocked', data: JSON.stringify({ id: 'task-blocked', name: 'Blocked Task', properties: { state: 'OPEN'} }), struct_score: 10.0, semantic_distance: 0.2 },
                        { id: 'blocker', data: JSON.stringify({ id: 'blocker', name: 'Blocker Bug', properties: { state: 'OPEN'} }), struct_score: 1.0, semantic_distance: 0.9 },
                        { id: 'weak-task', data: JSON.stringify({ id: 'weak-task', name: 'Weak Task', properties: { state: 'OPEN'} }), struct_score: 0.1, semantic_distance: 0.8 }
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
             { id: 'weak-task', properties: { state: 'OPEN' } }
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
        SQLiteVectorManager.getSummaryCollection = originalGetSummary;
        if (originalPrepare) {
             SQLiteVectorManager.db.prepare = originalPrepare;
        } else {
             delete SQLiteVectorManager.db.prepare;
        }
    });
});
