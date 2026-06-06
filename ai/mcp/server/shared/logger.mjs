import fs   from 'fs';
import path from 'path';

const LEVEL_PRIORITY = {
    error: 0,
    warn : 1,
    info : 2,
    log  : 2,
    debug: 3
};

const DEFAULT_LOGGER_CONFIG = {
    defaultLevel  : 'warn',
    filePrefix    : 'mcp-server',
    fileSink      : false,
    flush         : false,
    stderrMode    : 'threshold',
    timestampStyle: 'plain'
};

/**
 * @summary Extracts the live config data from either a ConfigProvider proxy or a plain object.
 *
 * MCP server configs are mutable during tests and after config-file loading, so the shared
 * logger resolves config lazily per write instead of freezing options at module import time.
 *
 * @param {Object} aiConfig
 * @returns {Object}
 */
const getConfigData = aiConfig => aiConfig?.data ?? aiConfig ?? {};

/**
 * @summary Resolves the MCP logger config slot with conservative defaults.
 * @param {Object} aiConfig
 * @param {Object} fallbackLoggerConfig
 * @returns {Object}
 */
const getLoggerConfig = (aiConfig, fallbackLoggerConfig = {}) => ({
    ...DEFAULT_LOGGER_CONFIG,
    ...fallbackLoggerConfig,
    ...(getConfigData(aiConfig).logger ?? {})
});

/**
 * @summary Serializes arbitrary log arguments without throwing inside the logger.
 * @param {*} value
 * @returns {String}
 */
export const stringifyLogArg = value => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ''}`.trim();

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

/**
 * @summary Formats the durable file line for a logger entry.
 * @param {String} level
 * @param {Array} args
 * @param {Object} loggerConfig
 * @returns {String}
 */
export const formatLogLine = (level, args, loggerConfig) => {
    const timestamp = new Date().toISOString();
    const upper     = level.toUpperCase();

    if (loggerConfig.timestampStyle === 'bracketed') {
        const [message = '', ...rest] = args;
        const tail = rest.length ? ` ${rest.map(stringifyLogArg).join(' ')}` : '';

        return `[${timestamp}] [${upper}] ${stringifyLogArg(message)}${tail}\n`;
    }

    return `${timestamp} [${upper}] ${args.map(stringifyLogArg).join(' ')}\n`;
};

/**
 * @summary Resolves the effective priority-filtered stderr log level.
 * @param {Object} aiConfig
 * @param {Object} loggerConfig
 * @returns {String}
 */
const getConfiguredLogLevel = (aiConfig, loggerConfig) => {
    const data            = getConfigData(aiConfig);
    const defaultLevel    = LEVEL_PRIORITY[loggerConfig.defaultLevel] === undefined ? 'warn' : loggerConfig.defaultLevel;
    const configuredLevel = loggerConfig.logLevel ?? data.logLevel;

    if (data.debug && (!configuredLevel || configuredLevel === defaultLevel)) {
        return 'debug';
    }

    if (configuredLevel && LEVEL_PRIORITY[configuredLevel] !== undefined) {
        return configuredLevel;
    }

    return data.debug ? 'debug' : defaultLevel;
};

/**
 * @summary Creates a protocol-safe MCP logger from a server config object.
 *
 * The shared primitive preserves the existing per-server contracts via each server's
 * `logger` config slot:
 *
 * - workflow servers: priority-filtered stderr only (`stderrMode: "threshold"`)
 * - KB / Memory Core: always-on file sink plus debug-gated stderr
 * - Neural Link: always-on file sink plus tier-gated stderr
 *
 * The logger never writes to stdout. `error()` logs and never throws.
 *
 * @param {Object} aiConfig
 * @param {Object} fallbackLoggerConfig
 * @returns {Object}
 */
export const createLogger = (aiConfig = {}, fallbackLoggerConfig = {}) => {
    let currentStreamKey = null;
    let currentStream    = null;

    const getStream = loggerConfig => {
        const data   = getConfigData(aiConfig);
        const logDir = loggerConfig.logPath || data.logPath ||
            path.resolve(data.neoRootDir || data.projectRoot || process.cwd(), '.neo-ai-data/logs');
        const today  = new Date().toISOString().slice(0, 10);
        const key    = `${logDir}::${loggerConfig.filePrefix}::${today}`;

        if (currentStreamKey !== key) {
            if (currentStream) currentStream.end();

            fs.mkdirSync(logDir, {recursive: true});
            currentStreamKey = key;
            currentStream    = fs.createWriteStream(path.join(logDir, `${loggerConfig.filePrefix}-${today}.log`), {flags: 'a'});
        }

        return currentStream;
    };

    const writeFile = (level, args, loggerConfig) => {
        if (!loggerConfig.fileSink) return;

        getStream(loggerConfig).write(formatLogLine(level, args, loggerConfig));
    };

    const writeStderr = (level, args, loggerConfig) => {
        const data = getConfigData(aiConfig);

        if (loggerConfig.stderrMode === 'debug') {
            if (data.debug) {
                console.error(`[${level.toUpperCase()}]`, ...args);
            }
            return;
        }

        if (loggerConfig.stderrMode === 'tiered') {
            if (data.debug || level !== 'debug') {
                process.stderr.write(formatLogLine(level, args, loggerConfig));
            }
            return;
        }

        if (loggerConfig.stderrMode === 'threshold') {
            const configuredLevel = getConfiguredLogLevel(aiConfig, loggerConfig);

            if (level === 'error' || LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[configuredLevel]) {
                console.error(`[${level.toUpperCase()}]`, ...args);
            }
        }
    };

    const createLogMethod = level => (...args) => {
        const loggerConfig = getLoggerConfig(aiConfig, fallbackLoggerConfig);

        writeFile(level, args, loggerConfig);
        writeStderr(level, args, loggerConfig);
    };

    const logger = {
        debug: createLogMethod('debug'),
        error: createLogMethod('error'),
        info : createLogMethod('info'),
        log  : createLogMethod('log'),
        warn : createLogMethod('warn')
    };

    if (getLoggerConfig(aiConfig, fallbackLoggerConfig).flush) {
        /**
         * @summary Flushes the active durable log stream before immediate process termination.
         * @returns {Promise<void>}
         */
        logger.flush = () => new Promise(resolve => {
            if (!currentStream) {
                resolve();
                return;
            }

            currentStream.write('', resolve);
        });
    }

    return logger;
};

export default createLogger;
