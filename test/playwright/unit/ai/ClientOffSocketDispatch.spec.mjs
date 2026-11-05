import {setup} from '../../setup.mjs';

const appName = 'AiClientOffSocketDispatchTest';

setup({
    neoConfig: {
        allowAiClientInTests: true,
        unitTestMode        : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../src/Neo.mjs';
import * as core         from '../../../../src/core/_export.mjs';
import Component         from '../../../../src/component/Base.mjs';
import Container         from '../../../../src/container/Base.mjs';
import InstanceManager   from '../../../../src/manager/Instance.mjs';
import Model             from '../../../../src/data/Model.mjs';
import Store             from '../../../../src/data/Store.mjs';
import StateProvider     from '../../../../src/state/Provider.mjs';
import WindowManager     from '../../../../src/manager/Window.mjs';
import UnitTestWebSocket from './UnitTestWebSocket.mjs';
import {
    createDedicatedWorkerAppConnection,
    runDedicatedWorkerNeuralLink
} from '../../dedicatedWorkerNeuralLink.mjs';

/**
 * Custom model for DataService off-socket coverage.
 */
class OffSocketDispatchModel extends Model {
    static config = {
        className: 'Test.Unit.Ai.OffSocketDispatch.Model',
        fields   : [
            {name: 'id',   type: 'String'},
            {name: 'name', type: 'String'}
        ]
    }
}
OffSocketDispatchModel = Neo.setupClass(OffSocketDispatchModel);

/**
 * Minimal dock-document holder that implements `applyDockZoneOperation` so `DockService#executeDockOperation`
 * and `DockService#getDockTopology` run deterministically in unit-test mode without a full dashboard tree.
 */
class OffSocketDockHolder extends Container {
    static config = {
        className: 'Test.Unit.Ai.OffSocketDispatch.DockHolder',
        ntype    : 'test-off-socket-dock-holder'
    }

    dockZoneDocument = {
        activeNodeId: 'pane-a',
        root        : {
            id   : 'root-split',
            items: [{id: 'pane-a', size: 0.5}, {id: 'pane-b', size: 0.5}],
            type : 'split'
        },
        schema: 'neo.dock.zone.v1'
    }

    applyDockZoneOperation(descriptor) {
        const nextDoc = structuredClone(this.dockZoneDocument);

        if (descriptor.operation === 'resizeSplit' && Array.isArray(descriptor.sizes)) {
            nextDoc.root.items.forEach((item, index) => {
                if (typeof descriptor.sizes[index] === 'number') {
                    item.size = descriptor.sizes[index]
                }
            })
        } else if (descriptor.operation === 'setActiveItem' && descriptor.itemId) {
            nextDoc.activeNodeId = descriptor.itemId
        }

        return {document: nextDoc, errors: []}
    }
}
OffSocketDockHolder = Neo.setupClass(OffSocketDockHolder);

/**
 * Builds an isolated fixture harness for running identical Neural Link sequences through either
 * `Client#onSocketMessage` (`agent_message` envelope) or `Client#handleTestRequest` (off-socket test entry).
 * @param {Neo.ai.Client} client
 * @param {String} prefix
 * @returns {Object}
 */
function createParityScenario(client, prefix) {
    const
        dispatchedEvents = [],
        dragCalls        = [],
        createdIds       = [];

    const container = Neo.create(Container, {
        appName,
        id   : `${prefix}-container`,
        items: [{
            module: Component,
            id    : `${prefix}-button`,
            text  : 'Initial'
        }]
    });

    const button = Neo.getComponent(`${prefix}-button`);

    const dockHolder = Neo.create(OffSocketDockHolder, {
        appName,
        id: `${prefix}-dock`
    });

    const store = Neo.create(Store, {
        data : [{id: 'rec-1', name: 'Alpha'}],
        id   : `${prefix}-store`,
        model: OffSocketDispatchModel
    });

    const provider = Neo.create(StateProvider, {
        component: container,
        data     : {counter: 1},
        id       : `${prefix}-provider`
    });

    const installEnvironmentStubs = () => {
        Neo.apps = {
            ...Neo.apps,
            [appName]: {mainView: container, name: appName}
        };

        Neo.Main = {
            ...Neo.Main,
            async getWindowData({windowId}) {
                return {
                    innerHeight: 600,
                    innerWidth : 800,
                    outerHeight: 640,
                    outerWidth : 800,
                    screenLeft : 0,
                    screenTop  : 0,
                    windowId
                }
            },
            async importAddon() {
                return true
            },
            reloadWindow() {},
            setRoute() {},
            async windowNativeClose() {
                return true
            },
            async windowNativeFocus() {
                return true
            },
            async windowNativeMoveTo() {
                return true
            }
        };

        Neo.main                 ??= {};
        Neo.main.DomAccess         = {
            async getBoundingClientRect({id}) {
                return {height: 40, left: 10, top: 20, width: 100, x: 10, y: 20, id}
            },
            async getChildNodeIds() {
                return [`${prefix}-button`]
            },
            async getComputedStyle() {
                return {display: 'flex'}
            }
        };
        Neo.main.addon           ??= {};
        Neo.main.addon.EventSimulator = {
            async dispatch(payload) {
                dispatchedEvents.push(payload);
                return true
            },
            async driveDrag(payload) {
                dragCalls.push({
                    destination: payload.destination.targetId,
                    source     : payload.source.targetId,
                    steps      : payload.steps,
                    windowId   : payload.windowId
                });
                return {
                    cleanup : {attempted: true, succeeded: true},
                    dispatch: {down: true, moveCount: payload.steps, up: true},
                    observed: {ended: true, moveCount: payload.steps, started: true},
                    phase   : 'complete',
                    released: true,
                    success : true
                }
            }
        }
    };

    const destroy = () => {
        createdIds.forEach(id => Neo.get(id)?.destroy?.());
        provider.destroy();
        store.destroy();
        dockHolder.destroy();
        container.destroy()
    };

    return {
        button,
        container,
        createdIds,
        destroy,
        dispatchedEvents,
        dockHolder,
        dragCalls,
        installEnvironmentStubs,
        provider,
        store
    }
}

/**
 * Normalizes dynamically minted ids and timestamps so on-socket and off-socket state snapshots can be compared
 * structurally across two runs.
 * @param {Object} params
 * @param {Neo.ai.Client} params.client
 * @param {String} params.createdId
 * @param {String} params.prefix
 * @param {Object} params.scenario
 * @param {Object} params.writerPair
 * @returns {Object}
 */
function snapshotParityOutcome({client, createdId, prefix, results, scenario, writerPair}) {
    const normalizePrefix = value => JSON.parse(
        JSON.stringify(value)
            .replaceAll(createdId, '<created-id>')
            .replaceAll(prefix, '<prefix>')
    );

    const heldLocks = client.writeGuard.heldLocks()
        .filter(lock => lock.agentId === writerPair.agentId && lock.sessionId === writerPair.sessionId)
        .map(lock => normalizePrefix({
            agentId    : lock.agentId,
            inFlight   : lock.inFlight,
            sessionId  : lock.sessionId,
            subtreePath: lock.subtreePath
        }));

    const stack = client.transactionService.stackOf({id: writerPair});

    const committed = stack.committed.map(tx => normalizePrefix({
        ops: tx.ops.map(op => ({
            forward          : op.forward,
            label            : op.label,
            originWriter     : op.originWriter,
            reverse          : op.reverse,
            targetSubtreePath: op.targetSubtreePath
        })),
        originWriter: tx.originWriter,
        status      : tx.status
    }));

    return {
        buttonText      : scenario.button.text,
        childIds        : scenario.container.items.map(item => item.id === createdId ? '<created-id>' : item.id.replace(prefix, '<prefix>')),
        committed,
        dispatchedEvents: normalizePrefix(scenario.dispatchedEvents),
        dockDocument    : normalizePrefix(scenario.dockHolder.dockZoneDocument),
        dragCalls       : normalizePrefix(scenario.dragCalls),
        heldLocks,
        redoCount       : stack.redo.length,
        results         : normalizePrefix(results)
    }
}

test.describe('Neo.ai.Client — off-socket dispatch refusal, regression, conflict and lifetime', () => {
    let client, originalMain, originalMainNamespace, originalWebSocket;

    test.beforeAll(async () => {
        originalWebSocket    = globalThis.WebSocket;
        originalMain         = Neo.Main;
        originalMainNamespace = Neo.main;
        globalThis.WebSocket = UnitTestWebSocket;

        Neo.currentWorker ??= {on: () => {}, un: () => {}};
        Neo.worker        ??= {};
        Neo.worker.App    ??= {};
        Neo.worker.App.aiClientPromise = Promise.resolve();
        Neo.worker.App.id              = '11111111-2222-3333-4444-555555555555';
        Neo.worker.App.isSharedWorker  = false;

        await import('../../../../src/ai/Client.mjs');
        client = Neo.ai.Client
    });

    test.afterAll(() => {
        globalThis.WebSocket = originalWebSocket;
        Neo.Main             = originalMain;
        Neo.main             = originalMainNamespace
    });

    test.beforeEach(() => {
        Neo.config.allowAiClientInTests = true;
        Neo.config.useAiClient          = true;

        client.writeGuard.heldLocks().forEach(lock => {
            client.writeGuard.releaseAgent({agentId: lock.agentId, sessionId: lock.sessionId})
        })
    });

    test('Refusal: an incomplete writer pair is refused before dispatch, and no write lands; control dispatches when the entry gate is bypassed', async () => {
        const scenario = createParityScenario(client, 'refusal');
        scenario.installEnvironmentStubs();

        let   dispatchCalls = 0;
        const originalSet   = client.services.instance.setInstanceProperties.bind(client.services.instance);

        client.services.instance.setInstanceProperties = (params, context) => {
            dispatchCalls++;
            return originalSet(params, context)
        };

        try {
            const incompletePairs = [
                undefined,
                null,
                {},
                {agentId: 'agent-only'},
                {sessionId: 'session-only'},
                {agentId: '', sessionId: 'sess-1'},
                {agentId: 'agent-1', sessionId: ''},
                {agentId: 99, sessionId: 'sess-1'},
                {agentId: 'agent-1', sessionId: null}
            ];

            for (const badPair of incompletePairs) {
                await expect(
                    client.handleTestRequest(
                        'set_instance_properties',
                        {id: scenario.button.id, properties: {text: 'Hijacked'}},
                        badPair
                    )
                ).rejects.toThrow('full {agentId, sessionId} writer pair')
            }

            expect(dispatchCalls).toBe(0);
            expect(scenario.button.text).toBe('Initial');
            expect(client.writeGuard.heldLocks()).toEqual([]);

            // Control: bypassing handleTestRequest's writer-pair gate via raw handleRequest allows an unattributed write
            const bypassed = await client.handleRequest(
                'set_instance_properties',
                {id: scenario.button.id, properties: {text: 'ControlMutated'}},
                null
            );

            expect(bypassed).toEqual({success: true});
            expect(dispatchCalls).toBe(1);
            expect(scenario.button.text).toBe('ControlMutated');
            expect(client.writeGuard.heldLocks()).toEqual([])
        } finally {
            client.services.instance.setInstanceProperties = originalSet;
            scenario.destroy()
        }
    });

    test('No socket reads: across reads, an enforced write and its undo in each of the six hosted services, a trapped socket records zero reads; control fires when the trap is bypassed', async () => {
        const scenario   = createParityScenario(client, 'no-socket'),
              writerPair = {agentId: 'agent-no-socket', sessionId: 'sess-no-socket'};

        scenario.installEnvironmentStubs();

        let socketReads = 0;

        const socketTrap = new Proxy({
            sendMessage: () => {},
            socket     : {readyState: WebSocket.OPEN}
        }, {
            get(target, prop, receiver) {
                socketReads++;
                return Reflect.get(target, prop, receiver)
            }
        });

        const originalDescriptor = Object.getOwnPropertyDescriptor(client, 'socket');

        Object.defineProperty(client, 'socket', {
            configurable: true,
            get() {
                socketReads++;
                return socketTrap
            }
        });

        try {
            // Confirm all six hosted services exist on the Client instance
            expect(Object.keys(client.services).sort()).toEqual([
                'component',
                'data',
                'dock',
                'instance',
                'interaction',
                'runtime'
            ]);

            // 1. ComponentService: reads + write + undo
            expect((await client.handleTestRequest('query_component', {
                rootId  : scenario.container.id,
                selector: {id: scenario.button.id}
            }, writerPair)).components).toHaveLength(1);
            expect((await client.handleTestRequest('get_component_tree', {
                lean  : true,
                rootId: scenario.container.id
            }, writerPair)).tree.id).toBe(scenario.container.id);
            expect((await client.handleTestRequest('query_vdom', {
                rootId  : scenario.container.id,
                selector: {id: scenario.button.id}
            }, writerPair)).vdom.id).toBe(scenario.button.id);
            expect(await client.handleTestRequest('highlight_component', {
                componentId: scenario.button.id,
                options    : {color: 'blue', duration: 10}
            }, writerPair)).toEqual({success: true});

            // 2. DataService: reads + write
            expect((await client.handleTestRequest('list_stores', {}, writerPair)).stores.some(s => s.id === scenario.store.id)).toBe(true);
            expect((await client.handleTestRequest('inspect_store', {storeId: scenario.store.id}, writerPair)).items).toHaveLength(1);
            expect((await client.handleTestRequest('get_record', {recordId: 'rec-1', storeId: scenario.store.id}, writerPair)).name).toBe('Alpha');
            expect((await client.handleTestRequest('inspect_state_provider', {providerId: scenario.provider.id}, writerPair)).data).toEqual({counter: 1});
            expect(await client.handleTestRequest('modify_state_provider', {
                data      : {counter: 2},
                providerId: scenario.provider.id
            }, writerPair)).toEqual({success: true});

            // 3. DockService: read + write
            expect((await client.handleTestRequest('get_dock_topology', {
                componentId: scenario.dockHolder.id
            }, writerPair)).document.activeNodeId).toBe('pane-a');
            expect((await client.handleTestRequest('execute_dock_operation', {
                componentId: scenario.dockHolder.id,
                descriptor : {itemId: 'pane-b', operation: 'setActiveItem'}
            }, writerPair)).applied).toBe(true);

            // 4. InstanceService: reads + enforced writes + undos
            expect((await client.handleTestRequest('get_instance_properties', {
                id        : scenario.button.id,
                properties: ['text']
            }, writerPair)).properties).toEqual({text: 'Initial'});
            expect((await client.handleTestRequest('find_instances', {
                selector: {id: scenario.button.id}
            }, writerPair)).instances).toHaveLength(1);
            expect(await client.handleTestRequest('set_instance_properties', {
                id        : scenario.button.id,
                properties: {text: 'UpdatedByInstanceService'}
            }, writerPair)).toEqual({success: true});
            expect(scenario.button.text).toBe('UpdatedByInstanceService');
            expect((await client.handleTestRequest('undo', {}, writerPair)).undone).toBe(true);
            expect(scenario.button.text).toBe('Initial');

            const created = await client.handleTestRequest('create_instance', {
                config  : {text: 'DynamicChild'},
                ntype   : 'component',
                parentId: scenario.container.id
            }, writerPair);
            expect(Neo.getComponent(created.id)).toBeTruthy();
            expect((await client.handleTestRequest('undo', {}, writerPair)).undone).toBe(true);
            expect(Neo.getComponent(created.id)).toBeNull();

            // 5. InteractionService: simulate_event + drive_drag
            expect(await client.handleTestRequest('simulate_event', {
                events: [{options: {}, targetId: scenario.button.id, type: 'click', windowId: '1'}]
            }, writerPair)).toBe(true);
            expect((await client.handleTestRequest('drive_drag', {
                destination: {deltaX: 20, deltaY: 10},
                durationMs : 160,
                source     : {targetId: scenario.button.id, windowId: '1'},
                steps      : 2
            }, writerPair)).success).toBe(true);

            // 6. RuntimeService: reads + writes
            expect((await client.handleTestRequest('check_namespace', {namespace: 'Neo.component.Base'}, writerPair)).exists).toBe(true);
            expect(await client.handleTestRequest('get_dom_event_summary', {}, writerPair)).toHaveProperty('totalEvents');
            expect(await client.handleTestRequest('get_drag_state', {}, writerPair)).toEqual(expect.any(Object));
            expect(await client.handleTestRequest('get_drag_trace', {}, writerPair)).toHaveProperty('count');
            expect(await client.handleTestRequest('get_window_info', {}, writerPair)).toHaveProperty('windows');
            expect(await client.handleTestRequest('set_route', {hash: '/test', windowId: '1'}, writerPair)).toEqual({
                hash  : '/test',
                status: 'ok'
            });

            // Zero socket reads across all six hosted services
            expect(socketReads).toBe(0);

            // Control: touching the socket path fires the trap immediately
            expect(client.isConnected).toBe(true);
            client.sendNotification('console_log', {message: 'control-probe'});
            expect(socketReads).toBeGreaterThanOrEqual(2)
        } finally {
            if (originalDescriptor) {
                Object.defineProperty(client, 'socket', originalDescriptor)
            } else {
                delete client.socket
            }
            client.handleAgentDisconnected(writerPair);
            scenario.destroy()
        }
    });

    test('Identical off-socket: the five write calls in the suite census produce identical result, state and transaction stack through an agent_message frame and through the test entry; control detects a divergent envelope', async () => {
        const
            writerPair = {agentId: 'agent-parity', sessionId: 'sess-parity'},
            sentFrames = [];

        const originalSocket = client.socket;
        client.socket = {
            sendMessage(frame) {
                sentFrames.push(frame)
            },
            socket: {readyState: WebSocket.OPEN}
        };

        const runFiveWrites = async (prefix, dispatchFn) => {
            const scenario = createParityScenario(client, prefix);
            scenario.installEnvironmentStubs();

            try {
                const setPropertiesResult = await dispatchFn('set_instance_properties', {
                    id        : scenario.button.id,
                    properties: {text: 'CensusUpdated'}
                });

                const executeDockResult = await dispatchFn('execute_dock_operation', {
                    componentId: scenario.dockHolder.id,
                    descriptor : {operation: 'resizeSplit', sizes: [0.3, 0.7]}
                });

                const createInstanceResult = await dispatchFn('create_instance', {
                    config  : {text: 'CensusChild'},
                    ntype   : 'component',
                    parentId: scenario.container.id
                });
                scenario.createdIds.push(createInstanceResult.id);

                const simulateEventResult = await dispatchFn('simulate_event', {
                    events: [{
                        options : {bubbles: true},
                        targetId: scenario.button.id,
                        type    : 'click',
                        windowId: '1'
                    }]
                });

                const driveDragResult = await dispatchFn('drive_drag', {
                    destination: {deltaX: 30, deltaY: 15},
                    durationMs : 160,
                    source     : {targetId: scenario.button.id, windowId: '1'},
                    steps      : 4
                });

                return snapshotParityOutcome({
                    client,
                    createdId: createInstanceResult.id,
                    prefix,
                    results  : {
                        createInstanceResult,
                        driveDragResult,
                        executeDockResult,
                        setPropertiesResult,
                        simulateEventResult
                    },
                    scenario,
                    writerPair
                })
            } finally {
                scenario.destroy()
            }
        };

        try {
            let rpcId = 0;

            const onSocketSnapshot = await runFiveWrites('on-socket', async (method, params) => {
                const id = ++rpcId;

                await client.onSocketMessage({
                    data: {
                        agentId  : writerPair.agentId,
                        message  : {id, jsonrpc: '2.0', method, params},
                        sessionId: writerPair.sessionId,
                        type     : 'agent_message'
                    }
                });

                const responseFrame = sentFrames.find(frame => frame.id === id);
                expect(responseFrame).toBeDefined();
                expect(responseFrame.error).toBeUndefined();
                return responseFrame.result
            });

            client.handleAgentDisconnected(writerPair);

            const nlApp = createDedicatedWorkerAppConnection({
                getLogs  : () => [],
                getWorker: () => ({
                    evaluate: async (fn, arg) => fn(arg)
                }),
                sessionId : '11111111-2222-3333-4444-555555555555',
                writerPair
            });

            const offSocketSnapshot = await runFiveWrites('off-socket', async (method, params) => {
                if (method === 'set_instance_properties') {
                    return nlApp.setProperties(params.id, params.properties)
                }
                if (method === 'execute_dock_operation') {
                    return nlApp.executeDockOperation(params.componentId, params.descriptor)
                }
                if (method === 'create_instance') {
                    return nlApp.createInstance(params)
                }
                if (method === 'simulate_event') {
                    return nlApp.simulateEvent(params.events)
                }
                if (method === 'drive_drag') {
                    return nlApp.driveDrag(params)
                }
                return client.handleTestRequest(method, params, writerPair)
            });

            expect(offSocketSnapshot).toEqual(onSocketSnapshot);
            expect(offSocketSnapshot.committed).toHaveLength(2);
            expect(offSocketSnapshot.heldLocks).toHaveLength(2);

            client.handleAgentDisconnected(writerPair);

            // Control: a bare un-enveloped frame (divergent envelope lacking {type: 'agent_message', agentId, sessionId})
            // produces an empty writer lock set and an empty transaction stack, which the comparison detects
            const controlSnapshot = await runFiveWrites('divergent-control', async (method, params) => {
                const id = ++rpcId;

                await client.onSocketMessage({
                    data: {id, jsonrpc: '2.0', method, params}
                });

                return sentFrames.find(frame => frame.id === id).result
            });

            expect(controlSnapshot.heldLocks).toEqual([]);
            expect(controlSnapshot.committed).toEqual([]);
            expect(controlSnapshot).not.toEqual(offSocketSnapshot)
        } finally {
            client.socket = originalSocket;
            client.handleAgentDisconnected(writerPair)
        }
    });

    test('Two-pair conflict: while pair A holds a subtree lock, pair B overlapping write is denied; control grants after pair A releases', async () => {
        const
            scenario = createParityScenario(client, 'conflict'),
            pairA    = {agentId: 'agent-a', sessionId: 'sess-a'},
            pairB    = {agentId: 'agent-b', sessionId: 'sess-b'};

        scenario.installEnvironmentStubs();

        try {
            // Pair A locks the container subtree
            const writeA = await client.handleTestRequest('set_instance_properties', {
                id        : scenario.container.id,
                properties: {cls: ['locked-by-a']}
            }, pairA);

            expect(writeA).toEqual({success: true});
            expect(client.writeGuard.heldLocks()).toEqual([
                expect.objectContaining({
                    agentId    : 'agent-a',
                    sessionId  : 'sess-a',
                    subtreePath: [scenario.container.id]
                })
            ]);

            // Pair B attempts an overlapping write on the descendant button inside container's locked subtree
            await expect(
                client.handleTestRequest('set_instance_properties', {
                    id        : scenario.button.id,
                    properties: {text: 'ContestedByB'}
                }, pairB)
            ).rejects.toThrow(`Write denied for ${scenario.button.id}: conflict (held by agent-a / sess-a)`);

            // Pair B also cannot attach a child into container's locked subtree
            await expect(
                client.handleTestRequest('create_instance', {
                    config  : {text: 'ContestedChild'},
                    ntype   : 'component',
                    parentId: scenario.container.id
                }, pairB)
            ).rejects.toThrow(`Write denied for ${scenario.container.id}: conflict (held by agent-a / sess-a)`);

            expect(scenario.button.text).toBe('Initial');
            expect(client.transactionService.stackOf({id: pairB}).committed).toEqual([]);

            // Control: once pair A disconnects, pair B's overlapping write is admitted
            client.handleAgentDisconnected(pairA);

            const writeB = await client.handleTestRequest('set_instance_properties', {
                id        : scenario.button.id,
                properties: {text: 'GrantedToB'}
            }, pairB);

            expect(writeB).toEqual({success: true});
            expect(scenario.button.text).toBe('GrantedToB')
        } finally {
            client.handleAgentDisconnected(pairA);
            client.handleAgentDisconnected(pairB);
            scenario.destroy()
        }
    });

    test('Lifetime: test A writes and throws; after fixture cleanup, test B fresh pair meets no stale conflict and inherits no undo stack; control conflicts when cleanup is skipped', async () => {
        const scenario = createParityScenario(client, 'lifetime');
        scenario.installEnvironmentStubs();

        const worker = {
            url: () => 'http://localhost:8080/src/worker/App.mjs',
            async evaluate(fn, arg) {
                return fn(arg)
            }
        };

        const makeFixtures = () => ({
            browser: {
                async newContext() {
                    return {async route() {}}
                }
            },
            context: {
                async route() {}
            },
            page: {
                on     : () => {},
                url    : () => 'about:blank',
                workers: () => [worker]
            }
        });

        let pairA = null,
            pairB = null;

        try {
            // Test A writes through the adapter and throws mid-test
            await expect(
                runDedicatedWorkerNeuralLink(makeFixtures(), async nl => {
                    pairA = nl.writerPair;
                    const nlApp = await nl.connectToApp(appName);

                    await nlApp.setProperties(scenario.button.id, {text: 'WrittenByTestA'});
                    expect(scenario.button.text).toBe('WrittenByTestA');
                    expect(client.writeGuard.heldLocks()).toHaveLength(1);
                    expect(client.transactionService.stackOf({id: pairA}).committed).toHaveLength(1);

                    throw new Error('test A aborted after write')
                })
            ).rejects.toThrow('test A aborted after write');

            // Fixture finally block released pair A's lock and swept its transaction stack
            expect(client.writeGuard.heldLocks()).toEqual([]);
            expect(client.transactionService.stackOf({id: pairA})).toEqual({
                committed: [],
                open     : null,
                redo     : []
            });

            // Test B runs with a fresh writer pair: inherits no undo stack and meets no stale conflict
            await runDedicatedWorkerNeuralLink(makeFixtures(), async nl => {
                pairB = nl.writerPair;
                expect(pairB.agentId).not.toBe(pairA.agentId);
                expect(pairB.sessionId).not.toBe(pairA.sessionId);

                const nlApp = await nl.connectToApp(appName);

                const undoResult = await nlApp.undo();
                expect(undoResult).toEqual({reason: 'nothing-to-undo', undone: false});
                expect(scenario.button.text).toBe('WrittenByTestA');

                const writeResult = await nlApp.setProperties(scenario.button.id, {text: 'WrittenByTestB'});
                expect(writeResult).toEqual({success: true});
                expect(scenario.button.text).toBe('WrittenByTestB')
            });

            // Control: without handleAgentDisconnected cleanup, a throwing writer leaves a stale lock and undo stack
            const leakedPair = {agentId: 'agent-leaked', sessionId: 'sess-leaked'},
                  nextPair   = {agentId: 'agent-next',   sessionId: 'sess-next'};

            await client.handleTestRequest('set_instance_properties', {
                id        : scenario.button.id,
                properties: {text: 'LeakedWrite'}
            }, leakedPair);

            expect(client.transactionService.stackOf({id: leakedPair}).committed).toHaveLength(1);

            await expect(
                client.handleTestRequest('set_instance_properties', {
                    id        : scenario.button.id,
                    properties: {text: 'BlockedByLeakedLock'}
                }, nextPair)
            ).rejects.toThrow(`Write denied for ${scenario.button.id}: conflict (held by agent-leaked / sess-leaked)`);

            client.handleAgentDisconnected(leakedPair)
        } finally {
            pairA && client.handleAgentDisconnected(pairA);
            pairB && client.handleAgentDisconnected(pairB);
            scenario.destroy()
        }
    });

    test('No denylist: focus_window on an unknown id refuses off-socket exactly as on-socket with no native focus call; control invokes windowNativeFocus for a known routable window', async () => {
        const
            writerPair       = {agentId: 'agent-focus', sessionId: 'sess-focus'},
            nativeFocusCalls = [],
            sentFrames       = [],
            originalSocket   = client.socket;

        Neo.Main = {
            ...Neo.Main,
            async windowNativeFocus(payload) {
                nativeFocusCalls.push(payload);
                return true
            }
        };

        client.socket = {
            sendMessage(frame) {
                sentFrames.push(frame)
            },
            socket: {readyState: WebSocket.OPEN}
        };

        try {
            const offSocketRefusal = await client.handleTestRequest(
                'focus_window',
                {windowId: 'unknown-window-id'},
                writerPair
            );

            await client.onSocketMessage({
                data: {
                    agentId  : writerPair.agentId,
                    message  : {id: 77, jsonrpc: '2.0', method: 'focus_window', params: {windowId: 'unknown-window-id'}},
                    sessionId: writerPair.sessionId,
                    type     : 'agent_message'
                }
            });

            const onSocketRefusal = sentFrames.find(frame => frame.id === 77)?.result;

            expect(offSocketRefusal).toEqual({
                error  : "Unknown windowId 'unknown-window-id'.",
                success: false
            });
            expect(offSocketRefusal).toEqual(onSocketRefusal);
            expect(nativeFocusCalls).toEqual([]);

            // Control: registering a known window with a focus-capable nativeRoute dispatches windowNativeFocus off-socket
            WindowManager.register({
                appName,
                capabilities: {close: false, focus: true, position: false, resize: false},
                id          : 'known-popup-win',
                nativeRoute : {
                    capabilities   : {close: false, focus: true, position: false, resize: false},
                    nativeHandleKey: 'popup-handle-1',
                    ownerWindowId  : 'owner-win-1',
                    targetWindowId : 'known-popup-win'
                }
            });

            const controlFocused = await client.handleTestRequest(
                'focus_window',
                {windowId: 'known-popup-win'},
                writerPair
            );

            expect(controlFocused).toEqual({
                success : true,
                windowId: 'known-popup-win'
            });
            expect(nativeFocusCalls).toEqual([{
                nativeHandleKey: 'popup-handle-1',
                targetWindowId : 'known-popup-win',
                windowId       : 'owner-win-1'
            }])
        } finally {
            WindowManager.unregister('known-popup-win');
            client.socket = originalSocket
        }
    })
});
