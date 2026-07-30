import {expect, test}  from '@playwright/test';
import {spawn}         from 'node:child_process';
import {once}          from 'node:events';
import {createServer}  from 'node:http';
import {fileURLToPath} from 'node:url';
import {
    bridgeTransports,
    createProgram,
    parseArgs,
    startBridge
} from '../../../../../../ai/mcp/client/stdioToStreamableHttp.mjs';

const BRIDGE_ENTRYPOINT = fileURLToPath(
    new URL('../../../../../../ai/mcp/client/stdioToStreamableHttp.mjs', import.meta.url)
);

class FakeTransport {
    closed = 0
    messages = []
    protocolVersion = null
    started = 0
    terminated = 0

    async close() {
        this.closed++;
        this.onclose?.()
    }

    async send(message) {
        this.messages.push(message)
    }

    setProtocolVersion(value) {
        this.protocolVersion = value
    }

    async start() {
        this.started++
    }

    async terminateSession() {
        this.terminated++
    }
}

test.describe('stdioToStreamableHttp', () => {
    test('parses only an HTTP endpoint plus an environment-slot name', () => {
        const result = parseArgs([
            '--url',
            'https://mcp.example.test/mc/mcp',
            '--token-env',
            'NEO_MCP_REMOTE_TOKEN'
        ]);

        expect(result.endpoint.href).toBe('https://mcp.example.test/mc/mcp');
        expect(result.tokenEnv).toBe('NEO_MCP_REMOTE_TOKEN')
    });

    test('rejects unknown options, missing values, invalid protocols, and invalid env names', () => {
        expect(() => parseArgs([
            '--url',
            'https://mcp.example.test/mc/mcp',
            '--token-env',
            'NEO_MCP_REMOTE_TOKEN',
            '--token',
            'secret'
        ])).toThrow(/unknown option/i);
        expect(() => parseArgs([
            '--url',
            'https://mcp.example.test/mc/mcp',
            '--token-env'
        ])).toThrow(/argument missing/i);
        expect(() => parseArgs([
            '--url',
            'file:///tmp/mcp',
            '--token-env',
            'NEO_MCP_REMOTE_TOKEN'
        ])).toThrow(/endpoint protocol/);
        expect(() => parseArgs([
            '--url',
            'https://mcp.example.test/mc/mcp',
            '--token-env',
            'not valid'
        ])).toThrow(/environment variable name/)
    });

    test('exposes deterministic help without starting a bridge', () => {
        const
            output  = [],
            program = createProgram()
                .configureOutput({writeOut: value => output.push(value)})
                .exitOverride();
        let error;

        try {
            program.parse(['--help'], {from: 'user'})
        } catch (caught) {
            error = caught
        }

        expect(error?.code).toBe('commander.helpDisplayed');
        expect(output.join('')).toContain('--token-env <name>')
    });

    test('forwards both directions, binds the negotiated protocol, and closes once', async () => {
        const
            errors = [],
            local  = new FakeTransport(),
            remote = new FakeTransport(),
            bridge = await bridgeTransports({
                localTransport : local,
                remoteTransport: remote,
                onError        : error => errors.push(error)
            }),
            initialize = {
                jsonrpc: '2.0',
                id     : 7,
                method : 'initialize',
                params : {}
            },
            response = {
                jsonrpc: '2.0',
                id     : 7,
                result : {protocolVersion: '2025-11-25'}
            },
            reusedId = {
                jsonrpc: '2.0',
                id     : 7,
                result : {protocolVersion: 'poisoned-reused-id'}
            };

        local.onmessage(initialize);
        remote.onmessage(response);
        remote.onmessage(reusedId);
        await Promise.resolve();

        expect(remote.started).toBe(1);
        expect(local.started).toBe(1);
        expect(remote.messages).toEqual([initialize]);
        expect(local.messages).toEqual([response, reusedId]);
        expect(remote.protocolVersion).toBe('2025-11-25');
        expect(errors).toEqual([]);

        await bridge.close();
        await bridge.close();

        expect(remote.terminated).toBe(1);
        expect(local.closed).toBe(1);
        expect(remote.closed).toBe(1)
    });

    test('an initialize error consumes the marker before a reused response id', async () => {
        const
            local  = new FakeTransport(),
            remote = new FakeTransport();

        await bridgeTransports({
            localTransport : local,
            remoteTransport: remote
        });

        local.onmessage({
            jsonrpc: '2.0',
            id     : 'initialize-1',
            method : 'initialize',
            params : {}
        });
        remote.onmessage({
            jsonrpc: '2.0',
            id     : 'initialize-1',
            error  : {code: -32603, message: 'initialization failed'}
        });
        remote.onmessage({
            jsonrpc: '2.0',
            id     : 'initialize-1',
            result : {protocolVersion: 'poisoned-reused-id'}
        });
        await Promise.resolve();

        expect(remote.protocolVersion).toBeNull()
    });

    test('a graceful close absorbs a termination failure and still closes both transports once', async () => {
        const
            errors = [],
            local  = new FakeTransport(),
            remote = new FakeTransport();

        remote.terminateSession = async () => {
            remote.terminated++;
            remote.onerror(new Error('remote response containing a secret'));
            throw new Error('remote response containing a secret')
        };

        const bridge = await bridgeTransports({
            localTransport : local,
            remoteTransport: remote,
            onError        : error => errors.push(error)
        });

        await bridge.close();

        expect(remote.terminated).toBe(1);
        expect(local.closed).toBe(1);
        expect(remote.closed).toBe(1);
        expect(errors).toEqual([])
    });

    test('closes both sides when partial startup fails', async () => {
        const
            local  = new FakeTransport(),
            remote = new FakeTransport();

        local.start = async () => {
            local.started++;
            throw new Error('stdio unavailable')
        };

        await expect(bridgeTransports({
            localTransport : local,
            remoteTransport: remote
        })).rejects.toThrow(/stdio unavailable/);

        expect(remote.started).toBe(1);
        expect(local.started).toBe(1);
        expect(local.closed).toBe(1);
        expect(remote.closed).toBe(1)
    });

    test('rejects an absent bearer before either transport starts', async () => {
        const
            local  = new FakeTransport(),
            remote = new FakeTransport();

        await expect(startBridge({
            endpoint       : new URL('https://mcp.example.test/mc/mcp'),
            token          : '',
            localTransport : local,
            remoteTransport: remote
        })).rejects.toThrow(/missing or empty/);

        expect(local.started).toBe(0);
        expect(remote.started).toBe(0)
    })

    test('a reflected bearer response produces one sanitized error and exits nonzero', async () => {
        const
            token  = 'reflected-bearer-must-not-leak',
            server = createServer((request, response) => {
                response.statusCode = 500;
                response.end(`remote body echoed ${request.headers.authorization}`)
            });

        await new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', resolve);
            server.once('error', reject)
        });

        const
            endpoint = `http://127.0.0.1:${server.address().port}/mcp`,
            child    = spawn(process.execPath, [
                BRIDGE_ENTRYPOINT,
                '--url',
                endpoint,
                '--token-env',
                'NEO_REFLECTED_BEARER'
            ], {
                env  : {...process.env, NEO_REFLECTED_BEARER: token},
                stdio: ['pipe', 'pipe', 'pipe']
            });
        let stderr = '';

        child.stderr.on('data', chunk => {
            stderr += chunk
        });
        child.stdin.on('error', () => {});
        child.stdin.write(`${JSON.stringify({
            jsonrpc: '2.0',
            id     : 1,
            method : 'initialize',
            params : {
                capabilities : {},
                clientInfo   : {name: 'negative-fixture', version: '1.0.0'},
                protocolVersion: '2025-11-25'
            }
        })}\n`);

        try {
            const [code] = await once(child, 'close');

            expect(code).toBe(1);
            expect(stderr).not.toContain(token);
            expect(stderr).not.toContain('remote body echoed');
            expect(stderr.match(/Neo MCP bridge transport failed\./g)).toHaveLength(1)
        } finally {
            await new Promise(resolve => server.close(resolve))
        }
    })
});
