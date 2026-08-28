import Base from '../../../core/Base.mjs';

/**
 * @summary The dock motion-observability signal: `neo-dashboard-dock-animating` lifecycle owner.
 *
 * One half of the motion contract (the other half is the `--dock-transition-*` token set in the
 * dashboard theme layer): while ANY dock motion is in flight on a workspace component, the
 * component carries the `neo-dashboard-dock-animating` class; when the last motion settles, the
 * class leaves. Assertion surfaces (`observe_motion` e2e specs, tour-runner step gating) key off
 * exactly this signal, and every motion producer — the choreography transitions AND the FLIP
 * commit layer — routes through it rather than toggling classes ad hoc, so there is ONE lifecycle
 * to observe no matter how many mechanisms animate.
 *
 * Semantics (binding):
 *
 * - **Counted, not boolean.** Concurrent motions nest: the class appears on the 0→1 transition
 *   and leaves on the 1→0 transition only — a tab morph finishing must not strip the signal
 *   while a splitter ease is still playing.
 * - **Ownership binds to the INSTANCE, never the id.** Bookkeeping is keyed by component
 *   reference: a replacement component reusing a destroyed predecessor's id can never have its
 *   entry decremented, deleted, or fail-safe-cleared by the STALE instance's leftovers, and a
 *   runtime id change neither strands nor duplicates an entry. Id-based reads (`isAnimating`)
 *   resolve against live instances at query time.
 * - **Fail-safe, never wedged.** Every `enter` (re)arms a fail-safe timer; if producers lose a
 *   `leave` (an interrupted transition, a thrown handler), the timer force-clears the signal and
 *   the counter — and it can only clear ITS OWN instance's entry, by construction. Animation
 *   errors must never wedge layout — a stale signal would stall every consumer waiting on
 *   settle.
 * - **Destroy-safe.** A destroyed OR destroying component is a no-op in both directions, and
 *   the fail-safe re-checks destruction before touching the instance (mid-transition teardown
 *   is a landed defect class — the DOM-corpse family).
 * - **Presentation-only.** Nothing here reads or writes dock documents; the signal is pure
 *   projection-tier state, per the JSON-first guardrail.
 *
 * Timer functions are injectable for deterministic unit specs (the RevealStateMachine
 * precedent); production callers never pass them.
 *
 * @class Neo.dashboard.dock.projection.MotionSignal
 * @extends Neo.core.Base
 */
class MotionSignal extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.projection.MotionSignal'
         * @protected
         */
        className: 'Neo.dashboard.dock.projection.MotionSignal'
    }

    /**
     * Fail-safe horizon: the longest a signal may outlive its producers. Sized to the token
     * default (260ms) plus a generous settle grace — NOT a tuning knob for motion itself (the
     * CSS tokens own durations); only the wedge backstop.
     * @member {Number} FAIL_SAFE_MS=2000
     * @static
     */
    static FAIL_SAFE_MS = 2000
    /**
     * The observable motion-lifecycle class. Consumers assert against THIS name; producers never
     * hand-roll it.
     * @member {String} SIGNAL_CLS='neo-dashboard-dock-animating'
     * @static
     */
    static SIGNAL_CLS = 'neo-dashboard-dock-animating'
    /**
     * In-flight motion bookkeeping, keyed by component INSTANCE (never id — see the ownership
     * contract in the class summary): component → {count, timer}.
     * @member {Map} activeMotions
     * @protected
     * @static
     */
    static activeMotions = new Map()

    /**
     * Whether the component may be touched at all — destroyed and destroying instances are
     * outside the signal's writable world in every path, including the fail-safe.
     * @param {Neo.component.Base} component
     * @returns {Boolean}
     * @protected
     * @static
     */
    static isLive(component) {
        return !!component && !component.isDestroyed && !component.isDestroying
    }

    /**
     * Registers one motion start on a workspace component. Adds the signal class on the 0→1
     * transition and (re)arms the fail-safe.
     * @param {Neo.component.Base} component The dock workspace (or any motion-hosting) component.
     * @param {Function} [setTimeoutFn=globalThis.setTimeout] Injectable for unit determinism.
     * @param {Function} [clearTimeoutFn=globalThis.clearTimeout]
     * @static
     */
    static enter(component, setTimeoutFn = globalThis.setTimeout.bind(globalThis), clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)) {
        if (!this.isLive(component)) return;

        let entry = this.activeMotions.get(component);

        if (!entry) {
            entry = {count: 0, timer: null};
            this.activeMotions.set(component, entry);
            component.addCls(this.SIGNAL_CLS)
        }

        entry.count++;

        // every new motion pushes the wedge horizon out — the backstop covers the LAST starter,
        // and the closure holds the INSTANCE: it can only ever clear its own entry
        entry.timer && clearTimeoutFn(entry.timer);
        entry.timer = setTimeoutFn(() => {
            this.activeMotions.delete(component);
            this.isLive(component) && component.removeCls(this.SIGNAL_CLS)
        }, this.FAIL_SAFE_MS)
    }

    /**
     * Whether a component currently carries an in-flight motion signal, resolved by CURRENT id
     * against live instances at query time (an id reused by a replacement instance reads the
     * replacement's state, never a stale predecessor's).
     * @param {String} componentId
     * @returns {Boolean}
     * @static
     */
    static isAnimating(componentId) {
        for (const component of this.activeMotions.keys()) {
            if (this.isLive(component) && component.id === componentId) return true
        }

        return false
    }

    /**
     * Registers one motion settle. Removes the signal class on the 1→0 transition. Unbalanced or
     * STALE calls (a leave without an enter, a leave after the fail-safe cleared, a destroyed
     * predecessor leaving after its id was reused) are safe no-ops — producers in teardown paths
     * must be able to call this unconditionally, and only the entry-owning instance can
     * decrement its own bookkeeping.
     * @param {Neo.component.Base} component
     * @param {Function} [clearTimeoutFn=globalThis.clearTimeout]
     * @static
     */
    static leave(component, clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)) {
        const entry = component && this.activeMotions.get(component);

        if (!entry) return;

        entry.count--;

        if (entry.count <= 0) {
            entry.timer && clearTimeoutFn(entry.timer);
            this.activeMotions.delete(component);
            this.isLive(component) && component.removeCls(this.SIGNAL_CLS)
        }
    }
}

export default Neo.setupClass(MotionSignal);
