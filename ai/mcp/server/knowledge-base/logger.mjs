import aiConfig from './config.mjs';
import fs       from 'fs';
import path     from 'path';

/**
 * @summary Dual-sink logger: always-on file diagnostic + debug-gated stderr.
 *
 * Two sinks for different audiences:
 *
 * 1. **File sink (always-on):** writes every entry to a daily-rotated log file under
 *    `${aiConfig.logPath}` (default `${neoRootDir}/.neo-ai-data/logs/`). Captures KB
 *    server progress regardless of `aiConfig.debug`, so long-running operations
 *    (`manage_knowledge_base sync`, large embedding loops, ChromaDB lifecycle) leave
 *    a tail-able diagnostic trail. Invented in #10576 — the gap that surfaced during
 *    the 2026-05-01 KB resync when no operator could observe progress.
 *
 * 2. **Stderr sink (debug-flag-gated):** preserves prior behavior — when
 *    `aiConfig.debug === true`, log entries also write to stderr. Stays gated to
 *    avoid corrupting the MCP stdio transport on stdout and to keep production
 *    output minimal.
 *
 * Daily rotation + log-dir resolution happen lazily per-write via a cached stream
 * keyed on `${logDir}::${today}`, so a daemon running across midnight transitions
 * cleanly to a new file AND late `aiConfig.logPath` overrides (e.g., from tests)
 * take effect on the next write. Stream `flags: 'a'` makes restarts and concurrent
 * writers append rather than truncate. `mkdirSync` is idempotent under
 * `{recursive: true}`.
 */
let currentStreamKey = null;
let currentStream    = null;

const getStream = () => {
    const logDir = aiConfig.logPath || path.resolve(aiConfig.neoRootDir, '.neo-ai-data/logs');
    const today  = new Date().toISOString().slice(0, 10);
    const key    = `${logDir}::${today}`;

    if (currentStreamKey !== key) {
        if (currentStream) currentStream.end();
        fs.mkdirSync(logDir, {recursive: true});
        currentStreamKey = key;
        currentStream    = fs.createWriteStream(path.join(logDir, `kb-server-${today}.log`), {flags: 'a'});
    }
    return currentStream;
};

const stringifyArg = (a) => {
    if (typeof a === 'string') return a;
    // Error instances must be unpacked manually — Error.message and Error.stack are
    // non-enumerable, so JSON.stringify(err) yields `{}` and silently destroys the
    // post-mortem evidence the file sink exists to preserve.
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`.trim();
    try {
        return JSON.stringify(a);
    } catch {
        // Circular references or other JSON.stringify failures — fall back to String coercion
        // so the log entry still lands rather than throwing inside the logger itself.
        return String(a);
    }
};

const formatLine = (level, args) => {
    const timestamp = new Date().toISOString();
    const message   = args.map(stringifyArg).join(' ');
    return `${timestamp} [${level.toUpperCase()}] ${message}\n`;
};

const logger = {};

const createLogMethod = (level) => {
    return (...args) => {
        getStream().write(formatLine(level, args));
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
