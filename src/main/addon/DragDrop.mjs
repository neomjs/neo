import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';
import Rectangle from '../../util/Rectangle.mjs';

/**
 * @class Neo.main.addon.DragDrop
 * @extends Neo.main.addon.Base
 */
class DragDrop extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.DragDrop'
         * @protected
         */
        className: 'Neo.main.addon.DragDrop',
        /**
         * Allow the drag proxy to move outside of the boundaryContainerId.
         * @member {Boolean} allowOverdrag=false
         */
        allowOverdrag: false,
        /**
         * @member {Boolean} alwaysFireDragMove=false
         */
        alwaysFireDragMove: false,
        /**
         * Optionally set a fixed cursor style to the document.body during drag operations
         * @member {String|null} bodyCursorStyle=null
         */
        bodyCursorStyle: null,
        /**
         * @member {DOMRect|null} scrollContainerRect=null
         */
        boundaryContainerRect: null,
        /**
         * @member {Number} clientX=0
         */
        clientX: 0,
        /**
         * @member {Number} clientY=0
         */
        clientY: 0,
        /**
         * @member {String|null} dragElementRootId=null
         */
        dragElementRootId: null,
        /**
         * True after Escape cancelled the active gesture and until the native sensor ends it.
         * While set, move/end/drop traffic is suppressed because `drag:cancel` already closed
         * the worker-side session.
         * @member {Boolean} dragCancelled=false
         * @protected
         */
        dragCancelled: false,
        /**
         * @member {String} dragProxyCls='neo-dragproxy'
         */
        dragProxyCls: 'neo-dragproxy',
        /**
         * @member {HTMLElement|null} dragProxyElement=null
         * @protected
         */
        dragProxyElement: null,
        /**
         * @member {DOMRect|null} dragProxyRect=null
         */
        dragProxyRect: null,
        /**
         * @member {String|null} dragZoneId=null
         */
        dragZoneId: null,
        /**
         * Registry of app-side drag zones by their drag element root id, populated eagerly at
         * zone construction (registerZone) and refreshed on every setConfigs handshake. Resolves
         * the owning zone synchronously inside onDragStart, so the FIRST drag:start of a boot
         * already carries its dragZoneId — the gesture-opening window in which every forward
         * (and the Escape guard) was zoneless by construction is closed at the source.
         * Deliberately NOT cleared by resetDragState(): zones outlive gestures.
         * @member {Object} zoneRegistrations={}
         * @protected
         */
        zoneRegistrations: {},
        /**
         * You can either pass an array of (dom) ids or cls rules or both
         * @example
         * dropZoneIdentifier: {
         *     ids: ['foo','bar']
         * }
         * @example
         * dropZoneIdentifier: {
         *     cls: ['my-class-1','my-class-2']
         * }
         * @example
         * dropZoneIdentifier: {
         *     cls: ['my-class-1','my-class-2'],
         *     ids: ['foo','bar']
         * }
         * @member {Object|null} dropZoneIdentifier=null
         */
        dropZoneIdentifier: null,
        /**
         * @member {Number} initialScrollLeft=0
         */
        initialScrollLeft: 0,
        /**
         * @member {Number} initialScrollTop=0
         */
        initialScrollTop: 0,
        /**
         * @member {Boolean} isWindowDragging=false
         * @protected
         */
        isWindowDragging: false,
        /**
         * True while the current popup embodiment is parked behind a source-owned conversion.
         * Logical drag frames keep flowing; only physical pointer-follow moves pause.
         * @member {Boolean} windowDragParked=false
         * @protected
         */
        windowDragParked: false,
        /**
         * Exact outer geometry retained while a resized popup is parked. `park` is the
         * target-cover extent/origin; `restore` is the pre-conversion extent/origin.
         * @member {Object|null} windowDragParkedGeometry=null
         * @protected
         */
        windowDragParkedGeometry: null,
        /**
         * Exact route/restore authority installed before the first native park effect. Unlike
         * `windowDragParkRecovery`, this clean parked record does not change resume choreography;
         * it only serializes a pending platform effect and survives reset through orphan promotion.
         * @member {Object|null} windowDragParkRoute=null
         * @protected
         */
        windowDragParkRoute: null,
        /**
         * Retry authority for a failed park/resume compensation. A failed platform call must not
         * strand `windowDragParked=true` without an exact same-generation path back to the source
         * rect. The record owns the native route plus the full rect still requiring restoration.
         * @member {Object|null} windowDragParkRecovery=null
         * @protected
         */
        windowDragParkRecovery: null,
        /**
         * Exact physical recovery which outlives the logical drag generation that issued it.
         *
         * Native resize/move effects cannot be cancelled. A predecessor effect may therefore settle
         * after `resetDragState()` has invalidated its gesture. Reset deliberately does not clear
         * these route-keyed records: each exact route and pre-effect outer rect remains authoritative
         * until immediate compensation or the worker's terminal restore strictly succeeds. One
         * record coalesces concurrent retries and revisions without blocking a different opaque route.
         * @member {Map|null} windowDragOrphanRecoveries=null
         * @protected
         */
        windowDragOrphanRecoveries: null,
        /**
         * @member {Boolean} moveHorizontal=true
         */
        moveHorizontal: true,
        /**
         * @member {Boolean} moveVertical=true
         */
        moveVertical: true,
        /**
         * @member {Number} offsetX=0
         */
        offsetX: 0,
        /**
         * @member {Number} offsetY=0
         */
        offsetY: 0,
        /**
         * @member {String|null} popupName=null
         * @protected
         */
        popupName: null,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'requestWindowManagementPermission',
                'acknowledgeWindowDragOrphanRecovery',
                'hasWindowDragOrphanRecovery',
                'parkWindowDrag',
                'registerZone',
                'retireWindowDragOrphanRecovery',
                'resumeWindowDrag',
                'setConfigs',
                'setDragProxyElement',
                'startWindowDrag',
                'unregisterZone'
            ]
        },
        /**
         * @member {HTMLElement|null} scrollContainerElement=null
         */
        scrollContainerElement: null,
        /**
         * @member {DOMRect|null} scrollContainerRect=null
         */
        scrollContainerRect: null,
        /**
         * @member {Number} scrollFactorLeft=1
         */
        scrollFactorLeft: 1,
        /**
         * @member {Number} scrollFactorTop=1
         */
        scrollFactorTop: 1
    }

    /**
     * Monotonic physical-drag lifetime. Reset/start invalidates every older async native move.
     * @member {Number} windowDragGeneration=0
     * @protected
     */
    windowDragGeneration = 0

    /**
     * In-flight ordinary pointer-follow moves. Park snapshots and drains this set after pausing;
     * ordinary moves remain concurrent so the native pointer embodiment never queues behind
     * position-verification latency.
     * @member {Set<Promise>} windowDragMovePromises
     * @protected
     */
    windowDragMovePromises = new Set()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            imports = [];

        DomEvents.on({
            mouseEnter: me.onMouseEnter,
            mouseLeave: me.onMouseLeave,
            scope     : me
        });

        me.addGlobalEventListeners();

        if (Neo.config.hasMouseEvents) {
            imports.push(import('../draggable/sensor/Mouse.mjs'))
        }

        if (Neo.config.hasTouchEvents) {
            imports.push(import('../draggable/sensor/Touch.mjs'))
        }

        Promise.all(imports).then(modules => {
            // create the Mouse- and / or TouchSensor
            modules.forEach(module => {
                Neo.create({module: module.default})
            })
        })
    }

    /**
     *
     */
    addGlobalEventListeners() {
        let me = this;

        document.addEventListener('keydown',    me.onKeyDown  .bind(me), true);
        document.addEventListener('drag:end',   me.onDragEnd  .bind(me), true);
        document.addEventListener('drag:move',  me.onDragMove .bind(me), true);
        document.addEventListener('drag:start', me.onDragStart.bind(me), true)
    }

    /**
     * @param {Event} event
     * @returns {Object}
     */
    getEventData(event) {
        let path   = event.path || event.composedPath(),
            detail = event.detail,

        e = {
            ...DomEvents.getEventData(event.detail.originalEvent),
            clientX: detail.clientX,
            clientY: detail.clientY
        };

        if (detail.eventPath) {
            e.targetPath = detail.eventPath.map(e => DomEvents.getTargetData(e))
        } else {
            e.targetPath = e.path
        }

        e.path = path.map(e => DomEvents.getTargetData(e));

        return e
    }

    /**
     * @param {Event} event
     */
    onDragEnd(event) {
        let me = this;

        if (me.bodyCursorStyle) {
            DomAccess.setStyle({
                id   : 'document.body',
                style: {
                    cursor: null
                }
            });
        }

        if (!me.dragCancelled) {
            let parsedEvent = me.getEventData(event),
                isDrop      = me.pathIncludesDropZone(parsedEvent.targetPath);

            DomEvents.sendMessageToApp({
                ...parsedEvent,
                dragZoneId: me.dragZoneId,
                isDrop,
                offsetX   : me.offsetX,
                offsetY   : me.offsetY,
                type      : 'drag:end'
            });

            if (isDrop) {
                DomEvents.sendMessageToApp({
                    ...DomEvents.getMouseEventData(event.detail.originalEvent),
                    dragZoneId: me.dragZoneId,
                    type      : 'drop'
                })
            }
        }

        me.resetDragState()
    }

    /**
     * Captures Escape at the gesture owner, independent of which dragged node still owns focus.
     * A single `drag:cancel` is routed directly to the active worker drag zone; subsequent native
     * move/end events are ignored until the sensor releases and resets the main-thread session.
     * @param {KeyboardEvent} event
     */
    onKeyDown(event) {
        let me = this;

        if (event.key === 'Escape' && me.dragZoneId && !me.dragCancelled) {
            me.dragCancelled = true;
            event.preventDefault();

            DomEvents.sendMessageToApp({
                ...DomEvents.getKeyboardEventData(event),
                dragZoneId: me.dragZoneId,
                type      : 'drag:cancel'
            })
        }
    }

    /**
     * Restores the main-thread drag owner to its between-gestures baseline.
     * @protected
     */
    resetDragState() {
        let me = this;

        // Idempotent second release site for the sensor-side gesture selection guard — NOT an
        // off-document-release fallback: resetDragState() is only reached downstream of the
        // sensor's own `drag:end`. The Mouse sensor owns the physical mousedown→release bracket,
        // including lost-release recovery on its own move stream; this line just keeps the two
        // layers from drifting should that bracket's semantics ever change.
        // Guarded at the globalThis root: bare test harnesses may stub `document` without a
        // body/classList — or provide no `document` at all (a bare `document` reference would
        // throw ReferenceError there before the optional chain can engage).
        globalThis.document?.body?.classList?.remove('neo-drag-active');

        DragDrop.prototype.promoteWindowDragParkRecovery.call(me);

        Object.assign(me, {
            alwaysFireDragMove      : false,
            bodyCursorStyle         : null,
            boundaryContainerRect   : null,
            dragCancelled           : false,
            dragElementRootId       : null,
            dragElementRootRect     : null,
            dragProxyCls            : 'neo-dragproxy',
            dragProxyElement        : null,
            dragZoneId              : null,
            dropZoneIdentifier      : null,
            initialScrollLeft       : 0,
            initialScrollTop        : 0,
            isWindowDragging        : false,
            moveHorizontal          : true,
            moveVertical            : true,
            popupHeight             : null,
            popupName               : null,
            popupWidth              : null,
            scrollContainerElement  : null,
            scrollContainerRect     : null,
            scrollFactorLeft        : 1,
            scrollFactorTop         : 1,
            windowDragGeneration    : (me.windowDragGeneration || 0) + 1,
            windowDragMovePromises  : new Set(),
            windowDragParked        : false,
            windowDragParkedGeometry: null,
            windowDragParkRoute     : null,
            windowDragParkRecovery  : null,
            windowName              : null
        })
    }

    /**
     * @summary Promotes the current clean route or failed recovery before logical invalidation.
     * @returns {Object|null}
     * @protected
     */
    promoteWindowDragParkRecovery() {
        let me          = this,
            routeRecord = me.windowDragParkRoute,
            recovery    = me.windowDragParkRecovery ?? routeRecord;

        if (routeRecord?.retired || recovery?.retired) return null;

        return recovery
            ? DragDrop.prototype.retainWindowDragOrphanRecovery.call(me, {
                advance        : false,
                nativeHandleKey: recovery.nativeHandleKey,
                park           : recovery.park,
                pendingEffect  : recovery.pendingEffect ?? routeRecord?.pendingEffect,
                resize         : recovery.resize,
                restore        : recovery.restore,
                sourceRoute    : routeRecord,
                targetWindowId : recovery.targetWindowId,
                windowName     : recovery.windowName
            })
            : null
    }

    /**
     * @summary Deletes a strict-close tombstone only after its complete outer route transaction
     * and any coalesced retry have drained.
     * @param {Object|null} recovery
     * @returns {Boolean}
     * @protected
     */
    cleanupRetiredWindowDragOrphanRecovery(recovery) {
        let me         = this,
            recoveries = me.windowDragOrphanRecoveries;

        if (
            !recovery?.retired || recoveries?.get(recovery.key) !== recovery ||
            recovery.promise || recovery.pendingEffect || (recovery.sourceRoute?.operationCount || 0) > 0
        ) {
            return false
        }

        recoveries.delete(recovery.key);
        recoveries.size || (me.windowDragOrphanRecoveries = null);

        return true
    }

    /**
     * @summary Releases one complete park/resume transaction and then prunes a drained tombstone.
     * @param {Object|null} routeRecord
     * @returns {void}
     * @protected
     */
    releaseWindowDragRouteOperation(routeRecord) {
        if (!routeRecord) return;

        routeRecord.operationCount = Math.max(0, (routeRecord.operationCount || 0) - 1);

        let recovery = this.windowDragOrphanRecoveries?.get(routeRecord.key);

        if (recovery?.pendingEffect && recovery.sourceRoute === routeRecord && !routeRecord.pendingEffect) {
            recovery.pendingEffect = null
        }

        recovery && DragDrop.prototype.cleanupRetiredWindowDragOrphanRecovery.call(this, recovery)
    }

    /**
     * @param {Event} event
     */
    onDragMove(event) {
        let me              = this,
            {originalEvent} = event.detail,
            proxyRect       = me.dragProxyRect,
            rect            = me.boundaryContainerRect,
            data, left, top;

        if (me.dragCancelled) {
            return
        }

        if (me.isWindowDragging) {
            const
                x = originalEvent.screenX - (me.offsetX || 0),
                y = originalEvent.screenY - (me.offsetY || 0);

            if (!me.windowDragParked) {
                let movement;

                try {
                    movement = Neo.Main.windowMoveTo({windowName: me.popupName, x, y})
                } catch {
                    movement = false
                }

                if (typeof movement?.then === 'function') {
                    const tracked = Promise.resolve(movement).catch(() => false).finally(() => {
                        me.windowDragMovePromises?.delete(tracked)
                    });

                    me.windowDragMovePromises ??= new Set();
                    me.windowDragMovePromises.add(tracked)
                }
            }

            DomEvents.sendMessageToApp({
                ...me.getEventData(event),
                dragZoneId: me.dragZoneId,
                offsetX   : me.offsetX,
                offsetY   : me.offsetY,
                proxyRect : new DOMRect(x - window.screenX, y - window.screenY, me.popupWidth, me.popupHeight),
                screenX   : originalEvent.screenX,
                screenY   : originalEvent.screenY,
                type      : 'drag:move'
            });

            return
        }

        if (me.scrollContainerElement) {
            data = me.scrollContainer({
                clientX: event.detail.clientX,
                clientY: event.detail.clientY
            });

            event.detail.clientX = data.clientX;
            event.detail.clientY = data.clientY;
        }

        if (me.dragProxyElement) {
            left = event.detail.clientX - me.offsetX;
            top  = event.detail.clientY - me.offsetY;

            if (rect && !me.allowOverdrag) {
                if (left < rect.left) {
                    left = rect.left
                } else if (left > rect.right - proxyRect.width) {
                    left = rect.right - proxyRect.width
                }

                if (top < rect.top) {
                    top = rect.top
                } else if (top > rect.bottom - proxyRect.height) {
                    top = rect.bottom - proxyRect.height
                }
            }

            if (me.moveHorizontal) {
                me.dragProxyElement.style.left = `${left}px`
            }


            if (me.moveVertical) {
                me.dragProxyElement.style.top = `${top}px`
            }
        }

        if (!me.dragProxyElement || me.alwaysFireDragMove) {
            let originalEvent = event.detail.originalEvent;
            proxyRect = null;

            if (me.dragProxyElement) {
                const {height, width} = me.dragProxyElement.getBoundingClientRect();
                proxyRect = new DOMRect(left, top, width, height);
            }

            DomEvents.sendMessageToApp({
                ...me.getEventData(event),
                dragZoneId: me.dragZoneId,
                offsetX   : me.offsetX,
                offsetY   : me.offsetY,
                proxyRect,
                screenX   : originalEvent.screenX,
                screenY   : originalEvent.screenY,
                type      : 'drag:move'
            })
        }
    }

    /**
     * @param {Event} event
     */
    onDragStart(event) {
        let me   = this,
            rect = event.target.getBoundingClientRect();

        // Resolve the owning zone synchronously from the event path against the zone registry.
        // Zones register eagerly at construction (registerZone) and re-register on every
        // setConfigs handshake, so even the first drag:start of a boot carries its dragZoneId —
        // closing the gesture-opening window in which every forward, and the Escape guard
        // keying on it, was zoneless by construction.
        me.dragZoneId = me.resolveDragZoneId(event.path || event.composedPath());

        Object.assign(me, {
            dragCancelled: false,
            dragProxyRect: rect,
            offsetX      : event.detail.clientX - rect.left,
            offsetY      : event.detail.clientY - rect.top
        });

        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            dragZoneId: me.dragZoneId,
            type      : 'drag:start'
        })
    }

    /**
     * @param {Event} event
     */
    onMouseEnter(event) {
        let me = this;

        if (me.pathIncludesDropZone(event.path)) {
            DomEvents.sendMessageToApp({
                ...event,
                dragZoneId: me.dragZoneId,
                type      : 'drop:enter'
            })
        }
    }

    /**
     * @param {Event} event
     */
    onMouseLeave(event) {
        let me = this;

        if (me.pathIncludesDropZone(event.path)) {
            DomEvents.sendMessageToApp({
                ...event,
                dragZoneId: me.dragZoneId,
                type      : 'drop:leave'
            })
        }
    }

    /**
     * @param {Array} path
     * @returns {Boolean}
     */
    pathIncludesDropZone(path) {
        let me         = this,
            hasMatch   = true,
            identifier = me.dropZoneIdentifier,
            cls, ids;

        if (identifier) {
            cls = identifier.cls;
            ids = identifier.ids;

            for (const item of path) {
                if (cls) {
                    hasMatch = false;

                    for (const targetCls of item.cls) {
                        if (cls.includes(targetCls)) {
                            hasMatch = true;
                            break
                        }
                    }
                }

                if (hasMatch && ids && !ids.includes(item.id)) {
                    hasMatch = false
                }

                if (hasMatch) {
                    return true
                }
            }
        }

        return false
    }

    /**
     * @returns {Promise<Object>}
     */
    async requestWindowManagementPermission() {
        if (!window.isSecureContext || !('getScreenDetails' in window)) {
            return {success: false, error: 'The Window Management API requires a secure context (HTTPS or localhost) and is not supported by this browser.'};
        }

        try {
            await window.getScreenDetails();
            return {success: true};
        } catch (err) {
            if (err.name === 'PermissionDeniedError') {
                return {success: false, error: 'Permission to manage windows was denied.'};
            }
            return {success: false, error: `An unknown error occurred: ${err.message}`};
        }
    }

    /**
     * @param {Object} data
     * @param {Number} data.clientX
     * @param {Number} data.clientY
     * @returns {Object}
     */
    scrollContainer(data) {
        let me     = this,
            deltaX = data.clientX - me.clientX,
            deltaY = data.clientY - me.clientY,
            el     = me.scrollContainerElement,
            gap    = 250,
            rect   = me.scrollContainerRect;

        me.clientX =  data.clientX;
        me.clientY =  data.clientY;

        if (
            (deltaX < 0 && data.clientX < rect.left  + gap) ||
            (deltaX > 0 && data.clientX > rect.right - gap)
        ) {
            el.scrollLeft += (deltaX * me.scrollFactorLeft)
        }

        if (
            (deltaY < 0 && data.clientY < rect.top    + gap) ||
            (deltaY > 0 && data.clientY > rect.bottom - gap)
        ) {
            el.scrollTop += (deltaY * me.scrollFactorTop)
        }

        return {
            clientX: me.clientX + el.scrollLeft - me.initialScrollLeft,
            clientY: me.clientY + el.scrollTop  - me.initialScrollTop
        }
    }

    /**
     * DragZones will set these configs inside their dragStart() method.
     * They only persist until the end of a drag OP.
     * @param {Object}               data
     * @param {Boolean}              data.alwaysFireDragMove
     * @param {String|String[]|null} data.boundaryContainerId
     * @param {String|null}          data.scrollContainerId
     * @param {Number}               data.scrollFactorLeft
     * @param {Number}               data.scrollFactorTop
     * @returns {Object} return the boundaryContainerRect
     */
    /**
     * App-side drag zones register themselves at construction, so onDragStart can resolve the
     * owning zone synchronously from the event path — before any setConfigs handshake could
     * land. Idempotent per (root, zone) pair; see also setConfigs(), which re-registers.
     * @param {Object} data
     * @param {String} data.dragElementRootId
     * @param {String} data.dragZoneId
     */
    registerZone(data) {
        if (data?.dragElementRootId && data?.dragZoneId) {
            this.zoneRegistrations[data.dragElementRootId] = data.dragZoneId
        }
    }

    /**
     * @param {Array<HTMLElement>} path
     * @returns {String|null} the registered zone id for the first path entry that owns one
     * @protected
     */
    resolveDragZoneId(path) {
        let registrations = this.zoneRegistrations;

        for (const node of path || []) {
            if (node?.id && registrations[node.id]) {
                return registrations[node.id]
            }
        }

        return null
    }

    /**
     * @param {Object} data
     * @param {String} [data.dragElementRootId]
     * @param {String} data.dragZoneId — every registration pointing at this zone is removed
     */
    unregisterZone(data) {
        let registrations = this.zoneRegistrations;

        if (data?.dragElementRootId) {
            delete registrations[data.dragElementRootId]
        } else if (data?.dragZoneId) {
            Object.keys(registrations).forEach(key => {
                if (registrations[key] === data.dragZoneId) {
                    delete registrations[key]
                }
            })
        }
    }

    setConfigs(data) {
        let me                    = this,
            {boundaryContainerId} = data,
            node, rects;

        delete data.appName;
        delete data.windowId;

        // The per-gesture handshake doubles as a registry refresh — keeps the eager
        // construction-time registration honest if a zone's root element was re-created.
        if (data.dragElementRootId && data.dragZoneId) {
            me.zoneRegistrations[data.dragElementRootId] = data.dragZoneId
        }

        if (boundaryContainerId) {
            rects = DomAccess.getBoundingClientRect({id: boundaryContainerId});

            if (Array.isArray(boundaryContainerId)) {
                me.boundaryContainerRect = Rectangle.getIntersection(...rects)
            } else {
                me.boundaryContainerRect = rects
            }
        }

        delete data.boundaryContainerId;

        if (data.scrollContainerId) {
            node = DomAccess.getElementOrBody(data.scrollContainerId);

            Object.assign(me, {
                scrollContainerElement: node,
                scrollContainerRect   : node.getBoundingClientRect(),
                initialScrollLeft     : node.scrollLeft,
                initialScrollTop      : node.scrollTop
            })
        }

        delete data.scrollContainerId;

        Object.entries(data).forEach(([key, value]) => {
            if (me.hasOwnProperty(key)) {
                me[key] = value
            } else {
                console.error('unknown key passed inside setConfigs()', key)
            }
        });

        // we need to apply the custom style here, since onDragStart() triggers before we get the configs
        if (me.bodyCursorStyle) {
            DomAccess.setStyle({
                id   : 'document.body',
                style: {
                    cursor: me.bodyCursorStyle
                }
            })
        }

        return {
            boundaryContainerRect: me.boundaryContainerRect || null
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    setDragProxyElement(data) {
        this.dragProxyElement = document.getElementById(data.id)
    }

    /**
     * @summary Pauses physical pointer-follow, drains every already-issued semantic-name move,
     * then parks the exact opener-minted native handle generation.
     *
     * The pause happens before the first await, while `onDragMove()` continues publishing logical
     * frames. After prior physical moves drain, the exact opaque handle supplies the recovery rect;
     * a pre-drain Worker snapshot is provisional only. A non-coverable popup then requests a
     * best-effort full-size pre-position, shrinks to a verified outer extent, and verifies the target
     * origin again. A refused staging move is tolerable because Chrome can clamp a too-wide frame to
     * the same display's last safe origin. Resize or final exact-move refusal compensates to the
     * post-drain exact extent/origin before pointer-follow resumes. A reset/new start invalidates the
     * completion without touching successor state.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {{height:Number,width:Number}|null} [data.parkSize=null]
     * @param {{height:Number,width:Number,x:Number,y:Number}|null} [data.restoreRect=null]
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @param {Number} data.x
     * @param {Number} data.y
     * @returns {Promise<Boolean>}
     */
    async parkWindowDrag({
        nativeHandleKey,
        parkSize=null,
        restoreRect=null,
        targetWindowId,
        windowName,
        x,
        y
    } = {}) {
        let me              = this,
            resizeRequested = parkSize != null;

        const
            validSize = value => value
                && Number.isFinite(value.width) && value.width > 0
                && Number.isFinite(value.height) && value.height > 0,
            validRestore = value => validSize(value)
                && Number.isFinite(value.x) && Number.isFinite(value.y);

        if (
            !me.isWindowDragging || windowName !== me.popupName ||
            !nativeHandleKey || !targetWindowId || !Number.isFinite(x) || !Number.isFinite(y) ||
            (resizeRequested && !validSize(parkSize)) ||
            (restoreRect != null && !validRestore(restoreRect))
        ) {
            return false
        }

        if (me.windowDragParked) {
            if (me.windowDragParkRecovery) {
                await DragDrop.prototype.retryWindowDragParkRecovery.call(me, {
                    nativeHandleKey,
                    targetWindowId,
                    windowName
                })
            }

            // A recovery restores the source embodiment; it does not also admit a fresh park in
            // the same platform-effect turn. The replayed pointer frame may propose that anew.
            return false
        }

        if (DragDrop.prototype.hasWindowDragOrphanRecovery.call(me, {
            nativeHandleKey,
            targetWindowId,
            windowName
        })) {
            await DragDrop.prototype.retryWindowDragOrphanRecovery.call(me, {
                nativeHandleKey,
                targetWindowId,
                windowName
            });

            // A predecessor's physical compensation is its own platform-effect turn. Even strict
            // recovery never combines with a fresh park proposal.
            return false
        }

        const
            generation = me.windowDragGeneration,
            route      = {nativeHandleKey, targetWindowId},
            routeKey   = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
            geometry   = restoreRect ? {
                park   : {...(resizeRequested ? {height: parkSize.height, width: parkSize.width} : {}), x, y},
                resize : resizeRequested,
                restore: {
                    height: restoreRect.height,
                    width : restoreRect.width,
                    x     : restoreRect.x,
                    y     : restoreRect.y
                }
            } : null,
            moveTo = async rect => {
                try {
                    return await Neo.Main.windowNativeMoveTo({...route, x: rect.x, y: rect.y}) === true
                } catch {
                    return false
                }
            },
            resizeTo = async size => {
                try {
                    return await Neo.Main.windowNativeResizeTo({
                        ...route,
                        height: size.height,
                        width : size.width
                    }) === true
                } catch {
                    return false
                }
            };

        let parkRoute = null;

        const routeCurrent = () => (
            generation === me.windowDragGeneration &&
            me.isWindowDragging &&
            parkRoute?.retired !== true
        );

        const runParkEffect = async effect => {
            const pending = effect();

            parkRoute && (parkRoute.pendingEffect = pending);

            const result = await pending;

            parkRoute?.pendingEffect === pending && (parkRoute.pendingEffect = null);

            return result
        };

        me.windowDragParked         = true;
        me.windowDragParkedGeometry = geometry;
        me.windowDragParkRoute      = null;
        me.windowDragParkRecovery   = null;

        try {
            await Promise.allSettled([...(me.windowDragMovePromises || [])]);

            if (!routeCurrent() || !me.windowDragParked) {
                return false
            }

            if (geometry) {
                let liveRestore = null;

                try {
                    liveRestore = await Neo.Main.windowNativeGetGeometry(route)
                } catch {
                    // A refused/stale opaque route is not recovery authority.
                }

                if (!routeCurrent() || !me.windowDragParked) {
                    return false
                }

                if (!validRestore(liveRestore)) {
                    me.windowDragParked         = false;
                    me.windowDragParkedGeometry = null;
                    return false
                }

                geometry.restore = {...liveRestore}
            }

            parkRoute = geometry ? {
                generation,
                key           : routeKey,
                nativeHandleKey,
                operationCount: 1,
                park          : {...geometry.park},
                pendingEffect : null,
                resize        : false,
                restore       : {...geometry.restore},
                retired       : false,
                revision      : 1,
                targetWindowId,
                windowName
            } : null;
            me.windowDragParkRoute = parkRoute;

            // Ask the browser to place the still-full-size source as close to the target origin as
            // its current display permits before shrinking. This pre-position is intentionally
            // best-effort: when the target cannot yet contain the larger frame, Chrome can clamp
            // to the last fully visible origin and truthfully return false. That admitted clamp is
            // still the safe resize anchor; only the post-resize exact move gates conversion.
            geometry?.resize && await runParkEffect(() => moveTo({x, y}));

            if (!routeCurrent() || !me.windowDragParked) {
                geometry?.resize && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                    geometry   : {...geometry, resize: false},
                    nativeHandleKey,
                    routeRecord: parkRoute,
                    targetWindowId,
                    windowName
                });
                return false
            }

            geometry?.resize && (parkRoute.resize = true);

            if (geometry?.resize && !await runParkEffect(() => resizeTo(geometry.park))) {
                if (!routeCurrent()) {
                    await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                        geometry,
                        nativeHandleKey,
                        routeRecord: parkRoute,
                        targetWindowId,
                        windowName
                    });
                    return false
                }

                me.windowDragParkRecovery = {
                    ...parkRoute,
                    pendingEffect: null,
                    revision     : 1
                };

                await DragDrop.prototype.retryWindowDragParkRecovery.call(me, {
                    nativeHandleKey,
                    targetWindowId,
                    windowName
                });

                return false
            }

            if (!routeCurrent() || !me.windowDragParked) {
                geometry?.resize && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                    geometry,
                    nativeHandleKey,
                    routeRecord: parkRoute,
                    targetWindowId,
                    windowName
                });
                return false
            }

            const moved = await runParkEffect(() => moveTo({x, y}));

            if (!routeCurrent()) {
                geometry && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                    geometry,
                    nativeHandleKey,
                    routeRecord: parkRoute,
                    targetWindowId,
                    windowName
                });
                return false
            }

            if (!moved) {
                if (geometry) {
                    me.windowDragParkRecovery = {
                        ...parkRoute,
                        pendingEffect: null,
                        revision     : 1
                    };

                    await DragDrop.prototype.retryWindowDragParkRecovery.call(me, {
                        nativeHandleKey,
                        targetWindowId,
                        windowName
                    })
                } else {
                    me.windowDragParked = false
                }

                return false
            }

            return true
        } finally {
            parkRoute && DragDrop.prototype.releaseWindowDragRouteOperation.call(me, parkRoute)
        }
    }

    /**
     * @summary Re-shows the parked exact native generation at the pointer-owned global rect.
     * A resized vessel regains its exact pre-conversion outer extent before it moves back under
     * the pointer. Physical pointer-follow resumes only after strict success; refusal compensates
     * to target-cover geometry and retains the parked phase for an exact retry.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @param {Number} data.x
     * @param {Number} data.y
     * @returns {Promise<Boolean>}
     */
    async resumeWindowDrag({nativeHandleKey, targetWindowId, windowName, x, y} = {}) {
        let me = this;

        const
            parkRoute    = me.windowDragParkRoute,
            requestValid = Boolean(
                nativeHandleKey && targetWindowId && windowName &&
                Number.isFinite(x) && Number.isFinite(y)
            ),
            active = Boolean(
                requestValid && me.isWindowDragging && me.windowDragParked &&
                windowName === me.popupName &&
                (!parkRoute || (
                    parkRoute.nativeHandleKey === nativeHandleKey &&
                    parkRoute.targetWindowId === targetWindowId &&
                    parkRoute.windowName === windowName
                ))
            );

        if (!requestValid) return false;

        if (active && me.windowDragParkRecovery) {
            // Current-generation recovery owns the orphan serializer record it created. It must
            // reconcile logical parked state before predecessor-orphan routing can intercept it.
            return DragDrop.prototype.retryWindowDragParkRecovery.call(me, {
                nativeHandleKey,
                restorePosition: {x, y},
                targetWindowId,
                windowName
            })
        }

        if (
            !active &&
            nativeHandleKey && targetWindowId && windowName &&
            Number.isFinite(x) && Number.isFinite(y) &&
            DragDrop.prototype.hasWindowDragOrphanRecovery.call(me, {
                nativeHandleKey,
                targetWindowId,
                windowName
            })
        ) {
            const
                key      = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
                recovery = me.windowDragOrphanRecoveries.get(key);

            DragDrop.prototype.retainWindowDragOrphanRecovery.call(me, {
                nativeHandleKey,
                park         : recovery.park,
                pendingEffect: recovery.pendingEffect,
                resize       : recovery.resize,
                restore      : {...recovery.restore, x, y},
                sourceRoute  : recovery.sourceRoute,
                targetWindowId,
                windowName
            });

            return DragDrop.prototype.retryWindowDragOrphanRecovery.call(me, {
                nativeHandleKey,
                targetWindowId,
                windowName
            })
        }

        if (!active) return false;

        const
            generation = me.windowDragGeneration,
            geometry   = me.windowDragParkedGeometry,
            route      = {nativeHandleKey, targetWindowId},
            moveTo     = async rect => {
                try {
                    return await Neo.Main.windowNativeMoveTo({...route, x: rect.x, y: rect.y}) === true
                } catch {
                    return false
                }
            },
            readGeometry = async() => {
                try {
                    return await Neo.Main.windowNativeGetGeometry(route)
                } catch {
                    return null
                }
            },
            resizeTo     = async size => {
                try {
                    return await Neo.Main.windowNativeResizeTo({
                        ...route,
                        height: size.height,
                        width : size.width
                    }) === true
                } catch {
                    return false
                }
            };

        if (parkRoute?.retired) return false;

        const routeCurrent = () => (
            generation === me.windowDragGeneration &&
            me.isWindowDragging &&
            parkRoute?.retired !== true
        );

        parkRoute && (parkRoute.operationCount = (parkRoute.operationCount || 0) + 1);

        const runResumeEffect = async effect => {
            const pending = effect();

            parkRoute && (parkRoute.pendingEffect = pending);

            const result = await pending;

            parkRoute?.pendingEffect === pending && (parkRoute.pendingEffect = null);

            return result
        };

        try {
            if (parkRoute) {
                parkRoute.restore  = {...parkRoute.restore, x, y};
                parkRoute.revision = (parkRoute.revision || 0) + 1
            }

            if (geometry?.resize && !await runResumeEffect(() => resizeTo(geometry.restore))) {
                if (routeCurrent()) {
                    await runResumeEffect(() => resizeTo(geometry.park))
                }

                if (!routeCurrent()) {
                    await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                        geometry: {
                            park   : geometry.park,
                            resize : geometry.resize,
                            restore: {...geometry.restore, x, y}
                        },
                        nativeHandleKey,
                        routeRecord: parkRoute,
                        targetWindowId,
                        windowName
                    });
                    return false
                }

                if (routeCurrent()) {
                    me.windowDragParkRecovery = {
                        generation,
                        nativeHandleKey,
                        park   : {...geometry.park},
                        resize : geometry.resize,
                        restore: {...geometry.restore, x, y},
                        targetWindowId,
                        windowName
                    }
                }

                return false
            }

            if (!routeCurrent()) {
                geometry && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                    geometry: {
                        park   : geometry.park,
                        resize : geometry.resize,
                        restore: {...geometry.restore, x, y}
                    },
                    nativeHandleKey,
                    routeRecord: parkRoute,
                    targetWindowId,
                    windowName
                });
                return false
            }

            let admitted = await runResumeEffect(() => moveTo({x, y}));

            if (!routeCurrent()) {
                geometry && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                    geometry: {
                        park   : geometry.park,
                        resize : geometry.resize,
                        restore: {...geometry.restore, x, y}
                    },
                    nativeHandleKey,
                    routeRecord: parkRoute,
                    targetWindowId,
                    windowName
                });
                return false
            }

            if (!admitted) {
                const
                    actual     = await readGeometry(),
                    oldOffsetX = me.offsetX || 0,
                    oldOffsetY = me.offsetY || 0,
                    pointerX   = x + oldOffsetX,
                    pointerY   = y + oldOffsetY,
                    measurable = ['height', 'width', 'x', 'y']
                        .every(key => Number.isFinite(actual?.[key]))
                        && actual.height > 0 && actual.width > 0,
                    extentRestored = Boolean(geometry) && measurable && (
                        Math.abs(actual.height - geometry.restore.height) <= 1 &&
                        Math.abs(actual.width  - geometry.restore.width)  <= 1
                    ),
                    pointerInside = extentRestored &&
                        pointerX >= actual.x && pointerX <= actual.x + actual.width &&
                        pointerY >= actual.y && pointerY <= actual.y + actual.height;

                // Chrome clamps a restored popup at display edges and truthfully refuses the exact
                // requested origin. The exact native route, restored outer extent, and held pointer
                // still inside that observed frame are sufficient physical admission. Rebase the
                // grab offset to the platform-authored origin so the very next move follows 1:1.
                if (routeCurrent() && pointerInside) {
                    me.offsetX = pointerX - actual.x;
                    me.offsetY = pointerY - actual.y;
                    admitted   = true
                }
            }

            if (!admitted) {
                if (geometry) {
                    const sizeParked = !geometry.resize || await runResumeEffect(
                        () => resizeTo(geometry.park)
                    );

                    if (sizeParked && routeCurrent()) {
                        await runResumeEffect(() => moveTo(geometry.park))
                    }
                }

                if (!routeCurrent()) {
                    geometry && await DragDrop.prototype.recoverInvalidatedWindowDragPark.call(me, {
                        geometry: {
                            park   : geometry.park,
                            resize : geometry.resize,
                            restore: {...geometry.restore, x, y}
                        },
                        nativeHandleKey,
                        routeRecord: parkRoute,
                        targetWindowId,
                        windowName
                    });
                    return false
                }

                if (routeCurrent()) {
                    me.windowDragParkRecovery = {
                        generation,
                        nativeHandleKey,
                        park   : geometry?.park && {...geometry.park},
                        resize : geometry?.resize === true,
                        restore: {
                            ...(geometry?.restore || {}),
                            x,
                            y
                        },
                        targetWindowId,
                        windowName
                    }
                }

                return false
            }

            me.windowDragParked         = false;
            me.windowDragParkedGeometry = null;
            me.windowDragParkRoute      = null;
            me.windowDragParkRecovery   = null;

            return admitted
        } finally {
            parkRoute && DragDrop.prototype.releaseWindowDragRouteOperation.call(me, parkRoute)
        }
    }

    /**
     * @summary Compensates a physical park effect which settled after its logical gesture died.
     *
     * The record is installed before compensation starts so another reset cannot erase the only
     * exact route/rect. Strict success clears it; refusal leaves the worker terminal or a later
     * fresh proposal an idempotent retry without reviving predecessor logical state.
     * @param {Object} data
     * @param {Object} data.geometry
     * @param {String} data.nativeHandleKey
     * @param {Object|null} [data.routeRecord=null]
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async recoverInvalidatedWindowDragPark({
        geometry,
        nativeHandleKey,
        routeRecord=null,
        targetWindowId,
        windowName
    } = {}) {
        let me = this;

        if (!DragDrop.prototype.retainWindowDragOrphanRecovery.call(me, {
            advance    : false,
            nativeHandleKey,
            park       : geometry?.park,
            resize     : geometry?.resize === true,
            restore    : geometry?.restore,
            sourceRoute: routeRecord,
            targetWindowId,
            windowName
        })) return false;

        return DragDrop.prototype.retryWindowDragOrphanRecovery.call(me, {
            nativeHandleKey,
            targetWindowId,
            windowName
        })
    }

    /**
     * @summary Promotes active exact recovery into reset-surviving, route-keyed ownership.
     * @param {Object} data
     * @param {Boolean} [data.advance=true] Current pointer/terminal proposals may advance the
     *     desired rect; stale completions only ensure the record exists.
     * @param {String} data.nativeHandleKey
     * @param {Object|null} [data.park=null] Exact cover geometry used to compensate a refused
     *     full-size restore.
     * @param {Promise|null} [data.pendingEffect=null]
     * @param {Boolean} [data.resize=false]
     * @param {Object} data.restore
     * @param {Object|null} [data.sourceRoute=null]
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Object|null}
     * @protected
     */
    retainWindowDragOrphanRecovery({
        advance=true,
        nativeHandleKey,
        park=null,
        pendingEffect=null,
        resize=false,
        restore,
        sourceRoute=null,
        targetWindowId,
        windowName
    } = {}) {
        let me = this;

        if (
            !nativeHandleKey || !targetWindowId || !windowName ||
            !Number.isFinite(restore?.x) || !Number.isFinite(restore?.y) ||
            (resize && (
                !Number.isFinite(restore.width) || restore.width <= 0 ||
                !Number.isFinite(restore.height) || restore.height <= 0 ||
                !Number.isFinite(park?.width) || park.width <= 0 ||
                !Number.isFinite(park?.height) || park.height <= 0 ||
                !Number.isFinite(park?.x) || !Number.isFinite(park?.y)
            ))
        ) {
            return null
        }

        const
            key        = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
            recoveries = me.windowDragOrphanRecoveries ||= new Map(),
            recovery   = recoveries.get(key);

        if (recovery) {
            if (recovery.retired) return null;

            pendingEffect && (recovery.pendingEffect = pendingEffect);
            park && (recovery.park ??= {...park});
            sourceRoute && (recovery.sourceRoute ??= sourceRoute);

            if (!advance && resize && !recovery.resize) {
                recovery.restore = {
                    ...restore,
                    x: recovery.restore.x,
                    y: recovery.restore.y
                }
            } else if (advance) {
                recovery.restore = {...restore};
                recovery.revision++
            }

            recovery.resize ||= resize
        } else {
            if (sourceRoute?.retired) return null;

            recoveries.set(key, {
                key,
                nativeHandleKey,
                park    : park && {...park},
                pendingEffect,
                promise : null,
                resize,
                retired : false,
                restore : {...restore},
                revision: 1,
                sourceRoute,
                targetWindowId,
                windowName
            })
        }

        return recoveries.get(key)
    }

    /**
     * @summary Retries one reset-surviving exact physical restore without reviving logical drag state.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async retryWindowDragOrphanRecovery({nativeHandleKey, targetWindowId, windowName} = {}) {
        let me         = this,
            recoveries = me.windowDragOrphanRecoveries,
            key        = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
            recovery   = recoveries?.get(key);

        if (!recovery || recovery.retired) return false;
        if (recovery.promise) return recovery.promise;

        const
            route    = {nativeHandleKey, targetWindowId},
            resizeTo = async size => {
                try {
                    return await Neo.Main.windowNativeResizeTo({
                        ...route,
                        height: size.height,
                        width : size.width
                    }) === true
                } catch {
                    return false
                }
            },
            moveTo = async rect => {
                try {
                    return await Neo.Main.windowNativeMoveTo({...route, x: rect.x, y: rect.y}) === true
                } catch {
                    return false
                }
            };

        let retryPromise;

        retryPromise = (async() => {
            while (recoveries.get(key) === recovery && !recovery.retired) {
                if (recovery.pendingEffect) {
                    const
                        pending         = recovery.pendingEffect,
                        pendingRevision = recovery.revision;

                    await Promise.resolve(pending).catch(() => false);

                    if (recoveries.get(key) !== recovery || recovery.retired) return false;

                    recovery.pendingEffect === pending && (recovery.pendingEffect = null)

                    if (pendingRevision !== recovery.revision) continue
                }

                const
                    park         = recovery.park && {...recovery.park},
                    restore      = {...recovery.restore},
                    revision     = recovery.revision,
                    sizeRestored = !recovery.resize || await resizeTo(restore);

                if (recoveries.get(key) !== recovery || recovery.retired) return false;
                if (!sizeRestored) return false;
                if (revision !== recovery.revision) continue;

                const positionRestored = await moveTo(restore);

                if (recoveries.get(key) !== recovery || recovery.retired) return false;
                if (!positionRestored) {
                    if (recovery.resize) {
                        const coverSizeRestored = park && await resizeTo(park);

                        if (recoveries.get(key) !== recovery || recovery.retired) return false;
                        if (!coverSizeRestored) return false;

                        const coverPositionRestored = await moveTo(park);

                        if (recoveries.get(key) !== recovery || recovery.retired) return false;
                        if (!coverPositionRestored) return false
                    }

                    return false
                }

                // A newer pointer-owned rect landed while this exact route was restoring. Serialize
                // one more attempt; the stale success cannot clear the advanced recovery revision.
                if (revision !== recovery.revision) continue;

                recoveries.delete(key);
                recoveries.size || (me.windowDragOrphanRecoveries = null);

                return true
            }

            return false
        })().finally(() => {
            recoveries.get(key) === recovery && (recovery.promise = null)
            DragDrop.prototype.cleanupRetiredWindowDragOrphanRecovery.call(me, recovery)
        });

        recovery.promise = retryPromise;

        return retryPromise
    }

    /**
     * @summary Reports whether one exact route still owns reset-surviving physical recovery.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Boolean}
     */
    hasWindowDragOrphanRecovery({nativeHandleKey, targetWindowId, windowName} = {}) {
        return this.windowDragOrphanRecoveries?.has(
            JSON.stringify([nativeHandleKey, targetWindowId, windowName])
        ) === true
    }

    /**
     * @summary Retires one matching orphan only after another owner proves the exact restore.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Boolean}
     */
    acknowledgeWindowDragOrphanRecovery({nativeHandleKey, targetWindowId, windowName} = {}) {
        let me         = this,
            recoveries = me.windowDragOrphanRecoveries,
            key        = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
            recovery   = recoveries?.get(key);

        if (
            !recovery || recovery.retired || recovery.promise || recovery.pendingEffect ||
            (recovery.sourceRoute?.operationCount || 0) > 0
        ) return false;

        recoveries.delete(key);
        recoveries.size || (me.windowDragOrphanRecoveries = null);

        return true
    }

    /**
     * @summary Retires one matching recovery after strict close invalidates its exact handle.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Boolean}
     */
    retireWindowDragOrphanRecovery({nativeHandleKey, targetWindowId, windowName} = {}) {
        let me           = this,
            recoveries   = me.windowDragOrphanRecoveries,
            key          = JSON.stringify([nativeHandleKey, targetWindowId, windowName]),
            route        = me.windowDragParkRoute,
            active       = me.windowDragParkRecovery,
            routeMatches = record => (
                record?.nativeHandleKey === nativeHandleKey &&
                record?.targetWindowId === targetWindowId &&
                record?.windowName === windowName
            ),
            routeRecord = routeMatches(route) ? route : null,
            recovery    = recoveries?.get(key);

        routeRecord && (routeRecord.retired = true);
        routeMatches(active) && (active.retired = true);

        if (!recovery && routeRecord && (routeRecord.operationCount || 0) > 0) {
            recoveries = me.windowDragOrphanRecoveries ||= new Map();
            recovery   = {
                key,
                nativeHandleKey,
                park         : routeRecord.park && {...routeRecord.park},
                pendingEffect: routeRecord.pendingEffect,
                promise      : null,
                resize       : routeRecord.resize,
                restore      : {...routeRecord.restore},
                retired      : true,
                revision     : routeRecord.revision || 1,
                sourceRoute  : routeRecord,
                targetWindowId,
                windowName
            };

            recoveries.set(key, recovery)
        } else if (recovery) {
            recovery.pendingEffect ||= routeRecord?.pendingEffect || null;
            recovery.retired         = true;
            recovery.revision++;
            recovery.sourceRoute   ??= routeRecord
        }

        recovery && DragDrop.prototype.cleanupRetiredWindowDragOrphanRecovery.call(me, recovery);

        return Boolean(recovery || routeRecord || routeMatches(active))
    }

    /**
     * @summary Retries the exact same-generation source restoration after platform compensation
     * refused. Success atomically clears the parked/recovery phase; any partial refusal retains the
     * route and full rect so the next park/resume proposal remains actionable.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {{x:Number,y:Number}|null} [data.restorePosition=null] Latest pointer-owned resume
     *     position. Park retries omit it and preserve the captured pre-conversion origin.
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @returns {Promise<Boolean>}
     * @protected
     */
    async retryWindowDragParkRecovery({
        nativeHandleKey,
        restorePosition=null,
        targetWindowId,
        windowName
    } = {}) {
        let me       = this,
            recovery = me.windowDragParkRecovery;

        if (
            !me.isWindowDragging || !me.windowDragParked || !recovery ||
            recovery.retired || me.windowDragParkRoute?.retired ||
            recovery.generation !== me.windowDragGeneration ||
            recovery.nativeHandleKey !== nativeHandleKey ||
            recovery.targetWindowId !== targetWindowId ||
            recovery.windowName !== windowName ||
            !Number.isFinite(recovery.restore?.x) || !Number.isFinite(recovery.restore?.y)
        ) {
            return false
        }

        if (restorePosition) {
            if (!Number.isFinite(restorePosition.x) || !Number.isFinite(restorePosition.y)) {
                return false
            }

            recovery.restore  = {...recovery.restore, ...restorePosition};
            recovery.revision = (recovery.revision || 0) + 1
        }

        const
            generation = me.windowDragGeneration,
            revision   = recovery.revision || 0;

        DragDrop.prototype.retainWindowDragOrphanRecovery.call(me, {
            nativeHandleKey,
            park         : recovery.park,
            pendingEffect: recovery.pendingEffect,
            resize       : recovery.resize,
            restore      : recovery.restore,
            sourceRoute  : me.windowDragParkRoute,
            targetWindowId,
            windowName
        });

        const restored = await DragDrop.prototype.retryWindowDragOrphanRecovery.call(me, {
            nativeHandleKey,
            targetWindowId,
            windowName
        });

        if (
            restored &&
            generation === me.windowDragGeneration && me.isWindowDragging &&
            me.windowDragParkRecovery === recovery && recovery.revision === revision
        ) {
            me.windowDragParked         = false;
            me.windowDragParkedGeometry = null;
            me.windowDragParkRoute      = null;
            me.windowDragParkRecovery   = null;

            return true
        }

        return false
    }

    /**
     * @param {Object} data
     * @param {String} data.popupHeight
     * @param {String} data.popupName
     * @param {String} data.popupWidth
     */
    startWindowDrag({popupHeight, popupName, popupWidth}) {
        let me = this;

        DragDrop.prototype.promoteWindowDragParkRecovery.call(me);

        Object.assign(me, {
            isWindowDragging        : true,
            popupHeight,
            popupName,
            popupWidth,
            windowDragGeneration    : (me.windowDragGeneration || 0) + 1,
            windowDragMovePromises  : new Set(),
            windowDragParked        : false,
            windowDragParkedGeometry: null,
            windowDragParkRoute     : null,
            windowDragParkRecovery  : null
        })
    }
}

export default Neo.setupClass(DragDrop);
