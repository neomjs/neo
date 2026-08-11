/**
 * @summary Probe Codex Desktop sandbox reachability for `.neo-ai-data/sqlite`.
 *
 * Codex Desktop sandboxed test runs can fail late with repeated
 * `SqliteError: unable to open database file` messages when a spec creates a
 * transient database under the shared `.neo-ai-data/sqlite` symlink. This
 * diagnostic turns that failure into one early, pathful probe: create, open,
 * close, and delete a transient SQLite file with the same path shape affected
 * unit tests use.
 *
 * Usage:
 *   node ai/scripts/diagnostics/bootstrapCodexSandbox.mjs
 *   npm run ai:bootstrap-codex-sandbox
 *
 * Diagnostic only: the script does not auto-escalate sandbox permissions and
 * does not rewrite the `.neo-ai-data/sqlite` topology. Operators decide whether
 * to rerun with escalated permissions or replace a symlink with a local path.
 *
 * @see https://github.com/neomjs/neo/issues/10714
 * @plane in-plane
 */
import crypto          from 'node:crypto';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Database        from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_SQLITE_DIR = '.neo-ai-data/sqlite';
export const PROBE_PREFIX       = 'codex-sandbox-probe';

/**
 * @summary Resolves the repo root from this CLI module directory.
 * @param {String} moduleDir Absolute directory containing this script.
 * @returns {String} Absolute repository root.
 */
export function resolveCliProjectRoot(moduleDir = __dirname) {
    return path.resolve(moduleDir, '..', '..', '..');
}

/**
 * @summary Best-effort detection of sandbox mode from known harness env vars.
 * @param {Object} env Environment map.
 * @returns {String} Detected `KEY=value` pair, or `unknown`.
 */
export function detectSandboxMode(env = process.env) {
    const keys = [
        'CODEX_SANDBOX_MODE',
        'CODEX_SANDBOX',
        'CODEX_CLI_SANDBOX',
        'SANDBOX_MODE'
    ];

    for (const key of keys) {
        if (env[key]) return `${key}=${env[key]}`;
    }

    return 'unknown';
}

/**
 * @summary Resolves logical + physical probe paths, including symlink targets.
 * @param {Object} options
 * @param {String} options.projectRoot Absolute repository root.
 * @param {String} [options.sqliteDir] Relative sqlite directory.
 * @param {String} [options.probeId] Stable probe id for tests.
 * @param {Object} [options.fsImpl] Filesystem implementation seam.
 * @returns {Object} Probe path bundle.
 */
export function buildProbePaths({
    projectRoot,
    sqliteDir = DEFAULT_SQLITE_DIR,
    probeId   = crypto.randomUUID(),
    fsImpl    = fs
} = {}) {
    if (!projectRoot) throw new Error('Missing projectRoot.');

    const logicalDir = path.resolve(projectRoot, sqliteDir);
    const fileName   = `${PROBE_PREFIX}-${probeId}.sqlite`;

    let physicalDir   = logicalDir;
    let symlinkTarget = null;

    try {
        const stat = fsImpl.lstatSync(logicalDir);
        if (stat.isSymbolicLink()) {
            const rawTarget = fsImpl.readlinkSync(logicalDir);
            symlinkTarget   = path.resolve(path.dirname(logicalDir), rawTarget);
            physicalDir     = fsImpl.realpathSync(logicalDir);
        } else if (stat.isDirectory()) {
            physicalDir = fsImpl.realpathSync(logicalDir);
        }
    } catch {
        // Missing directory is valid: the probe will attempt to create it.
    }

    return {
        logicalDir,
        physicalDir,
        symlinkTarget,
        fileName,
        probePath        : path.join(logicalDir, fileName),
        physicalProbePath: path.join(physicalDir, fileName)
    };
}

/**
 * @summary Remove transient SQLite artifacts created by the probe.
 * @param {Object} options
 * @param {String} options.probePath Logical probe database path.
 * @param {String} options.logicalDir Logical sqlite directory.
 * @param {Boolean} options.removeCreatedDir Remove logical dir if probe created it.
 * @param {Object} [options.fsImpl] Filesystem implementation seam.
 * @returns {{removed: String[], failed: Array<{path: String, message: String}>}}
 */
export function cleanupProbeArtifacts({probePath, logicalDir, removeCreatedDir = false, fsImpl = fs} = {}) {
    const removed = [];
    const failed  = [];

    for (const candidate of [probePath, `${probePath}-wal`, `${probePath}-shm`]) {
        try {
            fsImpl.rmSync(candidate, {force: true});
            removed.push(candidate);
        } catch (error) {
            failed.push({path: candidate, message: error.message});
        }
    }

    if (removeCreatedDir) {
        try {
            fsImpl.rmdirSync(logicalDir);
            removed.push(logicalDir);
        } catch {
            // Directory may contain unrelated files after a concurrent local test run.
        }
    }

    return {removed, failed};
}

/**
 * @summary Execute the Codex sandbox SQLite probe.
 * @param {Object} options
 * @param {String} options.projectRoot Absolute repository root.
 * @param {String} [options.probeId] Stable probe id for tests.
 * @param {Function} [options.DatabaseClass] better-sqlite3-compatible constructor.
 * @param {Object} [options.fsImpl] Filesystem implementation seam.
 * @param {Object} [options.env] Environment map for sandbox-mode detection.
 * @returns {Object} Structured probe result.
 */
export function runCodexSandboxProbe({
    projectRoot,
    probeId,
    DatabaseClass = Database,
    fsImpl        = fs,
    env           = process.env
} = {}) {
    const paths           = buildProbePaths({projectRoot, probeId, fsImpl});
    const dirExistedBefore = fsImpl.existsSync(paths.logicalDir);
    const sandboxMode     = detectSandboxMode(env);

    let db = null;

    try {
        fsImpl.mkdirSync(paths.logicalDir, {recursive: true});
        db = new DatabaseClass(paths.probePath);
        db.exec?.('CREATE TABLE IF NOT EXISTS codex_sandbox_probe (id INTEGER PRIMARY KEY);');
        db.close?.();
        db = null;

        const cleanup = cleanupProbeArtifacts({
            probePath       : paths.probePath,
            logicalDir      : paths.logicalDir,
            removeCreatedDir: !dirExistedBefore,
            fsImpl
        });

        return {ok: true, paths, sandboxMode, cleanup};
    } catch (error) {
        try {
            db?.close?.();
        } catch {}

        const cleanup = cleanupProbeArtifacts({
            probePath       : paths.probePath,
            logicalDir      : paths.logicalDir,
            removeCreatedDir: !dirExistedBefore,
            fsImpl
        });

        return {
            ok: false,
            paths,
            sandboxMode,
            cleanup,
            error: {
                code   : error.code || error.name || 'UNKNOWN',
                message: error.message || String(error)
            }
        };
    }
}

/**
 * @summary Format the probe result for operator-facing CLI output.
 * @param {Object} result Result from {@link runCodexSandboxProbe}.
 * @returns {String} Multi-line report.
 */
export function formatProbeResult(result) {
    const lines = [];

    if (result.ok) {
        lines.push('Codex sandbox SQLite probe: ok');
        lines.push(`logical path: ${result.paths.probePath}`);
        lines.push(`physical path: ${result.paths.physicalProbePath}`);
        if (result.paths.symlinkTarget) lines.push(`symlink target: ${result.paths.symlinkTarget}`);
        lines.push('cleanup: transient SQLite probe artifacts removed');
        return lines.join('\n');
    }

    lines.push('Codex sandbox SQLite probe: failed');
    lines.push(`logical path: ${result.paths.probePath}`);
    lines.push(`physical path: ${result.paths.physicalProbePath}`);
    if (result.paths.symlinkTarget) lines.push(`symlink target: ${result.paths.symlinkTarget}`);
    lines.push(`sandbox mode: ${result.sandboxMode}`);
    lines.push(`sqlite error: ${result.error.code}: ${result.error.message}`);
    lines.push('remediation: rerun the probe or affected test with sandbox_permissions=require_escalated, or replace the sqlite symlink with a local writable path if clone-local test DBs are intentional.');
    if (result.cleanup.failed.length) {
        lines.push(`cleanup warning: ${result.cleanup.failed.map(item => `${item.path} (${item.message})`).join('; ')}`);
    } else {
        lines.push('cleanup: transient SQLite probe artifacts removed');
    }

    return lines.join('\n');
}

/**
 * @summary CLI entry point.
 * @param {Object} options Test seams.
 * @returns {Number} Process exit code.
 */
export function main({
    projectRoot    = process.cwd(),
    DatabaseClass  = Database,
    fsImpl         = fs,
    env            = process.env,
    log            = console.log,
    error          = console.error
} = {}) {
    const result = runCodexSandboxProbe({projectRoot, DatabaseClass, fsImpl, env});
    const report = formatProbeResult(result);

    if (result.ok) {
        log(report);
        return 0;
    }

    error(report);
    return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exitCode = main({projectRoot: resolveCliProjectRoot()});
}
