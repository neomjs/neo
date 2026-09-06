import Base from '../../../core/Base.mjs';

/**
 * @summary Owns one Rail's transient reveal state, policy and dwell/dismiss timers.
 *
 * Methods and policy defaults support Neo.overwrites and subclassing. Each Rail creates and destroys
 * its own instance; registration does not persist interaction state. The only output is `onChange`,
 * which the Rail maps to overlay updates. Pinning remains an executor-routed operation outside this
 * machine. Timer functions remain injectable for deterministic tests.
 *
 * ## States
 *
 * | State | Meaning |
 * |---|---|
 * | `idle` | No reveal. The rail renders tabs only. |
 * | `dwell-pending` | Hover intent detected (opt-in mode); reveal fires when the dwell timer elapses. |
 * | `revealed` | Overlay open WITHOUT focus (hover-born reveal — hover never steals focus). |
 * | `revealed-focused` | Overlay open and holding focus. A focused reveal never auto-dismisses. |
 * | `dismiss-pending` | Pointer left an unfocused overlay; dismissal fires when the grace timer elapses. |
 *
 * ## Transitions
 *
 * | From | Input | To | Notes |
 * |---|---|---|---|
 * | `idle` | `tabClick(item)` | `revealed-focused` | Click-reveal is the DEFAULT interaction; focus moves into the pane. |
 * | `idle` | `tabHoverIn(item)` | `dwell-pending` | Only when `revealOnHover` (workspace opt-in — hover reveals are an a11y hazard by default). |
 * | `dwell-pending` | dwell elapsed | `revealed` | Hover reveal never steals focus. |
 * | `dwell-pending` | `tabHoverOut()` | `idle` | Pass-through hovers never flicker an overlay. |
 * | `revealed` | `tabHoverOut()` | `dismiss-pending` | Hover-born reveal whose pointer leaves the TAB without ever entering the overlay dismisses through the same grace window. |
 * | `dwell-pending` | `tabClick(item)` | `revealed-focused` | Click overrides the dwell wait. |
 * | `revealed*` | `tabClick(same item)` | `idle` | Re-clicking the tab dismisses. |
 * | `revealed*` | `tabClick(other item)` | `revealed-focused(other)` | Retarget: the reveal follows intent. |
 * | `revealed` / `dismiss-pending` | `tabHoverIn(other item)` | `dwell-pending(other)` | Hover retarget re-dwells; the current reveal survives until the new one commits. |
 * | `revealed` | `overlayPointerLeave()` | `dismiss-pending` | Grace timer starts — pointer wobble must not kill the overlay. |
 * | `dismiss-pending` | `overlayPointerEnter()` | `revealed` | Grace return. |
 * | `dismiss-pending` | grace elapsed | `idle` | Dismissed; no operation is emitted. |
 * | `revealed` / `dismiss-pending` | `overlayFocusEnter()` | `revealed-focused` | Focus rescues and holds. |
 * | `revealed-focused` | `overlayPointerLeave()` | `revealed-focused` | FOCUS-HOLD: a focused reveal never auto-dismisses. |
 * | `revealed-focused` | `overlayFocusLeave()` | `idle` | Focus leaving the overlay dismisses. |
 * | `revealed*` / `dismiss-pending` | `escape()` / `outsideClick()` | `idle` | Explicit dismissal. `outsideClick()` arrives from the rail's outside-pointer listener on the app main view (a `mousedown` outside the rail's subtree, iframes included — the stylesheet withdraws their pointer events while a reveal is open) and from the maximize path. |
 * | any | `itemCleared(item)` | `idle` | Fail-closed sync: the item left auto-hidden state (pin, restore, transfer, policy) — a reveal of it cannot survive. |
 *
 * Dismissal in every form discards runtime state only; no operation descriptor exists for it.
 *
 * ## Design constants
 *
 * Dwell + grace are interaction timings owned here; reveal/dismiss slide durations are animation
 * timings and live in CSS, not in this machine.
 * @class Neo.dashboard.dock.interaction.RevealStateMachine
 * @extends Neo.core.Base
 */
class RevealStateMachine extends Base {
    /**
     * Hover intent dwell before a reveal fires (opt-in hover mode only).
     * @member {Number} DWELL_MS=150
     * @static
     */
    static DWELL_MS = 150
    /**
     * Grace period after the pointer leaves an unfocused overlay before it dismisses.
     * @member {Number} DISMISS_GRACE_MS=300
     * @static
     */
    static DISMISS_GRACE_MS = 300

    static config = {
        /** @member {String} className='Neo.dashboard.dock.interaction.RevealStateMachine' @protected */
        className: 'Neo.dashboard.dock.interaction.RevealStateMachine',
        /** @member {Function} clearTimeoutFn Cancels a timer owned by this instance. */
        clearTimeoutFn: id => globalThis.clearTimeout(id),
        /** @member {Number} dwellMs=150 Hover dwell before revealing without focus. */
        dwellMs: RevealStateMachine.DWELL_MS,
        /** @member {Number} graceMs=300 Pointer-leave grace before dismissal. */
        graceMs: RevealStateMachine.DISMISS_GRACE_MS,
        /** @member {Function|null} onChange=null Receives next and previous reveal snapshots. */
        onChange: null,
        /** @member {Boolean} revealOnHover=false Hover reveal is explicitly opt-in. */
        revealOnHover: false,
        /** @member {Function} setTimeoutFn Schedules this instance's dwell/grace callback. */
        setTimeoutFn: (fn, ms) => globalThis.setTimeout(fn, ms)
    }

    /** @member {String|null} pendingItemId=null @protected */
    pendingItemId = null
    /** @member {String|null} revealedItemId=null */
    revealedItemId = null
    /** @member {String} state='idle' */
    state = 'idle'
    /** @member {Number|Object|null} timerId=null @protected */
    timerId = null

    /**
     * @summary Applies effective policy while retaining the established optional-config defaults.
     * @param {Object} config
     * @param {Function} [config.clearTimeoutFn=globalThis.clearTimeout] Injectable for fake-timer specs.
     * @param {Number} [config.dwellMs=RevealStateMachine.DWELL_MS]
     * @param {Number} [config.graceMs=RevealStateMachine.DISMISS_GRACE_MS]
     * @param {Function|null} [config.onChange=null] Receives `(next, previous)` snapshots `{revealedItemId, state}`.
     * @param {Boolean} [config.revealOnHover=false] Workspace-level opt-in; hover inputs are ignored without it.
     * @param {Function} [config.setTimeoutFn=globalThis.setTimeout] Injectable for fake-timer specs.
     */
    construct(config={}) {
        config = {...config};

        for (const key of ['dwellMs', 'graceMs']) {
            if (!Number.isFinite(config[key])) delete config[key]
        }

        if (!config.clearTimeoutFn) delete config.clearTimeoutFn;
        if (!config.setTimeoutFn) delete config.setTimeoutFn;
        if (Object.hasOwn(config, 'onChange') && typeof config.onChange !== 'function') config.onChange = null;
        if (Object.hasOwn(config, 'revealOnHover')) config.revealOnHover = config.revealOnHover === true;

        super.construct(config)
    }

    /**
     * Clears any pending dwell/grace timer. Idempotent.
     * @protected
     */
    clearTimer() {
        if (this.timerId !== null) {
            this.clearTimeoutFn(this.timerId);
            this.timerId = null
        }
    }

    /**
     * @summary Clears owned timers and the change listener before Base teardown.
     * @param {...*} args
     */
    destroy(...args) {
        this.clearTimer();
        this.onChange = null;
        super.destroy(...args)
    }

    /**
     * `Escape` inside a revealed overlay dismisses it — runtime state only, no operation.
     */
    escape() {
        if (this.state !== 'idle') {
            this.transition('idle', null)
        }
    }

    /**
     * Fail-closed sync input: the item left committed auto-hidden state (pin escape, restore,
     * transfer, policy flip). Any reveal of it — pending or open — cannot survive.
     * @param {String} itemId
     */
    itemCleared(itemId) {
        if (this.revealedItemId === itemId || this.pendingItemId === itemId) {
            this.transition('idle', null)
        }
    }

    /**
     * A click outside the overlay and rail dismisses the reveal.
     */
    outsideClick() {
        this.escape()
    }

    /**
     * Focus entered the overlay: engage focus-hold — a focused reveal never auto-dismisses.
     */
    overlayFocusEnter() {
        if (this.state === 'revealed' || this.state === 'dismiss-pending') {
            this.transition('revealed-focused', this.revealedItemId)
        }
    }

    /**
     * Focus left the overlay: the reveal dismisses (the pointer-grace path only serves
     * unfocused reveals).
     */
    overlayFocusLeave() {
        if (this.state === 'revealed-focused') {
            this.transition('idle', null)
        }
    }

    /**
     * Pointer returned to the overlay during the dismiss grace window.
     */
    overlayPointerEnter() {
        if (this.state === 'dismiss-pending') {
            this.transition('revealed', this.revealedItemId)
        }
    }

    /**
     * Pointer left the overlay. Unfocused reveals enter the grace window; focused reveals
     * hold (focus-hold rule).
     */
    overlayPointerLeave() {
        let me = this;

        if (me.state === 'revealed') {
            me.transition('dismiss-pending', me.revealedItemId);

            me.timerId = me.setTimeoutFn(() => {
                me.timerId = null;

                if (me.state === 'dismiss-pending') {
                    me.transition('idle', null)
                }
            }, me.graceMs)
        }
    }

    /**
     * Tab click — the DEFAULT reveal interaction. Toggles: clicking the revealed item's tab
     * dismisses; clicking another tab retargets. Click-born reveals hold focus immediately.
     * @param {String} itemId
     */
    tabClick(itemId) {
        let me = this;

        if (me.revealedItemId === itemId && me.state !== 'dwell-pending') {
            me.transition('idle', null);
            return
        }

        me.transition('revealed-focused', itemId)
    }

    /**
     * Hover entered a rail tab. Ignored unless the workspace opted in via `revealOnHover`.
     * Starts (or retargets) the dwell window; hover-born reveals never steal focus.
     * @param {String} itemId
     */
    tabHoverIn(itemId) {
        let me = this;

        if (!me.revealOnHover || me.state === 'revealed-focused' || me.revealedItemId === itemId && me.state === 'revealed') {
            return
        }

        me.clearTimer();
        me.pendingItemId = itemId;

        if (me.state !== 'dwell-pending') {
            me.transition('dwell-pending', me.revealedItemId, itemId)
        }

        me.timerId = me.setTimeoutFn(() => {
            me.timerId = null;

            if (me.state === 'dwell-pending' && me.pendingItemId === itemId) {
                me.transition('revealed', itemId)
            }
        }, me.dwellMs)
    }

    /**
     * Hover left the rail tab. Before the dwell elapsed, a pass-through must never flicker an
     * overlay open; after a hover-born reveal opened, leaving the tab WITHOUT entering the
     * overlay starts the same dismiss grace the overlay's own pointer-leave uses (a pointer
     * that reaches the overlay cancels it via `overlayPointerEnter()`).
     */
    tabHoverOut() {
        let me = this;

        if (me.state === 'dwell-pending') {
            me.transition(me.revealedItemId ? 'revealed' : 'idle', me.revealedItemId)
        } else if (me.state === 'revealed') {
            me.overlayPointerLeave()
        }
    }

    /**
     * Central transition executor: clears timers, applies the snapshot, notifies `onChange`
     * exactly once per effective change.
     * @param {String} state
     * @param {String|null} revealedItemId
     * @param {String|null} [pendingItemId=null]
     * @protected
     */
    transition(state, revealedItemId, pendingItemId=null) {
        let me       = this,
            previous = {revealedItemId: me.revealedItemId, state: me.state};

        me.clearTimer();

        me.pendingItemId  = pendingItemId;
        me.revealedItemId = revealedItemId;
        me.state          = state;

        if ((previous.state !== state || previous.revealedItemId !== revealedItemId) && me.onChange) {
            me.onChange({revealedItemId, state}, previous)
        }
    }
}

export default Neo.setupClass(RevealStateMachine);
