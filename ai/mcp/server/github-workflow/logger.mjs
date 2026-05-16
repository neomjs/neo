import aiConfig from './config.mjs';

/**
 * A simple stderr logger with priority-based filtering.
 * Keeps MCP server noise low by default while preserving fail-loud error output.
 */
const logger = {};

const LEVEL_PRIORITY = {
    error: 0,
    warn : 1,
    info : 2,
    log  : 2,
    debug: 3
};

const DEFAULT_LOG_LEVEL = 'warn';

const getConfiguredLogLevel = () => {
    const configuredLevel = aiConfig.logLevel;

    if (aiConfig.debug && (!configuredLevel || configuredLevel === DEFAULT_LOG_LEVEL)) {
        return 'debug';
    }

    if (configuredLevel && LEVEL_PRIORITY[configuredLevel] !== undefined) {
        return configuredLevel;
    }

    return aiConfig.debug ? 'debug' : DEFAULT_LOG_LEVEL;
};

const createLogMethod = (level) => {
    return (...args) => {
        if (level === 'error') {
            console.error(`[${level.toUpperCase()}]`, ...args);
            return;
        }

        const configuredLevel = getConfiguredLogLevel();

        if (LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[configuredLevel]) {
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
