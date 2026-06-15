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

import {SSEClientTransport}            from '@modelcontextprotocol/sdk/client/sse.js';
import {StdioClientTransport}          from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import Neo          from '../../../../../../src/Neo.mjs';
import * as core    from '../../../../../../src/core/_export.mjs';
import Client       from '../../../../../../ai/mcp/client/Client.mjs';
import ClientConfig from '../../../../../../ai/mcp/client/config.mjs';

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
        expect(client.createTransport()).toBeInstanceOf(StdioClientTransport);

        client.destroy();
    });

    test('#13300: memory-core client boot is not hard-gated on GEMINI_API_KEY', () => {
        const client = Neo.create(TransportConfigClient, {
            serverName: 'memory-core'
        });

        client.loadServerConfig('memory-core');

        expect(client.requiredEnv).toEqual([]);

        client.destroy();
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
