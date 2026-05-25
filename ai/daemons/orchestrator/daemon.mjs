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

import {fileURLToPath, pathToFileURL} from 'url';
import fs from 'fs-extra';
import path from 'path';
import {execSync} from 'child_process';
import AiConfig from '../../config.mjs';
import Env from '../../../src/util/Env.mjs';
import Orchestrator from './Orchestrator.mjs';

const DAEMON_DATA_DIR = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const PID_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator-daemon.pid');
const LOG_FILE        = path.join(DAEMON_DATA_DIR, 'orchestrator.log');
export const LOCAL_AI_CONFIG_FILE = fileURLToPath(new URL('../../config.mjs', import.meta.url));

const hasEnvValue = (env, key) => env[key] !== undefined && env[key] !== null && env[key] !== '';

function assignConfigInterval(options, key, value, envNames, env) {
    if (envNames.some(name => hasEnvValue(env, name))) return;
    if (Number.isFinite(value) && value > 0) {
        options[key] = value;
    }
}

function assignLocalOnlyToggle(options, key, value, envName, deploymentMode, env) {
    if (hasEnvValue(env, envName)) return;
    if (typeof value === 'boolean') {
        options[key] = value;
    } else if (deploymentMode === 'cloud') {
        options[key] = false;
    }
}

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
 * Resolves daemon start options from the Tier-1 AI config while preserving env precedence.
 * @param {Object} [options]
 * @param {Object} [options.orchestratorConfig={}] Top-level `orchestrator` config block.
 * @param {Object} [options.maintenanceConfig={}] Top-level `maintenance` config block.
 * @param {Object} [options.env=process.env] Environment source.
 * @returns {Object}
 */
export function resolveOrchestratorStartOptions({
    orchestratorConfig = {},
    maintenanceConfig  = {},
    env                = process.env
} = {}) {
    const options   = {};
    const intervals = orchestratorConfig.intervals || {};

    assignConfigInterval(options, 'pollIntervalMs', intervals.pollMs, ['NEO_ORCHESTRATOR_POLL_INTERVAL_MS'], env);
    assignConfigInterval(
        options,
        'summarySweepIntervalMs',
        intervals.summarySweepMs,
        ['NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS', 'NEO_SUMMARIZATION_SWEEP_INTERVAL_MS'],
        env
    );
    assignConfigInterval(options, 'kbSyncIntervalMs', intervals.kbSyncMs, ['NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS'], env);
    assignConfigInterval(
        options,
        'backupIntervalMs',
        intervals.backupMs ?? maintenanceConfig.backup?.intervalMs,
        ['NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS'],
        env
    );
    assignConfigInterval(
        options,
        'primaryDevSyncIntervalMs',
        intervals.primaryDevSyncMs,
        ['NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_INTERVAL_MS'],
        env
    );
    assignConfigInterval(options, 'dreamIntervalMs', intervals.dreamMs, [], env);
    assignConfigInterval(options, 'goldenPathIntervalMs', intervals.goldenPathMs, [], env);
    assignConfigInterval(
        options,
        'swarmHeartbeatIntervalMs',
        intervals.swarmHeartbeatMs,
        ['NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS'],
        env
    );

    const deploymentMode = orchestratorConfig.deploymentMode || 'local';
    const localOnly      = orchestratorConfig.localOnly || {};

    assignLocalOnlyToggle(
        options,
        'primaryDevSyncEnabled',
        localOnly.primaryDevSyncEnabled,
        'NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED',
        deploymentMode,
        env
    );
    assignLocalOnlyToggle(
        options,
        'kbSyncEnabled',
        localOnly.kbSyncEnabled,
        'NEO_ORCHESTRATOR_KB_SYNC_ENABLED',
        deploymentMode,
        env
    );
    assignLocalOnlyToggle(
        options,
        'bridgeDaemonEnabled',
        localOnly.bridgeDaemonEnabled,
        'NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED',
        deploymentMode,
        env
    );
    assignLocalOnlyToggle(
        options,
        'goldenPathRepoEnrichmentEnabled',
        localOnly.goldenPathRepoEnrichmentEnabled,
        'NEO_ORCHESTRATOR_GOLDEN_PATH_REPO_ENRICHMENT_ENABLED',
        deploymentMode,
        env
    );
    assignLocalOnlyToggle(
        options,
        'swarmHeartbeatEnabled',
        localOnly.swarmHeartbeatEnabled,
        'NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED',
        deploymentMode,
        env
    );

    return options;
}

/**
 * Resolves the effective MLX inference-server config by overlaying env-var overrides
 * onto `AiConfig.orchestrator.mlx`. Operators tune via gitignored `ai/config.mjs`
 * or env (`NEO_ORCHESTRATOR_MLX_{ENABLED,MODEL,PORT}`); canonical defaults
 * (`enabled: false`, Gemma-4 model, port `'11435'`) live in
 * `ai/config.template.mjs` — this helper does not re-embed them.
 *
 * Boolean parsing for `NEO_ORCHESTRATOR_MLX_ENABLED` goes through
 * `Neo.util.Env.parseBool` for canonical token semantics
 * (true/yes/on/1, false/no/off/0, case-insensitive, trimmed).
 *
 * @param {Object} [options]
 * @param {Object} [options.orchestratorConfig={}] Slice of `AiConfig.orchestrator`.
 * @param {Object} [options.env=process.env] Env-var source (test-injectable).
 * @returns {{enabled: Boolean, model: String, port: String}}
 */
export function resolveMlxConfig({orchestratorConfig = {}, env = process.env} = {}) {
    const mlx = orchestratorConfig.mlx || {};

    return {
        enabled: Env.parseBool('NEO_ORCHESTRATOR_MLX_ENABLED', {env}) ?? !!mlx.enabled,
        model  : env.NEO_ORCHESTRATOR_MLX_MODEL || mlx.model,
        port   : env.NEO_ORCHESTRATOR_MLX_PORT  || mlx.port
    };
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
    await loadLocalAiConfig();
    const orchestratorConfig = AiConfig.orchestrator || {};
    const maintenanceConfig  = AiConfig.maintenance || {};
    const mlx                = resolveMlxConfig({orchestratorConfig});

    return Orchestrator.start({
        dataDir: DAEMON_DATA_DIR,
        primaryDevSyncRootsConfig: orchestratorConfig.devSyncRoots,
        mlxEnabled: mlx.enabled,
        mlxModel  : mlx.model,
        mlxPort   : mlx.port,
        ...resolveOrchestratorStartOptions({orchestratorConfig, maintenanceConfig}),
        ...options
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    startOrchestrator().catch(err => {
        console.error(`[Orchestrator] Failed to start: ${err && err.stack ? err.stack : err}`);
        process.exit(1);
    });
}
