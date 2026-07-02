/**
 * @module ai/daemons/orchestrator/daemon
 * @summary Thin Node-process boot wrapper for the Agent OS maintenance orchestrator.
 *
 * Process ownership stays here: PID-file directory creation, CLI entrypoint, and
 * fatal-start error isolation. Scheduling, child-task state, and per-task health
 * reporting live in `Neo.ai.daemons.Orchestrator`.
 *
 * @see ai/daemons/orchestrator/Orchestrator.mjs
 * @see learn/agentos/v13-path.md
 */
// dotenv: load local `.env` into `process.env` before ANY consumer reads env vars.
// Cloud deployment doesn't need it (env-only via docker-compose); local dev needs
// it for `.env` file load. Placement at the orchestrator entrypoint is deliberate
// so env-file loading stays entrypoint-local instead of becoming a global registry
// or shared substrate.
import 'dotenv/config';

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so consumed class files (Orchestrator, TaskStateService,
// ProcessSupervisorService, etc.) can call `Neo.setupClass()` at module-load.
// `InstanceManager` binds `Neo.find` / `Neo.findFirst` / `Neo.get` aliases, sets
// `Base.instanceManagerAvailable=true`, and consumes the pre-singleton `Neo.idMap`.
// All 3 MUST run before any class import that uses `Neo.setupClass()`.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import {fileURLToPath, pathToFileURL}        from 'url';
import fs                                    from 'fs-extra';
import path                                  from 'path';
import {execSync}                            from 'child_process';
import AiConfig                              from '../../config.mjs';
import Orchestrator, {rotateLogFileIfNewDay} from './Orchestrator.mjs';
import {assertConfigFresh}                   from '../../scripts/setup/initServerConfigs.mjs';

const DAEMON_DATA_DIR               = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const PID_FILE                      = path.join(DAEMON_DATA_DIR, 'orchestrator-daemon.pid');
const LOG_FILE                      = path.join(DAEMON_DATA_DIR, 'orchestrator.log');
const ORCHESTRATOR_DAEMON_PATH_TAIL = 'ai/daemons/orchestrator/daemon.mjs';
export const LOCAL_AI_CONFIG_FILE = fileURLToPath(new URL('../../config.mjs', import.meta.url));

/**
 * @summary Checks whether a process command belongs to this daemon entry point.
 * Uses the orchestrator-specific path-tail to avoid sibling `daemon.mjs` collisions.
 * @param {String} cmd Process command line.
 * @returns {Boolean}
 */
export function isOrchestratorDaemonCommand(cmd) {
    return cmd.includes(ORCHESTRATOR_DAEMON_PATH_TAIL);
}

function writeLog(level, message) {
    // Both this wrapper writer AND Orchestrator.writeLog append to the same orchestrator.log, so
    // BOTH must rotate-before-append: an unguarded append here would advance the file's mtime past
    // the day boundary and defeat the mtime-based daily rotation.
    rotateLogFileIfNewDay(LOG_FILE);

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

                    if (isOrchestratorDaemonCommand(cmd)) {
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
 * Loads the gitignored top-level AI config when present.
 * @param {Object} [options]
 * @param {String} [options.configPath=LOCAL_AI_CONFIG_FILE] Config path.
 * @param {Object} [options.aiConfig=AiConfig] Config singleton.
 * @param {Function} [options.existsSync=fs.existsSync] Existence seam.
 * @returns {Promise<Object>}
 */
export async function loadLocalAiConfig({
    configPath = LOCAL_AI_CONFIG_FILE,
    aiConfig   = AiConfig,
    existsSync = fs.existsSync
} = {}) {
    if (!existsSync(configPath)) {
        return {loaded: false, configPath};
    }

    await aiConfig.load(configPath);

    return {loaded: true, configPath};
}

/**
 * Starts the singleton orchestrator daemon.
 *
 * Thin process-boot wrapper: PID singleton enforcement, signal handlers, env-file
 * loading, Neo namespace bootstrap (already done at module-top), local AI config
 * load, then delegation to `Orchestrator.start()`. Lane-internal config (intervals,
 * enable flags, mlx/lms server tuning) is read by the Orchestrator itself via
 * env-precedence getters that consult `AiConfig.orchestrator.X` directly — this
 * function does NOT pre-resolve those into a flat options bag.
 *
 * @param {Object} [options] Test-injection seams (scriptDir, dbPath, taskDefinitions, ...).
 * @returns {Promise<void>}
 */
export async function startOrchestrator(options = {}) {
    fs.ensureDirSync(DAEMON_DATA_DIR);
    await enforceSingleton();
    setupCleanupHandlers();
    await loadLocalAiConfig();

    return Orchestrator.start({
        dataDir                  : DAEMON_DATA_DIR,
        primaryDevSyncRootsConfig: AiConfig.orchestrator.devSyncRoots,
        ...options
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    // Boot guard: fail fast on a stale config overlay (missing a leaf its template added) with an
    // actionable --migrate-config message, rather than letting the orchestrator crash cryptically.
    assertConfigFresh({aiConfig: AiConfig, entrypoint: 'orchestrator-daemon'})
        .then(() => startOrchestrator())
        .catch(err => {
            console.error(`[Orchestrator] Failed to start: ${err && err.stack ? err.stack : err}`);
            process.exit(1);
        });
}
