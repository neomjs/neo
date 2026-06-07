import Base from '../../../../src/core/Base.mjs';

/**
 * @class Neo.ai.daemons.services.CadenceEngine
 * @extends Neo.core.Base
 * @summary A pure functional service that manages polling intervals and timing triggers for maintenance tasks.
 *
 * The engine is intentionally non-singleton. Orchestrator scheduling now routes
 * through registry descriptors; this helper remains the narrow interval predicate
 * used by direct consumers and unit tests.
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

}

export default Neo.setupClass(CadenceEngine);
