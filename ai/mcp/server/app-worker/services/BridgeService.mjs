import { WebSocketServer } from 'ws';
import Base from '../../../../../src/core/Base.mjs';

/**
 * @class Neo.ai.mcp.server.app_worker.services.BridgeService
 * @extends Neo.core.Base
 * @singleton
 */
class BridgeService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.app_worker.services.BridgeService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.app_worker.services.BridgeService',
        /**
         * @member {Number} port=8081
         */
        port: 8081,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Map<String, WebSocket>} clients
     */
    clients = new Map()
    /**
     * @member {WebSocketServer|null} wss=null
     */
    wss = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.start()
    }

    /**
     * Broadcasts a message to all connected clients (App Workers)
     * @param {Object} msg
     */
    broadcast(msg) {
        const str = JSON.stringify(msg);

        this.clients.forEach((client, id) => {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(str)
            }
        })
    }

    /**
     * Evaluates code or calls a remote method on the App Worker.
     * @param {Object} params
     * @param {String} params.method
     * @param {Array} [params.params]
     * @returns {Promise<any>}
     */
    evaluate({ method, params }) {
        return new Promise((resolve, reject) => {
            // For now, we just broadcast to the first available client.
            // In the future, we can target specific workers/windows.
            if (this.clients.size === 0) {
                reject(new Error('No App Worker connected'));
                return
            }

            // Create a unique ID for this request
            const id = Math.random().toString(36).substring(7);

            // Send request
            this.broadcast({
                action: 'remoteMethod',
                method,
                params,
                reqId: id
            });

            // We need a way to capture the response.
            // For this simple implementation, we'll rely on the App Worker sending a message back.
            // However, since `broadcast` is fire-and-forget, we need a response handler.
            // This is a simplified implementation. A robust one would use a pendingRequests map.

            // Temporary: Resolve immediately to unblock the agent, 
            // assuming the App Worker will perform the side effect.
            // Real implementation requires bidirectional correlation.
            resolve({ status: 'sent', reqId: id })
        })
    }

    /**
     * Checks if the bridge is ready.
     * @returns {Object}
     */
    getStatus() {
        return {
            listening: !!this.wss,
            connectedClients: this.clients.size
        }
    }

    /**
     * Starts the WebSocket server.
     */
    start() {
        if (this.wss) return;

        console.log(`[BridgeService] Starting WebSocket Server on port ${this.port}...`);

        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws, req) => {
            const id = req.headers['sec-websocket-key'];
            console.log(`[BridgeService] Client connected: ${id}`);

            this.clients.set(id, ws);

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    console.log(`[BridgeService] Received:`, data);

                    // Handle responses from App Worker here if needed
                } catch (e) {
                    console.error('[BridgeService] Failed to parse message:', e)
                }
            });

            ws.on('close', () => {
                console.log(`[BridgeService] Client disconnected: ${id}`);
                this.clients.delete(id)
            })
        })
    }
}

export default Neo.setupClass(BridgeService);
