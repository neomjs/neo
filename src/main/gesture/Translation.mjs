const swipeNoise  = 2,
      swipeRestMs = 50;

/**
 * @summary Recognizes continuous pan and terminal swipe from the Main contact owner's normalized frames.
 */
export default class Translation {
    /** @member {WeakMap} #claims */
    #claims = new WeakMap()

    /**
     * @param {Document} doc Owns the animation frame clock and pending pan move.
     * @param {Function} publish Delivers a phase through the contact owner.
     * @param {Object} settings Live pan and swipe thresholds from the owning Gesture addon.
     */
    constructor(doc, publish, settings) {
        this.doc      = doc;
        this.publish  = publish;
        this.settings = settings
    }

    /**
     * @summary Routes an admitted contact sample to its translation recognizer.
     * @param {Object} frame
     */
    track(frame) {
        if (frame.claim.family === 'pan') {
            this.trackPan(frame)
        } else if (frame.claim.family === 'swipe') {
            this.trackSwipe(frame)
        }
    }

    /**
     * @summary Accumulates translation around the current centroid and rebases on contact changes.
     * @param {Object} frame
     */
    trackPan({claim, kind, contacts, changed, elapsed}) {
        let state = this.#claims.get(claim);

        if (kind === 'cancel' || !contacts.length) {
            if (!state) return;

            this.#claims.delete(claim);
            if (state.raf !== null) this.doc.defaultView?.cancelAnimationFrame(state.raf);

            if (state.started) {
                this.publishPan(claim, state, kind === 'cancel' ? 'cancel' : 'end', {
                    changed : changed.flatMap(id => state.ids.has(id) ? [state.ids.get(id)] : []),
                    contacts: [],
                    elapsed : elapsed - state.begin
                })
            }

            return
        }

        const x       = contacts.reduce((total, point) => total + point.x / contacts.length, 0),
              y       = contacts.reduce((total, point) => total + point.y / contacts.length, 0),
              members = new Set(contacts.map(point => point.id));

        if (!state) {
            state = {
                begin  : elapsed, deltaX: 0, deltaY: 0, elapsed, ids: new Map(), members,
                pending: new Set(), raf: null, sentX: 0, sentY: 0, started: false, velocityX: 0, velocityY: 0, x, y
            };
            this.#claims.set(claim, state)
        }

        const sameMembers = members.size === state.members.size && contacts.every(point => state.members.has(point.id)),
              dt          = elapsed - state.elapsed,
              dx          = sameMembers ? x - state.x : 0,
              dy          = sameMembers ? y - state.y : 0;

        Object.assign(state, {
            deltaX   : state.deltaX + dx, deltaY: state.deltaY + dy, elapsed, members,
            velocityX: dt > 0 ? dx / dt : 0, velocityY: dt > 0 ? dy / dt : 0, x, y
        });

        state.contacts = contacts.map(point => {
            if (!state.ids.has(point.id)) state.ids.set(point.id, state.ids.size);
            return {...point, id: state.ids.get(point.id)}
        });

        if (!state.started) {
            if (Math.hypot(state.deltaX, state.deltaY) >= this.settings.panDistance) {
                state.started = this.publishPan(claim, state, 'start', {
                    changed: changed.flatMap(id => state.ids.has(id) ? [state.ids.get(id)] : [])
                })
            }

            return
        }

        changed.forEach(id => {if (state.ids.has(id)) state.pending.add(state.ids.get(id))});

        if (state.raf === null) {
            state.raf = this.doc.defaultView.requestAnimationFrame(() => {
                state.raf = null;
                if (this.#claims.get(claim) !== state) return;

                const changed = [...state.pending];
                state.pending.clear();
                this.publishPan(claim, state, 'move', {changed})
            })
        }
    }

    /**
     * @summary Emits one pan phase, with steps measured from the previous published phase.
     * @param {Object} claim
     * @param {Object} state
     * @param {String} phase
     * @param {Object} change Phase-specific contact data.
     * @returns {Boolean}
     */
    publishPan(claim, state, phase, change) {
        const {begin, contacts, deltaX, deltaY, elapsed, sentX, sentY, velocityX, velocityY, x, y} = state,
              sent                                                                                 = this.publish(claim, `pan:${phase}`, {
                  contacts, deltaX, deltaY, elapsed: elapsed - begin, stepX: deltaX - sentX, stepY: deltaY - sentY,
                  velocityX: Number.isFinite(velocityX) ? velocityX : 0,
                  velocityY: Number.isFinite(velocityY) ? velocityY : 0,
                  x, y, ...change
              });

        if (sent) {
            state.sentX = deltaX;
            state.sentY = deltaY
        }

        return sent
    }

    /**
     * @summary Reports a single directional swipe at the observed one-contact lift position.
     * Recent samples must sustain motion toward the lift. Within the release window, tolerate
     * two CSS pixels of coordinate jitter and require meaningful advance within 50 ms of lift.
     * @param {Object} frame
     */
    trackSwipe({claim, kind, contacts, elapsed, lifted=[]}) {
        let state = this.#claims.get(claim);

        if (kind === 'cancel') {
            this.#claims.delete(claim);
            return
        }

        if (contacts.length) {
            if (!state) {
                state = {begin: elapsed, origin: contacts[0], samples: [], single: contacts.length === 1};
                this.#claims.set(claim, state)
            }

            state.single &&= contacts.length === 1;
            if (!state.single) return;

            state.samples = state.samples.filter(sample => elapsed - sample.elapsed <= this.settings.swipeReleaseWindow).slice(-31);
            state.samples.push({...contacts[0], elapsed});
            return
        }

        this.#claims.delete(claim);

        const point = lifted[0];

        if (!state?.single || kind !== 'end' || point?.id !== state.origin.id) return;

        const recent = state.samples.find(sample => elapsed - sample.elapsed <= this.settings.swipeReleaseWindow && elapsed > sample.elapsed);

        if (!recent) return;

        const dx         = point.x - state.origin.x, dy = point.y - state.origin.y,
              dt         = elapsed - recent.elapsed,
              velocityX  = (point.x - recent.x) / dt,
              velocityY  = (point.y - recent.y) / dt,
              horizontal = Math.abs(dx) >= Math.abs(dy),
              main       = horizontal ? dx : dy,
              cross      = horizontal ? dy : dx,
              speed      = horizontal ? velocityX : velocityY,
              sign       = Math.sign(main);

        if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY) || Math.abs(main) < this.settings.swipeDistance ||
            Math.abs(main) < this.settings.swipeDirectionRatio * Math.abs(cross) || speed * sign < this.settings.swipeVelocity) {
            return
        }

        const axis     = horizontal ? 'x' : 'y';
        let   advanced = sign * recent[axis],
              furthest   = advanced,
              lastMotion = recent.elapsed;

        for (const sample of [...state.samples, {...point, elapsed}]) {
            if (sample.elapsed < recent.elapsed) continue;

            const position = sign * sample[axis];

            if (furthest - position > swipeNoise) return;

            furthest = Math.max(furthest, position);

            if (position - advanced >= Math.max(swipeNoise, this.settings.swipeVelocity * (sample.elapsed - lastMotion))) {
                advanced   = position;
                lastMotion = sample.elapsed
            }
        }

        if (elapsed - lastMotion > swipeRestMs) return;

        const direction = horizontal ? (main > 0 ? 'right' : 'left') : (main > 0 ? 'down' : 'up');

        this.publish(claim, 'swipe', {changed: [0], contacts: [], direction, elapsed: elapsed - state.begin,
            velocityX, velocityY, x: point.x, y: point.y})
    }
}
