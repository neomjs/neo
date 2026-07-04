import {defineComponent} from '../../../../src/functional/_export.mjs';
import {stateToken}      from './StateDot.mjs';

/**
 * Canonical legend label per session-state category. Kept beside the state→token map so the fleet
 * health summary reads one vocabulary.
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
 * Pure state → label resolver. A known category → its canonical label; an unknown category →
 * the LITERAL category string (never invisible, never silently re-labelled as `off`), so a new
 * runtime state still renders a readable swatch until it earns a canonical label here. Uses an
 * `Object.hasOwn` check (not `MAP[k] ||`) so a prototype-shaped key (`toString`, `constructor`,
 * `__proto__`) resolves to its literal text instead of leaking an inherited Object.prototype value.
 * @param {String} state
 * @returns {String}
 */
export function stateLabel(state) {
    return Object.hasOwn(STATE_LABEL, state) ? STATE_LABEL[state] : String(state ?? 'unknown')
}

/**
 * A single entry in the fleet health-summary legend / bar: a swatch dot (colored from the same
 * `--fm-state-*` token as {@link StateDot} via the shared `stateToken` — one source of truth on the
 * agent-health axis), an optional count, and the category label. Composable BOTH ways: a plain
 * legend row (no count) and the count-carrying bar unit the health summary consumes (set `count`).
 * An unknown category renders off-toned with its literal text — never invisible.
 *
 * @summary Health-summary swatch — legend row + count-bar unit, agent-health axis.
 */
export default defineComponent({
    config: {
        className: 'AgentOS.view.fleet.HealthSwatch',
        ntype    : 'fm-health-swatch',
        /**
         * The session-state category this swatch legends — `ok` · `idle` · `wedged` · `limited` · `off`.
         * An unknown category renders off-toned with its literal text.
         * @member {String} state_='ok'
         */
        state_: 'ok',
        /**
         * Optional count for the bar-unit shape (the health-summary consumer). `null` renders a plain
         * legend row; a number renders a count beside the label (e.g. "3 working").
         * @member {Number|null} count_=null
         */
        count_: null,
        /**
         * Optional label override. Defaults to the canonical category label for `state`.
         * @member {String|null} label_=null
         */
        label_: null
    },

    createVdom(config) {
        const cn = [
            {cls: ['fm-sw-dot'], style: {'--fm-dot': `var(${stateToken(config.state)})`}}
        ];

        if (config.count != null) {
            cn.push({tag: 'span', cls: ['fm-sw-count'], text: String(config.count)})
        }

        cn.push({tag: 'span', cls: ['fm-sw-label'], text: config.label ?? stateLabel(config.state)});

        return {cls: ['fm-health-swatch'], cn}
    }
});
