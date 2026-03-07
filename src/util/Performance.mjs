import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Performance
 * @extends Neo.core.Base
 * @singleton
 */
class Performance extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Performance'
         * @protected
         */
        className: 'Neo.util.Performance',
        /**
         * Provide a 'key': ['methodName1', 'methodName2'] map to allow
         * other workers to execute those methods.
         * @member {Object|null} remote={main: ['getAverage', 'getMetrics', 'getSma']}
         * @protected
         */
        remote: {
            main: ['getAverage', 'getMetrics', 'getSma']
        },
        /**
         * How many samples to keep for the moving average calculation
         * @member {Number} sampleSize=10
         */
        sampleSize: 10,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Map<String, {start: Number, samples: Number[]}>
     * @member {Map} #data=new Map()
     * @private
     */
    #data = new Map()

    /**
     * Calculates the Simple Moving Average (SMA).
     * @param {String} key 
     * @returns {Number} average duration in ms, or 0 if no samples exist
     */
    getAverage(key) {
        let entry = this.#data.get(key);

        if (!entry || entry.samples.length === 0) {
            return 0;
        }
        
        let sum = 0,
            len = entry.samples.length,
            i   = 0;

        for (; i < len; i++) {
            sum += entry.samples[i];
        }

        return sum / len;
    }

    /**
     * Returns a JSON serializable copy of all tracked performance metrics.
     * @returns {Object}
     */
    getMetrics() {
        let result = {};

        for (const [key, value] of this.#data.entries()) {
            result[key] = {
                samples: [...value.samples],
                start  : value.start
            }
        }

        return result;
    }

    /**
     * Calculates the Simple Moving Average (SMA).
     * Alias for getAverage.
     * @param {String} key 
     * @returns {Number}
     */
    getSma(key) {
        return this.getAverage(key);
    }

    /**
     * Completes a performance measurement and stores the duration.
     * @param {String} key 
     */
    markEnd(key) {
        let me    = this,
            entry = me.#data.get(key),
            duration;

        if (entry && entry.start > 0) {
            duration = performance.now() - entry.start;
            entry.samples.push(duration);
            
            if (entry.samples.length > me.sampleSize) {
                entry.samples.shift();
            }

            entry.start = 0;
        }
    }

    /**
     * Starts a performance measurement for a given key.
     * @param {String} key e.g., 'vdom.update:neo-grid-body-1'
     */
    markStart(key) {
        let entry = this.#data.get(key);

        if (!entry) {
            entry = { start: 0, samples: [] };
            this.#data.set(key, entry);
        }

        entry.start = performance.now();
    }

    /**
     * Removes the tracking data for a specific key.
     * @param {String} key 
     */
    remove(key) {
        this.#data.delete(key);
    }
}

export default Neo.setupClass(Performance);
