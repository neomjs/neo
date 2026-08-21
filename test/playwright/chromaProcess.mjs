import {execFileSync, spawn} from 'node:child_process';
import fs                    from 'node:fs';
import os                    from 'node:os';
import path                  from 'node:path';

const temporaryPrefix = 'neo-chroma-unit-test-';

/**
 * @summary Locates a package directory the way Node's resolver does — first `node_modules/<pkg>`
 * found walking up from `fromDir`, or `null`.
 *
 * `path.join(fromDir, 'node_modules', pkg)` is not that algorithm, and the gap is a linked git
 * worktree: `npm install` runs in the main clone, so a worktree has no `node_modules` of its own
 * while every import from it resolves fine against the clone's. A joined path therefore reports
 * absent for packages that demonstrably load, and spawns a CLI path that does not exist.
 *
 * FIRST match wins, with no fallback to a further ancestor — also Node's behaviour, and load-bearing
 * for the Brain-tier probe: a pruned husk at depth 0 must stay a husk rather than being papered over
 * by a good copy higher up.
 *
 * It lives here rather than in the config because this module already owns *where the chromadb
 * package is*; the config imports it so one answer serves both the probe and the spawn.
 * @param {String} fromDir Directory to start the upward walk at.
 * @param {String} pkg Package name, scoped names included.
 * @returns {String|null}
 */
export function resolvePackageDir(fromDir, pkg) {
    let current = path.resolve(fromDir);

    for (;;) {
        const candidate = path.join(current, 'node_modules', pkg);

        if (fs.existsSync(candidate)) {
            return candidate
        }

        const parent = path.dirname(current);

        if (parent === current) {
            return null
        }

        current = parent
    }
}

/**
 * @summary Resolves after the bounded polling delay used by readiness and teardown loops.
 * @param {Number} milliseconds
 * @returns {Promise<void>}
 */
function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/**
 * @summary Resolves the liveness-signal target: a POSIX process group or one Windows process.
 * @param {Number} pid
 * @param {String} platform
 * @returns {Number}
 */
function signalTarget(pid, platform) {
    return platform === 'win32' ? pid : -pid
}

/**
 * @summary Fails closed unless a cleanup target is contained by the OS temp root and its basename
 * carries the unit-Chroma prefix.
 * @param {String} value
 * @returns {String} The resolved safe path.
 */
function assertSafeTemporaryPath(value) {
    const
        resolved = path.resolve(value),
        relative = path.relative(path.resolve(os.tmpdir()), resolved);

    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) ||
        !path.basename(resolved).startsWith(temporaryPrefix)) {
        throw new Error(`Refusing to remove non-unit-Chroma temporary path: ${resolved}`)
    }

    return resolved
}

/**
 * @summary Resolves data-directory cleanup ownership across first setup, explicit caller pins, and
 * Playwright retries that inherit the prior setup attempt's private ownership marker.
 * @param {Object} [env=process.env]
 * @returns {Boolean}
 */
export function ownsChromaDataDir(env = process.env) {
    return env.NEO_UNIT_CHROMA_DATA_DIR_AUTO === 'true' || !env.NEO_CHROMA_DATA_DIR_TEST
}

/**
 * @summary Reports whether a detached test process (or its POSIX process group) is still alive.
 * EPERM means the process exists but belongs to another authority, so it is treated as alive.
 * @param {Number} pid
 * @param {Object} [options]
 * @param {String} [options.platform=process.platform]
 * @param {Function} [options.killFn=process.kill]
 * @returns {Boolean}
 */
export function isDetachedProcessAlive(pid, {platform = process.platform, killFn = process.kill} = {}) {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false
    }

    try {
        killFn(signalTarget(pid, platform), 0);
        return true
    } catch (error) {
        return error?.code === 'EPERM'
    }
}

/**
 * @summary Probes the Chroma v2 heartbeat without importing the Chroma package into Playwright.
 * @param {Object} options
 * @param {String} options.host
 * @param {Number|String} options.port
 * @param {Number} [options.timeoutMs=1500]
 * @param {Function} [options.fetchFn=fetch]
 * @returns {Promise<Boolean>}
 */
export async function probeChromaHeartbeat({host, port, timeoutMs = 1500, fetchFn = fetch}) {
    const
        probeHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host,
        authority = probeHost.includes(':') ? `[${probeHost}]` : probeHost;

    try {
        const response = await fetchFn(`http://${authority}:${port}/api/v2/heartbeat`, {
            signal: AbortSignal.timeout(timeoutMs)
        });

        return response.ok
    } catch (error) {
        return false
    }
}

/**
 * @summary Reads the bounded tail of a run-scoped Chroma log for actionable setup/teardown errors.
 * @param {String} logPath
 * @param {Number} [maximumLength=4000]
 * @returns {String}
 */
export function readChromaLogTail(logPath, maximumLength = 4000) {
    try {
        return fs.readFileSync(logPath, 'utf8').slice(-maximumLength)
    } catch (error) {
        return ''
    }
}

/**
 * @summary Starts one detached, run-scoped Chroma process and waits for its real heartbeat. The
 * CLI is invoked through the current Node executable, never through a shell or PATH lookup.
 * @param {Object} options
 * @param {String} options.repoRoot
 * @param {String} options.dataDir
 * @param {String} options.host
 * @param {Number|String} options.port
 * @param {String} options.logPath
 * @param {Number} [options.timeoutMs=120000]
 * @param {Function} [options.spawnFn=spawn]
 * @param {Function} [options.probeFn=probeChromaHeartbeat]
 * @returns {Promise<Number>} The detached process-group leader PID.
 */
export async function startChromaProcess({
    repoRoot,
    dataDir,
    host,
    port,
    logPath,
    timeoutMs = 120000,
    spawnFn   = spawn,
    probeFn   = probeChromaHeartbeat
}) {
    if (await probeFn({host, port})) {
        throw new Error(`Refusing to reuse a Chroma server already listening at ${host}:${port}`)
    }

    // Resolved, not joined, and AFTER the reuse guard: that guard is a safety refusal and must keep
    // winning. From a linked worktree `repoRoot/node_modules` does not exist, so a joined path spawns
    // a CLI that is not there — the child dies immediately and the failure reports "Chroma exited
    // before its heartbeat became ready", naming the symptom two layers from the missing file.
    const packageDir = resolvePackageDir(repoRoot, 'chromadb');

    if (packageDir === null) {
        throw new Error(`Cannot locate the chromadb package from ${repoRoot} — is the Brain tier installed?`)
    }

    const cliPath = path.join(packageDir, 'dist', 'cli.mjs');

    fs.mkdirSync(dataDir, {recursive: true});
    fs.mkdirSync(path.dirname(logPath), {recursive: true});

    const logFd = fs.openSync(logPath, 'a');
    let child;

    try {
        child = spawnFn(process.execPath, [
            cliPath,
            'run',
            '--path', dataDir,
            '--host', host,
            '--port', String(port)
        ], {
            cwd     : repoRoot,
            detached: true,
            env     : process.env,
            stdio   : ['ignore', logFd, logFd]
        })
    } finally {
        fs.closeSync(logFd)
    }

    child.unref();

    const deadline = Date.now() + timeoutMs;

    try {
        while (Date.now() < deadline) {
            if (!isDetachedProcessAlive(child.pid)) {
                throw new Error('Chroma exited before its heartbeat became ready')
            }

            if (await probeFn({host, port})) {
                return child.pid
            }

            await delay(200)
        }

        throw new Error(`Chroma heartbeat timed out after ${timeoutMs}ms`)
    } catch (error) {
        await stopDetachedProcess(child.pid);

        const tail = readChromaLogTail(logPath);
        throw new Error(`${error.message}${tail ? `\nChroma log tail:\n${tail}` : ''}`, {cause: error})
    }
}

/**
 * @summary Settles teardown of a detached process tree: POSIX receives group SIGINT, a bounded
 * grace poll, then group SIGKILL. Windows uses taskkill for the equivalent descendant-tree reap.
 * @param {Number} pid
 * @param {Object} [options]
 * @param {Number} [options.graceMs=10000]
 * @param {Number} [options.pollMs=100]
 * @param {Number} [options.killWaitMs=2000]
 * @param {String} [options.platform=process.platform]
 * @param {Function} [options.killFn=process.kill]
 * @param {Function} [options.execFileSyncFn=execFileSync]
 * @returns {Promise<{exited: Boolean, forced: Boolean, groupEmpty: Boolean}>}
 */
export async function stopDetachedProcess(pid, {
    graceMs        = 10000,
    pollMs         = 100,
    killWaitMs     = 2000,
    platform       = process.platform,
    killFn         = process.kill,
    execFileSyncFn = execFileSync
} = {}) {
    if (!isDetachedProcessAlive(pid, {platform, killFn})) {
        return {exited: true, forced: false, groupEmpty: true}
    }

    if (platform === 'win32') {
        try {
            execFileSyncFn('taskkill', ['/PID', String(pid), '/T', '/F'], {stdio: 'ignore'})
        } catch (error) {}

        return {
            exited    : true,
            forced    : true,
            groupEmpty: !isDetachedProcessAlive(pid, {platform, killFn})
        }
    }

    try {
        killFn(-pid, 'SIGINT')
    } catch (error) {}

    const graceDeadline = Date.now() + graceMs;

    while (Date.now() < graceDeadline) {
        if (!isDetachedProcessAlive(pid, {platform, killFn})) {
            return {exited: true, forced: false, groupEmpty: true}
        }

        await delay(pollMs)
    }

    try {
        killFn(-pid, 'SIGKILL')
    } catch (error) {}

    const killDeadline = Date.now() + killWaitMs;

    while (Date.now() < killDeadline && isDetachedProcessAlive(pid, {platform, killFn})) {
        await delay(pollMs)
    }

    return {
        exited    : true,
        forced    : true,
        groupEmpty: !isDetachedProcessAlive(pid, {platform, killFn})
    }
}

/**
 * @summary Removes only setup-owned Chroma artifacts under the OS temp root. An explicit caller
 * data directory is never deleted, and every generated path must pass the prefix/containment guard.
 * @param {Object} options
 * @param {String} options.dataDir
 * @param {String} options.logPath
 * @param {Boolean} options.ownsDataDir
 * @returns {void}
 */
export function cleanupChromaArtifacts({dataDir, logPath, ownsDataDir}) {
    if (ownsDataDir) {
        fs.rmSync(assertSafeTemporaryPath(dataDir), {force: true, recursive: true})
    }

    if (logPath) {
        fs.rmSync(assertSafeTemporaryPath(logPath), {force: true})
    }
}
