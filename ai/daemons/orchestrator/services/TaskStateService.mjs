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
            // The sibling of `failureStreakStartedAt`, for the opposite condition: a task that keeps
            // being DEFERRED rather than keeps failing. Durable because the question it answers — how
            // long has this task been unable to run — outlives the process that measured it, and the
            // in-memory streak map it shadows resets on every restart. A starvation that spans a daemon
            // restart reported a fresh streak, which is how an 8.5-hour priority-0 starvation stayed
            // invisible while every sweep read healthy.
            deferralStreakStartedAt: null,
            interruptedAt          : null
        };
        return state;
    }, {});
}

/**
 * @summary Applies the single failure transition that EVERY terminal-failure writer must share.
 *
 * Three producers record a failed cycle: a run that exited non-zero ({@link TaskStateService#markFailed}),
 * a spawn that threw synchronously ({@link TaskStateService#markSpawnFailed}), and a run interrupted
 * by a crash ({@link TaskStateService#readState}'s fail-closed normalization). The backup scheduler
 * treats `failureStreakStartedAt` as the SOLE activation fact for its bounded retry window, which
 * makes every one of those producers load-bearing — a writer that records `lastErrorAt` without
 * opening the streak leaves its failure invisible to retry policy and forfeits the entire budget.
 * That is not hypothetical: `markSpawnFailed` was exactly that writer, so a failed *start* waited a
 * full interval while the lane reported `healthy`. Centralizing the pair is what stops the next
 * failure producer from becoming a fourth opinion about what "failed" means.
 *
 * `??=` is the other half of the contract. The streak opens once, at the first failure after a
 * success, and must not move when later attempts also fail — `lastErrorAt` advances with every
 * attempt, so a budget measured from it would never close, and on a lane that wins its scheduling
 * pick unconditionally a window that never closes is a lease monopoly rather than a cosmetic bug.
 *
 * @param {Object} state A single task's state envelope, mutated in place.
 * @param {String} timestamp ISO timestamp of the failure.
 * @returns {void}
 */
export function openFailureStreak(state, timestamp) {
    state.lastErrorAt             = timestamp;
    state.failureStreakStartedAt ??= timestamp;
}

/**
 * @summary Opens a task's deferral streak once, at the first deferral after it last ran.
 *
 * The deliberate mirror of {@link openFailureStreak}, for the condition that lane never covers: a task
 * that is repeatedly **deferred** rather than repeatedly failing. A deferred task records no failure, so
 * `failureStreakStartedAt` stays null and every sweep reads healthy while the task never runs — which is
 * the shape of an 8.5-hour priority-0 starvation nobody saw.
 *
 * **`??=` is the whole contract, for the same reason it is in the failure sibling.** The streak marks
 * when the task last became unable to run and must not move while it stays that way. A field that
 * advanced with each deferral would make the elapsed window reset on every poll, so a starvation
 * threshold measured from it could never be crossed — an alarm that is structurally unreachable is
 * worse than none, because the absence of it reads as evidence of health.
 *
 * Closed by {@link TaskStateService#markStarted}: a task that starts is, by definition, no longer
 * deferred. That is the single close point, and it already exists as the universal "this task is running
 * now" writer — so no second opinion about what ends a streak can drift in.
 *
 * @param {Object} state A single task's state envelope, mutated in place.
 * @param {String} timestamp ISO timestamp of the deferral.
 * @returns {void}
 */
export function openDeferralStreak(state, timestamp) {
    state.deferralStreakStartedAt ??= timestamp;
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
         * Task names whose persisted `running: true` the most recent {@link #readState} normalized
         * fail-closed. Drives the durability write in {@link #configure}; empty on a clean boot.
         * @member {String[]|null} interruptedTaskNames_=null
         * @protected
         * @reactive
         */
        interruptedTaskNames_: null,
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

        // Commit the fail-closed normalization BEFORE any consumer can read the lane. Derived only
        // in memory, the crashed `running: true` bytes survive untouched on disk, so the NEXT boot
        // re-derives a FRESH anchor from them — the "bounded" window slides forward by the length of
        // every outage and a crash loop never exhausts a budget that is supposed to terminate. The
        // write is what makes the anchor durable, and durability is the whole non-sliding guarantee.
        if (this.interruptedTaskNames?.length > 0) {
            this.writeState();
            this.writeLog('WARN', `[TaskStateService] Interrupted run(s) normalized fail-closed: ${this.interruptedTaskNames.join(', ')}.`);
        }
    }

    /**
     * Reads persisted task state, clearing stale in-process fields on boot.
     *
     * @summary Records the tasks it normalized in {@link #interruptedTaskNames} so {@link #configure}
     * can persist them. The write cannot happen here: {@link #writeState} serializes `this.taskState`,
     * which `configure()` has not assigned yet at this point.
     * @returns {Object}
     */
    readState() {
        const fallback = createInitialTaskState(this.taskDefinitions);

        this.interruptedTaskNames = [];

        if (!fs.existsSync(this.stateFile)) {
            return fallback;
        }

        try {
            const data        = JSON.parse(fs.readFileSync(this.stateFile, 'utf8')),
                  interrupted = [];

            const taskState = Object.keys(fallback).reduce((state, taskName) => {
                state[taskName] = {...fallback[taskName], ...(data[taskName] || {})};

                // A persisted `running: true` means the process died with the task in flight, so no
                // terminal outcome was ever recorded. Clearing the flag silently — the previous
                // behaviour — projected that run as neither failed nor successful, and any consumer
                // reading "no error since the last success" then reported it as healthy. Normalize
                // FAIL-CLOSED: an interrupted run is not a success, and the streak it belongs to
                // opens here so retry policy can see it.
                if (data[taskName]?.running === true) {
                    const interruptedAt = new Date().toISOString();

                    state[taskName].interruptedAt = interruptedAt;
                    state[taskName].lastExitCode  = null;
                    openFailureStreak(state[taskName], interruptedAt);
                    interrupted.push(taskName)
                }

                state[taskName].running = false;
                state[taskName].pid     = null;
                return state;
            }, {});

            this.interruptedTaskNames = interrupted;
            return taskState;
        } catch (e) {
            this.writeLog('ERROR', `[TaskStateService] Failed to read state file: ${e.message}`);
            return fallback;
        }
    }

    /**
     * Persists the current task-state envelope.
     * @returns {Boolean} True when the envelope was written; false after the existing fail-soft log.
     */
    writeState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify(this.taskState, null, 2), 'utf8');
            return true
        } catch (e) {
            this.writeLog('ERROR', `[TaskStateService] Failed to write state file: ${e.message}`);
            return false
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
        // A task that starts is no longer deferred, so this is where the streak closes — and it closes
        // here rather than anywhere else because this is already the universal "this task is running now"
        // writer. Clearing it at the deferral site instead would need every future deferral path to
        // remember to, which is the second-opinion drift `openFailureStreak`'s docblock records paying
        // for once already.
        state.deferralStreakStartedAt = null;
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
        state.running = false;
        state.pid     = null;
        // A failed START is a failed cycle. This writer used to stamp `lastErrorAt` alone, which the
        // scheduler does not read — so a spawn throw left the lane unanchored and it waited a full
        // interval while reporting `healthy`. Same transition as every other failure producer.
        openFailureStreak(state, new Date().toISOString());
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
     * @summary Records that a task was DEFERRED, opening its durable deferral streak.
     *
     * Separate from {@link TaskStateService#markSkipped} because a skip and a deferral are different
     * facts: a skip can mean *nothing to do* — a repo already current, an empty queue — and a task that
     * is idle for lack of work is not starved. Hanging the streak off every skip would make an idle lane
     * indistinguishable from a blocked one, which is the conflation this measurement exists to end.
     *
     * Writes only when this call opens the streak. The deferral's own reporting stays with the recorder
     * that owns it; this is the durable half, so the answer survives the process that observed it. Once
     * the streak is durable, later deferrals return the same anchor without rewriting the whole envelope.
     *
     * @param {String} taskName
     * @param {String} [deferredAt=new Date().toISOString()] ISO timestamp of THIS deferral.
     * @returns {String|null} The streak start after the write — the first deferral's timestamp, not this one.
     */
    markDeferred(taskName, deferredAt = new Date().toISOString()) {
        const state = this.taskState[taskName];

        if (!state) return null;

        const opensStreak = state.deferralStreakStartedAt === null || state.deferralStreakStartedAt === undefined;

        if (!opensStreak) {
            return state.deferralStreakStartedAt
        }

        openDeferralStreak(state, deferredAt);

        if (!this.writeState()) {
            // `writeState()` is deliberately fail-soft for existing callers. This writer still needs
            // a durable receipt before it can cache/publish the anchor: otherwise one failed first
            // write makes every later poll look unchanged and suppresses persistence forever.
            state.deferralStreakStartedAt = null;
            return null
        }

        return state.deferralStreakStartedAt;
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
        const state = this.taskState[taskName];

        state.running        = false;
        state.pid            = null;
        state.lastExitCode   = code;
        state.lastCompletion = lastCompletion;

        openFailureStreak(state, new Date().toISOString());
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
