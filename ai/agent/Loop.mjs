import Base from '../../src/core/Base.mjs';

/**
 * The cognitive event loop for the Agent.
 * Orchestrates the "Perceive -> Reason -> Act" cycle.
 *
 * @class Neo.ai.agent.Loop
 * @extends Neo.core.Base
 */
class Loop extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.Loop'
         * @protected
         */
        className: 'Neo.ai.agent.Loop',
        /**
         * The Context Assembler instance.
         * @member {Neo.ai.context.Assembler} assembler=null
         */
        assembler: null,
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
         * The AI Provider instance.
         * @member {Neo.ai.provider.Base} provider=null
         */
        provider: null,
        /**
         * The Event Scheduler instance.
         * @member {Neo.ai.agent.Scheduler} scheduler=null
         */
        scheduler: null,
        /**
         * State of the loop.
         * @member {String} state='idle'
         */
        state: 'idle' // idle, thinking, acting
    }

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
                await this.processEvent(event);
            }
        }

        // Schedule next tick
        setTimeout(() => this.tick(), this.interval);
    }

    /**
     * Processes a single event through the cognitive pipeline.
     * @param {Object} event
     */
    async processEvent(event) {
        console.log(`[Loop] Processing event: [${event.priority}] ${event.type}`);
        this.state = 'thinking';

        try {
            // 1. Assemble Context
            // TODO: Differentiate between user prompt events and system events for 'userQuery'
            const context = await this.assembler.assemble({
                systemPrompt: 'You are an autonomous agent.', // Should be configurable
                userQuery: event.data || 'No content',
                // ragQuery: Extract keywords?
            });

            // 2. Reason (LLM Inference)
            const messages = [
                {role: 'system', content: context.system},
                ...context.messages
            ];

            const result = await this.provider.generate(messages);
            console.log(`[Loop] Model Response: ${result.content}`);

            // 3. Act (Tool Execution - Stub)
            if (result.raw?.toolCalls) { // Hypothetical check
                this.state = 'acting';
                // Execute tools...
            }

        } catch (error) {
            console.error('[Loop] Error during event processing:', error);
        } finally {
            this.state = 'idle';
        }
    }
}

export default Neo.setupClass(Loop);
