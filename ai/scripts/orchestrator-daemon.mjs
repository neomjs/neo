/**
 * @module ai/scripts/orchestrator-daemon
 * @summary Per-host maintenance orchestrator for existing Agent OS refresh tasks.
 *
 * The bridge daemon owns wake delivery. This sibling daemon owns scheduled
 * maintenance triggers that keep agent boot context fresh: session summaries and
 * Knowledge Base delta sync. It deliberately shells out to the existing scripts
 * instead of reimplementing their logic.
 *
 * @see ai/scripts/summarize-sessions.mjs
 * @see buildScripts/ai/syncKnowledgeBase.mjs
 * @see #11006
 */
import fs from 'fs-extra';
import path from 'path';
import {spawn, execSync} from 'child_process';
import {fileURLToPath, pathToFileURL} from 'url';
import {
    initializeDatabase,
    getUnreadSunsetHandovers,
    markNodesAsRead
} from './bridge-daemon-queries.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_POLL_INTERVAL_MS = 3000;
export const DEFAULT_SUMMARY_SWEEP_INTERVAL_MS = 600000;
export const DEFAULT_KB_SYNC_INTERVAL_MS = 1800000;

const DB_PATH         = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DAEMON_DATA_DIR = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const PID_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator-daemon.pid');
const LOG_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator.log');
const STATE_FILE      = path.join(DAEMON_DATA_DIR, 'orchestrator-state.json');

const POLL_INTERVAL_MS = parseInterval(
    process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS
);

const SUMMARY_SWEEP_INTERVAL_MS = parseInterval(
    process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS ?? process.env.NEO_SUMMARIZATION_SWEEP_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
);

const KB_SYNC_INTERVAL_MS = parseInterval(
    process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS,
    DEFAULT_KB_SYNC_INTERVAL_MS
);

let db;
let taskState;

/**
 * @summary Parses daemon interval env vars while preserving `0` as disabled.
 *
 * @param {String|undefined} value    Environment value.
 * @param {Number}           fallback Fallback interval in milliseconds.
 * @returns {Number}
 */
export function parseInterval(value, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }

    return Math.max(parsed, 0);
}

/**
 * @summary Returns true when an interval task is due and not disabled.
 *
 * @param {Object} options
 * @param {Number} options.now        Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt  Last start timestamp in milliseconds.
 * @param {Number} options.intervalMs Interval in milliseconds; 0 disables.
 * @returns {Boolean}
 */
export function shouldRunIntervalTask({now, lastRunAt, intervalMs}) {
    return intervalMs > 0 && now - lastRunAt >= intervalMs;
}

/**
 * @summary Builds child-process commands for the orchestrator-owned tasks.
 *
 * @param {Object} [options]
 * @param {String} [options.scriptDir] Script directory.
 * @param {String} [options.nodeBin]   Node executable.
 * @returns {Object}
 */
export function buildTaskDefinitions({scriptDir = __dirname, nodeBin = process.argv[0]} = {}) {
    return {
        summary: {
            label          : 'session summarization',
            command        : nodeBin,
            args           : [path.join(scriptDir, 'summarize-sessions.mjs')],
            pidFileName    : 'summarization.pid',
            expectedCommand: 'summarize-sessions.mjs'
        },
        kbSync: {
            label          : 'knowledge base sync',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../../buildScripts/ai/syncKnowledgeBase.mjs')],
            pidFileName    : 'kb-sync.pid',
            expectedCommand: 'syncKnowledgeBase.mjs'
        }
    };
}

const TASK_DEFINITIONS = buildTaskDefinitions();

function writeLog(level, message) {
    const timestamp = new Date().toISOString();
    const line      = `[${timestamp}] [PID:${process.pid}] [${level}] ${message}`;

    try {
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (e) {}

    if (level === 'ERROR') {
        console.error(line);
    } else {
        console.log(line);
    }
}

function readState() {
    const fallback = {};

    for (const taskName of Object.keys(TASK_DEFINITIONS)) {
        fallback[taskName] = {
            running      : false,
            pid          : null,
            lastRunAt    : 0,
            lastSuccessAt: null,
            lastErrorAt  : null,
            lastExitCode : null,
            lastReason   : null
        };
    }

    if (!fs.existsSync(STATE_FILE)) {
        return fallback;
    }

    try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return Object.keys(fallback).reduce((state, taskName) => {
            state[taskName] = {...fallback[taskName], ...(data[taskName] || {})};
            state[taskName].running = false;
            state[taskName].pid     = null;
            return state;
        }, {});
    } catch (e) {
        writeLog('ERROR', `[Orchestrator] Failed to read state file: ${e.message}`);
        return fallback;
    }
}

function writeState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(taskState, null, 2), 'utf8');
    } catch (e) {
        writeLog('ERROR', `[Orchestrator] Failed to write state file: ${e.message}`);
    }
}

function getTaskPidFile(taskName) {
    return path.join(DAEMON_DATA_DIR, TASK_DEFINITIONS[taskName].pidFileName);
}

function processCommand(pid) {
    return execSync(`ps -p ${pid} -o command=`).toString().trim();
}

function clearRecoveredTask(taskName, pid) {
    const task    = TASK_DEFINITIONS[taskName];
    const state   = taskState[taskName];
    const pidFile = getTaskPidFile(taskName);

    if (state.pid !== pid) {
        return;
    }

    state.running      = false;
    state.pid          = null;
    state.lastExitCode = null;

    try {
        if (fs.existsSync(pidFile) && parseInt(fs.readFileSync(pidFile, 'utf8'), 10) === pid) {
            fs.unlinkSync(pidFile);
        }
    } catch (e) {}

    writeLog('INFO', `[Orchestrator] Recovered ${task.label} process (PID: ${pid}) exited; clearing running state.`);
    writeState();
}

function watchRecoveredTask(taskName, pid) {
    const watcher = setInterval(() => {
        try {
            process.kill(pid, 0);
        } catch (e) {
            clearInterval(watcher);
            clearRecoveredTask(taskName, pid);
        }
    }, 1000);

    watcher.unref?.();
}

function recoverTask(taskName) {
    const task    = TASK_DEFINITIONS[taskName];
    const pidFile = getTaskPidFile(taskName);

    if (!fs.existsSync(pidFile)) {
        return;
    }

    try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
        if (Number.isNaN(pid) || pid <= 0) {
            fs.unlinkSync(pidFile);
            return;
        }

        process.kill(pid, 0);
        const cmd = processCommand(pid);

        if (cmd.includes(task.expectedCommand)) {
            taskState[taskName].running = true;
            taskState[taskName].pid     = pid;
            watchRecoveredTask(taskName, pid);
            writeLog('INFO', `[Orchestrator] Found running ${task.label} process (PID: ${pid}). Adopting.`);
        } else {
            fs.unlinkSync(pidFile);
            writeLog('INFO', `[Orchestrator] Stale ${task.label} PID ${pid} reused by another process. Unlinking.`);
        }
    } catch (e) {
        try {
            fs.unlinkSync(pidFile);
        } catch (unlinkErr) {}
    }
}

function recoverTasks() {
    for (const taskName of Object.keys(TASK_DEFINITIONS)) {
        recoverTask(taskName);
    }
}

async function enforceSingleton() {
    if (fs.existsSync(PID_FILE)) {
        try {
            const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
            if (!Number.isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
                let isAlive = false;

                try {
                    process.kill(oldPid, 0);
                    isAlive = true;
                } catch (e) {}

                if (isAlive) {
                    const cmd = processCommand(oldPid);

                    if (cmd.includes('orchestrator-daemon.mjs')) {
                        writeLog('INFO', `[Orchestrator] Found existing instance (PID: ${oldPid}). Sending SIGTERM...`);
                        process.kill(oldPid, 'SIGTERM');
                        if (!await waitForExit(oldPid, 5000)) {
                            throw new Error(`Existing orchestrator process ${oldPid} did not exit within 5000ms`);
                        }
                    } else {
                        writeLog('INFO', `[Orchestrator] Stale PID file found for PID ${oldPid}; proceeding.`);
                    }
                }
            }
        } catch (e) {
            writeLog('ERROR', `[Orchestrator] Failed singleton check: ${e.message}`);
        }
    }

    fs.writeFileSync(PID_FILE, process.pid.toString(), 'utf8');
}

async function waitForExit(pid, timeoutMs) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            process.kill(pid, 0);
        } catch (e) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    return false;
}

function setupCleanupHandlers() {
    const cleanup = () => {
        try {
            if (fs.existsSync(PID_FILE) && parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10) === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        } catch (e) {}
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
        try {
            if (fs.existsSync(PID_FILE) && parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10) === process.pid) {
                fs.unlinkSync(PID_FILE);
            }
        } catch (e) {}
    });
    process.on('uncaughtException', (err) => {
        writeLog('ERROR', `[Orchestrator] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup();
    });
}

function runTask(taskName, reason, onSuccess) {
    const task  = TASK_DEFINITIONS[taskName];
    const state = taskState[taskName];

    if (state.running) {
        writeLog('INFO', `[Orchestrator] Skipping ${task.label}; task already running (PID: ${state.pid}).`);
        return false;
    }

    state.running    = true;
    state.lastRunAt  = Date.now();
    state.lastReason = reason;
    writeState();

    writeLog('INFO', `[Orchestrator] Starting ${task.label} (${reason}).`);
    const child = spawn(task.command, task.args, {stdio: 'ignore'});
    const pidFile = getTaskPidFile(taskName);

    if (child.pid) {
        state.pid = child.pid;
        try {
            fs.writeFileSync(pidFile, child.pid.toString(), 'utf8');
        } catch (e) {
            writeLog('ERROR', `[Orchestrator] Failed to write ${task.label} PID: ${e.message}`);
        }
    }

    let cleared = false;
    const clear = (code, error) => {
        if (cleared) {
            return;
        }
        cleared = true;

        state.running     = false;
        state.pid         = null;
        state.lastExitCode = code;

        try {
            if (fs.existsSync(pidFile)) {
                fs.unlinkSync(pidFile);
            }
        } catch (e) {}

        if (error) {
            state.lastErrorAt = new Date().toISOString();
            writeLog('ERROR', `[Orchestrator] ${task.label} failed to start: ${error.message}`);
        } else if (code === 0) {
            state.lastSuccessAt = new Date().toISOString();
            writeLog('INFO', `[Orchestrator] ${task.label} completed successfully.`);
            if (onSuccess) {
                try {
                    onSuccess();
                } catch (e) {
                    writeLog('ERROR', `[Orchestrator] ${task.label} success hook failed: ${e.message}`);
                }
            }
        } else {
            state.lastErrorAt = new Date().toISOString();
            writeLog('ERROR', `[Orchestrator] ${task.label} exited with code ${code}.`);
        }

        writeState();
    };

    child.on('close', code => clear(code));
    child.on('error', err => clear(null, err));

    writeState();
    return true;
}

function runMaintenanceCycle(now = Date.now()) {
    try {
        const handovers = getUnreadSunsetHandovers(db);

        if (handovers.length > 0) {
            runTask('summary', `sunset-handover:${handovers.length}`, () => {
                markNodesAsRead(db, handovers);
                writeLog('INFO', `[Orchestrator] Marked ${handovers.length} sunset handovers as read.`);
            });
        } else if (shouldRunIntervalTask({
            now,
            lastRunAt : taskState.summary.lastRunAt,
            intervalMs: SUMMARY_SWEEP_INTERVAL_MS
        })) {
            runTask('summary', `periodic-sweep:${SUMMARY_SWEEP_INTERVAL_MS}`);
        }

        if (shouldRunIntervalTask({
            now,
            lastRunAt : taskState.kbSync.lastRunAt,
            intervalMs: KB_SYNC_INTERVAL_MS
        })) {
            runTask('kbSync', `periodic-sync:${KB_SYNC_INTERVAL_MS}`);
        }
    } catch (e) {
        writeLog('ERROR', `[Orchestrator] Maintenance cycle failed: ${e.message}`);
    }
}

function pollLoop() {
    runMaintenanceCycle();
    setTimeout(pollLoop, POLL_INTERVAL_MS);
}

export async function startOrchestrator() {
    fs.ensureDirSync(DAEMON_DATA_DIR);
    await enforceSingleton();
    setupCleanupHandlers();

    taskState = readState();
    recoverTasks();
    db = initializeDatabase(DB_PATH);

    writeLog('INFO', `[Orchestrator] Started. summaryInterval=${SUMMARY_SWEEP_INTERVAL_MS}ms kbSyncInterval=${KB_SYNC_INTERVAL_MS}ms poll=${POLL_INTERVAL_MS}ms.`);
    pollLoop();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startOrchestrator().catch(err => {
        console.error(`[Orchestrator] Failed to start: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    });
}
