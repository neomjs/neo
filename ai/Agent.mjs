import Base             from '../src/core/Base.mjs';
import Client           from './mcp/client/Client.mjs';
import ContextAssembler from './context/Assembler.mjs';
import GeminiProvider   from './provider/Gemini.mjs';
import OllamaProvider   from './provider/Ollama.mjs';
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
         * The AI Provider class or string alias ('gemini', 'ollama').
         * @member {Neo.ai.provider.Base|String} modelProvider=GeminiProvider
         */
        modelProvider: GeminiProvider,
        /**
         * Configuration options for the provider instantiation.
         * @member {Object|null} providerConfig=null
         */
        providerConfig: null,
        /**
         * The maximum number of interaction turns a sub-agent can execute
         * before being deliberately recycled to flush its context window.
         * @member {Number} maxSubAgentLifespan=50
         */
        maxSubAgentLifespan: 50,
        /**
         * A list of server names (keys in ClientConfig) to connect to.
         * @member {String[]} servers=[]
         */
        servers: [],
        /**
         * Registered sub-agent profiles available for delegation.
         * @member {Object} subAgents
         */
        subAgents: {
            browser  : async () => (await import('./agent/profile/Browser.mjs')).default,
            librarian: async () => (await import('./agent/profile/Librarian.mjs')).default,
            qa       : async () => (await import('./agent/profile/QA.mjs')).default
        }
    }

    /**
     * Map of currently running sub-agent instances.
     * @member {Object} activeSubAgents={}
     */
    activeSubAgents = {}

    /**
     * Map of connected Client instances, keyed by server name.
     * @member {Object} clients={}
     */
    clients = {}

    /**
     * Track turn numbers to prevent hallucination cascades.
     * @member {Object} subAgentTurns={}
     */
    subAgentTurns = {}

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

        let providerClass = this.modelProvider;

        if (typeof providerClass === 'string') {
            providerClass = providerClass.toLowerCase() === 'ollama' ? OllamaProvider : GeminiProvider;
        }

        const provider = Neo.create(providerClass, this.providerConfig || {});

        const assembler = Neo.create(ContextAssembler);
        await assembler.ready(); // Connects to Memory Core via Services SDK

        const scheduler = Neo.create(Scheduler);

        // Create the Loop
        this.loop = Neo.create(Loop, {
            agent: this,
            assembler,
            clients: this.clients,
            provider,
            scheduler
        });

        await this.loop.ready();

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

    /**
     * Spawns a sub-agent ephemerally to execute a task and return the synthesis.
     * @param {String} profileName The alias inside subAgents config.
     * @param {String} request The query/task to delegate.
     * @param {Boolean} [forceFresh=false] Whether to force a topic switch / new instance.
     * @returns {Promise<String>} The generated result content.
     */
    async delegate(profileName, request, forceFresh = false) {
        const getProfileClass = this.subAgents[profileName];

        if (!getProfileClass) {
            throw new Error(`Sub-Agent profile '${profileName}' not found.`);
        }

        // Context Flush (Max Tasks Gate) or explicit Reset
        if (this.activeSubAgents[profileName]) {
            if (forceFresh || this.subAgentTurns[profileName] >= this.maxSubAgentLifespan) {
                console.log(`[Agent] Recycling sub-agent '${profileName}' (Max Turns Reached / Forced Switch)`);
                await this.activeSubAgents[profileName].disconnect();
                delete this.activeSubAgents[profileName];
                this.subAgentTurns[profileName] = 0;
            }
        }

        let subAgent = this.activeSubAgents[profileName];

        if (!subAgent) {
            const ProfileClass = await getProfileClass();
            console.log(`[Agent] Booting fresh Sub-Agent: ${profileName} (${ProfileClass.config.className})`);

            subAgent = Neo.create(ProfileClass);
            await subAgent.ready();
            
            this.activeSubAgents[profileName] = subAgent;
            this.subAgentTurns[profileName]   = 0;
        } else {
            console.log(`[Agent] Re-using active Sub-Agent: ${profileName} (Turn ${this.subAgentTurns[profileName] + 1})`);
        }

        try {
            this.subAgentTurns[profileName]++;
            
            const result = await subAgent.loop.processEvent({
                type: 'delegate',
                data: request,
                systemPrompt: subAgent.systemPrompt
            });

            return result;
        } catch (err) {
            console.error(`[Agent] Delegate execution failed for ${profileName}:`, err);
            throw err;
        }
    }
}

export default Neo.setupClass(Agent);
