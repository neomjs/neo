import {defineComponent} from '../../../../src/functional/_export.mjs';

/**
 * Maps a session-state key to its design token (see `apps/agentos/resources/tokens.css`).
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
 * in `fleet-components.css`. The color — not the motion — carries the signal, so the
 * primitive degrades cleanly for reduced-motion users. Composed by every fleet surface.
 *
 * @summary Session-state dot primitive — token-driven, reduced-motion-honored.
 */
export default defineComponent({
    config: {
        className: 'AgentOS.view.fleet.StateDot',
        ntype    : 'fm-state-dot',
        /**
         * The session state — one of `ok` · `idle` · `wedged` · `limited` · `off`.
         * Encodes SESSION state, never identity. Unknown values render as `off`.
         * @member {String} state_='off'
         */
        state_: 'off',
        /**
         * When true, adds the `fm-live` class that carries the pulse animation. The pulse is
         * decoration and is gated behind `prefers-reduced-motion: no-preference` at the CSS layer.
         * @member {Boolean} live_=false
         */
        live_: false
    },

    createVdom(config) {
        return {
            cls  : ['fm-state-dot', config.live && 'fm-live'].filter(Boolean),
            style: {'--fm-dot': `var(${stateToken(config.state)})`}
        }
    }
});
