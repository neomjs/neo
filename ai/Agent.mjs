import Base   from '../src/core/Base.mjs';
import Client from './mcp/client/Client.mjs';

/**
 * A base class for AI Agents that manages multiple MCP Client connections.
 * @class Neo.ai.Agent
 * @extends Neo.core.Base
 */
class Agent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.Agent'
         * @protected
         */
        className: 'Neo.ai.Agent',
        /**
         * A list of server names (keys in ClientConfig) to connect to.
         * @member {String[]} servers=[]
         */
        servers: []
    }

    /**
     * Map of connected Client instances, keyed by server name.
     * @member {Object} clients={}
     */
    clients = {}

    /**
     * Async initialization sequence.
     * Creates and connects all configured clients.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        const readyPromises = [];

        for (const serverName of this.servers) {
            const client = Neo.create(Client, {
                serverName,
                env: process.env // Pass generic env for now
            });

            readyPromises.push(client.ready());

            this.clients[Neo.camel(serverName)] = client;
        }

        await Promise.all(readyPromises);

        console.log('[Agent] Final clients map:', Object.keys(this.clients));
    }

    /**
     * Disconnects all clients.
     */
    async disconnect() {
        for (const client of Object.values(this.clients)) {
            await client.destroy();
        }
        this.clients = {};
    }
}

export default Neo.setupClass(Agent);
