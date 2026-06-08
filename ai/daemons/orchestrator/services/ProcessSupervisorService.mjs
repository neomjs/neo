import Base from '../../../../src/core/Base.mjs';
import fs from 'fs-extra';
import path from 'path';
import {execSync} from 'child_process';

/**
 * @class Neo.ai.daemons.services.ProcessSupervisorService
 * @extends Neo.core.Base
 *
 * The supervisor is intentionally non-singleton because it receives parent-provided
 * runtime configuration (`dataDir`, task definitions, task state, health sink,
 * logger, and spawn implementation). The orchestrator owns the instance through a
 * reactive config slot and propagates parent mutations through `afterSet*` hooks.
 */
export class ProcessSupervisorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.ProcessSupervisorService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.ProcessSupervisorService',
        /**
         * @member {String} dataDir_=''
         * @protected
         * @reactive
         */
        dataDir_: '',
        /**
         * @member {Object|null} taskDefinitions_=null
         * @protected
         * @reactive
         */
        taskDefinitions_: null,
        /**
         * @member {Object|null} taskStateService_=null
         * @protected
         * @reactive
         */
        taskStateService_: null,
        /**
         * @member {Object|null} healthService_=null
         * @protected
         * @reactive
         */
        healthService_: null,
        /**
         * @member {Function|null} writeLog_=null
         * @protected
         * @reactive
         */
        writeLog_: null,
        /**
         * @member {Function|null} spawnFn_=null
         * @protected
         * @reactive
         */
        spawnFn_: null
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
     * Resolves the PID file path for a child task.
     * @param {String} taskName Task key.
     * @returns {String}
     */
    getTaskPidFile(taskName) {
        return path.join(this.dataDir, this.taskDefinitions[taskName].pidFileName);
    }

    /**
     * Clears adopted child state after the recovered process exits.
     * @param {String} taskName Task key.
     * @param {Number} pid Process ID.
     * @returns {void}
     */
    clearRecoveredTask(taskName, pid) {
        const task    = this.taskDefinitions[taskName];
        const pidFile = this.getTaskPidFile(taskName);

        if (!this.taskStateService.clearRecovered(taskName, pid)) {
            return;
        }

        try {
            if (fs.existsSync(pidFile) && parseInt(fs.readFileSync(pidFile, 'utf8'), 10) === pid) {
                fs.unlinkSync(pidFile);
            }
        } catch (e) {}

        this.writeLog?.('INFO', `[ProcessSupervisor] Recovered ${task.label} process (PID: ${pid}) exited; clearing running state.`);
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
            const cmd = this.processCommand(pid);

            if (cmd.includes(task.expectedCommand)) {
                this.taskStateService.adoptRunning(taskName, pid);
                this.watchRecoveredTask(taskName, pid);
                this.writeLog?.('INFO', `[ProcessSupervisor] Found running ${task.label} process (PID: ${pid}). Adopting.`);
            } else {
                fs.unlinkSync(pidFile);
                this.writeLog?.('INFO', `[ProcessSupervisor] Stale ${task.label} PID ${pid} reused by another process. Unlinking.`);
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
        for (const taskName of Object.keys(this.taskDefinitions || {})) {
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
            this.writeLog?.('ERROR', `[ProcessSupervisor] Failed to record ${taskName} outcome: ${e.message}`);
        }
    }

    /**
     * Clears the duplicate-running log guard for a task once it starts or exits.
     * @param {String} taskName Task key.
     * @returns {void}
     */
    clearRunningSkipLogState(taskName) {
        if (!this.runningSkipLogKeys) {
            return;
        }

        const prefix = `${taskName}:`;

        for (const key of this.runningSkipLogKeys) {
            if (key.startsWith(prefix)) {
                this.runningSkipLogKeys.delete(key);
            }
        }
    }

    /**
     * Determines whether an already-running skip should be logged.
     * @param {String} taskName Task key.
     * @param {String} reason Scheduling reason.
     * @param {Number|null} pid Running child process ID.
     * @returns {Boolean}
     */
    shouldLogRunningSkip(taskName, reason, pid) {
        this.runningSkipLogKeys ??= new Set();

        const key = `${taskName}:${pid ?? 'unknown'}:${reason}`;

        if (this.runningSkipLogKeys.has(key)) {
            return false;
        }

        this.runningSkipLogKeys.add(key);

        return true;
    }

    /**
     * Maps child-process stderr log prefixes to daemon log severities.
     * @param {String} line Child stderr line.
     * @returns {String}
     */
    getChildLogLevel(line) {
        if (/^\[(LOG|INFO)\](?:\s|$)/.test(line)) {
            return 'INFO';
        }

        if (/^\[WARN\](?:\s|$)/.test(line)) {
            return 'WARN';
        }

        return 'ERROR';
    }

    /**
     * Writes child stderr lines using their child-provided severity prefix.
     * @param {Object} task Task definition.
     * @param {Buffer|String} data Stderr chunk.
     * @returns {void}
     */
    writeChildStderr(task, data) {
        const lines = data.toString().split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        for (const line of lines) {
            this.writeLog?.(this.getChildLogLevel(line), `[ProcessSupervisor] ${task.label} stderr: ${line}`);
        }
    }

    /**
     * Runs an optional post-spawn readiness hook for long-running child tasks.
     *
     * The child process can be alive before its provider surface is useful. LM Studio's
     * `lms server start` is the concrete case: the HTTP server can listen while no chat
     * or embedding model is resident. A task-level hook lets the task own that readiness
     * contract while this supervisor remains provider-agnostic.
     *
     * @param {Object} options
     * @param {String} options.taskName Task key.
     * @param {Object} options.task Task definition.
     * @param {String} options.reason Scheduling reason.
     * @param {Object} options.child Spawned child process.
     * @param {Function} options.clear Completion/failure finalizer.
     * @param {Function} options.isCleared Completion-state guard.
     * @param {Function} [options.onReadinessOutcome] Readiness-status callback.
     * @returns {Promise|null}
     */
    runPostSpawnHook({taskName, task, reason, child, clear, isCleared, onReadinessOutcome}) {
        if (typeof task.postSpawn !== 'function') {
            return null;
        }

        return Promise.resolve()
            .then(() => task.postSpawn({
                taskName,
                task,
                reason,
                pid     : child.pid || null,
                writeLog: this.writeLog
            }))
            .then(result => {
                if (isCleared?.()) {
                    return;
                }
                if (result?.ready === false || result?.degraded === true) {
                    onReadinessOutcome?.('degraded');
                    this.writeLog?.('WARN', `[ProcessSupervisor] ${task.label} readiness hook completed with degraded readiness.`);
                    this.recordTaskOutcome(taskName, 'degraded', {
                        reason,
                        pid      : child.pid || null,
                        readyAt  : new Date().toISOString(),
                        readiness: result || null
                    });
                    return;
                }
                onReadinessOutcome?.('ready');
                this.taskStateService.markReady?.(taskName);
                this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} readiness hook completed successfully.`);
                this.recordTaskOutcome(taskName, 'ready', {
                    reason,
                    pid      : child.pid || null,
                    readyAt  : new Date().toISOString(),
                    readiness: result || null
                });
            })
            .catch(error => {
                if (isCleared?.()) {
                    return;
                }
                onReadinessOutcome?.('failed');
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} readiness hook failed: ${error.message}`);
                try {
                    child.kill?.('SIGTERM');
                } catch (e) {}
                clear(null, error, 'post-spawn-readiness');
            });
    }

    /**
     * Starts a child task and wires completion status back into task state and HealthService.
     * @param {String} taskName Task key.
     * @param {String} reason Scheduling reason.
     * @param {Function} [onSuccess] Optional success hook.
     * @param {Object} [options] Optional configuration.
     * @param {Function} [options.onComplete] Optional completion hook called on both success and failure.
     * @param {Object} [options.env] Optional extra environment variables to merge with process.env.
     * @returns {Boolean} True when a child was started.
     */
    runTask(taskName, reason, onSuccess, options = {}) {
        const task  = this.taskDefinitions[taskName];
        const state = this.taskStateService.getTaskState(taskName);

        if (state.running) {
            if (this.shouldLogRunningSkip(taskName, reason, state.pid)) {
                this.writeLog?.('INFO', `[ProcessSupervisor] Skipping ${task.label}; task already running (PID: ${state.pid}).`);
            }
            this.recordTaskOutcome(taskName, 'skipped', {reason, pid: state.pid, skippedAt: new Date().toISOString()});
            return false;
        }

        this.clearRunningSkipLogState(taskName);
        this.taskStateService.markStarted(taskName, reason);

        this.writeLog?.('INFO', `[ProcessSupervisor] Starting ${task.label} (${reason}).`);

        let child;
        try {
            const env = options.env ? { ...process.env, ...options.env } : process.env;
            child = this.spawnFn(task.command, task.args, {stdio: ['ignore', 'ignore', 'pipe'], env});

            child.stderr?.on('data', data => {
                this.writeChildStderr(task, data);
            });
        } catch (e) {
            this.taskStateService.markSpawnFailed(taskName);
            this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} failed to start: ${e.message}`);
            this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'spawn', error: e.message});
            return false;
        }

        const pidFile = this.getTaskPidFile(taskName);

        if (child.pid) {
            this.taskStateService.markSpawned(taskName, child.pid);
            try {
                fs.writeFileSync(pidFile, child.pid.toString(), 'utf8');
            } catch (e) {
                this.writeLog?.('ERROR', `[ProcessSupervisor] Failed to write ${task.label} PID: ${e.message}`);
            }
        }

        this.recordTaskOutcome(taskName, 'running', {reason, pid: child.pid || null, startedAt: new Date().toISOString()});

        let cleared          = false;
        let deferredClear    = null;
        let readinessPending = typeof task.postSpawn === 'function';
        let readinessOutcome = null;
        let watchdog         = null;

        const executeClear = (code, error, phase = 'start') => {
            if (cleared) {
                return;
            }
            cleared = true;
            clearTimeout(watchdog);

            try {
                if (fs.existsSync(pidFile)) {
                    fs.unlinkSync(pidFile);
                }
            } catch (e) {}
            this.clearRunningSkipLogState(taskName);

            if (error) {
                this.taskStateService.markFailed(taskName, null);
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} failed during ${phase}: ${error.message}`);
                this.recordTaskOutcome(taskName, 'failed', {reason, phase, error: error.message});
            } else if (code === 0) {
                try {
                    const completedAt = new Date().toISOString();
                    onSuccess?.();
                    this.taskStateService.markCompleted(taskName);
                    this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} completed successfully.`);
                    if (readinessOutcome !== 'degraded') {
                        this.recordTaskOutcome(taskName, 'completed', {reason, code, completedAt});
                    }
                } catch (e) {
                    this.taskStateService.markFailed(taskName, null);
                    this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} success hook failed: ${e.message}`);
                    this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'success-hook', error: e.message});
                }
            } else {
                this.taskStateService.markFailed(taskName, code);
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} exited with code ${code}.`);
                this.recordTaskOutcome(taskName, 'failed', {reason, code, failedAt: new Date().toISOString()});
            }

            try {
                options.onComplete?.({code, error});
            } catch (e) {
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} onComplete hook failed: ${e.message}`);
            }
        };

        const clear = (code, error, phase = 'start') => {
            if (readinessPending && !error && code === 0) {
                deferredClear = {code, error, phase};
                return;
            }

            executeClear(code, error, phase);
        };

        this.runPostSpawnHook({
            taskName,
            task,
            reason,
            child,
            clear,
            isCleared: () => cleared,
            onReadinessOutcome: status => { readinessOutcome = status; }
        })?.finally(() => {
            readinessPending = false;

            if (deferredClear && !cleared) {
                const {code, error, phase} = deferredClear;
                deferredClear = null;
                clear(code, error, phase);
            }
        });

        child.on('close', code => clear(code));
        child.on('error', err => clear(null, err, 'child-process'));

        // Max-runtime watchdog (opt-in via task.maxRuntimeMs): a child that hangs — e.g. a
        // downstream model/store call with no timeout — must never keep its `running` flag set
        // indefinitely and starve every other maintenance task. On breach, kill it and finalize
        // as failed so the scheduler can move on.
        if (task.maxRuntimeMs > 0) {
            watchdog = setTimeout(() => {
                if (cleared) {
                    return;
                }
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} exceeded max runtime (${task.maxRuntimeMs}ms) — killing child (watchdog).`);
                try {
                    child.kill?.('SIGTERM');
                } catch (e) {}
                clear(null, new Error(`max runtime ${task.maxRuntimeMs}ms exceeded`), 'watchdog-timeout');
            }, task.maxRuntimeMs);
            watchdog.unref?.();
        }

        return true;
    }

    /**
     * @summary Liveness-gated (re)start decision for one continuous task, evaluated once per poll.
     *
     * The orchestrator stays a thin scheduler: it forwards the poll timestamp and the restart
     * cooldown and lets the supervisor own the "is this task alive, restart if not" decision.
     *
     * Default liveness is process-match — the `running` flag tracks the supervised child, so a
     * down flag past the cooldown is a real restart. A task may instead expose a `livenessProbe()`:
     * a fire-and-exit launcher (LM Studio's `lms server start`) wakes a service that then persists
     * out-of-band, so the supervised child exits and the `running` flag is permanently false. A
     * process match would re-spawn such a task every cooldown; it is gated on the probe instead.
     *
     * @param {String} taskName Task key.
     * @param {Number} now Epoch ms (poll timestamp).
     * @param {Number} cooldownMs Minimum gap between (re)start attempts.
     * @returns {void}
     */
    superviseTask(taskName, now, cooldownMs) {
        const state = this.taskStateService.getTaskState(taskName);

        if (!state || state.running || now - (state.lastRunAt || 0) <= cooldownMs) {
            return;
        }

        const task = this.taskDefinitions[taskName];

        if (typeof task?.livenessProbe === 'function') {
            this.gateRestartOnLivenessProbe(taskName, task, now, cooldownMs);
        } else {
            this.runTask(taskName, 'supervisor-restart');
        }
    }

    /**
     * @summary Probe-gated restart for a fire-and-exit lane (see `superviseTask`).
     *
     * Stays provider-agnostic: the task owns the actual check via `livenessProbe()` (e.g. an
     * HTTP poll of an OpenAI-compatible endpoint); this method only schedules and de-dupes it.
     * The confirmed-at + in-flight guards keep a healthy endpoint silent — after an `up` result
     * the lane is skipped for a full cooldown (at most one cheap probe per cooldown, no log
     * storm), and overlapping probes are suppressed. `down` or a throwing probe restarts the lane.
     *
     * @param {String} taskName Task key.
     * @param {Object} task Task definition (carries `livenessProbe`).
     * @param {Number} now Epoch ms (poll timestamp).
     * @param {Number} cooldownMs Minimum gap between probes / restart attempts.
     * @returns {void}
     */
    gateRestartOnLivenessProbe(taskName, task, now, cooldownMs) {
        this._livenessConfirmedAt   ??= {};
        this._livenessProbeInFlight ??= {};

        if (now - (this._livenessConfirmedAt[taskName] || 0) <= cooldownMs || this._livenessProbeInFlight[taskName]) {
            return;
        }

        this._livenessProbeInFlight[taskName] = true;

        task.livenessProbe()
            .then(up => {
                if (up) {
                    this._livenessConfirmedAt[taskName] = Date.now();
                } else {
                    this.runTask(taskName, 'supervisor-restart');
                }
            })
            .catch(() => this.runTask(taskName, 'supervisor-restart'))
            .finally(() => { this._livenessProbeInFlight[taskName] = false; });
    }

    /**
     * @summary Enforces a single live process for a port-owning ("singleton") task by
     * SIGKILLing any extra listeners on its port.
     *
     * The orchestrator is the sole authority for these daemons (chroma). When more than one
     * process binds the task's `singletonPort` — an externally-started instance, a
     * pre-unification leftover, or a second orchestrator — the duplicates corrupt a shared
     * persist dir. This keeps the orchestrator-tracked pid and SIGKILLs the rest. SIGTERM is
     * deliberately not attempted: chroma does not honor it, so a graceful signal only delays
     * the unavoidable SIGKILL. Each candidate's command is verified against `expectedCommand`
     * first, so an unrelated process that merely happens to hold the port is never touched.
     *
     * @param {String} taskName Task key.
     * @returns {Number} Count of duplicate processes reaped.
     */
    reapDuplicateListeners(taskName) {
        const task = this.taskDefinitions[taskName];
        if (!task?.singletonPort) {
            return 0;
        }

        const listenerPids = this.listPortListeners(task.singletonPort);
        const canonicalPid = this.taskStateService.getTaskState(taskName)?.pid;
        let   reaped       = 0;

        for (const pid of listenerPids) {
            if (!Number.isInteger(pid) || pid === canonicalPid) {
                continue;
            }

            let command;
            try {
                command = this.processCommand(pid);
            } catch (e) {
                continue;
            }

            if (!command.includes(task.expectedCommand)) {
                continue;
            }

            try {
                this.killProcess(pid);
                reaped++;
                this.writeLog?.('WARN', `[ProcessSupervisor] Reaped duplicate ${task.label} (PID: ${pid}); canonical is ${canonicalPid ?? 'none'}.`);
                this.recordTaskOutcome(taskName, 'reaped-duplicate', {pid, canonicalPid: canonicalPid ?? null, reapedAt: new Date().toISOString()});
            } catch (e) {
                this.writeLog?.('ERROR', `[ProcessSupervisor] Failed to reap duplicate ${task.label} (PID: ${pid}): ${e.message}`);
            }
        }

        return reaped;
    }

    /**
     * Lists PIDs holding a LISTEN socket on the given TCP port. A no-op in unit-test mode so
     * the supervision loop never touches real sockets while specs run; the reap unit tests
     * override this seam to exercise the logic.
     * @param {Number} port
     * @returns {Number[]}
     */
    listPortListeners(port) {
        if (process.env.UNIT_TEST_MODE === 'true') {
            return [];
        }

        try {
            const out = execSync(`lsof -nP -ti tcp:${port} -sTCP:LISTEN`, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
            return out ? out.split('\n').map(line => parseInt(line, 10)).filter(Number.isInteger) : [];
        } catch (e) {
            // lsof exits non-zero when nothing is listening (or it is unavailable) — nothing to reap.
            return [];
        }
    }

    /**
     * Sends SIGKILL to a process. SIGTERM is intentionally skipped (chroma ignores it). A
     * no-op in unit-test mode so the supervision loop never kills a real process during specs;
     * the reap unit tests override this seam.
     * @param {Number} pid
     * @returns {void}
     */
    killProcess(pid) {
        if (process.env.UNIT_TEST_MODE === 'true') {
            return;
        }
        process.kill(pid, 'SIGKILL');
    }

    /**
     * Recycles a supervised task: SIGKILLs its tracked process (no-op under UNIT_TEST_MODE)
     * and marks it recycled so the poll loop respawns a fresh one. Used by the chroma
     * max-runtime recycle. Safe when no pid is currently tracked (e.g. already exited).
     * @param {String} taskName
     * @param {String} reason
     * @returns {void}
     */
    killTask(taskName, reason) {
        const pid = this.taskStateService.getTaskState(taskName)?.pid;
        if (pid) {
            this.killProcess(pid);
        }
        this.taskStateService.markRecycled(taskName);
        this.recordTaskOutcome(taskName, 'recycled', {reason, pid: pid ?? null, recycledAt: new Date().toISOString()});
        this.writeLog?.('INFO', `[ProcessSupervisor] Recycled ${this.taskDefinitions[taskName]?.label || taskName} (PID: ${pid ?? 'none'}); reason: ${reason}.`);
    }
}

export default Neo.setupClass(ProcessSupervisorService);
