import { setup } from '../../../../setup.mjs';

const appName = 'BaseServerTest';

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

import {test, expect}                                              from '@playwright/test';
import {CallToolRequestSchema, ListToolsRequestSchema}             from '@modelcontextprotocol/sdk/types.js';
import fs                                                          from 'node:fs';
import os                                                          from 'node:os';
import path                                                        from 'node:path';
import Neo                                                         from '../../../../../../src/Neo.mjs';
import * as core                                                   from '../../../../../../src/core/_export.mjs';
import ConfigProvider, {createConfigProxy}                         from '../../../../../../ai/ConfigProvider.mjs';
import Tier1ConfigBase, {PLANE_MEMBER_PATHS as TIER1_MEMBER_PATHS} from '../../../../../../ai/configBase.mjs';
import {derivePlaneMemberPaths}                                    from '../../../../../../ai/planeConfig.mjs';
import BaseServer                                                  from '../../../../../../ai/mcp/server/BaseServer.mjs';
// The committed template, never `ai/config.mjs` — tests resolve committed config templates and never a
// repo-local ignored overlay. ticket-ref-ok: ADR-0019 B1/C3 is the authority lint-config-template-ssot
// enforces this import against, so a reader reverting it needs the citation, not just the rule.
// Imported after the core export so it resolves against a fully initialised `Neo`.
import AiConfig                                                    from '../../../../../../ai/config.template.mjs';

/**
 * @summary Mock McpServer that captures registered request handlers via the schema object
 * (CallToolRequestSchema / ListToolsRequestSchema) as the lookup key. Lets tests invoke the
 * registered closures directly without spinning up a real `@modelcontextprotocol/sdk` server.
 */
function makeMockMcpServer() {
    const handlers = new Map();
    return {
        server: {
            setRequestHandler(schema, handler) {
                handlers.set(schema, handler);
            }
        },
        getListToolsHandler() { return handlers.get(ListToolsRequestSchema); },
        getCallToolHandler()  { return handlers.get(CallToolRequestSchema);  },
        handlerCount()        { return handlers.size; }
    };
}

/**
 * @summary Builds a TestServer subclass with overridable hooks for each test. Default impls
 * satisfy the required-override hooks (`getServerMetadata`, `getToolService`); other hooks
 * remain at BaseServer defaults. Each call generates a unique className so Neo's class
 * registry doesn't reject duplicate registrations across tests.
 */
let _testClassCounter = 0;
function makeTestServerClass(overrides = {}) {
    const id = ++_testClassCounter;
    class TestServer extends BaseServer {
        static config = {
            className: `Neo.test.mcp.server.TestServer${id}`
        }

        getServerMetadata() {
            return overrides.getServerMetadata?.() || {
                name        : 'neo-test',
                version     : '1.0.0',
                capabilities: {tools: {listChanged: false}}
            };
        }

        getToolService() {
            return overrides.getToolService?.() || {
                listTools: ({cursor, limit} = {}) => ({
                    tools: [{
                        name        : 'sample',
                        title       : 'Sample Tool',
                        description : 'A test tool',
                        inputSchema : {type: 'object'},
                        outputSchema: {type: 'object'},
                        annotations : {readOnly: true}
                    }],
                    nextCursor: null
                }),
                callTool: async (name, args) => ({result: 'ok', name, args})
            };
        }

        getHealthService()         { return overrides.getHealthService?.() ?? null; }
        getHealthExemptTools()     { return overrides.getHealthExemptTools?.() ?? ['healthcheck']; }
        getDependentServices()     { return overrides.getDependentServices?.() ?? []; }
        buildToolProjectionContext(ctx) { return overrides.buildToolProjectionContext?.(ctx) ?? null; }
        async wrapDispatch(d)      { return overrides.wrapDispatch?.(d) ?? d(); }
        async beforeToolDispatch(ctx) { return overrides.beforeToolDispatch?.(ctx); }
        async onHealthGateFailure(ctx) { return overrides.onHealthGateFailure?.(ctx); }
    }
    return Neo.setupClass(TestServer);
}

test.describe('Neo.ai.mcp.server.BaseServer — required override hooks (#10965)', () => {
    test('getServerMetadata throws when not overridden', () => {
        const id = ++_testClassCounter;
        class BareServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.BareServer${id}`}
            // Override initAsync to no-op so Neo.create's auto-init lifecycle doesn't reach
            // the throwing method before the test can isolate the call.
            async initAsync() { /* isolated unit test — skip lifecycle */ }
        }
        const Cls    = Neo.setupClass(BareServer);
        const server = Neo.create(Cls);

        expect(() => server.getServerMetadata()).toThrow(/getServerMetadata/);

        // The message must name its ORIGIN class, not the shared `constructor.name` — every MCP
        // server class is literally named `Server`, so the latter cannot discriminate.
        //
        // ONE anchored positive, deliberately. The plane-identity test asserts both directions
        // because there the symptom (`[Server]`) can co-occur with the fix. Here it cannot: this
        // regex is `^`-anchored, so a `not.toThrow(/^BareServer: /)` companion could only fire in
        // the same states this line already fails in. A second assertion that cannot fail
        // independently reads as coverage without being any.
        expect(() => server.getServerMetadata()).toThrow(new RegExp(`^${Cls.config.className}: `));
    });

    test('getToolService throws when not overridden', () => {
        const id = ++_testClassCounter;
        class BareServer2 extends BaseServer {
            static config = {className: `Neo.test.mcp.server.BareServer2_${id}`}
            getServerMetadata() { return {name: 'x'}; }
            async initAsync() { /* isolated unit test — skip lifecycle */ }
        }
        const Cls    = Neo.setupClass(BareServer2);
        const server = Neo.create(Cls);

        expect(() => server.getToolService()).toThrow(/getToolService/);

        expect(() => server.getToolService()).toThrow(new RegExp(`^${Cls.config.className}: `));
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — optional hook defaults', () => {
    test('getDependentServices defaults to empty array', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        expect(server.getDependentServices()).toEqual([]);
    });

    test('getHealthExemptTools defaults to [healthcheck]', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        expect(server.getHealthExemptTools()).toEqual(['healthcheck']);
    });

    test('getHealthService defaults to null', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        expect(server.getHealthService()).toBeNull();
    });

    test('wrapDispatch default invokes dispatch directly', async () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = await server.wrapDispatch(() => 42);
        expect(result).toBe(42);
    });

    test('buildRequestContext default returns empty object', async () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        await expect(server.buildRequestContext()).resolves.toEqual({});
    });

    test('buildToolProjectionContext default preserves full tool surface', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        expect(server.buildToolProjectionContext({request: {}, phase: 'listTools'})).toBeNull();
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — exhaustive server transport selection (#15188)', () => {
    function createTransportServer(transport) {
        const id = ++_testClassCounter;

        class TransportServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.TransportServer${id}`}

            aiConfig = {transport}
            logger   = {info() {}}

            async initAsync() {}
            getServerMetadata() { return {name: 'neo-transport-test'}; }
            getToolService()    { return {listTools: () => ({tools: []}), callTool: async () => null}; }
        }

        return Neo.create(Neo.setupClass(TransportServer));
    }

    test('stdio starts StdioServerTransport', async () => {
        const server = createTransportServer('stdio');
        let connectedTransport;

        server.mcpServer = {
            connect: async transport => connectedTransport = transport
        };

        try {
            await server.connectTransport();

            expect(connectedTransport?.constructor?.name).toBe('StdioServerTransport');
            expect(server.transport).toBe(connectedTransport);
        } finally {
            server.destroy();
        }
    });

    test('streamable-http delegates to the shared Streamable HTTP service', async () => {
        const server           = createTransportServer('streamable-http');
        const TransportService = (await import('../../../../../../ai/mcp/server/shared/services/TransportService.mjs')).default;
        const originalSetup    = TransportService.setup;
        let setupOptions;

        TransportService.setup = async options => setupOptions = options;

        try {
            await server.connectTransport();

            expect(setupOptions).toMatchObject({
                server,
                aiConfig    : server.aiConfig,
                logger      : server.logger,
                resourceName: 'neo-transport-test MCP'
            });
            expect(server.transport).toBeNull();
        } finally {
            TransportService.setup = originalSetup;
            server.destroy();
        }
    });

    test('old sse server value fails with the canonical migration', async () => {
        const server    = createTransportServer('sse');
        let   connected = false;

        server.mcpServer = {connect: async () => connected = true};

        try {
            await expect(server.connectTransport()).rejects.toThrow(
                /Server transport "sse" was renamed to "streamable-http"/
            );
            expect(connected).toBe(false);
            expect(server.transport).toBeNull();
        } finally {
            server.destroy();
        }
    });

    test('arbitrary unknown server value fails before transport startup', async () => {
        const server    = createTransportServer('websocket');
        let   connected = false;

        server.mcpServer = {connect: async () => connected = true};

        try {
            await expect(server.connectTransport()).rejects.toThrow(
                /Unsupported server transport "websocket".*Expected "stdio" or "streamable-http"/
            );
            expect(connected).toBe(false);
            expect(server.transport).toBeNull();
        } finally {
            server.destroy();
        }
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — formatToolResult shapes', () => {
    test('object result without error → text + structuredContent', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatToolResult({foo: 'bar', count: 3});
        expect(result.isError).toBe(false);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('"foo": "bar"');
        expect(result.structuredContent).toEqual({foo: 'bar', count: 3});
    });

    test('object result with error key → tool-error envelope', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatToolResult({error: 'BadInput', message: 'Missing field'});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('Tool Error: BadInput');
        expect(result.content[0].text).toContain('Missing field');
        expect(result.structuredContent).toBeUndefined();
    });

    test('primitive (string) result → text-only with structuredContent={result}', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatToolResult('hello');
        expect(result.isError).toBe(false);
        expect(result.content[0].text).toBe('hello');
        expect(result.structuredContent).toEqual({result: 'hello'});
    });

    test('primitive (number) result → text-only with structuredContent={result}', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatToolResult(42);
        expect(result.content[0].text).toBe('42');
        expect(result.structuredContent).toEqual({result: 42});
    });

    test('formatHealthError shape', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatHealthError('toolX', new Error('DB down'));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Cannot execute toolX: DB down');
    });

    test('formatToolError shape', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        const result = server.formatToolError('toolY', new Error('Boom'));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Error executing toolY: Boom');
    });

    test('formatToolError maps policy refusals to structuredContent', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);
        const error  = new Error('POLICY_REFUSED: blocked');

        error.code     = 'POLICY_REFUSED';
        error.reason   = 'blocked by policy';
        error.policyId = 'test.policy';
        error.action   = 'write_file';
        error.tenet    = '#10293';
        error.details  = {targetPath: '/repo/AGENTS_TENETS.md'};

        const result = server.formatToolError('write_file', error);

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Policy Refused executing write_file: blocked by policy');
        expect(result.structuredContent).toEqual({
            error   : 'Policy Refused',
            code    : 'POLICY_REFUSED',
            reason  : 'blocked by policy',
            policyId: 'test.policy',
            action  : 'write_file',
            tenet   : '#10293',
            details : {targetPath: '/repo/AGENTS_TENETS.md'}
        });
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — setupRequestHandlers wiring', () => {
    test('registers both ListTools and CallTool handlers', () => {
        const Cls     = makeTestServerClass();
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        expect(mockMcp.handlerCount()).toBe(2);
        expect(typeof mockMcp.getListToolsHandler()).toBe('function');
        expect(typeof mockMcp.getCallToolHandler()).toBe('function');
    });

    test('null mcpServer → no-op (defensive)', () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        // Should not throw.
        expect(() => server.setupRequestHandlers(null)).not.toThrow();
    });

    test('ListTools handler returns mcpTools mapping from per-server toolService', async () => {
        const Cls     = makeTestServerClass();
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getListToolsHandler()({params: {}});
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0]).toMatchObject({
            name        : 'sample',
            title       : 'Sample Tool',
            description : 'A test tool',
            inputSchema : {type: 'object'},
            outputSchema: {type: 'object'},
            annotations : {readOnly: true}
        });
    });

    test('ListTools handler passes projection context into per-server toolService', async () => {
        const seen = [];
        const Cls  = makeTestServerClass({
            buildToolProjectionContext: ({request, phase}) => {
                expect(phase).toBe('listTools');
                expect(request.params._meta.neoToolProjection).toBe('harness-embedded');
                return {mode: 'harness-embedded'};
            },
            getToolService: () => ({
                listTools: ({toolProjection}) => {
                    seen.push(toolProjection);
                    return {
                        tools: [{
                            name       : 'sample',
                            title      : 'Sample Tool',
                            description: 'A test tool',
                            inputSchema: {type: 'object'}
                        }]
                    };
                },
                callTool: async () => null
            })
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        await mockMcp.getListToolsHandler()({
            params: {_meta: {neoToolProjection: 'harness-embedded'}}
        });

        expect(seen).toEqual([{mode: 'harness-embedded'}]);
    });

    test('CallTool handler dispatches via wrapDispatch + formatToolResult', async () => {
        const Cls     = makeTestServerClass();
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {x: 1}}
        });

        expect(result.isError).toBe(false);
        expect(result.structuredContent).toMatchObject({
            result: 'ok',
            name  : 'sample',
            args  : {x: 1}
        });
    });

    test('CallTool handler passes projection context into per-server toolService', async () => {
        let seen;
        const Cls = makeTestServerClass({
            buildToolProjectionContext: ({request, phase, toolName, args}) => {
                expect(phase).toBe('callTool');
                expect(toolName).toBe('sample');
                expect(args).toEqual({x: 7});
                expect(request.params._meta.neoToolProjection).toBe('harness-embedded');
                return {mode: 'harness-embedded'};
            },
            getToolService: () => ({
                listTools: () => ({tools: []}),
                callTool : async (name, args, options) => {
                    seen = options.toolProjection;
                    return {result: 'ok'};
                }
            })
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        await mockMcp.getCallToolHandler()({
            params: {
                name     : 'sample',
                arguments: {x: 7},
                _meta    : {neoToolProjection: 'harness-embedded'}
            }
        });

        expect(seen).toEqual({mode: 'harness-embedded'});
    });

    test('CallTool handler applies health-gate when healthService present and tool not exempt', async () => {
        let   healthCheckCalls = 0;
        const Cls              = makeTestServerClass({
            getHealthService: () => ({
                ensureHealthy: async () => { healthCheckCalls++; }
            })
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        expect(healthCheckCalls).toBe(1);
    });

    test('CallTool handler skips health-gate for exempt tools', async () => {
        let   healthCheckCalls = 0;
        const Cls              = makeTestServerClass({
            getHealthService    : () => ({ensureHealthy: async () => { healthCheckCalls++; }}),
            getHealthExemptTools: () => ['healthcheck', 'sample']
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        expect(healthCheckCalls).toBe(0);
    });

    test('CallTool handler returns formatHealthError envelope when health gate throws', async () => {
        const Cls = makeTestServerClass({
            getHealthService: () => ({
                ensureHealthy: async () => { throw new Error('Service down'); }
            })
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Cannot execute sample: Service down');
    });

    test('beforeToolDispatch hook fires BEFORE health gate with toolName + args', async () => {
        const order = [];
        const Cls   = makeTestServerClass({
            getHealthService  : () => ({ensureHealthy: async () => { order.push('healthGate'); }}),
            beforeToolDispatch: async ({toolName, args}) => { order.push(`beforeToolDispatch:${toolName}:${args.x}`); }
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {x: 99}}
        });

        // Hook fires BEFORE health gate, then dispatch
        expect(order).toEqual(['beforeToolDispatch:sample:99', 'healthGate']);
    });

    test('beforeToolDispatch throw routes to formatToolError envelope (not formatHealthError)', async () => {
        const Cls = makeTestServerClass({
            getHealthService  : () => ({ensureHealthy: async () => {}}),
            beforeToolDispatch: async () => { throw new Error('Identity spoof rejected'); }
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        expect(result.isError).toBe(true);
        // formatToolError shape: "Error executing X: Y" — NOT "Cannot execute X: Y" (that's formatHealthError)
        expect(result.content[0].text).toBe('Error executing sample: Identity spoof rejected');
    });

    test('onHealthGateFailure hook fires with context (toolName/args/error/t0) before formatHealthError', async () => {
        const captured = [];
        const Cls      = makeTestServerClass({
            getHealthService   : () => ({ensureHealthy: async () => { throw new Error('Service down'); }}),
            onHealthGateFailure: async (ctx) => { captured.push(ctx); }
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const t0Before = Date.now();
        const result   = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {sessionId: 'sess-1', payload: 42}}
        });

        expect(captured).toHaveLength(1);
        expect(captured[0].toolName).toBe('sample');
        expect(captured[0].args).toEqual({sessionId: 'sess-1', payload: 42});
        expect(captured[0].error.message).toBe('Service down');
        expect(captured[0].t0).toBeGreaterThanOrEqual(t0Before);
        expect(captured[0].t0).toBeLessThanOrEqual(Date.now());

        // Hook does NOT change the error envelope shape
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Cannot execute sample: Service down');
    });

    test('onHealthGateFailure default is no-op (does NOT prevent formatHealthError envelope)', async () => {
        const Cls = makeTestServerClass({
            getHealthService: () => ({ensureHealthy: async () => { throw new Error('Service down'); }})
            // No onHealthGateFailure override — default no-op
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        // Behavior identical to without the hook — default-no-op confirmed
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Cannot execute sample: Service down');
    });

    test('wrapDispatch override threads context around toolService.callTool', async () => {
        const wrapCalls = [];
        const Cls       = makeTestServerClass({
            wrapDispatch: async (dispatch) => {
                wrapCalls.push('before');
                const result = await dispatch();
                wrapCalls.push('after');
                return result;
            }
        });
        const server  = Neo.create(Cls);
        const mockMcp = makeMockMcpServer();
        server.setupRequestHandlers(mockMcp);

        const result = await mockMcp.getCallToolHandler()({
            params: {name: 'sample', arguments: {}}
        });

        expect(wrapCalls).toEqual(['before', 'after']);
        expect(result.isError).toBe(false);
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — initAsync canonical sequence', () => {
    test('subclass overrides boot() to skip canonical sequence', async () => {
        const calls = [];
        const id    = ++_testClassCounter;
        class CustomBootServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.CustomBootServer${id}`}

            getServerMetadata() { return {name: 'neo-custom'}; }
            getToolService()    { return {listTools: () => ({tools: []}), callTool: async () => null}; }

            // Custom boot order: only loadCustomConfig + connectTransport, no canonical
            async boot() {
                calls.push('custom-boot-start');
                await this.loadCustomConfig();
                calls.push('between-blocks');
                await this.connectTransport();
                calls.push('custom-boot-end');
            }

            // Stubs for the building blocks the override DOES use
            async loadCustomConfig() { calls.push('loadCustomConfig'); }
            async connectTransport() { calls.push('connectTransport'); }

            // Stubs for canonical-sequence blocks that should NOT fire
            async beforeMcpServerInit()      { calls.push('beforeMcpServerInit-SHOULD-NOT-FIRE'); }
            createMcpServer()                { calls.push('createMcpServer-SHOULD-NOT-FIRE'); return {server: {setRequestHandler: () => {}}}; }
            async waitForDependentServices() { calls.push('waitForDependentServices-SHOULD-NOT-FIRE'); }
            async runHealthcheckAndLogStatus() { calls.push('runHealthcheck-SHOULD-NOT-FIRE'); return null; }
        }

        const Cls    = Neo.setupClass(CustomBootServer);
        const server = Neo.create(Cls);
        await server.ready();

        // Only the building blocks the custom boot calls should fire
        expect(calls).toEqual([
            'custom-boot-start',
            'loadCustomConfig',
            'between-blocks',
            'connectTransport',
            'custom-boot-end'
        ]);
    });

    test('default initAsync calls hooks in canonical order (no health, no transport)', async () => {
        const calls = [];
        const id    = ++_testClassCounter;
        class SequenceServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.SequenceServer${id}`}

            getServerMetadata() { return {name: 'neo-seq'}; }
            getToolService()    { return {listTools: () => ({tools: []}), callTool: async () => null}; }

            async loadCustomConfig()        { calls.push('loadCustomConfig'); }
            async beforeMcpServerInit()     { calls.push('beforeMcpServerInit'); }
            createMcpServer()               { calls.push('createMcpServer'); return {server: {setRequestHandler: () => {}}}; }
            async waitForDependentServices(){ calls.push('waitForDependentServices'); }
            async beforeHealthcheck()       { calls.push('beforeHealthcheck'); }
            async runHealthcheckAndLogStatus() { calls.push('runHealthcheckAndLogStatus'); return null; }
            async afterHealthcheck()        { calls.push('afterHealthcheck'); }
            async connectTransport()        { calls.push('connectTransport'); }
            async afterTransportConnected() { calls.push('afterTransportConnected'); }
        }

        const Cls = Neo.setupClass(SequenceServer);
        // Neo.create() auto-runs initAsync via its construction lifecycle. ready() awaits the
        // chain — calling initAsync manually would re-run the sequence and double the call list.
        const server = Neo.create(Cls);
        await server.ready();

        expect(calls).toEqual([
            'loadCustomConfig',
            'beforeMcpServerInit',
            'createMcpServer',
            'waitForDependentServices',
            'beforeHealthcheck',
            'runHealthcheckAndLogStatus',
            'afterHealthcheck',
            'connectTransport',
            'afterTransportConnected'
        ]);
    });

    test('waitForDependentServices awaits ready() on each service in declaration order', async () => {
        const order       = [];
        const makeService = (name) => {
            let called = false;
            return {
                async ready() {
                    // Idempotent: count only the first invocation. Auto-init may call ready()
                    // during Neo.create lifecycle; this test asserts the explicit call ordering.
                    if (called) return;
                    called = true;
                    await new Promise(r => setImmediate(r));
                    order.push(name);
                }
            };
        };

        const Cls = makeTestServerClass({
            getDependentServices: () => [makeService('A'), makeService('B'), makeService('C')]
        });
        const server = Neo.create(Cls);
        await server.ready();

        expect(order).toEqual(['A', 'B', 'C']);
    });

    test('runHealthcheckAndLogStatus returns null when no health service', async () => {
        const Cls    = makeTestServerClass();
        const server = Neo.create(Cls);

        await expect(server.runHealthcheckAndLogStatus()).resolves.toBeNull();
    });

    test('loadCustomConfig is no-op when configFile unset', async () => {
        let   loadCalls = 0;
        const Cls       = makeTestServerClass();
        const server    = Neo.create(Cls);
        server.aiConfig = {transport: 'stdio', load: async () => { loadCalls++; }};
        // configFile remains null

        await server.loadCustomConfig();
        expect(loadCalls).toBe(0);
    });

    test('loadCustomConfig invokes aiConfig.load when configFile set', async () => {
        let   loadedFrom = null;
        const Cls        = makeTestServerClass();
        const server     = Neo.create(Cls);
        server.aiConfig = {transport: 'stdio', load: async (path) => { loadedFrom = path; }};
        server.configFile = '/tmp/custom-config.mjs';

        await server.loadCustomConfig();
        expect(loadedFrom).toBe('/tmp/custom-config.mjs');
    });
});

/**
 * @summary Local builder for the plane-member boundary tests — the `BareServer` isolation
 * precedent (no-op `initAsync`, so creation never races the assertion under test).
 */
function makeBoundaryServerClass({member, members = [], composed = false}) {
    const id = ++_testClassCounter;
    class BoundarySrv extends BaseServer {
        static config = {className: `Neo.test.mcp.server.BoundarySrv${id}`}
        // Isolated unit test — skip the boot lifecycle so each test drives the assertion directly.
        async initAsync() { /* no-op */ }
        getServerMetadata() { return {name: 'boundary-test'}; }
        getToolService()    { return {listTools: () => ({tools: []}), callTool: async () => ({})}; }
        isPlaneMember()     { return member; }

        getPlaneMembers() {
            return composed ? this.collectMemberEntries({localPaths: [], localDescriptorData: {}}) : members;
        }
    }
    return Neo.setupClass(BoundarySrv);
}

test.describe('Neo.ai.mcp.server.BaseServer — plane-member boundary (#15799)', () => {
    test('membership defaults to false — API-bridge servers and fixtures carry no plane by contract', () => {
        const server = Neo.create(makeTestServerClass());

        // A truthy per-server config WITHOUT a plane subtree: the exact shape that must
        // skip, never throw (the gitlab-workflow smoke-fixture regression class).
        server.aiConfig = {transport: 'stdio'};

        expect(server.isPlaneMember()).toBe(false);
        expect(server.assertPlaneIdentity()).toBeNull();
    });

    test('a declared member without aiConfig fails loud', () => {
        const server = Neo.create(makeBoundaryServerClass({member: true}));

        expect(() => server.assertPlaneIdentity()).toThrow('without aiConfig');
    });

    test('a declared member whose config resolves no plane subtree fails loud', () => {
        const server = Neo.create(makeBoundaryServerClass({member: true}));
        server.aiConfig = {transport: 'stdio'};

        expect(() => server.assertPlaneIdentity()).toThrow('plane');
    });

    test('a declared member with a coherent plane returns the observed identity', () => {
        const server = Neo.create(makeBoundaryServerClass({member: true}));
        server.aiConfig = {plane: {id: 'overlay-boundary-spec', dataRoot: path.join(os.tmpdir(), 'neo-plane-boundary-spec')}};

        const observed = server.assertPlaneIdentity();
        expect(observed.planeId).toBe('overlay-boundary-spec');
    });

    test('member-coherence clause: a relocated root with anchor-default members fails boot', () => {
        const relocatedRoot = path.join(os.tmpdir(), 'neo-plane-relocated-spec');
        const anchorPath    = path.join(os.tmpdir(), 'neo-plane-old-anchor', 'logs');
        const server        = Neo.create(makeBoundaryServerClass({
            member : true,
            members: [{path: 'logPath', resolved: anchorPath, default: anchorPath}]
        }));

        server.aiConfig = {plane: {id: 'overlay-boundary-spec', dataRoot: relocatedRoot}};

        expect(() => server.assertPlaneIdentity()).toThrow('fails closed');
    });

    test('member-coherence clause: explicitly placed members boot clean', () => {
        const relocatedRoot = path.join(os.tmpdir(), 'neo-plane-relocated-spec');
        const server        = Neo.create(makeBoundaryServerClass({
            member : true,
            members: [{path: 'logPath', resolved: '/vol/logs', default: path.join(os.tmpdir(), 'neo-plane-old-anchor', 'logs')}]
        }));

        server.aiConfig = {plane: {id: 'overlay-boundary-spec', dataRoot: relocatedRoot}};

        const observed = server.assertPlaneIdentity();
        expect(observed.planeId).toBe('overlay-boundary-spec');
    });

    test('the COMPLETE plane: composed Tier-1 claims fail a relocated boot, naming the strays', () => {
        // The re-review falsifier: a member server asserting only its LOCAL list would pass
        // while the inherited Tier-1 members it consumes stay on the old anchor. The
        // composition makes that bypass impossible.
        process.env.NEO_PLANE_DATA_ROOT = path.join(os.tmpdir(), 'neo-relocated-composed-spec');

        try {
            const isolated = createConfigProxy(Neo.create(ConfigProvider, {
                data    : Tier1ConfigBase.config.data,
                formulas: Tier1ConfigBase.config.formulas
            }));

            try {
                const server = Neo.create(makeBoundaryServerClass({member: true, composed: true}));
                server.aiConfig = isolated;

                // The witness is any inherited Tier-1 member: `backupPath` is now an explicit
                // non-member and therefore no longer a stray this walk can name. The point of
                // the test is that the LOCAL list alone cannot satisfy the assertion.
                expect(() => server.assertPlaneIdentity()).toThrow('wakeDaemonHeartbeatAlivePath');
            } finally {
                isolated.destroy()
            }
        } finally {
            delete process.env.NEO_PLANE_DATA_ROOT
        }
    });

    test('the COMPLETE plane: composition passes on an un-relocated Tier-1 provider', () => {
        const isolated = createConfigProxy(Neo.create(ConfigProvider, {
            data    : Tier1ConfigBase.config.data,
            formulas: Tier1ConfigBase.config.formulas
        }));

        try {
            const server = Neo.create(makeBoundaryServerClass({member: true, composed: true}));
            server.aiConfig = isolated;

            // Completeness, not a pinned count: the declared list must EQUAL the set derived from
            // the descriptor tree it claims to describe (declaration and membership are one act —
            // an anchored leaf with no planeMember decision fails the derivation itself, so the
            // forget-to-edit class fails here rather than shipping green. No literal to bump on
            // legitimate membership changes.
            // ticket-ref-ok: #15932 is the completeness mechanism this line enforces; #15872's
            // graph-SQLite omission is its first confirmed instance — named because the
            // regression's shape is the point.
            expect(new Set(TIER1_MEMBER_PATHS))
                .toEqual(new Set(derivePlaneMemberPaths({descriptorData: Tier1ConfigBase.config.data, anchor: Tier1ConfigBase.config.data.plane.dataRoot.default})));
            expect(server.getPlaneMembers().length).toBe(TIER1_MEMBER_PATHS.length);

            const observed = server.assertPlaneIdentity();
            expect(observed.planeId).toBe('neo-local-canonical');
        } finally {
            isolated.destroy()
        }
    });
});

/**
 * Covers the result-side half of the advertised-surface staleness signal.
 *
 * The descriptor half is proven in `ai/mcp/advertisedSurfaceDigest.spec.mjs`; nothing there proves the
 * server actually publishes the live value, which is the half a stale seat fetches. Without a witness
 * here the instrument could stop firing and every other test stays green — the same shape the digest
 * exists to remove, one layer up.
 */
test.describe('Neo.ai.mcp.server.BaseServer — advertised-surface descriptor on results', () => {
    /**
     * @summary Builds a tool service whose surface describer is observable.
     * @param {Object} [options]
     * @returns {Object}
     */
    function surfaceAwareToolService({describe, carrier = 'healthcheck', result} = {}) {
        return {
            surfaceDigestCarrierTool : carrier,
            describeAdvertisedSurface: describe || (toolProjection => ({
                carrierTool: carrier,
                digest     : toolProjection ? 'projected0000' : 'abcdef012345',
                toolCount  : 2
            })),
            listTools: () => ({tools: [], nextCursor: null}),
            callTool : async () => result ?? {status: 'healthy'}
        }
    }

    /**
     * @summary Invokes the registered CallTool handler for a tool name.
     * @param {Object} server
     * @param {String} name
     * @returns {Promise<Object>}
     */
    async function callTool(server, name) {
        const mockMcp = makeMockMcpServer();

        server.setupRequestHandlers(mockMcp);

        return mockMcp.getCallToolHandler()({params: {name, arguments: {}}})
    }

    test('the carrier tool result carries the live advertised surface', async () => {
        const toolService = surfaceAwareToolService();
        const server      = Neo.create(makeTestServerClass({getToolService: () => toolService}));

        const response = await callTool(server, 'healthcheck');

        expect(response.structuredContent.advertisedSurface)
            .toEqual({carrierTool: 'healthcheck', digest: 'abcdef012345', toolCount: 2});
        // The pre-existing payload must survive untouched.
        expect(response.structuredContent.status).toBe('healthy')
    });

    test('a non-carrier tool result is untouched', async () => {
        const toolService = surfaceAwareToolService();
        const server      = Neo.create(makeTestServerClass({getToolService: () => toolService}));

        const response = await callTool(server, 'add_memory');

        // The control. Without it, an implementation that decorates EVERY result satisfies the
        // assertion above while publishing a surface token on tools that never carry one.
        expect(response.structuredContent.advertisedSurface).toBeUndefined()
    });

    test('the digest is computed for the projection the call ran under', async () => {
        const toolService = surfaceAwareToolService();
        const server      = Neo.create(makeTestServerClass({
            getToolService            : () => toolService,
            buildToolProjectionContext: () => ({mode: 'harness'})
        }));

        const response = await callTool(server, 'healthcheck');

        // A profiled seat compares against the surface it was OFFERED. Publishing the unfiltered
        // digest would report every profiled seat permanently stale.
        expect(response.structuredContent.advertisedSurface.digest).toBe('projected0000')
    });

    test('a describer that throws degrades to no token instead of failing the call', async () => {
        const toolService = surfaceAwareToolService({
            describe: () => { throw new Error('surface unreadable') }
        });
        const server = Neo.create(makeTestServerClass({getToolService: () => toolService}));

        const response = await callTool(server, 'healthcheck');

        // A stale seat may be calling healthcheck precisely to diagnose itself. Failing that call to
        // report a freshness problem would remove the one surface it can still reach.
        expect(response.isError).toBeFalsy();
        expect(response.structuredContent.status).toBe('healthy');
        expect(response.structuredContent.advertisedSurface).toBeUndefined()
    });

    test('an error result is not decorated', async () => {
        const toolService = surfaceAwareToolService({result: {error: 'nope'}});
        const server      = Neo.create(makeTestServerClass({getToolService: () => toolService}));

        const response = await callTool(server, 'healthcheck');

        expect(response.isError).toBe(true);
        expect(JSON.stringify(response)).not.toContain('advertisedSurface')
    });

    test('a tool service without a describer still answers', async () => {
        const server = Neo.create(makeTestServerClass({
            getToolService: () => ({
                listTools: () => ({tools: [], nextCursor: null}),
                callTool : async () => ({status: 'healthy'})
            })
        }));

        const response = await callTool(server, 'healthcheck');

        expect(response.structuredContent).toEqual({status: 'healthy'})
    })
});

/**
 * @summary Boot-reachability witness for the self-reported heap-observation channel.
 *
 * **This exists because a green suite once proved the opposite of what it was cited for.** The
 * reporter shipped with zero production callers: nothing imported it, nothing called `start()`. Its
 * own specs passed — they constructed the singleton directly — and the bridge reader's `absent` arm
 * passed too, which was cited as evidence the fail-closed path worked. It did. It was also the only
 * path production could ever take. A test that passes for the reason the feature is broken is not
 * weak coverage; it points the wrong way.
 *
 * So this witness never imports the reporter. It boots a server through the ordinary lifecycle and
 * asks the filesystem whether an observation appeared at the configured path. Deleting the
 * `startHeapObservation()` call reds it; deleting the reporter's start logic reds it; and a server
 * that declares no key must leave the directory untouched, so the assertion cannot pass by writing
 * something unconditionally.
 *
 * The publish directory is the real configured leaf, which `configTemplateResolver` already redirects
 * to a run-scoped storage root — the shared `AiConfig` singleton is never mutated to isolate this.
 */
test.describe('Neo.ai.mcp.server.BaseServer — heap-observation boot reachability (#16763)', () => {
    const observationDir = () => AiConfig.heapObservation.dir,
          published      = key => path.join(observationDir(), `${key}.json`);

    /**
     * Overrides `boot()` to a no-op WITHOUT chaining `super.boot()` — memory-core's real shape, and
     * the case a start wired into the default `boot()` would silently skip.
     */
    function makeObservingServerClass(serviceKey) {
        const id = ++_testClassCounter;

        class ObservingServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.ObservingServer${id}`}

            getServerMetadata() { return {name: 'neo-test', version: '1.0.0', capabilities: {tools: {}}} }
            getToolService()    { return {listTools: () => ({tools: [], nextCursor: null}), callTool: async () => ({})} }

            getHeapObservationServiceKey() { return serviceKey }

            async boot() { /* non-canonical bootstrap, exactly as memory-core does */ }
        }

        return Neo.setupClass(ObservingServer);
    }

    test('booting a server that declares a key publishes its observation', async () => {
        const serviceKey = `witness-declared-${++_testClassCounter}`,
              server     = Neo.create(makeObservingServerClass(serviceKey));

        await server.ready();

        try {
            expect(fs.existsSync(published(serviceKey))).toBe(true);

            const record = JSON.parse(fs.readFileSync(published(serviceKey), 'utf8'));

            // Stamped with the key the server declared: the bridge refuses any record whose stamped
            // key differs from the path it resolved, so publishing under the wrong name is the same
            // as publishing nothing.
            expect(record.serviceKey).toBe(serviceKey);
            expect(record.recordType).toBe('process-heap-observation');
            expect(record.pid).toBe(process.pid);
            // A real capture from this process, reached through boot rather than through a direct call.
            expect(record.observation.state).toBe('observed');
            expect(record.observation.rssBytes).toBeGreaterThan(0)
        } finally {
            // The teardown the server owns, exercised rather than described.
            server.stopHeapObservation();
            fs.rmSync(published(serviceKey), {force: true})
        }
    });

    test('a server that declares NO key publishes nothing', async () => {
        // The control that makes the assertion above non-vacuous: without it, a directory that some
        // other server had already populated would satisfy an existence check on its own.
        const serviceKey = `witness-optout-${++_testClassCounter}`,
              id         = ++_testClassCounter;

        class SilentServer extends BaseServer {
            static config = {className: `Neo.test.mcp.server.SilentServer${id}`}

            getServerMetadata() { return {name: 'neo-test', version: '1.0.0', capabilities: {tools: {}}} }
            getToolService()    { return {listTools: () => ({tools: [], nextCursor: null}), callTool: async () => ({})} }

            async boot() { /* no-op */ }
        }

        const server = Neo.create(Neo.setupClass(SilentServer));

        await server.ready();

        expect(server.getHeapObservationServiceKey()).toBeNull();
        expect(fs.existsSync(published(serviceKey))).toBe(false)
    });

    test('the two shipped opt-ins name their Compose service labels', async () => {
        // The key is the string the bridge resolves `<key>.json` from and then re-checks against the
        // record's own stamp. A drift here publishes files nothing reads.
        const [{default: KbServer}, {default: McServer}] = await Promise.all([
            import('../../../../../../ai/mcp/server/knowledge-base/Server.mjs'),
            import('../../../../../../ai/mcp/server/memory-core/Server.mjs')
        ]);

        expect(KbServer.prototype.getHeapObservationServiceKey.call({})).toBe('kb-server');
        expect(McServer.prototype.getHeapObservationServiceKey.call({})).toBe('mc-server')
    })
});
