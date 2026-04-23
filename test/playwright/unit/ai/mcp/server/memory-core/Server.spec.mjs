import {setup} from '../../../../../setup.mjs';

const appName = 'ServerTest';

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

import {test, expect}  from '@playwright/test';
import path            from 'path';
import fs              from 'fs-extra';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.mcp.server.memory-core.Server', () => {
    let Server;
    let GraphService;
    const testDbName = `memory-core-server-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        
        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        if (!aiConfig.storagePaths) aiConfig.storagePaths = {};
        aiConfig.storagePaths.graph = testDbPath;

        Server = (await import('../../../../../../../ai/mcp/server/memory-core/Server.mjs')).default;
        GraphService = (await import('../../../../../../../ai/mcp/server/memory-core/services/GraphService.mjs')).default;
        
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
        GraphService._initPromise = null;
        GraphService.db = null;
    });

    test.afterAll(async () => {
        if (GraphService.db?.storage?.db) {
            GraphService.db.storage.db.close();
        }
        try {
            if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
            if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
            if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
        } catch (e) {}
    });

    test('bindAgentIdentity should correctly retrieve identity without cache manipulation', async () => {
        await GraphService.initAsync();
        
        GraphService.upsertNode({id: '@neo-opus-4-7', type: 'AgentIdentity', name: 'Identity Node'});

        await new Promise(resolve => setTimeout(resolve, 50));

        // Let the identity node stay in the natural cache (which is the case right after init/upsert)
        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        const boundId = await serverInstance.bindAgentIdentity('neo-opus-4-7');
        expect(boundId).toBe('@neo-opus-4-7');
        
        serverInstance.destroy();
    });
});
