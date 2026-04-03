import Agent from '../../Agent.mjs';

/**
 * A specialized sub-agent for navigating the topological knowledge graph
 * and synthesizing architectural research via GraphRAG.
 *
 * @class Neo.ai.agent.profile.Librarian
 * @extends Neo.ai.Agent
 */
class Librarian extends Agent {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.profile.Librarian'
         * @protected
         */
        className: 'Neo.ai.agent.profile.Librarian',
        /**
         * The Librarian exclusively connects to the knowledge-base server.
         * @member {String[]} servers=['knowledge-base']
         */
        servers: ['knowledge-base'],
        /**
         * Configurable model provider. Defaults to 'gemini' for reasoning speed
         * but can be instantiated with 'ollama' (e.g. gemma-4-31b-it) to support
         * swarms and offline sub-agent spawning.
         * @member {String|Neo.ai.provider.Base} modelProvider='gemini'
         */
        modelProvider: 'gemini',
        /**
         * Specialized system prompt tailored for GraphRAG synthesis.
         * The loop will inject this when processing research tasks.
         * @member {String} systemPrompt
         */
        systemPrompt: 'You are the Librarian, a specialized sub-agent expert in architectural research. You have access to a topological knowledge graph of the Neo.mjs framework. Navigate the graph using the provided tools to synthesize highly accurate, contextual answers.'
    }
}

export default Neo.setupClass(Librarian);
