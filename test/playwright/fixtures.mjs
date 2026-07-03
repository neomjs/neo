import { test as base, expect } from '@playwright/test';
import * as RmaHelpers from './util/RmaHelpers.mjs';
import {
    NeuralLink_ConnectionService,
    NeuralLink_InstanceService,
    NeuralLink_ComponentService,
    NeuralLink_DataService,
    NeuralLink_RuntimeService,
    NeuralLink_InteractionService
} from '../../ai/services.mjs';
import aiConfig from '../../ai/mcp/server/neural-link/config.mjs';

export const test = base.extend({
    /**
     * @warning The `neo` fixture uses legacy Remote Method Access (RMA).
     * It is retained for environments where the Neural Link is unavailable
     * (e.g., Neo.mjs wrapped inside a React application).
     * For native Neo.mjs E2E testing, you should exclusively use the `neuralLink`
     * fixture instead. See: learn/guides/testing/WhiteboxE2E.md
     */
    neo: async ({ page }, use) => {
        // Ensure RMA helpers are registered in the browser context
        await RmaHelpers.registerRmaHelpers(page);

        const neo = {
            page,

            async createComponent(config) {
                return RmaHelpers.createComponent(page, config);
            },

            async destroyComponent(id) {
                return RmaHelpers.destroyComponent(page, id);
            },

            async loadModule(path) {
                return RmaHelpers.loadModule(page, path);
            },

            async setConfig(id, config) {
                return RmaHelpers.setComponentConfig(page, id, config);
            },

            async moveComponent(opts) {
                return RmaHelpers.moveComponent(page, opts);
            },

            async getConfig(id, keyOrKeys) {
                return RmaHelpers.getComponentConfig(page, id, keyOrKeys);
            },

            async getVdom(id) {
                return RmaHelpers.getComponentConfig(page, id, 'vdom');
            },

            /**
             * Waits for the Neo framework to be fully initialized.
             */
            async waitForReady() {
                await page.waitForFunction(() => window.Neo && window.Neo.main && window.Neo.worker.Manager.workers.app);
            },

            /**
             * Checks if a Fragment's start and end anchors exist in the DOM.
             * @param {String} id Fragment ID
             * @returns {Promise<{start: boolean, end: boolean}>}
             */
            async getFragmentAnchors(id) {
                return page.evaluate(fragmentId => {
                    const start = document.evaluate(`//comment()[contains(., ' ${fragmentId}-start ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    const end = document.evaluate(`//comment()[contains(., ' ${fragmentId}-end ')]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    return { start: !!start, end: !!end };
                }, id);
            }
        };

        await use(neo);
    },

    neuralLink: async ({ page }, use) => {
        // 1. Ensure Bridge connects
        await NeuralLink_ConnectionService.manageConnection({action: 'start'});

        // 2. Define the Neural Link Fixture object
        const nl = {
            /**
             * The live Neural Link Bridge port the fixture's `ConnectionService` connected (or spawned) on —
             * the canonical `aiConfig.port`, NOT the hardcoded `:8081` literal the WriteGuard e2es used to
             * carry. Raw-agent writers (`openRawAgent`) target the SAME Bridge the fixture uses via this.
             * @member {Number} bridgePort
             */
            bridgePort: aiConfig.port,

            /**
             * Waits for the Test's specific App Worker to connect to the Bridge and returns an SDK wrapper.
             *
             * Resolution order: the page's OWN App Worker id (identity-bind via the `getWorkerId`
             * remote — exact-match in `waitForSession`), falling back to the explicit / inferred
             * appName. The identity path is what makes same-name topologies safe: appName resolution
             * binds to the OLDEST matching session, so a persistent dev tab of the same app would
             * silently receive the test's worker queries while `page.mouse` drives the test page.
             * @param {String} [appName] Optional explicitly named app to wait for (fallback only).
             */
            async connectToApp(appName) {
                let inferredAppName = null,
                    workerId        = null;

                try {
                    // Give the page a moment to initialize Neo
                    await page.waitForFunction(() => window.Neo && window.Neo.config, { timeout: 2000 }).catch(() => {});

                    // Identity-bind: ask the page's own App Worker for its id. The remote namespace
                    // (Neo.worker.App.getWorkerId on the main thread) materializes asynchronously
                    // after worker construction, so a single immediate evaluate RACES it on freshly
                    // navigated pages — and a null silently degrades to the appName fallback, which
                    // binds the OLDEST same-named session. Poll with a bounded wait instead; only
                    // genuinely old builds (no getWorkerId remote) fall through to appName.
                    workerId = await page.waitForFunction(async () => {
                        const appWorker = window.Neo?.worker?.App;
                        if (!appWorker?.getWorkerId) return null; // remote not registered yet -> keep polling
                        try {
                            return await appWorker.getWorkerId()
                        } catch {
                            return null
                        }
                    }, null, { timeout: 5000 }).then(handle => handle.jsonValue()).catch(() => null);

                    inferredAppName = await page.evaluate(() => {
                        const path = window.Neo?.config?.appPath;
                        return path ? path.split('/').slice(-2, -1)[0] : null;
                    });
                } catch (e) {
                    // Ignore, page might not exist or be blank
                }

                // Prefer the page's own worker id (exact-id match); fall back to explicit / inferred appName.
                // A top-level app's getWorkerId() resolves to a string, but a childapp that joined an existing
                // SharedWorker gets the raw remote-reply envelope ({action:'reply', data, ...}) instead — not a
                // usable session-id match — so treat a non-string workerId as absent and use the appName fallback.
                const targetId = (typeof workerId === 'string' && workerId ? workerId : null) || appName || inferredAppName;
                if (!targetId) {
                    throw new Error('neuralLink.connectToApp requires either an initialized Neo environment or an explicit appName to wait for.');
                }

                const sessionId = await NeuralLink_ConnectionService.waitForSession(targetId, 30000);

                return {
                    sessionId,

                    // --- Metaprogramming ---

                    /**
                     * Inspects a Neo.mjs class to retrieve its Rich Blueprint.
                     * @param {String} className
                     * @param {String} [detail='standard'] 'compact' or 'standard'
                     * @returns {Promise<Object>}
                     */
                    async inspectClass(className, detail = 'standard') {
                        return NeuralLink_InstanceService.inspectClass({ sessionId, className, detail });
                    },

                    /**
                     * Retrieves the source code of a class method.
                     * @param {String} className
                     * @param {String} methodName
                     * @returns {Promise<Object>}
                     */
                    async getMethodSource(className, methodName) {
                        return NeuralLink_InstanceService.getMethodSource({ sessionId, className, methodName });
                    },

                    /**
                     * Replaces a method implementation on a class prototype at runtime.
                     * @warning Requires `Neo.config.enableHotPatching = true`. Security concerns apply.
                     * @param {String} className
                     * @param {String} methodName
                     * @param {String} source
                     * @returns {Promise<Object>}
                     */
                    async patchCode(className, methodName, source) {
                        return NeuralLink_InstanceService.patchCode({ sessionId, className, methodName, source });
                    },

                    // --- Instance Methods ---

                    /**
                     * Retrieves properties from a specific instance by its ID.
                     * @param {String} id The instance ID
                     * @param {String[]} [properties] Optional list of properties to fetch
                     * @returns {Promise<Object>}
                     */
                    async getComponent(id, properties) {
                        const propsToFetch = properties || ['ntype', 'windowId', 'cls', 'className', 'vnode'];
                        const response = await NeuralLink_InstanceService.getInstanceProperties({ sessionId, id, properties: propsToFetch });
                        return response.properties;
                    },

                    /**
                     * Calls a method on a specific instance.
                     * @param {String} id The instance ID
                     * @param {String} method The method name
                     * @param {Array} [args=[]] Arguments to pass
                     * @returns {Promise<*>}
                     */
                    async callMethod(id, method, args = []) {
                        const response = await NeuralLink_InstanceService.callMethod({ sessionId, id, method, args });
                        return response.result;
                    },

                    /**
                     * Finds instances matching a set of properties.
                     * @param {Object} selector Property/value pairs to match
                     * @param {String[]} [properties] Optional list of properties to return
                     * @returns {Promise<Object[]>}
                     */
                    async findInstances(selector, properties) {
                        const response = await NeuralLink_InstanceService.findInstances({ sessionId, selector, returnProperties: properties });
                        return response.instances || response;
                    },

                    /**
                     * Sets properties on a specific instance.
                     * @param {String} id The instance ID
                     * @param {Object} properties Key-value pairs to set
                     * @returns {Promise<Object>}
                     */
                    async setProperties(id, properties) {
                        return NeuralLink_InstanceService.setInstanceProperties({ sessionId, id, properties });
                    },

                    /**
                     * Creates any JSON-addressable Neo instance, optionally attaching it to a parent container.
                     * @param {Object} opts
                     * @returns {Promise<Object>}
                     */
                    async createInstance(opts) {
                        return NeuralLink_InstanceService.createInstance({ sessionId, ...opts });
                    },

                    // --- Component & VDOM Methods ---

                    /**
                     * Finds components matching a set of properties.
                     * @param {Object} selector Property/value pairs to match
                     * @param {String[]} [properties] Optional list of properties to return
                     * @returns {Promise<Object[]>}
                     */
                    async queryComponent(selector, properties) {
                        const response = await NeuralLink_ComponentService.queryComponent({ sessionId, selector, returnProperties: properties });
                        return response.components || response;
                    },

                    /**
                     * Finds internal VDOM nodes matching a set of attributes.
                     * @param {Object} selector Property/value pairs to match
                     * @param {String} [rootId] Optional root component ID to search within
                     * @returns {Promise<Object[]>}
                     */
                    async queryVdom(selector, rootId) {
                        const response = await NeuralLink_ComponentService.queryVdom({ sessionId, selector, rootId });
                        return response.nodes || response;
                    },

                    /**
                     * Retrieves physical DOM rect measurements for one or more components.
                     * @param {String|String[]} componentIds
                     * @returns {Promise<Object[]>}
                     */
                    async getDomRect(componentIds) {
                        const response = await NeuralLink_ComponentService.getDomRect({ sessionId, componentIds: Array.isArray(componentIds) ? componentIds : [componentIds] });
                        return response.rects || response;
                    },

                    /**
                     * Retrieves computed CSS styles for a component.
                     * @param {String} componentId
                     * @param {String[]} variables List of style properties/variables
                     * @returns {Promise<Object>}
                     */
                    async getComputedStyles(componentId, variables) {
                        const response = await NeuralLink_ComponentService.getComputedStyles({ sessionId, componentId, variables });
                        return response.styles || response;
                    },

                    /**
                     * Inspects the render tree (VDOM or VNode) of a component.
                     * @param {String} [type='vdom'] 'vdom' or 'vnode'
                     * @param {Number} [depth=-1] Depth limit (-1 for infinite)
                     * @param {String} [rootId] Optional root component ID
                     * @returns {Promise<Object>}
                     */
                    async inspectComponentRenderTree(type = 'vdom', depth = -1, rootId) {
                        return NeuralLink_ComponentService.inspectComponentRenderTree({ sessionId, type, depth, rootId });
                    },

                    /**
                     * Visually highlights a component in the browser.
                     * @param {String} componentId
                     * @param {Object} [options]
                     * @returns {Promise<Object>}
                     */
                    async highlightComponent(componentId, options) {
                        return NeuralLink_ComponentService.highlightComponent({ sessionId, componentId, options });
                    },

                    /**
                     * Retrieves the full component tree of the application.
                     * @param {String} [rootId]
                     * @param {Number} [depth=-1]
                     * @param {Boolean} [lean=false]
                     * @returns {Promise<Object>}
                     */
                    async getComponentTree(rootId, depth = -1, lean = false) {
                        return NeuralLink_ComponentService.getComponentTree({ sessionId, rootId, depth, lean });
                    },

                    /**
                     * Creates a component inside a target container at runtime (the `create_component`
                     * write-locked tool). Validates the config server-side, then delegates to `container.add()`.
                     * @param {String} parentId The target container's component id.
                     * @param {Object} config   A component config declaring `module`, `ntype`, or `className`.
                     * @returns {Promise<Object>}
                     */
                    async createComponent(parentId, config) {
                        return NeuralLink_ComponentService.createComponent({ sessionId, parentId, config });
                    },

                    /**
                     * Removes (destroys) a live component by id (the `remove_component` write-locked tool).
                     * Delegates to `component.destroy(true)` — detaches the DOM node, not just the instance.
                     * @param {String} componentId The id of the component to destroy.
                     * @returns {Promise<Object>}
                     */
                    async removeComponent(componentId) {
                        return NeuralLink_ComponentService.removeComponent({ sessionId, componentId });
                    },


                    // --- Interaction Methods ---

                    /**
                     * Simulates a native DOM event directly onto the VNode exactly as a user would.
                     * @param {Object|Object[]} events Sequence of events (e.g., {action: 'click', targetId: 'my-comp'})
                     * @returns {Promise<Object>}
                     */
                    async simulateEvent(events) {
                        return NeuralLink_InteractionService.simulateEvent({ sessionId, events: Array.isArray(events) ? events : [events] });
                    },

                    /**
                     * Retrieves the recent SortZone drag-lifecycle traces (start geometry, per-move
                     * decisions, switches, scroll activations + term syncs, end resolution, grid lock
                     * verdicts). The logic-layer oracle for drag-and-drop specs (whitebox-e2e §5.1).
                     * @param {Boolean} [clear=false] Empty the trace ring buffer after reading
                     * @returns {Promise<Object>}
                     */
                    async getDragTrace(clear = false) {
                        return NeuralLink_InteractionService.getDragTrace({ sessionId, clear });
                    },

                    /**
                     * Samples component client rects over a time window (motion trace) — start it
                     * BEFORE page.mouse.down() to assert mid-drag geometry (whitebox-e2e §5.1).
                     * @param {String[]|Object} componentIds Component ids, or an options object for nodeIds/windowId/cellsOf
                     * @param {Number} [durationMs]
                     * @param {Number} [intervalMs]
                     * @returns {Promise<Object>}
                     */
                    async observeMotion(componentIds, durationMs, intervalMs) {
                        const opts = Array.isArray(componentIds) ?
                            { componentIds, durationMs, intervalMs } :
                            { ...(componentIds || {}) };

                        return NeuralLink_InteractionService.observeMotion({ sessionId, ...opts });
                    },

                    /**
                     * Diffs a container's logical items / vdom / rendered DOM child surfaces —
                     * the post-drop duplication & order-drift detector (whitebox-e2e §5.1).
                     * @param {String} componentId
                     * @returns {Promise<Object>}
                     */
                    async verifyComponentConsistency(componentId) {
                        return NeuralLink_InteractionService.verifyComponentConsistency({ sessionId, componentId });
                    },

                    // --- Data & State Methods ---

                    /**
                     * Inspects a specific data store.
                     * @param {String} storeId
                     * @returns {Promise<Object>}
                     */
                    async getStore(storeId) {
                        return NeuralLink_DataService.inspectStore({ sessionId, storeId });
                    },

                    /**
                     * Lists all available stores in the data service.
                     * @returns {Promise<Object>}
                     */
                    async listStores() {
                        return NeuralLink_DataService.listStores({ sessionId });
                    },

                    /**
                     * Retrieves paginated data from a store.
                     * @param {String} storeId
                     * @param {Number} [limit=50]
                     * @param {Number} [offset=0]
                     * @returns {Promise<Object>}
                     */
                    async inspectStore(storeId, limit = 50, offset = 0) {
                        return NeuralLink_DataService.inspectStore({ sessionId, storeId, limit, offset });
                    },

                    /**
                     * Retrieves a specific data record.
                     * @param {String} recordId
                     * @param {String} [storeId] Optional store scope
                     * @returns {Promise<Object>}
                     */
                    async getRecord(recordId, storeId) {
                        return NeuralLink_DataService.getRecord({ sessionId, recordId, storeId });
                    },

                    /**
                     * Inspects a specific state provider.
                     * @param {String} providerId
                     * @returns {Promise<Object>}
                     */
                    async inspectStateProvider(providerId) {
                        return NeuralLink_DataService.inspectStateProvider({ sessionId, providerId });
                    },

                    /**
                     * Modifies variables inside a specific state provider.
                     * @param {String} providerId
                     * @param {Object} data Key-value pairs to set
                     * @returns {Promise<Object>}
                     */
                    async modifyStateProvider(providerId, data) {
                        return NeuralLink_DataService.modifyStateProvider({ sessionId, providerId, data });
                    },

                    // --- Runtime & Global Methods ---

                    /**
                     * Retrieves bound DOM event listeners for a specific component.
                     * @param {String} componentId
                     * @returns {Promise<Object>}
                     */
                    async getDomEventListeners(componentId) {
                        return NeuralLink_RuntimeService.getDomEventListeners({ sessionId, componentId });
                    },

                    /**
                     * Retrieves the route history log.
                     * @param {String} [windowId]
                     * @returns {Promise<Object>}
                     */
                    async getRouteHistory(windowId) {
                        return NeuralLink_RuntimeService.getRouteHistory({ sessionId, windowId });
                    },

                    /**
                     * Drives the application to a specific hash route.
                     * @param {String} hash The hash string
                     * @param {String} [windowId]
                     * @returns {Promise<Object>}
                     */
                    async setRoute(hash, windowId) {
                        return NeuralLink_RuntimeService.setRoute({ sessionId, hash, windowId });
                    },

                    /**
                     * Reloads the application window.
                     * @returns {Promise<Object>}
                     */
                    async reloadPage() {
                        return NeuralLink_RuntimeService.reloadPage({ sessionId });
                    },

                    /**
                     * Retrieves captured console logs from the App Worker.
                     * @param {String} [type] Optional log type (log, warn, error)
                     * @param {String} [filter]
                     * @returns {Promise<Object>}
                     */
                    async getConsoleLogs(type, filter) {
                        return NeuralLink_RuntimeService.getConsoleLogs({ sessionId, type, filter });
                    },

                    /**
                     * Checks if a namespace exists in the current environment.
                     * @param {String} namespace
                     * @returns {Promise<Object>}
                     */
                    async checkNamespace(namespace) {
                        return NeuralLink_RuntimeService.checkNamespace({ sessionId, namespace });
                    },

                    /**
                     * Retrieves the loaded namespace tree from the runtime.
                     * @param {String} [root='Neo']
                     * @returns {Promise<Object>}
                     */
                    async getNamespaceTree(root = 'Neo') {
                        return NeuralLink_RuntimeService.getNamespaceTree({ sessionId, root });
                    },

                    /**
                     * Retrieves a high-level summary of the DomEvent manager state.
                     * @returns {Promise<Object>}
                     */
                    async getDomEventSummary() {
                        return NeuralLink_RuntimeService.getDomEventSummary({ sessionId });
                    },

                    /**
                     * Retrieves the state of the DragCoordinator.
                     * @returns {Promise<Object>}
                     */
                    async getDragState() {
                        return NeuralLink_RuntimeService.getDragState({ sessionId });
                    },

                    /**
                     * Manages the global Neo.config object.
                     * @param {String} action 'get' or 'set'
                     * @param {Object} [config]
                     * @param {String} [windowId]
                     * @returns {Promise<Object>}
                     */
                    async manageNeoConfig(action, config, windowId) {
                        return NeuralLink_RuntimeService.manageNeoConfig({ sessionId, action, config, windowId });
                    },

                    /**
                     * Opens a live dashboard component in a popup window.
                     * @param {Object} options
                     * @returns {Promise<Object>}
                     */
                    async openComponentWindow(options) {
                        return NeuralLink_RuntimeService.openComponentWindow({ sessionId, ...options });
                    },

                    /**
                     * Moves a known popup window when the runtime exposes a native handle.
                     * @param {Object} options
                     * @returns {Promise<Object>}
                     */
                    async positionWindow(options) {
                        return NeuralLink_RuntimeService.positionWindow({ sessionId, ...options });
                    },

                    /**
                     * Focuses a known popup window when the runtime exposes a native handle.
                     * @param {String} windowId
                     * @returns {Promise<Object>}
                     */
                    async focusWindow(windowId) {
                        return NeuralLink_RuntimeService.focusWindow({ sessionId, windowId });
                    },

                    // --- Topology ---

                    /**
                     * Retrieves the topology of all connected App Workers.
                     * @returns {Promise<Object>}
                     */
                    async getWorkerTopology() {
                        return NeuralLink_RuntimeService.getWorkerTopology();
                    },

                    /**
                     * Retrieves the topology of all connected windows.
                     * @returns {Promise<Object>}
                     */
                    async getWindowTopology() {
                        return NeuralLink_RuntimeService.getWindowTopology();
                    }
                };
            }
        };

        await use(nl);
    }
});

export { expect };
