import aiConfig from './config.mjs';

/**
 * @summary Stderr logger for the GitLab Workflow MCP server.
 *
 * Mirrors the sibling workflow-server logger and keeps MCP stdout reserved for
 * protocol traffic while allowing operator-selected verbosity via config/env.
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

/**
 * @summary Resolves the effective log level from config and debug state.
 * @returns {String}
 */
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

/**
 * @summary Creates one stderr log function with priority filtering.
 * @param {String} level
 * @returns {Function}
 */
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
