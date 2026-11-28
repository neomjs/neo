import Base from '../../core/Base.mjs';

/**
 * @summary Recognizes terminal taps and timed presses from the Main contact owner's normalized frames.
 * @class Neo.main.gesture.TapPress
 * @extends Neo.core.Base
 */
class TapPress extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.gesture.TapPress'
         * @protected
         */
        className: 'Neo.main.gesture.TapPress',
        /** @member {Function|null} cancel=null Retires an owning claim. */
        cancel: null,
        /** @member {Document|null} doc=null Owns the native contact and timer clock. */
        doc: null,
        /** @member {Function|null} publish=null Delivers a phase through the contact owner. */
        publish: null,
        /** @member {Neo.main.addon.Gesture|null} settings=null Live tap and press policy. */
        settings: null
    }

    /** @member {WeakMap} #taps */
    #taps = new WeakMap()
    /** @member {WeakMap} #presses */
    #presses = new WeakMap()
    /** @member {WeakMap} #lastTaps */
    #lastTaps = new WeakMap()

    /** @summary Drops repeat history when the document loses ownership. */
    reset() {
        this.#lastTaps = new WeakMap()
    }

    /** @param {Object} owner */
    clearTapHistory(owner) {
        this.#lastTaps.delete(owner)
    }

    /**
     * @param {Object} claim
     * @param {String} kind
     * @param {Object[]} [lifted]
     */
    track(claim, kind, lifted=[]) {
        if (claim.family === 'tap') {
            this.trackTap(claim, kind, lifted)
        } else if (claim.family === 'press') {
            this.trackPress(claim, kind, lifted)
        }
    }

    /**
     * @summary Counts simultaneous contacts and tests each against its own start position.
     * @param {Object} claim
     * @param {String} kind
     * @param {Object[]} lifted
     */
    trackTap(claim, kind, lifted) {
        const {owner, node, sequence, frame: {contacts, elapsed, trusted, pointerType}} = claim,
              {repeatDistance, repeatInterval, tapDuration, tapTolerance}                = this.settings;
        let state = this.#taps.get(claim);

        if (kind === 'cancel') {
            this.#taps.delete(claim);
            this.#lastTaps.get(owner)?.delete(trusted);
            return
        }

        if (sequence.pressCommitted || elapsed > tapDuration) {
            this.cancel(claim);
            return
        }

        if (!state && kind === 'start') {
            state = {count: 0, origins: new Map()};
            this.#taps.set(claim, state)
        }

        if (!state) return;

        for (const point of [...contacts, ...lifted]) {
            const origin = state.origins.get(point.id);

            if (!origin) {
                state.origins.set(point.id, point)
            } else if (Math.hypot(point.x - origin.x, point.y - origin.y) > tapTolerance) {
                this.cancel(claim);
                return
            }
        }

        if (contacts.length) {
            const total = contacts.reduce((sum, point) => ({x: sum.x + point.x, y: sum.y + point.y}), {x: 0, y: 0});

            state.count = Math.max(state.count, contacts.length);
            state.focal = {x: total.x / contacts.length, y: total.y / contacts.length};
            return
        }

        this.#taps.delete(claim);

        const focal = state.count === 1 ? lifted[0] : state.focal;
        if (!focal) return;

        const {x, y}   = focal,
              time     = sequence.startedAt + elapsed,
              recent   = this.#lastTaps.get(owner) ?? new Map(),
              previous = recent.get(trusted),
              close    = previous?.node === node && previous.pointerType === pointerType && previous.contactCount === state.count &&
                  time - previous.time >= 0 && time - previous.time <= repeatInterval && Math.hypot(x - previous.x, y - previous.y) <= repeatDistance,
              count    = close ? previous.count + 1 : 1;

        recent.set(trusted, {contactCount: state.count, node, pointerType, time, count, x, y});
        this.#lastTaps.set(owner, recent);
        this.publish(claim, 'tap', {contactCount: state.count, count, x, y})
    }

    /**
     * @summary Retires the timer on loss and keeps the last reported focal point for terminals.
     * @param {Object} claim
     * @param {String} kind
     * @param {Object[]} lifted
     */
    trackPress(claim, kind, lifted) {
        const {contacts, elapsed} = claim.frame,
              win                 = this.doc.defaultView;
        let state = this.#presses.get(claim);

        if (kind === 'cancel') {
            if (state) {
                win.clearTimeout(state.timer);
                this.#presses.delete(claim);
                this.publish(claim, 'press:cancel', state.focal)
            }
            return
        }

        const point = contacts[0] ?? lifted[0];

        if (!state && kind === 'start' && contacts.length === 1) {
            const {holdMs = this.settings.pressHoldMs, moveTolerance = this.settings.pressMoveTolerance} = claim.owner.gestureOptions?.press ?? {};

            state = {origin: point, focal: {x: point.x, y: point.y}, moveTolerance};
            this.#presses.set(claim, state);
            state.timer = win.setTimeout(() => {
                if (this.isDestroyed || !claim.live || !claim.node.isConnected || this.doc.hidden) return;

                const openedAt = Math.max(claim.frame.elapsed, win.performance.now() - claim.sequence.startedAt);
                claim.sequence.elapsed = openedAt;
                claim.sequence.pressCommitted = true;
                state.started = true;
                this.publish(claim, 'press:start', {...state.focal, elapsed: openedAt})
            }, Math.max(0, Math.ceil(claim.sequence.startedAt + holdMs - win.performance.now())));
            return
        }

        if (!state) return;

        if (contacts.length > 1 || point && Math.hypot(point.x - state.origin.x, point.y - state.origin.y) > state.moveTolerance) {
            this.cancel(claim);
            return
        }

        if (kind === 'end' && !contacts.length) {
            win.clearTimeout(state.timer);
            this.#presses.delete(claim);

            if (state.started) {
                this.publish(claim, 'press:end', {...state.focal, duration: elapsed})
            }
        } else if (point) {
            state.focal = {x: point.x, y: point.y}
        }
    }
}

export default Neo.setupClass(TapPress);
