import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomEvents from '../DomEvents.mjs';
import Resize    from '../draggable/Resize.mjs';
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
                'cancelDrag',
                'registerZone',
                'setConfigs',
                'setDragProxyElement',
                'settleResize',
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
     * Gesture-local direct-resize controller.
     * @member {Neo.main.draggable.Resize} dragResize
     * @protected
     */
    dragResize = new Resize()

    /**
     * The exact Mouse sensor instance this Main realm created. Gesture automation reads its live
     * reactive threshold values; the class defaults are not runtime authority.
     * @member {Neo.main.draggable.sensor.Mouse|null} mouseSensor=null
     * @protected
     */
    mouseSensor = null

    /**
     * Resolves when the optional Mouse sensor import and construction complete.
     * @member {Promise<Neo.main.draggable.sensor.Mouse>|null} mouseSensorPromise=null
     * @protected
     */
    mouseSensorPromise = null

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
            me.mouseSensorPromise = import('../draggable/sensor/Mouse.mjs').then(module => {
                me.mouseSensor = Neo.create({module: module.default});

                return me.mouseSensor
            });

            imports.push(me.mouseSensorPromise)
        }

        if (Neo.config.hasTouchEvents) {
            imports.push(import('../draggable/sensor/Touch.mjs').then(module => Neo.create({module: module.default})))
        }

        Promise.all(imports)
    }

    /**
     * @summary Returns this Main realm's exact live Mouse sensor, waiting for its lazy construction
     * when necessary. A caller must fail closed on `null`; copying class defaults would stop
     * observing per-instance overrides.
     * @returns {Promise<Neo.main.draggable.sensor.Mouse|null>}
     */
    async getMouseSensor() {
        return this.mouseSensor || await this.mouseSensorPromise || null
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
        let path   = this.resolveSensorPath(event),
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
                isDrop      = me.pathIncludesDropZone(parsedEvent.targetPath),
                resize      = me.dragResize?.finish(parsedEvent);

            DomEvents.sendMessageToApp({
                ...parsedEvent,
                ...(resize ? {
                    resizeAxis      : resize.axis,
                    resizeGeneration: resize.generation,
                    resizeSize      : resize.size,
                    resizeTargetId  : resize.targetId
                } : {}),
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
     * @summary Cancels the gesture this window owns, as Escape at the owner does.
     * One `drag:cancel` goes to the active worker drag zone, after which native move/end events are
     * ignored until the sensor releases. Without a gesture, or once it is cancelled, nothing happens.
     * The App Worker calls it when Escape reached another window of a cross-window drag.
     * @param {Object} [data] Fields the `drag:cancel` carries: Escape's keyboard data at the owner, or
     * the App Worker's routing `windowId`
     * @returns {Boolean} true when this call cancelled the gesture
     */
    cancelDrag(data) {
        let me = this;

        if (me.dragZoneId && !me.dragCancelled) {
            me.dragCancelled = true;
            me.dragResize?.cancel();

            DomEvents.sendMessageToApp({...data, dragZoneId: me.dragZoneId, type: 'drag:cancel'});
            return true
        }

        return false
    }

    /**
     * @summary Captures Escape wherever it lands, independent of which dragged node still owns focus.
     * The gesture owner cancels its drag once, routed directly to the active worker drag zone; subsequent
     * native move/end events are ignored until the sensor releases and resets the main-thread session.
     * A window without a gesture of its own (a cross-window drag's vessel or target holds the focus
     * there) asks the App Worker to cancel one elsewhere, and leaves the key's default to its own UI.
     * @param {KeyboardEvent} event
     */
    onKeyDown(event) {
        let me = this;

        if (event.key === 'Escape') {
            let data = DomEvents.getKeyboardEventData(event);

            if (!me.dragZoneId) {
                DomEvents.sendMessageToApp({...data, crossWindow: true, type: 'drag:cancel'})
            } else if (me.cancelDrag(data)) {
                event.preventDefault()
            }
        }
    }

    /**
     * Restores the main-thread drag owner to its between-gestures baseline.
     * @protected
     */
    resetDragState() {
        let me = this;

        // Successful gestures already called dragResize.finish(). Any state left here is interrupted
        // preview authority and must be restored before the gesture identity is cleared.
        me.dragResize?.cancel();

        // Idempotent second release site for the sensor-side gesture selection guard — NOT an
        // off-document-release fallback: resetDragState() is only reached downstream of the
        // sensor's own `drag:end`. The Mouse sensor owns the physical mousedown→release bracket,
        // including lost-release recovery on its own move stream; this line just keeps the two
        // layers from drifting should that bracket's semantics ever change.
        // Guarded at the globalThis root: bare test harnesses may stub `document` without a
        // body/classList — or provide no `document` at all (a bare `document` reference would
        // throw ReferenceError there before the optional chain can engage).
        globalThis.document?.body?.classList?.remove('neo-drag-active');

        Object.assign(me, {
            alwaysFireDragMove    : false,
            bodyCursorStyle       : null,
            boundaryContainerRect : null,
            dragCancelled         : false,
            dragElementRootId     : null,
            dragElementRootRect   : null,
            dragProxyCls          : 'neo-dragproxy',
            dragProxyElement      : null,
            dragZoneId            : null,
            dropZoneIdentifier    : null,
            initialScrollLeft     : 0,
            initialScrollTop      : 0,
            isWindowDragging      : false,
            moveHorizontal        : true,
            moveVertical          : true,
            popupHeight           : null,
            popupName             : null,
            popupWidth            : null,
            scrollContainerElement: null,
            scrollContainerRect   : null,
            scrollFactorLeft      : 1,
            scrollFactorTop       : 1,
            windowName            : null
        })
    }

    /**
     * @param {Event} event
     */
    onDragMove(event) {
        let me              = this,
            {originalEvent} = event.detail,
            proxyRect       = me.dragProxyRect,
            rect            = me.boundaryContainerRect,
            data, left, resizeLocally, top;

        if (me.dragCancelled) {
            return
        }

        if (me.isWindowDragging) {
            const
                x = originalEvent.screenX - (me.offsetX || 0),
                y = originalEvent.screenY - (me.offsetY || 0);

            Neo.Main.windowMoveTo({windowName: me.popupName, x, y});

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

        resizeLocally = Boolean(me.dragResize?.active);
        resizeLocally && me.dragResize.apply(event.detail);

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

        if ((!me.dragProxyElement && !resizeLocally) || me.alwaysFireDragMove) {
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
     * @summary Opens native drag and resize authority before publishing the App event.
     * @param {Event} event
     */
    onDragStart(event) {
        let me   = this,
            path = me.resolveSensorPath(event),
            rect = me.resolvePressedElement(event).getBoundingClientRect();

        // Resolve the owning zone synchronously from the event path against the zone registry.
        // Zones register eagerly at construction (registerZone) and re-register on every
        // setConfigs handshake, so even the first drag:start of a boot carries its dragZoneId —
        // closing the gesture-opening window in which every forward, and the Escape guard
        // keying on it, was zoneless by construction.
        me.dragZoneId = me.resolveDragZoneId(path);

        Object.assign(me, {
            dragCancelled: false,
            dragProxyRect: rect,
            offsetX      : event.detail.clientX - rect.left,
            offsetY      : event.detail.clientY - rect.top
        });

        // Physical resize admission is Main-owned. An App listener is delivered only after this
        // resize admission and no acknowledgement is awaited, so App cannot fence the next native
        // move. DockFlip resolves its own same-window host registry from the native path and lands
        // synchronously before Resize captures geometry. Missing addon/host/motion is a cheap no-op.
        try {
            Neo.main?.addon?.DockFlip?.landFromPath?.(path)
        } catch {/* presentation can never block direct manipulation */}

        me.dragResize?.start(path, event.detail, me.dragZoneId);

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
     * App-side drag zones register themselves at construction, so onDragStart can resolve the
     * owning zone synchronously from the event path — before any setConfigs handshake could
     * land. Idempotent per (root, zone) pair; see also setConfigs(), which re-registers.
     * @param {Object} data
     * @param {String} data.dragElementRootId
     * @param {String} data.dragZoneId
     * @param {Object|null} [data.resizeConfig]
     */
    registerZone(data) {
        if (data?.dragElementRootId && data?.dragZoneId) {
            let me = this;

            me.zoneRegistrations[data.dragElementRootId] = data.dragZoneId;
            me.dragResize?.register(data)
        }
    }

    /**
     * Settles one generation-scoped main-thread resize terminal after the App Worker accepts or
     * rejects its semantic commit.
     * @param {Object} data
     * @param {String} data.dragZoneId
     * @param {Number} data.resizeGeneration
     * @param {Boolean} [data.restore=false]
     * @param {String} data.resizeTargetId
     * @returns {Boolean}
     */
    settleResize({dragZoneId, resizeGeneration, resizeTargetId, restore=false}={}) {
        return this.dragResize?.settle({
            dragZoneId,
            generation: resizeGeneration,
            restore,
            targetId  : resizeTargetId
        }) === true
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
     * @summary The element a sensor gesture pressed, for measuring it.
     *
     * `sensor.Base#trigger` dispatches on `document` once the pressed node is no longer connected,
     * so `document` as the target means a re-render replaced that node. The connected node with its
     * id is the replacement; without one, the detached node still answers (a zero rect).
     * @param {Event} event A sensor event.
     * @returns {HTMLElement}
     * @protected
     */
    resolvePressedElement(event) {
        const
            {detail, target} = event,
            doc              = globalThis.document;

        if (target !== doc || !detail?.element) {
            return target
        }

        return (detail.element.id && doc.getElementById(detail.element.id)) || detail.element
    }

    /**
     * @summary The DOM path a sensor event describes: the dispatch path, or, when the dispatch fell
     * back to `document` because the pressed node was replaced, the press's own path from `detail`.
     * A `document` dispatch path names no element, so the zone and the App's listeners could not
     * resolve from it. In the press's path, a node a re-render replaced answers through the
     * connected node with its id, so the App measures live geometry, not a detached node's zeros.
     * @param {Event} event A sensor event.
     * @returns {Array<EventTarget>}
     * @protected
     */
    resolveSensorPath(event) {
        const
            doc  = globalThis.document,
            path = event.path || event.composedPath();

        if (path[0] !== doc || !event.detail?.path) {
            return path
        }

        return event.detail.path.map(node => (node?.isConnected === false && node.id && doc.getElementById(node.id)) || node)
    }

    /**
     * Removes a zone's registration(s). Both shapes run (never either/or): the keyed delete by
     * root id AND the sweep of every key pointing at the zone id — a wrong or stale root key
     * can never strand the zone's entries, and a zone whose root id is unknown at call time is
     * still fully removed. Teardown symmetry with registerZone is the contract.
     * @param {Object} data
     * @param {String} [data.dragElementRootId]
     * @param {String} data.dragZoneId — every registration pointing at this zone is removed
     */
    unregisterZone(data) {
        let me            = this,
            registrations = me.zoneRegistrations;

        if (data?.dragElementRootId) {
            delete registrations[data.dragElementRootId]
        }

        if (data?.dragZoneId) {
            Object.keys(registrations).forEach(key => {
                if (registrations[key] === data.dragZoneId) {
                    delete registrations[key]
                }
            })
        }

        me.dragResize?.unregister(data)
    }

    /**
     * DragZones will set these configs inside their dragStart() method.
     * The gesture-scoped keys only persist until the end of a drag OP — with one exception:
     * the `dragElementRootId → dragZoneId` pair ALSO refreshes the zone registry
     * ({@link zoneRegistrations}), which deliberately outlives the gesture (zones outlive
     * drags, and the registry is what lets the next drag:start resolve its zone synchronously).
     * @param {Object}               data
     * @param {Boolean}              data.alwaysFireDragMove
     * @param {String|String[]|null} data.boundaryContainerId
     * @param {String}               [data.dragElementRootId] refreshes the zone registry
     * @param {String}               [data.dragZoneId]       the registry value for the root id
     * @param {String|null}          data.scrollContainerId
     * @param {Number}               data.scrollFactorLeft
     * @param {Number}               data.scrollFactorTop
     * @returns {Object} return the boundaryContainerRect
     */
    setConfigs(data) {
        let me                    = this,
            {boundaryContainerId} = data,
            node, rects;

        delete data.appName;
        delete data.windowId;

        // The per-gesture handshake doubles as a registry refresh — keeps the eager
        // construction-time registration honest if a zone's root element was re-created.
        DragDrop.prototype.registerZone.call(me, data);
        delete data.resizeConfig;

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
     * @summary Opens a popup window drag: from now on every pointer frame moves the named popup,
     * and its logical frame carries the popup's extent as the proxy rect.
     * @param {Object} data
     * @param {Number} data.popupHeight
     * @param {String} data.popupName
     * @param {Number} data.popupWidth
     */
    startWindowDrag({popupHeight, popupName, popupWidth}) {
        Object.assign(this, {isWindowDragging: true, popupHeight, popupName, popupWidth})
    }
}

export default Neo.setupClass(DragDrop);
