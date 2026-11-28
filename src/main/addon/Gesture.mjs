import Base        from './Base.mjs';
import DomAccess   from '../DomAccess.mjs';
import DomEvents   from '../DomEvents.mjs';
import Observable  from '../../core/Observable.mjs';
import TapPress    from '../gesture/TapPress.mjs';
import Transform   from '../gesture/Transform.mjs';
import Translation from '../gesture/Translation.mjs';

const pointerEvents           = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture'],
      touchEvents             = ['touchstart', 'touchmove', 'touchend', 'touchcancel'],
      passive                 = {capture: true, passive: true},
      panScrollStartAttribute = 'data-neo-pan-at-scroll-start',
      releaseMenuMs           = 250;

/**
 * @summary Tracks contact ownership for subscribed nodes in one Main document, and owns the recognizers
 * that read it: `Neo.main.gesture.TapPress` for tap and press, `Neo.main.gesture.Transform` for pinch and
 * rotation. The contact stream stays in Main. A recognizer reads `contact` frames and publishes semantic
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
        /** @member {Number} pressHoldMs=500 Hold time in milliseconds before a press starts. */
        pressHoldMs: 500,
        /** @member {Number} pressMoveTolerance=8 Maximum contact movement in CSS px during a press. */
        pressMoveTolerance: 8,
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {app: ['register', 'unregister']},
        /** @member {Number} repeatDistance=24 Maximum distance in CSS px between repeated tap lifts. */
        repeatDistance: 24,
        /** @member {Number} repeatInterval=350 Maximum time in milliseconds between repeated tap lifts. */
        repeatInterval: 350,
        /** @member {Number} swipeDirectionRatio=1.2 Required dominant-to-cross-axis travel ratio. */
        swipeDirectionRatio: 1.2,
        /** @member {Number} swipeDistance=30 Minimum travel in CSS px on the dominant axis. */
        swipeDistance: 30,
        /** @member {Number} swipeNoise=2 Maximum reverse jitter in CSS px on the dominant axis. */
        swipeNoise: 2,
        /** @member {Number} swipeReleaseWindow=120 Time window in ms for measuring release velocity. */
        swipeReleaseWindow: 120,
        /** @member {Number} swipeRestMs=50 Maximum elapsed ms since meaningful advance towards the lift. */
        swipeRestMs: 50,
        /** @member {Number} swipeSampleLimit=32 Total contact samples retained for release qualification. */
        swipeSampleLimit: 32,
        /** @member {Number} swipeVelocity=0.25 Minimum release velocity on the dominant axis in CSS px/ms. */
        swipeVelocity: 0.25,
        /** @member {Number} tapDuration=250 Maximum time in milliseconds from first contact to final lift. */
        tapDuration: 250,
        /** @member {Number} tapTolerance=8 Maximum movement in CSS px from a tap contact's start. */
        tapTolerance: 8
    }

    /** @member {Document} #document */
    #document = globalThis.document
    /** @member {Map} #nodes */
    #nodes = new Map()
    /** @member {Map} #touchSequences */
    #touchSequences = new Map()
    /** @member {Map} #pointerSequences */
    #pointerSequences = new Map()
    /** @member {Map<Number,PointerEvent>} #touchPointers */
    #touchPointers = new Map()
    /** @member {Neo.main.gesture.TapPress|null} #tapPress */
    #tapPress = null
    /** @member {Map<Number,Object>} #releasedPressMenus */
    #releasedPressMenus = new Map()
    /** @member {AbortController|null} #listeners */
    #listeners = null
    /** @member {MutationObserver|null} #observer */
    #observer = null
    /** @member {Map<String,HTMLElement|null>} #panScrollNodes */
    #panScrollNodes = new Map()
    /** @member {AbortController|null} #panScrollListener */
    #panScrollListener = null
    /** @member {Number} #nextGestureId */
    #nextGestureId = 0
    /** @member {Neo.main.gesture.Transform|null} #transform */
    #transform = null
    /** @member {Neo.main.gesture.Translation|null} #translation */
    #translation = null

    /**
     * @summary Creates the owned recognizers: tap and press, which the contact pipeline calls, and
     * pinch, rotation, pan and swipe, which observe `contact` frames.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            publish = me.publish.bind(me);

        me.#tapPress = Neo.create(TapPress, {
            cancel  : claim => me.cancelClaim(claim, [...new Set([...claim.ids.values(), ...claim.frame.changed])]),
            doc     : me.#document,
            publish,
            settings: me
        });

        me.#transform   = Neo.create(Transform,   {doc: me.#document, publish});
        me.#translation = Neo.create(Translation, {doc: me.#document, publish, settings: me});

        me.on('contact', me.#transform.track,   me.#transform);
        me.on('contact', me.#translation.track, me.#translation)
    }

    /**
     * @summary Replaces the phases observed by one component at a node without disturbing other subscribers.
     * @param {Object} data
     * @param {String} data.componentId
     * @param {String} data.id
     * @param {Number} data.registrationId App mount identity.
     * @param {String[]} data.events
     * @param {Object} [data.gestureOptions] Recognition options chosen by App for this owner.
     * @returns {Boolean}
     */
    register({componentId, id, registrationId, events, gestureOptions}) {
        let owners = this.#nodes.get(id);

        if (!owners) {
            owners = new Map();
            this.#nodes.set(id, owners)
        }

        const families = new Set(events.map(name => name.split(':')[0])),
              previous = owners.get(componentId);

        if (previous && previous.registrationId === registrationId) {
            if (!families.has('tap')) {
                this.#tapPress.clearTapHistory(previous)
            }

            previous.families = families;
            this.pruneClaims()
        } else {
            if (previous) {
                this.revoke(previous)
            }

            owners.set(componentId, {componentId, id, registrationId, families, gestureOptions})
        }

        this.syncPanScrollRegistration(id);
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

            this.syncPanScrollRegistration(id);

            if (!this.#nodes.size) {
                this.stopListening()
            }
        }

        return true
    }

    /** @summary Cancels active claims and releases document listeners before destroying the recognizers. */
    destroy() {
        let me = this;

        me.stopListening();
        me.#tapPress?.destroy();
        me.#nodes.clear();

        [me.#transform, me.#translation].forEach(recognizer => {
            if (recognizer) {
                me.un('contact', recognizer.track, recognizer);
                recognizer.destroy()
            }
        });

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

                if (family === 'press' && phase === 'end') {
                    this.retainPressMenu(claim)
                }

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
        doc.defaultView.addEventListener('drag:start', this.onDragStart.bind(this), options);
        doc.addEventListener('contextmenu', this.onContextMenu.bind(this), {capture: true, signal});
        doc.addEventListener('visibilitychange', this.onVisibility.bind(this), {signal});
        doc.defaultView.addEventListener('pagehide', this.onPageHide.bind(this), {signal})
    }

    /**
     * @summary Clears document input and cancels claims before releasing native listeners.
     * @protected
     */
    stopListening() {
        for (const node of this.#panScrollNodes.values()) {
            node?.removeAttribute(panScrollStartAttribute)
        }

        this.#panScrollNodes.clear();
        this.#panScrollListener?.abort();
        this.#panScrollListener = null;
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
        } else {
            this.refreshPanScrollNodes()
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
        this.#tapPress.reset();
        this.#releasedPressMenus.clear();
        this.syncObserver()
    }

    /**
     * @summary Tracks an opted scroll host before contact and leaves other gesture surfaces unobserved.
     * @param {String} id
     * @protected
     */
    syncPanScrollRegistration(id) {
        const owners  = this.#nodes.get(id),
              optedIn = owners && [...owners.values()].some(owner =>
                  owner.families.has('pan') && owner.gestureOptions?.pan?.atScrollStart);

        if (optedIn && this.#document.defaultView.CSS?.supports('touch-action', 'pan-x pan-down pinch-zoom')) {
            this.updatePanScrollNode(id, DomAccess.getElement(id, this.#document));

            if (!this.#panScrollListener) {
                const {signal} = this.#panScrollListener = new AbortController();

                this.#document.addEventListener('scroll', event => {
                    const node = event.target,
                          key  = DomAccess.getNodeId(node);

                    if (this.#panScrollNodes.has(key)) {
                        this.updatePanScrollNode(key, node)
                    }
                }, {...passive, signal});
                this.#document.defaultView.addEventListener('pageshow', () => this.refreshPanScrollNodes(), {signal})
            }

            this.observeDetachment()
        } else if (this.#panScrollNodes.has(id)) {
            this.#panScrollNodes.get(id)?.removeAttribute(panScrollStartAttribute);
            this.#panScrollNodes.delete(id);

            if (!this.#panScrollNodes.size) {
                this.#panScrollListener?.abort();
                this.#panScrollListener = null
            }

            this.syncObserver()
        }
    }

    /**
     * @summary Projects the actual scroll offset onto a Main-owned CSS marker and retires a replaced node.
     * @param {String} id
     * @param {HTMLElement|null} node
     * @protected
     */
    updatePanScrollNode(id, node) {
        const previous = this.#panScrollNodes.get(id);

        if (previous && previous !== node) {
            previous.removeAttribute(panScrollStartAttribute)
        }

        this.#panScrollNodes.set(id, node);
        node?.toggleAttribute(panScrollStartAttribute, node.scrollTop <= 0)
    }

    /**
     * @summary Reads offsets restored while the window was hidden or cached.
     * @protected
     */
    refreshPanScrollNodes() {
        for (const id of this.#panScrollNodes.keys()) {
            this.updatePanScrollNode(id, DomAccess.getElement(id, this.#document))
        }
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

            if (sequence.claims.has('press') || sequence.claims.has('tap')) {
                const first = event.changedTouches[0];

                sequence.sourcePointer = [...this.#touchPointers.values()].find(pointer => pointer.target === first.target &&
                    Math.abs(pointer.clientX - first.clientX) <= 1 && Math.abs(pointer.clientY - first.clientY) <= 1)
            }

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

        if (type === 'pointerdown') {
            this.#releasedPressMenus.delete(pointerId)
        }

        if (pointerType === 'touch') {
            if (!event.isTrusted) {
                return
            }

            if (type === 'pointerdown') {
                this.#touchPointers.set(pointerId, event)
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
            if (sequence) {
                this.cancelSequence(sequence)
            }

            sequence = this.createSequence(event, pointerType, pointerId);
            sequence.sourcePointer = event;
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
     * @summary Yields tap and press when the existing pointer sensor arms the drag for this contact.
     * @param {CustomEvent} event
     * @protected
     */
    onDragStart(event) {
        const pointer = event.detail?.originalEvent;
        if (!pointer) return;

        const sequence = this.getSequences().find(candidate => candidate.sourcePointer === pointer);
        if (!sequence) return;

        for (const family of ['tap', 'press']) {
            const claim = sequence.claims.get(family);

            if (claim) {
                this.cancelClaim(claim, undefined, event.timeStamp)
            }
        }

        this.syncObserver()
    }

    /**
     * @summary Prevents the native default only for the contact that owns a started press.
     * @param {PointerEvent} event
     * @protected
     */
    onContextMenu(event) {
        if (!event.pointerType || event.pointerType === 'mouse' || !event.cancelable) return;

        for (const sequence of this.getSequences()) {
            const claim   = sequence.claims.get('press'),
                  pointer = sequence.sourcePointer;

            if (claim?.live && claim.node.isConnected && sequence.trusted === event.isTrusted && pointer &&
                pointer.pointerId === event.pointerId && pointer.pointerType === event.pointerType && claim.node.contains(event.target)) {
                if (claim.gestureId !== null) {
                    claim.menuHandled = true;
                    event.preventDefault()
                } else {
                    this.cancelClaim(claim, undefined, event.timeStamp);
                    this.syncObserver()
                }
                return
            }
        }

        const released = this.#releasedPressMenus.get(event.pointerId);

        if (released?.pointerType === event.pointerType &&
            released.trusted === event.isTrusted && released.node.isConnected && event.timeStamp <= released.expires &&
            released.node.contains(event.target) && this.#nodes.get(released.owner.id)?.get(released.owner.componentId) === released.owner &&
            released.owner.families.has('press')) {
            this.#releasedPressMenus.delete(event.pointerId);
            event.preventDefault()
        }
    }

    /**
     * @summary Retains the just-released contact for platforms that dispatch the menu on pointerup.
     * @param {Object} claim
     * @protected
     */
    retainPressMenu(claim) {
        const {node, owner, sequence: {sourcePointer, trusted}} = claim;

        if (!claim.menuHandled && sourcePointer && sourcePointer.pointerType !== 'mouse') {
            const now = this.#document.defaultView.performance.now();

            for (const [pointerId, menu] of this.#releasedPressMenus) {
                if (menu.expires < now) this.#releasedPressMenus.delete(pointerId)
            }

            this.#releasedPressMenus.set(sourcePointer.pointerId, {
                node, owner, trusted,
                pointerType: sourcePointer.pointerType,
                expires    : now + releaseMenuMs
            })
        }
    }

    /**
     * @summary Pins each family to its innermost eligible start surface.
     * A boundary Pan samples the scroll host on initial touch, before any movement changes the offset.
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
                    const atScrollStart = family === 'pan' && owner.gestureOptions?.pan?.atScrollStart;

                    if (!sequence.claims.has(family) && (!atScrollStart || (pointerType === 'touch' &&
                        node.scrollTop <= 0 && node.hasAttribute(panScrollStartAttribute)))) {
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
                  release    = kind === 'end' ? [] : null;

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

            const lifted = release?.map(({id, x, y}) => ({id, x: x - left, y: y - top}));

            claim.frame = {changed: changedIds, contacts, elapsed: sequence.elapsed, pointerType: sequence.pointerType, trusted: sequence.trusted};
            this.#tapPress.track(claim, kind, lifted);

            if (!claim.live) continue;

            this.fire('contact', {claim, kind, ...claim.frame, ...(lifted && {lifted})});

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

        this.#tapPress.track(claim, 'cancel');
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
     * @summary Watches detached claims and replacements of opted-in scroll hosts.
     * @protected
     */
    observeDetachment() {
        const doc = this.#document;

        if (!this.#observer && doc.defaultView.MutationObserver) {
            this.#observer = new doc.defaultView.MutationObserver(() => {
                for (const [id, node] of this.#panScrollNodes) {
                    if (!node?.isConnected) {
                        this.updatePanScrollNode(id, DomAccess.getElement(id, doc))
                    }
                }

                this.pruneClaims()
            });
            this.#observer.observe(doc, {childList: true, subtree: true})
        }
    }

    /**
     * @summary Releases pointer capture and disconnects the observer once neither claims nor scroll hosts need it.
     * @protected
     */
    syncObserver() {
        const sequences = this.getSequences();

        for (const sequence of sequences) {
            if (!sequence.claims.size) {
                this.releaseCapture(sequence)
            }
        }

        if (!this.#panScrollNodes.size && !sequences.some(sequence => sequence.claims.size)) {
            this.#observer?.disconnect();
            this.#observer = null
        }
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
