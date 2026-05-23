import Base from '../../../src/core/Base.mjs';

/**
 * @class Neo.ai.daemons.services.CadenceEngine
 * @extends Neo.core.Base
 * @summary A pure functional service that manages polling intervals and timing triggers for maintenance tasks.
 *
 * Note: per Epic #11831 / Sub 1 (#11833), this class is NO LONGER a `singleton`.
 * It accepts external configuration from a parent (Orchestrator) — per @tobiu:
 * "if a class needs external configs, it should not be a singleton in the first place."
 * Orchestrator now constructs a per-instance CadenceEngine via reactive config +
 * `ClassSystemUtil.beforeSetInstance` (Service-DI Class A).
 */
export class CadenceEngine extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.CadenceEngine'
         * @protected
         */
        className: 'Neo.ai.daemons.services.CadenceEngine'
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
    shouldRunIntervalTask({now, lastRunAt, intervalMs}) {
        return intervalMs > 0 && now - lastRunAt >= intervalMs;
    }

    /**
     * @summary Evaluates a due-check and executes the task if due, with failure isolation.
     * @param {String} taskName Task key.
     * @param {Function} dueCheckFn Function returning a trigger object or boolean.
     * @param {Function} executeFn Function to run the task if triggered.
     * @param {Object} context Context for logging and health reporting.
     * @returns {void}
     */
    runIfDue(taskName, dueCheckFn, executeFn, context) {
        try {
            const trigger = dueCheckFn();
            if (trigger) {
                const reason    = typeof trigger === 'object' ? trigger.reason : `periodic-sync`;
                const onSuccess = typeof trigger === 'object' ? trigger.onSuccess : undefined;
                executeFn(taskName, reason, onSuccess);
            }
        } catch (e) {
            context.writeLog?.('ERROR', `[Orchestrator] ${taskName} scheduling failed: ${e.message}`);
            context.healthService?.recordTaskOutcome(taskName, 'failed', {phase: 'schedule', error: e.message});
        }
    }
}

export default Neo.setupClass(CadenceEngine);
