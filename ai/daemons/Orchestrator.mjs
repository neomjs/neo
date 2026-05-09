// IMPORTANT: `Neo` MUST be imported before Base / service singletons that call
// `Neo.setupClass()` at module-load time. This keeps the daemon directly runnable
// from Node, matching the persistent-process shape of SwarmHeartbeatService.
import Neo                         from '../../src/Neo.mjs';
import * as core                   from '../../src/core/_export.mjs';

import fs                          from 'fs-extra';
import path                        from 'path';
import {spawn, execSync}           from 'child_process';
import {fileURLToPath}             from 'url';
import Base                        from '../../src/core/Base.mjs';
import HealthService               from '../services/memory-core/HealthService.mjs';
import {
    initializeDatabase
} from '../scripts/bridge-daemon-queries.mjs';
import SummarizationCoordinatorService from './services/SummarizationCoordinatorService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_POLL_INTERVAL_MS          = 3000;
export const DEFAULT_SUMMARY_SWEEP_INTERVAL_MS = 600000;
export const DEFAULT_KB_SYNC_INTERVAL_MS       = 1800000;
export const DEFAULT_BACKUP_INTERVAL_MS        = 86400000;

const DEFAULT_DB_PATH   = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DEFAULT_DATA_DIR  = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../scripts');

/**
 * @summary Parses daemon interval env vars while preserving `0` as disabled.
 *
 * @param {String|undefined} value Environment value.
 * @param {Number} fallback Fallback interval in milliseconds.
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
 * @param {Number} options.now Current timestamp in milliseconds.
 * @param {Number} options.lastRunAt Last start timestamp in milliseconds.
 * @param {Number} options.intervalMs Interval in milliseconds; `0` disables.
 * @returns {Boolean}
 */
export function shouldRunIntervalTask({now, lastRunAt, intervalMs}) {
    return intervalMs > 0 && now - lastRunAt >= intervalMs;
}

/**
 * @summary Builds child-process commands for orchestrator-owned maintenance tasks.
 *
 * The orchestrator intentionally shells out to existing manual maintenance scripts for
 * Piece C instead of reimplementing their internals. This keeps orchestration separate
 * from summarization / KB-sync business logic and gives operators the same scripts for
 * manual recovery.
 *
 * @param {Object} [options]
 * @param {String} [options.scriptDir] Script directory.
 * @param {String} [options.nodeBin] Node executable.
 * @returns {Object}
 */
export function buildTaskDefinitions({scriptDir = DEFAULT_SCRIPT_DIR, nodeBin = process.argv[0]} = {}) {
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
        },
        backup: {
            label          : 'substrate backup',
            command        : nodeBin,
            args           : [path.resolve(scriptDir, '../../buildScripts/ai/backup.mjs')],
            pidFileName    : 'backup.pid',
            expectedCommand: 'backup.mjs'
        }
    };
}

/**
 * @summary Creates the persisted state envelope for orchestrator task tracking.
 *
 * @param {Object} taskDefinitions Task-definition map.
 * @returns {Object}
 */
export function createInitialTaskState(taskDefinitions) {
    return Object.keys(taskDefinitions).reduce((state, taskName) => {
        state[taskName] = {
            running      : false,
            pid          : null,
            lastRunAt    : 0,
            lastSuccessAt: null,
            lastErrorAt  : null,
            lastExitCode : null,
            lastReason   : null
        };
        return state;
    }, {});
}

/**
 * @summary Neo daemon class for Agent OS maintenance scheduling (#11009).
 *
 * `ai/scripts/orchestrator-daemon.mjs` owns the Node-process boot wrapper:
 * PID file, lifecycle traps, and fatal-start isolation. This class owns the
 * actual maintenance loop, task-state persistence, subprocess execution,
 * recovery of already-running child tasks, and task outcome reporting through
 * `HealthService.recordTaskOutcome(...)`.
 *
 * Failure isolation is per task: summary scheduling and KB-sync scheduling are
 * wrapped independently so a thrown sunset-handover read or summary success hook
 * cannot stop the KB-sync lane, and a KB-sync failure cannot stop the next summary
 * sweep.
 *
 * @class Neo.ai.daemons.Orchestrator
 * @extends Neo.core.Base
 * @singleton
 * @see ai/scripts/orchestrator-daemon.mjs
 * @see ai/daemons/services/SummarizationCoordinatorService.mjs
 * @see ai/services/memory-core/HealthService.mjs#recordTaskOutcome
 * @see learn/agentos/v13-path.md
 * @see #11009
 */
export class Orchestrator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.Orchestrator'
         * @protected
         */
        className: 'Neo.ai.daemons.Orchestrator',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Boolean} isPolling_=false
         * @protected
         * @reactive
         */
        isPolling_: false,
        /**
         * @member {Object|null} pollHandle_=null
         * @protected
         * @reactive
         */
        pollHandle_: null,
        /**
         * @member {Object|null} db_=null
         * @protected
         * @reactive
         */
        db_: null,
        /**
         * @member {Object|null} taskState_=null
         * @protected
         * @reactive
         */
        taskState_: null,
        /**
         * @member {Object|null} taskDefinitions_=null
         * @protected
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {String} dataDir_='.neo-ai-data/orchestrator-daemon'
         * @protected
         * @reactive
         */
        dataDir_: DEFAULT_DATA_DIR,
        /**
         * @member {String} dbPath_='.neo-ai-data/sqlite/memory-core-graph.sqlite'
         * @protected
         * @reactive
         */
        dbPath_: DEFAULT_DB_PATH,
        /**
         * @member {String|null} logFile_=null
         * @protected
         * @reactive
         */
        logFile_: null,
        /**
         * @member {String|null} stateFile_=null
         * @protected
         * @reactive
         */
        stateFile_: null,
        /**
         * @member {Number} pollIntervalMs_=3000
         * @protected
         * @reactive
         */
        pollIntervalMs_: DEFAULT_POLL_INTERVAL_MS,
        /**
         * @member {Number} summarySweepIntervalMs_=600000
         * @protected
         * @reactive
         */
        summarySweepIntervalMs_: DEFAULT_SUMMARY_SWEEP_INTERVAL_MS,
        /**
         * @member {Number} kbSyncIntervalMs_=1800000
         * @protected
         * @reactive
         */
        kbSyncIntervalMs_: DEFAULT_KB_SYNC_INTERVAL_MS,
        /**
         * @member {Number} backupIntervalMs_=86400000
         * @protected
         * @reactive
         */
        backupIntervalMs_: DEFAULT_BACKUP_INTERVAL_MS,
        /**
         * @member {Object} healthService_=HealthService
         * @protected
         * @reactive
         */
        healthService_: HealthService,
        /**
         * @member {Object} summarizationCoordinator_=SummarizationCoordinatorService
         * @protected
         * @reactive
         */
        summarizationCoordinator_: SummarizationCoordinatorService,
        /**
         * @member {Function} spawnFn_=spawn
         * @protected
         * @reactive
         */
        spawnFn_: spawn,
        /**
         * @member {Function} processCommandFn_=null
         * @protected
         * @reactive
         */
        processCommandFn_: null,
        /**
         * @member {Function} initializeDatabaseFn_=initializeDatabase
         * @protected
         * @reactive
         */
        initializeDatabaseFn_: initializeDatabase
    }

    /**
     * Applies runtime settings from the wrapper or tests.
     * @param {Object} [options]
     * @returns {void}
     */
    configure(options = {}) {
        const scriptDir = options.scriptDir || DEFAULT_SCRIPT_DIR;
        const dataDir   = options.dataDir   || DEFAULT_DATA_DIR;

        this.dataDir                = dataDir;
        this.dbPath                 = options.dbPath || DEFAULT_DB_PATH;
        this.logFile                = options.logFile   || path.join(dataDir, 'orchestrator.log');
        this.stateFile              = options.stateFile || path.join(dataDir, 'orchestrator-state.json');
        this.pollIntervalMs         = options.pollIntervalMs ?? parseInterval(process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
        this.summarySweepIntervalMs = options.summarySweepIntervalMs ?? parseInterval(
            process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS ?? process.env.NEO_SUMMARIZATION_SWEEP_INTERVAL_MS,
            DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
        );
        this.kbSyncIntervalMs       = options.kbSyncIntervalMs ?? parseInterval(process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS, DEFAULT_KB_SYNC_INTERVAL_MS);
        this.backupIntervalMs       = options.backupIntervalMs ?? parseInterval(process.env.NEO_ORCHESTRATOR_BACKUP_INTERVAL_MS, DEFAULT_BACKUP_INTERVAL_MS);
        this.taskDefinitions        = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin: options.nodeBin || process.argv[0]
        });
        this.healthService          = options.healthService          || HealthService;
        this.summarizationCoordinator = options.summarizationCoordinator || SummarizationCoordinatorService;
        this.spawnFn                = options.spawnFn                || spawn;
        this.processCommandFn       = options.processCommandFn       || this.processCommand.bind(this);
        this.initializeDatabaseFn   = options.initializeDatabaseFn   || initializeDatabase;
    }

    /**
     * Starts the orchestrator process loop after the wrapper has selected this process.
     * @param {Object} [options] Runtime overrides from the boot wrapper.
     * @returns {Promise<void>}
     */
    async start(options = {}) {
        if (this.isPolling) {
            this.writeLog('INFO', '[Orchestrator] Already polling; start() is a no-op.');
            return;
        }

        this.configure(options);

        fs.ensureDirSync(this.dataDir);
        this.taskState = this.readState();
        this.recoverTasks();
        this.db = this.initializeDatabaseFn(this.dbPath);

        this.isPolling = true;
        this.writeLog('INFO', `[Orchestrator] Started. summaryInterval=${this.summarySweepIntervalMs}ms kbSyncInterval=${this.kbSyncIntervalMs}ms backupInterval=${this.backupIntervalMs}ms poll=${this.pollIntervalMs}ms.`);
        this.poll();
    }

    /**
     * Stops the polling loop.
     * @returns {void}
     */
    stop() {
        if (this.pollHandle) {
            clearTimeout(this.pollHandle);
            this.pollHandle = null;
        }

        this.isPolling = false;
    }

    /**
     * Appends a daemon log line to disk and mirrors it to stdout/stderr.
     * @param {String} level Log level.
     * @param {String} message Log message.
     * @returns {void}
     */
    writeLog(level, message) {
        const timestamp = new Date().toISOString();
        const line      = `[${timestamp}] [PID:${process.pid}] [${level}] ${message}`;

        try {
            if (this.logFile) {
                fs.appendFileSync(this.logFile, line + '\n', 'utf8');
            }
        } catch (e) {}

        if (level === 'ERROR') {
            console.error(line);
        } else {
            console.log(line);
        }
    }

    /**
     * Reads persisted task state, clearing stale in-process fields on boot.
     * @returns {Object}
     */
    readState() {
        const fallback = createInitialTaskState(this.taskDefinitions);

        if (!fs.existsSync(this.stateFile)) {
            return fallback;
        }

        try {
            const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
            return Object.keys(fallback).reduce((state, taskName) => {
                state[taskName] = {...fallback[taskName], ...(data[taskName] || {})};
                state[taskName].running = false;
                state[taskName].pid     = null;
                return state;
            }, {});
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Failed to read state file: ${e.message}`);
            return fallback;
        }
    }

    /**
     * Persists the current task-state envelope.
     * @returns {void}
     */
    writeState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.taskState, null, 2), 'utf8');
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Failed to write state file: ${e.message}`);
        }
    }

    /**
     * Resolves the PID file path for a child task.
     * @param {String} taskName Task key.
     * @returns {String}
     */
    getTaskPidFile(taskName) {
        return path.join(this.dataDir, this.taskDefinitions[taskName].pidFileName);
    }

    /**
     * Reads the command line for a process ID.
     * @param {Number} pid Process ID.
     * @returns {String}
     */
    processCommand(pid) {
        return execSync(`ps -p ${pid} -o command=`).toString().trim();
    }

    /**
     * Clears adopted child state after the recovered process exits.
     * @param {String} taskName Task key.
     * @param {Number} pid Process ID.
     * @returns {void}
     */
    clearRecoveredTask(taskName, pid) {
        const task    = this.taskDefinitions[taskName];
        const state   = this.taskState[taskName];
        const pidFile = this.getTaskPidFile(taskName);

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

        this.writeLog('INFO', `[Orchestrator] Recovered ${task.label} process (PID: ${pid}) exited; clearing running state.`);
        this.writeState();
    }

    /**
     * Watches a recovered child process so the persisted running flag does not stick forever.
     * @param {String} taskName Task key.
     * @param {Number} pid Process ID.
     * @returns {void}
     */
    watchRecoveredTask(taskName, pid) {
        const watcher = setInterval(() => {
            try {
                process.kill(pid, 0);
            } catch (e) {
                clearInterval(watcher);
                this.clearRecoveredTask(taskName, pid);
            }
        }, 1000);

        watcher.unref?.();
    }

    /**
     * Adopts or clears an existing child-task PID file during daemon boot.
     * @param {String} taskName Task key.
     * @returns {void}
     */
    recoverTask(taskName) {
        const task    = this.taskDefinitions[taskName];
        const pidFile = this.getTaskPidFile(taskName);

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
            const cmd = this.processCommandFn(pid);

            if (cmd.includes(task.expectedCommand)) {
                this.taskState[taskName].running = true;
                this.taskState[taskName].pid     = pid;
                this.watchRecoveredTask(taskName, pid);
                this.writeLog('INFO', `[Orchestrator] Found running ${task.label} process (PID: ${pid}). Adopting.`);
            } else {
                fs.unlinkSync(pidFile);
                this.writeLog('INFO', `[Orchestrator] Stale ${task.label} PID ${pid} reused by another process. Unlinking.`);
            }
        } catch (e) {
            try {
                fs.unlinkSync(pidFile);
            } catch (unlinkErr) {}
        }
    }

    /**
     * Recovers all child task PID files on boot.
     * @returns {void}
     */
    recoverTasks() {
        for (const taskName of Object.keys(this.taskDefinitions)) {
            this.recoverTask(taskName);
        }
    }

    /**
     * Records task status into HealthService without letting observability failures break the loop.
     * @param {String} taskName Task key.
     * @param {String} status Outcome status.
     * @param {Object|null} [details=null] Outcome details.
     * @returns {void}
     */
    recordTaskOutcome(taskName, status, details = null) {
        try {
            this.healthService?.recordTaskOutcome?.(taskName, status, details);
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] Failed to record ${taskName} outcome: ${e.message}`);
        }
    }

    /**
     * Starts a child task and wires completion status back into task state and HealthService.
     * @param {String} taskName Task key.
     * @param {String} reason Scheduling reason.
     * @param {Function} [onSuccess] Optional success hook.
     * @returns {Boolean} True when a child was started.
     */
    runTask(taskName, reason, onSuccess) {
        const task  = this.taskDefinitions[taskName];
        const state = this.taskState[taskName];

        if (state.running) {
            this.writeLog('INFO', `[Orchestrator] Skipping ${task.label}; task already running (PID: ${state.pid}).`);
            this.recordTaskOutcome(taskName, 'skipped', {reason, pid: state.pid, skippedAt: new Date().toISOString()});
            return false;
        }

        state.running    = true;
        state.lastRunAt  = Date.now();
        state.lastReason = reason;
        this.writeState();

        this.writeLog('INFO', `[Orchestrator] Starting ${task.label} (${reason}).`);

        let child;
        try {
            child = this.spawnFn(task.command, task.args, {stdio: 'ignore'});
        } catch (e) {
            state.running    = false;
            state.pid        = null;
            state.lastErrorAt = new Date().toISOString();
            this.writeLog('ERROR', `[Orchestrator] ${task.label} failed to start: ${e.message}`);
            this.writeState();
            this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'spawn', error: e.message});
            return false;
        }

        const pidFile = this.getTaskPidFile(taskName);

        if (child.pid) {
            state.pid = child.pid;
            try {
                fs.writeFileSync(pidFile, child.pid.toString(), 'utf8');
            } catch (e) {
                this.writeLog('ERROR', `[Orchestrator] Failed to write ${task.label} PID: ${e.message}`);
            }
        }

        this.recordTaskOutcome(taskName, 'running', {reason, pid: child.pid || null, startedAt: new Date().toISOString()});

        let cleared = false;
        const clear = (code, error) => {
            if (cleared) {
                return;
            }
            cleared = true;

            state.running      = false;
            state.pid          = null;
            state.lastExitCode = code;

            try {
                if (fs.existsSync(pidFile)) {
                    fs.unlinkSync(pidFile);
                }
            } catch (e) {}

            if (error) {
                state.lastErrorAt = new Date().toISOString();
                this.writeLog('ERROR', `[Orchestrator] ${task.label} failed to start: ${error.message}`);
                this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'start', error: error.message});
            } else if (code === 0) {
                try {
                    const completedAt = new Date().toISOString();
                    onSuccess?.();
                    state.lastSuccessAt = completedAt;
                    this.writeLog('INFO', `[Orchestrator] ${task.label} completed successfully.`);
                    this.recordTaskOutcome(taskName, 'completed', {reason, code, completedAt});
                } catch (e) {
                    state.lastErrorAt = new Date().toISOString();
                    this.writeLog('ERROR', `[Orchestrator] ${task.label} success hook failed: ${e.message}`);
                    this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'success-hook', error: e.message});
                }
            } else {
                state.lastErrorAt = new Date().toISOString();
                this.writeLog('ERROR', `[Orchestrator] ${task.label} exited with code ${code}.`);
                this.recordTaskOutcome(taskName, 'failed', {reason, code, failedAt: state.lastErrorAt});
            }

            this.writeState();
        };

        child.on('close', code => clear(code));
        child.on('error', err => clear(null, err));

        this.writeState();
        return true;
    }

    /**
     * Runs one named scheduling lane with its own error boundary.
     * @param {String} taskName Task key.
     * @param {Function} fn Scheduling function.
     * @returns {void}
     */
    runTaskCycle(taskName, fn) {
        try {
            fn();
        } catch (e) {
            this.writeLog('ERROR', `[Orchestrator] ${taskName} scheduling failed: ${e.message}`);
            this.recordTaskOutcome(taskName, 'failed', {phase: 'schedule', error: e.message});
        }
    }

    /**
     * Schedules a summary child task when the coordinator reports due work.
     * @param {Number} now Current timestamp in milliseconds.
     * @returns {void}
     */
    runSummaryCycle(now) {
        const trigger = this.summarizationCoordinator.getDueTask({
            db                    : this.db,
            state                 : this.taskState,
            now,
            summarySweepIntervalMs: this.summarySweepIntervalMs,
            log                   : this.writeLog.bind(this)
        });

        if (trigger) {
            this.runTask('summary', trigger.reason, trigger.onSuccess);
        }
    }

    /**
     * Schedules a KB sync child task when its interval is due.
     * @param {Number} now Current timestamp in milliseconds.
     * @returns {void}
     */
    runKbSyncCycle(now) {
        if (shouldRunIntervalTask({
            now,
            lastRunAt : this.taskState.kbSync.lastRunAt,
            intervalMs: this.kbSyncIntervalMs
        })) {
            this.runTask('kbSync', `periodic-sync:${this.kbSyncIntervalMs}`);
        }
    }

    /**
     * Schedules a backup child task when its interval is due.
     * @param {Number} now Current timestamp in milliseconds.
     * @returns {void}
     */
    runBackupCycle(now) {
        if (shouldRunIntervalTask({
            now,
            lastRunAt : this.taskState.backup.lastRunAt,
            intervalMs: this.backupIntervalMs
        })) {
            this.runTask('backup', `periodic-backup:${this.backupIntervalMs}`);
        }
    }

    /**
     * Runs one maintenance sweep with task-level failure isolation.
     * @param {Number} [now=Date.now()] Current timestamp in milliseconds.
     * @returns {void}
     */
    runMaintenanceCycle(now = Date.now()) {
        this.runTaskCycle('summary', () => this.runSummaryCycle(now));
        this.runTaskCycle('kbSync',  () => this.runKbSyncCycle(now));
        this.runTaskCycle('backup',  () => this.runBackupCycle(now));
    }

    /**
     * Executes a sweep and schedules the next poll when the daemon remains active.
     * @returns {void}
     */
    poll() {
        this.runMaintenanceCycle();

        if (this.isPolling) {
            this.pollHandle = setTimeout(() => this.poll(), this.pollIntervalMs);
        }
    }
}

const OrchestratorSingleton = Neo.setupClass(Orchestrator);
export default OrchestratorSingleton;
