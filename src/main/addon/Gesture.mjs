import Base       from './Base.mjs';
import DomAccess  from '../DomAccess.mjs';
import DomEvents  from '../DomEvents.mjs';
import Observable from '../../core/Observable.mjs';

const pointerEvents = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'],
      touchEvents   = ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
      passive       = {capture: true, passive: true},
      swipeNoise    = 2,
      swipeRestMs   = 50;

/**
 * @summary Tracks contact ownership for subscribed nodes in one Main document.
 * The contact stream stays in Main. A recognizer observes `contact` frames and publishes semantic
 * phases through the selected claim. Native events continue through the existing raw path.
 * @class Neo.main.addon.Gesture
 * @extends Neo.main.addon.Base
 */
class Gesture extends Base {
    static config = {
        /** @member {String} className='Neo.main.addon.Gesture' */
        className: 'Neo.main.addon.Gesture',
        /**
         * @member {Array} mixins=[Observable]
         * @protected
         */
        mixins: [Observable],
        /** @member {Number} panDistance=6 Minimum translation in CSS px before pan starts. */
        panDistance: 6,
        /** @member {Boolean} preloadFilesDelay=false */
        preloadFilesDelay: false,
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {app: ['register', 'unregister']},
        /** @member {Number} swipeDirectionRatio=1.2 Required dominant-to-cross-axis travel ratio. */
        swipeDirectionRatio: 1.2,
        /** @member {Number} swipeDistance=30 Minimum travel in CSS px on the dominant axis. */
        swipeDistance: 30,
        /** @member {Number} swipeReleaseWindow=120 Time window in ms for measuring release velocity. */
        swipeReleaseWindow: 120,
        /** @member {Number} swipeVelocity=0.25 Minimum release velocity on the dominant axis in px/ms. */
        swipeVelocity: 0.25
    }

    /** @member {Document} #document */
    #document = globalThis.document
    /** @member {Map} #nodes */
    #nodes = new Map()
    /** @member {WeakMap} #translationClaims */
    #translationClaims = new WeakMap()
    /** @member {Boolean} #observingTranslation */
    #observingTranslation = false
    /** @member {Map} #touchSequences */
    #touchSequences = new Map()
    /** @member {Map} #pointerSequences */
    #pointerSequences = new Map()
    /** @member {Set} #touchPointers */
    #touchPointers = new Set()
    /** @member {AbortController|null} #listeners */
    #listeners = null
    /** @member {MutationObserver|null} #observer */
    #observer = null
    /** @member {Number} #nextGestureId */
    #nextGestureId = 0

    /**
     * @summary Replaces the phases observed by one component at a node without disturbing other subscribers.
     * @param {Object} data
     * @param {String} data.componentId
     * @param {String} data.id
     * @param {Number} data.registrationId App mount identity.
     * @param {String[]} data.events
     * @returns {Boolean}
     */
    register({componentId, id, registrationId, events}) {
        let owners = this.#nodes.get(id);

        if (!owners) {
            owners = new Map();
            this.#nodes.set(id, owners)
        }

        const families = new Set(events.map(name => name.split(':')[0])),
              previous = owners.get(componentId);

        if (!this.#observingTranslation && (families.has('pan') || families.has('swipe'))) {
            this.#observingTranslation = true;
            this.on('contact', this.trackTranslation, this)
        }

        if (previous && previous.registrationId === registrationId) {
            previous.families = families;
            this.pruneClaims()
        } else {
            if (previous) {
                this.revoke(previous)
            }

            owners.set(componentId, {componentId, id, registrationId, families})
        }

        this.listen();
        return true
    }

    /**
     * @summary Releases an App registration and cancels its active claims.
     * @param {Object} data
     * @param {String} data.componentId
     * @param {String} data.id
     * @param {Number} data.registrationId
     * @returns {Boolean}
     */
    unregister({componentId, id, registrationId}) {
        const owners = this.#nodes.get(id),
              owner  = owners?.get(componentId);

        if (owner && owner.registrationId === registrationId) {
            this.revoke(owner);
            owners.delete(componentId);

            if (!owners.size) {
                this.#nodes.delete(id)
            }

            if (!this.#nodes.size) {
                this.stopListening()
            }
        }

        return true
    }

    /** @summary Releases the document listeners and any active claims on addon destruction. */
    destroy() {
        this.stopListening();
        this.#nodes.clear();
        super.destroy()
    }

    /**
     * @summary Delivers a recognizer's result through the existing Main-to-App event stream.
     * @param {Object} claim The owner supplied with a `contact` frame.
     * @param {String} eventName
     * @param {Object} data Family-specific values for the phase.
     * @returns {Boolean} Whether the phase belonged to the current claim and was sent.
     */
    publish(claim, eventName, data={}) {
        const [family, phase] = eventName.split(':');

        if ((!claim.live && phase !== 'cancel') || family !== claim.family) {
            return false
        }

        let gestureId = claim.gestureId;

        if (phase === 'start') {
            if (gestureId !== null) {
                return false
            }

            gestureId = claim.gestureId = ++this.#nextGestureId;
            this.capturePointer(claim.sequence, claim.node)
        } else if (phase) {
            if (gestureId === null) {
                return false
            }

            if (phase === 'end' || phase === 'cancel') {
                claim.gestureId = null;

                if (![...claim.sequence.claims.values()].some(owner => owner.gestureId !== null)) {
                    this.releaseCapture(claim.sequence)
                }
            }
        } else {
            gestureId = ++this.#nextGestureId
        }

        const {componentId, id, registrationId} = claim.owner;

        DomEvents.sendMessageToApp({
            ...claim.frame,
            ...data,
            gestureId,
            ...(phase && {phase}),
            gestureOwner: {componentId, id, registrationId},
            path        : claim.sequence.path,
            type        : eventName
        });

        return true
    }

    /**
     * @summary Observes input only while this window has at least one registration.
     * @protected
     */
    listen() {
        if (this.#listeners) {
            return
        }

        const doc       = this.#document,
              signal    = (this.#listeners = new AbortController()).signal,
              options   = {...passive, signal},
              onPointer = this.onPointer.bind(this),
              onTouch   = this.onTouch.bind(this);

        pointerEvents.forEach(name => doc.addEventListener(name, onPointer, options));
        touchEvents.forEach(name => doc.addEventListener(name, onTouch, options));
        doc.addEventListener('visibilitychange', this.onVisibility.bind(this), {signal});
        doc.defaultView.addEventListener('pagehide', this.onPageHide.bind(this), {signal})
    }

    /**
     * @summary Clears document input and cancels claims before releasing native listeners.
     * @protected
     */
    stopListening() {
        this.onPageHide();
        this.#listeners?.abort();
        this.#listeners = null
    }

    /**
     * @summary Cancels live gestures when this document is no longer visible.
     * @protected
     */
    onVisibility() {
        if (this.#document.hidden) {
            this.onPageHide()
        }
    }

    /**
     * @summary Invalidates live ownership on window loss or when the document goes into the background.
     * @protected
     */
    onPageHide() {
        for (const sequence of this.getSequences()) {
            this.cancelSequence(sequence)
        }

        this.#pointerSequences.clear();
        this.#touchSequences.clear();
        this.#touchPointers.clear();
        this.#observer?.disconnect();
        this.#observer = null
    }

    /**
     * @summary Tracks physical touch membership independently of native pointer cancellation.
     * @param {TouchEvent} event
     * @protected
     */
    onTouch(event) {
        const {isTrusted, touches, type} = event;
        let   sequence                   = this.#touchSequences.get(isTrusted);

        // On a fresh start all active contacts are new. A detached start target can keep its
        // terminal event off the document path, leaving an empty cohort here until the next start.
        if (type === 'touchstart' && touches.length > 0 && touches.length === event.changedTouches.length && !this.#document.hidden) {
            if (sequence) {
                this.cancelSequence(sequence)
            }

            sequence = this.createSequence(event, 'touch');
            this.#touchSequences.set(isTrusted, sequence)
        }

        if (!sequence) {
            return
        }

        const kind = type.substring(5);

        this.sample(sequence, kind, touches, event.changedTouches, event.timeStamp);

        if (!touches.length) {
            this.#touchSequences.delete(isTrusted);

            if (isTrusted) {
                this.#touchPointers.clear()
            }
        }

        if (kind === 'end' || kind === 'cancel') {
            this.syncObserver()
        }
    }

    /**
     * @summary Uses Pointer Events for mouse and pen, and observes browser ownership for touch.
     * @param {PointerEvent} event
     * @protected
     */
    onPointer(event) {
        const {pointerId, pointerType, type} = event;

        if (pointerType === 'touch') {
            if (!event.isTrusted) {
                return
            }

            if (type === 'pointerdown') {
                this.#touchPointers.add(pointerId)
            } else if (type === 'pointercancel' && this.#touchPointers.delete(pointerId)) {
                const sequence = this.#touchSequences.get(true);

                // An uncancelable TouchEvent is also possible on an eligible horizontal stroke.
                // Pointer cancellation ends the claim; Touch still owns the physical cohort's lifetime.
                if (sequence) {
                    this.cancelSequence(sequence, event.timeStamp);
                    this.syncObserver()
                }
            } else if (type === 'pointerup') {
                this.#touchPointers.delete(pointerId)
            }

            return
        }

        let sequence = this.#pointerSequences.get(pointerId);

        if (type === 'pointerdown' && event.button === 0 && !this.#document.hidden) {
            sequence = this.createSequence(event, pointerType, pointerId);
            this.#pointerSequences.set(pointerId, sequence)
        }

        if (!sequence || (type === 'lostpointercapture' && sequence.capture !== event.target)) {
            return
        }

        const point = {identifier: pointerId, clientX: event.clientX, clientY: event.clientY, target: event.target},
              kind  = ({pointerdown: 'start', pointermove: 'move', pointerup: 'end'})[type] || 'cancel';

        this.sample(sequence, kind, kind === 'start' || kind === 'move' ? [point] : [], [point], event.timeStamp);

        if (kind === 'end' || kind === 'cancel') {
            this.#pointerSequences.delete(pointerId);
            this.releaseCapture(sequence);
            this.syncObserver()
        }
    }

    /**
     * @summary Pins each family to its innermost registered start surface.
     * @param {Event} event
     * @param {String} pointerType
     * @param {Number} [pointerId]
     * @returns {Object}
     * @protected
     */
    createSequence(event, pointerType, pointerId) {
        const sequence = {claims: new Map(), elapsed: 0, pointerId, pointerType, startedAt: event.timeStamp, trusted: event.isTrusted};

        for (const node of event.composedPath()) {
            const id = node === this.#document.body ? 'document.body' : DomAccess.getNodeId(node);

            for (const owner of this.#nodes.get(id)?.values() ?? []) {
                for (const family of owner.families) {
                    if (!sequence.claims.has(family)) {
                        sequence.claims.set(family, {family, gestureId: null, ids: new Map(), live: true, nextId: 0, node, owner, sequence})
                    }
                }
            }
        }

        if (sequence.claims.size) {
            sequence.path = DomEvents.getEventData(event).path;
            this.observeDetachment()
        }

        return sequence
    }

    /**
     * @summary Normalizes positions and changed identities for each still-owning family.
     * @param {Object} sequence
     * @param {String} kind
     * @param {TouchList|Object[]} active
     * @param {TouchList|Object[]} changed
     * @param {Number} timeStamp
     * @protected
     */
    sample(sequence, kind, active, changed, timeStamp) {
        sequence.elapsed = Math.max(sequence.elapsed, timeStamp - sequence.startedAt);

        const rects = new Map();

        for (const claim of sequence.claims.values()) {
            const {ids, node} = claim;

            if (!node.isConnected) {
                this.cancelClaim(claim);
                continue
            }

            const changedIds = [],
                  release    = claim.family === 'swipe' && kind === 'end' ? [] : null;

            for (const contact of changed) {
                const {identifier, target} = contact;

                if (kind === 'start' && !ids.has(identifier) && node.contains(target)) {
                    ids.set(identifier, claim.nextId++)
                }

                if (ids.has(identifier)) {
                    const id = ids.get(identifier);

                    changedIds.push(id);
                    release?.push({id, x: contact.clientX, y: contact.clientY});

                    if (kind === 'end' || kind === 'cancel') {
                        ids.delete(identifier)
                    }
                }
            }

            if (!changedIds.length) {
                continue
            }

            if (kind === 'cancel') {
                this.cancelClaim(claim, changedIds, timeStamp);
                continue
            }

            if (!rects.has(node)) {
                rects.set(node, node.getBoundingClientRect())
            }

            const {left, top} = rects.get(node),
                  contacts    = [];

            for (const point of active) {
                if (ids.has(point.identifier)) {
                    contacts.push({id: ids.get(point.identifier), x: point.clientX - left, y: point.clientY - top})
                }
            }

            claim.frame = {changed: changedIds, contacts, elapsed: sequence.elapsed, pointerType: sequence.pointerType, trusted: sequence.trusted};
            this.fire('contact', {claim, kind, ...claim.frame, ...(release && {
                lifted: release.map(({id, x, y}) => ({id, x: x - left, y: y - top}))
            })});

            if (!contacts.length) {
                sequence.claims.delete(claim.family);
                claim.live = false;

                if (claim.gestureId !== null) {
                    this.publish(claim, `${claim.family}:cancel`)
                }
            }
        }
    }

    /**
     * @summary Cancels an owner exactly once and removes it from the current physical sequence.
     * @param {Object} claim
     * @param {Number[]} [changed]
     * @param {Number} [timeStamp] Native time, or the owning window's clock for lifecycle cancellation.
     * @protected
     */
    cancelClaim(claim, changed=[...claim.ids.values()], timeStamp=this.#document.defaultView?.performance?.now() ?? performance.now()) {
        claim.sequence.elapsed = Math.max(claim.sequence.elapsed, timeStamp - claim.sequence.startedAt);
        claim.sequence.claims.delete(claim.family);
        claim.live  = false;
        claim.frame = {changed, contacts: [], elapsed: claim.sequence.elapsed, pointerType: claim.sequence.pointerType, trusted: claim.sequence.trusted};

        this.fire('contact', {claim, kind: 'cancel', ...claim.frame});

        if (claim.gestureId !== null) {
            this.publish(claim, `${claim.family}:cancel`)
        }
    }

    /**
     * @param {Object} sequence
     * @param {Number} [timeStamp]
     * @protected
     */
    cancelSequence(sequence, timeStamp) {
        for (const claim of sequence.claims.values()) {
            this.cancelClaim(claim, undefined, timeStamp)
        }

        this.releaseCapture(sequence)
    }

    /**
     * @param {Object} owner
     * @protected
     */
    revoke(owner) {
        for (const sequence of this.getSequences()) {
            for (const claim of sequence.claims.values()) {
                if (claim.owner === owner) {
                    this.cancelClaim(claim)
                }
            }
        }

        this.syncObserver()
    }

    /**
     * @returns {Object[]} The live contact cohorts in this document.
     * @protected
     */
    getSequences() {
        return [...this.#touchSequences.values(), ...this.#pointerSequences.values()]
    }

    /**
     * @summary Ends claims whose original node or family registration no longer exists.
     * @protected
     */
    pruneClaims() {
        for (const sequence of this.getSequences()) {
            for (const claim of sequence.claims.values()) {
                if (!claim.node.isConnected || !claim.owner.families.has(claim.family)) {
                    this.cancelClaim(claim)
                }
            }
        }

        this.syncObserver()
    }

    /**
     * @summary Watches detachment only while an admitted claim can retain contact state or timers.
     * @protected
     */
    observeDetachment() {
        const doc = this.#document;

        if (!this.#observer && doc.defaultView.MutationObserver) {
            this.#observer = new doc.defaultView.MutationObserver(() => this.pruneClaims());
            this.#observer.observe(doc, {childList: true, subtree: true})
        }
    }

    /**
     * @summary Releases the detachment observer and pointer capture when their last claim is gone.
     * @protected
     */
    syncObserver() {
        const sequences = this.getSequences();

        for (const sequence of sequences) {
            if (!sequence.claims.size) {
                this.releaseCapture(sequence)
            }
        }

        if (!sequences.some(sequence => sequence.claims.size)) {
            this.#observer?.disconnect();
            this.#observer = null
        }
    }

    /**
     * @summary Routes an admitted contact sample to its translation recognizer.
     * @param {Object} frame
     * @protected
     */
    trackTranslation(frame) {
        if (frame.claim.family === 'pan') {
            this.trackPan(frame)
        } else if (frame.claim.family === 'swipe') {
            this.trackSwipe(frame)
        }
    }

    /**
     * @summary Accumulates translation around the current centroid and rebases on contact changes.
     * @param {Object} frame
     * @protected
     */
    trackPan({claim, kind, contacts, changed, elapsed}) {
        let state = this.#translationClaims.get(claim);

        if (kind === 'cancel' || !contacts.length) {
            if (!state) return;

            this.#translationClaims.delete(claim);
            if (state.raf !== null) this.#document.defaultView.cancelAnimationFrame(state.raf);

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
            this.#translationClaims.set(claim, state)
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
            if (Math.hypot(state.deltaX, state.deltaY) >= this.panDistance) {
                state.started = this.publishPan(claim, state, 'start', {
                    changed: changed.flatMap(id => state.ids.has(id) ? [state.ids.get(id)] : [])
                })
            }

            return
        }

        changed.forEach(id => {if (state.ids.has(id)) state.pending.add(state.ids.get(id))});

        if (state.raf === null) {
            state.raf = this.#document.defaultView.requestAnimationFrame(() => {
                state.raf = null;
                if (this.#translationClaims.get(claim) !== state) return;

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
     * @protected
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
     * @protected
     */
    trackSwipe({claim, kind, contacts, elapsed, lifted=[]}) {
        let state = this.#translationClaims.get(claim);

        if (kind === 'cancel') {
            this.#translationClaims.delete(claim);
            return
        }

        if (contacts.length) {
            if (!state) {
                state = {begin: elapsed, origin: contacts[0], samples: [], single: contacts.length === 1};
                this.#translationClaims.set(claim, state)
            }

            state.single &&= contacts.length === 1;
            if (!state.single) return;

            state.samples = state.samples.filter(sample => elapsed - sample.elapsed <= this.swipeReleaseWindow).slice(-31);
            state.samples.push({...contacts[0], elapsed});
            return
        }

        this.#translationClaims.delete(claim);

        const point = lifted[0];

        if (!state?.single || kind !== 'end' || point?.id !== state.origin.id) return;

        const recent = state.samples.find(sample => elapsed - sample.elapsed <= this.swipeReleaseWindow && elapsed > sample.elapsed);

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

        if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY) || Math.abs(main) < this.swipeDistance ||
            Math.abs(main) < this.swipeDirectionRatio * Math.abs(cross) || speed * sign < this.swipeVelocity) {
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

            if (position - advanced >= Math.max(swipeNoise, this.swipeVelocity * (sample.elapsed - lastMotion))) {
                advanced   = position;
                lastMotion = sample.elapsed
            }
        }

        if (elapsed - lastMotion > swipeRestMs) return;

        const direction = horizontal ? (main > 0 ? 'right' : 'left') : (main > 0 ? 'down' : 'up');

        this.publish(claim, 'swipe', {changed: [0], contacts: [], direction, elapsed: elapsed - state.begin,
            velocityX, velocityY, x: point.x, y: point.y})
    }

    /**
     * @param {Object} sequence
     * @param {HTMLElement} node
     * @protected
     */
    capturePointer(sequence, node) {
        if (sequence.pointerId !== undefined && sequence.trusted && !sequence.capture) {
            node.setPointerCapture(sequence.pointerId);
            sequence.capture = node
        }
    }

    /**
     * @param {Object} sequence
     * @protected
     */
    releaseCapture(sequence) {
        const {capture, pointerId} = sequence;

        sequence.capture = null;

        if (capture?.hasPointerCapture(pointerId)) {
            capture.releasePointerCapture(pointerId)
        }
    }
}

export default Neo.setupClass(Gesture);
