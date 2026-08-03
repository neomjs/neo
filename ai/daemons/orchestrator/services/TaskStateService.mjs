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
            running               : false,
            pid                   : null,
            lastRunAt             : 0,
            lastSuccessAt         : null,
            lastErrorAt           : null,
            lastExitCode          : null,
            lastReason            : null,
            lastCompletion        : null,
            failureStreakStartedAt: null,
            interruptedAt         : null
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

                // A persisted `running: true` means the process died with the task in flight, so no
                // terminal outcome was ever recorded. Clearing the flag silently — the previous
                // behaviour — projected that run as neither failed nor successful, and any consumer
                // reading "no error since the last success" then reported it as healthy. Normalize
                // FAIL-CLOSED: an interrupted run is not a success, and the streak it belongs to
                // opens here so retry policy can see it.
                if (data[taskName]?.running === true) {
                    const interruptedAt = new Date().toISOString();

                    state[taskName].interruptedAt          = interruptedAt;
                    state[taskName].lastErrorAt            = interruptedAt;
                    state[taskName].lastExitCode           = null;
                    state[taskName].failureStreakStartedAt ??= interruptedAt
                }

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
     * @param {Object|null} [lastCompletion=null] Bounded task-specific completion metadata.
     * @returns {void}
     */
    markCompleted(taskName, lastCompletion=null) {
        const state = this.taskState[taskName];
        state.running       = false;
        state.pid           = null;
        state.lastExitCode  = 0;
        state.lastSuccessAt = new Date().toISOString();
        state.lastCompletion = lastCompletion;
        // Success closes the streak and clears the interruption marker: the lane is known-good again.
        state.failureStreakStartedAt = null;
        state.interruptedAt          = null;
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
     * @param {Object|null} [lastCompletion=null] Bounded task-specific completion metadata.
     * @returns {void}
     */
    markSkipped(taskName, lastCompletion=null) {
        const state = this.taskState[taskName];
        state.running      = false;
        state.pid          = null;
        state.lastExitCode = null;
        state.lastCompletion = lastCompletion;
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
     * @param {Object|null} [lastCompletion=null] Bounded task-specific completion metadata.
     * @returns {void}
     */
    markFailed(taskName, code, lastCompletion=null) {
        const state = this.taskState[taskName],
              now   = new Date().toISOString();

        state.running      = false;
        state.pid          = null;
        state.lastExitCode = code;
        state.lastErrorAt  = now;
        state.lastCompletion = lastCompletion;

        // The streak opens at the FIRST failure after a success and never moves again until one
        // lands. `lastErrorAt` advances with every subsequent attempt, so a retry budget measured
        // from it would slide forever; this anchor is what makes such a budget terminate. `??=`
        // is the whole contract — a second failure must not re-open the window.
        state.failureStreakStartedAt ??= now;
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
