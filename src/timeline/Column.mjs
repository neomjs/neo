import BaseColumn      from '../grid/column/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import EventStore      from './store/Events.mjs';
import IntervalPacker  from './util/IntervalPacker.mjs';
import TimeAxis        from './TimeAxis.mjs';
import TimeAxisHeader  from './TimeAxisHeader.mjs';

/**
 * @summary Grid column rendering viewport-clipped timeline bars.
 * @description Projects either event-store records or inline row records and packs overlapping events into lanes.
 * It refreshes recycled rows when the visible viewport leaves the previously projected horizontal buffer.
 *
 * @class Neo.timeline.Column
 * @extends Neo.grid.column.Base
 * @see Neo.timeline.TimeAxis
 * @see Neo.timeline.TimeAxisHeader
 * @see Neo.util.IntervalPacker
 * @see Neo.store.Events
 */
class Column extends BaseColumn {
    static config = {
        /**
         * @member {String} className='Neo.timeline.Column'
         * @protected
         */
        className: 'Neo.timeline.Column',
        /**
         * @member {String} type='timeline'
         * @protected
         */
        type: 'timeline',
        /**
         * Optional extra CSS class(es) added to each `.neo-timeline-bar` node.
         * @member {String|String[]|null} barCls_=null
         * @reactive
         */
        barCls_: null,
        /**
         * Vertical padding percentage (`0..45`) left above and below packed bars inside a row cell.
         * @member {Number} barMarginPct_=8
         * @reactive
         */
        barMarginPct_: 8,
        /**
         * Optional custom hook `(barData, context) => Object|String|null` to customize bar VDOM or label content.
         * @member {Function|null} barRenderer_=null
         * @reactive
         */
        barRenderer_: null,
        /**
         * Horizontal overscan buffer in pixels on each side of the visible viewport.
         * @member {Number} bufferPx_=400
         * @reactive
         */
        bufferPx_: 400,
        /**
         * Default CSS class applied to every timeline track cell.
         * @member {String[]} cellCls=['neo-timeline-cell']
         */
        cellCls: ['neo-timeline-cell'],
        /**
         * Timeline track columns do not show the standard sort/filter column menu.
         * @member {Boolean} columnMenu=false
         */
        columnMenu: false,
        /**
         * Array of record keys highlighted on the timeline bars.
         * @member {Array<String|Number>} highlightedRecordIds_=[]
         * @reactive
         */
        highlightedRecordIds_: [],
        /**
         * Default column `dataField` identifier.
         * @member {String} dataField='timeline'
         */
        dataField: 'timeline',
        /**
         * Timeline cells are manipulated via `EventDragZone` rather than inline cell editors.
         * @member {Boolean} editable=false
         */
        editable: false,
        /**
         * Field name on inline row records holding the task/event end date when `eventStore` is not used.
         * @member {String} endDateField_='endDate'
         * @reactive
         */
        endDateField_: 'endDate',
        /**
         * Optional {@link Neo.store.Events} providing multi-event records per resource row.
         * When `null`, `getRowBars()` falls back to reading inline `startDateField` / `endDateField` on the row record.
         * @member {Neo.store.Events|Object|null} eventStore_=null
         * @reactive
         */
        eventStore_: null,
        /**
         * Timeline track columns size from `timeAxis.totalSize` rather than flex layout.
         * @member {String} flex='none'
         */
        flex: 'none',
        /**
         * Optional formatter `(tick, timeAxis) => String` forwarded to `TimeAxisHeader`.
         * @member {Function|null} majorFormatter_=null
         * @reactive
         */
        majorFormatter_: null,
        /**
         * Step multiplier for the major header row forwarded to `TimeAxisHeader`.
         * @member {Number} majorTickStep_=1
         * @reactive
         */
        majorTickStep_: 1,
        /**
         * Explicit unit for the major header row forwarded to `TimeAxisHeader`.
         * @member {String|null} majorTickUnit_=null
         * @reactive
         */
        majorTickUnit_: null,
        /**
         * Minimum rendered bar width in pixels so zero-duration or very short events remain visible and grabbable.
         * @member {Number} minBarWidthPx_=4
         * @reactive
         */
        minBarWidthPx_: 4,
        /**
         * Optional formatter `(tick, timeAxis) => String` forwarded to `TimeAxisHeader`.
         * @member {Function|null} minorFormatter_=null
         * @reactive
         */
        minorFormatter_: null,
        /**
         * Field name on inline row records holding completion percentage (`0..100`).
         * @member {String} percentDoneField_='percentDone'
         * @reactive
         */
        percentDoneField_: 'percentDone',
        /**
         * Bind `cellRenderer` execution scope to this column instance.
         * @member {String} rendererScope='this'
         */
        rendererScope: 'this',
        /**
         * Timeline track columns size from `timeAxis.totalSize` rather than interactive column resize handles.
         * @member {Boolean} resizable_=false
         * @reactive
         */
        resizable_: false,
        /**
         * When `true`, renders `.neo-resizable-start` and `.neo-resizable-end` handles inside each bar for
         * {@link Neo.timeline.EventDragZone} start/end resize gestures.
         * @member {Boolean} resizableBars_=true
         * @reactive
         */
        resizableBars_: true,
        /**
         * Field or key property on row records used to look up events in `eventStore`.
         * @member {String} resourceIdField_='id'
         * @reactive
         */
        resourceIdField_: 'id',
        /**
         * Current horizontal scroll offset in center-content pixels.
         * @member {Number} scrollLeft_=0
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * Timeline headers do not show a text filter field.
         * @member {Boolean} showHeaderFilter_=false
         * @reactive
         */
        showHeaderFilter_: false,
        /**
         * When `true`, renders `.neo-timeline-non-working` shading bands inside each row track cell
         * for `timeAxis.getNonWorkingRanges(visibleStart, visibleEnd)`.
         * @member {Boolean} showNonWorkingTime_=false
         * @reactive
         */
        showNonWorkingTime_: false,
        /**
         * Timeline headers do not sort rows on click.
         * @member {Boolean} sortable_=false
         * @reactive
         */
        sortable_: false,
        /**
         * Field name on inline row records holding the task/event start date when `eventStore` is not used.
         * @member {String} startDateField_='startDate'
         * @reactive
         */
        startDateField_: 'startDate',
        /**
         * Header label used by CSV export and accessibility fallbacks.
         * @member {String} text_='Timeline'
         * @reactive
         */
        text_: 'Timeline',
        /**
         * The {@link Neo.timeline.TimeAxis} instance driving horizontal bar coordinates and column width.
         * @member {Neo.timeline.TimeAxis|Object|null} timeAxis_=null
         * @reactive
         */
        timeAxis_: null,
        /**
         * Field name on event/task records holding the display title.
         * @member {String} titleField_='title'
         * @reactive
         */
        titleField_: 'title',
        /**
         * Visible center viewport width in pixels (`> 0`). Updated automatically from the grid's center clip
         * width when mounted inside a `Neo.grid.Container`, or set directly in standalone/headless tests.
         * @member {Number} viewportWidth_=1200
         * @reactive
         */
        viewportWidth_: 1200
    }

    /**
     * Cleanup functions for active `timeAxis` config subscriptions.
     * @member {Function[]} #axisCleanups=[]
     * @private
     */
    #axisCleanups = []

    /**
     * Normalized string set of `highlightedRecordIds` for $O(1)$ lookup during bar VDOM generation.
     * @member {Set<String>} #highlightedRecordSet=new Set()
     * @private
     */
    #highlightedRecordSet = new Set()

    /**
     * Cleanup functions for active `gridContainer` / `headerToolbar` / `body` config subscriptions.
     * @member {Function[]} #gridCleanups=[]
     * @private
     */
    #gridCleanups = []

    /**
     * Listener cleanup references for `eventStore`.
     * @member {Function[]} #storeCleanups=[]
     * @private
     */
    #storeCleanups = []

    /**
     * True once `#projectedMinPx` and `#projectedMaxPx` hold a valid projected window.
     * @member {Boolean} #hasProjectedWindow=false
     * @private
     */
    #hasProjectedWindow = false

    /**
     * Cached reference to the associated {@link Neo.timeline.TimeAxisHeader} instance.
     * @member {Neo.timeline.TimeAxisHeader|null} #header=null
     * @private
     */
    #header = null

    /**
     * Right boundary in pixels of the last projected buffered window.
     * @member {Number} #projectedMaxPx=0
     * @private
     */
    #projectedMaxPx = 0

    /**
     * Left boundary in pixels of the last projected buffered window.
     * @member {Number} #projectedMinPx=0
     * @private
     */
    #projectedMinPx = 0

    /**
     * Effective center viewport width in pixels.
     * @returns {Number}
     */
    get effectiveViewportWidth() {
        const
            gridContainer = this.parent,
            body          = gridContainer?.body;

        if (body?.containerWidth > 0) {
            const clipWidth = body.containerWidth
                - (gridContainer.bodyStart?.availableWidth || 0)
                - (gridContainer.bodyEnd?.availableWidth   || 0);

            if (clipWidth > 0) {
                return clipWidth
            }
        }

        return Math.max(1, this.viewportWidth || 1200)
    }

    /**
     * Resolves the {@link Neo.timeline.TimeAxisHeader} instance inside `gridContainer.headerToolbar`.
     * @returns {Neo.timeline.TimeAxisHeader|null}
     */
    get headerComponent() {
        if (this.#header && !this.#header.isDestroyed) {
            return this.#header
        }
        const item = this.parent?.headerToolbar?.getColumn(this.dataField);
        return item instanceof TimeAxisHeader ? item : null
    }

    /**
     * @summary Coerces `eventStore` config objects into a `Neo.store.Events` instance.
     * @param {Neo.store.Events|Object|null} value
     * @returns {Neo.store.Events|null}
     * @protected
     */
    beforeSetEventStore(value) {
        if (!value) {
            return null
        }
        return ClassSystemUtil.beforeSetInstance(value, EventStore)
    }

    /**
     * @summary Coerces `timeAxis` config objects into a `Neo.timeline.TimeAxis` instance.
     * @param {Neo.timeline.TimeAxis|Object|null} value
     * @returns {Neo.timeline.TimeAxis|null}
     * @protected
     */
    beforeSetTimeAxis(value) {
        if (!value) {
            return null
        }
        return ClassSystemUtil.beforeSetInstance(value, TimeAxis)
    }

    /**
     * @summary Re-renders mounted rows when `bufferPx` changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferPx(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            if (this.headerComponent) {
                this.headerComponent.bufferPx = value
            }
            this.refreshMountedRows()
        }
    }

    /**
     * @summary Updates `#highlightedRecordSet` and re-renders mounted rows when `highlightedRecordIds` changes.
     * @param {Array<String|Number>|null} value
     * @param {Array<String|Number>|null} oldValue
     * @protected
     */
    afterSetHighlightedRecordIds(value, oldValue) {
        this.#highlightedRecordSet = new Set(
            Array.isArray(value) ? value.map(id => String(id)) : []
        );

        if (oldValue !== undefined) {
            this.refreshMountedRows()
        }
    }

    /**
     * @summary Subscribes to `eventStore` load/filter/recordChange events and refreshes mounted rows.
     * @param {Neo.store.Events|null} value
     * @param {Neo.store.Events|null} oldValue
     * @protected
     */
    afterSetEventStore(value, oldValue) {
        const me = this;

        me.#storeCleanups.forEach(cleanup => cleanup());
        me.#storeCleanups = [];

        if (value) {
            const onStoreMutate = () => me.refreshMountedRows();

            const listenerId = value.on({
                filter      : onStoreMutate,
                load        : onStoreMutate,
                mutate      : onStoreMutate,
                recordChange: onStoreMutate
            });

            me.#storeCleanups.push(() => value.un(listenerId))
        }

        if (oldValue !== undefined && me.isConstructed) {
            me.refreshMountedRows()
        }
    }

    /**
     * @summary Re-renders mounted rows when `scrollLeft` leaves the last projected buffered window.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            if (this.headerComponent && this.headerComponent.scrollLeft !== value) {
                this.headerComponent.scrollLeft = value
            }
            if (this.needsReprojection(value)) {
                this.refreshMountedRows()
            }
        }
    }

    /**
     * @summary Forwards `showNonWorkingTime` to {@link #headerComponent} and refreshes mounted rows.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowNonWorkingTime(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            if (this.headerComponent && this.headerComponent.showNonWorkingTime !== value) {
                this.headerComponent.showNonWorkingTime = value
            }
            this.refreshMountedRows()
        }
    }

    /**
     * @summary Subscribes to `timeAxis` config changes and synchronizes column width, header, and mounted rows.
     * @param {Neo.timeline.TimeAxis|null} value
     * @param {Neo.timeline.TimeAxis|null} oldValue
     * @protected
     */
    afterSetTimeAxis(value, oldValue) {
        const me = this;

        me.#axisCleanups.forEach(cleanup => cleanup());
        me.#axisCleanups = [];

        if (value) {
            me.width = value.totalSize;

            for (const prop of ['start', 'end', 'pxPerMinute', 'size', 'tickUnit', 'tickStep', 'nonWorkingDays', 'nonWorkingDates', 'timeZone']) {
                me.#axisCleanups.push(
                    me.observeConfig(value, prop, () => me.onTimeAxisChange())
                )
            }
        }

        if (me.headerComponent && me.headerComponent.timeAxis !== value) {
            me.headerComponent.timeAxis = value
        }

        if (oldValue !== undefined && me.isConstructed) {
            me.onTimeAxisChange()
        }
    }

    /**
     * @summary Re-renders mounted rows when `viewportWidth` changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetViewportWidth(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            if (this.headerComponent && this.headerComponent.viewportWidth !== value) {
                this.headerComponent.viewportWidth = value
            }
            this.refreshMountedRows()
        }
    }

    /**
     * @summary Hooks `headerToolbar` and `body` on the owning `Neo.grid.Container` for synchronized horizontal windowing.
     * @param {Neo.timeline.TimeAxisHeader|null} [headerInstance=null]
     * @protected
     */
    bindGridContext(headerInstance=null) {
        const
            me            = this,
            gridContainer = me.parent,
            toolbar       = gridContainer?.headerToolbar,
            body          = gridContainer?.body;

        me.#gridCleanups.forEach(cleanup => cleanup());
        me.#gridCleanups = [];

        if (headerInstance instanceof TimeAxisHeader) {
            me.#header = headerInstance
        }

        if (!gridContainer) {
            return
        }

        const header = me.headerComponent;

        if (header) {
            if (me.timeAxis && header.timeAxis !== me.timeAxis) {
                header.timeAxis = me.timeAxis
            }
            header.bufferPx           = me.bufferPx;
            header.viewportWidth      = me.viewportWidth;
            header.majorTickUnit      = me.majorTickUnit;
            header.majorTickStep      = me.majorTickStep;
            header.majorFormatter     = me.majorFormatter;
            header.minorFormatter     = me.minorFormatter;
            header.showNonWorkingTime = me.showNonWorkingTime
        }

        if (toolbar) {
            me.scrollLeft = toolbar.scrollLeft || 0;

            if (typeof toolbar.getConfig === 'function' && toolbar.getConfig('scrollLeft')) {
                me.#gridCleanups.push(
                    me.observeConfig(toolbar, 'scrollLeft', scrollLeft => {
                        me.scrollLeft = scrollLeft || 0
                    })
                )
            }
        }

        me.syncBodyGeometry();
        me.recordProjectedWindow();

        if (body) {
            me.#gridCleanups.push(
                me.observeConfig(body, 'containerWidth', () => me.refreshMountedRows())
            )
        }

        if (gridContainer.bodyStart) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.bodyStart, 'availableWidth', () => me.refreshMountedRows())
            )
        } else if (gridContainer.horizontalScrollbar) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.horizontalScrollbar, 'startWidth', () => me.refreshMountedRows())
            )
        }

        if (gridContainer.bodyEnd) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.bodyEnd, 'availableWidth', () => me.refreshMountedRows())
            )
        } else if (gridContainer.horizontalScrollbar) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.horizontalScrollbar, 'endWidth', () => me.refreshMountedRows())
            )
        }
    }

    /**
     * @summary Builds the VDOM node for a single positioned event or task bar inside a row cell.
     * @param {Object} barDescriptor
     * @param {Object} barDescriptor.bar Event or task record/object
     * @param {String|Number} barDescriptor.barKey Unique identifier for the bar
     * @param {Number} barDescriptor.height Percentage height (`0..100`)
     * @param {Number} barDescriptor.lane Zero-based sub-lane index
     * @param {Number} barDescriptor.laneCount Total sub-lanes in the bar's overlap cluster
     * @param {Number} barDescriptor.left Pixel offset from the start of the timeline track
     * @param {Number} barDescriptor.percentDone Completion percentage (`0..100`)
     * @param {String|Number} barDescriptor.resourceId Owning row/resource identifier
     * @param {Date} barDescriptor.startDate Bar start `Date`
     * @param {Date} barDescriptor.endDate Bar end `Date`
     * @param {String} barDescriptor.title Display title
     * @param {Number} barDescriptor.top Percentage top offset (`0..100`)
     * @param {Number} barDescriptor.width Pixel width (`>= minBarWidthPx`)
     * @param {Object} context Renderer context (`{record, row, gridContainer}`)
     * @returns {Object} VDOM node for the bar
     */
    buildBarVdom(barDescriptor, context) {
        const
            me  = this,
            {
                bar,
                barKey,
                endDate,
                height,
                lane,
                laneCount,
                left,
                percentDone,
                resourceId,
                startDate,
                title,
                top,
                width
            }   = barDescriptor,
            rowId  = context.row?.id || `${me.id}__row-${resourceId}`,
            barId  = `${rowId}__bar__${barKey}`,
            cls    = ['neo-timeline-bar', 'neo-draggable'];

        if (me.barCls) {
            if (Array.isArray(me.barCls)) {
                cls.push(...me.barCls)
            } else {
                cls.push(me.barCls)
            }
        }

        const customCls = bar?.cls;
        if (customCls) {
            if (Array.isArray(customCls)) {
                cls.push(...customCls)
            } else {
                cls.push(customCls)
            }
        }

        const isHighlighted = me.#highlightedRecordSet.has(String(barKey))
            || (bar?.id !== undefined && me.#highlightedRecordSet.has(String(bar.id)));

        if (isHighlighted) {
            cls.push('neo-timeline-bar-highlighted')
        }

        const cn = [];

        if (Number.isFinite(percentDone) && percentDone > 0) {
            const clampedPct = Math.min(100, Math.max(0, percentDone));
            cn.push({
                id   : `${barId}__progress`,
                cls  : ['neo-timeline-bar-progress'],
                style: {width: `${clampedPct}%`}
            })
        }

        cn.push({
            id  : `${barId}__label`,
            cls : ['neo-timeline-bar-label'],
            text: title
        });

        if (me.resizableBars) {
            cn.push(
                {
                    id : `${barId}__resize-start`,
                    cls: ['neo-timeline-bar-handle', 'neo-resizable', 'neo-resizable-start']
                },
                {
                    id : `${barId}__resize-end`,
                    cls: ['neo-timeline-bar-handle', 'neo-resizable', 'neo-resizable-end']
                }
            )
        }

        const node = {
            id          : barId,
            cls,
            role        : 'button',
            tabIndex    : 0,
            'aria-label': title
                ? `${title} (${(me.timeAxis || TimeAxis).dayKey(startDate)} – ${(me.timeAxis || TimeAxis).dayKey(endDate)})`
                : `${barKey}`,
            data        : {
                eventId   : String(barKey),
                lane      : String(lane),
                laneCount : String(laneCount),
                resourceId: String(resourceId),
                ...(isHighlighted ? {highlighted: 'true'} : {})
            },
            style       : {
                height: `${height}%`,
                left  : `${left}px`,
                top   : `${top}%`,
                width : `${width}px`
            },
            cn
        };

        if (typeof me.barRenderer === 'function') {
            const custom = me.barRenderer(barDescriptor, {...context, column: me, vdom: node});
            if (custom && typeof custom === 'object') {
                return custom
            }
            if (typeof custom === 'string') {
                const labelNode = node.cn.find(child => child.id === `${barId}__label`);
                if (labelNode) {
                    labelNode.text = custom
                }
            }
        }

        return node
    }

    /**
     * @summary Renders the timeline track cell for a single resource or task row (`record`), projecting only
     * bars intersecting `[scrollLeft - bufferPx, scrollLeft + viewportWidth + bufferPx]`.
     * @param {Object} data
     * @param {Object} data.record Row record from the grid's store
     * @param {Neo.grid.Row} [data.row] Owning `Neo.grid.Row` component
     * @param {Neo.grid.Container} [data.gridContainer] Owning `Neo.grid.Container`
     * @returns {{cls: String[], style: Object, cn: Object[]}}
     */
    cellRenderer(data) {
        const
            me         = this,
            {record}   = data,
            {timeAxis} = me,
            rowId      = data.row?.id || `${me.id}__row`,
            trackId    = `${rowId}__track`;

        if (!timeAxis || !record) {
            return {
                id   : `${rowId}__timeline-cell`,
                cls  : ['neo-timeline-cell'],
                style: {padding: '0px'},
                cn   : [{
                    id : trackId,
                    cls: ['neo-timeline-track'],
                    cn : []
                }]
            }
        }

        const
            {visibleStart, visibleEnd} = me.getProjectedDateRange(),
            nonWorkingNodes            = me.showNonWorkingTime && timeAxis.hasWorkingCalendar()
                ? timeAxis.getNonWorkingRanges(visibleStart, visibleEnd).map(range => ({
                    id           : `${trackId}__nw-${range.key}`,
                    cls          : ['neo-timeline-non-working'],
                    'aria-hidden': 'true',
                    data         : {dayKey: range.key},
                    style        : {
                        height       : '100%',
                        left         : `${range.x}px`,
                        pointerEvents: 'none',
                        position     : 'absolute',
                        top          : '0px',
                        width        : `${range.width}px`
                    }
                }))
                : [],
            bars                       = me.getRowBars(record, visibleStart, visibleEnd),
            barNodes                   = bars.map(barDescriptor => me.buildBarVdom(barDescriptor, data)),
            cn                         = [...barNodes, ...nonWorkingNodes];

        return {
            id   : `${rowId}__timeline-cell`,
            cls  : ['neo-timeline-cell'],
            style: {padding: '0px'},
            cn   : [{
                id   : trackId,
                cls  : ['neo-timeline-track'],
                style: {
                    height  : '100%',
                    position: 'relative',
                    width   : `${timeAxis.totalSize}px`
                },
                cn
            }]
        }
    }

    /**
     * @summary Cleans up axis, store, and grid subscriptions on destroy.
     * @param {...any} args
     */
    destroy(...args) {
        this.#axisCleanups.forEach(cleanup => cleanup());
        this.#axisCleanups = [];

        this.#gridCleanups.forEach(cleanup => cleanup());
        this.#gridCleanups = [];

        this.#storeCleanups.forEach(cleanup => cleanup());
        this.#storeCleanups = [];

        super.destroy(...args)
    }

    /**
     * @summary Returns the `.neo-timeline-bar` VDOM node `id` for `recordId` within `rowVdom`, if rendered.
     * @param {Object|null} rowVdom
     * @param {String|Number} recordId
     * @returns {String|null}
     */
    getBarNodeId(rowVdom, recordId) {
        if (!rowVdom || recordId === null || recordId === undefined) {
            return null
        }

        const
            targetId = String(recordId),
            bars     = rowVdom.cn?.[0]?.cn?.[0]?.cn?.[0]?.cn;

        if (Array.isArray(bars)) {
            const match = bars.find(bar => String(bar?.data?.eventId ?? '') === targetId);
            if (match?.id) {
                return match.id
            }
        }

        return null
    }

    /**
     * @summary Returns the `{visibleStart, visibleEnd, minPx, maxPx}` for the last recorded
     * `[#projectedMinPx, #projectedMaxPx]` window without mutating it (recording the initial
     * window only if none has been recorded yet).
     * @returns {{visibleStart: Date, visibleEnd: Date, minPx: Number, maxPx: Number}}
     */
    getProjectedDateRange() {
        if (!this.#hasProjectedWindow) {
            this.recordProjectedWindow()
        }

        const
            axis  = this.timeAxis,
            minPx = this.#projectedMinPx,
            maxPx = this.#projectedMaxPx;

        return {
            visibleStart: axis ? axis.offsetToDate(minPx) : new Date(0),
            visibleEnd  : axis ? axis.offsetToDate(maxPx) : new Date(0),
            minPx,
            maxPx
        }
    }

    /**
     * @summary Resolves the resource/row identifier for `record` using `resourceIdField`.
     * @param {Object} record
     * @returns {String|Number|null}
     */
    getResourceId(record) {
        if (!record) {
            return null
        }

        const field = this.resourceIdField || 'id';

        if (record[field] !== undefined && record[field] !== null) {
            return record[field]
        }

        if (typeof record.get === 'function') {
            const val = record.get(field);
            if (val !== undefined && val !== null) {
                return val
            }
        }

        return record.id ?? null
    }

    /**
     * @summary Computes the positioned, lane-packed bar descriptors for `record` intersecting `[visibleStart, visibleEnd]`.
     * @param {Object} record Resource or inline event row record
     * @param {Date} [visibleStart]
     * @param {Date} [visibleEnd]
     * @returns {Array<{bar: Object, barKey: String|Number, resourceId: String|Number, title: String, startDate: Date, endDate: Date, left: Number, width: Number, top: Number, height: Number, lane: Number, laneCount: Number, percentDone: Number}>}
     */
    getRowBars(record, visibleStart, visibleEnd) {
        const
            me         = this,
            {timeAxis} = me;

        if (!timeAxis || !record) {
            return []
        }

        const
            range      = visibleStart && visibleEnd
                ? {visibleStart, visibleEnd}
                : me.getProjectedDateRange(),
            visStartMs = range.visibleStart.getTime(),
            visEndMs   = range.visibleEnd.getTime(),
            axisStart  = timeAxis.start.getTime(),
            axisEnd    = timeAxis.end.getTime(),
            resourceId = me.getResourceId(record),
            marginPct  = Math.min(45, Math.max(0, Number(me.barMarginPct) || 0)),
            usablePct  = Math.max(10, 100 - marginPct * 2),
            minWidth   = Math.max(1, Number(me.minBarWidthPx) || 4);

        let rawEvents = [];

        if (me.eventStore) {
            rawEvents = typeof me.eventStore.getRangeRecords === 'function'
                ? me.eventStore.getRangeRecords(range.visibleStart, range.visibleEnd, resourceId)
                : EventStore.getRangeRecords(me.eventStore, range.visibleStart, range.visibleEnd, resourceId)
        } else {
            const
                rawStart = record[me.startDateField] ?? record.get?.(me.startDateField),
                rawEnd   = record[me.endDateField]   ?? record.get?.(me.endDateField);

            if (rawStart != null && rawEnd != null) {
                const
                    startDate = rawStart instanceof Date ? rawStart : new Date(rawStart),
                    endDate   = rawEnd   instanceof Date ? rawEnd   : new Date(rawEnd);

                if (endDate.getTime() > visStartMs && startDate.getTime() < visEndMs) {
                    rawEvents = [record]
                }
            }
        }

        if (rawEvents.length === 0) {
            return []
        }

        const packed = rawEvents.length > 1
            ? IntervalPacker.pack(rawEvents, {
                startField: me.startDateField,
                endField  : me.endDateField
            })
            : [{item: rawEvents[0], lane: 0, laneCount: 1}];

        const descriptors = [];

        for (let i = 0, len = packed.length; i < len; i++) {
            const
                {item, lane, laneCount} = packed[i],
                rawStart                = item[me.startDateField] ?? item.get?.(me.startDateField),
                rawEnd                  = item[me.endDateField]   ?? item.get?.(me.endDateField);

            if (rawStart == null || rawEnd == null) {
                continue
            }

            const
                startDate      = rawStart instanceof Date ? rawStart : new Date(rawStart),
                endDate        = rawEnd   instanceof Date ? rawEnd   : new Date(rawEnd),
                clampedStartMs = Math.max(axisStart, Math.min(axisEnd, startDate.getTime())),
                clampedEndMs   = Math.max(clampedStartMs, Math.min(axisEnd, endDate.getTime())),
                left           = timeAxis.dateToOffset(clampedStartMs),
                right          = timeAxis.dateToOffset(clampedEndMs),
                width          = Math.max(minWidth, right - left),
                slotHeight     = usablePct / Math.max(1, laneCount),
                top            = marginPct + lane * slotHeight,
                height         = slotHeight,
                barKey         = item.id ?? item.get?.('id') ?? `${resourceId}-${i}`,
                title          = String(item[me.titleField] ?? item.get?.(me.titleField) ?? item.name ?? ''),
                percentDone    = Number(item[me.percentDoneField] ?? item.get?.(me.percentDoneField) ?? 0);

            descriptors.push({
                bar        : item,
                barKey,
                endDate,
                height,
                lane,
                laneCount,
                left,
                percentDone: Number.isFinite(percentDone) ? percentDone : 0,
                resourceId,
                startDate,
                title,
                top,
                width
            })
        }

        return descriptors
    }

    /**
     * @summary Computes the horizontally buffered `{visibleStart, visibleEnd, minPx, maxPx}` window.
     * @param {Number} [scrollLeft=this.scrollLeft]
     * @param {Number} [viewportWidth=this.effectiveViewportWidth]
     * @returns {{visibleStart: Date, visibleEnd: Date, minPx: Number, maxPx: Number}}
     */
    getVisibleDateRange(scrollLeft=this.scrollLeft, viewportWidth=this.effectiveViewportWidth) {
        const
            axis      = this.timeAxis,
            totalSize = axis?.totalSize || 0,
            buffer    = Math.max(0, this.bufferPx || 0),
            left      = Math.max(0, Number(scrollLeft) || 0),
            width     = Math.max(1, Number(viewportWidth) || 0),
            minPx     = Math.max(0, left - buffer),
            maxPx     = Math.min(totalSize, left + width + buffer);

        return {
            visibleStart: axis ? axis.offsetToDate(minPx) : new Date(0),
            visibleEnd  : axis ? axis.offsetToDate(maxPx) : new Date(0),
            minPx,
            maxPx
        }
    }

    /**
     * @summary Returns `true` when the visible viewport `[scrollLeft, scrollLeft + viewportWidth]`
     * extends outside the last projected `[#projectedMinPx, #projectedMaxPx]` window.
     * @description Delegates to {@link Neo.timeline.TimeAxis.needsReprojection}.
     * @param {Number} [scrollLeft=this.scrollLeft]
     * @param {Number} [viewportWidth=this.effectiveViewportWidth]
     * @returns {Boolean}
     */
    needsReprojection(scrollLeft=this.scrollLeft, viewportWidth=this.effectiveViewportWidth) {
        return TimeAxis.needsReprojection({
            bufferPx          : this.bufferPx,
            hasProjectedWindow: this.#hasProjectedWindow,
            projectedMaxPx    : this.#projectedMaxPx,
            projectedMinPx    : this.#projectedMinPx,
            scrollLeft,
            timeAxis          : this.timeAxis,
            viewportWidth
        })
    }

    /**
     * @summary Binds grid context and initializes `width` from `timeAxis.totalSize` on construction.
     */
    onConstructed() {
        super.onConstructed();

        if (this.timeAxis) {
            this.width = this.timeAxis.totalSize
        }

        this.recordProjectedWindow();
        this.bindGridContext()
    }

    /**
     * @summary Updates column `width`, `headerToolbar` body geometry, and mounted rows when `timeAxis` changes.
     * @protected
     */
    onTimeAxisChange() {
        const
            me           = this,
            totalSize    = me.timeAxis?.totalSize || 0,
            widthChanged = me.width !== totalSize;

        if (widthChanged) {
            me.width = totalSize;
            me.syncBodyGeometry()
        }

        me.refreshMountedRows()
    }

    /**
     * @summary Records `[minPx, maxPx]` for the current `(scrollLeft, effectiveViewportWidth)` window.
     * @protected
     */
    recordProjectedWindow() {
        if (!this.timeAxis) {
            this.#hasProjectedWindow = false;
            return
        }

        const {minPx, maxPx} = this.getVisibleDateRange();
        this.#projectedMinPx     = minPx;
        this.#projectedMaxPx     = maxPx;
        this.#hasProjectedWindow = true
    }

    /**
     * @summary Forces the owning `Neo.grid.Body` to re-run `cellRenderer` across mounted rows (`force = true`).
     */
    refreshMountedRows() {
        const body = this.parent?.body;

        this.recordProjectedWindow();

        if (body?.store?.getCount() > 0 && body.columnPositions?.getCount() > 0) {
            if (body.cellPoolSize === null) {
                body.refreshColumns(true)
            } else {
                body.createViewData(false, true)
            }
        }
    }

    /**
     * @summary Synchronizes the column's width into `body.columnPositions` and `body.availableWidth`.
     * @protected
     */
    syncBodyGeometry() {
        const
            me      = this,
            toolbar = me.parent?.headerToolbar,
            body    = me.parent?.body;

        if (!body) {
            return
        }

        if (toolbar?.mounted && typeof toolbar.passSizeToBody === 'function') {
            toolbar.passSizeToBody()
        } else if (body.columnPositions) {
            const
                existing = body.columnPositions.get(me.dataField),
                x        = existing?.x ?? 0;

            if (existing) {
                existing.width = me.width
            } else {
                body.columnPositions.add({
                    dataField: me.dataField,
                    width    : me.width,
                    x
                })
            }

            body.availableWidth = body.columnPositions.items.reduce((sum, pos) => sum + (pos.width || 0), 0)
        }
    }
}

export default Neo.setupClass(Column);
