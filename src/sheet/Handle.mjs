import Component from '../component/Base.mjs';
import DragZone  from '../draggable/DragZone.mjs';

/**
 * @summary The drag handle of a sheet: a focusable separator that resizes its `target` on the main thread while a
 * pointer drags it, then reports where and how fast the drag ended, so that its owner can settle on a snap point.
 *
 * The handle owns input, never snap state. `Neo.main.draggable.Resize` writes the target's `height` on every pointer
 * frame, inside its `min-height` and `max-height`, and measures the release velocity; App sees no frame in between.
 * On release the handle fires `release` with that height and velocity. The owner resolves the snap point, for
 * example with {@link Neo.sheet.Handle.resolveSnapIndex}, and calls {@link #settle}. A cancelled drag is restored on
 * Main at once and fires `cancel`.
 *
 * The keyboard follows the WAI-ARIA window splitter pattern: Arrow Up and Arrow Down fire `step` with `delta` 1 or -1,
 * Home and End fire `step` with `to` set to `'first'` or `'last'`. The owner keeps `valueMax` and `valueNow` current.
 *
 * @example
 * {
 *     module   : Handle,
 *     listeners: {release: 'up.onHandleRelease', step: 'up.onHandleStep'},
 *     target   : 'my-sheet' // the component whose height a drag resizes, or its id
 * }
 * @class Neo.sheet.Handle
 * @extends Neo.component.Base
 */
class Handle extends Component {
    static config = {
        /**
         * @member {String} className='Neo.sheet.Handle'
         * @protected
         */
        className: 'Neo.sheet.Handle',
        /**
         * @member {String} ntype='sheet-handle'
         * @protected
         */
        ntype: 'sheet-handle',
        /**
         * The accessible name of the separator.
         * @member {String} ariaLabel_
         * @default 'Sheet height'
         * @reactive
         */
        ariaLabel_: 'Sheet height',
        /**
         * `neo-draggable` lets the main-thread pointer sensor claim a press on the handle.
         * @member {String[]} baseCls=['neo-sheet-handle','neo-draggable']
         * @protected
         */
        baseCls: ['neo-sheet-handle', 'neo-draggable'],
        /**
         * @member {Object} keys
         * @protected
         */
        keys: {
            Down: 'onArrowDown',
            End : 'onEnd',
            Home: 'onHome',
            Up  : 'onArrowUp'
        },
        /**
         * @member {String} role='separator'
         * @protected
         */
        role: 'separator',
        /**
         * The component whose height a drag resizes, or its id, usually the sheet that holds this handle.
         * @member {Neo.component.Base|String|null} target_=null
         * @reactive
         */
        target_: null,
        /**
         * The highest position the owner offers, projected as `aria-valuemax`. The lowest is always 0.
         * @member {Number} valueMax_=0
         * @reactive
         */
        valueMax_: 0,
        /**
         * The owner's current position, projected as `aria-valuenow`.
         * @member {Number} valueNow_=0
         * @reactive
         */
        valueNow_: 0,
        /**
         * @member {Object} vdom
         */
        vdom:
        {'aria-orientation': 'horizontal', tabIndex: 0, cn: [
            {cls: ['neo-sheet-handle-grip']}
        ]}
    }

    /**
     * The gesture controller, created eagerly so that the main thread already knows the handle when the first
     * pointer presses it.
     * @member {Neo.draggable.DragZone|null} dragZone=null
     * @protected
     */
    dragZone = null
    /**
     * Counts drags, so that an asynchronous drag start can tell that its gesture ended meanwhile.
     * @member {Number} dragGeneration=0
     * @protected
     */
    dragGeneration = 0
    /**
     * True from `drag:start` to the gesture's terminal.
     * @member {Boolean} isDragging=false
     * @protected
     */
    isDragging = false
    /**
     * The main-thread terminal a `release` still waits on: the owner settles it through {@link #settle}.
     * @member {Object|null} pendingRelease=null
     * @protected
     */
    pendingRelease = null

    /**
     * @summary The settle rule of a sheet: the index of the snap point a released drag comes to rest on.
     *
     * A release slower than `flingVelocity` settles on the nearest point. A faster one settles on the next point
     * past the release height in the direction of travel: exactly one point, however fast, and the outermost point
     * when none lies beyond.
     * @param {Object} data
     * @param {Number}   [data.flingVelocity=0.5] The px/ms from which a release counts as fast
     * @param {Number[]} data.heights             The snap points in px, ascending
     * @param {Number}   data.size                The height in px at release
     * @param {Number}   [data.velocity=0]        px/ms, positive while the height grows
     * @returns {Number} The index into `heights`
     */
    static resolveSnapIndex({flingVelocity=0.5, heights, size, velocity=0}) {
        let last = heights.length - 1,
            index;

        if (Math.abs(velocity) >= flingVelocity) {
            if (velocity > 0) {
                index = heights.findIndex(height => height > size);
                return index === -1 ? last : index
            }

            index = heights.findLastIndex(height => height < size);
            return index === -1 ? 0 : index
        }

        index = 0;

        heights.forEach((height, i) => {
            if (Math.abs(height - size) < Math.abs(heights[index] - size)) {
                index = i
            }
        });

        return index
    }

    /**
     * @summary Registers the handle's own drag listeners and creates its gesture controller. The drag listeners do
     * not bubble: the handle owns its gesture, so an ancestor's `.neo-draggable` delegate never opens a second one.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {'drag:cancel': me.onDragCancel, bubble: false, scope: me},
            {'drag:end'   : me.onDragEnd,    bubble: false, scope: me},
            {'drag:start' : me.onDragStart,  bubble: false, scope: me}
        ]);

        me.dragZone = Neo.create({
            module         : DragZone,
            appName        : me.appName,
            bodyCursorStyle: 'ns-resize !important',
            dragElement    : me.vdom,
            moveHorizontal : false,
            owner          : me,
            resizeConfig   : me.getResizeConfig(),
            useProxy       : false,
            useProxyWrapper: false,
            windowId       : me.windowId
        });

        me.dragZone.on('dragCancel', me.onDragCancel, me);

        me.updateAria()
    }

    /**
     * Triggered after the ariaLabel config got changed
     * @param {String} value    The new value of the ariaLabel config.
     * @param {String} oldValue The old value of the ariaLabel config.
     * @protected
     */
    afterSetAriaLabel(value, oldValue) {
        oldValue !== undefined && this.updateAria()
    }

    /**
     * Triggered after the target config got changed. Points the main-thread resize at the new target.
     * @param {Neo.component.Base|null} value    The new value of the target config.
     * @param {Neo.component.Base|null} oldValue The old value of the target config.
     * @protected
     */
    afterSetTarget(value, oldValue) {
        oldValue !== undefined && this.refreshDragZone()
    }

    /**
     * Triggered after the valueMax config got changed
     * @param {Number} value    The new value of the valueMax config.
     * @param {Number} oldValue The old value of the valueMax config.
     * @protected
     */
    afterSetValueMax(value, oldValue) {
        oldValue !== undefined && this.updateAria()
    }

    /**
     * Triggered after the valueNow config got changed
     * @param {Number} value    The new value of the valueNow config.
     * @param {Number} oldValue The old value of the valueNow config.
     * @protected
     */
    afterSetValueNow(value, oldValue) {
        oldValue !== undefined && this.updateAria()
    }

    /**
     * Triggered after the windowId config got changed. Moves the gesture controller into the new window.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let {dragZone} = this;

        if (dragZone) {
            dragZone.windowId = value;
            this.refreshDragZone()
        }
    }

    /**
     * Triggered before the target config gets changed. Resolves an id to its component.
     * @param {Neo.component.Base|String|null} value    The new value of the target config.
     * @param {Neo.component.Base|null}        oldValue The old value of the target config.
     * @returns {Neo.component.Base|null}
     * @protected
     */
    beforeSetTarget(value, oldValue) {
        if (Neo.isString(value)) {
            value = Neo.getComponent(value) || null
        }

        return value
    }

    /**
     * Destroys the gesture controller, which also drops its main-thread registration and restores a target whose
     * release was never settled.
     * @param {...*} args
     */
    destroy(...args) {
        let me         = this,
            {dragZone} = me;

        me.dragGeneration++;

        if (dragZone && !dragZone.isDestroyed) {
            dragZone.destroy()
        }

        me.dragZone = null;

        super.destroy(...args)
    }

    /**
     * Builds the main-thread resize descriptor: Main writes the target's height on every pointer frame, growing as
     * the pointer moves up, and keeps the start height until the owner settles the release.
     * @returns {Object|null}
     * @protected
     */
    getResizeConfig() {
        let {target} = this;

        return target ? {
            awaitWorkerSettlement: true,
            axis                 : 'height',
            parentId             : 'document.body',
            preview              : true,
            resizeNext           : true,
            targetId             : target.vdom?.id || target.id
        } : null
    }

    /**
     * Fires `step` towards a lower position.
     * @protected
     */
    onArrowDown() {
        this.fire('step', {component: this, delta: -1})
    }

    /**
     * Fires `step` towards a higher position.
     * @protected
     */
    onArrowUp() {
        this.fire('step', {component: this, delta: 1})
    }

    /**
     * @summary Ends a drag that the sensor or Escape cancelled. Main has already restored the target, so the
     * handle only fires `cancel`. Both the DOM event and the zone's `dragCancel` arrive here; the second one finds
     * no drag left.
     * @param {Object} [data]
     * @protected
     */
    onDragCancel(data) {
        let me = this;

        if (!me.isDragging) {
            return
        }

        me.dragGeneration++;
        me.isDragging = false;

        // A cancel that came through the zone has ended it already
        if (me.dragZone && (!data?.dragZoneId || Neo.get(data.dragZoneId) !== me.dragZone)) {
            me.dragZone.dragEnd({...data, cancelled: true})
        }

        me.fire('cancel', {component: me})
    }

    /**
     * @summary Fires `release` with the height Main resized the target to and the release velocity Main measured.
     * The main-thread terminal stays pending until the owner calls {@link #settle}.
     * @param {Object} data The `drag:end` event data
     * @protected
     */
    onDragEnd(data) {
        let me = this;

        if (!me.isDragging) {
            return
        }

        me.dragGeneration++;
        me.isDragging = false;

        me.dragZone.dragEnd(data);

        me.pendingRelease = {
            resizeGeneration: data.resizeGeneration,
            resizeTargetId  : data.resizeTargetId
        };

        me.fire('release', {component: me, height: Number(data.resizeSize), velocity: Number(data.resizeVelocity) || 0})
    }

    /**
     * @summary Opens a drag and hands the gesture to the main thread, which is already resizing the target by then.
     * A release the owner never settled is void: Main restored it when this drag began.
     * @param {Object} data The `drag:start` event data
     * @protected
     */
    async onDragStart(data) {
        let me         = this,
            generation = ++me.dragGeneration;

        me.isDragging     = true;
        me.pendingRelease = null;

        me.fire('dragStart', {component: me});

        await me.dragZone.dragStart(data);

        // The gesture ended while the zone opened: its start re-added the dragging class
        if (generation !== me.dragGeneration && !me.isDestroyed && !me.dragZone.isDestroyed) {
            me.dragZone.dragEnd({cancelled: true})
        }
    }

    /**
     * Fires `step` to the last position.
     * @protected
     */
    onEnd() {
        this.fire('step', {component: this, to: 'last'})
    }

    /**
     * Fires `step` to the first position.
     * @protected
     */
    onHome() {
        this.fire('step', {component: this, to: 'first'})
    }

    /**
     * Sends the current target to the main thread, so that its descriptor never names a stale target or window.
     * @returns {Promise<*>|undefined}
     * @protected
     */
    refreshDragZone() {
        let {dragZone} = this;

        if (dragZone && !dragZone.isDestroyed) {
            dragZone.resizeConfig = this.getResizeConfig();
            return dragZone.registerZone()
        }
    }

    /**
     * @summary Settles the last release on the main thread: `restore` puts the start height back, otherwise Main
     * keeps the height it drew until the owner's next height replaces it. Main restores a release that is still
     * unsettled when the next drag starts.
     * @param {Boolean} [restore=false]
     * @returns {Promise<Boolean>|undefined}
     */
    settle(restore=false) {
        let me      = this,
            pending = me.pendingRelease;

        me.pendingRelease = null;

        if (pending && Number.isInteger(pending.resizeGeneration) && !me.dragZone?.isDestroyed) {
            return me.dragZone.settleResize({...pending, restore})?.catch?.(error => {
                error !== Neo.isDestroyed && console.error('Neo.sheet.Handle: settling the release failed', error)
            })
        }
    }

    /**
     * Projects `ariaLabel`, `valueMax`, `valueNow` and the target as the separator's ARIA attributes.
     * @protected
     */
    updateAria() {
        let me   = this,
            root = me.getVdomRoot();

        Object.assign(root, {
            'aria-label'   : me.ariaLabel,
            'aria-valuemax': String(me.valueMax),
            'aria-valuemin': '0',
            'aria-valuenow': String(me.valueNow)
        });

        if (me.target) {
            root['aria-controls'] = me.target.id
        } else {
            delete root['aria-controls']
        }

        me.update()
    }
}

export default Neo.setupClass(Handle);
