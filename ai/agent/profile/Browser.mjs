import Agent from '../../Agent.mjs';

/**
 * A specialized sub-agent for autonomous telemetry and visual DOM manipulation.
 *
 * @class Neo.ai.agent.profile.Browser
 * @extends Neo.ai.Agent
 */
class Browser extends Agent {
    static config = {
        /**
         * @member {String} className='Neo.ai.agent.profile.Browser'
         * @protected
         */
        className: 'Neo.ai.agent.profile.Browser',
        /**
         * Configurable model provider.
         * @member {String|Neo.ai.provider.Base} modelProvider='gemini'
         */
        modelProvider: 'gemini',
        /**
         * Connects to the Neural-Link and Chrome DevTools MCP servers.
         * @member {String[]} servers=['chrome-devtools','neural-link']
         */
        servers: ['chrome-devtools', 'neural-link'],
        /**
         * Specialized system prompt tailored for visual inspection and control.
         * @member {String} systemPrompt
         */
        systemPrompt: 'You are the Browser, a specialized sub-agent expert in visual telemetry and component tree interrogation. You have direct access to the active Neo.mjs App Worker session. Your mandate is to inspect visual component trees, fetch computed styles, simulate events, and report actual DOM/VDOM state back to the orchestrator utilizing your registered tools.'
    }
}

export default Neo.setupClass(Browser);
