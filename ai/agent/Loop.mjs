import Assembler       from '../context/Assembler.mjs';
import Base            from '../../src/core/Base.mjs';
import ClassSystemUtil from '../../src/util/ClassSystem.mjs';
import Provider        from '../provider/Base.mjs';
import * as SDK        from '../services.mjs';

/**
 * The cognitive event loop for the Agent.
 * Orchestrates the "Perceive -> Reason -> Act" cycle.
 *
 * @class Neo.ai.agent.Loop
 * @extends Neo.core.Base
 */
class Loop extends Base {
    static states = ['idle', 'thinking', 'acting', 'reflecting']

    static config = {
        /**
         * @member {String} className='Neo.ai.agent.Loop'
         * @protected
         */
        className: 'Neo.ai.agent.Loop',
        /**
         * The Context Assembler instance.
         * @member {Neo.ai.context.Assembler|Object} assembler_=null
         * @reactive
         */
        assembler_: null,
        /**
         * Map of connected MCP Clients injected by the Agent.
         * @member {Object|null} clients=null
         */
        clients: null,
        /**
         * Execution interval in ms.
         * @member {Number} interval=100
         */
        interval: 100,
        /**
         * Maximum number of actions allowed per minute.
         * @member {Number} maxActionsPerMinute=10
         */
        maxActionsPerMinute: 10,
        /**
         * Maximum number of failed events to keep in the dead letter queue.
         * @member {Number} maxFailedEvents=100
         */
        maxFailedEvents: 100,
        /**
         * Maximum number of retries for event processing.
         * @member {Number} maxRetries=3
         */
        maxRetries: 3,
        /**
         * The AI Provider instance.
         * @member {Neo.ai.provider.Base|Object} provider_=null
         * @reactive
         */
        provider_: null,
        /**
         * The Event Scheduler instance.
         * @member {Neo.ai.agent.Scheduler} scheduler=null
         */
        scheduler: null,
        /**
         * State of the loop.
         * @member {String} state_='idle'
         * @reactive
         */
        state_: 'idle', // idle, thinking, acting, reflecting
        /**
         * Valid state transitions.
         * @member {Object} transitions
         */
        transitions: {
            idle      : ['thinking'],
            thinking  : ['acting', 'reflecting', 'idle'],
            acting    : ['thinking', 'reflecting', 'idle'],
            reflecting: ['idle']
        }
    }

    /**
     * Dead letter queue for unrecoverable events.
     * @member {Object[]} failedEvents=[]
     */
    failedEvents = []

    /**
     * Centralized map of tool names to their providing client.
     * @member {Object} toolRegistry={}
     */
    toolRegistry = {}

    /**
     * Generic list of tool schemas for sending to the LLM Provider.
     * @member {Object[]} tools=[]
     */
    tools = []

    /**
     * @member {Boolean} isRunning=false
     */
    isRunning = false

    /**
     * Token bucket for rate limiting.
     * @member {Number} tokens
     * @protected
     */
    tokens = 0

    /**
     * Timestamp of the last token refill.
     * @member {Number} lastRefill
     * @protected
     */
    lastRefill = Date.now()

    /**
     * Triggered before the assembler config gets changed.
     * @param {Object|Neo.ai.context.Assembler} value
     * @param {Neo.ai.context.Assembler} oldValue
     * @returns {Neo.ai.context.Assembler}
     * @protected
     */
    beforeSetAssembler(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Assembler)
    }

    /**
     * Triggered before the provider config gets changed.
     * @param {Object|Neo.ai.provider.Base} value
     * @param {Neo.ai.provider.Base} oldValue
     * @returns {Neo.ai.provider.Base}
     * @protected
     */
    beforeSetProvider(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Provider)
    }

    /**
     * Triggered before the state config gets changed
     * @param {String} value    The new value of the state config.
     * @param {String} oldValue The old value of the state config.
     * @returns {String}
     * @protected
     */
    beforeSetState(value, oldValue) {
        // 1. Validate value is in static states
        const validValue = this.beforeSetEnumValue(value, oldValue, 'state');

        if (validValue === oldValue) {
            return oldValue
        }

        // Allow initialization
        if (oldValue === undefined) {
            return validValue
        }

        // 2. Validate transition
        const validTransitions = this.transitions[oldValue] || [];

        if (!validTransitions.includes(value)) {
            // Allow forced reset to idle
            if (value === 'idle') {
                console.warn(`[Loop] Forced transition to idle from ${oldValue}`);
                return value
            }

            throw new Error(`Invalid state transition: ${oldValue} -> ${value}`)
        }

        console.log(`[Loop] State: ${oldValue} -> ${value}`);
        return value
    }

    /**
     * Initialize the agent loop, specifically handling tool discovery.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // 1. Tool Discovery
        if (this.clients) {
            console.log('[Loop] Mapping tools from injected MCP clients...');
            this.tools = [];
            this.toolRegistry = {};

            for (const [clientName, client] of Object.entries(this.clients)) {
                try {
                    const clientTools = await client.listTools();
                    for (const tool of clientTools) {
                        this.tools.push(tool);
                        this.toolRegistry[tool.name] = { client, clientName, method: Neo.camel(tool.name) };
                    }
                } catch (e) {
                    console.error(`[Loop] Failed to fetch tools from client: ${clientName}`, e);
                }
            }

            console.log(`[Loop] Discovered ${this.tools.length} total tools from clients.`);
        }

        // 2. Inject Native Tools
        this.tools.push({
            name: "delegate_task",
            description: "Delegates a complex task or query to a specialized sub-agent expert. Use this when you lack the context or tools to fulfill the user's request. Wait for the sub-agent's response to formulate your final answer.",
            inputSchema: {
                type: "object",
                properties: {
                    agent: {
                        type: "string",
                        description: "The name of the specialized sub-agent profile (e.g. 'librarian', 'browser')."
                    },
                    query: {
                        type: "string",
                        description: "The specific task, objective, or question to delegate to the sub-agent."
                    }
                },
                required: ["agent", "query"]
            }
        });
    }

    /**
     * Refills the token bucket based on elapsed time.
     */
    refillTokens() {
        const now        = Date.now();
        const elapsed    = now - this.lastRefill;
        const refillRate = this.maxActionsPerMinute / 60000; // tokens per ms

        this.tokens = Math.min(
            this.maxActionsPerMinute,
            this.tokens + (elapsed * refillRate)
        );

        this.lastRefill = now;
    }

    /**
     * Starts the agent loop.
     */
    start() {
        if (this.isRunning)return;

        this.isRunning  = true;
        this.tokens     = this.maxActionsPerMinute; // Start full
        this.lastRefill = Date.now();

        this.tick();
        console.log('[Loop] Agent Runtime Started.');
    }

    /**
     * Stops the agent loop.
     */
    stop() {
        this.isRunning = false;
        console.log('[Loop] Agent Runtime Stopped.');
    }

    /**
     * Single iteration of the loop.
     */
    async tick() {
        if (!this.isRunning) return;

        this.refillTokens();

        if (this.state === 'idle' && this.tokens >= 1) {
            const event = this.scheduler.next();

            if (event) {
                this.tokens -= 1;
                // We don't await here to allow the loop to keep ticking if we wanted parallelism,
                // but since we share 'state', we must process one at a time.
                // The 'state' check above prevents re-entry.
                await this.processEvent(event);
            }
        }

        // Schedule next tick
        setTimeout(() => this.tick(), this.interval);
    }

    /**
     * Simple keyword extraction for RAG queries.
     * @param {String} text
     * @returns {String}
     */
    extractKeywords(text) {
        if (!text || typeof text !== 'string') return '';
        // Minimal stop word list
        const stopWords = new Set(['how', 'what', 'the', 'is', 'do', 'i', 'to', 'in', 'at', 'on', 'for', 'and']);
        return text.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.has(word))
            .join(' ');
    }

    /**
     * Processes a single event through the cognitive pipeline.
     * @param {Object} event
     * @param {Number} [retryCount=0]
     */
    async processEvent(event, retryCount = 0) {
        let retrying = false;

        console.log(`[Loop] Processing event: [${event.priority}] ${event.type}`);
        this.state = 'thinking';

        try {
            // 1. Assemble Context
            let systemPrompt = 'You are an autonomous agent.';
            let userQuery    = event.data;
            let ragQuery     = '';

            // Differentiate logic based on event type
            if (event.type === 'user:input') {
                systemPrompt = 'You are a helpful assistant.';
                ragQuery     = this.extractKeywords(userQuery);
            } else if (event.type === 'delegate') {
                systemPrompt = event.systemPrompt || 'You are a specialized sub-agent.';
                ragQuery     = this.extractKeywords(userQuery);
            } else if (event.type.startsWith('system:error')) {
                systemPrompt = 'You are an expert debugger. Analyze the error and propose a fix.';
                const err    = event.data || {};
                userQuery    = `[ERROR] ${err.message || JSON.stringify(err)}\nStack: ${err.stack || 'N/A'}`;
                ragQuery     = `error handling ${err.componentType || ''} ${this.extractKeywords(err.message || '')}`;
            } else if (event.type === 'neo:component:mount') {
                systemPrompt = 'You are observing the application state.';
                userQuery    = `Component mounted: ${event.data.id}`;
            }

            const context = await this.assembler.assemble({
                systemPrompt,
                userQuery: userQuery || 'No content',
                ragQuery
            });

            // 2. Reason (LLM Inference) - Recursive Loop
            const messages = [
                {role: 'system', content: context.system},
                ...context.messages
            ];

            let finalResult  = null;
            let actionResult = null;

            // Allow up to 10 iterations of tool chaining
            for (let i = 0; i < 10; i++) {
                const result = await this.provider.generate(messages, { tools: this.tools });
                
                if (result.content) {
                    console.log(`[Loop] Model Response:\n${result.content}`);
                }

                // 3. Act (Tool Execution)
                if (result.toolCalls && result.toolCalls.length > 0) {
                    this.state = 'acting';
                    actionResult = await this.executeTools(result.toolCalls);
                    
                    // Push the model's textual response (if any)
                    messages.push({
                        role   : 'model',
                        content: result.content || `(Delegated to tools: ${result.toolCalls.map(t => t.function.name).join(', ')})`
                    });
                    
                    // Format tool results as a user observation for the next LLM turn
                    const toolResponsesStr = actionResult.map(r => `[Tool Result: ${r.name}]\n${r.error || JSON.stringify(r.result)}`).join('\n\n');
                    
                    messages.push({
                        role   : 'user',
                        content: `Observation from tools:\n${toolResponsesStr}\n\nPlease proceed based on the above results.`
                    });
                    
                    this.state = 'thinking'; // Resume reasoning
                } else {
                    // No further tool calls -> Final answer achieved
                    finalResult = result;
                    break;
                }
            }

            if (!finalResult) {
                throw new Error('[Loop] Exceeded maximum tool execution iterations.');
            }

            // 4. Reflect
            this.state = 'reflecting';
            await this.reflect(event, finalResult, actionResult);

            return finalResult.content;

        } catch (error) {
            console.error(`[Loop] Error processing event (attempt ${retryCount + 1}):`, error);

            if (retryCount < this.maxRetries) {
                // Exponential backoff: 1s, 2s, 4s...
                await this.timeout(1000 * Math.pow(2, retryCount));

                // Reset state to idle before retrying (since processEvent expects to start from idle/start of logic)
                // Actually processEvent sets 'thinking' immediately.
                // But we need to be careful about state.
                // If we recursively call, we are still in the "tick".
                // Let's just force state to idle internally if needed or just let the recursive call handle it.
                // But wait, processEvent calls setState('thinking').
                // If current state is thinking/acting, we need to reset?
                // The recursive call will try to transition thinking -> thinking which is invalid.
                // So we must reset state.
                this.state = 'idle';
                retrying = true;
                return this.processEvent(event, retryCount + 1);
            } else {
                // Dead letter queue
                if (this.failedEvents.length >= this.maxFailedEvents) {
                    this.failedEvents.shift();
                }
                this.failedEvents.push({ event, error: error.message, timestamp: Date.now() });
                console.error(`[Loop] Event failed after ${this.maxRetries} retries:`, event.type);
            }
        } finally {
            if (!retrying) {
                this.state = 'idle';
            }
        }
    }

    /**
     * Reflects on the outcome of the cycle.
     * @param {Object} event
     * @param {Object} decision (LLM Result)
     * @param {Object} actionResult
     */
    async reflect(event, decision, actionResult) {
        try {
            // Did the action succeed?
            const success = !actionResult || !actionResult.error;

            if (success) {
                console.log(`[Loop] ✓ Cycle succeeded for ${event.type}`);
                
                if (event.type === 'user:input' || event.type === 'delegate') {
                    const agentName = this.agent?.constructor?.config?.className?.split('.').pop() || 'unknown';
                    const modelName = this.provider?.model || this.provider?.modelName || 'unknown';
                    const sessionId = this.agent?.sessionId || 'default-session';
                    
                    await SDK.Memory_Service.addMemory({
                        prompt: event.data,
                        thought: decision.thought || 'Internal reflection',
                        response: decision.content || 'Action executed successfully.',
                        agent: agentName.toLowerCase(),
                        model: modelName,
                        sessionId: sessionId
                    });
                }
            } else {
                console.log(`[Loop] ✗ Action failed for ${event.type}`);
                // Could re-queue with different approach or escalate to human
            }
        } catch (error) {
            console.warn('[Loop] Reflection failed (non-fatal):', error.message);
        }
    }

    /**
     * Executes tools requested by the LLM.
     * @param {Object[]} toolCalls List of tool calls from the provider.
     * @returns {Promise<Object[]>} Results of tool executions.
     */
    async executeTools(toolCalls) {
        let results = [];
        for (const call of toolCalls) {
            console.log(`[Loop] Executing Tool: ${call.function.name}`);
            try {
                const name = call.function.name;
                const args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;

                if (this.toolRegistry && this.toolRegistry[name]) {
                    // Route to injected MCP client
                    const entry = this.toolRegistry[name];
                    console.log(`[Loop] Routing tool '${name}' to MCP Server '${entry.clientName}'`);
                    
                    const res = await entry.client.callTool(name, args);
                    results.push({ name, result: res });
                } else if (name === 'delegate_task') {
                    if (this.agent) {
                        const res = await this.agent.delegate(args.agent, args.query);
                        results.push({ name, result: res });
                    } else {
                        results.push({ name, error: 'Agent reference missing for delegation.' });
                    }
                } else {
                    results.push({ name, error: `Unknown tool: ${name}` });
                }
            } catch (err) {
                console.error(`[Loop] Tool Error:`, err);
                results.push({ name: call.function.name, error: err.message });
            }
        }
        return results;
    }
}

export default Neo.setupClass(Loop);
