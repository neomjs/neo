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

    test('bindAgentIdentity must await the Promise-returning getNode (regression pin for #10249)', async () => {
        // Regression guard: in production, `GraphService.getNode` returns a Promise (Neo
        // singleton method wrapping). If `bindAgentIdentity` drops the `await`, `node.id`
        // on the Promise object is `undefined` — the actual root cause of #10241's merged-
        // but-incomplete fix that #10249 corrects. `unitTestMode` may resolve the method
        // synchronously, so the other test in this suite does not reproduce the failure
        // mode; this test forces the Promise path explicitly by stubbing `getNode` to
        // return a Promise regardless of the framework's runtime decision.

        await GraphService.initAsync();

        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        const originalGetNode = GraphService.getNode.bind(GraphService);
        GraphService.getNode = function({id}) {
            // Force the production Promise-wrapped shape regardless of test mode.
            return Promise.resolve({
                id,
                type       : 'AgentIdentity',
                name       : 'Regression Pin',
                description: '#10249 — proves bindAgentIdentity awaits GraphService.getNode'
            });
        };

        try {
            const boundId = await serverInstance.bindAgentIdentity('regression-pin-agent');

            // The load-bearing assertions: boundId must be the resolved string, not the
            // Promise object, not `undefined`, not `'[object Promise]'`.
            expect(typeof boundId).toBe('string');
            expect(boundId).toBe('@regression-pin-agent');
            expect(boundId).not.toBeUndefined();
        } finally {
            GraphService.getNode = originalGetNode;
            serverInstance.destroy();
        }
    });

    test('bindAgentIdentity should recover from stuck vicinityLoadedNodes cache miss', async () => {
        await GraphService.initAsync();
        
        GraphService.upsertNode({id: '@neo-opus-4-7', type: 'AgentIdentity', name: 'Identity Node'});

        await new Promise(resolve => setTimeout(resolve, 50));

        let wasAutoSave = GraphService.db.autoSave;
        GraphService.db.autoSave = false;

        try {
            GraphService.db.nodes.clear();
            GraphService.db.vicinityLoadedNodes.add('@neo-opus-4-7');
        } finally {
            GraphService.db.autoSave = wasAutoSave;
        }

        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        const boundId = await serverInstance.bindAgentIdentity('neo-opus-4-7');
        
        expect(boundId).toBe('@neo-opus-4-7');
        
        serverInstance.destroy();
    });

    test('onSessionClosed triggers SessionService.queueSummarizationJob', async () => {
        const SessionService = (await import('../../../../../../../ai/mcp/server/memory-core/services/SessionService.mjs')).default;
        
        // Mock the SessionService method
        const originalQueue = SessionService.queueSummarizationJob.bind(SessionService);
        let queuedSessionId = null;
        
        SessionService.queueSummarizationJob = function(sessionId) {
            queuedSessionId = sessionId;
        };

        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        try {
            serverInstance.onSessionClosed('test-session-123');
            expect(queuedSessionId).toBe('test-session-123');
        } finally {
            SessionService.queueSummarizationJob = originalQueue;
            serverInstance.destroy();
        }
    });
});
