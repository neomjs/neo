import {setup} from '../../../../../setup.mjs';

const appName = 'KnowledgeBaseServerTest';

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
import Neo                     from '../../../../../../../src/Neo.mjs';
import * as core               from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.mcp.server.knowledge-base.Server', () => {
    let Server, HealthService;

    /**
     * @summary Creates a Server instance whose async boot is suppressed and fully settled.
     *
     * `core.Base.construct()` schedules `initAsync()` on a Promise microtask, so a plain
     * `Neo.create()` returns BEFORE boot runs. `destroy()` then deletes every writable own
     * property — and `aiConfig` is a public instance field, so it goes with them. The queued
     * boot afterwards reaches `assertPlaneIdentity()` on a gutted instance and throws
     * `declared plane member booted without aiConfig`.
     *
     * That rejection is unowned and asynchronous, so it does not fail THIS spec — it surfaces
     * in whichever test happens to be running when it fires, which is why the symptom appeared
     * in an unrelated cross-server smoke test. Tests reading pure/synchronous methods must
     * therefore still let the lifecycle settle before destroying.
     *
     * Suppressing `boot` (rather than awaiting a real one) keeps these tests hermetic: the
     * methods under test are pure, so booting real Knowledge Base services would add durable
     * storage and network surface this spec does not exercise.
     *
     * Mirrors the established pattern in `memory-core/Server.spec.mjs`.
     * @returns {Promise<Object>} a settled instance, safe to `destroy()`
     */
    async function createServerWithoutBoot() {
        const originalBoot = Server.prototype.boot;

        Server.prototype.boot = async () => {};

        const serverInstance = Neo.create(Server);

        try {
            await serverInstance.ready();
        } finally {
            Server.prototype.boot = originalBoot;
        }

        return serverInstance;
    }

    test.beforeAll(async () => {
        Server        = (await import('../../../../../../../ai/mcp/server/knowledge-base/Server.mjs')).default;
        HealthService = (await import('../../../../../../../ai/services/knowledge-base/HealthService.mjs')).default;
    });

    test('#16691: startup awaits the first bounded embedding observation before healthcheck', async () => {
        const serverInstance      = await createServerWithoutBoot(),
              originalStart       = HealthService.startEmbeddingProbe,
              originalStop        = HealthService.stopEmbeddingProbe,
              exitListenersBefore = new Set(process.listeners('exit'));

        let releaseObservation;
        let startupSettled = false;

        HealthService.startEmbeddingProbe = () => new Promise(resolve => {
            releaseObservation = resolve;
        });
        HealthService.stopEmbeddingProbe = () => {};

        try {
            const startup = serverInstance.beforeHealthcheck().then(() => {
                startupSettled = true;
            });

            await Promise.resolve();
            expect(startupSettled).toBe(false);

            releaseObservation({status: 'healthy'});
            await startup;

            expect(startupSettled).toBe(true);
        } finally {
            HealthService.startEmbeddingProbe = originalStart;
            HealthService.stopEmbeddingProbe  = originalStop;

            process.listeners('exit')
                .filter(listener => !exitListenersBefore.has(listener))
                .forEach(listener => process.removeListener('exit', listener));

            serverInstance.destroy();
        }
    });

    test('#15886: the plane-identity assertion names its ORIGIN server, not the shared class name', async () => {
        const serverInstance = await createServerWithoutBoot();

        // Reproduce the exact state the queued-boot race produced: an instance whose `aiConfig`
        // is gone. `destroy()` deletes it (a writable own property), which is what made the
        // original defect throw from a server nobody could identify.
        serverInstance.destroy();

        // `className` survives destruction, so the diagnostic still resolves here — the one
        // condition it has to work in.
        expect(() => serverInstance.assertPlaneIdentity())
            .toThrow(/\[Neo\.ai\.mcp\.server\.knowledge-base\.Server] declared plane member booted without aiConfig/);

        // The regression guard: `constructor.name` is `Server` for EVERY MCP server class, so a
        // bare `[Server]` prefix identifies nothing. This is what the message used to say.
        expect(() => serverInstance.assertPlaneIdentity()).not.toThrow(/\[Server]/);
    });

    test('#12752/#13464/#17066: health exemptions expose recovery tools but not retired database lifecycle tools', async () => {
        const serverInstance = await createServerWithoutBoot();

        try {
            const exemptTools = serverInstance.getHealthExemptTools();

            expect(exemptTools).toEqual([
                'healthcheck',
                'get_ingestion_progress',
                'list_agent_faqs',
                'manage_knowledge_base',
                'list_documents',
                'get_deployment_state_snapshot',
                'inspect_deployment'
            ]);
            expect(exemptTools).not.toContain('start_database');
            expect(exemptTools).not.toContain('stop_database');
        } finally {
            serverInstance.destroy();
        }
    });

    test('#17066: non-embedding diagnostics bypass an embedder-degraded gate while semantic queries remain gated', async () => {
        const serverInstance = await createServerWithoutBoot();
        const handlers       = new Map();
        const healthCalls    = [];
        const toolCalls      = [];
        const degradedError  = new Error([
            'Knowledge Base is not fully operational:',
            '  - Knowledge Base embedding probe failed: provider-timeout'
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

            for (const [name, args] of [
                ['list_documents',                {limit: 5}],
                ['get_deployment_state_snapshot', {}],
                ['inspect_deployment',            {staleAfterMs: 1000}]
            ]) {
                const result = await callTool({params: {name, arguments: args}});

                expect(result.isError).toBe(false);
                expect(result.structuredContent).toEqual({ok: true, name});
            }

            expect(healthCalls).toEqual([]);
            expect(toolCalls).toEqual([
                {name: 'list_documents',                args: {limit: 5}},
                {name: 'get_deployment_state_snapshot', args: {}},
                {name: 'inspect_deployment',            args: {staleAfterMs: 1000}}
            ]);

            for (const name of ['query_documents', 'ask_knowledge_base']) {
                const result = await callTool({params: {name, arguments: {query: 'q'}}});

                expect(result.isError).toBe(true);
                expect(result.content[0].text).toContain(`Cannot execute ${name}: Knowledge Base is not fully operational`);
            }

            expect(healthCalls).toEqual(['ensureHealthy', 'ensureHealthy']);
            expect(toolCalls).toHaveLength(3);
        } finally {
            serverInstance.getToolService   = originalGetToolService;
            serverInstance.getHealthService = originalGetHealthService;
            serverInstance.destroy();
        }
    });

    test('#15990: GitHub-PAT identity reaches the Knowledge Base request boundary intact', async () => {
        const serverInstance = await createServerWithoutBoot();

        try {
            const context = await serverInstance.buildRequestContext({
                userId  : 'github-pinned-15990',
                username: 'GitHub Pinned 15990',
                source  : 'github-pat'
            });

            expect(context).toEqual({
                userId  : 'github-pinned-15990',
                username: 'GitHub Pinned 15990',
                source  : 'github-pat'
            })
        } finally {
            serverInstance.destroy()
        }
    });

    test('#15992: the same GitHub identity is admitted or excluded before KB dispatch', async () => {
        const
            admittedUser                               = 'github-kb-profile-15992',
            serverInstance                             = await createServerWithoutBoot(),
            [{default: TransportService}, {McpServer}] = await Promise.all([
                import('../../../../../../../ai/mcp/server/shared/services/TransportService.mjs'),
                import('@modelcontextprotocol/sdk/server/mcp.js')
            ]),
            originalFetch = globalThis.fetch,
            contextCalls  = [];

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
                patDiskCachePath            : '',
                patValidationTimeoutMs      : 5000,
                allowedUsers,
                allowedClientIds            : [],
                pinFirstProviderSubject     : false,
                providerBootstrapPat        : '',
                providerBootstrapPatFile    : '',
                autoProvisionIdentitySources: []
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
                        clientInfo     : {name: 'github-kb-profile-15992', version: '1.0.0'}
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
                    name   : 'github-kb-profile-admission-15992',
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
            resourceName: 'GithubKbProfileAdmission15992'
        });

        try {
            await startProfile([admittedUser]);

            const admitted = await sendInitialize();

            expect(admitted.status).toBe(200);
            expect(admitted.headers.get('mcp-session-id')).toBeTruthy();
            expect(contextCalls).toEqual([admittedUser]);

            await closeTransport();
            await startProfile(['another-profile-member']);

            const denied = await sendInitialize();

            expect(denied.status).toBe(401);
            expect(denied.headers.get('mcp-session-id')).toBeNull();
            expect(contextCalls).toEqual([admittedUser])
        } finally {
            globalThis.fetch = originalFetch;
            await closeTransport();
            serverInstance.destroy()
        }
    });
});
