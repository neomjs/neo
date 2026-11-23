import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from '../component/Base.mjs';
import DateUtil        from '../util/Date.mjs';
import TimeAxis        from './TimeAxis.mjs';

/**
 * @summary Two-tier timeline header (`Neo.timeline.TimeAxisHeader`) projecting only viewport-visible major and minor ticks.
 * @description Sits inside `Neo.grid.header.Toolbar` as the header item for the `center` timeline track column
 * (`Neo.timeline.Column`), following the virtualized projection model of `Neo.grid.header.GroupRow#project()`.
 *
 * Instead of mounting or measuring a `Neo.grid.header.Button` per time slot, `TimeAxisHeader` spans the full
 * `timeAxis.totalSize` width (`flex: 'none'`, numeric `width`) so `Neo.grid.header.Toolbar#isMeasuredWidth`
 * returns `false` and `passSizeToBody()` computes `columnPositions` synchronously without a main-thread
 * `getLayoutRect` round-trip. Inside its two track rows (`.neo-timeline-header-major` and
 * `.neo-timeline-header-minor`), `project()` renders only the ticks intersecting
 * `[scrollLeft - bufferPx, scrollLeft + viewportWidth + bufferPx]` via `TimeAxis#getTicks(visibleStart, visibleEnd)`,
 * and `afterSetScrollLeft` re-projects only when the visible `[scrollLeft, scrollLeft + effectiveViewportWidth]`
 * window leaves the last projected `[#projectedMinPx, #projectedMaxPx]` range.
 *
 * @class Neo.timeline.TimeAxisHeader
 * @extends Neo.component.Base
 * @see Neo.timeline.TimeAxis
 * @see Neo.timeline.Column
 */
class TimeAxisHeader extends Component {
    /**
     * @summary Formats wall-clock fields carried by a Date's UTC getters, or the range up to an inclusive end.
     * @param {String} locale
     * @param {Object} options `Intl.DateTimeFormat` options; the zone is UTC because the date already holds wall time
     * @param {Date} wall
     * @param {Date} [wallEnd]
     * @returns {String}
     */
    static formatWall(locale, options, wall, wallEnd) {
        return DateUtil.formatWall(locale, options, wall, wallEnd)
    }

    /**
     * @summary Returns the last wall-clock moment of a tick, whose `endDate` is exclusive.
     * @param {Neo.timeline.TimeAxis|Function} axis
     * @param {Object} tick
     * @returns {Date}
     */
    static lastWallMoment(axis, tick) {
        return new Date(+axis.wallTime(tick.endDate) - 1)
    }

    static config = {
        /**
         * @member {String} className='Neo.timeline.TimeAxisHeader'
         * @protected
         */
        className: 'Neo.timeline.TimeAxisHeader',
        /**
         * @member {String} ntype='timeline-header'
         * @protected
         */
        ntype: 'timeline-header',
        /**
         * @member {String[]} baseCls=['neo-timeline-header','neo-grid-header-button']
         * @protected
         */
        baseCls: ['neo-timeline-header', 'neo-grid-header-button'],
        /**
         * Horizontal overscan buffer in pixels on each side of the visible viewport.
         * @member {Number} bufferPx_=400
         * @reactive
         */
        bufferPx_: 400,
        /**
         * Compatibility config for `Neo.grid.header.Wrapper#hasColumnMenus`.
         * @member {Boolean} columnMenu_=false
         * @reactive
         */
        columnMenu_: false,
        /**
         * Column `dataField` matched by `Neo.grid.header.Toolbar#getColumn`.
         * @member {String} dataField_='timeline'
         * @reactive
         */
        dataField_: 'timeline',
        /**
         * Fixed `'none'` flex so `Neo.grid.header.Toolbar#isMeasuredWidth` treats `width` as config-owned.
         * @member {String} flex='none'
         */
        flex: 'none',
        /**
         * Compatibility config for `Neo.grid.Container#syncFilteredHeaders`.
         * @member {Boolean} isFiltered_=false
         * @reactive
         */
        isFiltered_: false,
        /**
         * Compatibility config for `Neo.grid.Container#removeSortingCss`.
         * @member {String|null} isSorted_=null
         * @reactive
         */
        isSorted_: null,
        /**
         * Locale of the default tick labels; `majorFormatter` and `minorFormatter` replace them.
         * @member {String} locale_=Neo.config.locale
         * @reactive
         */
        locale_: Neo.config.locale,
        /**
         * Multi-body lock region (`null` for the scrollable center timeline region).
         * @member {String|null} locked_=null
         * @reactive
         */
        locked_: null,
        /**
         * Optional formatter `(tick, timeAxis) => String` for major tick labels.
         * @member {Function|null} majorFormatter_=null
         * @reactive
         */
        majorFormatter_: null,
        /**
         * Step multiplier for the major tick row when `majorTickUnit` is set.
         * @member {Number} majorTickStep_=1
         * @reactive
         */
        majorTickStep_: 1,
        /**
         * Explicit unit (`'minute' | 'hour' | 'day' | 'week' | 'month'`) for the major tick row.
         * When `null`, derives automatically from `timeAxis.tickUnit`.
         * @member {String|null} majorTickUnit_=null
         * @reactive
         */
        majorTickUnit_: null,
        /**
         * Optional formatter `(tick, timeAxis) => String` for minor tick labels.
         * @member {Function|null} minorFormatter_=null
         * @reactive
         */
        minorFormatter_: null,
        /**
         * Timeline headers size from `timeAxis.totalSize` rather than interactive column resize handles.
         * @member {Boolean} resizable_=false
         * @reactive
         */
        resizable_: false,
        /**
         * WAI-ARIA role inside the header row.
         * @member {String} role='columnheader'
         */
        role: 'columnheader',
        /**
         * Current horizontal scroll offset in center-content pixels.
         * @member {Number} scrollLeft_=0
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * Compatibility config for `Neo.grid.header.Toolbar#afterSetShowHeaderFilters`.
         * @member {Boolean} showHeaderFilter_=false
         * @reactive
         */
        showHeaderFilter_: false,
        /**
         * When `true`, renders `.neo-timeline-non-working` shading bands inside the minor header row
         * for `timeAxis.getNonWorkingRanges(visibleStart, visibleEnd)`.
         * @member {Boolean} showNonWorkingTime_=false
         * @reactive
         */
        showNonWorkingTime_: false,
        /**
         * Compatibility config for `Neo.grid.header.Toolbar#afterSetSortable`.
         * @member {Boolean} sortable_=false
         * @reactive
         */
        sortable_: false,
        /**
         * Header label used by `Neo.grid.Container#toCsv` and root `aria-label`.
         * @member {String} text='Timeline'
         */
        text: 'Timeline',
        /**
         * The `Neo.timeline.TimeAxis` instance driving tick positions and scale width.
         * @member {Neo.timeline.TimeAxis|Object|null} timeAxis_=null
         * @reactive
         */
        timeAxis_: null,
        /**
         * Compatibility config for `Neo.grid.header.Toolbar#afterSetUseTriStateSorting`.
         * @member {Boolean} useTriStateSorting_=false
         * @reactive
         */
        useTriStateSorting_: false,
        /**
         * Visible center viewport width in pixels (`> 0`). Updated automatically from the grid's center clip
         * width when mounted inside a `Neo.grid.Container`, or set directly in standalone/headless tests.
         * @member {Number} viewportWidth_=1200
         * @reactive
         */
        viewportWidth_: 1200,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [
                {cls: ['neo-timeline-header-row', 'neo-timeline-header-major'], role: 'none', cn: []},
                {cls: ['neo-timeline-header-row', 'neo-timeline-header-minor'], role: 'none', cn: []}
            ]
        }
    }

    /**
     * Cleanup functions for active `timeAxis` config subscriptions.
     * @member {Function[]} #axisCleanups=[]
     * @private
     */
    #axisCleanups = []

    /** @type {WeakSet<Neo.timeline.TimeAxis>} */
    #ownedAxes = new WeakSet()

    /**
     * Cleanup functions for active parent `headerToolbar` / `gridContainer` config subscriptions.
     * @member {Function[]} #gridCleanups=[]
     * @private
     */
    #gridCleanups = []

    /**
     * True once `#projectedMinPx` and `#projectedMaxPx` hold a valid projected window.
     * @member {Boolean} #hasProjectedWindow=false
     * @private
     */
    #hasProjectedWindow = false

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
     * The {@link #axisLeft} the last projected window was measured from.
     * @member {Number} #projectedAxisLeft=0
     * @private
     */
    #projectedAxisLeft = 0

    /**
     * @summary The center-content x in pixels where this header starts: the width of the columns before it in its
     * scrolling region. The time axis has scrolled `scrollLeft - axisLeft` pixels.
     * @returns {Number}
     */
    get axisLeft() {
        return this.parent?.gridContainer?.body?.columnPositions?.get(this.dataField)?.x || 0
    }

    /**
     * @summary Returns the visible width of the timeline header between the locked grid bodies.
     * @returns {Number}
     */
    get effectiveViewportWidth() {
        const
            toolbar       = this.parent,
            gridContainer = toolbar?.gridContainer,
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
     * @summary Coerces `timeAxis` config objects into a `Neo.timeline.TimeAxis` instance.
     * @param {Neo.timeline.TimeAxis|Object|null} value
     * @returns {Neo.timeline.TimeAxis|null}
     * @protected
     */
    beforeSetTimeAxis(value) {
        if (!value) {
            return null
        }
        const axis = ClassSystemUtil.beforeSetInstance(value, TimeAxis);
        if (axis !== value) this.#ownedAxes.add(axis);
        return axis
    }

    /**
     * @summary Re-projects ticks when `bufferPx` changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetBufferPx(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Re-projects ticks when `locale` changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetLocale(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Marks the header with its lock region's class, as `Neo.grid.header.Button#afterSetLocked` does, so the
     * region seam rules of `grid/header/Button.css` reach a locked timeline.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLocked(value, oldValue) {
        let cls = this.cls.filter(item => item !== 'neo-locked-start' && item !== 'neo-locked-end');

        if (value === 'start' || value === 'end') {
            cls.push(`neo-locked-${value}`)
        }

        this.cls = cls
    }

    /**
     * @summary Re-projects ticks when `majorFormatter` changes.
     * @param {Function|null} value
     * @param {Function|null} oldValue
     * @protected
     */
    afterSetMajorFormatter(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Re-projects ticks when `majorTickStep` changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMajorTickStep(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Re-projects ticks when `majorTickUnit` changes.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetMajorTickUnit(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Re-projects ticks when `minorFormatter` changes.
     * @param {Function|null} value
     * @param {Function|null} oldValue
     * @protected
     */
    afterSetMinorFormatter(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Connects to the owning `Neo.grid.header.Toolbar` when `parentId` is assigned.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetParentId(value, oldValue) {
        super.afterSetParentId(value, oldValue);

        if (this.isConstructed) {
            this.bindGridContext()
        }
    }

    /**
     * @summary Re-projects visible ticks when `scrollLeft` leaves the last projected buffered window.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed && this.needsReprojection(value)) {
            this.project()
        }
    }

    /**
     * @summary Re-projects header ticks and non-working shading bands when `showNonWorkingTime` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowNonWorkingTime(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Maps `text` to the root `aria-label` attribute without overwriting `vdom.cn`.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetText(value, oldValue) {
        if (value) {
            this.changeVdomRootKey('aria-label', value)
        }
    }

    /**
     * @summary Subscribes to `timeAxis` config changes and synchronizes header width and tick projection.
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

            for (const prop of ['start', 'end', 'pxPerMinute', 'size', 'tickUnit', 'tickStep', 'nonWorkingDays', 'nonWorkingDates', 'timeZone', 'now']) {
                me.#axisCleanups.push(
                    me.observeConfig(value, prop, () => me.onTimeAxisChange())
                )
            }
        }

        if (oldValue && oldValue !== value && me.#ownedAxes.has(oldValue)) oldValue.destroy();

        if (me.isConstructed) {
            me.project()
        }
    }

    /** @summary Releases subscriptions and an axis created by this header. */
    destroy(...args) {
        const axis = this.timeAxis;
        this.#axisCleanups.forEach(cleanup => cleanup());
        this.#axisCleanups = [];
        this.#gridCleanups.forEach(cleanup => cleanup());
        this.#gridCleanups = [];
        super.destroy(...args);
        if (axis && this.#ownedAxes.has(axis)) axis.destroy()
    }

    /**
     * @summary Re-projects visible ticks when `viewportWidth` changes.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetViewportWidth(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.project()
        }
    }

    /**
     * @summary Binds reactive subscriptions to the parent `Neo.grid.header.Toolbar` and `Neo.grid.Container` bodies.
     * @protected
     */
    bindGridContext() {
        const
            me            = this,
            toolbar       = me.parent,
            gridContainer = toolbar?.gridContainer;

        me.#gridCleanups.forEach(cleanup => cleanup());
        me.#gridCleanups = [];

        if (toolbar instanceof Component) {
            me.scrollLeft = toolbar.scrollLeft || 0;

            if (typeof toolbar.getConfig === 'function' && toolbar.getConfig('scrollLeft')) {
                me.#gridCleanups.push(
                    me.observeConfig(toolbar, 'scrollLeft', scrollLeft => {
                        me.scrollLeft = scrollLeft || 0
                    })
                )
            }
        }

        if (gridContainer?.body) {
            const
                {body}      = gridContainer,
                // `passSizeToBody()` clears the positions, then adds them: only the second event carries the geometry
                onPositions = ({addedItems}) => {
                    if (addedItems?.length && me.axisLeft !== me.#projectedAxisLeft) me.project()
                };

            body.columnPositions.on('mutate', onPositions);

            me.#gridCleanups.push(
                me.observeConfig(body, 'containerWidth', () => me.project()),
                () => body.isDestroyed || body.columnPositions.un('mutate', onPositions)
            )
        }

        if (gridContainer?.bodyStart) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.bodyStart, 'availableWidth', () => me.project())
            )
        } else if (gridContainer?.horizontalScrollbar) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.horizontalScrollbar, 'startWidth', () => me.project())
            )
        }

        if (gridContainer?.bodyEnd) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.bodyEnd, 'availableWidth', () => me.project())
            )
        } else if (gridContainer?.horizontalScrollbar) {
            me.#gridCleanups.push(
                me.observeConfig(gridContainer.horizontalScrollbar, 'endWidth', () => me.project())
            )
        }

        const column = gridContainer?.centerColumns?.find(col => col.dataField === me.dataField)
            || gridContainer?.columns?.get?.(me.dataField);

        if (column) {
            if (!me.timeAxis && column.timeAxis) {
                me.timeAxis = column.timeAxis
            }
            column.bindGridContext?.(me)
        }
    }

    /**
     * @summary Formats a major tick label using `majorFormatter`, or a `locale` label in the axis' zone:
     * "Mon, Nov 9, 14:00" for an hour, "Mon, Nov 9" for a day, "Nov 9 – 15" for a week,
     * "November 2026" for a month and "2026" for a calendar year (en-US shown).
     * @param {{date: Date, endDate: Date, offset: Number, size: Number, unit: String, index: Number}} tick
     * @returns {String}
     */
    formatMajorTick(tick) {
        const me = this;

        if (typeof me.majorFormatter === 'function') {
            return String(me.majorFormatter(tick, me.timeAxis))
        }

        const
            {formatWall, lastWallMoment} = me.constructor,
            axis                         = me.timeAxis || TimeAxis,
            {locale}                     = me,
            wall                         = axis.wallTime(tick.date);

        switch (tick.unit) {
            case 'minute':
            case 'hour':
                return formatWall(locale, {weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}, wall);
            case 'week':
                return formatWall(locale, {month: 'short', day: 'numeric'}, wall, lastWallMoment(axis, tick));
            case 'month': {
                const
                    end    = lastWallMoment(axis, tick),
                    months = (end.getUTCFullYear() - wall.getUTCFullYear()) * 12 + end.getUTCMonth() - wall.getUTCMonth();

                if (months === 0) {
                    return formatWall(locale, {month: 'long', year: 'numeric'}, wall)
                }

                return months === 11 && wall.getUTCMonth() === 0
                    ? formatWall(locale, {year: 'numeric'}, wall)
                    : formatWall(locale, {month: 'short', year: 'numeric'}, wall, end)
            }
            default:
                return formatWall(locale, {weekday: 'short', month: 'short', day: 'numeric'}, wall)
        }
    }

    /**
     * @summary Formats a minor tick label using `minorFormatter`, or a short label in the axis' zone:
     * "14:00" for a minute or an hour, "09" for a day, "Nov 9" for a week and "Nov" for a month (en-US shown).
     * @param {{date: Date, endDate: Date, offset: Number, size: Number, unit: String, index: Number}} tick
     * @returns {String}
     */
    formatMinorTick(tick) {
        const me = this;

        if (typeof me.minorFormatter === 'function') {
            return String(me.minorFormatter(tick, me.timeAxis))
        }

        const d = (me.timeAxis || TimeAxis).wallTime(tick.date);

        switch (tick.unit) {
            case 'minute':
            case 'hour':
                return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
            case 'day':
                return String(d.getUTCDate()).padStart(2, '0');
            case 'month':
                return me.constructor.formatWall(me.locale, {month: 'short'}, d);
            default:
                return me.constructor.formatWall(me.locale, {month: 'short', day: 'numeric'}, d)
        }
    }

    /**
     * @summary Computes the horizontally buffered `{visibleStart, visibleEnd, minPx, maxPx}` window in axis pixels.
     * @param {Number} [scrollLeft=this.scrollLeft] Center-content pixels, from which {@link #axisLeft} is subtracted
     * @param {Number} [viewportWidth=this.effectiveViewportWidth]
     * @returns {{visibleStart: Date, visibleEnd: Date, minPx: Number, maxPx: Number}}
     */
    getVisibleDateRange(scrollLeft=this.scrollLeft, viewportWidth=this.effectiveViewportWidth) {
        const
            axis      = this.timeAxis,
            totalSize = axis?.totalSize || 0,
            buffer    = Math.max(0, this.bufferPx || 0),
            left      = Math.max(0, (Number(scrollLeft) || 0) - this.axisLeft),
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
     * @param {Number} [scrollLeft=this.scrollLeft] Center-content pixels, from which {@link #axisLeft} is subtracted
     * @param {Number} [viewportWidth=this.effectiveViewportWidth]
     * @returns {Boolean}
     */
    needsReprojection(scrollLeft=this.scrollLeft, viewportWidth=this.effectiveViewportWidth) {
        return TimeAxis.needsReprojection({
            bufferPx          : this.bufferPx,
            hasProjectedWindow: this.#hasProjectedWindow,
            projectedMaxPx    : this.#projectedMaxPx,
            projectedMinPx    : this.#projectedMinPx,
            scrollLeft        : (Number(scrollLeft) || 0) - this.axisLeft,
            timeAxis          : this.timeAxis,
            viewportWidth
        })
    }

    /**
     * @summary Binds grid context and performs the initial tick projection on construction.
     */
    onConstructed() {
        super.onConstructed();
        this.bindGridContext();
        this.project()
    }

    /**
     * @summary Handles reactive `timeAxis` scale/range changes, updating `width`, `headerToolbar` body geometry, and ticks.
     * @protected
     */
    onTimeAxisChange() {
        const
            me           = this,
            totalSize    = me.timeAxis?.totalSize || 0,
            widthChanged = me.width !== totalSize;

        if (widthChanged) {
            me.width = totalSize;
            me.wrapperStyle = {...me.wrapperStyle, width: `${totalSize}px`}
        }

        me.project();

        if (widthChanged && typeof me.parent?.passSizeToBody === 'function') {
            me.parent.passSizeToBody()
        }
    }

    /**
     * @summary Projects only the major and minor ticks intersecting `[scrollLeft - bufferPx, scrollLeft + viewportWidth + bufferPx]`.
     * @param {Number} [scrollLeft=this.scrollLeft]
     * @param {Number} [viewportWidth=this.effectiveViewportWidth]
     * @returns {{majorTicks: Object[], minorTicks: Object[], visibleStart: Date|null, visibleEnd: Date|null}}
     */
    project(scrollLeft=this.scrollLeft, viewportWidth=this.effectiveViewportWidth) {
        const
            me                   = this,
            {timeAxis, vdom}     = me,
            [majorRow, minorRow] = vdom.cn;

        majorRow.id = `${me.id}__major`;
        minorRow.id = `${me.id}__minor`;

        if (!timeAxis) {
            this.#hasProjectedWindow = false;
            majorRow.cn = [];
            minorRow.cn = [];
            me.update();
            return {majorTicks: [], minorTicks: [], visibleStart: null, visibleEnd: null}
        }

        const
            totalSize                                = timeAxis.totalSize,
            {visibleStart, visibleEnd, minPx, maxPx} = me.getVisibleDateRange(scrollLeft, viewportWidth),
            {unit: majorUnit, step: majorStep}       = me.resolveMajorScale(),
            majorTicks                               = timeAxis.getTicks(visibleStart, visibleEnd, majorUnit, majorStep),
            minorTicks                               = timeAxis.getTicks(visibleStart, visibleEnd),
            nonWorkingNodes                          = me.showNonWorkingTime && timeAxis.hasWorkingCalendar()
                ? timeAxis.getNonWorkingRanges(visibleStart, visibleEnd).map(range => ({
                    id           : `${me.id}__nw-${range.key}`,
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
                : [];

        me.#projectedAxisLeft  = me.axisLeft;
        me.#projectedMinPx     = minPx;
        me.#projectedMaxPx     = maxPx;
        me.#hasProjectedWindow = true;

        if (me.width !== totalSize) {
            me.width = totalSize
        }

        vdom.style = {
            ...vdom.style,
            width: `${totalSize}px`
        };

        const
            nowOffset = timeAxis.getNowOffset(),
            showNow   = nowOffset !== null && nowOffset >= minPx && nowOffset <= maxPx,
            tickCls   = (tick, row) => showNow && nowOffset >= tick.offset && nowOffset < tick.offset + tick.size
                ? ['neo-timeline-tick', row, 'neo-timeline-tick-current']
                : ['neo-timeline-tick', row];

        // In both rows the label is its own node, so it can stay sticky while its tick is partly scrolled out
        majorRow.cn = majorTicks.map(tick => ({
            id  : `${me.id}__major-tick-${tick.index}`,
            cls : tickCls(tick, 'neo-timeline-tick-major'),
            role: 'none',
            data: {
                date : tick.date.toISOString(),
                index: String(tick.index),
                unit : tick.unit
            },
            style: {
                left : `${tick.offset}px`,
                width: `${tick.size}px`
            },
            cn: [{tag: 'span', cls: ['neo-timeline-tick-label'], text: me.formatMajorTick(tick)}]
        }));

        minorRow.cn = [
            ...minorTicks.map(tick => ({
                id  : `${me.id}__minor-tick-${tick.index}`,
                cls : tickCls(tick, 'neo-timeline-tick-minor'),
                role: 'none',
                data: {
                    date : tick.date.toISOString(),
                    index: String(tick.index),
                    unit : tick.unit
                },
                style: {
                    left : `${tick.offset}px`,
                    width: `${tick.size}px`
                },
                cn: [{tag: 'span', cls: ['neo-timeline-tick-label'], text: me.formatMinorTick(tick)}]
            })),
            ...nonWorkingNodes,
            ...showNow ? [{
                id           : `${me.id}__now`,
                cls          : ['neo-timeline-now'],
                'aria-hidden': 'true',
                style        : {left: `${nowOffset}px`}
            }] : []
        ];

        me.update();

        return {majorTicks, minorTicks, visibleStart, visibleEnd}
    }

    /**
     * @summary Compatibility no-op for `Neo.grid.Container#removeSortingCss`.
     */
    removeSortingCss() {}

    /**
     * @summary Resolves the `{unit, step}` scale for the major header row from `majorTickUnit` or `timeAxis.tickUnit`.
     * @returns {{unit: String, step: Number}}
     */
    resolveMajorScale() {
        if (this.majorTickUnit) {
            return {
                unit: this.majorTickUnit,
                step: Math.max(1, this.majorTickStep || 1)
            }
        }

        switch (this.timeAxis?.tickUnit) {
            case 'minute':
                return {unit: 'hour', step: 1};
            case 'hour':
                return {unit: 'day', step: 1};
            case 'day':
                return {unit: 'week', step: 1};
            case 'week':
                return {unit: 'month', step: 1};
            case 'month':
                return {unit: 'month', step: 12};
            default:
                return {unit: 'day', step: 1}
        }
    }

    /**
     * @summary Serializes the header state for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        const me = this;

        return {
            ...super.toJSON(),
            bufferPx     : me.bufferPx,
            dataField    : me.dataField,
            majorTickStep: me.majorTickStep,
            majorTickUnit: me.majorTickUnit,
            scrollLeft   : me.scrollLeft,
            viewportWidth: me.viewportWidth,
            width        : me.width
        }
    }
}

export default Neo.setupClass(TimeAxisHeader);
