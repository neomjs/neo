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
        this.isConnected = true
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
        switch (method) {
            case 'reload_page':
                Neo.Main.reloadWindow();
                return {status: 'reloading'};

            case 'get_component_tree':
                // TODO: Implement actual tree retrieval
                return {root: 'viewport'};

            case 'get_component_property':
                // TODO: Implement property retrieval
                return {value: null};

            case 'set_component_property':
                // TODO: Implement property setting
                return {success: true};

            default:
                throw new Error(`Unknown method: ${method}`);
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
}

export default Neo.setupClass(Client);
