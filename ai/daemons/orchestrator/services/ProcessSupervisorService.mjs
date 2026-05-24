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

        let cleared = false;
        const clear = (code, error) => {
            if (cleared) {
                return;
            }
            cleared = true;

            try {
                if (fs.existsSync(pidFile)) {
                    fs.unlinkSync(pidFile);
                }
            } catch (e) {}
            this.clearRunningSkipLogState(taskName);

            if (error) {
                this.taskStateService.markFailed(taskName, null);
                this.writeLog?.('ERROR', `[ProcessSupervisor] ${task.label} failed to start: ${error.message}`);
                this.recordTaskOutcome(taskName, 'failed', {reason, phase: 'start', error: error.message});
            } else if (code === 0) {
                try {
                    const completedAt = new Date().toISOString();
                    onSuccess?.();
                    this.taskStateService.markCompleted(taskName);
                    this.writeLog?.('INFO', `[ProcessSupervisor] ${task.label} completed successfully.`);
                    this.recordTaskOutcome(taskName, 'completed', {reason, code, completedAt});
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

        child.on('close', code => clear(code));
        child.on('error', err => clear(null, err));

        return true;
    }
}

export default Neo.setupClass(ProcessSupervisorService);
