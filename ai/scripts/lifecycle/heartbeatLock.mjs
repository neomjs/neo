#!/usr/bin/env node
/**
 * @summary Wraps expensive Agent OS work with the swarm heartbeat concurrency lock.
 *
 * The fallback heartbeat is a watchdog, not a work scheduler. When an agent is already
 * executing expensive work, overlapping heartbeat pulses should skip rather than queue.
 * This helper owns the producer side of the heartbeat concurrency lock: create the lock
 * before the work starts and remove it in a `finally` block after the work ends.
 *
 * The companion consumer is the Orchestrator swarm-heartbeat lane
 * (`ai/daemons/SwarmHeartbeatService.mjs`), which treats the lock as an absolute skip
 * barrier until the configured stale-lock TTL expires.
 *
 * **`lockPath` is required, and that is the contract rather than an inconvenience.** A mutex only
 * serializes while every contender addresses the same file, so the coordinate must be declared by
 * whoever composes the call. The previous default was a bare `.neo-ai-data/…` literal resolved
 * against `process.cwd()`: a run launched from a subdirectory, a worktree, or a scheduler with its
 * own working directory took a *different* lock and overlapped the work this module exists to keep
 * apart — silently, because both sides succeeded. The resolved coordinate is
 * `AiConfig.heartbeatConcurrencyLockPath`. This module imports neither the class system nor the
 * config Provider, so its non-entrypoint consumers keep taking the coordinate as an argument.
 *
 * @example
 *   node ai/scripts/lifecycle/heartbeatLock.mjs -- npx playwright test test/playwright/unit/foo.spec.mjs
 *
 * @see ai/daemons/SwarmHeartbeatService.mjs
 * @see ai/configBase.mjs `heartbeatConcurrencyLockPath`
 */
import {spawn} from 'child_process';
import fs      from 'fs-extra';
import path    from 'path';
import {fileURLToPath} from 'url';

export const DEFAULT_STALE_LOCK_MS = 10 * 60 * 1000;

/**
 * @summary Fails a lock operation before it touches the filesystem when no coordinate was injected.
 *
 * Validation, not resolution: this module holds no fallback to fall back to. Throwing here rather
 * than at the `fs` call keeps a missing injection a loud composition error instead of a lock
 * quietly taken somewhere nobody else is looking.
 * @param {String} lockPath
 * @param {String} operation Name reported in the error, so the failing seam is identifiable.
 * @returns {String} The validated lock path.
 * @private
 */
function assertLockPath(lockPath, operation) {
    if (!lockPath) {
        throw new Error(`heartbeatLock: ${operation} requires an injected lockPath (AiConfig.heartbeatConcurrencyLockPath) — a cwd-relative default forks the mutex per launch directory`)
    }

    return lockPath
}

/**
 * @summary Creates the heartbeat concurrency lock before expensive Agent OS work starts.
 *
 * The JSON payload is intentionally tiny and diagnostic-only; the Orchestrator
 * swarm-heartbeat lane depends only on file presence so a partial write cannot corrupt
 * heartbeat semantics.
 *
 * @param {object} [options]
 * @param {string} options.lockPath Resolved lock file path consumed by the heartbeat. Required.
 * @param {object} [options.metadata] Diagnostic metadata for operators inspecting the lock.
 * @returns {Promise<string>} The created lock path.
 * @throws {Error} When `lockPath` is absent — before any filesystem access.
 */
export async function acquireHeartbeatLock({
    lockPath,
    metadata = {}
} = {}) {
    assertLockPath(lockPath, 'acquireHeartbeatLock');

    await fs.ensureDir(path.dirname(lockPath));
    await fs.writeJson(lockPath, {
        createdAt: new Date().toISOString(),
        pid      : process.pid,
        ...metadata
    }, {spaces: 2});

    return lockPath
}

/**
 * @summary Clears the heartbeat concurrency lock after expensive Agent OS work finishes.
 *
 * Removal is idempotent so `finally` blocks can call it safely even after partial setup,
 * signal handling, or prior cleanup by a stale-lock recovery path.
 *
 * @param {object} [options]
 * @param {string} options.lockPath Resolved lock file path to remove. Required.
 * @returns {Promise<void>}
 * @throws {Error} When `lockPath` is absent — before any filesystem access.
 */
export async function releaseHeartbeatLock({lockPath} = {}) {
    assertLockPath(lockPath, 'releaseHeartbeatLock');

    await fs.remove(lockPath)
}

/**
 * @summary Reports whether a heartbeat lock is active, missing, or stale.
 *
 * This mirrors the shell-side stale-lock semantics so tests and command wrappers can share
 * the same 30-minute recovery contract without relying on shell `stat` portability.
 *
 * @param {object} [options]
 * @param {string} options.lockPath Resolved lock file path to inspect. Required.
 * @param {number} [options.staleAfterMs=DEFAULT_STALE_LOCK_MS] Stale-lock TTL.
 * @param {Date}   [options.now=new Date()] Time source for deterministic tests.
 * @returns {Promise<{active: Boolean, stale: Boolean, ageMs: Number|null}>}
 * @throws {Error} When `lockPath` is absent — before any filesystem access. An inspect that
 * silently reported `{active: false}` for a missing coordinate is the worst failure here: the
 * caller reads "no lock held" and starts the work the lock exists to prevent.
 */
export async function inspectHeartbeatLock({
    lockPath,
    staleAfterMs = DEFAULT_STALE_LOCK_MS,
    now = new Date()
} = {}) {
    assertLockPath(lockPath, 'inspectHeartbeatLock');

    const stat = await fs.stat(lockPath).catch(() => null);

    if (!stat) {
        return {active: false, stale: false, ageMs: null}
    }

    const ageMs = Math.max(0, now.getTime() - stat.mtime.getTime());
    const stale = ageMs > staleAfterMs;

    return {
        active: !stale,
        stale,
        ageMs
    }
}

/**
 * @summary Runs an async task while holding the heartbeat concurrency lock.
 *
 * The `finally` release is the load-bearing guarantee: long Playwright runs,
 * memory extraction, and other expensive tasks can prevent overlapping heartbeat pulses
 * without leaving the fallback wake substrate permanently disabled.
 *
 * @param {Function} task Async task to execute while the lock is held.
 * @param {object}   [options] Options forwarded to {@link acquireHeartbeatLock}.
 * @returns {Promise<*>} The task result.
 */
export async function withHeartbeatLock(task, options = {}) {
    await acquireHeartbeatLock(options);

    try {
        return await task()
    } finally {
        await releaseHeartbeatLock(options)
    }
}

/**
 * @summary Executes a subprocess while holding the heartbeat concurrency lock.
 *
 * Exposed for the CLI path so agents can wrap expensive shell commands without hand-writing
 * `touch` / `rm` pairs and risking cleanup omissions.
 *
 * @param {string}   command Command to spawn.
 * @param {string[]} [args=[]] Command arguments.
 * @param {object}   [options] Lock and spawn options.
 * @returns {Promise<number>} Subprocess exit code.
 */
export async function runCommandWithHeartbeatLock(command, args = [], options = {}) {
    const {
        lockPath,
        metadata = {},
        cwd = process.cwd(),
        env = process.env
    } = options;

    return withHeartbeatLock(() => new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env,
            stdio: 'inherit'
        });

        child.on('error', reject);
        child.on('exit', code => resolve(code ?? 1));
    }), {
        lockPath,
        metadata: {
            command: [command, ...args].join(' '),
            ...metadata
        }
    })
}

function printUsage() {
    console.error('Usage: node ai/scripts/lifecycle/heartbeatLock.mjs -- <command> [args...]')
}

/**
 * @summary Reads the resolved lock coordinate for the CLI entrypoint.
 *
 * Bootstraps Neo before `ai/config.mjs` because the Provider needs the class system, matching the
 * order every other lifecycle entrypoint uses.
 * @returns {Promise<String>} `AiConfig.heartbeatConcurrencyLockPath`.
 * @private
 */
async function resolveConfiguredLockPath() {
    await import('../../../src/Neo.mjs');
    await import('../../../src/core/_export.mjs');

    const {default: AiConfig} = await import('../../config.mjs');

    return AiConfig.heartbeatConcurrencyLockPath
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
    const separatorIndex = process.argv.indexOf('--');
    const commandArgs    = separatorIndex === -1 ? process.argv.slice(2) : process.argv.slice(separatorIndex + 1);
    const [command, ...args] = commandArgs;

    if (!command) {
        printUsage();
        process.exit(2)
    }

    // The CLI IS the composing entrypoint, so it — and only it — resolves the member. The import is
    // dynamic on purpose: a module-scope `import AiConfig` would load the Provider for every library
    // consumer of this file, and those consumers are not entrypoints.
    resolveConfiguredLockPath().then(lockPath =>
        runCommandWithHeartbeatLock(command, args, {lockPath})
    ).then(code => {
        process.exit(code)
    }).catch(error => {
        console.error(`heartbeatLock failed: ${error.message}`);
        process.exit(1)
    })
}
