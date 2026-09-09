import Base from '../../../core/Base.mjs';

/**
 * @summary Owns one Rail's reveal intent; Base owns its asynchronous wait and teardown.
 *
 * Click reveals with focus. Opt-in hover dwells before revealing without focus; leaving an
 * unfocused reveal starts dismiss grace. Focus holds, pointer return rescues, and explicit
 * dismissal clears the intent. Retargeting cancels the prior wait, retaining the visible pane
 * until the new dwell completes. Each effective change publishes one next/previous snapshot.
 *
 * States: idle, dwell-pending, revealed, revealed-focused, dismiss-pending.
 * Policy configs and methods support inheritance and Neo.overwrites. Transient state stays
 * instance-local. Animation timing belongs to CSS; document operations remain outside this owner.
 * @class Neo.dashboard.dock.interaction.RevealStateMachine
 * @extends Neo.core.Base
 */
class RevealStateMachine extends Base {
    /** @member {Number} DWELL_MS=150 @static */
    static DWELL_MS = 150
    /** @member {Number} DISMISS_GRACE_MS=300 @static */
    static DISMISS_GRACE_MS = 300

    static config = {
        /** @member {String} className='Neo.dashboard.dock.interaction.RevealStateMachine' @protected */
        className: 'Neo.dashboard.dock.interaction.RevealStateMachine',
        /** @member {Number} dwellMs_=150 Hover dwell for subsequent transitions. @reactive */
        dwellMs_: RevealStateMachine.DWELL_MS,
        /** @member {Number} graceMs_=300 Dismiss grace for subsequent transitions. @reactive */
        graceMs_: RevealStateMachine.DISMISS_GRACE_MS,
        /** @member {Function|null} onChange_=null Receives coherent next/previous snapshots. @reactive */
        onChange_: null,
        /** @member {Boolean} revealOnHover_=false Hover inputs require explicit opt-in. @reactive */
        revealOnHover_: false
    }

    /** @member {String|null} pendingItemId=null @protected */
    pendingItemId = null
    /** @member {String|null} revealedItemId=null */
    revealedItemId = null
    /** @member {String} state='idle' */
    state = 'idle'
    /** @member {AbortController|null} transitionController=null Current intent and wait cancellation. @protected */
    transitionController = null

    /**
     * @summary Releases the notification target through the engine's destruction hook.
     * Base itself cancels the owned wait; no timer cleanup belongs here.
     * @param {Boolean} value
     * @protected
     */
    afterSetIsDestroying(value) {
        if (value) this.onChange = null
    }

    /**
     * @summary Applies the same duration fallback to construction, overwrites and live changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetDwellMs(value, oldValue) {
        const fallback = this.constructor.config.dwellMs;
        return Number.isFinite(value) ? value : oldValue ??
            (Number.isFinite(fallback) ? fallback : RevealStateMachine.DWELL_MS)
    }

    /**
     * @summary Retains the last valid grace, or the effective class default on construction.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     * @protected
     */
    beforeSetGraceMs(value, oldValue) {
        const fallback = this.constructor.config.graceMs;
        return Number.isFinite(value) ? value : oldValue ??
            (Number.isFinite(fallback) ? fallback : RevealStateMachine.DISMISS_GRACE_MS)
    }

    /**
     * @summary Invalid optional callbacks leave the owner without a notification target.
     * @param {Function|null} value
     * @returns {Function|null}
     * @protected
     */
    beforeSetOnChange(value) {
        return Neo.isFunction(value) ? value : null
    }

    /**
     * @summary Hover reveal requires the Boolean opt-in on every config path.
     * @param {Boolean} value
     * @returns {Boolean}
     * @protected
     */
    beforeSetRevealOnHover(value) {
        return value === true
    }

    /** @summary Escape dismisses runtime reveal intent without a document operation. */
    escape() {
        if (this.state !== 'idle') this.transition('idle', null)
    }

    /**
     * @summary Clears a revealed or pending item which left auto-hidden state.
     * @param {String} itemId
     */
    itemCleared(itemId) {
        if (this.revealedItemId === itemId || this.pendingItemId === itemId) {
            this.transition('idle', null)
        }
    }

    /**
     * @summary A cancelled, superseded or destroyed intent cannot publish its continuation.
     * @param {AbortController} controller
     * @returns {Boolean}
     * @protected
     */
    isCurrentTransition(controller) {
        return !this.isDestroying && !this.isDestroyed &&
            this.transitionController === controller && !controller.signal.aborted
    }

    /** @summary A click outside the overlay and rail dismisses the reveal. */
    outsideClick() {
        this.escape()
    }

    /** @summary Focus rescues an unfocused reveal and holds it open. */
    overlayFocusEnter() {
        if (this.state === 'revealed' || this.state === 'dismiss-pending') {
            this.transition('revealed-focused', this.revealedItemId)
        }
    }

    /** @summary Leaving a focus-held reveal dismisses it immediately. */
    overlayFocusLeave() {
        if (this.state === 'revealed-focused') this.transition('idle', null)
    }

    /** @summary Returning during dismiss grace keeps the reveal open. */
    overlayPointerEnter() {
        if (this.state === 'dismiss-pending') this.transition('revealed', this.revealedItemId)
    }

    /** @summary Pointer leave starts grace only for an unfocused reveal. */
    overlayPointerLeave() {
        if (this.state === 'revealed') this.transition('dismiss-pending', this.revealedItemId)
    }

    /**
     * @summary Click toggles the same item, or retargets with focus.
     * @param {String} itemId
     */
    tabClick(itemId) {
        if (this.revealedItemId === itemId && this.state !== 'dwell-pending') {
            this.transition('idle', null)
        } else {
            this.transition('revealed-focused', itemId)
        }
    }

    /**
     * @summary Hover starts or restarts dwell while preserving any current unfocused reveal.
     * @param {String} itemId
     */
    tabHoverIn(itemId) {
        const me = this;
        if (!me.revealOnHover || me.state === 'revealed-focused' ||
            me.revealedItemId === itemId && me.state === 'revealed') return;

        me.transition('dwell-pending', me.revealedItemId, itemId)
    }

    /** @summary Pass-through cancels dwell; leaving a hover-born reveal starts dismiss grace. */
    tabHoverOut() {
        const me = this;
        if (me.state === 'dwell-pending') {
            me.transition(me.revealedItemId ? 'revealed' : 'idle', me.revealedItemId)
        } else if (me.state === 'revealed') {
            me.overlayPointerLeave()
        }
    }

    /**
     * @summary Replaces intent, publishes one coherent snapshot, then schedules its domain terminal.
     * The local controller survives reentrant notification only as a stale identity: it cannot
     * schedule after a listener destroys the owner or starts another transition, even to the same state.
     * @param {String} state
     * @param {String|null} revealedItemId
     * @param {String|null} [pendingItemId=null]
     * @protected
     */
    transition(state, revealedItemId, pendingItemId=null) {
        const me = this;
        if (me.isDestroying || me.isDestroyed) return;

        const previous = {revealedItemId: me.revealedItemId, state: me.state};
        me.transitionController?.abort();
        const controller = me.transitionController = new AbortController();

        me.set({pendingItemId, revealedItemId, state});

        if (previous.state !== state || previous.revealedItemId !== revealedItemId) {
            me.onChange?.({revealedItemId, state}, previous)
        }

        if (state === 'dwell-pending') {
            me.transitionAfter(me.dwellMs, 'revealed', pendingItemId, controller)
        } else if (state === 'dismiss-pending') {
            me.transitionAfter(me.graceMs, 'idle', null, controller)
        }
    }

    /**
     * @summary Completes one Base-owned wait if the same intent still owns the continuation.
     * Cancellation cannot retract a fulfillment already queued in the microtask queue, so identity
     * is checked on both sides of the await. Unexpected errors retain their normal failure channel.
     * @param {Number} delay
     * @param {String} state
     * @param {String|null} itemId
     * @param {AbortController} controller
     * @returns {Promise<void>}
     * @protected
     */
    async transitionAfter(delay, state, itemId, controller) {
        const me = this;
        if (!me.isCurrentTransition(controller)) return;

        try {
            await me.timeout(delay, {signal: controller.signal})
        } catch (error) {
            if (error !== Neo.isDestroyed && !(controller.signal.aborted && error === controller.signal.reason)) throw error;
            return
        }

        if (me.isCurrentTransition(controller)) me.transition(state, itemId)
    }
}

export default Neo.setupClass(RevealStateMachine);
