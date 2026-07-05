import Component from '../../../../src/component/Base.mjs';
import NeoArray  from '../../../../src/util/Array.mjs';

/**
 * Maps a session-state key to its design token (the `--fm-state-*` values live in the theme skin,
 * `resources/scss/theme-neo-{dark,light}/apps/agentos/`).
 * State encodes what a resident is *doing now* — working / idle / wedged / limited / off —
 * and is NEVER identity — session state is what a resident does, not who it is. Unknown keys
 * fall back to `off`. Colors live only in the token layer — zero hand-rolled values here.
 * @type {Object}
 */
const STATE_TOKEN = {
    ok     : '--fm-state-ok',
    idle   : '--fm-state-idle',
    wedged : '--fm-state-wedged',
    limited: '--fm-state-limited',
    off    : '--fm-state-off'
};

/**
 * Pure state → token mapping, exported so it is the single source of truth for the fleet
 * primitives (HealthSwatch reuses it) and is directly unit-testable without a render. Uses an
 * `Object.hasOwn` check (not `MAP[k] ||`) so a prototype-shaped key (`toString`, `constructor`,
 * `__proto__`) degrades to the neutral `off` token instead of leaking an inherited value.
 * @param {String} state
 * @returns {String} the `--fm-state-*` custom-property name
 */
export function stateToken(state) {
    return Object.hasOwn(STATE_TOKEN, state) ? STATE_TOKEN[state] : STATE_TOKEN.off
}

/**
 * The atomic session-state indicator: a colored dot whose color is driven entirely by the
 * `--fm-state-*` token layer, with an optional live-pulse gated behind `prefers-reduced-motion`
 * in the component SCSS (`resources/scss/src/apps/agentos/fleet/StateDot.scss`). The color — not the
 * motion — carries the signal, so the primitive
 * degrades cleanly for reduced-motion users. Composed by every fleet surface.
 *
 * @class AgentOS.view.fleet.StateDot
 * @extends Neo.component.Base
 */
class StateDot extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.StateDot'
         * @protected
         */
        className: 'AgentOS.view.fleet.StateDot',
        /**
         * @member {String} ntype='fm-state-dot'
         * @protected
         */
        ntype: 'fm-state-dot',
        /**
         * @member {String[]} baseCls=['fm-state-dot']
         */
        baseCls: ['fm-state-dot'],
        /**
         * The session state — one of `ok` · `idle` · `wedged` · `limited` · `off`. Encodes SESSION
         * state, never identity. Unknown values render as `off`.
         * @member {String} state_='off'
         * @reactive
         */
        state_: 'off',
        /**
         * When true, adds the `fm-live` class that carries the pulse animation. The pulse is
         * decoration, gated behind `prefers-reduced-motion: no-preference` at the CSS layer.
         * @member {Boolean} live_=false
         * @reactive
         */
        live_: false
    }

    /**
     * Triggered after the state config changed — rebinds the `--fm-dot` color token from the
     * closed-set resolver. State is session-state, never identity.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {
        let style = this.style || {};
        style['--fm-dot'] = `var(${stateToken(value)})`;
        this.style = style
    }

    /**
     * Triggered after the live config changed — toggles the reduced-motion-gated pulse class.
     * The color already carries the signal, so the class is decoration only.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetLive(value, oldValue) {
        let cls = this.cls;
        NeoArray[value ? 'add' : 'remove'](cls, 'fm-live');
        this.cls = cls
    }
}

export default Neo.setupClass(StateDot);
