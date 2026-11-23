import DragZone from '../draggable/DragZone.mjs';

/**
 * @summary A floating desktop window's header drag. The source keeps the pointer through popup admission,
 * return and release. A popup can change the proxy's size, so each overlap comparison uses one size for
 * both pointer positions.
 * @class Neo.desktop.WindowDragZone
 * @extends Neo.draggable.DragZone
 */
class WindowDragZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.desktop.WindowDragZone'
         * @protected
         */
        className: 'Neo.desktop.WindowDragZone'
    }

    /**
     * @summary The fraction of a window at a source-viewport point that the workspace contains.
     * @param {Object} boundary The workspace's client rectangle
     * @param {Number} x Left in source client coordinates
     * @param {Number} y Top in source client coordinates
     * @param {Object} size Window width and height in CSS pixels
     * @param {Boolean} [returning=false] A larger vessel returns by covering the workspace
     * @returns {Number}
     */
    static coverage(boundary, x, y, {width, height}, returning=false) {
        const overlapWidth  = Math.max(0, Math.min(x + width, boundary.right) - Math.max(x, boundary.left)),
              overlapHeight = Math.max(0, Math.min(y + height, boundary.bottom) - Math.max(y, boundary.top)),
              maximumArea   = returning
                  ? Math.min(width, boundary.right - boundary.left) * Math.min(height, boundary.bottom - boundary.top)
                  : width * height;
        return maximumArea > 0 ? overlapWidth * overlapHeight / maximumArea : 0
    }

    /**
     * @summary Ends any outstanding source gesture before removing the zone's registration.
     * @param {...*} args
     */
    destroy(...args) {
        this.restoreSource();
        super.destroy(...args)
    }

    /**
     * @summary Remembers the original dialog size and grab point before the proxy is mounted.
     * @param {Object} data
     */
    async dragStart(data) {
        let me            = this,
            rect          = me.getDragElementRect(data),
            viewportWidth = data.path.find(node => node.tagName === 'html')?.clientWidth;

        if (me.gesture) me.onDragCancel({});
        const gesture = me.gesture = {
            abort  : new AbortController(),
            // The desktop's phone layout fills its workspace at this breakpoint (desktop/AppWindow.css).
            clamped: !(viewportWidth > 600),
            id     : data.gestureId,
            offsetX: data.clientX - rect.left,
            offsetY: data.clientY - rect.top,
            rect,
            x      : rect.left,
            y      : rect.top
        };

        await super.dragStart(data, gesture.abort.signal);
        if (me.gesture === gesture && gesture.pendingMove) me.dragMove(gesture.pendingMove)
    }

    /**
     * @summary Aligns the native proxy with the dialog root's grab point rather than the smaller header.
     * @returns {Object}
     */
    getMainThreadConfigs() {
        const {clamped, id: gestureId, offsetX, offsetY, rect} = this.gesture;
        return {...super.getMainThreadConfigs(), allowOverdrag: !clamped, dragProxyRect: rect, gestureId, offsetX, offsetY}
    }

    /**
     * @summary Samples the held pointer in the source viewport. A resize at a stationary pointer cannot
     * count as a return, and a real inward step can return immediately even if the new size starts above 60%.
     * @param {Object} data
     */
    dragMove(data) {
        let me = this, {gesture, boundaryContainerRect: boundary} = me;

        if (!gesture) return;
        if (gesture.clamped) return super.dragMove(data);
        if (!boundary || !me.dragProxy || gesture.retiring) {
            gesture.pendingMove = data;
            return
        }
        gesture.pendingMove = null;
        super.dragMove(data);

        const x         = data.clientX - gesture.offsetX,
              y         = data.clientY - gesture.offsetY,
              previousX = gesture.x,
              previousY = gesture.y,
              size      = (gesture.vessel && me.owner.tearOut.currentSize) || gesture.vessel || gesture.rect,
              returning = Boolean(gesture.opening || gesture.vessel),
              coverage  = WindowDragZone.coverage,
              before    = coverage(boundary, previousX, previousY, size, returning),
              after     = coverage(boundary, x, y, size, returning);

        if (x === previousX && y === previousY) return;
        gesture.x = x;
        gesture.y = y;

        if (returning && after > 0.6) {
            // A smaller popup may already be fully inside. Its original footprint still measures inward motion.
            const inward = after > before || (after === 1 &&
                coverage(boundary, x, y, gesture.rect) > coverage(boundary, previousX, previousY, gesture.rect));
            if (inward) me.returnDuringDrag(gesture)
        } else if (!returning && after < 0.5 && after < before) {
            me.openVessel(gesture, data)
        }
    }

    /**
     * @summary Opens a vessel at the screen-space grab point. Only the still-held crossing can start native motion.
     * @param {Object} gesture The held source gesture
     * @param {Object} data Pointer frame
     */
    async openVessel(gesture, data) {
        const me      = this, {height, width} = gesture.rect,
              x       = data.screenX - gesture.offsetX, y = data.screenY - gesture.offsetY,
              opening = gesture.opening = {};
        let vessel;

        try {
            vessel = await me.owner.tearOut.open({gestureId: gesture.id, rect: {x, y, left: x, top: y, width, height}})
        } catch {}

        if (me.gesture !== gesture || gesture.opening !== opening) return;
        gesture.opening = null;
        if (!vessel) {
            gesture.clamped = true;
            Neo.main.addon.DragDrop.setConfigs({gestureId: gesture.id, allowOverdrag: false, windowId: me.windowId});
            me.dragProxy.style = {...me.dragProxy.style, ...me.workspacePosition(gesture.x, gesture.y, gesture.rect)};
            return
        }

        const size = gesture.vessel = {width: vessel.popupWidth, height: vessel.popupHeight};
        me.setSourceVisible(false);
        me.dragProxy.style = {...me.dragProxy.style, opacity: 0};
        let engaged;
        try {
            engaged = await Neo.main.addon.DragDrop.startWindowDrag({...vessel, gestureId: gesture.id, windowId: me.windowId})
        } catch {
            engaged = false
        }
        if (engaged === false && me.gesture === gesture && gesture.vessel === size) me.onDragCancel({})
    }

    /**
     * @summary Resumes the original source drag, including after re-entry while admission was still pending.
     * @param {Object} gesture The held source gesture
     */
    returnDuringDrag(gesture) {
        const me = this;
        gesture.opening = null;
        gesture.vessel = null;
        gesture.retiring = me.owner.tearOut.returnToDesktop();
        Neo.main.addon.DragDrop.setConfigs({gestureId: gesture.id, isWindowDragging: false, windowId: me.windowId});
        me.setSourceVisible(true);
        me.dragProxy.style = {...me.dragProxy.style, left: `${gesture.x}px`, top: `${gesture.y}px`, opacity: 1};

        gesture.retiring.then(closed => {
            if (me.gesture !== gesture) return;
            gesture.retiring = null;

            if (!closed) {
                gesture.clamped = true;
                Neo.main.addon.DragDrop.setConfigs({gestureId: gesture.id, allowOverdrag: false, windowId: me.windowId})
            } else if (gesture.pendingMove) {
                me.dragMove(gesture.pendingMove)
            }
        })
    }

    /**
     * @summary Ends the source drag exactly once. An admitted popup stays open on release; a pending or refused
     * popup leaves the dialog reachable in its workspace.
     * @param {Object} data
     */
    async finishGesture(data) {
        let me = this, {gesture, owner} = me, style = owner.style;
        if (!gesture) return;

        me.gesture = null;
        gesture.abort.abort();
        if (gesture.vessel) {
            owner.tearOut.commit()
        } else {
            if (gesture.opening) owner.tearOut.returnToDesktop();
            const live = owner.boundaryContainerId
                ? await owner.getDomRect(owner.boundaryContainerId).catch(() => null)
                : null;

            if (me.isDestroyed || owner.isDestroyed || me.gesture) return;

            const boundary = live?.width > 0 && live?.height > 0 ? live : me.boundaryContainerRect;
            if (boundary) {
                const width    = Math.min(gesture.rect.width, boundary.right - boundary.left),
                      height   = Math.min(gesture.rect.height, boundary.bottom - boundary.top),
                      position = me.workspacePosition(data.clientX - gesture.offsetX, data.clientY - gesture.offsetY, {width, height}, boundary);
                style = {...owner.style, ...position, height: `${height}px`, width: `${width}px`, transform: 'none'}
            }
        }
        owner.style = {...style, opacity: 1};
        owner.isDragging = false;
        me.dragEnd(data);
        if (!gesture.vessel) owner.focus(owner.id, true)
    }

    /**
     * @summary Cancels pending admission or an admitted popup without committing an outside drop.
     * @param {Object} data
     */
    onDragCancel(data) {
        if (!this.gesture) return;
        this.cancelledAt = data?.timeStamp;
        this.owner.tearOut.returnToDesktop();
        this.restoreSource(data)
    }

    /**
     * @summary Restores the source after cancel, external close or manager revocation.
     * @param {Object} [data]
     */
    restoreSource(data={}) {
        let me = this, {gesture} = me;
        me.setSourceVisible(true);
        if (!gesture) return;

        me.gesture = null;
        gesture.abort.abort();
        if (gesture.vessel) {
            Neo.main.addon.DragDrop.setConfigs({gestureId: gesture.id, isWindowDragging: false, windowId: me.windowId})
        }
        me.owner.isDragging = false;
        me.owner.style = {...me.owner.style, opacity: 1};
        super.onDragCancel(data)
    }

    /**
     * @summary Keeps the source dialog mounted and its task open while the popup displays its content.
     * @param {Boolean} visible
     */
    setSourceVisible(visible) {
        this.owner.setTearOutSourceVisible(visible)
    }

    /**
     * @summary Clamps the whole dialog to its workspace for a local release or a refused popup.
     * @param {Number} x
     * @param {Number} y
     * @param {Object} size
     * @param {Object} [boundary=this.boundaryContainerRect]
     * @returns {{left: String, top: String}}
     */
    workspacePosition(x, y, {width, height}, boundary=this.boundaryContainerRect) {
        return {
            left: `${Math.max(boundary.left, Math.min(x, boundary.right - width))}px`,
            top : `${Math.max(boundary.top, Math.min(y, boundary.bottom - height))}px`
        }
    }
}

export default Neo.setupClass(WindowDragZone);
