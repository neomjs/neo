import Base from '../../../src/core/Base.mjs';

/**
 * @summary Heuristics Engine for DevIndex Anomaly Detection.
 *
 * This service analyzes the contribution patterns of a user to derive "Cyborg Metrics":
 * Velocity, Acceleration, and Consistency. These metrics help distinguish between:
 * - **High-Performing Humans:** High consistency, moderate velocity.
 * - **AI-Augmented ("Cyborg") Devs:** High acceleration (recent spike), high velocity.
 * - **Automated Scripts/Bots:** Super-human velocity, extreme acceleration (if new), or extreme consistency (if cron).
 *
 * The `analyze` method returns a minified object (`h`) suitable for storage in `users.jsonl`.
 *
 * @class DevIndex.services.Heuristics
 * @extends Neo.core.Base
 * @singleton
 */
class Heuristics extends Base {
    static config = {
        /**
         * @member {String} className='DevIndex.services.Heuristics'
         * @protected
         */
        className: 'DevIndex.services.Heuristics',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Analyzes a user record to calculate heuristic metrics.
     * 
     * @param {Object} user The minified user object (must contain `y` array of yearly contributions).
     * @returns {Object|null} The heuristics object `{v, a, c}` or null if analysis is impossible.
     */
    analyze(user) {
        if (!user || !user.y || user.y.length === 0) return null;

        const years = user.y;
        const maxYear = Math.max(...years);
        
        // 1. Velocity (v): Max commits per day in their peak year
        const velocity = Math.round(maxYear / 365);

        // 2. Consistency (c): Number of active years (>100 contributions)
        // Filters out "Hello World" years or dormant periods.
        const activeYears = years.filter(y => y > 100);
        const consistency = activeYears.length;

        // 3. Acceleration (a): Growth Rate (Peak vs Baseline)
        // We use the median of active years as the "Baseline".
        // This is robust against outliers (like the peak year itself).
        let acceleration = 0;
        
        if (consistency > 1) {
            // Sort active years to find median
            activeYears.sort((a, b) => a - b);
            const mid = Math.floor(consistency / 2);
            const median = consistency % 2 !== 0 ? activeYears[mid] : (activeYears[mid - 1] + activeYears[mid]) / 2;
            
            // Avoid division by zero (though filter > 100 prevents it)
            if (median > 0) {
                acceleration = parseFloat((maxYear / median).toFixed(2));
            } else {
                acceleration = 1; // Baseline
            }
        } else {
            // If only 1 active year, acceleration is 1 (or undefined/0 depending on semantics)
            // Let's say 1.0 to indicate "Initial Velocity"
            acceleration = 1; 
        }

        // Minified Output
        return {
            v: velocity,
            a: acceleration,
            c: consistency
        };
    }
}

export default Neo.setupClass(Heuristics);
