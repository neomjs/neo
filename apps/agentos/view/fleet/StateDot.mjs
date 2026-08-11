import Component from '../../../../src/component/Base.mjs';
import NeoArray  from '../../../../src/util/Array.mjs';

/**
 * Maps a session-state key to its design token (the `--fm-state-*` values live in the theme skin,
 * `resources/scss/theme-neo-{dark,light}/apps/agentos/`).
 * State encodes what a resident is *doing now* — working / idle / wedged / limited / off, plus the
 * transitional `starting` / `stopping` while a lifecycle intent is in flight —
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
    // participation-active with NO session observation: the slate signal-pending token, visually
    // distinct from off's dead grey — no liveness claimed, no benched verdict claimed.
    unobserved: '--fm-state-unobserved',
    // a seat Fleet does not manage: supervision vocabulary does not apply, so the dot carries the
    // calm neutral token — un-managed is the NORMAL topology on FM-as-client deployments, never an
    // attention state (the operator-ratified default-state contract).
    external: '--fm-state-external',
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
 * Human-readable label per session state. Lives here beside {@link stateToken} / {@link stateClass}
 * so the three closed-set resolvers stay one source of truth for the fleet primitives — and so the
 * dot can name itself without importing from a consumer (`HealthSwatch` imports `stateClass` from
 * this module, so sourcing the label there would close an import cycle).
 * @type {Object}
 */
const STATE_LABEL = {
    ok      : 'working',
    idle    : 'idle',
    wedged  : 'wedged',
    limited : 'rate-limited',
    starting: 'starting',
    stopping: 'stopping',
    unobserved: 'unobserved',
    // neutral operator copy, not a supervision verdict: the seat runs in its own harness and Fleet
    // simply does not manage it — "offline" would be a fact about FLEET presented as a fact about
    // the agent (the falsified copy this label replaces).
    external: 'external harness',
    off     : 'benched / offline'
};

/**
 * Pure state → human-readable label. An unrecognized state renders its LITERAL category string
 * (never invisible, never silently re-labelled as `off`), so a new runtime state still reads until it
 * earns a canonical label here. Uses an `Object.hasOwn` check (not `MAP[k] ||`) so a prototype-shaped
 * key (`toString`, `constructor`, `__proto__`) resolves to its literal text instead of leaking an
 * inherited `Object.prototype` value.
 * @param {String} state
 * @returns {String}
 */
export function stateLabel(state) {
    return Object.hasOwn(STATE_LABEL, state) ? STATE_LABEL[state] : String(state ?? 'unknown')
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

        // a11y: the dot is a graphical indicator carrying information, so it needs an accessible NAME —
        // unlabelled it reaches assistive tech as decoration. Set before the `cls` assignment below,
        // which flushes the vdom. This satisfies 4.1.2 / 1.1.1 and NOT 1.4.1: a name does nothing for a
        // sighted operator who cannot separate the hues, which needs a visible non-colour channel.
        Object.assign(this.vdom, {role: 'img', 'aria-label': stateLabel(value)});

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
        this.toggleCls('fm-live', value)
    }
}

export default Neo.setupClass(StateDot);
