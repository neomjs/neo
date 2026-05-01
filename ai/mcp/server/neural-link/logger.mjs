import aiConfig        from './config.mjs';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename     = fileURLToPath(import.meta.url);
const __dirname      = path.dirname(__filename);
// Neural Link's config doesn't export `neoRootDir` (unlike KB and Memory Core), so
// the logger computes its repo-rooted log fallback locally. Module path is stable
// (`ai/mcp/server/neural-link/logger.mjs` → up 4 → repo root) so a 4-level traversal
// is the canonical resolution.
const neoRootFallback = path.resolve(__dirname, '../../../../');

/**
 * @summary Dual-sink logger: always-on file diagnostic + tier-gated stderr.
 *
 * Symmetric with the Knowledge Base and Memory Core servers' loggers (#10576/#10580
 * and #10582). Two sinks:
 *
 * 1. **File sink (always-on):** writes every entry to a daily-rotated log file under
 *    `${aiConfig.logPath}` (default `${neoRootDir}/.neo-ai-data/logs/`). Captures
 *    Neural Link server progress regardless of `aiConfig.debug` so long-running
 *    inspection chains and DOM/VDOM introspection sweeps leave a tail-able
 *    diagnostic trail. File prefix `nl-server-` distinguishes from KB's
 *    `kb-server-` and Memory Core's `mc-server-` in the shared log dir.
 *
 * 2. **Stderr sink (tier-gated, prior behavior):** preserves the existing rule —
 *    `info`/`warn`/`error` always write to stderr; `debug` only writes when
 *    `aiConfig.debug === true`. Different from KB/MC where stderr is fully
 *    debug-flag-gated; NL ran more verbose by design and that's preserved.
 *
 * Daily rotation + log-dir resolution happen lazily per-write via a cached stream
 * keyed on `${logDir}::${today}`, so a daemon running across midnight transitions
 * cleanly to a new file AND late `aiConfig.logPath` overrides (e.g., from tests)
 * take effect on the next write. Stream `flags: 'a'` makes restarts and concurrent
 * writers append rather than truncate. `mkdirSync` is idempotent under
 * `{recursive: true}`.
 *
 * The previous logger interpolated `JSON.stringify(args)` directly, which silently
 * destroyed Error.message and Error.stack (non-enumerable). The replacement
 * `stringifyArg` helper unpacks Error instances and falls back gracefully on
 * circular references — same defect surfaced + fixed in #10580 RA2.
 */
let currentStreamKey = null;
let currentStream    = null;

const getStream = () => {
    const logDir = aiConfig.logPath || path.resolve(neoRootFallback, '.neo-ai-data/logs');
    const today  = new Date().toISOString().slice(0, 10);
    const key    = `${logDir}::${today}`;

    if (currentStreamKey !== key) {
        if (currentStream) currentStream.end();
        fs.mkdirSync(logDir, {recursive: true});
        currentStreamKey = key;
        currentStream    = fs.createWriteStream(path.join(logDir, `nl-server-${today}.log`), {flags: 'a'});
    }
    return currentStream;
};

const stringifyArg = (a) => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`.trim();
    try {
        return JSON.stringify(a);
    } catch {
        return String(a);
    }
};

const formatLine = (level, message, args) => {
    const timestamp = new Date().toISOString();
    const prefix    = `[${timestamp}] [${level.toUpperCase()}]`;
    const tail      = args.length ? ` ${args.map(stringifyArg).join(' ')}` : '';
    return `${prefix} ${message}${tail}\n`;
};

const createLogMethod = (level) => {
    return (message, ...args) => {
        const line = formatLine(level, message, args);
        getStream().write(line);
        if (aiConfig.debug || level !== 'debug') {
            process.stderr.write(line);
        }
    };
};

const logger = {
    debug: createLogMethod('debug'),
    info : createLogMethod('info'),
    warn : createLogMethod('warn'),
    error: createLogMethod('error')
};

export default logger;
