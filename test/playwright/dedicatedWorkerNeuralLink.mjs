import {expect} from '@playwright/test';
import crypto   from 'node:crypto';
import process  from 'node:process';

const WORKER_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Maps each `nlApp` tool name to the Brain service that owns it on the Bridge transport.
 * @type {Readonly<Record<String, String>>}
 */
export const BRIDGE_TOOL_SERVICE_MAP = Object.freeze({
    // ComponentService
    create_component             : 'NeuralLink_ComponentService',
    get_component_tree           : 'NeuralLink_ComponentService',
    get_computed_styles          : 'NeuralLink_ComponentService',
    get_dom_rect                 : 'NeuralLink_ComponentService',
    inspect_component_render_tree: 'NeuralLink_ComponentService',
    query_component              : 'NeuralLink_ComponentService',
    query_vdom                   : 'NeuralLink_ComponentService',
    remove_component             : 'NeuralLink_ComponentService',

    // ConnectionService
    get_console_logs: 'NeuralLink_ConnectionService',

    // DataService
    get_record            : 'NeuralLink_DataService',
    inspect_state_provider: 'NeuralLink_DataService',
    inspect_store         : 'NeuralLink_DataService',
    list_stores           : 'NeuralLink_DataService',
    modify_state_provider : 'NeuralLink_DataService',

    // DockService
    execute_dock_operation: 'NeuralLink_DockService',
    get_dock_topology     : 'NeuralLink_DockService',

    // InstanceService
    call_method            : 'NeuralLink_InstanceService',
    create_instance        : 'NeuralLink_InstanceService',
    find_instances         : 'NeuralLink_InstanceService',
    get_instance_properties: 'NeuralLink_InstanceService',
    redo                   : 'NeuralLink_InstanceService',
    replay_transaction     : 'NeuralLink_InstanceService',
    save_transaction       : 'NeuralLink_InstanceService',
    set_instance_properties: 'NeuralLink_InstanceService',
    undo                   : 'NeuralLink_InstanceService',

    // InteractionService
    get_drag_state              : 'NeuralLink_InteractionService',
    get_drag_trace              : 'NeuralLink_InteractionService',
    highlight_component         : 'NeuralLink_InteractionService',
    observe_motion              : 'NeuralLink_InteractionService',
    simulate_event              : 'NeuralLink_InteractionService',
    verify_component_consistency: 'NeuralLink_InteractionService',

    // RuntimeService
    check_namespace        : 'NeuralLink_RuntimeService',
    close_window           : 'NeuralLink_RuntimeService',
    focus_window           : 'NeuralLink_RuntimeService',
    get_dom_event_listeners: 'NeuralLink_RuntimeService',
    get_dom_event_summary  : 'NeuralLink_RuntimeService',
    get_method_source      : 'NeuralLink_RuntimeService',
    get_namespace_tree     : 'NeuralLink_RuntimeService',
    get_route_history      : 'NeuralLink_RuntimeService',
    get_window_topology    : 'NeuralLink_RuntimeService',
    get_worker_topology    : 'NeuralLink_RuntimeService',
    inspect_class          : 'NeuralLink_RuntimeService',
    manage_neo_config      : 'NeuralLink_RuntimeService',
    open_component_window  : 'NeuralLink_RuntimeService',
    patch_code             : 'NeuralLink_RuntimeService',
    position_window        : 'NeuralLink_RuntimeService',
    reload_page            : 'NeuralLink_RuntimeService',
    set_route              : 'NeuralLink_RuntimeService'
});

const snakeToCamel = tool => tool.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());

let writerCounter = 0;

/**
 * @summary Whether a Playwright `Worker` is a Neo dedicated App Worker.
 * @param {Object|null} worker A Playwright `Worker`
 * @returns {Boolean}
 */
export function isDedicatedAppWorker(worker) {
    const url = worker?.url?.() || '';

    return url.includes('/worker/App.mjs')
}

/**
 * @summary Mints a fresh `{agentId, sessionId}` writer pair in `parseAgentEnvelope`'s shape for one test.
 * @param {Number} [sequence=++writerCounter]
 * @returns {{agentId: String, sessionId: String}}
 */
export function mintTestWriterPair(sequence = ++writerCounter) {
    return {
        agentId  : `playwright-test-agent-${process.pid}-${sequence}`,
        sessionId: `playwright-test-session-${crypto.randomUUID()}`
    }
}

/**
 * @summary Ends a test writer pair's lock and transaction lifetime on a dedicated App Worker through
 * `Neo.ai.Client#handleAgentDisconnected`. Safe to call when the page or worker has already closed.
 * @param {Object|null} worker     A Playwright `Worker`
 * @param {Object}      writerPair `{agentId, sessionId}`
 * @returns {Promise<{released: Number, swept: Boolean}|null>}
 */
export async function disconnectTestWriter(worker, writerPair) {
    if (!worker || !writerPair) {
        return null
    }

    return worker.evaluate(pair => {
        return globalThis.Neo?.ai?.Client?.handleAgentDisconnected?.(pair) || null
    }, writerPair).catch(() => null)
}

/**
 * @summary Builds the shared `nlApp` SDK surface over a transport `call(tool, params)` function.
 * Both the Bridge fixture path (`createBridgeAppConnection`) and the dedicated-worker adapter
 * (`createDedicatedWorkerAppConnection`) use this single definition so every method, parameter shape,
 * and response pick stays identical across transports.
 * @param {Object}   options
 * @param {Function} options.call         `async (tool, params) => response`
 * @param {String}   options.sessionId    Session / App Worker id
 * @param {Object}   [options.writerPair] Optional `{agentId, sessionId}` writer pair for the dedicated-worker path
 * @returns {Object}
 */
export function buildAppConnectionSurface({call, sessionId, writerPair}) {
    return {
        sessionId,
        ...(writerPair ? {writerPair} : {}),

        // --- Metaprogramming ---

        async inspectClass(className, detail = 'standard') {
            return call('inspect_class', {className, detail})
        },

        async getMethodSource(className, methodName) {
            return call('get_method_source', {className, methodName})
        },

        async patchCode(className, methodName, source) {
            return call('patch_code', {className, methodName, source})
        },

        // --- Instance Methods ---

        async getComponent(id, properties) {
            const propsToFetch = properties || ['ntype', 'windowId', 'cls', 'className', 'vnode'],
                  response     = await call('get_instance_properties', {id, properties: propsToFetch});

            return response.properties
        },

        async callMethod(id, method, args = []) {
            const response = await call('call_method', {id, method, args});

            return response.result
        },

        async findInstances(selector, properties) {
            const response = await call('find_instances', {selector, returnProperties: properties});

            return response.instances || response
        },

        async setProperties(id, properties) {
            return call('set_instance_properties', {id, properties})
        },

        async createInstance(opts = {}) {
            return call('create_instance', opts)
        },

        async undo(opts = {}) {
            return call('undo', opts)
        },

        async redo(opts = {}) {
            return call('redo', opts)
        },

        async saveTransaction(opts = {}) {
            return call('save_transaction', opts)
        },

        async replayTransaction(opts = {}) {
            return call('replay_transaction', opts)
        },

        // --- Component & VDOM Methods ---

        async queryComponent(selector, properties) {
            const response = await call('query_component', {selector, returnProperties: properties});

            return response.components || response
        },

        async queryVdom(selector, rootId) {
            const response = await call('query_vdom', {selector, rootId});

            return response.nodes || response
        },

        async getDomRect(componentIds) {
            const response = await call('get_dom_rect', {
                componentIds: Array.isArray(componentIds) ? componentIds : [componentIds]
            });

            return response.rects || response
        },

        async getComputedStyles(componentId, variables) {
            const response = await call('get_computed_styles', {componentId, variables});

            return response.styles || response
        },

        async inspectComponentRenderTree(type = 'vdom', depth = -1, rootId) {
            return call('inspect_component_render_tree', {type, depth, rootId})
        },

        async highlightComponent(componentId, options) {
            return call('highlight_component', {componentId, options})
        },

        async getComponentTree(rootId, depth = -1, lean = false) {
            return call('get_component_tree', {rootId, depth, lean})
        },

        async createComponent(parentId, config) {
            return call('create_component', {parentId, config})
        },

        async removeComponent(componentId) {
            return call('remove_component', {componentId})
        },

        // --- Dock Methods ---

        async getDockTopology(componentId) {
            return call('get_dock_topology', {componentId})
        },

        async executeDockOperation(componentId, descriptor) {
            return call('execute_dock_operation', {componentId, descriptor})
        },

        // --- Interaction Methods ---

        async driveDrag(request) {
            return call('drive_drag', request)
        },

        async simulateEvent(events) {
            return call('simulate_event', {events: Array.isArray(events) ? events : [events]})
        },

        async getDragTrace(clear = false) {
            return call('get_drag_trace', {clear})
        },

        async observeMotion(componentIds, durationMs, intervalMs) {
            const opts = Array.isArray(componentIds) ?
                {componentIds, durationMs, intervalMs} :
                {...(componentIds || {})};

            return call('observe_motion', opts)
        },

        async verifyComponentConsistency(componentId) {
            return call('verify_component_consistency', {componentId})
        },

        // --- Data & State Methods ---

        async getStore(storeId) {
            return call('inspect_store', {storeId})
        },

        async listStores() {
            return call('list_stores', {})
        },

        async inspectStore(storeId, limit = 50, offset = 0) {
            return call('inspect_store', {storeId, limit, offset})
        },

        async getRecord(recordId, storeId) {
            return call('get_record', {recordId, storeId})
        },

        async inspectStateProvider(providerId) {
            return call('inspect_state_provider', {providerId})
        },

        async modifyStateProvider(providerId, data) {
            return call('modify_state_provider', {providerId, data})
        },

        // --- Runtime & Global Methods ---

        async getDomEventListeners(componentId) {
            return call('get_dom_event_listeners', {componentId})
        },

        async getRouteHistory(windowId) {
            return call('get_route_history', {windowId})
        },

        async setRoute(hash, windowId) {
            return call('set_route', {hash, windowId})
        },

        async reloadPage() {
            return call('reload_page', {})
        },

        async getConsoleLogs(type, filter) {
            return call('get_console_logs', {type, filter})
        },

        async checkNamespace(namespace) {
            return call('check_namespace', {namespace})
        },

        async getNamespaceTree(root = 'Neo') {
            return call('get_namespace_tree', {root})
        },

        async getDomEventSummary() {
            return call('get_dom_event_summary', {})
        },

        async getDragState() {
            return call('get_drag_state', {})
        },

        async manageNeoConfig(action, config, windowId) {
            return call('manage_neo_config', {action, config, windowId})
        },

        async openComponentWindow(options = {}) {
            return call('open_component_window', options)
        },

        async closeWindow(windowId) {
            return call('close_window', {windowId})
        },

        async positionWindow(options = {}) {
            return call('position_window', options)
        },

        async focusWindow(windowId) {
            return call('focus_window', {windowId})
        },

        // --- Topology ---

        async getWorkerTopology() {
            return call('get_worker_topology', {})
        },

        async getWindowTopology() {
            return call('get_window_topology', {})
        }
    }
}

/**
 * @summary Creates the `nlApp` SDK surface backed by the Brain's `NeuralLink_*Service` modules over the Bridge.
 * @param {Object} services  Loaded `NeuralLink_*Service` map
 * @param {String} sessionId The connected App Worker session id
 * @returns {Object}
 */
export function createBridgeAppConnection(services, sessionId) {
    const call = async (tool, params = {}) => {
        if (tool === 'drive_drag') {
            return services.NeuralLink_ConnectionService.call(sessionId, 'drive_drag', params)
        }

        if (tool === 'get_worker_topology' || tool === 'get_window_topology') {
            return services.NeuralLink_RuntimeService[snakeToCamel(tool)]()
        }

        const serviceKey = BRIDGE_TOOL_SERVICE_MAP[tool],
              methodName = snakeToCamel(tool),
              service    = serviceKey && services[serviceKey];

        if (!service || typeof service[methodName] !== 'function') {
            throw new Error(`Unknown Neural Link Bridge tool: '${tool}'`)
        }

        return service[methodName]({sessionId, ...params})
    };

    return buildAppConnectionSurface({call, sessionId})
}

/**
 * @summary Creates the `nlApp` SDK surface backed by `Neo.ai.Client#handleTestRequest` on a captured
 * dedicated App Worker.
 * @param {Object}   options
 * @param {Function} options.getLogs    Returns captured console log entries for the dedicated App Worker
 * @param {Function} options.getWorker  Returns the current dedicated App Worker for the page
 * @param {String}   options.sessionId  The App Worker id (`Neo.worker.App.id`)
 * @param {Object}   options.writerPair `{agentId, sessionId}` minted for this test
 * @returns {Object}
 */
export function createDedicatedWorkerAppConnection({getLogs = () => [], getWorker, sessionId, writerPair}) {
    const invokeWorker = async (method, params = {}) => {
        const worker = getWorker();

        if (!worker) {
            throw new Error(`Dedicated App Worker is unavailable for Neural Link test request '${method}'.`)
        }

        return worker.evaluate(async ({context, method, params}) => {
            const appWorker = globalThis.Neo?.worker?.App;

            if (appWorker?.aiClientPromise) {
                await appWorker.aiClientPromise
            }

            const client = globalThis.Neo?.ai?.Client;

            if (!client) {
                throw new Error('Neo.ai.Client is not initialized in the dedicated App Worker')
            }

            return client.handleTestRequest(method, params, context)
        }, {context: writerPair, method, params})
    };

    const call = async (tool, params = {}) => {
        if (tool === 'get_console_logs') {
            const {filter, type} = params;
            let   logs           = [...getLogs()];

            if (type) {
                logs = logs.filter(log => log.type === type)
            }

            if (filter) {
                const lowerFilter = String(filter).toLowerCase();
                logs = logs.filter(log => log.message && log.message.toLowerCase().includes(lowerFilter))
            }

            return logs
        }

        if (tool === 'get_worker_topology') {
            const worker = getWorker();

            if (!worker) return [];

            const meta = await worker.evaluate(() => {
                const appWorker = globalThis.Neo?.worker?.App,
                      firstApp  = Object.values(globalThis.Neo?.apps || {})[0];

                return {
                    appName       : firstApp?.name || globalThis.Neo?.config?.appName || 'Unknown App',
                    appWorkerId   : appWorker?.id || null,
                    environment   : globalThis.Neo?.config?.environment || null,
                    isSharedWorker: Boolean(appWorker?.isSharedWorker),
                    sessionId     : appWorker?.id || null
                }
            }).catch(() => null);

            return meta?.appWorkerId ? [meta] : []
        }

        if (tool === 'get_window_topology') {
            const worker = getWorker();

            if (!worker) return [];

            return worker.evaluate(() => {
                const appWorkerId = globalThis.Neo?.worker?.App?.id || null,
                      windowMap   = new Map();

                (globalThis.Neo?.manager?.Window?.items || []).forEach(win => {
                    windowMap.set(String(win.id), {
                        appName     : win.appName || globalThis.Neo?.config?.appName || 'Unknown App',
                        appWorkerId,
                        capabilities: win.capabilities,
                        chrome      : win.chrome,
                        innerRect   : win.innerRect,
                        outerRect   : win.outerRect,
                        sessionId   : appWorkerId,
                        windowId    : win.id
                    })
                });

                Object.entries(globalThis.Neo?.apps || {}).forEach(([windowId, app]) => {
                    if (!windowMap.has(String(windowId))) {
                        windowMap.set(String(windowId), {
                            appName  : app?.name || globalThis.Neo?.config?.appName || 'Unknown App',
                            appWorkerId,
                            sessionId: appWorkerId,
                            windowId
                        })
                    }
                });

                return Array.from(windowMap.values())
            }).catch(() => [])
        }

        if (tool === 'inspect_component_render_tree') {
            const {depth = -1, rootId, type = 'vdom'} = params;
            let rpcMethod;

            switch (type) {
                case 'vdom':
                    rpcMethod = 'get_vdom_tree';
                    break;
                case 'vnode':
                    rpcMethod = 'get_vnode_tree';
                    break;
                case 'both':
                    rpcMethod = 'get_vdom_vnode';
                    break;
                default:
                    throw new Error(`Invalid type: ${type}`)
            }

            return invokeWorker(rpcMethod, {depth, rootId})
        }

        if (tool === 'create_component') {
            const {config, parentId} = params;

            if (!parentId) {
                throw new Error('create_component: `parentId` (the target container id) is required.')
            }
            if (!config || typeof config !== 'object' || Array.isArray(config)) {
                throw new Error('create_component: `config` must be a component configuration object.')
            }
            if (config.module && typeof config.module !== 'function') {
                throw new Error(
                    'create_component: `module` must be a class reference, which cannot cross the Neural Link wire — ' +
                    'declare `ntype` (e.g. "button") or `className` (e.g. "Neo.button.Base") instead.'
                )
            }
            if (!config.module && !config.ntype && !config.className) {
                throw new Error('create_component: `config` must declare a `module`, `ntype`, or `className` to instantiate.')
            }

            return invokeWorker('call_method', {id: parentId, method: 'add', args: [config], undoKind: 'create_component'})
        }

        if (tool === 'remove_component') {
            const {componentId} = params;

            if (!componentId) {
                throw new Error('remove_component: `componentId` (the component to destroy) is required.')
            }

            return invokeWorker('call_method', {id: componentId, method: 'destroy', args: [true], undoKind: 'remove_component'})
        }

        if (tool === 'manage_neo_config') {
            const {action, config, windowId} = params;

            if (action === 'get') {
                return invokeWorker('get_neo_config', {windowId})
            } else if (action === 'set') {
                return invokeWorker('set_neo_config', {config})
            }

            throw new Error(`Invalid action: ${action}`)
        }

        return invokeWorker(tool, params)
    };

    return buildAppConnectionSurface({call, sessionId, writerPair})
}

/**
 * @summary Runs the `neuralLink` fixture against the page's own dedicated App Worker when no Brain checkout
 * (`NEO_AGENTOS_RUNTIME_ROOT`) is configured.
 *
 * Routes `neo-config.json` with `allowAiClientInTests: true` so the App Worker boots the AI service registry
 * without opening a WebSocket, captures the page's dedicated App Worker directly (never searching by app name),
 * mints a fresh `{agentId, sessionId}` writer pair for the test, and releases/sweeps that pair via
 * `Neo.ai.Client#handleAgentDisconnected` in `finally` even when the test throws.
 *
 * @param {Object}   fixtures
 * @param {Object}   fixtures.browser
 * @param {Object}   fixtures.context
 * @param {Object}   fixtures.page
 * @param {Function} use
 * @param {Object}   [options]
 * @param {Function} [options.assertUnnavigated]
 * @returns {Promise<void>}
 */
export async function runDedicatedWorkerNeuralLink({browser, context, page}, use, {assertUnnavigated} = {}) {
    const logs        = [],
          writerPair  = mintTestWriterPair(),
          seenWorkers = new Set();
    let appWorker = page.workers?.()?.find?.(isDedicatedAppWorker) || null;

    if (appWorker) {
        seenWorkers.add(appWorker)
    }

    page.on?.('worker', worker => {
        if (isDedicatedAppWorker(worker)) {
            appWorker = worker;
            seenWorkers.add(worker)
        }
    });

    page.on?.('console', message => {
        const worker = message.worker?.();

        if (worker && isDedicatedAppWorker(worker)) {
            logs.push({
                message  : message.text?.() || '',
                timestamp: Date.now(),
                type     : message.type?.() || 'log'
            });

            if (logs.length > 1000) {
                logs.shift()
            }
        }
    });

    const routeConfig = (target, mutate = config => config, url = '**/neo-config.json*') => target.route(url, async route => {
        const response = await route.fetch();

        if (!response.ok()) {
            return route.fulfill({response})
        }

        await route.fulfill({response, json: {...mutate(await response.json()), allowAiClientInTests: true}})
    });

    await routeConfig(context);
    assertUnnavigated?.(page);

    const nl = {
        bridgePort: null,
        writerPair,

        async newContext(options) {
            const created = await browser.newContext(options);

            await routeConfig(created);

            return created
        },

        routeConfig,

        /**
         * @summary Binds to the page's captured dedicated App Worker and returns an `nlApp` SDK wrapper.
         * Never looks up a session by app name: the captured `Worker` handle on `page` is addressed directly.
         * @param {String} [target]                        The app's name (used in failure diagnostics) or an expected worker id
         * @param {Object} [options]
         * @param {Number} [options.identityTimeout=30000] Ms to wait for the dedicated App Worker and its AI registry
         * @returns {Promise<Object>}
         */
        async connectToApp(target, {identityTimeout = 30000} = {}) {
            let capturedWorker = null,
                workerId       = null;

            await expect.poll(async () => {
                const candidate = appWorker || page.workers().find(isDedicatedAppWorker) || null;

                if (!candidate) {
                    return false
                }

                const readyId = await candidate.evaluate(async () => {
                    const worker = globalThis.Neo?.worker?.App;

                    if (!worker?.id) {
                        return null
                    }

                    if (worker.aiClientPromise) {
                        await worker.aiClientPromise
                    }

                    if (!globalThis.Neo?.ai?.Client) {
                        return null
                    }

                    const apps = globalThis.Neo?.apps;

                    if (!apps || Object.keys(apps).length === 0) {
                        return null
                    }

                    return worker.id
                }).catch(() => null);

                if (typeof readyId === 'string' && readyId.length > 0) {
                    if (WORKER_ID.test(target) && readyId !== target) {
                        return false
                    }

                    appWorker      = candidate;
                    capturedWorker = candidate;
                    workerId       = readyId;
                    seenWorkers.add(candidate);
                    return true
                }

                return false
            }, {timeout: identityTimeout}).toBe(true).catch(() => {
                capturedWorker = null;
                workerId       = null
            });

            if (!capturedWorker || !workerId) {
                throw new Error(
                    `neuralLink.connectToApp('${target}'): the page's dedicated App Worker did not initialize ` +
                    `Neo.ai.Client within ${identityTimeout} ms.`
                )
            }

            return createDedicatedWorkerAppConnection({
                getLogs  : () => logs,
                getWorker: () => appWorker || capturedWorker,
                sessionId: workerId,
                writerPair
            })
        }
    };

    try {
        await use(nl)
    } finally {
        for (const worker of seenWorkers) {
            await disconnectTestWriter(worker, writerPair)
        }
    }
}
