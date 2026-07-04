import {defineComponent} from '../../../../src/functional/_export.mjs';
import {stateToken}      from './StateDot.mjs';

/**
 * Canonical legend label per session-state category. Kept beside the state→token map so the
 * fleet health summary reads one vocabulary. Unknown keys fall back to the `off` label.
 * @type {Object}
 */
const STATE_LABEL = {
    ok     : 'working',
    idle   : 'idle',
    wedged : 'wedged',
    limited: 'rate-limited',
    off    : 'benched / offline'
};

/**
 * Pure state → label mapping, exported for reuse and direct unit-testing.
 * @param {String} state
 * @returns {String}
 */
export function stateLabel(state) {
    return STATE_LABEL[state] || STATE_LABEL.off
}

/**
 * A single entry in the fleet health-summary legend: a swatch dot (colored from the same
 * `--fm-state-*` token as {@link StateDot} — one source of truth via the shared `stateToken`)
 * plus its category label. Composed into the health summary bar above the fleet grid.
 *
 * @summary Health-summary legend swatch primitive.
 */
export default defineComponent({
    config: {
        className: 'AgentOS.view.fleet.HealthSwatch',
        ntype    : 'fm-health-swatch',
        /**
         * The session-state category this swatch legends — `ok` · `idle` · `wedged` · `limited` · `off`.
         * @member {String} state_='ok'
         */
        state_: 'ok',
        /**
         * Optional label override. Defaults to the canonical category label for `state`.
         * @member {String|null} label_=null
         */
        label_: null
    },

    createVdom(config) {
        return {
            cls: ['fm-health-swatch'],
            cn : [
                {cls: ['fm-sw-dot'], style: {'--fm-dot': `var(${stateToken(config.state)})`}},
                {tag: 'span', cls: ['fm-sw-label'], text: config.label ?? stateLabel(config.state)}
            ]
        }
    }
});
