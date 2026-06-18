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

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * @summary Normalizes a non-negative finite number; invalid values disable that dimension.
 * @param {*} value
 * @param {Boolean} [integer=false]
 * @returns {Number|null}
 */
const normalizeRetentionNumber = (value, integer = false) => {
    if (!Number.isFinite(value) || value < 0) {
        return null;
    }

    return integer ? Math.floor(value) : value;
};

/**
 * @summary Resolves the durable MCP file-log retention policy from config.
 *
 * The shared logger reads the Provider-owned `loggerRetention` namespace used by MCP
 * server config templates first, then `logger.retention` for direct test/fallback configs.
 * Invalid numeric values degrade to a disabled dimension instead of crashing the server.
 *
 * `maxFiles` caps historical matching files; the active current-day file is always kept.
 *
 * @param {Object} aiConfig
 * @param {Object} loggerConfig
 * @returns {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null)}}
 */
export const resolveLoggerRetention = (aiConfig, loggerConfig = {}) => {
    const data   = getConfigData(aiConfig);
    const policy = data.loggerRetention ?? loggerConfig.retention ?? {};

    if (policy.enabled === false) {
        return {
            enabled   : false,
            maxAgeDays: null,
            maxFiles  : null
        };
    }

    return {
        enabled   : true,
        maxAgeDays: normalizeRetentionNumber(policy.maxAgeDays),
        maxFiles  : normalizeRetentionNumber(policy.maxFiles, true)
    };
};

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
 * @summary Emits a bounded retention-prune warning to stderr without throwing.
 * @param {*} error
 * @param {Object} loggerConfig
 * @returns {void}
 */
const warnRetentionFailure = (error, loggerConfig) => {
    const message = error instanceof Error ? error.message : String(error);

    try {
        process.stderr.write(formatLogLine(
            'warn',
            [`MCP logger retention prune failed for prefix "${loggerConfig.filePrefix}": ${message}`],
            loggerConfig
        ));
    } catch {
        // Logging must never make the MCP server fail to boot.
    }
};

/**
 * @summary Builds metadata for historical log files matching the active logger prefix.
 * @param {Object} options
 * @param {String} options.logDir
 * @param {String} options.filePrefix
 * @param {String} options.today
 * @param {Function} [options.readDir]
 * @returns {Array<{name:String,filePath:String,date:String,time:Number}>}
 */
export const listHistoricalLogFiles = ({
    logDir,
    filePrefix,
    today,
    readDir = fs.readdirSync
}) => {
    const escapedPrefix = filePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher       = new RegExp(`^${escapedPrefix}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);

    return readDir(logDir, {withFileTypes: true})
        .filter(entry => entry.isFile())
        .map(entry => {
            const match = entry.name.match(matcher);

            if (!match || match[1] === today) {
                return null;
            }

            return {
                name    : entry.name,
                filePath: path.join(logDir, entry.name),
                date    : match[1],
                time    : Date.parse(`${match[1]}T00:00:00.000Z`)
            };
        })
        .filter(Boolean)
        .filter(entry => Number.isFinite(entry.time));
};

/**
 * @summary Selects matching historical MCP log files that exceed the retention policy.
 * @param {Object} options
 * @param {Array<{filePath:String,date:String,time:Number}>} options.files
 * @param {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null)}} options.retention
 * @param {String} options.today
 * @returns {Array<{filePath:String,date:String,time:Number}>}
 */
export const selectPrunableLogFiles = ({files, retention, today}) => {
    if (!retention?.enabled || (retention.maxAgeDays == null && retention.maxFiles == null)) {
        return [];
    }

    const prunable = new Set();
    const todayTime = Date.parse(`${today}T00:00:00.000Z`);

    if (Number.isFinite(retention.maxAgeDays) && Number.isFinite(todayTime)) {
        const maxAgeMs = retention.maxAgeDays * DAY_MS;

        files.forEach(file => {
            if (todayTime - file.time > maxAgeMs) {
                prunable.add(file.filePath);
            }
        });
    }

    if (Number.isInteger(retention.maxFiles)) {
        [...files]
            .sort((a, b) => b.time - a.time || b.filePath.localeCompare(a.filePath))
            .slice(retention.maxFiles)
            .forEach(file => prunable.add(file.filePath));
    }

    return files.filter(file => prunable.has(file.filePath));
};

/**
 * @summary Prunes historical MCP log files for one logger prefix.
 *
 * The active current-day file is excluded before selection, so a retention pass can never
 * delete the file the stream is about to append to.
 *
 * @param {Object} options
 * @param {String} options.logDir
 * @param {String} options.filePrefix
 * @param {String} options.today
 * @param {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null)}} options.retention
 * @param {Object} options.loggerConfig
 * @param {Function} [options.readDir]
 * @param {Function} [options.unlinkFile]
 * @param {Function} [options.warn]
 * @returns {Number}
 */
export const pruneLoggerRetention = ({
    logDir,
    filePrefix,
    today,
    retention,
    loggerConfig,
    readDir = fs.readdirSync,
    unlinkFile = fs.unlinkSync,
    warn = warnRetentionFailure
}) => {
    if (!retention?.enabled || (retention.maxAgeDays == null && retention.maxFiles == null)) {
        return 0;
    }

    try {
        const files = listHistoricalLogFiles({logDir, filePrefix, today, readDir});
        const prune = selectPrunableLogFiles({files, retention, today});

        prune.forEach(file => unlinkFile(file.filePath));

        return prune.length;
    } catch (error) {
        warn(error, loggerConfig);
        return 0;
    }
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
            pruneLoggerRetention({
                logDir,
                today,
                loggerConfig,
                filePrefix: loggerConfig.filePrefix,
                retention : resolveLoggerRetention(aiConfig, loggerConfig)
            });

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
