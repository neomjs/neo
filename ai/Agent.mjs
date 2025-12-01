import Base             from '../src/core/Base.mjs';
import Client           from './mcp/client/Client.mjs';
import ContextAssembler from './context/Assembler.mjs';
import GeminiProvider   from './provider/Gemini.mjs';
import Loop             from './agent/Loop.mjs';
import Scheduler        from './agent/Scheduler.mjs';

/**
 * A base class for AI Agents that manages multiple MCP Client connections
 * and orchestrates the autonomous cognitive runtime.
 *
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
         * The Loop instance.
         * @member {Neo.ai.agent.Loop|null} loop=null
         */
        loop: null,
        /**
         * The AI Provider class or instance.
         * @member {Neo.ai.provider.Base} modelProvider=GeminiProvider
         */
        modelProvider: GeminiProvider,
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
     * Creates and connects all configured clients, then initializes the Cognitive Runtime.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // 1. Connect to MCP Servers
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
        console.log('[Agent] Connected to MCP servers:', Object.keys(this.clients));

        // 2. Initialize Cognitive Runtime
        console.log('[Agent] Initializing Cognitive Runtime...');

        const provider = Neo.create(this.modelProvider);

        const assembler = Neo.create(ContextAssembler);
        await assembler.initAsync(); // Connects to Memory Core via Services SDK

        const scheduler = Neo.create(Scheduler);

        // Create the Loop
        this.loop = Neo.create(Loop, {
            provider,
            assembler,
            scheduler,
            // Inject clients into the loop for Tool Execution (Future Phase)
            // tools: this.clients
        });

        console.log('[Agent] Runtime Ready.');
    }

    /**
     * Disconnects all clients and stops the loop.
     */
    async disconnect() {
        this.stop();

        for (const client of Object.values(this.clients)) {
            await client.destroy();
        }
        this.clients = {};
    }

    /**
     * Starts the autonomous loop.
     */
    start() {
        this.loop?.start();
    }

    /**
     * Stops the autonomous loop.
     */
    stop() {
        this.loop?.stop();
    }

    /**
     * Schedules an event for the agent to process.
     * @param {Object} event
     * @param {String} event.type
     * @param {*} event.data
     * @param {String} [event.priority]
     */
    schedule(event) {
        if (!this.loop) {
            console.warn('[Agent] Cannot schedule event: Loop not initialized.');
            return;
        }
        this.loop.scheduler.add(event);
    }
}

export default Neo.setupClass(Agent);
