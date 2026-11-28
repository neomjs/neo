import Base from '../../core/Base.mjs';

/**
 * @summary Recognizes pinch and rotation from the Main contact owner's normalized frames.
 * Scale and rotation follow the claim's two earliest-admitted contacts, while the focal point `x`/`y`
 * averages every contact. When the pair breaks, a surviving contact can seed a fresh pair, with a new
 * gesture id and contact labels, while keeping its original contact-down time.
 * @class Neo.main.gesture.Transform
 * @extends Neo.core.Base
 */
class Transform extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.gesture.Transform'
         * @protected
         */
        className: 'Neo.main.gesture.Transform',
        /** @member {Document|null} doc=null Owns the animation frame clock. */
        doc: null,
        /** @member {Function|null} publish=null Delivers a phase through the contact owner. */
        publish: null
    }

    /** @member {WeakMap} #claims */
    #claims = new WeakMap()

    /**
     * @summary Tracks one transform on its admitted claim: a `start`, `move` phases coalesced per frame,
     * and one terminal when fewer than two contacts remain or the claim cancels.
     * @param {Object} frame A `contact` frame of the owning `Neo.main.addon.Gesture`.
     */
    track({claim, kind, contacts, changed, elapsed}) {
        const {family} = claim;

        if (family !== 'pinch' && family !== 'rotate') {
            return
        }

        let me     = this,
            cohort = me.#claims.get(claim);

        if (!cohort) {
            if (!contacts.length) return;

            cohort = {down: new Map(), gesture: null};
            me.#claims.set(claim, cohort)
        }

        for (const {id} of contacts) {
            if (!cohort.down.has(id)) cohort.down.set(id, elapsed)
        }

        const {gesture} = cohort;

        if (kind === 'cancel' || contacts.length < 2) {
            if (gesture) {
                me.cancelFrame(gesture);
                cohort.gesture = null;
                me.publish(claim, `${family}:${kind === 'cancel' ? 'cancel' : 'end'}`, {
                    ...gesture.latest,
                    changed : changed.flatMap(id => gesture.ids.has(id) ? [gesture.ids.get(id)] : []),
                    contacts: [],
                    elapsed : elapsed - gesture.startedAt
                })
            }

            if (kind === 'cancel' || !contacts.length) {
                me.#claims.delete(claim)
            } else {
                for (const id of cohort.down.keys()) {
                    if (!contacts.some(contact => contact.id === id)) cohort.down.delete(id)
                }
            }

            return
        }

        const ordered  = [...contacts].sort((left, right) => left.id - right.id),
              members  = ordered.map(({id}) => id),
              [a, b]   = ordered,
              dx       = b.x - a.x,
              dy       = b.y - a.y,
              distance = Math.hypot(dx, dy),
              angle    = Math.atan2(dy, dx),
              // Close contacts have no stable bearing. A new valid vector becomes the baseline.
              basis    = Number.isFinite(distance) && distance >= 0.01 ? {angle, distance, members} : null;

        if (!gesture && !basis) {
            return
        }

        const current = gesture ?? {
            basis    : null,
            ids      : new Map(),
            pending  : new Set(),
            raf      : null,
            rotation : 0,
            scale    : 1,
            startedAt: Math.min(cohort.down.get(a.id), cohort.down.get(b.id))
        };

        if (basis && current.basis && members.length === current.basis.members.length &&
            members.every((id, index) => current.basis.members[index] === id)) {
            const scale = current.scale * (distance / current.basis.distance),
                  delta = (angle - current.basis.angle) * 180 / Math.PI;

            if (Number.isFinite(scale) && scale > 0) current.scale = scale;
            current.rotation += delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta
        }

        current.basis = basis;

        const mapped = ordered.map(point => {
            if (!current.ids.has(point.id)) current.ids.set(point.id, current.ids.size);

            return {...point, id: current.ids.get(point.id)}
        });

        current.latest = {
            contacts: mapped,
            elapsed : elapsed - current.startedAt,
            x       : mapped.reduce((total, point) => total + point.x / mapped.length, 0),
            y       : mapped.reduce((total, point) => total + point.y / mapped.length, 0),
            ...(family === 'pinch' ? {scale: current.scale} : {rotation: current.rotation})
        };

        const labels = changed.flatMap(id => current.ids.has(id) ? [current.ids.get(id)] : []);

        if (!gesture) {
            if (me.publish(claim, `${family}:start`, {...current.latest, changed: labels})) {
                cohort.gesture = current
            }
        } else {
            labels.forEach(id => current.pending.add(id));
            me.queueFrame(claim, current)
        }
    }

    /**
     * @summary Publishes the latest geometry once per frame and holds changed identities across samples.
     * @param {Object} claim
     * @param {Object} gesture
     * @protected
     */
    queueFrame(claim, gesture) {
        if (gesture.raf !== null) return;

        let me = this;

        gesture.raf = me.doc.defaultView.requestAnimationFrame(() => {
            gesture.raf = null;
            if (me.isDestroyed || me.#claims.get(claim)?.gesture !== gesture) return;

            const changed = [...gesture.pending];

            gesture.pending.clear();
            me.publish(claim, `${claim.family}:move`, {...gesture.latest, changed})
        })
    }

    /**
     * @summary Prevents a queued motion frame from crossing the terminal of its gesture.
     * @param {Object} gesture
     * @protected
     */
    cancelFrame(gesture) {
        if (gesture.raf !== null) {
            this.doc.defaultView.cancelAnimationFrame(gesture.raf);
            gesture.raf = null
        }
    }
}

export default Neo.setupClass(Transform);
