/**
 * @summary The six key figures of the sortable dashboard example and their simulated feed. Every series comes from a
 * seeded generator, so each load opens on the same history, and the feed extends every series once a second.
 * @module Neo.examples.dashboard.sortable.kpis
 */

import {createSeededRandom} from '../../../src/util/Random.mjs';

/**
 * The readings each tile keeps: twenty-four, one per second.
 * @type {Number}
 */
export const HISTORY = 24;

/**
 * Each key figure: its label, its resting value, how far it swings, how its reading reads, and whether a rise is
 * good news (`rising: 'good'`) or bad news (`rising: 'bad'`).
 * @type {Object[]}
 */
export const KPIS = [
    {id: 'revenue',    label: 'Revenue today',   base: 48200, swing: 1900, format: 'currency', rising: 'good'},
    {id: 'orders',     label: 'Orders',          base: 1310,  swing: 52,   format: 'count',    rising: 'good'},
    {id: 'conversion', label: 'Conversion rate', base: 3.4,   swing: 0.14, format: 'percent',  rising: 'good'},
    {id: 'basket',     label: 'Average basket',  base: 36.8,  swing: 1.2,  format: 'currency', rising: 'good'},
    {id: 'visitors',   label: 'Visitors now',    base: 2240,  swing: 160,  format: 'count',    rising: 'good'},
    {id: 'refunds',    label: 'Refund rate',     base: 1.2,   swing: 0.08, format: 'percent',  rising: 'bad'}
];

/**
 * How a reading reads, keyed by a key figure's `format`.
 * @type {Object}
 */
export const FORMATS = {
    count   : value => Math.round(value).toLocaleString('en-US'),
    currency: value => value >= 1000
        ? `$${Math.round(value).toLocaleString('en-US')}`
        : `$${value.toFixed(2)}`,
    percent : value => `${value.toFixed(2)} %`
};

/**
 * @summary A key figure's feed: a slow wave plus seeded noise around its resting value. `next()` answers the next
 * reading; a new feed for the same figure starts over with the same readings.
 * @param {Object} kpi   One of {@link KPIS}
 * @param {Number} index The figure's position, which seeds and phases it
 * @returns {{next: Function}}
 */
export function createFeed(kpi, index) {
    const random = createSeededRandom(index + 1), phase = index * 1.7;
    let   tick   = 0;

    return {
        next() {
            const wave = Math.sin(tick++ / 5 + phase);

            return Math.max(0, kpi.base + kpi.swing * (0.6 * wave + 0.4 * (random() * 2 - 1)))
        }
    }
}
