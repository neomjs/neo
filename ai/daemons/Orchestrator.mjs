// Neo + core/_export + InstanceManager bootstrap belongs to the daemon entry point
// (`ai/scripts/orchestrator-daemon.mjs`), NOT to this consumed-class file. Class files
// rely on `globalThis.Neo` populated by the entry-point bootstrap; importing Neo here
// would violate the entry-point-only invariant + risk partial-namespace damage if the
// class were ever loaded outside its entry-point's chain.
import fs                          from 'fs-extra';
import path                        from 'path';
import {spawn}                     from 'child_process';
import {fileURLToPath}             from 'url';
import Base                        from '../../src/core/Base.mjs';
import HealthService               from '../services/memory-core/HealthService.mjs';
import {
    initializeDatabase
} from '../scripts/bridge-daemon-queries.mjs';
import SummarizationCoordinatorService from './services/SummarizationCoordinatorService.mjs';
import TaskStateService                from './services/TaskStateService.mjs';
import ProcessSupervisorService        from './services/ProcessSupervisorService.mjs';
import CadenceEngine                   from './services/CadenceEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const DEFAULT_POLL_INTERVAL_MS          = 3000;
export const DEFAULT_SUMMARY_SWEEP_INTERVAL_MS = 600000;
export const DEFAULT_KB_SYNC_INTERVAL_MS       = 1800000;

const DEFAULT_DB_PATH   = process.env.NEO_AI_DB_PATH || '.neo-ai-data/sqlite/memory-core-graph.sqlite';
const DEFAULT_DATA_DIR  = process.env.NEO_AI_ORCHESTRATOR_DIR || '.neo-ai-data/orchestrator-daemon';
const DEFAULT_SCRIPT_DIR = path.resolve(__dirname, '../scripts');

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
        }
    };
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
         * @member {Object} taskStateService_=TaskStateService
         * @protected
         * @reactive
         */
        taskStateService_: TaskStateService,
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
         * @member {Object} healthService_=HealthService
         * @protected
         * @reactive
         */
        healthService_: HealthService,
        /**
         * @member {Object} cadenceEngine_=CadenceEngine
         * @protected
         * @reactive
         */
        cadenceEngine_: CadenceEngine,
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
         * @member {Object} processSupervisorService_=ProcessSupervisorService
         * @protected
         * @reactive
         */
        processSupervisorService_: ProcessSupervisorService,
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
        this.cadenceEngine          = options.cadenceEngine          || CadenceEngine;
        this.pollIntervalMs         = options.pollIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
        this.summarySweepIntervalMs = options.summarySweepIntervalMs ?? this.cadenceEngine.parseInterval(
            process.env.NEO_ORCHESTRATOR_SUMMARY_SWEEP_INTERVAL_MS ?? process.env.NEO_SUMMARIZATION_SWEEP_INTERVAL_MS,
            DEFAULT_SUMMARY_SWEEP_INTERVAL_MS
        );
        this.kbSyncIntervalMs       = options.kbSyncIntervalMs ?? this.cadenceEngine.parseInterval(process.env.NEO_ORCHESTRATOR_KB_SYNC_INTERVAL_MS, DEFAULT_KB_SYNC_INTERVAL_MS);
        this.taskDefinitions        = options.taskDefinitions || buildTaskDefinitions({
            scriptDir,
            nodeBin: options.nodeBin || process.argv[0]
        });
        this.healthService          = options.healthService          || HealthService;
        this.summarizationCoordinator = options.summarizationCoordinator || SummarizationCoordinatorService;
        this.spawnFn                = options.spawnFn                || spawn;
        this.processSupervisorService = options.processSupervisorService || ProcessSupervisorService;
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
        this.taskStateService.configure({
            stateFile      : this.stateFile,
            taskDefinitions: this.taskDefinitions,
            writeLogFn     : this.writeLog.bind(this)
        });
        this.processSupervisorService.set({
            dataDir         : this.dataDir,
            taskDefinitions : this.taskDefinitions,
            taskStateService: this.taskStateService,
            healthService   : this.healthService,
            writeLog        : this.writeLog.bind(this),
            spawnFn         : this.spawnFn
        });

        this.processSupervisorService.recoverTasks();
        this.db = this.initializeDatabaseFn(this.dbPath);

        this.isPolling = true;
        this.writeLog('INFO', `[Orchestrator] Started. summaryInterval=${this.summarySweepIntervalMs}ms kbSyncInterval=${this.kbSyncIntervalMs}ms poll=${this.pollIntervalMs}ms.`);
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
            this.healthService.recordTaskOutcome(taskName, 'failed', {phase: 'schedule', error: e.message});
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
            state                 : this.taskStateService.getState(),
            now,
            summarySweepIntervalMs: this.summarySweepIntervalMs,
            log                   : this.writeLog.bind(this)
        });

        if (trigger) {
            this.processSupervisorService.runTask('summary', trigger.reason, trigger.onSuccess);
        }
    }

    /**
     * Schedules a KB sync child task when its interval is due.
     * @param {Number} now Current timestamp in milliseconds.
     * @returns {void}
     */
    runKbSyncCycle(now) {
        if (this.cadenceEngine.shouldRunIntervalTask({
            now,
            lastRunAt : this.taskStateService.getTaskState('kbSync').lastRunAt,
            intervalMs: this.kbSyncIntervalMs
        })) {
            this.processSupervisorService.runTask('kbSync', `periodic-sync:${this.kbSyncIntervalMs}`);
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

export default Neo.setupClass(Orchestrator);
