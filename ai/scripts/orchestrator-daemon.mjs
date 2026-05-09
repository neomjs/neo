/**
 * @module ai/scripts/orchestrator-daemon
 * @summary Thin Node-process boot wrapper for the Agent OS maintenance orchestrator.
 *
 * Process ownership stays here: PID-file directory creation, CLI entrypoint, and
 * fatal-start error isolation. Scheduling, child-task state, and per-task health
 * reporting live in `Neo.ai.daemons.Orchestrator`.
 *
 * @see ai/daemons/Orchestrator.mjs
 * @see learn/agentos/v13-path.md
 * @see #11009
 */
// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so consumed class files (Orchestrator, TaskStateService,
// ProcessSupervisorService, SummarizationCoordinatorService) can call
// `Neo.setupClass()` at module-load. `InstanceManager` binds `Neo.find` /
// `Neo.findFirst` / `Neo.get` aliases, sets `Base.instanceManagerAvailable=true`,
// and consumes the pre-singleton `Neo.idMap`. All 3 MUST run before any class
// import that uses `Neo.setupClass()`.
import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';

import {pathToFileURL} from 'url';
import fs from 'fs-extra';
import path from 'path';
import {execSync} from 'child_process';
import Orchestrator, {
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    parseInterval
} from '../daemons/Orchestrator.mjs';

const DAEMON_DATA_DIR = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const PID_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator-daemon.pid');
const LOG_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator.log');

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

function processCommand(pid) {
    return execSync(`ps -p ${pid} -o command=`).toString().trim();
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

function removePidFile() {
    try {
        if (fs.existsSync(PID_FILE) && parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10) === process.pid) {
            fs.unlinkSync(PID_FILE);
        }
    } catch (e) {}
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

function setupCleanupHandlers() {
    const cleanup = () => {
        Orchestrator.stop();
        removePidFile();
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', removePidFile);
    process.on('uncaughtException', err => {
        writeLog('ERROR', `[Orchestrator] Uncaught exception: ${err && err.stack ? err.stack : err}`);
        cleanup();
    });
}

/**
 * Starts the singleton orchestrator daemon.
 * @param {Object} [options] Runtime overrides for tests or process managers.
 * @returns {Promise<void>}
 */
export async function startOrchestrator(options = {}) {
    fs.ensureDirSync(DAEMON_DATA_DIR);
    await enforceSingleton();
    setupCleanupHandlers();
    return Orchestrator.start({
        dataDir: DAEMON_DATA_DIR,
        ...options
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startOrchestrator().catch(err => {
        console.error(`[Orchestrator] Failed to start: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    });
}

export {
    DEFAULT_KB_SYNC_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
    parseInterval
};
