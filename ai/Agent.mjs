import Base from '../src/core/Base.mjs';
import Client from './mcp/client/Client.mjs';

/**
 * @class Neo.ai.Agent
 * @extends Neo.core.Base
 * @description
 * A base class for AI Agents that manages multiple MCP Client connections.
 * It aggregates tools from connected servers into a structured `tools` namespace.
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
        servers: [],
        /**
         * Map of connected Client instances, keyed by server name.
         * @member {Object} clients={}
         */
        clients: {}
    }

    /**
     * Async initialization sequence.
     * Creates and connects all configured clients.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Ensure clients object is ready
        if (!this.clients) this.clients = {};

        for (const serverName of this.servers) {
            const client = Neo.create(Client, {
                serverName,
                env: process.env // Pass generic env for now
            });
            await client.ready();

            const key = this.snakeToCamel(serverName);
            console.log(`[Agent] Registering client '${serverName}' as '${key}'`);
            this.clients[key] = client;
        }
        console.log('[Agent] Final clients map:', Object.keys(this.clients));
    }

    /**
     * Disconnects all clients.
     */
    async disconnect() {
        for (const client of Object.values(this.clients)) {
            await client.close();
        }
        this.clients = {};
    }

    /**
     * Helper to convert kebab-case server names to camelCase for the tools object.
     * @param {String} s
     * @returns {String}
     */
    snakeToCamel(s) {
        // Re-using logic or borrowing from core if available.
        // Simple implementation for now to handle 'github-workflow' -> 'githubWorkflow'
        return s.replace(/-./g, x => x[1].toUpperCase());
    }
}

export default Neo.setupClass(Agent);
