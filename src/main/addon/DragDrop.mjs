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
                'parkWindowDrag',
                'resumeWindowDrag',
                'setConfigs',
                'setDragProxyElement',
                'startWindowDrag'
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
            windowDragGeneration  : (me.windowDragGeneration || 0) + 1,
            windowDragMovePromises: new Set(),
            windowDragParked      : false,
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

        Object.assign(me, {
            dragCancelled: false,
            dragProxyRect: rect,
            offsetX      : event.detail.clientX - rect.left,
            offsetY      : event.detail.clientY - rect.top
        });

        DomEvents.sendMessageToApp({
            ...this.getEventData(event),
            type: 'drag:start'
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
    setConfigs(data) {
        let me                    = this,
            {boundaryContainerId} = data,
            node, rects;

        delete data.appName;
        delete data.windowId;

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
     * frames. A false/throwing native move re-enables pointer-follow and refuses admission; a
     * reset/new start invalidates the completion without touching successor state.
     * @param {Object} data
     * @param {String} data.nativeHandleKey
     * @param {String} data.targetWindowId
     * @param {String} data.windowName
     * @param {Number} data.x
     * @param {Number} data.y
     * @returns {Promise<Boolean>}
     */
    async parkWindowDrag({nativeHandleKey, targetWindowId, windowName, x, y} = {}) {
        let me = this;

        if (
            !me.isWindowDragging || me.windowDragParked || windowName !== me.popupName ||
            !nativeHandleKey || !targetWindowId || !Number.isFinite(x) || !Number.isFinite(y)
        ) {
            return false
        }

        const generation = me.windowDragGeneration;

        me.windowDragParked = true;

        await Promise.allSettled([...(me.windowDragMovePromises || [])]);

        if (generation !== me.windowDragGeneration || !me.isWindowDragging || !me.windowDragParked) {
            return false
        }

        let admitted = false;

        try {
            admitted = await Neo.Main.windowNativeMoveTo({nativeHandleKey, targetWindowId, x, y}) === true
        } catch {
            admitted = false
        }

        if (generation !== me.windowDragGeneration || !me.isWindowDragging) {
            return false
        }

        admitted || (me.windowDragParked = false);

        return admitted
    }

    /**
     * @summary Re-shows the parked exact native generation at the pointer-owned global rect.
     * Physical pointer-follow resumes only after strict success; refusal retains the parked phase
     * so the source owner can retry without losing its sole recoverable handle.
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

        if (
            !me.isWindowDragging || !me.windowDragParked || windowName !== me.popupName ||
            !nativeHandleKey || !targetWindowId || !Number.isFinite(x) || !Number.isFinite(y)
        ) {
            return false
        }

        const generation = me.windowDragGeneration;

        let admitted = false;

        try {
            admitted = await Neo.Main.windowNativeMoveTo({nativeHandleKey, targetWindowId, x, y}) === true
        } catch {
            admitted = false
        }

        if (generation !== me.windowDragGeneration || !me.isWindowDragging) {
            return false
        }

        admitted && (me.windowDragParked = false);

        return admitted
    }

    /**
     * @param {Object} data
     * @param {String} data.popupHeight
     * @param {String} data.popupName
     * @param {String} data.popupWidth
     */
    startWindowDrag({popupHeight, popupName, popupWidth}) {
        let me = this;

        Object.assign(me, {
            isWindowDragging      : true,
            popupHeight,
            popupName,
            popupWidth,
            windowDragGeneration  : (me.windowDragGeneration || 0) + 1,
            windowDragMovePromises: new Set(),
            windowDragParked      : false
        })
    }
}

export default Neo.setupClass(DragDrop);
