/**
 * @summary The six metrics of the sparkline example and their simulated feed. Every series comes from a seeded
 * generator, so a restart shows the same thirty readings every time, and the feed continues each series one
 * reading at a time.
 * @module Neo.examples.component.sparkline.metrics
 */

/**
 * The readings each sparkline shows: thirty, one per second.
 * @type {Number}
 */
export const WINDOW = 30;

/**
 * Each metric: its label, its resting value, how far it swings, and how its reading reads.
 * @type {Object[]}
 */
export const METRICS = [
    {id: 'requests', label: 'Requests',    base: 1280, swing: 140,  format: value => `${Math.round(value).toLocaleString('en-US')} req/s`},
    {id: 'latency',  label: 'p95 latency', base: 182,  swing: 26,   format: value => `${Math.round(value)} ms`},
    {id: 'errors',   label: 'Error rate',  base: 0.42, swing: 0.14, format: value => `${value.toFixed(2)} %`},
    {id: 'cpu',      label: 'CPU',         base: 61,   swing: 11,   format: value => `${Math.round(value)} %`},
    {id: 'memory',   label: 'Memory',      base: 3.4,  swing: 0.35, format: value => `${value.toFixed(2)} GB`},
    {id: 'queue',    label: 'Queue depth', base: 38,   swing: 14,   format: value => `${Math.round(value)} jobs`}
];

/**
 * @summary A small seeded generator (mulberry32): the same seed yields the same numbers.
 * @param {Number} seed
 * @returns {Function} Answers a number in [0, 1)
 */
function createRandom(seed) {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;

        let value = Math.imul(state ^ (state >>> 15), 1 | state);

        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296
    }
}

/**
 * @summary A metric's feed: a slow wave plus seeded noise around the resting value. `next()` answers the next
 * reading; a new feed for the same metric starts over with the same readings.
 * @param {Object} metric One of {@link METRICS}
 * @param {Number} index  The metric's position, which seeds and phases it
 * @returns {{next: Function}}
 */
export function createFeed(metric, index) {
    const random = createRandom(index + 1), phase = index * 1.3;
    let   tick   = 0;

    return {
        next() {
            const wave = Math.sin(tick++ / 4 + phase);

            return Math.max(0, metric.base + metric.swing * (0.6 * wave + 0.4 * (random() * 2 - 1)))
        }
    }
}
