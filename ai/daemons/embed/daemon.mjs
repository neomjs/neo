/**
 * @summary Embed daemon for the `add_memory` write-ahead log.
 *
 * Durably drains the JSONL WAL that `MemoryService.addMemory` appends every agent turn —
 * the daemon half of the never-fail `add_memory` design: polls the pending
 * backlog on a config-driven interval, embeds batches into the memory content store with
 * retry/backoff, reconciles embed markers, compensates purge races, and prunes reconciled
 * segments. Crash/restart-safe by construction — the WAL is the durable source of truth;
 * an interrupted cycle simply leaves records pending for the next pass (`collection.add`
 * is idempotent per id at worst-duplicate level).
 *
 * Sibling of `ai/daemons/wake/daemon.mjs`: same orchestrator supervision
 * (`taskDefinitions.mjs` → `embedDaemon`, continuous task), same singleton PID lock, same
 * dual-sink logging contract. Drain logic lives in `./drainCycle.mjs` so specs exercise the
 * exact production path without spawning this process.
 *
 * **Diagnostic log persistence:**
 * All lines are written to both stdout (live observability) and
 * `.neo-ai-data/embed-daemon/embed-daemon.log` (post-hoc audit), format
 * `[ISO-timestamp] [PID:NNN] [LEVEL] message`, with daily rotation and retention pruning.
 */
// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any consumed class file relying on `Neo.setupClass()` works
// at module-load. `InstanceManager` binds `Neo.find` / `Neo.findFirst` / `Neo.get`
// aliases + sets `Base.instanceManagerAvailable=true` + consumes pre-singleton
// `Neo.idMap`. All 3 MUST run before consumed class imports.
import Neo              from '../../../src/Neo.mjs';
import * as core        from '../../../src/core/_export.mjs';
import InstanceManager  from '../../../src/manager/Instance.mjs';
import memoryCoreConfig from '../../mcp/server/memory-core/config.mjs';

import fs         from 'fs-extra';
import path       from 'path';
import {execSync} from 'child_process';

import StorageRouter                       from '../../services/memory-core/managers/StorageRouter.mjs';
import {DAEMON_EXIT_CRASH, DAEMON_EXIT_OK} from '../shared/daemonExit.mjs';
import {startDrainLoop}                    from './drainCycle.mjs';
import {acquireDrainLock}                  from './drainLock.mjs';
import {getMissingMemoryWalLeaves}         from '../../services/memory-core/helpers/memoryWalStore.mjs';

// Stale-config boot guard: the gitignored config.mjs is a MATERIALIZED template copy — on a
// deployment whose overlay predates the memoryWal daemon leaves they resolve undefined, and
// everything below (data dir, log paths, poll loop) would crash with an unactionable TypeError.
// Fail loud + name the fix instead; the orchestrator's restart cooldown surfaces the line.
const missingLeaves = getMissingMemoryWalLeaves(memoryCoreConfig.memoryWal,
    ['dir', 'daemonDataDir', 'pollIntervalMs', 'batchSize', 'maxRetries', 'backoffBaseMs', 'retentionLimit']);

if (missingLeaves.length > 0) {
    console.error(`[Embed Daemon] memoryWal config leaves missing: ${missingLeaves.join(', ')} — ` +
        'sync the memoryWal block from config.template.mjs into the local config.mjs ' +
        '(node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart. Exiting.');
    process.exit(1);
}

const LOG_RETENTION_DAYS = 30;

/**
 * @summary Reads the live daemon data directory from AiConfig at use time.
 * @returns {String}
 */
function getDaemonDataDir() {
    return memoryCoreConfig.memoryWal.daemonDataDir;
}

/**
 * @summary Ensures the live daemon data directory exists and returns it.
 * @returns {String}
 */
function ensureDaemonDataDir() {
    const dir = getDaemonDataDir();

    fs.ensureDirSync(dir);
    return dir;
}

/**
 * @summary Resolves the live embed daemon log file path.
 * @returns {String}
 */
function getLogFile() {
    return path.join(ensureDaemonDataDir(), 'embed-daemon.log');
}

/**
 * @summary Resolves the live embed daemon PID file path.
 * @returns {String}
 */
function getPidFile() {
    return path.join(ensureDaemonDataDir(), 'embed-daemon.pid');
}

// Ensure daemon data dir exists
ensureDaemonDataDir();

/**
 * Rotates `embed-daemon.log` if its mtime falls on a calendar day different from today's.
 * Renames the previous-day file to `embed-daemon.log.YYYY-MM-DD` so the active file always
 * holds the current day's lines. Best-effort: failures surface to stderr and the daemon
 * continues (log integrity is not allowed to gate daemon liveness).
 * @protected
 */
function rotateLogIfNewDay() {
    const logFile = getLogFile();

    if (!fs.existsSync(logFile)) return;
    try {
        const stats    = fs.statSync(logFile);
        const fileDay  = stats.mtime.toISOString().split('T')[0];
        const todayDay = new Date().toISOString().split('T')[0];
        if (fileDay !== todayDay) {
            fs.renameSync(logFile, `${logFile}.${fileDay}`);
        }
    } catch (e) {
        process.stderr.write(`[Embed Daemon] Log rotation failed: ${e.message}\n`);
    }
}

/**
 * Prunes archived log files (`embed-daemon.log.*`) older than `LOG_RETENTION_DAYS` from
 * `DAEMON_DATA_DIR`. Runs once at daemon startup. Best-effort: per-file unlink failures
 * are silently swallowed (better to keep a stale archive than gate startup).
 * @protected
 */
function pruneOldLogs() {
    const cutoff        = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
          daemonDataDir = getDaemonDataDir();
    try {
        for (const entry of fs.readdirSync(daemonDataDir)) {
            if (!entry.startsWith('embed-daemon.log.') || entry === 'embed-daemon.log') continue;
            const fullPath = path.join(daemonDataDir, entry);
            try {
                if (fs.statSync(fullPath).mtime.getTime() < cutoff) {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) {
                // Per-entry failure is non-fatal
            }
        }
    } catch (e) {
        // Directory listing failure is non-fatal
    }
}

/**
 * Persistent + console log writer. Writes a single line to BOTH stdout (live terminal
 * observability) AND the persistent `embed-daemon.log` file (post-hoc audit trail).
 * Format: `[ISO-timestamp] [PID:NNN] [LEVEL] message`. Daily rotation is checked on every call.
 *
 * Failures on file-write are silently swallowed — daemon liveness MUST NOT depend on log
 * integrity. Failures on console-write propagate naturally.
 *
 * @param {String} level   One of 'INFO' | 'ERROR'.
 * @param {String} message Message body without trailing newline — `writeLog` appends one.
 * @protected
 */
function writeLog(level, message) {
    rotateLogIfNewDay();
    const line    = `[${new Date().toISOString()}] [PID:${process.pid}] [${level}] ${message}`,
          logFile = getLogFile();

    try {
        fs.appendFileSync(logFile, line + '\n', 'utf8');
    } catch (e) {
        // Best-effort; daemon must stay alive even if file-write fails
    }

    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }
}

// One-shot prune at startup; reaper for archived logs older than retention window
pruneOldLogs();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enforces the one-instance-per-data-dir singleton contract: takes over from a live prior
 * instance (SIGTERM → 3s grace → SIGKILL), ignores recycled PIDs owned by foreign processes,
 * claims the PID file atomically (`wx`), and installs exit/signal cleanup. Mirrors the wake
 * daemon's lock verbatim — an interrupted drain cycle is safe by WAL construction, so cleanup
 * exits immediately rather than awaiting the in-flight cycle.
 * @protected
 */
async function enforceSingleton() {
    const pidFile = getPidFile();

    if (fs.existsSync(pidFile)) {
        try {
            const oldPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
            if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
                let isAlive = false;
                try {
                    process.kill(oldPid, 0);
                    isAlive = true;
                } catch (e) {
                    // Process is not alive
                }

                if (isAlive) {
                    try {
                        // Use ps -p to verify the PID hasn't been recycled by a non-daemon process
                        const cmd = execSync(`ps -p ${oldPid} -o command=`).toString().trim();
                        if (cmd.includes('daemons/embed/daemon.mjs')) {
                            writeLog('INFO', `[Embed Daemon] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                            process.kill(oldPid, 'SIGTERM');
                        } else {
                            writeLog('INFO', `[Embed Daemon] Stale PID file found. PID ${oldPid} used by a different process. Proceeding.`);
                            isAlive = false; // We won't wait for it to exit
                        }
                    } catch (psErr) {
                        writeLog('INFO', `[Embed Daemon] Could not verify process name. Sending SIGTERM to PID ${oldPid} to be safe...`);
                        process.kill(oldPid, 'SIGTERM');
                    }
                }

                if (isAlive) {
                    // Wait up to 3s for graceful exit
                    let alive = true;
                    for (let i = 0; i < 30; i++) {
                        await wait(100);
                        try {
                            process.kill(oldPid, 0);
                        } catch (e) {
                            alive = false;
                            break;
                        }
                    }
                    if (alive) {
                        writeLog('INFO', `[Embed Daemon] PID ${oldPid} did not exit after 3s. Escalating to SIGKILL...`);
                        try {
                            process.kill(oldPid, 'SIGKILL');
                        } catch (e) {}
                    }
                }

                try {
                    fs.unlinkSync(pidFile);
                } catch (e) {}
            }
        } catch (e) {
            writeLog('ERROR', `[Embed Daemon] Failed to check existing PID file: ${e.message || e}`);
        }
    }

    // Write new PID using atomic wx claim
    try {
        fs.writeFileSync(pidFile, process.pid.toString(), {encoding: 'utf8', flag: 'wx'});
    } catch (e) {
        if (e.code === 'EEXIST') {
            writeLog('ERROR', '[Embed Daemon] Failed to claim PID file (EEXIST). Another instance started simultaneously. Exiting.');
            process.exit(1);
        } else {
            throw e;
        }
    }

    // Cleanup on exit. `releasePidFile` is separated from `cleanup` deliberately: an `exit` listener
    // must RELEASE without exiting, because `cleanup` now takes an exit code. See the measured
    // bare-retains / explicit-overrides asymmetry in `../shared/daemonExit.mjs`.
    let   cleanedUp      = false;
    const releasePidFile = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        try {
            if (fs.existsSync(pidFile)) {
                const currentPid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
                if (currentPid === process.pid) {
                    fs.unlinkSync(pidFile);
                }
            }
        } catch (e) {}
    };
    const cleanup = (exitCode = DAEMON_EXIT_OK) => {
        releasePidFile();
        process.exit(exitCode);
    };

    // Each registration passes its code EXPLICITLY. `process.on('SIGINT', cleanup)` would invoke the
    // listener with the SIGNAL NAME, handing `'SIGINT'` to `process.exit`.
    process.on('SIGINT',  () => cleanup(DAEMON_EXIT_OK));
    process.on('SIGTERM', () => cleanup(DAEMON_EXIT_OK));
    process.on('exit', releasePidFile);
    process.on('uncaughtException', err => {
        writeLog('ERROR', `[Embed Daemon] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(DAEMON_EXIT_CRASH);
    });
}

// Start loop
async function main() {
    await enforceSingleton();
    await StorageRouter.ready();

    // Sole-drainer guard: claim the per-WAL-directory drain lock BEFORE the loop. enforceSingleton
    // (above) already resolved daemon-vs-daemon succession, so any prior daemon's lock is now a dead
    // pid the claim reclaims as stale; a LIVE holder here means a SECOND host (an in-process server
    // loop) drains the same dir — a misconfiguration that silently corrupts markers. Fail loud.
    let drainLock;
    try {
        drainLock = acquireDrainLock({dir: memoryCoreConfig.memoryWal.dir, owner: 'daemon', log: writeLog});
    } catch (err) {
        if (err.code === 'DRAIN_LOCK_HELD') {
            writeLog('ERROR', `[Embed Daemon] ${err.message} Exiting.`);
            process.exit(1);
        }
        throw err;
    }

    // Release on every clean exit path: enforceSingleton's cleanup() calls process.exit(), so the
    // 'exit' listener fires for SIGINT/SIGTERM/uncaughtException too. A SIGKILL leaves the lock for
    // the next daemon to reclaim as stale.
    process.on('exit', () => drainLock.release());

    writeLog('INFO', `[Embed Daemon] Started. Draining WAL dir: ${memoryCoreConfig.memoryWal.dir} (poll: ${memoryCoreConfig.memoryWal.pollIntervalMs}ms, batch: ${memoryCoreConfig.memoryWal.batchSize})`);

    // The shared loop host (`drainCycle.mjs`) owns cycle scheduling, per-cycle config/collection
    // resolution, and failure absorption; this process wrapper owns PID/lifecycle/logging only.
    startDrainLoop({
        getCollection    : () => StorageRouter.getMemoryCollection(),
        getConfig        : () => memoryCoreConfig.memoryWal,
        expectedDimension: memoryCoreConfig.vectorDimension,
        log              : writeLog
    });
}

main();
