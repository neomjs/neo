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
    // transitional states — a lifecycle intent is in flight (`pendingAction`), so the resident is
    // neither cleanly `off` nor confirmed `ok`; the dot must not assert a resolved state mid-request.
    starting: '--fm-state-starting',
    stopping: '--fm-state-stopping',
    off     : '--fm-state-off'
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
 * Pure state → CSS-class mapping — the token name minus its `--` custom-property prefix (e.g.
 * `fm-state-ok`). The class binds `--fm-dot` in the component SCSS, so color stays entirely in the
 * token/skin layer: components swap a class, never write a style. Shares `stateToken`'s closed-set
 * degrade (unknown → `fm-state-off`).
 * @param {String} state
 * @returns {String} the state class name (e.g. `fm-state-ok`)
 */
export function stateClass(state) {
    return stateToken(state).slice(2)
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
         * The session state — one of `ok` · `idle` · `wedged` · `limited` · `starting` · `stopping` ·
         * `off`. `starting` / `stopping` are the transitional states while a lifecycle intent is in
         * flight. Encodes SESSION state, never identity. Unknown values render as `off`.
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
     * Triggered after the state config changed — swaps the state class from the closed-set
     * resolver; the class binds the `--fm-dot` color token in the component SCSS (zero inline
     * styles — color lives only in the token/skin layer). State is session-state, never identity.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetState(value, oldValue) {
        let cls = this.cls;

        oldValue !== undefined && NeoArray.remove(cls, stateClass(oldValue));
        NeoArray.add(cls, stateClass(value));

        this.cls = cls
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
