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
    let aiConfig;
    let hadGraphStoragePath;
    let hadStoragePaths;
    let originalGraphStoragePath;
    const testDbName = `memory-core-server-test-${process.pid}-${Date.now()}.sqlite`;
    let testDbPath;

    async function createServerWithoutBoot() {
        const originalBoot = Server.prototype.boot;

        Server.prototype.boot = async () => {};

        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        try {
            await serverInstance.ready();
        } finally {
            Server.prototype.boot = originalBoot;
        }

        return serverInstance;
    }

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, testDbName);

        hadStoragePaths       = Boolean(aiConfig.storagePaths);
        hadGraphStoragePath  = Object.prototype.hasOwnProperty.call(aiConfig.storagePaths || {}, 'graph');
        originalGraphStoragePath = aiConfig.storagePaths?.graph;

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

        if (!hadStoragePaths) {
            delete aiConfig.storagePaths;
        } else if (hadGraphStoragePath) {
            aiConfig.storagePaths.graph = originalGraphStoragePath;
        } else {
            delete aiConfig.storagePaths.graph;
        }
    });

    test('bindAgentIdentity should correctly retrieve identity without cache manipulation', async () => {

        await GraphService.initAsync();

        GraphService.upsertNode({id: '@neo-opus-4-7', type: 'AgentIdentity', name: 'Identity Node'});

        await new Promise(resolve => setTimeout(resolve, 50));

        // Let the identity node stay in the natural cache (which is the case right after init/upsert)
        const serverInstance = await createServerWithoutBoot();

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

        const serverInstance = await createServerWithoutBoot();

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

        const serverInstance = await createServerWithoutBoot();

        const boundId = await serverInstance.bindAgentIdentity('neo-opus-4-7');

        expect(boundId).toBe('@neo-opus-4-7');

        serverInstance.destroy();
    });

    test('#12199: onSessionClosed writes a pending summarization marker without summarizing inline', async () => {
        const SDK = await import('../../../../../../../ai/services.mjs');
        const serverInstance = await createServerWithoutBoot();
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
        const serverInstance = await createServerWithoutBoot();
        const handlers = new Map();
        const healthCalls = [];
        const toolCalls = [];
        const degradedError = new Error([
            'Memory Core is not fully operational:',
            "  - Summary provider 'gemini' requires GEMINI_API_KEY - summarization features unavailable"
        ].join('\n'));

        const mcpServer = {
            server: {
                setRequestHandler(schema, handler) {
                    handlers.set(schema, handler);
                }
            }
        };
        const originalGetToolService   = serverInstance.getToolService;
        const originalGetHealthService = serverInstance.getHealthService;

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

            // record_turn_presence — exempt: this writes a SQLite graph interval only, no embedder
            // or summary provider. It must stay callable when provider canaries are degraded.
            const turnPresenceResult = await callTool({
                params: {
                    name     : 'record_turn_presence',
                    arguments: {action: 'start', turnId: 'turn-1'}
                }
            });

            expect(turnPresenceResult.isError).toBe(false);
            expect(turnPresenceResult.structuredContent).toEqual({ok: true, name: 'record_turn_presence'});

            // All exempt → none consulted the health service; all reached the tool service.
            expect(healthCalls).toEqual([]);
            expect(toolCalls).toEqual([
                {name: 'list_messages',         args: {status: 'unread'}},
                {name: 'add_memory',            args: {prompt: 'p', thought: 't', response: 'r'}},
                {name: 'record_turn_presence',  args: {action: 'start', turnId: 'turn-1'}}
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
            expect(queryResult.content[0].text).toContain("Summary provider 'gemini' requires GEMINI_API_KEY - summarization features unavailable");
            expect(healthCalls).toEqual(['ensureHealthy']);
            expect(toolCalls).toHaveLength(3);
        } finally {
            serverInstance.getToolService   = originalGetToolService;
            serverInstance.getHealthService = originalGetHealthService;
            serverInstance.destroy();
        }
    });

    test('#12978: non-embedding reads (get_session_memories, query_recent_turns) bypass the embedder-degraded health gate; embed-dependent reads do not', async () => {
        const serverInstance = await createServerWithoutBoot();
        const handlers = new Map();
        const healthCalls = [];
        const toolCalls = [];
        const degradedError = new Error([
            'Memory Core is not fully operational:',
            "  - Summary provider 'gemini' requires GEMINI_API_KEY - summarization features unavailable"
        ].join('\n'));

        const mcpServer = {
            server: {
                setRequestHandler(schema, handler) {
                    handlers.set(schema, handler);
                }
            }
        };
        const originalGetToolService   = serverInstance.getToolService;
        const originalGetHealthService = serverInstance.getHealthService;

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

            // get_session_memories — exempt: a Chroma metadata .get() by sessionId, no embedder call,
            // so it serves while the embedder canary is down.
            const sessionResult = await callTool({
                params: {
                    name     : 'get_session_memories',
                    arguments: {sessionId: 's'}
                }
            });

            expect(sessionResult.isError).toBe(false);
            expect(sessionResult.structuredContent).toEqual({ok: true, name: 'get_session_memories'});

            // query_recent_turns — exempt: a SQLite recency read over the AGENT_MEMORY graph, no
            // embedder call (its optional Chroma content join degrades to the WAL overlay).
            const recentResult = await callTool({
                params: {
                    name     : 'query_recent_turns',
                    arguments: {limit: 5}
                }
            });

            expect(recentResult.isError).toBe(false);
            expect(recentResult.structuredContent).toEqual({ok: true, name: 'query_recent_turns'});

            // Both exempt → neither consulted the health service; both reached the tool service.
            expect(healthCalls).toEqual([]);
            expect(toolCalls).toEqual([
                {name: 'get_session_memories', args: {sessionId: 's'}},
                {name: 'query_recent_turns',   args: {limit: 5}}
            ]);

            // query_summaries — NOT exempt: it embeds the query, so the gate must still fire (the
            // embedder outage genuinely prevents it serving a semantic result).
            const summariesResult = await callTool({
                params: {
                    name     : 'query_summaries',
                    arguments: {query: 'q'}
                }
            });

            expect(summariesResult.isError).toBe(true);
            expect(summariesResult.content[0].text).toContain('Cannot execute query_summaries: Memory Core is not fully operational');
            expect(healthCalls).toEqual(['ensureHealthy']);
            expect(toolCalls).toHaveLength(2);
        } finally {
            serverInstance.getToolService   = originalGetToolService;
            serverInstance.getHealthService = originalGetHealthService;
            serverInstance.destroy();
        }
    });

    test('#12978: logStartupStatus tolerates a null health result (BaseServer passes null when the health service has no healthcheck)', async () => {
        const serverInstance = await createServerWithoutBoot();

        try {
            // Regression pin: BaseServer.runHealthcheckAndLogStatus calls logStartupStatus(null)
            // when the health service exposes no healthcheck method (e.g. a degraded/serviceless
            // boot). The MC override must not dereference null — otherwise initAsync crashes.
            expect(() => serverInstance.logStartupStatus(null)).not.toThrow();
        } finally {
            serverInstance.destroy();
        }
    });

    test('#12752: health exemptions do not expose retired database lifecycle tools', async () => {
        const serverInstance = await createServerWithoutBoot();

        try {
            const exemptTools = serverInstance.getHealthExemptTools();

            expect(exemptTools).not.toContain('start_database');
            expect(exemptTools).not.toContain('stop_database');
        } finally {
            serverInstance.destroy();
        }
    });

    test('#13312: boot keeps MCP handlers available when graph startup tiers degrade', async () => {
        const SDK = await import('../../../../../../../ai/services.mjs');
        const HealthService = (await import('../../../../../../../ai/services/memory-core/HealthService.mjs')).default;
        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');
        const calls = [];
        const startupStates = [];
        const wakeFailure = new Error('attempt to write a readonly database');
        const originalServerMethods = new Map([
            'loadCustomConfig',
            'createMcpServer',
            'runHealthcheckAndLogStatus',
            'connectTransport',
            'resolveStdioIdentity',
            'logIdentityStatus',
            'logSiblingConcurrency'
        ].map(name => [name, serverInstance[name]]));

        serverInstance.loadCustomConfig = async () => calls.push('loadCustomConfig');
        serverInstance.createMcpServer = () => {
            calls.push('createMcpServer');
            return {server: {setRequestHandler() {}}};
        };
        serverInstance.runHealthcheckAndLogStatus = async () => {
            calls.push('runHealthcheckAndLogStatus');
            return {status: 'degraded'};
        };
        serverInstance.connectTransport = async () => calls.push('connectTransport');
        serverInstance.resolveStdioIdentity = async () => null;
        serverInstance.logIdentityStatus = () => calls.push('logIdentityStatus');
        serverInstance.logSiblingConcurrency = () => calls.push('logSiblingConcurrency');

        const originalWakeInit = SDK.Memory_WakeSubscriptionService.init;
        const originalInferenceReady = SDK.Memory_InferenceLifecycleService.ready;
        const originalSessionReady = SDK.Memory_SessionService.ready;
        const originalRecorderInitAsync = SDK.Memory_RecorderService.initAsync;
        const originalRecordStartupDependency = HealthService.recordStartupDependency;
        const originalSetStdioIdentityState = HealthService.setStdioIdentityState;

        SDK.Memory_WakeSubscriptionService.init = async () => {
            calls.push('wakeInit');
            throw wakeFailure;
        };
        SDK.Memory_InferenceLifecycleService.ready = async () => calls.push('inferenceReady');
        SDK.Memory_SessionService.ready = async () => calls.push('sessionReady');
        SDK.Memory_RecorderService.initAsync = async () => calls.push('toolTelemetryReady');
        HealthService.recordStartupDependency = (name, status, details) => {
            startupStates.push({name, status, error: details?.error});
        };
        HealthService.setStdioIdentityState = (identity) => {
            calls.push(['setStdioIdentityState', identity]);
        };

        try {
            await expect(serverInstance.ready()).resolves.toBeUndefined();

            expect(calls).toEqual([
                'loadCustomConfig',
                'createMcpServer',
                'wakeInit',
                'inferenceReady',
                'sessionReady',
                'toolTelemetryReady',
                ['setStdioIdentityState', null],
                'runHealthcheckAndLogStatus',
                'logSiblingConcurrency',
                'connectTransport',
                'logIdentityStatus'
            ]);
            expect(startupStates).toEqual([
                {name: 'wake-subscription', status: 'degraded', error: 'attempt to write a readonly database'},
                {name: 'inference-lifecycle', status: 'ready', error: undefined},
                {name: 'session-service', status: 'ready', error: undefined},
                {name: 'tool-telemetry', status: 'ready', error: undefined}
            ]);
        } finally {
            SDK.Memory_WakeSubscriptionService.init = originalWakeInit;
            SDK.Memory_InferenceLifecycleService.ready = originalInferenceReady;
            SDK.Memory_SessionService.ready = originalSessionReady;
            SDK.Memory_RecorderService.initAsync = originalRecorderInitAsync;
            HealthService.recordStartupDependency = originalRecordStartupDependency;
            HealthService.setStdioIdentityState = originalSetStdioIdentityState;
            HealthService.clearStartupDependencyState();
            HealthService.setStdioIdentityState(null);
            HealthService.clearCache();
            for (const [name, method] of originalServerMethods) {
                serverInstance[name] = method;
            }
            serverInstance.destroy();
        }
    });
});
