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
        aiConfig.autoIngestFileSystem = false;

        GraphService           = (await import('../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        SemanticGraphExtractor = (await import('../../../../../../ai/daemons/services/SemanticGraphExtractor.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
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

    test.afterAll(() => {
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
});
