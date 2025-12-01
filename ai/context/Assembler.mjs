import Base from '../../src/core/Base.mjs';
import {
    Memory_Service,
    Memory_SessionService,
    Memory_SummaryService,
    KB_QueryService
} from '../services.mjs';

/**
 * Manages the assembly of the LLM context window.
 * Combines System Prompt, Short-Term Memory (Session History), and Long-Term Memory (RAG).
 * Uses the "Thick Client" pattern to access Memory Services directly.
 *
 * @class Neo.ai.context.Assembler
 * @extends Neo.core.Base
 */
class ContextAssembler extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.context.Assembler'
         * @protected
         */
        className: 'Neo.ai.context.Assembler',
        /**
         * Number of messages to keep before compressing.
         * @member {Number} compressionThreshold=20
         */
        compressionThreshold: 20,
        /**
         * Number of initial messages to keep as context when compressing.
         * @member {Number} contextCount=5
         */
        contextCount: 5,
        /**
         * Maximum tokens allowed in the context window.
         * Used for pruning history.
         * @member {Number} maxTokens=1000000
         */
        maxTokens: 1000000,
        /**
         * Number of most recent messages to keep when compressing.
         * @member {Number} recentCount=10
         */
        recentCount: 10
    }

    /**
     * Ensure services are ready before use.
     */
    async initAsync() {
        await super.initAsync();
        // SessionService readiness implies ChromaManager readiness
        try {
            await Memory_SessionService.ready();
            // KB Service might be optional depending on usage, but good to have ready
            await KB_QueryService.ready();
        } catch (e) {
            console.warn('[ContextAssembler] Service initialization warning:', e);
        }
    }

    /**
     * Assembles the full context payload for the LLM.
     *
     * @param {Object} options
     * @param {String} options.systemPrompt The base system prompt (identity, rules).
     * @param {String} options.userQuery    The current user input or event trigger.
     * @param {String} [options.ragQuery]   Optional query to fetch long-term memories.
     * @param {String} [options.sessionId]  The session ID to fetch context for.
     * @returns {Promise<{system: String, messages: Array}>}
     */
    async assemble({systemPrompt, userQuery, ragQuery, sessionId}) {
        let ragContext = '';

        // 1. Fetch Long-Term Memory (RAG) if requested
        // We query both Memory Summaries (Past Work) and Knowledge Base (Docs)
        if (ragQuery) {
            try {
                // A. Query Past Session Summaries
                const summaryResult = await Memory_SummaryService.querySummaries({
                    query: ragQuery,
                    nResults: 3
                });

                if (summaryResult.results && summaryResult.results.length > 0) {
                    ragContext += this.formatSummaryContext(summaryResult.results);
                }

                // B. Query Knowledge Base (Documentation)
                const kbResult = await KB_QueryService.queryDocuments({
                    query: ragQuery,
                    limit: 3,
                    type: 'guide' // focus on concepts
                });

                if (kbResult.results) {
                     ragContext += this.formatKbContext(kbResult.results);
                }

            } catch (e) {
                console.warn('[ContextAssembler] Failed to fetch RAG context:', e);
            }
        }

        // 2. Fetch Short-Term Memory (Session History)
        let history = [];
        if (sessionId) {
            try {
                const result = await Memory_Service.listMemories({
                    sessionId,
                    limit: 50
                });

                if (result.memories) {
                    history = this.formatHistory(result.memories);
                }
            } catch (e) {
                console.warn('[ContextAssembler] Failed to fetch session history:', e);
            }
        }

        // 3. Combine System Prompt + RAG
        const augmentedSystemPrompt = this.augmentSystemPrompt(systemPrompt, ragContext);

        // 4. Construct Final Message Chain
        const messages = [
            ...history,
            { role: 'user', content: userQuery }
        ];

        return {
            system: augmentedSystemPrompt,
            messages: messages
        };
    }

    /**
     * Formats Session Summary results.
     * @param {Array} results
     * @returns {String}
     */
    formatSummaryContext(results) {
        if (!results || results.length === 0) return '';
        return `\n\nRelevant Context from Past Sessions:\n` +
            results.map(r => `- [${r.title}] (Relevance: ${r.relevanceScore}): ${r.summary}`).join('\n');
    }

    /**
     * Formats KB results.
     * @param {Array} results
     * @returns {String}
     */
    formatKbContext(results) {
        if (!results || results.length === 0) return '';
        return `\n\nRelevant Documentation:\n` +
            results.map(r => {
                const content = r.content || r.document || '';
                return `- [${r.path}] (Score: ${r.score}): ${content.substring(0, 200)}...`;
            }).join('\n');
    }

    /**
     * Formats raw memory entries into message objects.
     * @param {Array} memories
     * @returns {Array}
     */
    formatMessages(memories) {
        const messages = [];
        memories.forEach(m => {
            messages.push({ role: 'user', content: m.prompt });
            messages.push({ role: 'model', content: `Thought: ${m.thought}\n\n${m.response}` });
        });
        return messages;
    }

    /**
     * Formats raw memory entries into message history with compression.
     * @param {Array} memories
     * @returns {Array}
     */
    formatHistory(memories) {
        if (!memories || !Array.isArray(memories)) return [];

        if (memories.length > this.compressionThreshold) {
            // Keep first 5 (context) + last 10 (recent) + summarize middle
            const {contextCount, recentCount} = this;

            // Ensure we don't overlap if threshold is weirdly low
            if (memories.length > (contextCount + recentCount)) {
                const context     = memories.slice(0, contextCount);
                const recent      = memories.slice(-recentCount);
                const middleCount = memories.length - contextCount - recentCount;

                return [
                    ...this.formatMessages(context),
                    {
                        role   : 'system',
                        content: `[System Note: ${middleCount} intermediate messages were summarized to save context. Check Memory Core for details.]`
                    },
                    ...this.formatMessages(recent)
                ];
            }
        }

        return this.formatMessages(memories);
    }

    /**
     * Appends RAG context to the system prompt.
     * @param {String} basePrompt
     * @param {String} ragContext
     * @returns {String}
     */
    augmentSystemPrompt(basePrompt, ragContext) {
        return `${basePrompt}${ragContext}`;
    }
}

export default Neo.setupClass(ContextAssembler);
