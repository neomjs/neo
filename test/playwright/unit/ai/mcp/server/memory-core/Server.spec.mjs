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
import {spawnSync}             from 'node:child_process';
import os                      from 'node:os';
import path                    from 'path';
import fs                      from 'fs-extra';
import Neo                     from '../../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';


test.describe('Neo.ai.mcp.server.memory-core.Server', () => {
    let Server;
    let GraphService;
    let baselineNodeIds;
    const fixtureNodeIds = new Set([
        '@neo-opus-4-7',
        '@identity-collision-15027',
        '@identity-topology-15027',
        '@gitlab-agent-14388',
        '@github-pinned-15990',
        '@github-outsider-15990',
        '@existing-gitlab-agent-14388',
        '@colliding-gitlab-agent-14388',
        '@concurrent-gitlab-agent-14388',
        '@xprovider-shared-login'
    ]);

    async function createServerWithoutBoot({autoProvisionIdentitySources} = {}) {
        const originalBoot = Server.prototype.boot;

        Server.prototype.boot = async () => {};

        const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        try {
            await serverInstance.ready();

            if (autoProvisionIdentitySources) {
                serverInstance.aiConfig = {auth: {autoProvisionIdentitySources}}
            }
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
        Server = (await import('../../../../../../../ai/mcp/server/memory-core/Server.mjs')).default;
        GraphService = (await import('../../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        await GraphService.ready();
        baselineNodeIds = new Set(GraphService.db.nodes.items.map(node => node.id));
    });

    test.afterAll(() => {
        GraphService.removeNodes([...fixtureNodeIds].filter(id => !baselineNodeIds.has(id)));
    });

    test('bindAgentIdentity should correctly retrieve identity without cache manipulation', async () => {

        await GraphService.initAsync();

        GraphService.upsertNode({id: '@neo-opus-4-7', type: 'AgentIdentity', name: 'Identity Node'});

        await new Promise(resolve => setTimeout(resolve, 50));

        // Let the identity node stay in the natural cache (which is the case right after init/upsert)
        const serverInstance = await createServerWithoutBoot();

        for (const input of ['neo-opus-4-7', '@neo-opus-4-7', '@@neo-opus-4-7']) {
            const boundId = await serverInstance.bindAgentIdentity(input);
            expect(boundId).toBe('@neo-opus-4-7');
        }

        serverInstance.destroy();
    });

    test('#15027: bindAgentIdentity refuses mailbox namespaces and non-AgentIdentity collisions', async () => {
        await GraphService.initAsync();

        GraphService.upsertNode({id: 'AGENT:*', type: 'BroadcastSentinel', name: 'Broadcast'});
        GraphService.upsertNode({id: '@identity-collision-15027', type: 'Concept', name: 'Not an identity'});

        const serverInstance = await createServerWithoutBoot();

        try {
            await expect(serverInstance.bindAgentIdentity('AGENT:*')).resolves.toBeNull();
            await expect(serverInstance.bindAgentIdentity('identity-collision-15027')).resolves.toBeNull();
        } finally {
            serverInstance.destroy();
        }
    });

    test('#15027: stdio and Streamable HTTP identity paths bind through the same provider-agnostic canonicalizer', async () => {
        await GraphService.initAsync();

        GraphService.upsertNode({id: '@identity-topology-15027', type: 'AgentIdentity', name: 'Identity Topology'});

        const serverInstance        = await createServerWithoutBoot();
        const StdioIdentityResolver = (await import('../../../../../../../ai/mcp/server/shared/services/StdioIdentityResolver.mjs')).default;
        const originalResolve       = StdioIdentityResolver.resolve;

        try {
            const streamableHttpContext = await serverInstance.buildRequestContext({
                userId  : 'identity-topology-15027',
                username: 'Identity Topology',
                source  : 'oidc'
            });

            expect(streamableHttpContext).toMatchObject({
                userId             : 'identity-topology-15027',
                agentIdentityNodeId: '@identity-topology-15027',
                source             : 'oidc'
            });

            StdioIdentityResolver.resolve = async () => ({
                githubLogin: 'identity-topology-15027',
                username   : 'Identity Topology',
                source     : 'gh-cli'
            });

            const stdioContext = await serverInstance.resolveStdioIdentity();
            expect(stdioContext).toMatchObject({
                userId             : 'identity-topology-15027',
                agentIdentityNodeId: '@identity-topology-15027',
                source             : 'gh-cli'
            });

            const [{default: RequestContextService}, {default: MailboxService}] = await Promise.all([
                import('../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs'),
                import('../../../../../../../ai/services/memory-core/MailboxService.mjs')
            ]);

            for (const context of [streamableHttpContext, stdioContext]) {
                const sent = await RequestContextService.run(context, () => MailboxService.addMessage({
                    to     : '@me',
                    subject: `topology round-trip ${context.source}`,
                    body   : 'Both transports must reach the same canonical recipient.'
                }));
                fixtureNodeIds.add(sent.messageId);
                const read = await RequestContextService.run(context, () =>
                    MailboxService.markRead({messageId: sent.messageId})
                );

                expect(read).toMatchObject({messageId: sent.messageId, status: 'read'});
            }
        } finally {
            StdioIdentityResolver.resolve = originalResolve;
            serverInstance.destroy();
        }
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
            GraphService.db.nodes.remove('@neo-opus-4-7');
            GraphService.db.vicinityLoadedNodes.add('@neo-opus-4-7');
        } finally {
            GraphService.db.autoSave = wasAutoSave;
        }

        const serverInstance = await createServerWithoutBoot();

        const boundId = await serverInstance.bindAgentIdentity('neo-opus-4-7');

        expect(boundId).toBe('@neo-opus-4-7');

        serverInstance.destroy();
    });

    test('a second provider sharing one login overwrites the first identity on ONE persisted node', async () => {
        // The durable half of the owner-principal question, executed rather than read from source.
        // The graph node id derives from the authenticated login, so two accounts that share a
        // handle across DIFFERENT providers do not merely resolve alike — the later first-write
        // lands on the same row and REWRITES the stored provider coordinates, because an existing
        // auto-provisioned node is refreshed with the full property set.
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot({
            autoProvisionIdentitySources: ['gitlab-pat', 'github-pat']
        });

        try {
            await serverInstance.buildRequestContext({
                token              : 'glpat-xprovider',
                userId             : 'xprovider-shared-login',
                username           : 'GitLab Holder',
                source             : 'gitlab-pat',
                authProvider       : 'gitlab',
                authSource         : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUserId     : 4242,
                providerUsername   : 'xprovider-shared-login',
                providerDisplayName: 'GitLab Holder'
            });

            const afterFirst = rawGraphNode('@xprovider-shared-login');

            expect(afterFirst.properties.authProvider,    'the first write owns the row').toBe('gitlab');
            expect(afterFirst.properties.providerUserId,  '…with its own immutable id').toBe('4242');

            // A different human, on a different provider, who happens to hold the same handle.
            await serverInstance.buildRequestContext({
                token              : 'ghp-xprovider',
                userId             : 'xprovider-shared-login',
                username           : 'GitHub Holder',
                source             : 'github-pat',
                authProvider       : 'github',
                authSource         : 'github-pat',
                providerBaseUrl    : 'https://api.github.com',
                providerUserId     : 777001,
                providerUsername   : 'xprovider-shared-login',
                providerDisplayName: 'GitHub Holder'
            });

            const afterSecond = rawGraphNode('@xprovider-shared-login');

            // Same row — not a second identity.
            expect(afterSecond.properties.createdAt, 'no second node was created').toBe(afterFirst.properties.createdAt);

            // …and the first principal's coordinates are gone. This is the concrete damage behind
            // the login-keyed identity: not just a shared key, but silent takeover of a stored
            // identity record by whoever authenticates next under the same handle.
            expect(afterSecond.properties.authProvider,   'the second provider overwrote the first').toBe('github');
            expect(afterSecond.properties.providerBaseUrl, 'the instance coordinate was overwritten').toBe('https://api.github.com');
            expect(afterSecond.properties.providerUserId,  'the immutable id was overwritten').toBe('777001')
        } finally {
            serverInstance.destroy();
        }
    });

    test('#14388: GitLab-PAT request context auto-provisions a missing AgentIdentity', async () => {
        await GraphService.initAsync();

        const serverInstance = await createServerWithoutBoot({
            autoProvisionIdentitySources: ['gitlab-pat']
        });

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

    test('#15992: the same GitHub identity is admitted or excluded by profile before provisioning', async () => {
        await GraphService.initAsync();

        const
            admittedUser                               = 'github-profile-15992',
            serverInstance                             = await createServerWithoutBoot(),
            [{default: TransportService}, {McpServer}] = await Promise.all([
                import('../../../../../../../ai/mcp/server/shared/services/TransportService.mjs'),
                import('@modelcontextprotocol/sdk/server/mcp.js')
            ]),
            originalFetch = globalThis.fetch,
            contextCalls  = [];

        serverInstance.aiConfig = {
            auth: {
                autoProvisionIdentitySources: ['github-pat']
            }
        };

        TransportService.app        = null;
        TransportService.httpServer = null;
        TransportService.transports = new Map();
        TransportService.mcpServers = new Map();

        globalThis.fetch = async (url, options={}) => {
            if (!String(url).startsWith('https://api.github.test/')) {
                return originalFetch(url, options)
            }

            return {
                ok     : true,
                headers: {get: () => ''},
                json   : async () => ({
                    id   : 15992,
                    login: admittedUser,
                    name : admittedUser
                })
            }
        };

        const profileConfig = allowedUsers => ({
            mcpHttpHost  : '127.0.0.1',
            mcpListenHost: '127.0.0.1',
            mcpHttpPort  : 0,
            fleet        : {cockpitOrigins: ['http://localhost:8080', 'http://127.0.0.1:8080']},
            auth         : {
                mode                        : 'github-pat',
                host                        : null,
                issuerUrl                   : null,
                trustProxyIdentity          : false,
                githubApiBaseUrl            : 'https://api.github.test',
                patCacheTtlSeconds          : 300,
                patValidationTimeoutMs      : 5000,
                allowedUsers,
                allowedClientIds            : [],
                pinFirstProviderSubject     : false,
                providerBootstrapPat        : '',
                providerBootstrapPatFile    : '',
                autoProvisionIdentitySources: ['github-pat']
            }
        });

        const sendInitialize = () => originalFetch(
            `http://127.0.0.1:${TransportService.httpServer.address().port}/mcp`,
            {
                method : 'POST',
                headers: {
                    Accept        : 'application/json, text/event-stream',
                    Authorization : 'Bearer same-provider-identity',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id     : 1,
                    method : 'initialize',
                    params : {
                        protocolVersion: '2024-11-05',
                        capabilities   : {},
                        clientInfo     : {name: 'github-provisioning-15990', version: '1.0.0'}
                    }
                })
            }
        );

        const closeTransport = async () => {
            if (TransportService.httpServer?.listening) {
                await new Promise((resolve, reject) => {
                    TransportService.httpServer.close(error => error ? reject(error) : resolve())
                })
            }

            TransportService.app        = null;
            TransportService.httpServer = null;
            TransportService.transports.clear();
            TransportService.mcpServers.clear()
        };

        const startProfile = allowedUsers => TransportService.setup({
            server: {
                createMcpServer: () => new McpServer({
                    name   : 'github-profile-admission-15992',
                    version: '1.0.0'
                }),
                buildRequestContext: async reqAuth => {
                    contextCalls.push(reqAuth.userId);
                    return serverInstance.buildRequestContext(reqAuth)
                },
                onSessionClosed: () => {}
            },
            aiConfig    : profileConfig(allowedUsers),
            logger      : {info: () => {}, warn: () => {}, error: () => {}},
            resourceName: 'GithubProfileAdmission15992'
        });

        try {
            await startProfile([admittedUser]);

            const admitted = await sendInitialize();

            expect(admitted.status).toBe(200);
            expect(admitted.headers.get('mcp-session-id')).toBeTruthy();

            const admittedNode = rawGraphNode(`@${admittedUser}`);

            expect(admittedNode).toMatchObject({
                label     : 'AgentIdentity',
                properties: {
                    authProvider    : 'github',
                    authSource      : 'github-pat',
                    providerUsername: admittedUser,
                    autoProvisioned : true
                }
            });
            expect(admittedNode.properties.description)
                .toBe('Auto-provisioned Agent OS identity for an authenticated Memory Core principal.');

            await closeTransport();
            await startProfile(['another-profile-member']);

            const denied = await sendInitialize();

            expect(denied.status).toBe(401);
            expect(denied.headers.get('mcp-session-id')).toBeNull();
            expect(contextCalls).toEqual([admittedUser]);
        } finally {
            globalThis.fetch = originalFetch;
            await closeTransport();
            serverInstance.destroy()
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

        const serverInstance = await createServerWithoutBoot({
            autoProvisionIdentitySources: ['gitlab-pat']
        });

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

        const serverInstance = await createServerWithoutBoot({
            autoProvisionIdentitySources: ['gitlab-pat']
        });

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

        const serverInstance = await createServerWithoutBoot({
            autoProvisionIdentitySources: ['gitlab-pat']
        });

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
        const tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-server-14388-'));
        const testDbPath = path.join(tmpDir, 'memory-core-graph.sqlite');
        const script     = String.raw`
            const Neo = (await import('./src/Neo.mjs')).default;
            await import('./src/core/_export.mjs');
            await import('./src/manager/Instance.mjs');
            await import('./ai/mcp/server/memory-core/config.template.mjs');

            const Server       = (await import('./ai/mcp/server/memory-core/Server.mjs')).default;
            const GraphService = (await import('./ai/services/memory-core/GraphService.mjs')).default;

            await GraphService.ready();

            const originalBoot = Server.prototype.boot;
            Server.prototype.boot = async () => {};

            const serverInstance = Neo.create('Neo.ai.mcp.server.memory-core.Server');

        try {
            await serverInstance.ready();
            await serverInstance.buildRequestContext({
                userId             : 'orchestrator-visible-agent-14388',
                username           : 'Orchestrator Visible Agent',
                source             : 'gitlab-pat',
                providerBaseUrl    : 'https://gitlab.example.com',
                providerUsername   : 'orchestrator-visible-agent-14388',
                providerDisplayName: 'Orchestrator Visible Agent'
            });

            console.log('SERVER_14388_RESULT:' + JSON.stringify({
                graphPath: GraphService.db.storage.db.name
            }));
        } finally {
            Server.prototype.boot = originalBoot;
            serverInstance.destroy();
        }
        `;

        try {
            const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
                cwd     : process.cwd(),
                encoding: 'utf8',
                env     : {
                    ...process.env,
                    NEO_AUTH_MODE          : 'gitlab-pat',
                    NEO_MEMORY_DB_PATH_TEST: testDbPath,
                    UNIT_TEST_MODE         : 'true'
                },
                timeout: 30_000
            });

            expect(result.error, `${result.stderr}\n${result.stdout}`).toBeUndefined();
            expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);

            const output = result.stdout.match(/^SERVER_14388_RESULT:(.+)$/m);

            expect(output, result.stdout).toBeTruthy();
            expect(JSON.parse(output[1]).graphPath).toBe(testDbPath);

            const {default: Database} = await import('better-sqlite3');
            const peerDb              = new Database(testDbPath, {readonly: true});

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
            fs.removeSync(tmpDir);
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
        const originalRecorderReady           = SDK.Memory_RecorderService.ready;
        const originalRecordStartupDependency = HealthService.recordStartupDependency;
        const originalSetStdioIdentityState   = HealthService.setStdioIdentityState;

        SDK.Memory_WakeSubscriptionService.init = async () => {
            calls.push('wakeInit');
            throw wakeFailure;
        };
        SDK.Memory_InferenceLifecycleService.ready = async () => calls.push('inferenceReady');
        SDK.Memory_SessionService.ready = async () => calls.push('sessionReady');
        SDK.Memory_RecorderService.ready = async () => calls.push('toolTelemetryReady');
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
            SDK.Memory_RecorderService.ready = originalRecorderReady;
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

    test('#15188: Streamable HTTP boot skips process-level stdio identity work', async () => {
        const serverInstance = await createServerWithoutBoot();
        const calls          = [];

        serverInstance.aiConfig = {transport: 'streamable-http'};
        serverInstance.loadCustomConfig = async () => calls.push('loadCustomConfig');
        serverInstance.createMcpServer = () => {
            calls.push('createMcpServer');
            return {server: {setRequestHandler() {}}};
        };
        serverInstance.prepareStartupDependency = async () => {};
        serverInstance.resolveStdioIdentity = async () => calls.push('resolveStdioIdentity');
        serverInstance.runHealthcheckAndLogStatus = async () => calls.push('runHealthcheckAndLogStatus');
        serverInstance.logSiblingConcurrency = () => calls.push('logSiblingConcurrency');
        serverInstance.connectTransport = async () => calls.push('connectTransport');
        serverInstance.logIdentityStatus = () => calls.push('logIdentityStatus');

        try {
            await serverInstance.boot();

            expect(calls).toEqual([
                'loadCustomConfig',
                'createMcpServer',
                'runHealthcheckAndLogStatus',
                'logSiblingConcurrency',
                'connectTransport'
            ]);
        } finally {
            serverInstance.destroy();
        }
    });

    test('the unhealthy-boot tip names the RESOLVED chroma target, never invented fallbacks (#16003)', async () => {
        const aiConfig              = (await import('../../../../../../../ai/mcp/server/memory-core/config.template.mjs')).default,
              logger                = (await import('../../../../../../../ai/mcp/server/memory-core/logger.mjs')).default,
              {dataDir, host, port} = aiConfig.engines.chroma,
              serverInstance        = await createServerWithoutBoot(),
              originalWarn          = logger.warn,
              lines                 = [];

        logger.warn = message => lines.push(String(message));

        try {
            // The branch the tip guards: server up, chroma process not owned/running.
            serverInstance.logStartupStatus({
                status  : 'unhealthy',
                details : ['Embedding write canary failed'],
                database: {process: {running: false}}
            });
        } finally {
            logger.warn = originalWarn;
            serverInstance.destroy();
        }

        const tip = lines.join('\n');

        // Resolved truth, not guesses: the operator is told where THIS server dials.
        expect(tip).toContain(`${host}:${port}`);
        expect(tip).toContain(dataDir);
        expect(tip).toContain(`--path ${dataDir}`);
        expect(tip).toContain(`--port ${port}`);

        // The invented fallbacks the predecessor printed — a path this plane never uses.
        expect(tip).not.toContain('./data/chroma');

        // The bind-family hint covers the one failure mode where the service is UP and the client
        // still cannot reach it: a `[::1]`-only listener refuses an IPv4 client. It is an independent
        // diagnostic for a "service looks down" misread — a refused connection returns in ~1ms, so it
        // never explains a hang or a timeout, and it is not the mechanism behind any slow-boot outage.
        expect(tip).toMatch(/IPv6-only|bind family/i);
        expect(tip).toContain(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    });

    test.describe('#16025: the unhealthy-boot tip reports the OBSERVED loopback family', () => {
        /**
         * Drives `logStartupStatus` with a health payload carrying a classified probe result and
         * returns the captured warn output.
         *
         * The probe result is attached under the SHARED key exported by the helper, not a literal, so
         * this spec breaks if `HealthService` and the `Server` ever disagree about the path — the one
         * failure mode neither file's own spec can see.
         */
        const renderTip = async loopbackProbe => {
            const {LOOPBACK_PROBE_HEALTH_KEY} = await import('../../../../../../../ai/services/memory-core/helpers/loopbackFamilyProbe.mjs'),
                  logger                      = (await import('../../../../../../../ai/mcp/server/memory-core/logger.mjs')).default,
                  serverInstance              = await createServerWithoutBoot(),
                  originalWarn                = logger.warn,
                  lines                       = [];

            logger.warn = message => lines.push(String(message));

            let returned;

            try {
                returned = serverInstance.logStartupStatus({
                    status  : 'unhealthy',
                    details : ['Database engine not accessible'],
                    database: {
                        process   : {running: false},
                        connection: {[LOOPBACK_PROBE_HEALTH_KEY]: loopbackProbe}
                    }
                });
            } finally {
                logger.warn = originalWarn;
                serverInstance.destroy();
            }

            return {tip: lines.join('\n'), returned};
        };

        test('a MISMATCH is stated as an observation, and it REPLACES the lsof fallback', async () => {
            const {tip} = await renderTip({
                verdict: 'mismatch', conclusive: true, dialed: '127.0.0.1', answering: ['[::1]'], empty: ['127.0.0.1'], unknown: []
            });

            // The requirement is readability from the output alone: the operator is told the answer,
            // not handed a command that would find it.
            expect(tip).toMatch(/Bind-family mismatch OBSERVED/);
            expect(tip).toContain('127.0.0.1');
            expect(tip).toContain('[::1]');

            // OBSERVATIONAL, and the discrimination is the point: a successful TCP connect proves a
            // listener accepted, NOT that the listener is ChromaDB — nothing here speaks Chroma's
            // protocol. The earlier wording asserted the answering process's identity, which is the
            // same overclaim this diagnostic exists to retire.
            expect(tip).toMatch(/TCP listener answered/);
            expect(tip).toMatch(/unidentified/);
            expect(tip).toMatch(/If that listener is ChromaDB/);   // inference offered, not asserted
            expect(tip).not.toMatch(/ChromaDB is running/);

            // The fallback is now redundant, so it must be GONE — leaving it would mean the tip still
            // costs the operator the command the AC exists to remove.
            expect(tip).not.toContain('lsof');
        });

        test('⭐ NO-LISTENER names the OBSERVED addresses, not a hardcoded 127.0.0.1', async () => {
            // The rendering half carried the same substitution defect the probe half had fixed: a literal
            // `127.0.0.1` in the wording reported an address a 127.0.0.5-configured server never dials.
            const {tip} = await renderTip({
                verdict: 'no-listener', conclusive: true, dialed: '127.0.0.5', answering: [], empty: ['127.0.0.5', '[::1]'], unknown: []
            });

            // Scoped to the no-listener SENTENCE, not the whole tip: the first line legitimately prints
            // the resolved config endpoint, so a whole-tip matcher would be answering about the wrong
            // subject — the exact mistake this PR's diagnostic exists to avoid.
            const probedLine = tip.split('\n').find(line => line.includes('nothing answered on port'));

            expect(probedLine).toBeDefined();
            expect(tip).toContain('127.0.0.5 or [::1]');
            // The observed-address line must not name an address the server does not dial.
            expect(tip.split('\n').filter(line => line.includes(' or [::1]')).join('\n')).not.toContain('127.0.0.1');
        })

        test('NO-LISTENER rules the mismatch OUT and also replaces the fallback', async () => {
            const {tip} = await renderTip({
                verdict: 'no-listener', conclusive: true, dialed: '127.0.0.1', answering: [], empty: ['127.0.0.1', '[::1]'], unknown: []
            });

            // Just as useful as the positive verdict: it stops the operator hunting a bind-family
            // problem that provably is not there.
            expect(tip).toMatch(/nothing answered/i);
            expect(tip).toMatch(/not a bind-family mismatch/i);
            // Observational: it no longer asserts WHICH process is absent, only that nothing answered.
            expect(tip).not.toMatch(/ChromaDB is\s+genuinely/);
            expect(tip).not.toContain('lsof');
        });

        test('LISTENER-REACHABLE points above TCP instead of at the bind family', async () => {
            const {tip} = await renderTip({
                verdict: 'listener-reachable', conclusive: true, dialed: '127.0.0.1', answering: ['127.0.0.1'], empty: ['[::1]'], unknown: []
            });

            expect(tip).toMatch(/above TCP/);
            expect(tip).not.toContain('lsof');
        });

        test('AMBIGUOUS-HOST reports which families answered WITHOUT claiming a mismatch', async () => {
            const {tip} = await renderTip({
                verdict: 'ambiguous-host', conclusive: true, dialed: 'localhost', answering: ['[::1]'], empty: ['127.0.0.1'], unknown: []
            });

            expect(tip).toContain('[::1]');
            expect(tip).toMatch(/chosen by the resolver/);
            // The claim is explicitly hedged, because which family `localhost` resolves to is not
            // observable from here. Asserting a mismatch would be the unverified assertion the whole
            // helper is built to avoid.
            expect(tip).toMatch(/not\s+proven/);
            expect(tip).not.toMatch(/mismatch OBSERVED/);
        });

        test('an INCONCLUSIVE probe KEEPS the lsof fallback — the operator still needs it', async () => {
            const {tip} = await renderTip({
                verdict: 'inconclusive', conclusive: false, dialed: '127.0.0.1', answering: ['[::1]'], empty: [], unknown: ['127.0.0.1'], reason: 'no result for 127.0.0.1'
            });

            // The AC is conditional in both directions: the fallback goes away ONLY when the printed
            // result genuinely replaces it. An unknown family replaces nothing.
            expect(tip).toContain('lsof -nP -iTCP:');
            expect(tip).not.toMatch(/mismatch OBSERVED/);
        });

        test('a SKIPPED probe (non-loopback host, e.g. a compose service name) keeps the fallback', async () => {
            const {tip} = await renderTip({verdict: 'skipped', conclusive: false, reason: 'configured host chroma is not a loopback address'});

            expect(tip).toContain('lsof -nP -iTCP:');
        });

        test('an ABSENT probe keeps the pre-#16025 wording verbatim (older/cached payloads)', async () => {
            const {tip} = await renderTip(undefined);

            expect(tip).toContain('lsof -nP -iTCP:');
            expect(tip).toMatch(/IPv6-only|bind family/i);
        });

        test('logStartupStatus stays SYNCHRONOUS — it renders, it never probes', async () => {
            // The hook is overridden by six servers. Returning a promise here would leave every one of
            // them silently sync-in-async-context, so "returns nothing" is a contract worth pinning.
            const {returned} = await renderTip({verdict: 'mismatch', conclusive: true, dialed: '127.0.0.1', answering: ['[::1]']});

            expect(returned).toBeUndefined();
        });
    });
});
