import aiConfig from './config.mjs';

/**
 * A simple logger that only logs when the debug flag is enabled in the AI configuration.
 * This is to prevent logging to stdout in MCP servers, which can corrupt JSON-RPC messages.
 * stderr is fine.
 */
const logger = {
    log: (...args) => {
        if (aiConfig.debug) {
            console.log(...args);
        }
    }
};

export default logger;