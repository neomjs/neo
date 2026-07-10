import Base from '../core/Base.mjs';

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
 * - **Fail-safe, never wedged.** Every `enter` (re)arms a fail-safe timer; if producers lose a
 *   `leave` (an interrupted transition, a thrown handler), the timer force-clears the signal and
 *   the counter. Animation errors must never wedge layout — a stale signal would stall every
 *   consumer waiting on settle.
 * - **Destroy-safe.** A destroyed component is a no-op in both directions, and the fail-safe
 *   re-checks destruction before touching the instance (mid-transition teardown is a landed
 *   defect class — the DOM-corpse family).
 * - **Presentation-only.** Nothing here reads or writes dock documents; the signal is pure
 *   projection-tier state, per the JSON-first guardrail.
 *
 * Timer functions are injectable for deterministic unit specs (the DockRevealStateMachine
 * precedent); production callers never pass them.
 *
 * @class Neo.dashboard.DockMotionSignal
 * @extends Neo.core.Base
 */
class DockMotionSignal extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockMotionSignal'
         * @protected
         */
        className: 'Neo.dashboard.DockMotionSignal'
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
     * In-flight motion bookkeeping: componentId → {count, timer}.
     * @member {Map} activeMotions
     * @protected
     * @static
     */
    static activeMotions = new Map()

    /**
     * Registers one motion start on a workspace component. Adds the signal class on the 0→1
     * transition and (re)arms the fail-safe.
     * @param {Neo.component.Base} component The dock workspace (or any motion-hosting) component.
     * @param {Function} [setTimeoutFn=globalThis.setTimeout] Injectable for unit determinism.
     * @param {Function} [clearTimeoutFn=globalThis.clearTimeout]
     * @static
     */
    static enter(component, setTimeoutFn = globalThis.setTimeout.bind(globalThis), clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)) {
        if (!component || component.isDestroyed) return;

        let entry = this.activeMotions.get(component.id);

        if (!entry) {
            entry = {count: 0, timer: null};
            this.activeMotions.set(component.id, entry);
            component.addCls(this.SIGNAL_CLS)
        }

        entry.count++;

        // every new motion pushes the wedge horizon out — the backstop covers the LAST starter
        entry.timer && clearTimeoutFn(entry.timer);
        entry.timer = setTimeoutFn(() => {
            this.activeMotions.delete(component.id);
            component.isDestroyed || component.removeCls(this.SIGNAL_CLS)
        }, this.FAIL_SAFE_MS)
    }

    /**
     * Whether a component currently carries an in-flight motion signal. Read-only helper for
     * producers that gate work on settle.
     * @param {String} componentId
     * @returns {Boolean}
     * @static
     */
    static isAnimating(componentId) {
        return this.activeMotions.has(componentId)
    }

    /**
     * Registers one motion settle. Removes the signal class on the 1→0 transition. Unbalanced
     * calls (a leave without an enter, a leave after the fail-safe already cleared) are safe
     * no-ops — producers in teardown paths must be able to call this unconditionally.
     * @param {Neo.component.Base} component
     * @param {Function} [clearTimeoutFn=globalThis.clearTimeout]
     * @static
     */
    static leave(component, clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)) {
        if (!component) return;

        const entry = this.activeMotions.get(component.id);

        if (!entry) return;

        entry.count--;

        if (entry.count <= 0) {
            entry.timer && clearTimeoutFn(entry.timer);
            this.activeMotions.delete(component.id);
            component.isDestroyed || component.removeCls(this.SIGNAL_CLS)
        }
    }
}

export default Neo.setupClass(DockMotionSignal);
