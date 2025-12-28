import Base            from '../core/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Socket          from '../data/connection/WebSocket.mjs';

/**
 * The AI Client establishes a WebSocket connection to the Neural Link MCP Server.
 * It acts as a bridge, enabling external AI agents to inspect and manipulate the running Neo.mjs application
 * via a standardized JSON-RPC protocol.
 * @class Neo.ai.Client
 * @extends Neo.core.Base
 * @singleton
 */
class Client extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.Client'
         * @protected
         */
        className: 'Neo.ai.Client',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Add custom configs for data.connection.Websocket, or pass a module or instance.
         * @member {Object|Neo.data.connection.WebSocket|null} socket=null
         */
        socketConfig: null,
        /**
         * The URL of the Neural Link MCP Server's WebSocket endpoint.
         * @member {String} url='ws://localhost:8081'
         */
        url: 'ws://localhost:8081'
    }

    /**
     * @member {Boolean} isConnected=false
     * @protected
     */
    isConnected = false
    /**
     * @member {Neo.data.connection.WebSocket|null} socket=null
     * @protected
     */
    socket = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.currentWorker.on({
            connect   : this.onAppWorkerWindowConnect,
            disconnect: this.onAppWorkerWindowDisconnect,
            scope     : this
        });

        this.connect();
    }

    /**
     * Establishes the WebSocket connection to the Neural Link MCP Server.
     * Uses Neo.data.connection.WebSocket for robust connection management.
     */
    connect() {
        let me = this;

        me.socket = ClassSystemUtil.beforeSetInstance(me.socketConfig, Socket, {
            serverAddress: me.url,
            listeners    : {
                close  : me.onSocketClose,
                error  : me.onSocketError,
                message: me.onSocketMessage,
                open   : me.onSocketOpen,
                scope  : me
            }
        })
    }

    /**
     * @param {Object} data
     */
    onAppWorkerWindowConnect(data) {
        if (this.isConnected) {
            const
                win = Neo.manager.Window.get(data.windowId),
                {appName, windowId} = data;

            this.sendNotification('window_connected', {
                appName,
                chrome   : win?.chrome,
                innerRect: win?.innerRect,
                outerRect: win?.outerRect,
                windowId
            })
        }
    }

    /**
     * @param {Object} data
     */
    onAppWorkerWindowDisconnect(data) {
        if (this.isConnected) {
            this.sendNotification('window_disconnected', {
                windowId: data.windowId
            })
        }
    }

    /**
     * Handles incoming messages from the WebSocket.
     * Parses the JSON-RPC payload and delegates valid requests to `handleRequest`.
     * @param {Object} data
     */
    async onSocketMessage({data}) {
        try {
            if (data.method) {
                const result = await this.handleRequest(data.method, data.params);
                this.sendResponse(data.id, result)
            }
        } catch (e) {
            console.error('Neo.ai.Client: Failed to handle message', e)
        }
    }

    /**
     * @param {Event} event
     */
    onSocketOpen(event) {
        console.log('Neo.ai.Client: Connected to MCP Server');
        this.isConnected = true;

        const appWorker = Neo.worker.App;

        // 1. Register the worker
        this.socket.sendMessage(JSON.stringify({
            jsonrpc: '2.0',
            method : 'register',
            params : {
                appWorkerId   : appWorker.id,
                environment   : Neo.config.environment,
                isSharedWorker: appWorker.isSharedWorker,
                userAgent     : navigator.userAgent
            }
        }));

        // 2. Rehydrate window topology
        const windowManager = Neo.manager?.Window;

        if (windowManager) {
            windowManager.items.forEach(win => {
                this.sendNotification('window_connected', {
                    appName  : win.appName,
                    chrome   : win.chrome,
                    innerRect: win.innerRect,
                    outerRect: win.outerRect,
                    windowId : win.id
                })
            })
        }

        // 3. Rehydrate drag state (if active)
        const dragCoordinator = Neo.manager?.DragCoordinator;

        if (dragCoordinator?.activeTargetZone) {
            this.sendNotification('drag_active', {
                sortGroup : dragCoordinator.activeTargetZone.sortGroup,
                sourceZone: dragCoordinator.activeTargetZone.id
            })
        }
    }

    /**
     * @param {CloseEvent} event
     */
    onSocketClose(event) {
        console.log('Neo.ai.Client: Disconnected');
        this.isConnected = false
    }

    /**
     * @param {Event} event
     */
    onSocketError(event) {
        console.error('Neo.ai.Client: WebSocket Error', event)
    }

    /**
     * Routes specific JSON-RPC methods to their corresponding implementation.
     * This method acts as the central dispatcher for all AI-driven commands.
     * @param {String} method The JSON-RPC method name
     * @param {Object} params The parameters associated with the method
     * @returns {Promise<*>} The result of the operation
     */
    async handleRequest(method, params) {
        let me = this,
            component;

        switch (method) {
            case 'get_component_property':
                component = Neo.getComponent(params.id);
                if (!component) throw new Error(`Component not found: ${params.id}`);
                return {value: me.safeSerialize(component[params.property])};

            case 'get_component_tree':
                return {tree: me.serializeComponent(me.getComponentRoot(params.rootId), params.depth || -1)};

            case 'get_drag_state':
                const dragCoordinator = Neo.manager?.DragCoordinator;

                if (dragCoordinator) {
                    return {
                        activeTargetZone: dragCoordinator.activeTargetZone ? {
                            id       : dragCoordinator.activeTargetZone.id,
                            sortGroup: dragCoordinator.activeTargetZone.sortGroup,
                            windowId : dragCoordinator.activeTargetZone.windowId
                        } : null,
                        sortZones: Array.from(dragCoordinator.sortZones.entries()).map(([group, map]) => ({
                            group,
                            windows: Array.from(map.keys())
                        }))
                    }
                }

                return {};

            case 'get_vdom_tree':
                component = me.getComponentRoot(params.rootId);
                if (!component) throw new Error('Root component not found');
                return {vdom: component.vdom};

            case 'get_vnode_tree':
                component = me.getComponentRoot(params.rootId);
                if (!component) throw new Error('Root component not found');
                return {vnode: component.vnode};

            case 'get_window_info':
                const windowManager = Neo.manager?.Window;

                if (windowManager) {
                    return {
                        windows: windowManager.items.map(win => ({
                            id       : win.id,
                            appName  : win.appName,
                            chrome   : win.chrome,
                            innerRect: win.innerRect,
                            outerRect: win.outerRect
                        }))
                    }
                }

                return {windows: []};

            case 'reload_page':
                Neo.Main.reloadWindow();
                return {status: 'reloading'};

            case 'set_component_property':
                component = Neo.getComponent(params.id);
                if (!component) throw new Error(`Component not found: ${params.id}`);
                component[params.property] = params.value;
                return {success: true};

            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    /**
     * @param {String} [rootId]
     * @returns {Neo.component.Base|null}
     */
    getComponentRoot(rootId) {
        if (rootId) {
            return Neo.getComponent(rootId)
        }

        const apps = Object.values(Neo.apps || {});

        if (apps.length > 0) {
            return apps[0].mainView
        }

        return null
    }

    /**
     * @param {*} value
     * @returns {*}
     */
    safeSerialize(value) {
        const type = Neo.typeOf(value);

        if (type === 'NeoInstance') {
            return {
                neoInstance: true,
                id         : value.id,
                className  : value.className
            }
        }

        if (type === 'Object') {
            const result = {};
            Object.entries(value).forEach(([k, v]) => {
                result[k] = this.safeSerialize(v)
            });
            return result
        }

        if (type === 'Array') {
            return value.map(v => this.safeSerialize(v))
        }

        return value
    }

    /**
     * Sends a JSON-RPC notification (no id)
     * @param {String} method
     * @param {Object} params
     */
    sendNotification(method, params) {
        if (this.isConnected) {
            this.socket.sendMessage(JSON.stringify({
                jsonrpc: '2.0',
                method,
                params
            }))
        }
    }

    /**
     * Sends a JSON-RPC response
     * @param {Number|String} id
     * @param {*} result
     */
    sendResponse(id, result) {
        if (this.isConnected) {
            this.socket.sendMessage(JSON.stringify({
                jsonrpc: '2.0',
                id,
                result
            }))
        }
    }

    /**
     * @param {Neo.component.Base} component
     * @param {Number} maxDepth
     * @param {Number} currentDepth
     * @returns {Object}
     */
    serializeComponent(component, maxDepth, currentDepth=1) {
        if (!component) return null;

        const result = {
            id       : component.id,
            className: component.className,
            ntype    : component.ntype
        };

        if (maxDepth === -1 || currentDepth < maxDepth) {
            const children = Neo.manager.Component.getChildren(component);

            if (children && children.length > 0) {
                result.items = children.map(child => this.serializeComponent(child, maxDepth, currentDepth + 1))
            }
        }

        return result
    }
}

export default Neo.setupClass(Client);
