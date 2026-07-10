import Component    from '../../../../src/component/Base.mjs';
import NeoArray     from '../../../../src/util/Array.mjs';
import {stateClass} from './StateDot.mjs';

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
 * `--fm-state-*` token as {@link StateDot} via the shared `stateClass` — one source of truth on the
 * agent-health axis, bound in the component SCSS), an optional count, and the category label.
 * Composable BOTH ways: a plain legend row (no count) and the count-carrying bar unit the health
 * summary consumes (set `count`). An unknown category renders off-toned with its literal text —
 * never invisible.
 *
 * @class AgentOS.view.fleet.HealthSwatch
 * @extends Neo.component.Base
 */
class HealthSwatch extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.HealthSwatch'
         * @protected
         */
        className: 'AgentOS.view.fleet.HealthSwatch',
        /**
         * @member {String} ntype='fm-health-swatch'
         * @protected
         */
        ntype: 'fm-health-swatch',
        /**
         * @member {String[]} baseCls=['fm-health-swatch']
         */
        baseCls: ['fm-health-swatch'],
        /**
         * The session-state category this swatch legends — `ok` · `idle` · `wedged` · `limited` · `off`.
         * An unknown category renders off-toned with its literal text.
         * @member {String} state_='ok'
         * @reactive
         */
        state_: 'ok',
        /**
         * Optional count for the bar-unit shape (the health-summary consumer). `null` renders a plain
         * legend row; a number renders a count beside the label (e.g. "3 working"). A zero still renders.
         * @member {Number|null} count_=null
         * @reactive
         */
        count_: null,
        /**
         * Optional label override. Defaults to the canonical category label for `state`.
         * @member {String|null} label_=null
         * @reactive
         */
        label_: null,
        /**
         * The dot (colored via the shared state token), an optional count (bar-unit shape), and the
         * category label. The count node is `removeDom`-toggled so a plain legend row omits it.
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['fm-sw-dot']},
            {tag: 'span', cls: ['fm-sw-count'], removeDom: true},
            {tag: 'span', cls: ['fm-sw-label']}
        ]}
    }

    /**
     * Triggered after the state config changed — swaps the root state class (shared `stateClass`
     * vocabulary with StateDot on the agent-health axis; the class binds the dot's `--fm-dot` token
     * in the component SCSS — zero inline styles) and refreshes the label (when no override is set).
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {
        let me  = this,
            cls = me.cls;

        oldValue !== undefined && NeoArray.remove(cls, stateClass(oldValue));
        NeoArray.add(cls, stateClass(value));
        me.cls = cls;

        me.applyLabel();
        me.update()
    }

    /**
     * Triggered after the count config changed — a number renders the count node (a zero still
     * renders, to confirm "none"); `null` removes it so the swatch is a plain legend row.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetCount(value, oldValue) {
        let countNode = this.vdom.cn[1];

        if (value == null) {
            countNode.removeDom = true
        } else {
            countNode.removeDom = false;
            countNode.text      = String(value)
        }

        this.update()
    }

    /**
     * Triggered after the label override changed — refreshes the label text.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabel(value, oldValue) {
        this.applyLabel();
        this.update()
    }

    /**
     * The label is the override, else the canonical category label (unknown → its literal text).
     * @protected
     */
    applyLabel() {
        this.vdom.cn[2].text = this.label ?? stateLabel(this.state)
    }
}

export default Neo.setupClass(HealthSwatch);
