import fs   from 'fs-extra';
import Base from '../../../../src/core/Base.mjs';
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
 * @summary Manages persistence and runtime state tracking for Daemon child processes.
 *
 * @class Neo.ai.daemons.services.TaskStateService
 * @extends Neo.core.Base
 * @singleton
 */
export class TaskStateService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.TaskStateService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.TaskStateService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String|null} stateFile_=null
         * @protected
         * @reactive
         */
        stateFile_: null,
        /**
         * @member {Object|null} taskDefinitions_=null
         * @protected
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {Object|null} taskState_=null
         * @protected
         * @reactive
         */
        taskState_: null,
        /**
         * @member {Function|null} writeLogFn_=null
         * @protected
         * @reactive
         */
        writeLogFn_: null
    }

    /**
     * @param {Object} config
     * @returns {void}
     */
    construct(config) {
        super.construct(config);
    }

    /**
     * Configures the service and reads the initial state.
     * @param {Object} options
     * @param {String} options.stateFile
     * @param {Object} options.taskDefinitions
     * @param {Function} [options.writeLogFn]
     * @returns {void}
     */
    configure(options) {
        this.stateFile       = options.stateFile;
        this.taskDefinitions = options.taskDefinitions;
        this.writeLogFn      = options.writeLogFn || (() => {});
        this.taskState       = this.readState();
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
            this.writeLog('ERROR', `[TaskStateService] Failed to read state file: ${e.message}`);
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
            this.writeLog('ERROR', `[TaskStateService] Failed to write state file: ${e.message}`);
        }
    }

    /**
     * Gets the full task state.
     * @returns {Object}
     */
    getState() {
        return this.taskState;
    }

    /**
     * Gets the state for a specific task.
     * @param {String} taskName
     * @returns {Object}
     */
    getTaskState(taskName) {
        return this.taskState[taskName];
    }

    /**
     * Marks a task as running (pre-spawn) and persists the state.
     * @param {String} taskName
     * @param {String} reason
     * @returns {void}
     */
    markStarted(taskName, reason) {
        const state = this.taskState[taskName];
        state.running    = true;
        state.lastRunAt  = Date.now();
        state.lastReason = reason;
        this.writeState();
    }

    /**
     * Marks a task as successfully spawned, assigning its PID and persisting the state.
     * @param {String} taskName
     * @param {Number|null} pid
     * @returns {void}
     */
    markSpawned(taskName, pid) {
        const state = this.taskState[taskName];
        state.pid = pid;
        this.writeState();
    }

    /**
     * Marks a task as having failed to spawn (e.g., spawn threw synchronously).
     * @param {String} taskName
     * @returns {void}
     */
    markSpawnFailed(taskName) {
        const state = this.taskState[taskName];
        state.running      = false;
        state.pid          = null;
        state.lastErrorAt  = new Date().toISOString();
        this.writeState();
    }

    /**
     * Marks a task as successfully completed.
     * @param {String} taskName
     * @returns {void}
     */
    markCompleted(taskName) {
        const state = this.taskState[taskName];
        state.running       = false;
        state.pid           = null;
        state.lastExitCode  = 0;
        state.lastSuccessAt = new Date().toISOString();
        this.writeState();
    }

    /**
     * Marks a long-running task as ready without clearing its running PID.
     * @param {String} taskName
     * @returns {void}
     */
    markReady(taskName) {
        const state = this.taskState[taskName];
        state.lastExitCode  = 0;
        state.lastSuccessAt = new Date().toISOString();
        this.writeState();
    }

    /**
     * Marks a task as skipped without treating the no-op as a successful run.
     * @param {String} taskName
     * @returns {void}
     */
    markSkipped(taskName) {
        const state = this.taskState[taskName];
        state.running      = false;
        state.pid          = null;
        state.lastExitCode = null;
        this.writeState();
    }

    /**
     * Marks a task as recycled — process intentionally killed for restart. Clears running +
     * pid so the supervisor loop respawns it; intentionally records no error/success
     * timestamp (a recycle is neither a failure nor a successful completion). Used by the
     * chroma max-runtime recycle.
     * @param {String} taskName
     * @returns {void}
     */
    markRecycled(taskName) {
        const state = this.taskState[taskName];
        state.running = false;
        state.pid     = null;
        this.writeState();
    }

    /**
     * Marks a task as failed.
     * @param {String} taskName
     * @param {Number|null} code
     * @returns {void}
     */
    markFailed(taskName, code) {
        const state = this.taskState[taskName];
        state.running      = false;
        state.pid          = null;
        state.lastExitCode = code;
        state.lastErrorAt  = new Date().toISOString();
        this.writeState();
    }

    /**
     * Adopts a previously running process.
     * @param {String} taskName
     * @param {Number} pid
     * @returns {void}
     */
    adoptRunning(taskName, pid) {
        const state = this.taskState[taskName];
        state.running = true;
        state.pid     = pid;
        // Don't call writeState here; recoverTasks in Orchestrator didn't write it immediately.
    }

    /**
     * Clears running state for a recovered task when it exits.
     * @param {String} taskName
     * @param {Number} pid
     * @returns {Boolean} True if the state was cleared.
     */
    clearRecovered(taskName, pid) {
        const state = this.taskState[taskName];
        if (state.pid !== pid) {
            return false;
        }

        state.running      = false;
        state.pid          = null;
        state.lastExitCode = null;
        this.writeState();
        return true;
    }

    /**
     * Helper to call the injected log function.
     * @param {String} level
     * @param {String} message
     * @returns {void}
     */
    writeLog(level, message) {
        if (this.writeLogFn) {
            this.writeLogFn(level, message);
        }
    }
}

export default Neo.setupClass(TaskStateService);
