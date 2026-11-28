import Button    from '../button/Base.mjs';
import Container from '../container/Base.mjs';
import Handle    from './Handle.mjs';

/**
 * @summary A persistent bottom sheet: secondary content fixed to the bottom edge of the window, which the user drags
 * between heights, such as a map's details, filters or a player.
 *
 * `snapPoints` lists the heights the sheet rests at, ascending: a Number in px, or a CSS length String such as
 * `'50dvh'` or `'20rem'`. `snapIndex` is the current one. From the first render, the sheet's inline `height` is that
 * point, so it paints in place, and its `min-height` and `max-height` are the first and last points.
 *
 * The header holds a {@link Neo.sheet.Handle} and a button. Dragging the handle resizes the sheet on the main thread.
 * On release the sheet settles on the nearest point, or on the next one in the direction of a fast release
 * ({@link Neo.sheet.Handle.resolveSnapIndex}). On the focused handle, Arrow Up and Arrow Down step through the points,
 * and Home and End reach the first and the last. The button expands one point at a time and collapses from the top.
 *
 * `items` fill the sheet's body, which scrolls on its own. Only the handle starts a drag, never the content.
 *
 * @example
 * {
 *     module    : Sheet,
 *     ariaLabel : 'Nearby places',
 *     items     : [{module: List, store: PlaceStore}],
 *     snapIndex : 1,
 *     snapPoints: [96, '50dvh', '90dvh']
 * }
 * @class Neo.sheet.Base
 * @extends Neo.container.Base
 */
class Sheet extends Container {
    static config = {
        /**
         * @member {String} className='Neo.sheet.Base'
         * @protected
         */
        className: 'Neo.sheet.Base',
        /**
         * @member {String} ntype='sheet'
         * @protected
         */
        ntype: 'sheet',
        /**
         * The accessible name of the sheet. With a name, the sheet is a `region` landmark.
         * @member {String|null} ariaLabel_=null
         * @reactive
         */
        ariaLabel_: null,
        /**
         * @member {String[]} baseCls=['neo-sheet','neo-container']
         * @protected
         */
        baseCls: ['neo-sheet', 'neo-container'],
        /**
         * The accessible name of the button while the sheet rests at its top point.
         * @member {String} collapseText
         * @default 'Collapse sheet'
         */
        collapseText: 'Collapse sheet',
        /**
         * The accessible name of the button below the top point.
         * @member {String} expandText
         * @default 'Expand sheet'
         */
        expandText: 'Expand sheet',
        /**
         * The release velocity in px/ms from which a drag settles on the next point in its direction, instead of the
         * nearest one.
         * @member {Number} flingVelocity=0.5
         */
        flingVelocity: 0.5,
        /**
         * The index of the snap point the sheet rests at. Values outside `snapPoints` are clamped.
         * @member {Number} snapIndex_=0
         * @reactive
         */
        snapIndex_: 0,
        /**
         * The heights the sheet rests at, ascending: px Numbers or CSS length Strings. A percentage is refused,
         * because a fixed sheet's percentage has no px value to compare a release with.
         * @member {Array<Number|String>} snapPoints_=[96,'50dvh','90dvh']
         * @reactive
         */
        snapPoints_: [96, '50dvh', '90dvh']
    }

    /**
     * The handle in the header, created with the items.
     * @member {Neo.sheet.Handle|null} handle=null
     */
    handle = null
    /**
     * The snap points in px, measured when a drag starts, so that its release compares like with like.
     * @member {Promise<Number[]>|null} snapHeights=null
     * @protected
     */
    snapHeights = null
    /**
     * The expand and collapse button in the header, created with the items.
     * @member {Neo.button.Base|null} toggleButton=null
     */
    toggleButton = null

    /**
     * Writes a snap point as a CSS length.
     * @param {Number|String} value
     * @returns {String}
     */
    static toCssLength(value) {
        return Neo.isNumber(value) ? `${value}px` : value
    }

    /**
     * Moves the sheet up by one point, or back to the first one from the top. Reaches every point without a pointer.
     */
    advance() {
        let me   = this,
            last = me.snapPoints.length - 1;

        me.snapIndex = me.snapIndex >= last ? 0 : me.snapIndex + 1
    }

    /**
     * Triggered after the ariaLabel config got changed. A named sheet is a `region` landmark.
     * @param {String|null} value    The new value of the ariaLabel config.
     * @param {String|null} oldValue The old value of the ariaLabel config.
     * @protected
     */
    afterSetAriaLabel(value, oldValue) {
        if (value || oldValue) {
            this.role = value ? 'region' : null;
            this.changeVdomRootKey('aria-label', value)
        }
    }

    /**
     * Triggered after the snapIndex config got changed
     * @param {Number} value    The new value of the snapIndex config.
     * @param {Number} oldValue The old value of the snapIndex config.
     * @protected
     */
    afterSetSnapIndex(value, oldValue) {
        if (oldValue !== undefined) {
            this.updateSnapState();
            this.fire('snapIndexChange', {component: this, oldValue, value})
        }
    }

    /**
     * Triggered after the snapPoints config got changed. Keeps `snapIndex` inside the new points.
     * @param {Array<Number|String>} value    The new value of the snapPoints config.
     * @param {Array<Number|String>} oldValue The old value of the snapPoints config.
     * @protected
     */
    afterSetSnapPoints(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.snapIndex = Math.min(me.snapIndex, value.length - 1);
            me.updateSnapState()
        }
    }

    /**
     * Triggered before the snapIndex config gets changed. Rounds and clamps the index to the snap points.
     * @param {Number} value    The new value of the snapIndex config.
     * @param {Number} oldValue The old value of the snapIndex config.
     * @returns {Number}
     * @protected
     */
    beforeSetSnapIndex(value, oldValue) {
        let last = this.snapPoints.length - 1;

        value = Math.round(Number(value));

        return Number.isFinite(value) ? Math.min(Math.max(value, 0), last) : oldValue ?? 0
    }

    /**
     * Triggered before the snapPoints config gets changed. Refuses anything but a non-empty Array of positive px
     * Numbers and CSS length Strings other than percentages, and keeps the previous points instead.
     * @param {Array<Number|String>} value    The new value of the snapPoints config.
     * @param {Array<Number|String>} oldValue The old value of the snapPoints config.
     * @returns {Array<Number|String>}
     * @protected
     */
    beforeSetSnapPoints(value, oldValue) {
        let valid = Array.isArray(value) && value.length > 0 && value.every(point =>
            Neo.isNumber(point) ? point > 0 : Neo.isString(point) && !point.trim().endsWith('%')
        );

        if (!valid) {
            console.error('Neo.sheet.Base: snapPoints takes px Numbers or CSS length Strings, never a percentage', value);
            return oldValue || this.constructor.config.snapPoints
        }

        return value
    }

    /**
     * @summary Places the header, with the handle and the button, before a body that holds the configured items,
     * as `Neo.container.Panel` places its headers. Neither takes a layout: the items flow in the body, which
     * scrolls, instead of sharing its height.
     * @protected
     */
    createItems() {
        let me      = this,
            {items} = me,
            header;

        me.items = [{
            module: Container,
            cls   : ['neo-sheet-header'],
            flex  : 'none',
            layout: null,
            items : [{
                module   : Handle,
                listeners: {
                    cancel   : me.onHandleCancel,
                    dragStart: me.onHandleDragStart,
                    release  : me.onHandleRelease,
                    step     : me.onHandleStep,
                    scope    : me
                },
                target: me
            }, {
                module      : Button,
                cls         : ['neo-sheet-toggle'],
                handler     : 'advance',
                handlerScope: me,
                ui          : 'ghost'
            }]
        }, {
            module      : Container,
            cls         : ['neo-sheet-body'],
            flex        : 1,
            itemDefaults: me.itemDefaults,
            items,
            layout      : null
        }];

        me.itemDefaults = null;

        super.createItems();

        header = me.items[0];

        me.handle       = header.items[0];
        me.toggleButton = header.items[1];

        me.updateSnapState()
    }

    /**
     * Measures the snap points in px. A probe on the body resolves each CSS length the way the browser does.
     * @returns {Promise<Number[]>}
     * @protected
     */
    measureSnapPoints() {
        let {windowId} = this;

        return Promise.all(this.snapPoints.map(value =>
            Neo.isNumber(value) ? value : Neo.main.DomAccess.measure({id: 'document.body', value, windowId})
        ))
    }

    /**
     * Drops the measured snap points of a cancelled drag. Main has already restored the height.
     * @protected
     */
    onHandleCancel() {
        this.snapHeights = null
    }

    /**
     * Measures the snap points while the drag runs, so that its release can settle at once.
     * @protected
     */
    onHandleDragStart() {
        this.snapHeights = this.measureSnapPoints()
    }

    /**
     * @summary Settles a released drag: resolves the snap point, has Main restore the start height when it did not
     * change, and otherwise moves `snapIndex`, whose height replaces the one Main drew.
     * @param {Object} data
     * @param {Number} data.height   The height in px at release
     * @param {Number} data.velocity px/ms, positive while the height grows
     * @protected
     */
    async onHandleRelease({height, velocity}) {
        let me    = this,
            start = me.snapIndex,
            index = start,
            heights;

        try {
            heights = await (me.snapHeights || me.measureSnapPoints());

            if (Number.isFinite(height) && heights.every(Number.isFinite)) {
                index = Handle.resolveSnapIndex({flingVelocity: me.flingVelocity, heights, size: height, velocity})
            }
        } catch (error) {
            error !== Neo.isDestroyed && console.error('Neo.sheet.Base: measuring the snap points failed', error)
        }

        me.snapHeights = null;

        if (!me.isDestroyed) {
            me.handle.settle(index === start);
            me.snapIndex = index
        }
    }

    /**
     * Applies a keyboard step of the handle.
     * @param {Object} data
     * @param {Number} [data.delta]
     * @param {String} [data.to] `'first'` or `'last'`
     * @protected
     */
    onHandleStep({delta, to}) {
        let me   = this,
            last = me.snapPoints.length - 1;

        me.snapIndex = to === 'first' ? 0 : to === 'last' ? last : me.snapIndex + delta
    }

    /**
     * @summary Writes the current snap point as the inline height, with the first and last points as its bounds,
     * and tells the handle and the button where the sheet rests.
     * @protected
     */
    updateSnapState() {
        let me                                            = this,
            {handle, snapIndex, snapPoints, toggleButton} = me,
            last                                          = snapPoints.length - 1,
            top                                           = snapIndex >= last;

        me.style = {
            ...me.style,
            height   : Sheet.toCssLength(snapPoints[snapIndex]),
            maxHeight: Sheet.toCssLength(snapPoints[last]),
            minHeight: Sheet.toCssLength(snapPoints[0])
        };

        handle?.set({valueMax: last, valueNow: snapIndex});

        toggleButton?.set({
            ariaLabel: top ? me.collapseText : me.expandText,
            iconCls  : top ? 'fa fa-chevron-down' : 'fa fa-chevron-up'
        })
    }
}

export default Neo.setupClass(Sheet);
