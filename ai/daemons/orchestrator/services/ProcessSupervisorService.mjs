import Base                           from '../../../../src/core/Base.mjs';
import fs                             from 'fs-extra';
import path                           from 'path';
import {execSync}                     from 'child_process';
import {buildSupervisedTaskDiagnosis} from './taskOutcomeDiagnosis.mjs';

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

/**
 * The leading segments a child log line may carry BEFORE its severity: an optional ISO timestamp
 * (bare or bracketed), then an optional `[PID:n]`, then the level itself. Deliberately anchored and
 * deliberately narrow — see {@link ProcessSupervisorService#getChildLogLevel} for why a
 * search-anywhere match would be worse than the bug it fixes.
 * @type {RegExp}
 */
const CHILD_LOG_PREFIX = /^(?:\[?\d{4}-\d{2}-\d{2}T[\d:.]+Z\]?\s*)?(?<pid>\[PID:\d+\]\s*)?\[(?<level>LOG|INFO|WARN|ERROR)\]\s*/;

/**
 * Default V8 old-space ceiling, in MiB, for a supervised child.
 *
 * Fallback only, used when no resolved value is injected (e.g. a direct unit construction). The
 * deployment value resolves through the `orchestrator.supervisedTaskHeapMb` leaf and is injected.
 * @type {Number}
 */
const FALLBACK_SUPERVISED_TASK_HEAP_MB = 384;

/**
 * @summary Builds a supervised child's environment with an explicit heap ceiling.
 *
 * **Why a child needs its own ceiling rather than inheriting.** A container memory limit is a budget
 * for the whole process tree, but a V8 heap ceiling is per process. Children are spawned with
 * `{...process.env}`, so anything the parent carries is multiplied by the number of concurrent Node
 * processes — and a ceiling set once at the service level reads as "the container's budget" while
 * actually being "the budget, per child, again".
 *
 * The inverse is just as bad and is why this cannot be solved by sizing the container alone: with no
 * explicit ceiling, Node derives its default old-space from the cgroup, so **raising the container
 * limit silently raises every unbounded child's implicit ceiling too**. Explicit-per-process is the
 * only arrangement where the container limit and the ceilings can be reasoned about together.
 *
 * Precedence, narrowest wins: caller `env` > task `env` > the INJECTED resolved ceiling > inherited
 * parent env. A task
 * that genuinely needs a larger heap says so in its own definition, where the reason can be read next
 * to the task it belongs to.
 *
 * @param {Object} options
 * @param {Object} [options.baseEnv] Parent environment to inherit from.
 * @param {Object} [options.taskEnv] Task-definition environment.
 * @param {Object} [options.callerEnv] Call-site environment.
 * @param {Number} [options.defaultHeapMb] Child ceiling in MiB.
 * @returns {Object} The child environment.
 */
export function buildSupervisedTaskEnv({
    baseEnv       = process.env,
    taskEnv       = null,
    callerEnv     = null,
    defaultHeapMb = FALLBACK_SUPERVISED_TASK_HEAP_MB
} = {}) {
    const merged = {...baseEnv, ...(taskEnv || {}), ...(callerEnv || {})};

    // Only supply the ceiling when neither the task nor the caller stated one. A task that declares
    // its own NODE_OPTIONS has made a deliberate choice, and overriding it here would make the task
    // definition a lie.
    if (!taskEnv?.NODE_OPTIONS && !callerEnv?.NODE_OPTIONS) {
        merged.NODE_OPTIONS = `--max-old-space-size=${defaultHeapMb}`
    }

    return merged
}

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
         * Resolved V8 old-space ceiling, in MiB, applied to each supervised child.
         *
         * INJECTED by the Orchestrator from `AiConfig.orchestrator.supervisedTaskHeapMb`. This
         * service never reads the env var — ADR-0019 assigns that resolution to the leaf, and the // ticket-ref-ok: names the decision that forbids reading env here
         * Orchestrator construction seam is the narrow bootstrap boundary its sanctioned patterns
         * allow. An earlier revision read it here with `Number(env) || 384`, which is the A1
         * antipattern and additionally accepted `-1`.
         * @member {Number} supervisedTaskHeapMb_=0
         */
        supervisedTaskHeapMb_: 0,
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
     * @summary Adopts or clears an existing child-task PID file during daemon boot.
     *
     * This is process adoption only: `process.kill(pid, 0)` plus `expectedCommand`
     * proves the persisted PID still belongs to the intended executable, not that
     * the service behind that process is usable. Long-running tasks that can be
     * process-alive but service-dead must expose `healthProbe()`; the poll loop
     * then recycles the adopted/running task through {@link gateRecycleOnHealthProbe}.
     *
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
     * `RecoveryActuatorService.recordDiagnosis()` without restarting the task.
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

        if (typeof actuator?.recordDiagnosis !== 'function') {
            return false;
        }

        // Consume the shared supervised-task diagnosis producer (single source of the failed/overdue
        // diagnosis contract) instead of building the event inline. A failed maintenance task routes as
        // `ambiguous` (escalate-only), not `crash` — the supervisor saw the failure, not its cause.
        const observedAt = Date.now(),
              diagnosis  = buildSupervisedTaskDiagnosis({
                  taskName,
                  outcome      : 'failed',
                  observedAt,
                  evidenceFacts: [{type: 'task-failure', taskName, status, details: details || {}, observedAt}],
                  details      : {reasonCode: 'maintenance-task-failure', taskName, taskStatus: status, outcomeDetails: details || {}}
              });

        Promise.resolve(actuator.recordDiagnosis(diagnosis, {
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
     * @summary Whether any process currently holds a LISTEN socket on the given singleton port.
     * @param {Number} port
     * @returns {Boolean}
     */
    isSingletonPortHeld(port) {
        return this.listPortListeners(port).length > 0
    }

    /**
     * @summary Allows only the first defer-port-held restart-skip log per held-period.
     * @param {String} taskName Task key.
     * @returns {Boolean}
     */
    shouldLogDeferPortHeldSkip(taskName) {
        this.deferPortHeldLogKeys ??= new Set();

        if (this.deferPortHeldLogKeys.has(taskName)) {
            return false;
        }

        this.deferPortHeldLogKeys.add(taskName);

        return true
    }

    /**
     * @summary Resets the defer-port-held skip-log guard once the port frees or is adopted.
     * @param {String} taskName Task key.
     * @returns {void}
     */
    clearDeferPortHeldLogState(taskName) {
        this.deferPortHeldLogKeys?.delete(taskName)
    }

    /**
     * Maps child-process stderr log prefixes to daemon log severities.
     *
     * The level is NOT line-leading in practice, and assuming it was is what broke this. Every
     * child stamps a timestamp first, and some add a PID — three real shapes captured from one live
     * boot:
     *
     *     2026-07-31T19:23:40.798Z [INFO] [SessionService] …
     *     [2026-07-31T19:23:40.836Z] [INFO] [RecorderService] …
     *     [2026-07-31T19:23:41.335Z] [PID:27004] [INFO] [Orchestrator] …
     *
     * An anchor at `^\[(LOG|INFO)\]` matches none of them, so the entire benign startup sequence
     * fell through to the ERROR fail-safe and rendered identically to the one genuine failure in
     * the window.
     *
     * The prefix it tolerates is BOUNDED on purpose — an optional timestamp, an optional PID, then
     * the level. Searching for a level token anywhere in the line would fix this case and open a
     * worse one: a real failure whose payload quotes `[INFO]` would silently downgrade, trading a
     * lost signal for a hidden error.
     * @param {String} line Child stderr line.
     * @returns {String}
     */
    getChildLogLevel(line) {
        const level = CHILD_LOG_PREFIX.exec(line)?.groups?.level;

        if (level === 'LOG' || level === 'INFO') {
            return 'INFO';
        }

        return level === 'WARN' ? 'WARN' : 'ERROR';
    }

    /**
     * Re-logs child stderr lines at the child's own severity (via {@link getChildLogLevel}), trimmed: the
     * child's leading `[LEVEL]` is stripped — the outer logger already stamps that level, so it is not
     * duplicated — and the `<task> stderr:` framing is dropped, so each line logs once as
     * `[ProcessSupervisor] [<childSource>] <message>`. A line with no recognized `[LEVEL]` prefix passes
     * through unstripped at the ERROR fail-safe (an unprefixed child failure is never silently downgraded).
     * @param {Buffer|String} data Stderr chunk.
     * @returns {void}
     */
    writeChildStderr(data) {
        const lines = data.toString().split(/\r?\n/).map(line => line.trim()).filter(Boolean);

        for (const line of lines) {
            const match = CHILD_LOG_PREFIX.exec(line);

            // Timestamp and level are dropped — the outer logger stamps both. The PID is kept: it
            // names WHICH child produced the line, which the outer logger cannot know.
            const message = match
                ? `${match.groups.pid ? `${match.groups.pid.trim()} ` : ''}${line.slice(match[0].length)}`
                : line;

            this.writeLog?.(this.getChildLogLevel(line), `[ProcessSupervisor] ${message}`);
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
            const env = buildSupervisedTaskEnv({
                baseEnv      : process.env,
                callerEnv    : options.env,
                defaultHeapMb: this.supervisedTaskHeapMb || FALLBACK_SUPERVISED_TASK_HEAP_MB,
                taskEnv      : task.env
            });
            child = this.spawnFn(task.command, task.args, {stdio: stdoutCapture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'], env});

            child.stderr?.on('data', data => {
                this.writeChildStderr(data);
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
        if (!outcome) {
            return {status: 'completed'};
        }

        // Generic deferred envelope: any structured-outcome child that exited 0 without doing
        // work emits `{deferred: true, reason}`. The task-specific payload stays observable, but
        // the false-green attempt must NOT refresh lastSuccessAt.
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

        // Running-but-stuck recycle. A long-running child can be alive yet not serving — Chroma can
        // leave a process/PID that passes adoption while its HTTP API is dead; an inference runner can
        // grind CPU while residency/process checks still pass. A `healthProbe()` checks the RUNNING
        // child; on an unhealthy result the child is recycled (killed, then respawned by the next
        // poll). This is distinct from `livenessProbe()`, which answers "is the service up while my
        // process flag says down" for a fire-and-exit launcher — the running-process branch below
        // never reaches the down-only liveness path.
        if (state.running) {
            if (typeof task?.healthProbe === 'function') {
                const startupGraceMs = Number(task.healthStartupGraceMs);

                if (
                    state.lastRunAt > 0
                    && Number.isFinite(startupGraceMs)
                    && startupGraceMs > 0
                    && now - state.lastRunAt < startupGraceMs
                ) {
                    return;
                }

                this.gateRecycleOnHealthProbe(taskName, task, now, cooldownMs);
            }
            return;
        }

        if (now - (state.lastRunAt || 0) <= cooldownMs) {
            return;
        }

        // A `defer` singleton-port task must never (re)spawn into an already-held port. A matching
        // holder would have been adopted by reconcileSingletonPort (running=true, handled above); if
        // the port is still held here it is a foreign / non-adoptable instance — leave it untouched
        // (never kill, never spawn-into) and wait for it to free. This gates the restart on PORT
        // OCCUPANCY, not just tracked-running, which the restart path alone would check.
        if (task?.duplicateListenerPolicy === 'defer' && task?.singletonPort && this.isSingletonPortHeld(task.singletonPort)) {
            if (this.shouldLogDeferPortHeldSkip(taskName)) {
                this.writeLog?.('WARN', `[ProcessSupervisor] ${task.label} port ${task.singletonPort} held by an external instance; deferring restart (no spawn-into, no kill).`);
                this.recordTaskOutcome(taskName, 'deferred-port-held', {port: task.singletonPort, deferredAt: new Date().toISOString()});
            }
            return;
        }

        this.clearDeferPortHeldLogState(taskName);

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
     * silent; an unhealthy result `killTask`s the child (recycle → respawn next poll). The task owns
     * the actual "is it serving" check via `healthProbe()` and may implement its own hysteresis;
     * this method only schedules the probe and acts on the boolean. A task-level startup grace is
     * enforced by `superviseTask` before this method is reached.
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
                    return this.runLivenessReadinessHook(taskName, task, 'liveness-confirmed', () => this.runTask(taskName, 'supervisor-restart'));
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
     * @summary Reconciles a port-owning task's tracked state against the live listener(s) on its `singletonPort`.
     *
     * Default policy is authoritative ownership: when more than one process binds the task's
     * `singletonPort`, keep the orchestrator-tracked pid and SIGKILL verified duplicates. This
     * is required for daemons like Chroma where duplicate writers corrupt a shared persist dir.
     *
     * Tasks that expose shared local infrastructure opt into `duplicateListenerPolicy: 'defer'`:
     * a matching listener is an externally-owned live instance that is never killed. For those this
     * delegates to {@link adoptExistingSingletonListener} — it ADOPTS the live holder into tracked
     * state so the supervisor resumes it instead of re-spawning into the held port (the EADDRINUSE
     * this closes). The task's liveness probe then governs recycle.
     *
     * @param {String} taskName Task key.
     * @returns {Number} Count of duplicate processes reaped (always 0 for `defer`).
     */
    reconcileSingletonPort(taskName) {
        const task = this.taskDefinitions[taskName];
        if (!task?.singletonPort) {
            return 0;
        }

        if (task.duplicateListenerPolicy === 'defer') {
            this.adoptExistingSingletonListener(taskName);
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
     * @summary Adopts an externally-owned live listener on a `defer`-policy task's `singletonPort`.
     *
     * `defer` tasks (shared local infra — the Neural Link Bridge, the dev-server) treat a matching
     * port listener as an externally-owned live instance. When tracked state shows the task as NOT
     * running but a process whose command matches `expectedCommand` already holds the port, this
     * adopts it (running flag + pid + pidfile + exit watch) so the supervisor resumes it rather than
     * re-spawning into the held port — the `EADDRINUSE` failure mode. It NEVER kills (defer never
     * reaps); a foreign command on the port is left untouched (no adopt, no kill, no spawn-into).
     *
     * @param {String} taskName Task key.
     * @returns {Boolean} True when a live holder was adopted.
     */
    adoptExistingSingletonListener(taskName) {
        const task  = this.taskDefinitions[taskName];
        const state = this.taskStateService.getTaskState(taskName);

        // Already tracked-running (or no state to mutate) → nothing to reconcile.
        if (!state || state.running) {
            return false;
        }

        for (const pid of this.listPortListeners(task.singletonPort)) {
            if (!Number.isInteger(pid)) {
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

            this.taskStateService.adoptRunning(taskName, pid);
            this.watchRecoveredTask(taskName, pid);

            try {
                fs.writeFileSync(this.getTaskPidFile(taskName), pid.toString(), 'utf8');
            } catch (e) {
                this.writeLog?.('ERROR', `[ProcessSupervisor] Failed to write adopted ${task.label} PID: ${e.message}`);
            }

            this.writeLog?.('INFO', `[ProcessSupervisor] Adopting externally-owned ${task.label} (PID: ${pid}) on port ${task.singletonPort}; not re-spawning.`);
            this.recordTaskOutcome(taskName, 'adopted', {pid, port: task.singletonPort, adoptedAt: new Date().toISOString()});

            return true;
        }

        return false;
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
