import {test, expect} from '@playwright/test';
import fs             from 'fs';
import os             from 'node:os';
import path           from 'node:path';
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
            NEO_MCP_HEALTHCHECK_URL                     : 'http://mc-server:3001',
            NEO_MCP_HEALTHCHECK_PATH                    : '/mc/mcp',
            NEO_MCP_HEALTHCHECK_IDENTITY                : 'deploy-probe',
            NEO_MCP_HEALTHCHECK_TOKEN_ENV               : 'TOKEN_SLOT',
            TOKEN_SLOT                                  : 'secret-token',
            NEO_MCP_HEALTHCHECK_EXPECTED_STATUS         : 'ready',
            NEO_MCP_HEALTHCHECK_EXPECTED_PLANE_ID       : 'neo-local-parity',
            NEO_MCP_HEALTHCHECK_EXPECTED_PLANE_DATA_ROOT: '/app/.neo-ai-data-parity',
            NEO_MCP_HEALTHCHECK_CLIENT_NAME             : 'deploy-client',
            NEO_MCP_HEALTHCHECK_TIMEOUT_MS              : '7000'
        });

        expect(args).toEqual({
            url                  : 'http://mc-server:3001',
            mcpPath              : '/mc/mcp',
            identity             : 'deploy-probe',
            bearerToken          : 'secret-token',
            bearerTokenEnv       : 'TOKEN_SLOT',
            bearerTokenFile      : null,
            expectedStatus       : 'ready',
            expectedPlaneId      : 'neo-local-parity',
            expectedPlaneDataRoot: '/app/.neo-ai-data-parity',
            clientName           : 'deploy-client',
            timeoutMs            : 7000
        });
    });

    test('parseArgs reads one bearer token file and trims its terminal newline', () => {
        const
            tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-healthcheck-token-')),
            tokenPath = path.join(tempDir, 'mcp-auth-token');

        fs.writeFileSync(tokenPath, 'file-secret-token\n');

        try {
            const args = parseArgs(['--bearer-token-file', tokenPath], {});

            expect(args.bearerToken).toBe('file-secret-token');
            expect(args.bearerTokenFile).toBe(tokenPath)
        } finally {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    });

    test('parseArgs rejects ambiguous, unreadable, and empty file carriers without exposing tokens', () => {
        const
            tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-healthcheck-token-invalid-')),
            tokenPath = path.join(tempDir, 'mcp-auth-token'),
            emptyPath = path.join(tempDir, 'empty-token'),
            rawSecret = 'secret-that-must-not-appear';

        fs.writeFileSync(tokenPath, `${rawSecret}\n`);
        fs.writeFileSync(emptyPath, ' \n');

        let ambiguityError;

        try {
            try {
                parseArgs(['--bearer-token-file', tokenPath], {
                    NEO_MCP_HEALTHCHECK_TOKEN: rawSecret
                })
            } catch (error) {
                ambiguityError = error
            }

            expect(ambiguityError?.message).toMatch(/exactly one healthcheck bearer carrier/i);
            expect(ambiguityError?.message).not.toContain(rawSecret);
            expect(() => parseArgs(['--bearer-token-file', path.join(tempDir, 'missing-token')], {}))
                .toThrow('Cannot read the configured healthcheck bearer-token file');

            expect(() => parseArgs(['--bearer-token-file', emptyPath], {}))
                .toThrow('The configured healthcheck bearer-token file contains no credential')
        } finally {
            fs.rmSync(tempDir, {recursive: true, force: true})
        }
    });

    test('the served-plane expectations default to null, so they are opt-in', () => {
        // A container healthcheck that has not been told which plane to expect must keep behaving
        // exactly as before — the identity assertion is a capability, never a new requirement.
        const args = parseArgs([], {});

        expect(args.expectedPlaneId).toBeNull();
        expect(args.expectedPlaneDataRoot).toBeNull()
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

    test('runHealthcheck supports a routed MCP path below one shared ingress', async () => {
        let connectedUrl;

        class FakeTransport {
            constructor(url) {
                this.url = url;
            }
        }

        class FakeClient {
            async connect(transport) {
                connectedUrl = transport.url.toString();
            }
            async callTool() {
                return {structuredContent: {status: 'healthy'}};
            }
            async close() {}
        }

        await runHealthcheck({
            url           : 'http://127.0.0.1:3102',
            mcpPath       : '/mc/mcp',
            ClientClass   : FakeClient,
            TransportClass: FakeTransport
        });

        expect(connectedUrl).toBe('http://127.0.0.1:3102/mc/mcp');
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
        expect(withoutToken).toContain('NEO_MCP_HEALTHCHECK_TOKEN or NEO_MCP_HEALTHCHECK_TOKEN_FILE');
        expect(withoutToken).toContain('provider-PAT auth mode');
        expect(withoutToken).toContain('provider user endpoint');
        expect(withoutToken).toContain('Troubleshooting.md');
    });

    test('formatHealthcheckError names the configured bearer-token env var', () => {
        const hint = formatHealthcheckError(new Error('boom'), {bearerToken: null, bearerTokenEnv: 'TOKEN_SLOT'});

        expect(hint).toContain('TOKEN_SLOT or NEO_MCP_HEALTHCHECK_TOKEN_FILE');
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

        // MC alone opts into treating `degraded` as alive: its non-WAL dependencies are best-effort
        // by design, so a provider-dependent canary must not mark the container unhealthy and gate
        // every service waiting on it. KB above carries no opt-in — it measured healthy throughout
        // the incident window and does not degrade on a cold embedding provider.
        expect(compose.services['mc-server'].healthcheck.test).toEqual([
            'CMD',
            'node',
            './ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url',
            'http://127.0.0.1:3001',
            '--client-name',
            'neo-mc-container-healthcheck',
            '--expected-status',
            'healthy,degraded'
        ]);

        // The gate itself is deliberately UNCHANGED. `service_healthy` still guards startup; what
        // changed is which server states count as healthy. Relaxing this to `service_started` would
        // have let a genuinely broken Memory Core through, which is a worse defect than the one fixed.
        expect(compose.services.orchestrator.depends_on['kb-server']).toEqual({condition: 'service_healthy'});
        expect(compose.services.orchestrator.depends_on['mc-server']).toEqual({condition: 'service_healthy'});
    });

    test('production compose inherits cloud/container defaults and does NOT pin local lanes or mailbox policy', () => {
        const compose         = readProductionCompose();
        const orchestratorEnv = environmentMap(compose.services.orchestrator);
        const memoryCoreEnv   = environmentMap(compose.services['mc-server']);

        // `authorityProfile` is deliberately NOT in this list: it no longer has a default to
        // duplicate. A role is declared, never inherited, so the canonical orchestrator states it
        // and the assertion below is the positive half of the same contract.
        expect(orchestratorEnv.NEO_AI_ORCHESTRATOR_AUTHORITY_PROFILE).toBe('container-plane');

        for (const key of [
            'NEO_AI_DEPLOYMENT_MODE',
            'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_KB_SYNC_ENABLED',
            'NEO_ORCHESTRATOR_CHROMA_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED',
            'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED',
            'NEO_ORCHESTRATOR_MLX_ENABLED',
            'NEO_ORCHESTRATOR_LMS_ENABLED',
            'NEO_ORCHESTRATOR_OLLAMA_ENABLED'
        ]) {
            expect(orchestratorEnv[key], `${key} duplicates an AiConfig default`).toBeUndefined();
        }

        // The cloud/container and local-model boundaries now belong to AiConfig. Compose must
        // also NOT pin the mailbox policy: doing so
        // overrode the library default of `open` and left members of a single-organisation deployment
        // unable to message each other without a grant per pair. A deployment is a trust boundary, so
        // peer-trust is the default and `blocked` belongs to a multi-tenant install that sets it
        // together with `NEO_MEMORY_SHARING_DEFAULT_POLICY=private`.
        expect(memoryCoreEnv.NEO_MAILBOX_DEFAULT_REPLY_POLICY).toBeUndefined();
    });

    test('production compose persists the sandman handoff across its writer and reader', () => {
        const compose         = readProductionCompose();
        const handoffMount    = 'shared-handoff-data:/app/.neo-ai-data/handoff';
        const readerMount     = handoffMount + ':ro';
        const handoffPath     = '/app/.neo-ai-data/handoff/sandman_handoff.md';
        const knowledgeBase   = compose.services['kb-server'];
        const memoryCore      = compose.services['mc-server'];
        const orchestrator    = compose.services.orchestrator;
        const memoryCoreEnv   = environmentMap(memoryCore);
        const orchestratorEnv = environmentMap(orchestrator);

        expect(orchestratorEnv.NEO_HANDOFF_FILE_PATH).toBe(handoffPath);
        expect(memoryCoreEnv.NEO_HANDOFF_FILE_PATH).toBe(handoffPath);
        expect(orchestrator.volumes).toContain(handoffMount);
        expect(memoryCore.volumes).toContain(readerMount);
        expect(knowledgeBase.volumes).not.toContain(handoffMount);
        expect(knowledgeBase.volumes).not.toContain(readerMount);
        expect(compose.volumes).toHaveProperty('shared-handoff-data');
    });

    test('production compose keeps local-model as an opt-in provider profile', () => {
        const compose          = readProductionCompose();
        const localModel       = compose.services['local-model'];
        const knowledgeBaseEnv = environmentMap(compose.services['kb-server']);
        const memoryCoreEnv    = environmentMap(compose.services['mc-server']);
        const orchestratorEnv  = environmentMap(compose.services.orchestrator);

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

        expect(orchestratorEnv.NEO_ORCHESTRATOR_MLX_ENABLED).toBeUndefined();
    });

    test('local Agent OS overlay inherits the Docker-owned plane and exposes only routed loopback MCP', () => {
        const source = fs.readFileSync(
            new URL('../../../../../../ai/deploy/docker-compose.local-agent-os.yml', import.meta.url),
            'utf8'
        );

        expect(source).not.toContain('source: ../../.neo-ai-data');
        expect(source).not.toContain('source: ../../.neo-ai-data/chroma/unified');
        expect(source).not.toContain('NEO_LOCAL_AGENT_OS_DATA_ROOT');
        expect(source).not.toMatch(/target:\s*\/app\/\.neo-ai-data(?:\/|$)/m);
        expect(source).toMatch(/^name:\s*&local-project\s/m);
        expect(source).toContain('NEO_ORCHESTRATOR_RUNTIME_ACCESS_COMPOSE_PROJECT: *local-project');
        expect(source).not.toContain('NEO_AI_ORCHESTRATOR_DIR');
        expect(source).not.toContain('NEO_AUTH_AUTO_PROVISION_IDENTITY_SOURCES');
        expect(source).toContain('NEO_AUTH_PIN_FIRST_PROVIDER_SUBJECT: "false"');
        expect(source).not.toContain('NEO_AUTH_PROVIDER_BOOTSTRAP_PAT');
        expect(source).toContain('file: ../../.neo-ai-secrets/mcp-auth-token');
        expect(source).not.toContain('environment: GH_TOKEN');
        expect(source).toContain('"127.0.0.1:3102:8080"');
        expect(source).not.toContain('docker-compose.dev.yml');
        expect(source).not.toContain('legacy-mixed');
        expect(source).not.toContain('safe-stop');
    });
});

/**
 * Served identity, not connectivity.
 *
 * A port probe proves a socket accepted a connection. It cannot prove WHICH process accepted it,
 * and that gap is not theoretical here: the parity profile's provisional 8100 slot collided with
 * a host ssh listener, so a connectivity check reported a healthy stack while nothing of ours ran
 * there. Ports belong to the host; identity belongs to the process.
 *
 * The load-bearing assertion below is the ABSENT-plane case. A responder that speaks MCP and
 * returns `status: healthy` but reports no plane is exactly the wrong-process case — accepting it
 * would reinstate the connectivity check under a new name.
 */
test.describe('served-plane verification — a healthy status is not an identity', () => {
    let assertServedPlane;
    let runHealthcheck;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/diagnostics/mcpHealthcheck.mjs');

        assertServedPlane = mod.assertServedPlane;
        runHealthcheck    = mod.runHealthcheck;
    });

    test('no expectation configured is a no-op, so existing callers keep their contract', () => {
        expect(assertServedPlane({status: 'healthy'})).toBeNull();
        expect(assertServedPlane({status: 'healthy'}, {})).toBeNull();
    });

    test('an ABSENT plane block fails closed — the wrong-process case', () => {
        // `healthy` and no identity is precisely what a foreign responder looks like.
        expect(() => assertServedPlane({status: 'healthy'}, {expectedPlaneId: 'neo-local-parity'}))
            .toThrow('never identified itself');

        expect(() => assertServedPlane({status: 'healthy', plane: null}, {expectedPlaneId: 'neo-local-parity'}))
            .toThrow('never identified itself');
    });

    test('a mismatched identity names the plane that actually answered', () => {
        expect(() => assertServedPlane(
            {status: 'healthy', plane: {id: 'neo-local-canonical', dataRoot: '/app/.neo-ai-data'}},
            {expectedPlaneId: 'neo-local-parity'}
        )).toThrow(/'neo-local-canonical', expected 'neo-local-parity'/);
    });

    test('matching identity with a DIFFERENT dataRoot still fails — identity without isolation', () => {
        // The failure the F-invariant exists for: same declared identity, different storage.
        expect(() => assertServedPlane(
            {status: 'healthy', plane: {id: 'neo-local-parity', dataRoot: '/app/.neo-ai-data'}},
            {expectedPlaneId: 'neo-local-parity', expectedPlaneDataRoot: '/app/.neo-ai-data-parity'}
        )).toThrow(/identity without isolation/);
    });

    test('a fully matching plane returns the observed pair', () => {
        expect(assertServedPlane(
            {status: 'healthy', plane: {id: 'neo-local-parity', dataRoot: '/app/.neo-ai-data-parity'}},
            {expectedPlaneId: 'neo-local-parity', expectedPlaneDataRoot: '/app/.neo-ai-data-parity'}
        )).toEqual({id: 'neo-local-parity', dataRoot: '/app/.neo-ai-data-parity'});
    });

    test('runHealthcheck rejects a HEALTHY responder serving another plane, and reports the plane when it matches', async () => {
        class FakeTransport {
            constructor(url, options) {
                this.url     = url;
                this.options = options;
            }
        }

        const clientFor = payload => class {
            async connect() {}
            async callTool() { return {structuredContent: payload} }
            async close() {}
        };

        const matching = {status: 'healthy', plane: {id: 'neo-local-parity', dataRoot: '/app/.neo-ai-data-parity'}};
        const foreign  = {status: 'healthy', plane: {id: 'neo-local-canonical', dataRoot: '/app/.neo-ai-data'}};

        // Status alone would pass this. Identity is what refuses it.
        await expect(runHealthcheck({
            url            : 'http://127.0.0.1:8100',
            expectedPlaneId: 'neo-local-parity',
            ClientClass    : clientFor(foreign),
            TransportClass : FakeTransport
        })).rejects.toThrow('a different plane is answering');

        expect(await runHealthcheck({
            url                  : 'http://127.0.0.1:8100',
            expectedPlaneId      : 'neo-local-parity',
            expectedPlaneDataRoot: '/app/.neo-ai-data-parity',
            ClientClass          : clientFor(matching),
            TransportClass       : FakeTransport
        })).toEqual({
            status: 'healthy',
            url   : 'http://127.0.0.1:8100/',
            plane : {id: 'neo-local-parity', dataRoot: '/app/.neo-ai-data-parity'}
        });
    });
});

/**
 * @summary `degraded` is alive, and one provider must not remove the plane's ingress.
 *
 * Memory Core treats its non-WAL dependencies as best-effort by design: a provider-dependent canary
 * must never veto MCP startup, or the mandatory end-of-turn save disappears exactly when a degraded
 * deployment most needs lossless WAL capture. The container probe disagreed — it accepted only
 * `healthy` — so a server that was serving correctly with one provider unreachable was marked
 * unhealthy, and `ingress` + `orchestrator` both gate on `service_healthy`.
 *
 * Measured during a real cold boot: `mc-server` unhealthy with a failing streak of 56 while its WAL
 * was caught-up and it answered over the ingress, `kb-server` perfectly healthy — and the documented
 * `up -d --wait` start command could not bring the plane up, taking the Knowledge Base down with it.
 *
 * These specs pin the agreement between the two layers, and the bound that keeps it from becoming a
 * relaxation: `unhealthy` stays the failing verdict.
 */
test.describe('mcpHealthcheck — a liveness expectation is a SET', () => {
    let parseExpectedStatuses, runHealthcheck;

    const readProductionCompose = () => yaml.load(fs.readFileSync(
        new URL('../../../../../../ai/deploy/docker-compose.yml', import.meta.url),
        'utf8'
    ));

    /** Minimal transport + client pair returning one status. */
    class FakeTransport {}

    const clientReturning = status => class {
        async connect() {}
        async callTool() { return {structuredContent: {status}} }
        async close() {}
    };

    const probe = (status, expectedStatus) => runHealthcheck({
        url           : 'http://127.0.0.1:3001',
        ...(expectedStatus ? {expectedStatus} : {}),
        ClientClass   : clientReturning(status),
        TransportClass: FakeTransport
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/scripts/diagnostics/mcpHealthcheck.mjs');

        parseExpectedStatuses = mod.parseExpectedStatuses;
        runHealthcheck        = mod.runHealthcheck;
    });

    test('a single value stays a single value — the existing default is untouched', () => {
        expect(parseExpectedStatuses('healthy')).toEqual(['healthy']);
    });

    test('a comma-separated list becomes the accepted set, trimmed and de-duplicated', () => {
        expect(parseExpectedStatuses('healthy,degraded')).toEqual(['healthy', 'degraded']);
        expect(parseExpectedStatuses(' healthy , degraded ')).toEqual(['healthy', 'degraded']);
        expect(parseExpectedStatuses('healthy,healthy')).toEqual(['healthy']);
    });

    test('an EMPTY expectation throws — a healthcheck that cannot fail is not a healthcheck', () => {
        // The realistic arrival is a misconfigured argument, and the dangerous resolution is
        // "accept anything". Fail at parse rather than silently widening the gate.
        for (const value of ['', '   ', ',', ' , ', null, undefined]) {
            expect(() => parseExpectedStatuses(value), JSON.stringify(value)).toThrow(/not a healthcheck/);
        }
    });

    test('THE FIX: with the set, a degraded-but-serving Memory Core PASSES', async () => {
        await expect(probe('degraded', 'healthy,degraded')).resolves.toMatchObject({status: 'degraded'});
    });

    test('…and healthy still passes — the set widens, it does not swap', async () => {
        // Load-bearing: a single-literal expectation of `degraded` would have made the WELL state
        // fail. That impossibility is why the option had to become a set rather than a new default.
        await expect(probe('healthy', 'healthy,degraded')).resolves.toMatchObject({status: 'healthy'});
    });

    test('THE BOUND: `unhealthy` still fails, so the signal is not flattened', async () => {
        await expect(probe('unhealthy', 'healthy,degraded'))
            .rejects.toThrow(/Expected healthcheck status 'healthy' or 'degraded', got 'unhealthy'/);
    });

    test('REGRESSION GUARD: the DEFAULT expectation still rejects degraded', async () => {
        // Callers that pass nothing keep the old contract exactly. Only the deployment that opted in
        // treats degraded as alive; nothing else silently loosened.
        await expect(probe('degraded')).rejects.toThrow(/Expected healthcheck status 'healthy', got 'degraded'/);
    });

    test('the production compose actually OPTS IN — the two layers agree in the shipped file', () => {
        // Without this the unit fix passes while the deployment keeps the old behaviour: the defect
        // lived in the gap between a correct instrument and the argument it was never given.
        const test_ = readProductionCompose().services['mc-server'].healthcheck.test;

        expect(test_.join(' ')).toContain('--expected-status healthy,degraded');
    });

    test('the change is SCOPED: kb-server is untouched', () => {
        // kb-server measured `healthy` throughout the incident window — it does not degrade on a cold
        // embedding provider, so it needs no opt-in. Pinned so a future blanket edit is visible
        // rather than inherited.
        const test_ = readProductionCompose().services['kb-server'].healthcheck.test;

        expect(test_.join(' ')).not.toContain('--expected-status');
    });
});
