/**
 * @summary Local supervised daemon for the A2A message WAL drain topology.
 *
 * Mirrors the memory embed daemon's deployment shape: local/orchestrator-managed profiles run this
 * process with PID/log state under `.neo-ai-data`, while containerized/single-process deployments
 * host the same loop inside Memory Core via `messageWal.inProcessDrain`. The graph replay
 * processor is intentionally injectable so topology can land before projection semantics.
 */
import Neo              from '../../../src/Neo.mjs';
import * as core        from '../../../src/core/_export.mjs';
import InstanceManager  from '../../../src/manager/Instance.mjs';
import memoryCoreConfig from '../../mcp/server/memory-core/config.mjs';

import fs         from 'fs-extra';
import path       from 'path';
import {execSync} from 'child_process';

import {
    createMessageGraphProjectionProcessor,
    startMessageDrainLoop
} from './drainCycle.mjs';
import {acquireMessageDrainLock}           from './drainLock.mjs';
import {DAEMON_EXIT_CRASH, DAEMON_EXIT_OK} from '../shared/daemonExit.mjs';
import {getMissingMessageWalLeaves}        from '../../services/memory-core/helpers/messageWalStore.mjs';
import MailboxService                      from '../../services/memory-core/MailboxService.mjs';

const missingLeaves = getMissingMessageWalLeaves(memoryCoreConfig.messageWal,
    ['dir', 'daemonDataDir', 'pollIntervalMs', 'batchSize', 'maxRetries', 'backoffBaseMs']);

if (missingLeaves.length > 0) {
    console.error(`[Message Daemon] messageWal config leaves missing: ${missingLeaves.join(', ')} — ` +
        'sync the messageWal block from config.template.mjs into the local config.mjs ' +
        '(node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart. Exiting.');
    process.exit(1);
}

const LOG_RETENTION_DAYS = 30;

/**
 * @summary Reads the live daemon data directory from AiConfig at use time.
 * @returns {String}
 */
function getDaemonDataDir() {
    return memoryCoreConfig.messageWal.daemonDataDir;
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
 * @summary Resolves the live message daemon log file path.
 * @returns {String}
 */
function getLogFile() {
    return path.join(ensureDaemonDataDir(), 'message-daemon.log');
}

/**
 * @summary Resolves the live message daemon PID file path.
 * @returns {String}
 */
function getPidFile() {
    return path.join(ensureDaemonDataDir(), 'message-daemon.pid');
}

ensureDaemonDataDir();

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
        process.stderr.write(`[Message Daemon] Log rotation failed: ${e.message}\n`);
    }
}

function pruneOldLogs() {
    const cutoff        = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
          daemonDataDir = getDaemonDataDir();
    try {
        for (const entry of fs.readdirSync(daemonDataDir)) {
            if (!entry.startsWith('message-daemon.log.') || entry === 'message-daemon.log') continue;
            const fullPath = path.join(daemonDataDir, entry);
            try {
                if (fs.statSync(fullPath).mtime.getTime() < cutoff) {
                    fs.unlinkSync(fullPath);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

function writeLog(level, message) {
    rotateLogIfNewDay();
    const line    = `[${new Date().toISOString()}] [PID:${process.pid}] [${level}] ${message}`,
          logFile = getLogFile();

    try {
        fs.appendFileSync(logFile, line + '\n', 'utf8');
    } catch (e) {}

    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }
}

pruneOldLogs();

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
                } catch (e) {}

                if (isAlive) {
                    try {
                        const cmd = execSync(`ps -p ${oldPid} -o command=`).toString().trim();
                        if (cmd.includes('daemons/message/daemon.mjs')) {
                            writeLog('INFO', `[Message Daemon] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                            process.kill(oldPid, 'SIGTERM');
                        } else {
                            writeLog('INFO', `[Message Daemon] Stale PID file found. PID ${oldPid} used by a different process. Proceeding.`);
                            isAlive = false;
                        }
                    } catch (psErr) {
                        writeLog('INFO', `[Message Daemon] Could not verify process name. Sending SIGTERM to PID ${oldPid} to be safe...`);
                        process.kill(oldPid, 'SIGTERM');
                    }
                }

                if (isAlive) {
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
                        writeLog('INFO', `[Message Daemon] PID ${oldPid} did not exit after 3s. Escalating to SIGKILL...`);
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
            writeLog('ERROR', `[Message Daemon] Failed to check existing PID file: ${e.message || e}`);
        }
    }

    try {
        fs.writeFileSync(pidFile, process.pid.toString(), {encoding: 'utf8', flag: 'wx'});
    } catch (e) {
        if (e.code === 'EEXIST') {
            writeLog('ERROR', '[Message Daemon] Failed to claim PID file (EEXIST). Another instance started simultaneously. Exiting.');
            process.exit(1);
        }
        throw e;
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
        writeLog('ERROR', `[Message Daemon] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup(DAEMON_EXIT_CRASH);
    });
}

async function main() {
    await enforceSingleton();

    let drainLock;
    try {
        drainLock = acquireMessageDrainLock({dir: memoryCoreConfig.messageWal.dir, owner: 'daemon', log: writeLog});
    } catch (err) {
        if (err.code === 'DRAIN_LOCK_HELD') {
            writeLog('ERROR', `[Message Daemon] ${err.message} Exiting.`);
            process.exit(1);
        }
        throw err;
    }

    process.on('exit', () => drainLock.release());

    writeLog('INFO', `[Message Daemon] Started. Observing message WAL dir: ${memoryCoreConfig.messageWal.dir} (poll: ${memoryCoreConfig.messageWal.pollIntervalMs}ms, batch: ${memoryCoreConfig.messageWal.batchSize})`);

    startMessageDrainLoop({
        getConfig   : () => memoryCoreConfig.messageWal,
        getProcessor: () => createMessageGraphProjectionProcessor(MailboxService),
        log         : writeLog
    });
}

main();
