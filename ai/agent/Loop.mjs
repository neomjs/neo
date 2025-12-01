import Assembler       from '../context/Assembler.mjs';
import Base            from '../../src/core/Base.mjs';
import ClassSystemUtil from '../../src/util/ClassSystem.mjs';
import Provider        from '../provider/Base.mjs';

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
            acting    : ['reflecting', 'idle'],
            reflecting: ['idle']
        }
    }

    /**
     * Dead letter queue for unrecoverable events.
     * @member {Object[]} failedEvents=[]
     */
    failedEvents = []

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

            // 2. Reason (LLM Inference)
            const messages = [
                {role: 'system', content: context.system},
                ...context.messages
            ];

            const result = await this.provider.generate(messages);
            console.log(`[Loop] Model Response: ${result.content}`);

            // 3. Act (Tool Execution - Stub)
            let actionResult = null;
            if (result.raw?.toolCalls) { // Hypothetical check
                this.state = 'acting';
                // Execute tools...
                // actionResult = await this.executeTools(result.raw.toolCalls);
            }

            // 4. Reflect
            this.state = 'reflecting';
            await this.reflect(event, result, actionResult);

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
                // Store pattern to memory-core for future reference
                // await Memory_Service.storePattern({ event, decision, result: actionResult });
            } else {
                console.log(`[Loop] ✗ Action failed for ${event.type}`);
                // Could re-queue with different approach or escalate to human
            }
        } catch (error) {
            console.warn('[Loop] Reflection failed (non-fatal):', error.message);
        }
    }
}

export default Neo.setupClass(Loop);
