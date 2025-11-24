import aiConfig from './config.mjs';

/**
 * @summary A simple logger that writes to stderr only when the global debug flag is enabled.
 *
 * A simple logger that writes to stderr only when the global debug flag is enabled.
 * This prevents corrupting the MCP stdio transport and keeps production output clean.
 */
const logger = {};

const createLogMethod = (level) => {
    return (...args) => {
        if (aiConfig.debug) {
            console.error(`[${level.toUpperCase()}]`, ...args);
        }
    };
};

logger.debug = createLogMethod('debug');
logger.info  = createLogMethod('info');
logger.log   = createLogMethod('log');
logger.warn  = createLogMethod('warn');
logger.error = createLogMethod('error');

export default logger;
