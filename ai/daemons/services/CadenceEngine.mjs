import Neo from '../../../src/Neo.mjs';
import Base from '../../../src/core/Base.mjs';

/**
 * @class Neo.ai.daemons.services.CadenceEngine
 * @extends Neo.core.Base
 * @singleton
 */
class CadenceEngine extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.CadenceEngine'
         * @protected
         */
        className: 'Neo.ai.daemons.services.CadenceEngine',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Parses daemon interval env vars while preserving `0` as disabled.
     *
     * @param {String|undefined} value Environment value.
     * @param {Number} fallback Fallback interval in milliseconds.
     * @returns {Number}
     */
    parseInterval(value, fallback) {
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
    shouldRunIntervalTask({now, lastRunAt, intervalMs}) {
        return intervalMs > 0 && now - lastRunAt >= intervalMs;
    }

    /**
     * @summary Builds a trigger object for interval-based tasks.
     * 
     * Pure trigger-builder shape (returns trigger object, does not execute).
     *
     * @param {Object} options
     * @param {String} options.taskName The name of the task.
     * @param {Number} options.now Current timestamp in milliseconds.
     * @param {Number} options.lastRunAt Last start timestamp in milliseconds.
     * @param {Number} options.intervalMs Interval in milliseconds.
     * @param {String} options.reasonPrefix Prefix for the trigger reason (e.g., 'periodic-sync').
     * @returns {Object|null} Trigger object if due, null otherwise.
     */
    getIntervalTrigger({taskName, now, lastRunAt, intervalMs, reasonPrefix}) {
        if (this.shouldRunIntervalTask({now, lastRunAt, intervalMs})) {
            return {
                taskName,
                source: 'periodic-sweep',
                reason: `${reasonPrefix}:${intervalMs}`
            };
        }
        return null;
    }
}

export default Neo.setupClass(CadenceEngine);
