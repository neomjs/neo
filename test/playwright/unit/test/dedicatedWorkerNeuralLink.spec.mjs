import {test, expect} from '@playwright/test';
import vm             from 'node:vm';
import {
    BRIDGE_TOOL_SERVICE_MAP,
    buildAppConnectionSurface,
    createBridgeAppConnection,
    createDedicatedWorkerAppConnection,
    disconnectTestWriter,
    isDedicatedAppWorker,
    mintTestWriterPair,
    runDedicatedWorkerNeuralLink
} from '../../dedicatedWorkerNeuralLink.mjs';
import {
    assertUnnavigatedBeforeNeuralLinkRoute,
    hasBrainRuntimeRoot
} from '../../fixtures.mjs';

/**
 * @summary Fake Playwright `Worker` that simulates a dedicated App Worker with `Neo.ai.Client` in-memory.
 */
function createFakeDedicatedWorker({
    appName     = 'Neo.examples.button.base',
    url         = 'http://localhost:8080/src/worker/App.mjs',
    windowItems = [{appName, id: '1'}],
    workerId    = '11111111-2222-3333-4444-555555555555'
} = {}) {
    const disconnectedPairs = [],
          requests          = [];

    return {
        appName,
        disconnectedPairs,
        requests,
        url     : () => url,
        workerId,
        async evaluate(fn, arg) {
            const previousNeo = globalThis.Neo;

            globalThis.Neo = {
                apps  : {1: {name: appName}},
                config: {
                    allowAiClientInTests: true,
                    appName,
                    environment         : 'development'
                },
                manager: {
                    Window: {items: windowItems}
                },
                worker: {
                    App: {
                        aiClientPromise: Promise.resolve(),
                        id             : workerId,
                        isSharedWorker : false
                    }
                },
                ai: {
                    Client: {
                        handleAgentDisconnected(pair) {
                            disconnectedPairs.push(pair);
                            return {released: 1, swept: true}
                        },
                        async handleTestRequest(method, params, context) {
                            requests.push({context, method, params});

                            if (method === 'get_instance_properties') {
                                return {properties: {text: 'Hello'}}
                            }
                            if (method === 'call_method') {
                                return {result: 'called'}
                            }
                            if (method === 'find_instances') {
                                return {instances: [{id: 'neo-button-1'}]}
                            }
                            if (method === 'query_component') {
                                return {components: [{id: 'neo-button-1'}]}
                            }
                            if (method === 'query_vdom') {
                                return {nodes: [{id: 'neo-button-1'}]}
                            }
                            if (method === 'get_dom_rect') {
                                // Simulate a native DOMRect whose geometry lives on prototype getters + toJSON(),
                                // proving invokeWorker's JSON round-trip preserves rect fields across CDP returnByValue.
                                const proto = {
                                    get height() { return 30 },
                                    get width()  { return 100 },
                                    get x()      { return 0 },
                                    get y()      { return 0 },
                                    toJSON()     { return {height: this.height, width: this.width, x: this.x, y: this.y} }
                                };

                                return {rects: [Object.create(proto)]}
                            }
                            if (method === 'get_computed_styles') {
                                return {styles: {display: 'inline-flex'}}
                            }

                            return {method, ok: true, params}
                        }
                    }
                }
            };

            try {
                return await fn(arg)
            } finally {
                globalThis.Neo = previousNeo
            }
        }
    }
}

/**
 * @summary Playwright page and context facades with a real page-side worker-id read in an isolated realm.
 * @param {Object} worker The dedicated App Worker facade
 * @returns {Object}
 */
function createFakeFixtures(worker) {
    const contextRoutes = [],
          listeners     = new Map(),
          pageRoutes    = [];

    const context = {
        on() {},
        pages: () => page.closed ? [] : [page],
        async route(pattern, handler) {
            contextRoutes.push({handler, pattern})
        }
    };

    const browser = {
        contexts: () => [context],
        async newContext() {
            return {
                async route(pattern, handler) {
                    contextRoutes.push({handler, pattern, isNewContext: true})
                }
            }
        }
    };

    const page = {
        closed  : false,
        context : () => context,
        isClosed: () => page.closed,
        opener  : async () => null,
        async evaluate(fn, arg) {
            const Neo = {worker: {App: {getWorkerId: async () => worker.workerId}}};

            return vm.runInNewContext(`(${fn})(${JSON.stringify(arg)})`, {Neo, window: {Neo}})
        },
        async route(pattern, handler) {
            pageRoutes.push({handler, pattern})
        },
        on(event, listener) {
            listeners.set(event, listener)
        },
        url    : () => 'about:blank',
        workers: () => [worker]
    };

    return {browser, context, contextRoutes, listeners, page, pageRoutes}
}

test.describe('test/playwright/dedicatedWorkerNeuralLink — off-socket dedicated App Worker adapter', () => {
    test('an exact worker id binds a second context after the fixture page closed', async () => {
        const first  = createFakeFixtures(createFakeDedicatedWorker()),
              worker = createFakeDedicatedWorker({workerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}),
              second = createFakeFixtures(worker);

        first.browser.contexts = () => [first.context, second.context];

        await runDedicatedWorkerNeuralLink(first, async nl => {
            first.page.closed = true;
            await (await nl.connectToApp(worker.workerId, {identityTimeout: 30})).setProperties('second', {text: 'cold boot'})
        });

        expect(worker.requests.map(({params}) => params.id)).toEqual(['second']);
        expect(worker.disconnectedPairs).toHaveLength(1)
    });

    test('an exact worker id prefers its root page over a popup and keeps SDK connections on their own workers', async () => {
        const firstWorker  = createFakeDedicatedWorker(),
              secondWorker = createFakeDedicatedWorker({workerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}),
              first        = createFakeFixtures(firstWorker),
              second       = createFakeFixtures(secondWorker),
              popup        = createFakeFixtures(secondWorker);

        popup.page.opener = async () => second.page;
        first.browser.contexts = () => [first.context, {pages: () => [popup.page, second.page]}];

        await runDedicatedWorkerNeuralLink(first, async nl => {
            const firstApp = await nl.connectToApp(firstWorker.workerId, {identityTimeout: 30}),
                  otherApp = await nl.connectToApp(secondWorker.workerId, {identityTimeout: 30});

            await otherApp.setProperties('second', {text: 'second context'});
            await firstApp.setProperties('first', {text: 'original context'});

            expect(second.pageRoutes, 'the root owns the navigation release hook').toHaveLength(1);
            expect(popup.pageRoutes, 'the popup is never bound').toHaveLength(0)
        });

        expect(firstWorker.requests.map(({params}) => params.id)).toEqual(['first']);
        expect(secondWorker.requests.map(({params}) => params.id)).toEqual(['second'])
    });

    test('an absent exact worker id never dispatches to another context with the same app name', async () => {
        const first  = createFakeFixtures(createFakeDedicatedWorker()),
              worker = createFakeDedicatedWorker({workerId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'}),
              second = createFakeFixtures(worker);

        first.browser.contexts = () => [first.context, second.context];

        await runDedicatedWorkerNeuralLink(first, async nl => {
            await expect(nl.connectToApp('00000000-0000-0000-0000-000000000000', {identityTimeout: 30}))
                .rejects.toThrow('did not initialize Neo.ai.Client')
        });

        expect(worker.requests).toEqual([])
    });

    test('hasBrainRuntimeRoot selects the adapter when NEO_AGENTOS_RUNTIME_ROOT is unset or empty', () => {
        expect(hasBrainRuntimeRoot({})).toBe(false);
        expect(hasBrainRuntimeRoot({NEO_AGENTOS_RUNTIME_ROOT: ''})).toBe(false);
        expect(hasBrainRuntimeRoot({NEO_AGENTOS_RUNTIME_ROOT: '/abs/neo-agent-brain'})).toBe(true)
    });

    test('isDedicatedAppWorker matches only /worker/App.mjs workers', () => {
        expect(isDedicatedAppWorker({url: () => 'http://localhost:8080/src/worker/App.mjs'})).toBe(true);
        expect(isDedicatedAppWorker({url: () => 'http://localhost:8080/src/worker/VDom.mjs'})).toBe(false);
        expect(isDedicatedAppWorker({url: () => 'http://localhost:8080/src/worker/Data.mjs'})).toBe(false);
        expect(isDedicatedAppWorker(null)).toBe(false)
    });

    test('mintTestWriterPair returns a distinct {agentId, sessionId} pair per invocation', () => {
        const first  = mintTestWriterPair(),
              second = mintTestWriterPair();

        expect(first.agentId).toMatch(/^playwright-test-agent-\d+-\d+$/);
        expect(first.sessionId).toMatch(/^playwright-test-session-[0-9a-f-]{36}$/i);
        expect(second.agentId).not.toBe(first.agentId);
        expect(second.sessionId).not.toBe(first.sessionId)
    });

    test('routes neo-config.json with allowAiClientInTests: true and addresses the captured worker without appName search', async () => {
        const worker                                  = createFakeDedicatedWorker({appName: 'ActualWorkerAppName'}),
              {browser, context, contextRoutes, page} = createFakeFixtures(worker);

        let fulfilledJson = null;

        await runDedicatedWorkerNeuralLink({browser, context, page}, async nl => {
            expect(nl.bridgePort).toBeNull();
            expect(contextRoutes).toHaveLength(1);

            await contextRoutes[0].handler({
                async fetch() {
                    return {
                        ok  : () => true,
                        json: async () => ({appPath: 'examples/button/base/app.mjs', useAiClient: true})
                    }
                },
                async fulfill({json}) {
                    fulfilledJson = json
                }
            });

            expect(fulfilledJson).toEqual({
                allowAiClientInTests: true,
                appPath             : 'examples/button/base/app.mjs',
                useAiClient         : true
            });

            // Passing an unrelated app name still binds the page's captured dedicated App Worker directly
            const nlApp = await nl.connectToApp('UnrelatedAppNameNeverSearched');

            expect(nlApp.sessionId).toBe(worker.workerId);
            expect(await nlApp.getComponent('neo-button-1', ['text'])).toEqual({text: 'Hello'});
            expect(await nlApp.setProperties('neo-button-1', {text: 'Updated'})).toMatchObject({
                method: 'set_instance_properties',
                ok    : true,
                params: {id: 'neo-button-1', properties: {text: 'Updated'}}
            });
            expect(worker.requests).toHaveLength(2);
            expect(worker.requests[0].context).toEqual(nl.writerPair);
            expect(worker.requests[1].context).toEqual(nl.writerPair)
        }, {assertUnnavigated: assertUnnavigatedBeforeNeuralLinkRoute});

        expect(worker.disconnectedPairs).toHaveLength(1)
    });

    test('each test receives its own writer pair and teardown calls handleAgentDisconnected even when use() throws', async () => {
        const worker    = createFakeDedicatedWorker(),
              seenPairs = [];

        const firstRun = createFakeFixtures(worker);

        await expect(runDedicatedWorkerNeuralLink(firstRun, async nl => {
            seenPairs.push(nl.writerPair);
            const nlApp = await nl.connectToApp('Neo.examples.button.base');
            await nlApp.setProperties('neo-button-1', {text: 'BeforeThrow'});
            throw new Error('simulated test failure')
        })).rejects.toThrow('simulated test failure');

        expect(worker.disconnectedPairs).toEqual([seenPairs[0]]);

        const secondRun = createFakeFixtures(worker);

        await runDedicatedWorkerNeuralLink(secondRun, async nl => {
            seenPairs.push(nl.writerPair);
            const nlApp = await nl.connectToApp('Neo.examples.button.base');
            await nlApp.undo()
        });

        expect(seenPairs).toHaveLength(2);
        expect(seenPairs[1].agentId).not.toBe(seenPairs[0].agentId);
        expect(seenPairs[1].sessionId).not.toBe(seenPairs[0].sessionId);
        expect(worker.disconnectedPairs).toEqual([seenPairs[0], seenPairs[1]])
    });

    test('createDedicatedWorkerAppConnection maps the nlApp SDK methods onto handleTestRequest', async () => {
        const worker     = createFakeDedicatedWorker(),
              writerPair = mintTestWriterPair(),
              nlApp      = createDedicatedWorkerAppConnection({
                  getLogs  : () => [
                      {message: 'App booted', timestamp: 1, type: 'info'},
                      {message: 'Warn line', timestamp: 2, type: 'warn'}
                  ],
                  getWorker: () => worker,
                  sessionId: worker.workerId,
                  writerPair
              });

        expect(await nlApp.callMethod('neo-button-1', 'focus', [true])).toBe('called');
        expect(await nlApp.findInstances({ntype: 'button'})).toEqual([{id: 'neo-button-1'}]);
        expect(await nlApp.queryComponent({ntype: 'button'})).toEqual([{id: 'neo-button-1'}]);
        expect(await nlApp.queryVdom({cls: 'neo-button'})).toEqual([{id: 'neo-button-1'}]);
        expect(await nlApp.getDomRect('neo-button-1')).toEqual([{height: 30, width: 100, x: 0, y: 0}]);
        expect(await nlApp.getComputedStyles('neo-button-1', ['display'])).toEqual({display: 'inline-flex'});
        expect(await nlApp.inspectComponentRenderTree('vdom', 2, 'neo-button-1')).toMatchObject({
            method: 'get_vdom_tree',
            params: {depth: 2, rootId: 'neo-button-1'}
        });
        expect(await nlApp.manageNeoConfig('get')).toMatchObject({method: 'get_neo_config'});
        expect(await nlApp.getConsoleLogs('warn', 'warn')).toEqual([{message: 'Warn line', timestamp: 2, type: 'warn'}]);
        expect(await nlApp.getWorkerTopology()).toEqual([{
            appName       : 'Neo.examples.button.base',
            appWorkerId   : worker.workerId,
            environment   : 'development',
            isSharedWorker: false,
            sessionId     : worker.workerId
        }]);
        expect(await nlApp.getWindowTopology()).toEqual([{
            appName     : 'Neo.examples.button.base',
            appWorkerId : worker.workerId,
            capabilities: undefined,
            chrome      : undefined,
            innerRect   : undefined,
            outerRect   : undefined,
            sessionId   : worker.workerId,
            windowId    : '1'
        }]);

        expect(await disconnectTestWriter(null, writerPair)).toBeNull()
    });

    test('get_window_topology hands a window\'s rects over in the wire\'s JSON shape, so x and y survive', async () => {
        // `Neo.util.Rectangle` is a DOMRect: its geometry lives on prototype getters, which CDP's returnByValue drops
        const rect = (x, y, width, height) => Object.create({
                  get height() {return height},
                  get width()  {return width},
                  get x()      {return x},
                  get y()      {return y},
                  toJSON()     {return {height, width, x, y}}
              }),
              worker = createFakeDedicatedWorker({windowItems: [{appName: 'Colors', id: '1', innerRect: rect(10, 20, 300, 200)}]}),
              nlApp  = createDedicatedWorkerAppConnection({getWorker: () => worker, sessionId: worker.workerId, writerPair: mintTestWriterPair()});

        expect((await nlApp.getWindowTopology())[0].innerRect).toEqual({height: 200, width: 300, x: 10, y: 20})
    });

    test('a window operation on a window the topology does not hold is refused before the App Worker sees it, as the Bridge refuses it', async () => {
        const worker = createFakeDedicatedWorker(),
              nlApp  = createDedicatedWorkerAppConnection({getWorker: () => worker, sessionId: worker.workerId, writerPair: mintTestWriterPair()});

        await expect(nlApp.focusWindow('missing-window-id')).rejects.toThrow("Unknown windowId 'missing-window-id'.");
        await expect(nlApp.closeWindow('missing-window-id')).rejects.toThrow("Unknown windowId 'missing-window-id'.");
        await expect(nlApp.positionWindow({windowId: 'missing-window-id', x: 0, y: 0})).rejects.toThrow("Unknown windowId 'missing-window-id'.");
        expect(worker.requests.map(({method}) => method), 'no refused call reached the App Worker').toEqual([]);

        expect(await nlApp.focusWindow('1')).toMatchObject({method: 'focus_window', ok: true, params: {windowId: '1'}});
        expect(await nlApp.openComponentWindow({componentId: 'neo-panel-1'})).toMatchObject({method: 'open_component_window', ok: true})
    });

    test('createDedicatedWorkerAppConnection and createBridgeAppConnection share one nlApp surface over stub transports', async () => {
        const worker      = createFakeDedicatedWorker(),
              writerPair  = mintTestWriterPair(),
              bridgeCalls = [],
              sessionId   = worker.workerId;

        const makeServiceProxy = serviceName => new Proxy({}, {
            get(_, prop) {
                if (typeof prop !== 'string') return undefined;

                return async (args) => {
                    bridgeCalls.push({args, method: prop, serviceName});

                    if (prop === 'getInstanceProperties') {
                        return {properties: {text: 'Hello'}}
                    }
                    if (prop === 'callMethod') {
                        return {result: 'called'}
                    }
                    if (prop === 'findInstances') {
                        return {instances: [{id: 'neo-button-1'}]}
                    }
                    if (prop === 'queryComponent') {
                        return {components: [{id: 'neo-button-1'}]}
                    }
                    if (prop === 'queryVdom') {
                        return {nodes: [{id: 'neo-button-1'}]}
                    }
                    if (prop === 'getDomRect') {
                        return {rects: [{height: 30, width: 100, x: 0, y: 0}]}
                    }
                    if (prop === 'getComputedStyles') {
                        return {styles: {display: 'inline-flex'}}
                    }

                    return {args, method: prop, ok: true, serviceName}
                }
            }
        });

        const services = {
            NeuralLink_ComponentService : makeServiceProxy('NeuralLink_ComponentService'),
            NeuralLink_ConnectionService: {
                async call(sid, rpcMethod, params) {
                    bridgeCalls.push({args: params, method: 'call', rpcMethod, serviceName: 'NeuralLink_ConnectionService', sessionId: sid});
                    return {ok: true, params, rpcMethod, sessionId: sid}
                },
                async getConsoleLogs(args) {
                    bridgeCalls.push({args, method: 'getConsoleLogs', serviceName: 'NeuralLink_ConnectionService'});
                    return [{message: 'Warn line', timestamp: 2, type: 'warn'}]
                }
            },
            NeuralLink_DataService       : makeServiceProxy('NeuralLink_DataService'),
            NeuralLink_DockService       : makeServiceProxy('NeuralLink_DockService'),
            NeuralLink_InstanceService   : makeServiceProxy('NeuralLink_InstanceService'),
            NeuralLink_InteractionService: makeServiceProxy('NeuralLink_InteractionService'),
            NeuralLink_RuntimeService    : makeServiceProxy('NeuralLink_RuntimeService')
        };

        const workerApp = createDedicatedWorkerAppConnection({
            getLogs  : () => [{message: 'Warn line', timestamp: 2, type: 'warn'}],
            getWorker: () => worker,
            sessionId,
            writerPair
        });
        const bridgeApp     = createBridgeAppConnection(services, sessionId),
              sharedSurface = buildAppConnectionSurface({call: async () => ({}), sessionId});

        const methodKeys = obj => Object.keys(obj).filter(key => typeof obj[key] === 'function').sort();

        expect(methodKeys(workerApp)).toEqual(methodKeys(bridgeApp));
        expect(methodKeys(workerApp)).toEqual(methodKeys(sharedSurface));
        expect(methodKeys(workerApp)).toHaveLength(50);
        expect(Object.keys(BRIDGE_TOOL_SERVICE_MAP).length).toBeGreaterThanOrEqual(48);

        // Response picks and argument shaping match across both transports
        expect(await bridgeApp.getComponent('neo-button-1')).toEqual(await workerApp.getComponent('neo-button-1'));
        expect(await bridgeApp.callMethod('neo-button-1', 'focus', [true])).toEqual(await workerApp.callMethod('neo-button-1', 'focus', [true]));
        expect(await bridgeApp.findInstances({ntype: 'button'})).toEqual(await workerApp.findInstances({ntype: 'button'}));
        expect(await bridgeApp.queryComponent({ntype: 'button'})).toEqual(await workerApp.queryComponent({ntype: 'button'}));
        expect(await bridgeApp.queryVdom({cls: 'neo-button'})).toEqual(await workerApp.queryVdom({cls: 'neo-button'}));
        expect(await bridgeApp.getDomRect('neo-button-1')).toEqual(await workerApp.getDomRect('neo-button-1'));
        expect(await bridgeApp.getComputedStyles('neo-button-1', ['display'])).toEqual(await workerApp.getComputedStyles('neo-button-1', ['display']));
        expect(await bridgeApp.getConsoleLogs('warn', 'warn')).toEqual(await workerApp.getConsoleLogs('warn', 'warn'));

        const dragResult = await bridgeApp.driveDrag({sourceId: 'a', targetId: 'b'});
        expect(dragResult).toEqual({
            ok       : true,
            params   : {sourceId: 'a', targetId: 'b'},
            rpcMethod: 'drive_drag',
            sessionId
        });

        await bridgeApp.getWorkerTopology();
        await bridgeApp.getWindowTopology();

        expect(bridgeCalls.find(c => c.method === 'getWorkerTopology')).toMatchObject({
            args       : undefined,
            serviceName: 'NeuralLink_RuntimeService'
        });
        expect(bridgeCalls.find(c => c.method === 'getWindowTopology')).toMatchObject({
            args       : undefined,
            serviceName: 'NeuralLink_RuntimeService'
        })
    })
});
