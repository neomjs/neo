import Base                           from '../../../../src/core/Base.mjs';
import fs                             from 'fs-extra';
import path                           from 'path';
import {execSync}                     from 'child_process';
import {createRecoveryDiagnosisEvent} from '../../../services/memory-core/helpers/recoveryRunStateStore.mjs';

const DEFAULT_STDOUT_JSON_MAX_BYTES = 65536;
const ESCALATING_TASK_OUTCOMES      = Object.freeze(new Set(['backup']));

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
         * @member {Object|null} recoveryActuatorService_=null
         * @protected
         * @reactive
         */
        recoveryActuatorService_: null,
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
     * Records task status into HealthService and escalates critical task failures.
     *
     * Health recording is observability-only; escalation is alarm-only for allowlisted critical
     * failed tasks, and never restarts the failed task from this sink.
     *
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

        this.escalateFailedTaskOutcome({taskName, status, details});
    }

    /**
     * @summary Escalates allowlisted failed task outcomes through the recovery diagnosis sink.
     *
     * This is alarm-only: it creates a `supervised-task` diagnosis and calls
     * `RecoveryActuatorService.escalateDiagnosis()` without restarting the task.
     *
     * @param {Object} options
     * @param {String} options.taskName Task key.
     * @param {String} options.status Outcome status.
     * @param {Object|null} [options.details=null] Outcome details.
     * @returns {Boolean} True when an escalation was attempted.
     */
    escalateFailedTaskOutcome({taskName, status, details}) {
        if (status !== 'failed' || !ESCALATING_TASK_OUTCOMES.has(taskName)) {
            return false;
        }

        const actuator = this.recoveryActuatorService;

        if (typeof actuator?.escalateDiagnosis !== 'function') {
            return false;
        }

        const observedAt = Date.now(),
              diagnosis  = createRecoveryDiagnosisEvent({
                  diagnosisId   : `process-supervisor:${taskName}:failed:${observedAt}`,
                  recoveryClass : 'ambiguous',
                  confidence    : 1,
                  targetIdentity: {kind: 'supervised-task', id: taskName},
                  evidenceFacts : [{
                      type   : 'task-failure',
                      taskName,
                      status,
                      details: details || {},
                      observedAt
                  }],
                  observedAt,
                  source : 'process-supervisor-task-outcome',
                  details: {
                      actionClass   : 'escalate',
                      reasonCode    : 'maintenance-task-failure',
                      taskName,
                      taskStatus    : status,
                      outcomeDetails: details || {}
                  }
              });

        Promise.resolve(actuator.escalateDiagnosis(diagnosis, {
            now   : observedAt,
            reason: 'maintenance-task-failure'
        })).catch(error => {
            this.writeLog?.('ERROR', `[ProcessSupervisor] Failed to escalate ${taskName} failure: ${error.message}`);
        });

        return true;
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
     * @summary Resets stable-success logging when readiness leaves the healthy state.
     *
     * Clears a readiness-success log guard after degraded/failed/down states.
     * @param {String} taskName Task key.
     * @param {String} phase Readiness phase key.
     * @returns {void}
     */
    clearReadinessSuccessLogState(taskName, phase) {
        this.readinessSuccessLogKeys?.delete(`${taskName}:${phase}`);
    }

    /**
     * @summary Allows only the first stable readiness success log for a task phase.
     *
     * Determines whether a stable readiness success transition should be logged.
     * @param {String} taskName Task key.
     * @param {String} phase Readiness phase key.
     * @returns {Boolean}
     */
    shouldLogReadinessSuccess(taskName, phase) {
        this.readinessSuccessLogKeys ??= new Set();

        const key = `${taskName}:${phase}`;

        if (this.readinessSuccessLogKeys.has(key)) {
            return false;
        }

        this.readinessSuccessLogKeys.add(key);

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
     * Runs the task readiness hook after an out-of-band service passes liveness.
     *
     * Fire-and-exit launchers such as `lms server start` can leave the HTTP endpoint healthy
     * while their model-residency contract is stale. Reusing the task-owned readiness hook here
     * lets the LM Studio task enforce configured model context even when no child spawn happens.
     *
     * @param {String} taskName Task key.
     * @param {Object} task Task definition.
     * @param {String} reason Scheduling reason.
     * @param {Function} [onFailure] Callback for readiness-hook failures.
     * @returns {Promise|null}
     */
    runLivenessReadinessHook(taskName, task, reason, onFailure) {
        if (typeof task.postSpawn !== 'function') {
            return null;
        }

        return Promise.resolve()
            .then(() => task.postSpawn({
                taskName,
                task,
                reason,
                pid     : null,
                writeLog: this.writeLog
            }))
            .then(result => {
                if (result?.ready === false || result?.degraded === true) {
                    this.clearReadinessSuccessLogState(taskName, 'liveness');
                    this.writeLog?.('WARN', `[ProcessSupervisor] ${task.label} readiness hook completed with degraded readiness after liveness confirmation.`);
                    this.recordTaskOutcome(taskName, 'degraded', {
                        reason,
                        pid      : null,
                        readyAt  : new Date().toISOString(),
                        readiness: result || null
                    });
                    return;
                }

                this.taskStateService.markReady?.(taskName);
                if (this.shouldLogReadinessSuccess(taskName, 'liveness')) {
                    this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} readiness hook completed successfully after liveness confirmation.`);
                }
                this.recordTaskOutcome(taskName, 'ready', {
                    reason,
                    pid      : null,
                    readyAt  : new Date().toISOString(),
                    readiness: result || null
                });
            })
            .catch(error => {
                this.clearReadinessSuccessLogState(taskName, 'liveness');
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} readiness hook failed after liveness confirmation: ${error.message}`);
                this.recordTaskOutcome(taskName, 'failed', {
                    reason,
                    phase: 'liveness-readiness',
                    error: error.message
                });
                onFailure?.();
            });
    }

    /**
     * Starts a child task and wires completion status back into task state and HealthService.
     * @param {String} taskName Task key.
     * @param {String} reason Scheduling reason.
     * @param {Function} [onSuccess] Optional success hook.
     * @param {Object} [options] Optional configuration.
     * @param {Function} [options.onComplete] Optional completion hook called on both success and failure.
     * @param {Object} [options.env] Optional call-site environment variables to merge after task env.
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
        this.clearReadinessSuccessLogState(taskName, 'liveness');
        this.taskStateService.markStarted(taskName, reason);

        this.writeLog?.('INFO', `[ProcessSupervisor] Starting ${task.label} (${reason}).`);

        let child;
        const stdoutCapture = this.createStdoutJsonCapture(task);
        try {
            const env = task.env || options.env
                ? {...process.env, ...(task.env || {}), ...(options.env || {})}
                : process.env;
            child = this.spawnFn(task.command, task.args, {stdio: stdoutCapture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'], env});

            child.stderr?.on('data', data => {
                this.writeChildStderr(task, data);
            });
            child.stdout?.on('data', data => {
                this.captureStdoutJsonChunk(stdoutCapture, data);
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
                    const completedAt   = new Date().toISOString();
                    const stdoutOutcome = this.parseCapturedStdoutJson(stdoutCapture);
                    const disposition   = this.classifySuccessfulChildOutcome(taskName, stdoutOutcome.outcome);

                    onSuccess?.();

                    if (disposition.status === 'skipped') {
                        this.taskStateService.markSkipped(taskName);
                        this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} skipped (${disposition.reasonCode}).`);
                        this.recordTaskOutcome(taskName, 'skipped', {
                            reason,
                            code,
                            reasonCode: disposition.reasonCode,
                            skippedAt : completedAt,
                            ...stdoutOutcome.details
                        });
                    } else {
                        this.taskStateService.markCompleted(taskName);
                        this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} completed successfully.`);
                        if (readinessOutcome !== 'degraded') {
                            this.recordTaskOutcome(taskName, 'completed', {
                                reason,
                                code,
                                completedAt,
                                ...stdoutOutcome.details
                            });
                        }
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
            isCleared         : () => cleared,
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
     * Creates the bounded stdout buffer for task definitions with a JSON outcome contract.
     * @param {Object} task Task definition.
     * @returns {Object|null}
     */
    createStdoutJsonCapture(task) {
        if (!task.captureStdoutJson) {
            return null;
        }

        return {
            chunks  : [],
            overflow: false,
            bytes   : 0,
            maxBytes: task.stdoutJsonMaxBytes || DEFAULT_STDOUT_JSON_MAX_BYTES
        };
    }

    /**
     * Buffers stdout for opted-in JSON outcome tasks without allowing unbounded child output.
     * @param {Object|null} capture Active stdout capture state.
     * @param {Buffer|String} data Child stdout chunk.
     * @returns {void}
     */
    captureStdoutJsonChunk(capture, data) {
        if (!capture || capture.overflow) {
            return;
        }

        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        capture.bytes += chunk.length;

        if (capture.bytes > capture.maxBytes) {
            capture.overflow = true;
            capture.chunks.length = 0;
            return;
        }

        capture.chunks.push(chunk);
    }

    /**
     * Parses the opted-in child stdout JSON and converts parse failures into bounded details.
     * @param {Object|null} capture Active stdout capture state.
     * @returns {{details: Object, outcome: Object|null}}
     */
    parseCapturedStdoutJson(capture) {
        if (!capture) {
            return {details: {}, outcome: null};
        }

        if (capture.overflow) {
            return {
                details: {
                    stdoutJsonBytes   : capture.bytes,
                    stdoutJsonMaxBytes: capture.maxBytes,
                    stdoutJsonOverflow: true
                },
                outcome: null
            };
        }

        const stdout = Buffer.concat(capture.chunks).toString('utf8').trim();

        if (!stdout) {
            return {details: {stdoutJsonMissing: true}, outcome: null};
        }

        try {
            const outcome = JSON.parse(stdout);
            return {
                details: this.buildChildOutcomeDetails(outcome),
                outcome
            };
        } catch (e) {
            return {
                details: {
                    stdoutJsonParseError: e.message,
                    stdoutJsonBytes     : Buffer.byteLength(stdout, 'utf8')
                },
                outcome: null
            };
        }
    }

    /**
     * Flattens child outcome fields into task health details without overwriting scheduler fields.
     * @param {Object} outcome Parsed child stdout JSON.
     * @returns {Object}
     */
    buildChildOutcomeDetails(outcome) {
        const details = {childOutcome: outcome};

        for (const [key, value] of Object.entries(outcome)) {
            details[key === 'reason' ? 'childReason' : key] = value;
        }

        return details;
    }

    /**
     * Classifies successful child exits whose structured outcome is actually a deferred/no-op.
     * @param {String} taskName Task key.
     * @param {Object|null} outcome Parsed child stdout JSON.
     * @returns {Object}
     */
    classifySuccessfulChildOutcome(taskName, outcome) {
        if (!outcome || (taskName !== 'memory-summary-backfill' && taskName !== 'kbSync')) {
            return {status: 'completed'};
        }

        // Generic deferred envelope: a child that exited 0 without doing work (lease-held /
        // no-op) emits `{deferred: true, reason}`. Both kbSync (lease-held → no embedding) and
        // the summary backfill use it — the false-green case that must NOT refresh lastSuccessAt.
        if (outcome.deferred === true && outcome.reason) {
            return {status: 'skipped', reasonCode: outcome.reason};
        }

        // Summary-specific: an all-deferred no-progress run (rows attempted, none updated).
        if (taskName === 'memory-summary-backfill') {
            const processed      = Number(outcome.processed || 0);
            const updated        = Number(outcome.updated || 0);
            const deferred       = Number(outcome.deferred || 0);
            const missingContent = Number(outcome.missingContent || 0);

            if (processed > 0 && updated === 0 && missingContent === 0 && deferred > 0) {
                return {status: 'skipped', reasonCode: 'all-deferred'};
            }
        }

        return {status: 'completed'};
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

        if (!state) {
            return;
        }

        const task = this.taskDefinitions[taskName];

        // Running-but-stuck recycle. A long-running child can be alive yet not serving — a stuck
        // inference grinding CPU while a residency/process check still passes. A `healthProbe()`
        // checks the RUNNING child; on a sustained-unhealthy result the child is recycled (killed,
        // then respawned by the next poll). This is distinct from `livenessProbe()`, which answers
        // "is the service up while my process flag says down" for a fire-and-exit launcher — the
        // running-process branch below never reached the down-only liveness path.
        if (state.running) {
            if (typeof task?.healthProbe === 'function') {
                this.gateRecycleOnHealthProbe(taskName, task, now, cooldownMs);
            }
            return;
        }

        if (now - (state.lastRunAt || 0) <= cooldownMs) {
            return;
        }

        if (typeof task?.livenessProbe === 'function') {
            this.gateRestartOnLivenessProbe(taskName, task, now, cooldownMs);
        } else {
            this.runTask(taskName, 'supervisor-restart');
        }
    }

    /**
     * @summary Health-gated recycle for a long-running child that can be stuck-while-running.
     *
     * Mirrors {@link gateRestartOnLivenessProbe}'s confirmed-at + in-flight de-dup (at most one
     * probe per cooldown, no overlap), but acts on the RUNNING-child surface: a healthy result is
     * silent; a sustained-unhealthy result `killTask`s the child (recycle → respawn next poll). The
     * task owns the actual "is it serving" check via `healthProbe()` (the sustained-stuck hysteresis
     * lives there); this method only schedules it and acts on the boolean.
     *
     * A THROWN probe is treated as healthy (no recycle): unlike the liveness path, the child is
     * already running, so a probe fault must never kill a working process.
     *
     * @param {String} taskName Task key.
     * @param {Object} task Task definition (carries `healthProbe`).
     * @param {Number} now Epoch ms (poll timestamp).
     * @param {Number} cooldownMs Minimum gap between probes / recycle attempts.
     * @returns {void}
     */
    gateRecycleOnHealthProbe(taskName, task, now, cooldownMs) {
        this._healthConfirmedAt   ??= {};
        this._healthProbeInFlight ??= {};

        if (now - (this._healthConfirmedAt[taskName] || 0) <= cooldownMs || this._healthProbeInFlight[taskName]) {
            return;
        }

        this._healthProbeInFlight[taskName] = true;

        task.healthProbe()
            .then(healthy => {
                if (healthy) {
                    this._healthConfirmedAt[taskName] = Date.now();
                } else {
                    this.killTask(taskName, 'supervisor-health-recycle');
                }
            })
            .catch(() => { /* probe fault on a running child: never recycle a working process */ })
            .finally(() => { this._healthProbeInFlight[taskName] = false; });
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
                    this.runLivenessReadinessHook(taskName, task, 'liveness-confirmed', () => this.runTask(taskName, 'supervisor-restart'));
                } else {
                    this.clearReadinessSuccessLogState(taskName, 'liveness');
                    this.runTask(taskName, 'supervisor-restart');
                }
            })
            .catch(() => {
                this.clearReadinessSuccessLogState(taskName, 'liveness');
                this.runTask(taskName, 'supervisor-restart');
            })
            .finally(() => { this._livenessProbeInFlight[taskName] = false; });
    }

    /**
     * @summary Enforces or observes a single live process for a port-owning task.
     *
     * Default policy is authoritative ownership: when more than one process binds the task's
     * `singletonPort`, keep the orchestrator-tracked pid and SIGKILL verified duplicates. This
     * is required for daemons like Chroma where duplicate writers corrupt a shared persist dir.
     *
     * Tasks that expose shared local infrastructure may opt into
     * `duplicateListenerPolicy: 'defer'`: matching listeners are treated as externally-owned
     * live instances and are never killed by this supervisor. The task's liveness probe then
     * decides whether a restart is needed.
     *
     * @param {String} taskName Task key.
     * @returns {Number} Count of duplicate processes reaped.
     */
    reapDuplicateListeners(taskName) {
        const task = this.taskDefinitions[taskName];
        if (!task?.singletonPort) {
            return 0;
        }

        if (task.duplicateListenerPolicy === 'defer') {
            return 0;
        }

        const listenerPids = this.listPortListeners(task.singletonPort);
        const canonicalPid = this.taskStateService.getTaskState(taskName)?.pid;
        let   reaped       = 0;

        if (task.duplicateListenerPolicy === 'defer') {
            return 0;
        }

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
