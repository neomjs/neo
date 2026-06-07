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

import {test, expect}                                  from '@playwright/test';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Neo                                             from '../../../../../../src/Neo.mjs';
import * as core                                       from '../../../../../../src/core/_export.mjs';
import BaseServer                                      from '../../../../../../ai/mcp/server/BaseServer.mjs';

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
            error    : 'Policy Refused',
            code     : 'POLICY_REFUSED',
            reason   : 'blocked by policy',
            policyId : 'test.policy',
            action   : 'write_file',
            tenet    : '#10293',
            details  : {targetPath: '/repo/AGENTS_TENETS.md'}
        });
    });
});

test.describe('Neo.ai.mcp.server.BaseServer — setupRequestHandlers wiring', () => {
    test('registers both ListTools and CallTool handlers', () => {
        const Cls       = makeTestServerClass();
        const server    = Neo.create(Cls);
        const mockMcp   = makeMockMcpServer();

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
        const Cls       = makeTestServerClass();
        const server    = Neo.create(Cls);
        const mockMcp   = makeMockMcpServer();
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

    test('CallTool handler dispatches via wrapDispatch + formatToolResult', async () => {
        const Cls       = makeTestServerClass();
        const server    = Neo.create(Cls);
        const mockMcp   = makeMockMcpServer();
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

    test('CallTool handler applies health-gate when healthService present and tool not exempt', async () => {
        let healthCheckCalls = 0;
        const Cls = makeTestServerClass({
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
        let healthCheckCalls = 0;
        const Cls = makeTestServerClass({
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
        const Cls = makeTestServerClass({
            getHealthService    : () => ({ensureHealthy: async () => { order.push('healthGate'); }}),
            beforeToolDispatch  : async ({toolName, args}) => { order.push(`beforeToolDispatch:${toolName}:${args.x}`); }
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
            getHealthService    : () => ({ensureHealthy: async () => {}}),
            beforeToolDispatch  : async () => { throw new Error('Identity spoof rejected'); }
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
        const Cls = makeTestServerClass({
            getHealthService    : () => ({ensureHealthy: async () => { throw new Error('Service down'); }}),
            onHealthGateFailure : async (ctx) => { captured.push(ctx); }
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
        const Cls = makeTestServerClass({
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

        const Cls    = Neo.setupClass(SequenceServer);
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
        const order = [];
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
        let loadCalls = 0;
        const Cls = makeTestServerClass();
        const server  = Neo.create(Cls);
        server.aiConfig = {load: async () => { loadCalls++; }};
        // configFile remains null

        await server.loadCustomConfig();
        expect(loadCalls).toBe(0);
    });

    test('loadCustomConfig invokes aiConfig.load when configFile set', async () => {
        let loadedFrom = null;
        const Cls = makeTestServerClass();
        const server = Neo.create(Cls);
        server.aiConfig = {load: async (path) => { loadedFrom = path; }};
        server.configFile = '/tmp/custom-config.mjs';

        await server.loadCustomConfig();
        expect(loadedFrom).toBe('/tmp/custom-config.mjs');
    });
});
