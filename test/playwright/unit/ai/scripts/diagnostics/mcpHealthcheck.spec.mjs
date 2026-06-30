import {test, expect} from '@playwright/test';
import fs             from 'fs';
import * as yaml      from 'js-yaml';

test.describe('ai/scripts/diagnostics/mcpHealthcheck (#11725)', () => {
    let parseArgs;
    let buildHeaders;
    let readToolJson;
    let runHealthcheck;
    let formatHealthcheckError;
    const readProductionCompose = () => yaml.load(fs.readFileSync(
        new URL('../../../../../../ai/deploy/docker-compose.yml', import.meta.url),
        'utf8'
    ));

    function environmentMap(service) {
        return Object.fromEntries(service.environment.map(entry => entry.split('=')));
    }

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/diagnostics/mcpHealthcheck.mjs');

        parseArgs              = mod.parseArgs;
        buildHeaders           = mod.buildHeaders;
        readToolJson           = mod.readToolJson;
        runHealthcheck         = mod.runHealthcheck;
        formatHealthcheckError = mod.formatHealthcheckError;
    });

    test('parseArgs uses dotenv-compatible environment defaults', () => {
        const args = parseArgs([], {
            NEO_MCP_HEALTHCHECK_URL            : 'http://mc-server:3001',
            NEO_MCP_HEALTHCHECK_IDENTITY       : 'deploy-probe',
            NEO_MCP_HEALTHCHECK_TOKEN_ENV      : 'TOKEN_SLOT',
            TOKEN_SLOT                         : 'secret-token',
            NEO_MCP_HEALTHCHECK_EXPECTED_STATUS: 'ready',
            NEO_MCP_HEALTHCHECK_CLIENT_NAME    : 'deploy-client',
            NEO_MCP_HEALTHCHECK_TIMEOUT_MS     : '7000'
        });

        expect(args).toEqual({
            url           : 'http://mc-server:3001',
            identity      : 'deploy-probe',
            bearerToken   : 'secret-token',
            bearerTokenEnv: 'TOKEN_SLOT',
            expectedStatus: 'ready',
            clientName    : 'deploy-client',
            timeoutMs     : 7000
        });
    });

    test('parseArgs lets CLI flags override environment defaults', () => {
        const args = parseArgs([
            '--url', 'http://127.0.0.1:3000',
            '--identity', 'cli-identity',
            '--bearer-token-env', 'CLI_TOKEN',
            '--expected-status', 'healthy',
            '--client-name', 'cli-client',
            '--timeout-ms', '6000'
        ], {
            NEO_MCP_HEALTHCHECK_URL      : 'http://ignored:3000',
            NEO_MCP_HEALTHCHECK_IDENTITY : 'ignored',
            NEO_MCP_HEALTHCHECK_TOKEN_ENV: 'IGNORED_TOKEN',
            CLI_TOKEN                    : 'cli-secret'
        });

        expect(args).toMatchObject({
            url           : 'http://127.0.0.1:3000',
            identity      : 'cli-identity',
            bearerToken   : 'cli-secret',
            expectedStatus: 'healthy',
            clientName    : 'cli-client',
            timeoutMs     : 6000
        });
    });

    test('buildHeaders includes proxy identity and bearer token only when configured', () => {
        expect(buildHeaders({identity: 'probe', bearerToken: 'token'})).toEqual({
            'X-PREFERRED-USERNAME': 'probe',
            'Authorization'       : 'Bearer token'
        });

        expect(buildHeaders({identity: null, bearerToken: null})).toEqual({});
    });

    test('readToolJson supports structuredContent and JSON text fallback', () => {
        expect(readToolJson({structuredContent: {status: 'healthy'}})).toEqual({status: 'healthy'});

        expect(readToolJson({
            content: [{type: 'text', text: '{"status":"healthy"}'}]
        })).toEqual({status: 'healthy'});
    });

    test('runHealthcheck calls /mcp healthcheck and closes the client', async () => {
        const calls = [];

        class FakeTransport {
            constructor(url, options) {
                this.url     = url;
                this.options = options;
            }
        }

        class FakeClient {
            constructor(identity, options) {
                calls.push({type: 'client', identity, options});
            }

            async connect(transport) {
                calls.push({type: 'connect', url: transport.url.toString(), headers: transport.options.requestInit.headers});
            }

            async callTool(request) {
                calls.push({type: 'callTool', request});

                return {structuredContent: {status: 'healthy'}};
            }

            async close() {
                calls.push({type: 'close'});
            }
        }

        const result = await runHealthcheck({
            url           : 'http://127.0.0.1:3000',
            identity      : 'probe',
            bearerToken   : 'token',
            ClientClass   : FakeClient,
            TransportClass: FakeTransport
        });

        expect(result).toEqual({
            status: 'healthy',
            url   : 'http://127.0.0.1:3000/'
        });
        expect(calls).toEqual([
            {type: 'client', identity: {name: 'neo-container-healthcheck', version: '1.0.0'}, options: {capabilities: {}}},
            {type: 'connect', url: 'http://127.0.0.1:3000/mcp', headers: {'X-PREFERRED-USERNAME': 'probe', Authorization: 'Bearer token'}},
            {type: 'callTool', request: {name: 'healthcheck', arguments: {}}},
            {type: 'close'}
        ]);
    });

    test('runHealthcheck fails on unhealthy status', async () => {
        class FakeTransport {}
        class FakeClient {
            async connect() {}
            async callTool() {
                return {structuredContent: {status: 'degraded'}};
            }
            async close() {}
        }

        await expect(runHealthcheck({
            url           : 'http://127.0.0.1:3000',
            ClientClass   : FakeClient,
            TransportClass: FakeTransport
        })).rejects.toThrow("Expected healthcheck status 'healthy', got 'degraded'.");
    });

    test('#13458: runHealthcheck times out a hanging MCP connect and closes the client', async () => {
        const calls = [];

        class FakeTransport {}
        class FakeClient {
            async connect() {
                calls.push({type: 'connect'});
                return new Promise(() => {});
            }
            async close() {
                calls.push({type: 'close'});
            }
        }

        await expect(runHealthcheck({
            url           : 'http://127.0.0.1:3000',
            timeoutMs     : 5,
            ClientClass   : FakeClient,
            TransportClass: FakeTransport
        })).rejects.toThrow('MCP healthcheck connect timed out after 5ms');

        expect(calls).toEqual([{type: 'connect'}, {type: 'close'}]);
    });

    test('#13458: runHealthcheck times out a hanging healthcheck tool call and closes the client', async () => {
        const calls = [];

        class FakeTransport {}
        class FakeClient {
            async connect() {
                calls.push({type: 'connect'});
            }
            async callTool() {
                calls.push({type: 'callTool'});
                return new Promise(() => {});
            }
            async close() {
                calls.push({type: 'close'});
            }
        }

        await expect(runHealthcheck({
            url           : 'http://127.0.0.1:3000',
            timeoutMs     : 5,
            ClientClass   : FakeClient,
            TransportClass: FakeTransport
        })).rejects.toThrow('MCP healthcheck tool call timed out after 5ms');

        expect(calls).toEqual([{type: 'connect'}, {type: 'callTool'}, {type: 'close'}]);
    });

    test('formatHealthcheckError appends a bearer-token hint only when no token was configured', () => {
        const error = new Error('HTTP 401');

        const withToken = formatHealthcheckError(error, {bearerToken: 'secret'});
        expect(withToken).toBe('HTTP 401');
        expect(withToken).not.toContain('NEO_MCP_HEALTHCHECK_TOKEN');

        const withoutToken = formatHealthcheckError(error, {bearerToken: null});
        expect(withoutToken).toContain('HTTP 401');
        expect(withoutToken).toContain('NEO_MCP_HEALTHCHECK_TOKEN is unset');
        expect(withoutToken).toContain('NEO_AUTH_MODE=gitlab-pat');
        expect(withoutToken).toContain('/api/v4/user');
        expect(withoutToken).toContain('Troubleshooting.md');
    });

    test('formatHealthcheckError names the configured bearer-token env var', () => {
        const hint = formatHealthcheckError(new Error('boom'), {bearerToken: null, bearerTokenEnv: 'TOKEN_SLOT'});

        expect(hint).toContain('TOKEN_SLOT is unset');
        expect(hint).not.toContain('NEO_MCP_HEALTHCHECK_TOKEN');
    });

    test('production compose wires KB/MC MCP healthchecks before cloud orchestrator startup', () => {
        const compose = readProductionCompose();

        expect(compose.services['kb-server'].healthcheck.test).toEqual([
            'CMD',
            'node',
            './ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url',
            'http://127.0.0.1:3000',
            '--client-name',
            'neo-kb-container-healthcheck'
        ]);

        expect(compose.services['mc-server'].healthcheck.test).toEqual([
            'CMD',
            'node',
            './ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url',
            'http://127.0.0.1:3001',
            '--client-name',
            'neo-mc-container-healthcheck'
        ]);

        expect(compose.services.orchestrator.depends_on['kb-server']).toEqual({condition: 'service_healthy'});
        expect(compose.services.orchestrator.depends_on['mc-server']).toEqual({condition: 'service_healthy'});
    });

    test('production compose pins cloud-profile local wake and mailbox boundaries', () => {
        const compose           = readProductionCompose();
        const orchestratorEnv   = environmentMap(compose.services.orchestrator);
        const memoryCoreEnv     = environmentMap(compose.services['mc-server']);

        expect(orchestratorEnv).toMatchObject({
            NEO_AI_DEPLOYMENT_MODE                              : 'cloud',
            NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED           : 'false',
            NEO_ORCHESTRATOR_KB_SYNC_ENABLED                    : 'false',
            NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED              : 'false',
            NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED: 'false',
            NEO_ORCHESTRATOR_MLX_ENABLED                        : 'false',
            NEO_ORCHESTRATOR_LMS_ENABLED                        : 'false',
            NEO_ORCHESTRATOR_OLLAMA_ENABLED                     : 'false'
        });

        expect(memoryCoreEnv.NEO_MAILBOX_DEFAULT_REPLY_POLICY).toBe('blocked');
    });

    test('production compose keeps local-model as an opt-in provider profile', () => {
        const compose         = readProductionCompose();
        const localModel      = compose.services['local-model'];
        const knowledgeBaseEnv = environmentMap(compose.services['kb-server']);
        const memoryCoreEnv   = environmentMap(compose.services['mc-server']);
        const orchestratorEnv = environmentMap(compose.services.orchestrator);

        expect(localModel.profiles).toEqual(['local-model']);
        expect(localModel.image).toBe('${NEO_LOCAL_MODEL_IMAGE:-ollama/ollama:latest}');
        expect(localModel.expose).toEqual(['11434']);
        expect(localModel.volumes).toContain('local-model-data:/root/.ollama');
        expect(localModel.environment).toEqual(expect.arrayContaining([
            'OLLAMA_HOST=0.0.0.0:11434',
            'OLLAMA_MODELS=/root/.ollama',
            'OLLAMA_KEEP_ALIVE=${NEO_LOCAL_MODEL_KEEP_ALIVE:--1}',
            'OLLAMA_CONTEXT_LENGTH=${NEO_LOCAL_MODEL_CONTEXT_LENGTH:-131072}',
            'OLLAMA_NUM_PARALLEL=${NEO_LOCAL_MODEL_NUM_PARALLEL:-1}',
            'OLLAMA_MAX_LOADED_MODELS=${NEO_LOCAL_MODEL_MAX_LOADED_MODELS:-2}'
        ]));
        expect(localModel.healthcheck.test).toEqual(['CMD', 'ollama', 'list']);
        expect(localModel.deploy.resources.limits).toEqual({
            memory: '${NEO_LOCAL_MODEL_MEMORY_LIMIT:-32g}',
            cpus  : '${NEO_LOCAL_MODEL_CPU_LIMIT:-4.0}'
        });
        expect(compose.volumes).toHaveProperty('local-model-data');

        for (const env of [knowledgeBaseEnv, memoryCoreEnv, orchestratorEnv]) {
            expect(env).toMatchObject({
                NEO_MODEL_PROVIDER                   : '${NEO_MODEL_PROVIDER:-}',
                NEO_EMBEDDING_PROVIDER               : '${NEO_EMBEDDING_PROVIDER:-}',
                NEO_OPENAI_COMPATIBLE_HOST           : '${NEO_OPENAI_COMPATIBLE_HOST:-}',
                NEO_OPENAI_COMPATIBLE_MODEL          : '${NEO_OPENAI_COMPATIBLE_MODEL:-}',
                NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL: '${NEO_OPENAI_COMPATIBLE_EMBEDDING_MODEL:-}',
                NEO_OPENAI_COMPATIBLE_API_KEY        : '${NEO_OPENAI_COMPATIBLE_API_KEY:-}',
                NEO_OLLAMA_KEEP_ALIVE                : '${NEO_OLLAMA_KEEP_ALIVE:-}',
                NEO_OPENAI_COMPATIBLE_KEEP_ALIVE     : '${NEO_OPENAI_COMPATIBLE_KEEP_ALIVE:-}'
            });
        }

        expect(orchestratorEnv.NEO_ORCHESTRATOR_MLX_ENABLED).toBe('false');
    });
});
