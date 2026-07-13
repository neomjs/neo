import {setup} from '../../../../../setup.mjs';

const appName = 'DreamServiceTest';

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

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../../src/core/_export.mjs';
import InstanceManager       from '../../../../../../../src/manager/Instance.mjs';
import path                  from 'path';
import {fileURLToPath}       from 'url';
import crypto                from 'crypto';
import {TestLifecycleHelper} from '../../../services/memory-core/util.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('DreamService Golden Path', () => {
    let TextEmbeddingService, aiConfig, DreamService, GraphService, OpenAiCompatible, StorageRouter, SystemLifecycleService;
    let originalGenerate;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const os     = await import('os');
        const fs     = await import('fs');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath = path.join(tmpDir, testDbName);

        aiConfig.storagePaths.graph = testDbPath;
        aiConfig.engine               = 'hybrid';
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');

        TextEmbeddingService = (await import('../../../../../../../ai/services/memory-core/TextEmbeddingService.mjs')).default;
        DreamService         = (await import('../../../../../../../ai/daemons/orchestrator/services/DreamService.mjs')).default;
        GraphService         = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        OpenAiCompatible     = (await import('../../../../../../../ai/provider/OpenAiCompatible.mjs')).default;
        StorageRouter        = (await import('../../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
        SystemLifecycleService = (await import('../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Mock TextEmbeddingService to return an array of 4096 floats for Qwen3 compatibility
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);
        originalGenerate = OpenAiCompatible.prototype.generate;
        OpenAiCompatible.prototype.generate = async () => ({
            content: JSON.stringify({strategic_brief: 'Bounded Dream Golden Path synthesis.'})
        });

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }
    });

    test.afterAll(async () => {
        const fs         = await import('fs');
        const testDbPath = aiConfig.storagePaths.graph;

        OpenAiCompatible.prototype.generate = originalGenerate;
        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');

        const tmpDir      = path.resolve(process.cwd(), 'tmp');
        const mockHandoff = path.join(tmpDir, 'mock_sandman_handoff.md');
        if (fs.existsSync(mockHandoff)) {
            try {fs.unlinkSync(mockHandoff);} catch (e) {}
        }
    });

    test('synthesizeGoldenPath executes without crashing', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: synthesis-write race post-#10940 engine=hybrid fix (#10946)');
        test.setTimeout(60000);

        const originalGetGraphCollection = StorageRouter.getGraphCollection;
        let   capturedWhere              = null;

        // Seed one bounded real SQLite + Chroma candidate. Scanning and embedding the repository's
        // ever-growing live issue corpus made this synthesis test scale with backlog size; dedicated
        // IssueIngestor tests own that separate contract.
        const issueId = 'issue-dream-golden-path-fixture';

        GraphService.upsertNode({
            id        : issueId,
            type      : 'ISSUE',
            name      : 'Dream Golden Path Fixture',
            state     : 'OPEN',
            properties: {state: 'OPEN', labels: ['enhancement']}
        });

        // Keep the vector boundary hermetic. A shared Chroma collection can contain unrelated
        // ISSUE vectors and let this test pass even when the fixture is never selected.
        StorageRouter.getGraphCollection = async () => ({
            count: async () => 1,
            query: async ({where}) => {
                capturedWhere = where;

                return {
                    ids      : [[issueId]],
                    distances: [[0.1]]
                }
            }
        });

        try {
            await DreamService.synthesizeGoldenPath();
        } finally {
            StorageRouter.getGraphCollection = originalGetGraphCollection
        }

        const topology = await GraphService.getContextFrontier();
        expect(topology).not.toBeNull();
        expect(topology.frontier.id).toBe('frontier');

        const openIssues = GraphService.db.nodes.items.filter(n => (n.label === 'ISSUE' || n.type === 'ISSUE') && n.properties?.state === 'OPEN');

        expect(openIssues.map(issue => issue.id)).toContain(issueId);
        expect(capturedWhere).toEqual({type: {'$in': ['ISSUE', 'DISCUSSION']}});

        // The exact fixture must be guided; an unrelated shared-vector candidate cannot satisfy this oracle.
        const guides = topology.strategicNeighbors.filter(n => n.relationship === 'GUIDES');
        expect(guides.map(node => node.id)).toEqual([issueId]);
    });
});
