import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'McpClientTransportConfigTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import crypto         from 'crypto';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {spawnSync}    from 'node:child_process';

import {SSEClientTransport}            from '@modelcontextprotocol/sdk/client/sse.js';
import {StdioClientTransport}          from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import Neo                             from '../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../src/core/_export.mjs';
import {REMOTE_MCP_CREDENTIAL_ENV_VAR} from '../../../../../../ai/services/fleet/mcpServers.mjs';
import Client                          from '../../../../../../ai/mcp/client/Client.mjs';
import ClientConfig                    from '../../../../../../ai/mcp/client/config.mjs';

const addedServerNames = new Set();

class TransportConfigClient extends Client {
    static config = {
        className: 'Test.ai.mcp.client.TransportConfigClient'
    }

    async initAsync() {}
}

TransportConfigClient = Neo.setupClass(TransportConfigClient);

function addServerConfig(config) {
    const serverName = `transport-${crypto.randomUUID()}`;

    ClientConfig.data.mcpServers[serverName] = config;
    addedServerNames.add(serverName);

    return serverName;
}

test.describe('Neo.ai.mcp.client.Client transport config', () => {
    test.afterEach(() => {
        for (const serverName of addedServerNames) {
            delete ClientConfig.data.mcpServers[serverName];
        }
        addedServerNames.clear();
    });

    test('keeps stdio as the default transport for existing server configs', () => {
        const client = Neo.create(TransportConfigClient, {
            serverName: 'github-workflow'
        });

        client.loadServerConfig('github-workflow');

        expect(client.transportType).toBe('stdio');
        expect(client.command).toBe('npm');
        expect(client.args).toEqual(['run', 'ai:mcp-server-github-workflow']);
        expect(client.cwd).toBe(null);

        const transport = client.createTransport();

        expect(transport).toBeInstanceOf(StdioClientTransport);
        expect(transport._serverParams.cwd).toBeUndefined();

        client.destroy();
    });

    test('#13300: memory-core client boot is not hard-gated on GEMINI_API_KEY', () => {
        const client = Neo.create(TransportConfigClient, {
            serverName: 'memory-core'
        });

        client.loadServerConfig('memory-core');

        expect(client.requiredEnv).toEqual([REMOTE_MCP_CREDENTIAL_ENV_VAR]);
        expect(client.requiredEnv).not.toContain('GEMINI_API_KEY');
        expect(client.requiredEnv).not.toContain('GH_TOKEN');

        client.destroy();
    });

    test('#16672: built-in Memory Core and Knowledge Base clients cannot spawn host servers', () => {
        const expected = {
            'knowledge-base': 'http://127.0.0.1:3102/kb/mcp',
            'memory-core'   : 'http://127.0.0.1:3102/mc/mcp'
        };

        for (const [serverName, url] of Object.entries(expected)) {
            const client = Neo.create(TransportConfigClient, {serverName});

            client.loadServerConfig(serverName);

            expect(client.transportType).toBe('streamable-http');
            expect(client.url).toBe(url);
            expect(client.bearerTokenEnvVar).toBe(REMOTE_MCP_CREDENTIAL_ENV_VAR);
            expect(client.bearerTokenEnvVar).not.toBe('GH_TOKEN');
            expect(client.command).toBe(null);
            expect(client.cwd).toBe(null);
            expect(client.args).toBe(null);

            client.destroy();
        }
    });

    test('#16672: Neural Link remains an intentional host-local stdio client', () => {
        const client = Neo.create(TransportConfigClient, {
            serverName: 'neural-link'
        });

        client.loadServerConfig('neural-link');

        expect(client.transportType).toBe('stdio');
        expect(client.command).toBe('npm');
        expect(path.isAbsolute(client.cwd)).toBe(true);
        expect(client.args).toEqual([
            'run',
            'ai:mcp-server-neural-link',
            '--',
            '--cwd',
            client.cwd
        ]);
        expect(client.bearerTokenEnvVar).toBe(null);

        const transport = client.createTransport();

        expect(transport).toBeInstanceOf(StdioClientTransport);
        expect(transport._serverParams.cwd).toBe(client.cwd);

        client.destroy();
    });

    test('Neural Link derives both cwd inputs from the client module, never the invoking directory', () => {
        const
            foreignCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-mcp-client-cwd-')),
            neoUrl     = new URL('../../../../../../src/Neo.mjs', import.meta.url).href,
            coreUrl    = new URL('../../../../../../src/core/_export.mjs', import.meta.url).href,
            configUrl  = new URL('../../../../../../ai/mcp/client/config.mjs', import.meta.url).href,
            probe      = `
                await import(${JSON.stringify(neoUrl)});
                await import(${JSON.stringify(coreUrl)});
                const {default: config} = await import(${JSON.stringify(configUrl)});
                process.stdout.write(JSON.stringify(config.mcpServers['neural-link']));
            `;

        try {
            const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probe], {
                cwd     : foreignCwd,
                encoding: 'utf8'
            });

            expect(result.status, result.stderr).toBe(0);

            const neuralLink = JSON.parse(result.stdout);

            expect(neuralLink.cwd).toBe(ClientConfig.mcpServers['neural-link'].cwd);
            expect(neuralLink.cwd).not.toBe(foreignCwd);
            expect(neuralLink.args).toEqual([
                'run',
                'ai:mcp-server-neural-link',
                '--',
                '--cwd',
                neuralLink.cwd
            ]);
        } finally {
            fs.rmSync(foreignCwd, {recursive: true, force: true});
        }
    });

    test('creates streamable HTTP transports from remote endpoint config', () => {
        const serverName = addServerConfig({
            transportType   : 'streamable-http',
            url             : 'http://127.0.0.1:13090/mcp',
            transportOptions: {
                requestInit: {
                    headers: {
                        'X-PREFERRED-USERNAME': '@neo-gpt'
                    }
                }
            }
        });
        const client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(client.command).toBe(null);
        expect(client.args).toBe(null);
        expect(client.transportType).toBe('streamable-http');
        expect(client.createTransport()).toBeInstanceOf(StreamableHTTPClientTransport);

        client.destroy();
    });

    test('resolves remote Bearer auth without mutating shared client config', () => {
        const
            serverName = addServerConfig({
                transportType    : 'streamable-http',
                url              : 'http://127.0.0.1:13095/mcp',
                bearerTokenEnvVar: 'TEST_REMOTE_BEARER',
                transportOptions : {
                    requestInit: {
                        headers: {'X-Client': 'unit'}
                    }
                }
            }),
            before = JSON.stringify(ClientConfig.mcpServers),
            client = Neo.create(TransportConfigClient, {
                env: {TEST_REMOTE_BEARER: 'transient-secret'},
                serverName
            });

        client.loadServerConfig(serverName);

        const options = client.createRemoteTransportOptions();

        expect(options.requestInit.headers.get('Authorization')).toBe('Bearer transient-secret');
        expect(options.requestInit.headers.get('X-Client')).toBe('unit');
        expect(ClientConfig.mcpServers[serverName].transportOptions.requestInit.headers).toEqual({
            'X-Client': 'unit'
        });
        expect(JSON.stringify(ClientConfig.mcpServers)).toBe(before);
        expect(JSON.stringify(ClientConfig.mcpServers)).not.toContain('transient-secret');
        expect(client.createTransport()).toBeInstanceOf(StreamableHTTPClientTransport);

        client.destroy();
    });

    test('falls back to the process environment for remote Bearer auth', () => {
        const bearerTokenEnvVar = `TEST_REMOTE_PROCESS_BEARER_${crypto.randomUUID().replaceAll('-', '_')}`;
        let client;

        process.env[bearerTokenEnvVar] = 'process-secret';

        try {
            const serverName = addServerConfig({
                transportType: 'streamable-http',
                url          : 'http://127.0.0.1:13098/mcp',
                bearerTokenEnvVar
            });

            client = Neo.create(TransportConfigClient, {serverName});
            client.loadServerConfig(serverName);

            const options = client.createRemoteTransportOptions();

            expect(options.requestInit.headers.get('Authorization')).toBe('Bearer process-secret');
        } finally {
            client?.destroy();
            delete process.env[bearerTokenEnvVar];
        }
    });

    test('fails before connection when a configured remote Bearer slot is empty', () => {
        const
            serverName = addServerConfig({
                transportType    : 'streamable-http',
                url              : 'http://127.0.0.1:13096/mcp',
                bearerTokenEnvVar: 'TEST_DELIBERATELY_MISSING_BEARER'
            }),
            client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(() => client.createTransport()).toThrow(/TEST_DELIBERATELY_MISSING_BEARER.*missing or empty/);

        client.destroy();
    });

    test('rejects two competing remote Authorization authorities', () => {
        const
            serverName = addServerConfig({
                transportType    : 'streamable-http',
                url              : 'http://127.0.0.1:13097/mcp',
                bearerTokenEnvVar: 'TEST_DELIBERATELY_MISSING_BEARER',
                transportOptions : {
                    requestInit: {
                        headers: {Authorization: 'Bearer literal'}
                    }
                }
            }),
            client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(() => client.createTransport()).toThrow(/cannot declare both bearerTokenEnvVar and an Authorization header/);

        client.destroy();
    });

    test('uses an entrypoint-injected connection without mutating the shared config Provider', () => {
        const
            before           = JSON.stringify(ClientConfig.mcpServers),
            connectionConfig = {
                transportType   : 'streamable-http',
                url             : 'http://127.0.0.1:13094/mcp',
                transportOptions: {requestInit: {headers: {Authorization: 'Bearer transient'}}}
            },
            client = Neo.create(TransportConfigClient, {
                connectionConfig,
                serverName: 'transient-community-source'
            });

        client.loadServerConfig('transient-community-source');

        expect(client.transportType).toBe('streamable-http');
        expect(client.transportOptions).toEqual(connectionConfig.transportOptions);
        expect(client.createTransport()).toBeInstanceOf(StreamableHTTPClientTransport);
        expect(JSON.stringify(ClientConfig.mcpServers)).toBe(before);

        client.destroy();
    });

    test('creates deprecated SSE transports for legacy remote servers', () => {
        const serverName = addServerConfig({
            transportType: 'sse',
            url          : 'http://127.0.0.1:13091/sse'
        });
        const client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(client.transportType).toBe('sse');
        expect(client.createTransport()).toBeInstanceOf(SSEClientTransport);

        client.destroy();
    });

    test('accepts streamable HTTP transport aliases from config files', () => {
        const serverName = addServerConfig({
            transport: 'http',
            url      : 'http://127.0.0.1:13092/mcp'
        });
        const client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(client.normalizeTransportType(client.transportType)).toBe('streamable-http');
        expect(client.createTransport()).toBeInstanceOf(StreamableHTTPClientTransport);

        client.destroy();
    });

    test('fails fast when a remote transport has no endpoint URL', () => {
        const serverName = addServerConfig({
            transportType: 'streamable-http'
        });
        const client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(() => client.createTransport()).toThrow(/requires a remote url/);

        client.destroy();
    });

    test('fails fast when the configured transport type is unsupported', () => {
        const serverName = addServerConfig({
            transportType: 'websocket',
            url          : 'http://127.0.0.1:13093/mcp'
        });
        const client = Neo.create(TransportConfigClient, {serverName});

        client.loadServerConfig(serverName);

        expect(() => client.createTransport()).toThrow(/Unsupported transport type 'websocket'/);

        client.destroy();
    });
});
