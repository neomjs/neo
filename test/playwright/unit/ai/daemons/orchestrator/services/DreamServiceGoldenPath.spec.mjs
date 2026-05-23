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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import crypto          from 'crypto';
import {TestLifecycleHelper} from '../../../services/memory-core/util.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('DreamService Golden Path', () => {
    let TextEmbeddingService, aiConfig, DreamService, GraphService, SystemLifecycleService;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const os         = await import('os');
        const fs         = await import('fs');
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
        SystemLifecycleService = (await import('../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Mock TextEmbeddingService to return an array of 4096 floats for Qwen3 compatibility
        TextEmbeddingService.embedText = async () => new Array(4096).fill(0.1);

        if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }
    });

    test.afterAll(async () => {
        const fs         = await import('fs');
        const testDbPath = aiConfig.storagePaths.graph;

        await TestLifecycleHelper.cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, 'clear');

        const tmpDir     = path.resolve(process.cwd(), 'tmp');
        const mockHandoff = path.join(tmpDir, 'mock_sandman_handoff.md');
        if (fs.existsSync(mockHandoff)) {
            try {fs.unlinkSync(mockHandoff);} catch (e) {}
        }
    });

    test('synthesizeGoldenPath executes without crashing', async () => {
        test.skip(!!process.env.NEO_TEST_SKIP_CI, 'CI-skip: synthesis-write race post-#10940 engine=hybrid fix (#10946)');
        test.setTimeout(60000);

        await DreamService.ingestIssueStates();
        await DreamService.synthesizeGoldenPath();

        const topology = await GraphService.getContextFrontier();
        expect(topology).not.toBeNull();
        expect(topology.frontier.id).toBe('frontier');

        const openIssues = GraphService.db.nodes.items.filter(n => (n.label === 'ISSUE' || n.type === 'ISSUE') && n.properties?.state === 'OPEN');

        expect(openIssues.length).toBeGreaterThan(0);

        // There should be GUIDES edges out of frontier
        const guides = topology.strategicNeighbors.filter(n => n.relationship === 'GUIDES');
        expect(guides.length).toBeGreaterThan(0);
    });
});
