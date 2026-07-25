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

const FATAL_STARTUP_LOGGER_CONFIG = {
    ...DEFAULT_LOGGER_CONFIG,
    stderrMode: 'force'
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
 * @summary Normalizes a positive finite byte budget; invalid values disable that dimension.
 * @param {*} value
 * @returns {Number|null}
 */
const normalizeRetentionByteSize = value => {
    const normalized = normalizeRetentionNumber(value, true);

    return normalized > 0 ? normalized : null;
};

/**
 * @summary Resolves the durable MCP file-log retention policy from config.
 *
 * The shared logger reads the Provider-owned `loggerRetention` namespace used by MCP
 * server config templates first, then `logger.retention` for direct test/fallback configs.
 * Invalid numeric values degrade to a disabled dimension instead of crashing the server.
 *
 * `maxFiles` and `maxTotalBytes` cap historical matching files; the active current-day
 * file is always kept.
 *
 * @param {Object} aiConfig
 * @param {Object} loggerConfig
 * @returns {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null),maxTotalBytes:(Number|null)}}
 */
export const resolveLoggerRetention = (aiConfig, loggerConfig = {}) => {
    const data   = getConfigData(aiConfig);
    const policy = data.loggerRetention ?? loggerConfig.retention ?? {};

    if (policy.enabled === false) {
        return {
            enabled      : false,
            maxAgeDays   : null,
            maxFiles     : null,
            maxTotalBytes: null
        };
    }

    return {
        enabled      : true,
        maxAgeDays   : normalizeRetentionNumber(policy.maxAgeDays),
        maxFiles     : normalizeRetentionNumber(policy.maxFiles, true),
        maxTotalBytes: normalizeRetentionByteSize(policy.maxTotalBytes)
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
 * @param {Boolean} [options.includeSize=false]
 * @param {Function} [options.readDir]
 * @param {Function} [options.statFile]
 * @returns {Array<{name:String,filePath:String,date:String,time:Number,size:(Number|undefined)}>}
 */
export const listHistoricalLogFiles = ({
    logDir,
    filePrefix,
    today,
    includeSize = false,
    readDir = fs.readdirSync,
    statFile = fs.statSync
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

            const filePath = path.join(logDir, entry.name);

            return {
                name: entry.name,
                filePath,
                date: match[1],
                time    : Date.parse(`${match[1]}T00:00:00.000Z`),
                size    : includeSize ? statFile(filePath).size : undefined
            };
        })
        .filter(Boolean)
        .filter(entry => Number.isFinite(entry.time));
};

/**
 * @summary Selects matching historical MCP log files that exceed the retention policy.
 * @param {Object} options
 * @param {Array<{filePath:String,date:String,time:Number,size:(Number|undefined)}>} options.files
 * @param {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null),maxTotalBytes:(Number|null)}} options.retention
 * @param {String} options.today
 * @returns {Array<{filePath:String,date:String,time:Number,size:(Number|undefined)}>}
 */
export const selectPrunableLogFiles = ({files, retention, today}) => {
    if (!retention?.enabled ||
        (retention.maxAgeDays == null && retention.maxFiles == null && retention.maxTotalBytes == null)) {
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

    if (Number.isFinite(retention.maxTotalBytes)) {
        let retainedBytes = 0;

        [...files]
            .sort((a, b) => b.time - a.time || b.filePath.localeCompare(a.filePath))
            .forEach(file => {
                const size = Number.isFinite(file.size) ? file.size : 0;

                retainedBytes += size;

                if (retainedBytes > retention.maxTotalBytes) {
                    prunable.add(file.filePath);
                }
            });
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
 * @param {{enabled:Boolean,maxAgeDays:(Number|null),maxFiles:(Number|null),maxTotalBytes:(Number|null)}} options.retention
 * @param {Object} options.loggerConfig
 * @param {Function} [options.readDir]
 * @param {Function} [options.statFile]
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
    statFile = fs.statSync,
    unlinkFile = fs.unlinkSync,
    warn = warnRetentionFailure
}) => {
    if (!retention?.enabled ||
        (retention.maxAgeDays == null && retention.maxFiles == null && retention.maxTotalBytes == null)) {
        return 0;
    }

    try {
        const files = listHistoricalLogFiles({
            logDir,
            filePrefix,
            today,
            readDir,
            statFile,
            includeSize: Number.isFinite(retention.maxTotalBytes)
        });
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
 * - file-only diagnostics: `fileDebug()` writes durable debug entries without touching stderr
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

    const deadSinkKeys  = new Set();
    const announcedKeys = new Set();

    const announceSinkFailure = (key, error, loggerConfig) => {
        deadSinkKeys.add(key);

        if (!announcedKeys.has(key)) {
            announcedKeys.add(key);
            process.stderr.write(formatLogLine('error', [`[logger] file sink unavailable, degrading to stderr: ${error.message}`], loggerConfig));
        }
    };

    const resolveLogDir = loggerConfig => {
        const logDir = loggerConfig.logPath || getConfigData(aiConfig).logPath;

        if (!logDir) {
            // No silent canonical-path fallback: a file-sink logger whose config resolves no
            // log path is a boot defect. The declared logPath leaf (or loggerConfig.logPath)
            // is the only sanctioned source; deriving `.neo-ai-data/logs` here bypassed every
            // env-bound plane binding and wrote into the canonical plane.
            throw new Error(
                '[logger] file sink requested but no log path resolves — declare the ' +
                'server\'s logPath leaf (or pass loggerConfig.logPath). The rootDir-derived ' +
                'canonical fallback was removed deliberately; refusing to guess a plane path.'
            );
        }

        return logDir;
    };

    const getStream = loggerConfig => {
        const logDir = resolveLogDir(loggerConfig);
        const today  = new Date().toISOString().slice(0, 10);
        const key    = `${logDir}::${loggerConfig.filePrefix}::${today}`;

        if (deadSinkKeys.has(key)) return null;

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

            // Asynchronous containment: open/write failures on a WriteStream (EISDIR on a
            // directory-shaped filename, ENOSPC mid-stream) surface as a later 'error' EVENT,
            // not a throw — without a listener the event escapes as uncaughtException and
            // kills the serving process. Mark the sink dead; writeFile degrades from here on.
            currentStream.on('error', e => {
                announceSinkFailure(key, e, loggerConfig);

                if (currentStreamKey === key) {
                    currentStreamKey = null;
                    currentStream    = null;
                }
            });
        }

        return currentStream;
    };

    const writeFile = (level, args, loggerConfig) => {
        if (!loggerConfig.fileSink) return;

        // One-reality guard: while a Neo config provider is still booting (`isReady` false),
        // its leaves expose ANCHOR DEFAULTS — on an env-relocated deployment the first write
        // would land in the canonical plane. Pre-ready lines route to stderr; the file sink
        // starts with the resolved overlay. Plain-object configs carry no `isReady` and are
        // file-eligible immediately; the read is deliberately direct — a non-object caller is
        // a contract violation that fails loud here (no defensive `?.`).
        if (aiConfig.isReady === false) {
            process.stderr.write(formatLogLine(level, args, loggerConfig));
            return;
        }

        let stream = null;

        try {
            stream = getStream(loggerConfig);
        } catch (e) {
            // Synchronous sink failure (unwritable dir, dangling symlink, unresolvable path
            // at runtime) must never kill a serving process — path validity is the
            // plane-coherence boot assertion's job.
            announceSinkFailure(`${loggerConfig.logPath || getConfigData(aiConfig).logPath || ''}::${loggerConfig.filePrefix}`, e, loggerConfig);
        }

        if (stream) {
            stream.write(formatLogLine(level, args, loggerConfig));
        } else {
            process.stderr.write(formatLogLine(level, args, loggerConfig));
        }
    };

    const writeStderr = (level, args, loggerConfig) => {
        const data = getConfigData(aiConfig);

        if (loggerConfig.stderrMode === 'force') {
            process.stderr.write(formatLogLine(level, args, loggerConfig));
            return;
        }

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

    const createLogMethod = (level, options = {}) => (...args) => {
        const loggerConfig = getLoggerConfig(aiConfig, fallbackLoggerConfig);

        writeFile(level, args, loggerConfig);
        if (options.fileOnly) return;

        writeStderr(level, args, options.forceStderr ? {
            ...loggerConfig,
            ...FATAL_STARTUP_LOGGER_CONFIG
        } : loggerConfig);
    };

    const logger = {
        debug       : createLogMethod('debug'),
        error       : createLogMethod('error'),
        fatalStartup: createLogMethod('error', {forceStderr: true}),
        fileDebug   : createLogMethod('debug', {fileOnly: true}),
        info        : createLogMethod('info'),
        log         : createLogMethod('log'),
        warn        : createLogMethod('warn')
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

    // Boot-time contract: a file-sink logger must resolve its log dir at construction, so an
    // empty/partial config reaching a file sink throws HERE — the construction stack names the
    // defective caller. Runtime sink failures degrade in writeFile instead; only the
    // cannot-resolve-at-all case is a construction defect.
    const bootConfig = getLoggerConfig(aiConfig, fallbackLoggerConfig);

    bootConfig.fileSink && resolveLogDir(bootConfig);

    return logger;
};

export default createLogger;
