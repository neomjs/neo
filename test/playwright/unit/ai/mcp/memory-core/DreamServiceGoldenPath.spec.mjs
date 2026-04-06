import {setup} from '../../../../setup.mjs';

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
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import crypto          from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

test.describe('DreamService Golden Path', () => {
    let TextEmbeddingService, aiConfig, DreamService, GraphService, SQLiteVectorManager;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const os         = await import('os');
        const fs         = await import('fs');
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const testDbName = `memory-core-dream-test-${process.pid}-${Date.now()}.sqlite`;
        const testDbPath = path.join(tmpDir, testDbName);

        aiConfig.engines.neo.dataDir  = tmpDir;
        aiConfig.engines.neo.filename = testDbName;
        aiConfig.engine               = 'neo';
        aiConfig.handoffFilePath      = path.join(tmpDir, 'mock_sandman_handoff.md');

        TextEmbeddingService = (await import('../../../../../../ai/mcp/server/memory-core/services/TextEmbeddingService.mjs')).default;
        DreamService         = (await import('../../../../../../ai/mcp/server/memory-core/services/DreamService.mjs')).default;
        GraphService         = (await import('../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        SQLiteVectorManager  = (await import('../../../../../../ai/mcp/server/memory-core/managers/SQLiteVectorManager.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Mock TextEmbeddingService to return an array of 1536 floats for OpenAI compatibility (which sqlite-vec expects)
        TextEmbeddingService.embedText = async () => new Array(1536).fill(0.1);

        await SQLiteVectorManager.ready();
        await GraphService.ready();
    });

    test.afterAll(async () => {
        if (GraphService?.db) {
            if (GraphService.db.storage?.db) {
                try {GraphService.db.storage.db.close();} catch (e) {}
            }
            GraphService.db           = null;
            GraphService._initPromise = null;
        }

        const os         = await import('os');
        const fs         = await import('fs');
        const tmpDir     = path.resolve(process.cwd(), 'tmp');
        const testDbPath = path.join(tmpDir, aiConfig.engines.neo.filename);

        if (fs.existsSync(testDbPath)) {
            try {fs.unlinkSync(testDbPath);}          catch (e) {}
            try {fs.unlinkSync(`${testDbPath}-wal`);} catch (e) {}
            try {fs.unlinkSync(`${testDbPath}-shm`);} catch (e) {}
        }
        const mockHandoff = path.join(tmpDir, 'mock_sandman_handoff.md');
        if (fs.existsSync(mockHandoff)) {
            try {fs.unlinkSync(mockHandoff);} catch (e) {}
        }
    });

    test('synthesizeGoldenPath executes without crashing', async () => {
        test.setTimeout(60000);

        await DreamService.ingestIssueStates();
        await DreamService.synthesizeGoldenPath();

        const topology = await GraphService.getContextFrontier();
        expect(topology).not.toBeNull();
        expect(topology.frontier.id).toBe('frontier');

        const openIssues = GraphService.db.nodes.items.filter(n => n.label === 'ISSUE' && n.properties?.state === 'OPEN');

        expect(openIssues.length).toBeGreaterThan(0);

        // There should be GUIDES edges out of frontier
        const guides = topology.strategicNeighbors.filter(n => n.relationship === 'GUIDES');
        expect(guides.length).toBeGreaterThan(0);
    });
});
