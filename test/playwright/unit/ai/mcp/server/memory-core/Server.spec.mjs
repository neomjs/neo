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

import {test, expect}          from '@playwright/test';
import {CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import path                    from 'path';
import fs                      from 'fs-extra';
import Neo                     from '../../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';


test.describe('Neo.ai.mcp.server.memory-core.Server', () => {
    let Server;
    let GraphService;
    let aiConfig;
    let hadGraphStoragePath;
    let hadGraphTestStoragePath;
    let hadStoragePaths;
    let originalGraphStoragePath;
    let originalGraphTestStoragePath;
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

    function rawGraphNode(id) {
        const row = GraphService.db.storage.db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
        return row ? JSON.parse(row.data) : null;
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
        hadGraphTestStoragePath = Object.prototype.hasOwnProperty.call(aiConfig.storagePaths || {}, 'graphTest');
        originalGraphStoragePath = aiConfig.storagePaths?.graph;
        originalGraphTestStoragePath = aiConfig.storagePaths?.graphTest;

        if (!aiConfig.storagePaths) aiConfig.storagePaths = {};
        aiConfig.storagePaths.graph = testDbPath;
        aiConfig.storagePaths.graphTest = testDbPath;

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

        if (hadStoragePaths) {
            if (hadGraphTestStoragePath) {
                aiConfig.storagePaths.graphTest = originalGraphTestStoragePath;
            } else {
                delete aiConfig.storagePaths.graphTest;
            }
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

    test('#14388: GitLab-PAT request context auto-provisions a missing AgentIdentity', async () => {
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot();

        try {
            const context = await serverInstance.buildRequestContext({
                token              : 'glpat-secret-never-store',
                userId             : 'gitlab-agent-14388',
                username           : 'GitLab Agent 14388',
                source             : 'gitlab-pat',
                authProvider       : 'gitlab',
                authSource         : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUserId     : 42001,
                providerUsername   : 'gitlab-agent-14388',
                providerDisplayName: 'GitLab Agent 14388'
            });

            expect(context).toMatchObject({
                userId             : 'gitlab-agent-14388',
                username           : 'GitLab Agent 14388',
                agentIdentityNodeId: '@gitlab-agent-14388',
                source             : 'gitlab-pat'
            });

            const [{default: RequestContextService}, {default: PermissionService}] = await Promise.all([
                import('../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs'),
                import('../../../../../../../ai/services/memory-core/PermissionService.mjs')
            ]);
            const permissions = await RequestContextService.run(context, () => PermissionService.listPermissions());

            expect(permissions.identity).toBe('@gitlab-agent-14388');

            const node = rawGraphNode('@gitlab-agent-14388');

            expect(node.label).toBe('AgentIdentity');
            expect(node.properties.userId).toBeNull();
            expect(node.properties.accountType).toBe('agent');
            expect(node.properties.participationStatus).toBe('active');
            expect(node.properties.trustTier).toBe('internal-authored');
            expect(node.properties.authProvider).toBe('gitlab');
            expect(node.properties.authSource).toBe('gitlab-pat');
            expect(node.properties.providerBaseUrl).toBe('https://gitlab.example.com');
            expect(node.properties.providerUserId).toBe('42001');
            expect(node.properties.providerUsername).toBe('gitlab-agent-14388');
            expect(node.properties.providerDisplayName).toBe('GitLab Agent 14388');
            expect(node.properties.autoProvisioned).toBe(true);
            expect(node.properties.createdAt).toBeTruthy();
            expect(node.properties.lastAuthenticatedAt).toBeTruthy();
            expect(JSON.stringify(node)).not.toContain('glpat-secret-never-store');
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: existing AgentIdentity is reused without provider metadata overwrite', async () => {
        await GraphService.initAsync();

        GraphService.upsertGlobalNode({
            id        : '@existing-gitlab-agent-14388',
            type      : 'AgentIdentity',
            name      : 'Existing Agent',
            properties: {
                githubLogin: '@existing-gitlab-agent-14388',
                accountType: 'agent',
                trustTier  : 'peer-trusted',
                customField: 'preserve-me',
                createdAt  : '2026-01-01T00:00:00.000Z'
            }
        });

        const serverInstance = await createServerWithoutBoot();

        try {
            const context = await serverInstance.buildRequestContext({
                userId             : 'existing-gitlab-agent-14388',
                username           : 'Provider Display',
                source             : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUsername   : 'existing-gitlab-agent-14388',
                providerDisplayName: 'Provider Display'
            });

            expect(context.agentIdentityNodeId).toBe('@existing-gitlab-agent-14388');

            const node = rawGraphNode('@existing-gitlab-agent-14388');

            expect(node.properties.githubLogin).toBe('@existing-gitlab-agent-14388');
            expect(node.properties.trustTier).toBe('peer-trusted');
            expect(node.properties.customField).toBe('preserve-me');
            expect(node.properties.createdAt).toBe('2026-01-01T00:00:00.000Z');
            expect(node.properties.lastAuthenticatedAt).toBeTruthy();
            expect(node.properties.autoProvisioned).toBeUndefined();
            expect(node.properties.providerBaseUrl).toBeUndefined();
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: malformed GitLab-PAT user ids and node-type collisions fail closed', async () => {
        await GraphService.initAsync();

        GraphService.upsertGlobalNode({
            id        : '@colliding-gitlab-agent-14388',
            type      : 'ISSUE',
            name      : 'Colliding Issue',
            properties: {createdAt: '2026-01-01T00:00:00.000Z'}
        });

        const serverInstance = await createServerWithoutBoot();

        try {
            await expect(serverInstance.buildRequestContext({
                userId: 'bad/path',
                source: 'gitlab-pat'
            })).rejects.toThrow('not a valid provider username');

            await expect(serverInstance.buildRequestContext({
                userId: 'colliding-gitlab-agent-14388',
                source: 'gitlab-pat'
            })).rejects.toThrow('collides with existing ISSUE node');
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: auto-provisioning is gated to validated GitLab-PAT auth context', async () => {
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot();

        try {
            await expect(serverInstance.buildRequestContext()).resolves.toEqual({});

            const context = await serverInstance.buildRequestContext({
                userId  : 'oidc-agent-14388',
                username: 'OIDC Agent',
                source  : 'oidc'
            });

            expect(context).toMatchObject({
                userId             : 'oidc-agent-14388',
                username           : 'OIDC Agent',
                agentIdentityNodeId: null,
                source             : 'oidc'
            });
            expect(rawGraphNode('@oidc-agent-14388')).toBeNull();
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: concurrent first GitLab-PAT logins converge on one durable identity', async () => {
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot();

        try {
            const reqAuth = {
                userId             : 'concurrent-gitlab-agent-14388',
                username           : 'Concurrent Agent',
                source             : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUserId     : 1438801,
                providerUsername   : 'concurrent-gitlab-agent-14388',
                providerDisplayName: 'Concurrent Agent'
            };

            const [first, second] = await Promise.all([
                serverInstance.buildRequestContext(reqAuth),
                serverInstance.buildRequestContext(reqAuth)
            ]);

            expect(first.agentIdentityNodeId).toBe('@concurrent-gitlab-agent-14388');
            expect(second.agentIdentityNodeId).toBe('@concurrent-gitlab-agent-14388');

            const count = GraphService.db.storage.db
                .prepare('SELECT COUNT(*) as count FROM Nodes WHERE id = ?')
                .get('@concurrent-gitlab-agent-14388')
                .count;

            expect(count).toBe(1);
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: a separate graph process can observe the provisioned SQLite identity', async () => {
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot();

        try {
            await serverInstance.buildRequestContext({
                userId             : 'orchestrator-visible-agent-14388',
                username           : 'Orchestrator Visible Agent',
                source             : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUsername   : 'orchestrator-visible-agent-14388',
                providerDisplayName: 'Orchestrator Visible Agent'
            });

            expect(rawGraphNode('@orchestrator-visible-agent-14388')).toBeTruthy();

            const {default: Database} = await import('better-sqlite3');
            const peerDb              = new Database(GraphService.db.storage.db.name, {readonly: true});

            try {
                const row = peerDb
                    .prepare('SELECT data FROM Nodes WHERE id = ?')
                    .get('@orchestrator-visible-agent-14388');
                const log = peerDb
                    .prepare('SELECT entity_id, entity_type FROM GraphLog WHERE entity_id = ? ORDER BY log_id DESC LIMIT 1')
                    .get('@orchestrator-visible-agent-14388');
                const node = row ? JSON.parse(row.data) : null;

                expect(node).toBeTruthy();
                expect(node.label).toBe('AgentIdentity');
                expect(node.properties.providerUsername).toBe('orchestrator-visible-agent-14388');
                expect(log).toEqual({
                    entity_id  : '@orchestrator-visible-agent-14388',
                    entity_type: 'nodes'
                });
            } finally {
                peerDb.close();
            }
        } finally {
            serverInstance.destroy();
        }
    });

    test('#12199: onSessionClosed writes a pending summarization marker without summarizing inline', async () => {
        const SDK               = await import('../../../../../../../ai/services.mjs');
        const serverInstance    = await createServerWithoutBoot();
        const mcpServerInstance = {id: 'mcp-session-server'};
        const calls             = [];
        const removed           = [];

        const originalQueue  = SDK.Memory_SessionService.queueSummarizationJob;
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
        const handlers       = new Map();
        const healthCalls    = [];
        const toolCalls      = [];
        const degradedError  = new Error([
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
        const handlers       = new Map();
        const healthCalls    = [];
        const toolCalls      = [];
        const degradedError  = new Error([
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

    test('#14124: read-only diagnostics (get_rem_pipeline_state) bypass the embedder-degraded health gate; embedding queries still gate', async () => {
        const serverInstance = await createServerWithoutBoot();
        const handlers       = new Map();
        const healthCalls    = [];
        const toolCalls      = [];
        const degradedError  = new Error([
            'Memory Core is not fully operational:',
            '  - Embedding write canary timed out after 5000ms'
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

            // The catch-22 fix: a read-only diagnostic an agent needs to SEE the embedder outage must
            // still serve despite the embed-canary failure (it reads pipeline state, never embeds).
            const remResult = await callTool({
                params: {name: 'get_rem_pipeline_state', arguments: {}}
            });

            expect(remResult.isError).toBe(false);
            expect(remResult.structuredContent).toEqual({ok: true, name: 'get_rem_pipeline_state'});
            expect(healthCalls).toEqual([]); // exempt → never consulted the (failing) health gate

            // query_raw_memories — NOT exempt: it embeds the query, so the gate must still fire.
            const queryResult = await callTool({
                params: {name: 'query_raw_memories', arguments: {query: 'q'}}
            });

            expect(queryResult.isError).toBe(true);
            expect(queryResult.content[0].text).toContain('Cannot execute query_raw_memories: Memory Core is not fully operational');
            expect(healthCalls).toEqual(['ensureHealthy']);
            expect(toolCalls).toEqual([{name: 'get_rem_pipeline_state', args: {}}]);
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

    test('#13694: who_is_online is health-exempt (graph-backed liveness read survives an embed-drain)', async () => {
        const serverInstance = await createServerWithoutBoot();

        try {
            const exemptTools = serverInstance.getHealthExemptTools();

            // who_is_online → WakeSubscriptionService.whoIsOnline is a SQLite AgentIdentity-roster
            // recency read (no embedder), so it must serve while the embed-canary is down — gating it
            // only denied a read the outage never touched.
            expect(exemptTools).toContain('who_is_online');
            // The must-embed reads stay NON-exempt (exempting them trades a clean reject for a timeout).
            expect(exemptTools).not.toContain('query_raw_memories');
            expect(exemptTools).not.toContain('query_summaries');
        } finally {
            serverInstance.destroy();
        }
    });

    test('#13312: boot keeps MCP handlers available when graph startup tiers degrade', async () => {
        const SDK                   = await import('../../../../../../../ai/services.mjs');
        const HealthService         = (await import('../../../../../../../ai/services/memory-core/HealthService.mjs')).default;
        const serverInstance        = Neo.create('Neo.ai.mcp.server.memory-core.Server');
        const calls                 = [];
        const startupStates         = [];
        const wakeFailure           = new Error('attempt to write a readonly database');
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

        const originalWakeInit                = SDK.Memory_WakeSubscriptionService.init;
        const originalInferenceReady          = SDK.Memory_InferenceLifecycleService.ready;
        const originalSessionReady            = SDK.Memory_SessionService.ready;
        const originalRecorderInitAsync       = SDK.Memory_RecorderService.initAsync;
        const originalRecordStartupDependency = HealthService.recordStartupDependency;
        const originalSetStdioIdentityState   = HealthService.setStdioIdentityState;

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
