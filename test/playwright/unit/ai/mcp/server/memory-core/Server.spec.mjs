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
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
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
        GraphService = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;

        if (fs.existsSync(testDbPath)) {
            try {
                fs.unlinkSync(testDbPath);
                if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
                if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
            } catch (e) {}
        }

        const { TestLifecycleHelper } = await import('../../../../ai/services/memory-core/util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, null, null, null, 'clear');
    });

    test.afterAll(async () => {
        const { TestLifecycleHelper } = await import('../../../../ai/services/memory-core/util.mjs');
        await TestLifecycleHelper.cleanupGraphService(GraphService, null, testDbPath, fs, 'clear');
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
        // on the Promise object is `undefined`. `unitTestMode` may resolve the method
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

    test('#12199: onSessionClosed writes a pending summarization marker without summarizing inline', async () => {
        const SDK = await import('../../../../../../../ai/services.mjs');
        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');
        const mcpServerInstance = {id: 'mcp-session-server'};
        const calls = [];
        const removed = [];

        const originalQueue = SDK.Memory_SessionService.queueSummarizationJob;
        const originalRemove = SDK.Memory_CoalescingEngineService.removeMcpServer;

        SDK.Memory_SessionService.queueSummarizationJob = (sessionId) => {
            calls.push(sessionId);
            return true;
        };
        SDK.Memory_CoalescingEngineService.removeMcpServer = (instance) => {
            removed.push(instance);
        };

        try {
            serverInstance.onSessionClosed('closed-session-1', mcpServerInstance);

            expect(removed).toEqual([mcpServerInstance]);
            expect(calls).toEqual(['closed-session-1']);
        } finally {
            SDK.Memory_SessionService.queueSummarizationJob = originalQueue;
            SDK.Memory_CoalescingEngineService.removeMcpServer = originalRemove;
            serverInstance.destroy();
        }
    });

    test('#12838: mailbox + add_memory bypass the summary-degraded health gate (never-fail WAL); embed-dependent reads do not', async () => {
        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');
        const handlers = new Map();
        const healthCalls = [];
        const toolCalls = [];
        const degradedError = new Error([
            'Memory Core is not fully operational:',
            '  - GEMINI_API_KEY not set - summarization features unavailable'
        ].join('\n'));

        const mcpServer = {
            server: {
                setRequestHandler(schema, handler) {
                    handlers.set(schema, handler);
                }
            }
        };

        serverInstance.getToolService = () => ({
            listTools: () => ({tools: [], nextCursor: undefined}),
            callTool : (name, args) => {
                toolCalls.push({name, args});
                return {ok: true, name};
            }
        });
        serverInstance.getHealthService = () => ({
            ensureHealthy: async () => {
                healthCalls.push('ensureHealthy');
                throw degradedError;
            }
        });

        serverInstance.setupRequestHandlers(mcpServer);

        try {
            const callTool = handlers.get(CallToolRequestSchema);

            const mailboxResult = await callTool({
                params: {
                    name     : 'list_messages',
                    arguments: {status: 'unread'}
                }
            });

            expect(mailboxResult.isError).toBe(false);
            expect(mailboxResult.structuredContent).toEqual({
                ok  : true,
                name: 'list_messages'
            });
            expect(healthCalls).toEqual([]);
            expect(toolCalls).toEqual([{
                name: 'list_messages',
                args: {status: 'unread'}
            }]);

            // add_memory — exempt since the WAL decouple: its never-fail local-disk write must run
            // during a vector/summary outage (the embed is deferred to the drain), so it bypasses
            // the gate exactly like the mailbox surface.
            const memoryResult = await callTool({
                params: {
                    name     : 'add_memory',
                    arguments: {prompt: 'p', thought: 't', response: 'r'}
                }
            });

            expect(memoryResult.isError).toBe(false);
            expect(memoryResult.structuredContent).toEqual({ok: true, name: 'add_memory'});

            // Both exempt → neither consulted the health service; both reached the tool service.
            expect(healthCalls).toEqual([]);
            expect(toolCalls).toEqual([
                {name: 'list_messages', args: {status: 'unread'}},
                {name: 'add_memory',    args: {prompt: 'p', thought: 't', response: 'r'}}
            ]);

            // query_raw_memories — NOT exempt: it embeds the query, so it genuinely cannot serve a
            // result while the embedder is down. The gate must still fire for it.
            const queryResult = await callTool({
                params: {
                    name     : 'query_raw_memories',
                    arguments: {query: 'q'}
                }
            });

            expect(queryResult.isError).toBe(true);
            expect(queryResult.content[0].text).toContain('Cannot execute query_raw_memories: Memory Core is not fully operational');
            expect(queryResult.content[0].text).toContain('GEMINI_API_KEY not set - summarization features unavailable');
            expect(healthCalls).toEqual(['ensureHealthy']);
            expect(toolCalls).toHaveLength(2);
        } finally {
            serverInstance.destroy();
        }
    });

    test('#12752: health exemptions do not expose retired database lifecycle tools', () => {
        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        try {
            const exemptTools = serverInstance.getHealthExemptTools();

            expect(exemptTools).not.toContain('start_database');
            expect(exemptTools).not.toContain('stop_database');
        } finally {
            serverInstance.destroy();
        }
    });
});
