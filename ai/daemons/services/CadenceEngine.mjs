import Neo  from '../../../src/Neo.mjs';
import Base from '../../../src/core/Base.mjs';

/**
 * @class Neo.ai.daemons.services.CadenceEngine
 * @extends Neo.core.Base
 * @singleton
 * @summary A pure functional service that manages polling intervals and timing triggers for maintenance tasks.
 */
export class CadenceEngine extends Base {
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
}

export default Neo.setupClass(CadenceEngine);
