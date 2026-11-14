import ClassSystemUtil        from '../util/ClassSystem.mjs';
import EventEditor            from '../timeline/EventEditor.mjs';
import EventStore             from '../timeline/store/Events.mjs';
import GridContainer          from '../grid/Container.mjs';
import SchedulerEventDragZone from './EventDragZone.mjs';
import TimeAxis               from '../timeline/TimeAxis.mjs';
import TimelineColumn         from '../timeline/Column.mjs';

const MS_PER_MINUTE = 60_000;

/**
 * @summary Resource-by-time scheduler (`Neo.scheduler.Container`) built on the multi-body `Neo.grid.Container` and shared timeline track.
 * @description Combines locked-start resource columns (`resourceColumns`) with a single `center`-region
 * {@link Neo.timeline.Column} (`ntype: 'timeline-header'`) spanning `timeAxis.totalSize`:
 *
 * 1. **Records as the truth:** Resources live in `store` (`Neo.data.Store`) and events live in `eventStore`
 *    ({@link Neo.timeline.store.Events}). Every event mutation — pointer drag move, start/end handle resize,
 *    keyboard rescheduling (`ArrowLeft` / `ArrowRight` / `Shift+ArrowLeft` / `Shift+ArrowRight`), or programmatic /
 *    Neural Link invocation — commits through the single writer {@link #moveEvent}, which validates and clamps
 *    `[startDate, endDate]`, applies one reactive `record.set(updates)` + `eventStore.doSort()`, and fires
 *    `eventChange`.
 * 2. **Cancel-safe pointer drag & resize:** Wires a single {@link Neo.scheduler.EventDragZone} (`barDraggable`)
 *    over `.neo-timeline-bar` and `.neo-resizable-start` / `.neo-resizable-end` handles. The zone owns its
 *    gesture end to end (`DragZone#dragStart` handshake via `getMainThreadConfigs()`, `DomEvent` routing by
 *    `dragZoneId`, cross-resource row hit-testing via {@link Neo.scheduler.EventDragZone#resolveTarget}, and
 *    drop commit through {@link #moveEvent}), aborting without mutating `eventRecord` on `Escape` (`drag:cancel`).
 * 3. **Buffered 2D virtualization:** Vertical row recycling comes from `Neo.grid.Body` and horizontal bar/tick
 *    windowing comes from {@link Neo.timeline.Column} and {@link Neo.timeline.TimeAxisHeader}
 *    (`[scrollLeft - bufferPx, scrollLeft + effectiveViewportWidth + bufferPx]`).
 *
 * @class Neo.scheduler.Container
 * @extends Neo.grid.Container
 * @see Neo.timeline.Column
 * @see Neo.timeline.TimeAxis
 * @see Neo.timeline.TimeAxisHeader
 * @see Neo.scheduler.EventDragZone
 * @see Neo.timeline.store.Events
 */
class Container extends GridContainer {
    /**
     * Built-in zoom scale presets consumed by {@link #zoomTo}.
     * @member {Object} zoomPresets
     * @static
     */
    static zoomPresets = {
        hour: {
            majorTickStep: 1,
            majorTickUnit: 'day',
            pxPerMinute  : 1.5,
            snapMinutes  : 15,
            tickStep     : 2,
            tickUnit     : 'hour'
        },
        day: {
            majorTickStep: 1,
            majorTickUnit: 'day',
            pxPerMinute  : 0.5,
            snapMinutes  : 30,
            tickStep     : 6,
            tickUnit     : 'hour'
        },
        week: {
            majorTickStep: 1,
            majorTickUnit: 'week',
            pxPerMinute  : 0.15,
            snapMinutes  : 60,
            tickStep     : 1,
            tickUnit     : 'day'
        }
    }

    /**
     * Declarative relay descriptors for container-level timeline configs forwarded to
     * {@link #timelineColumn}, its {@link Neo.timeline.TimeAxisHeader}, and/or {@link #eventDragZone}.
     * The base class installs hooks for its own keys at module load. Subclasses can override those
     * descriptors and supply their own `afterSet<Config>` hook for additional keys.
     * @member {Object} timelineRelays
     * @static
     */
    static timelineRelays = {
        barCls                          : {column: 'barCls',           refreshRows: true},
        barMarginPct                    : {column: 'barMarginPct',     refreshRows: true},
        barRenderer                     : {column: 'barRenderer',      refreshRows: true},
        bufferPx                        : {column: 'bufferPx'},
        enableResizingAcrossOppositeEdge: {always: true,               dragZone: 'enableResizingAcrossOppositeEdge'},
        endDateField                    : {column: 'endDateField',     refreshRows: true},
        eventStore                      : {always: true,               column: 'eventStore', dragZone: 'store'},
        majorFormatter                  : {column: 'majorFormatter',   header: 'majorFormatter'},
        majorTickStep                   : {column: 'majorTickStep',    header: 'majorTickStep'},
        majorTickUnit                   : {column: 'majorTickUnit',    header: 'majorTickUnit'},
        minBarWidthPx                   : {column: 'minBarWidthPx',    refreshRows: true},
        minimumDuration                 : {always: true,               dragZone: 'minimumDuration'},
        minorFormatter                  : {column: 'minorFormatter',   header: 'minorFormatter'},
        percentDoneField                : {column: 'percentDoneField', refreshRows: true},
        resizableBars                   : {column: 'resizableBars',    refreshRows: true},
        resourceIdField                 : {column: 'resourceIdField',  refreshRows: true},
        showNonWorkingTime              : {always: true,               column: 'showNonWorkingTime', header: 'showNonWorkingTime', refreshRows: true},
        startDateField                  : {column: 'startDateField',   refreshRows: true},
        timeAxis                        : {always: true,               column: 'timeAxis',   dragZone: 'axis'},
        timelineDataField               : {column: 'dataField'},
        timelineText                    : {column: 'text',             header: 'text'},
        titleField                      : {column: 'titleField',       refreshRows: true},
        viewportWidth                   : {column: 'viewportWidth'}
    }

    static config = {
        /**
         * @member {String} className='Neo.scheduler.Container'
         * @protected
         */
        className: 'Neo.scheduler.Container',
        /**
         * @member {String} ntype='scheduler'
         * @protected
         */
        ntype: 'scheduler',
        /**
         * @member {String[]} baseCls=['neo-scheduler','neo-grid-container']
         * @protected
         */
        baseCls: ['neo-scheduler', 'neo-grid-container'],
        /**
         * Optional extra CSS class(es) added to each `.neo-timeline-bar` node.
         * @member {String|String[]|null} barCls_=null
         * @reactive
         */
        barCls_: null,
        /**
         * Enables interactive pointer drag-move and edge-resize of `.neo-timeline-bar` elements via {@link #eventDragZone}.
         * @member {Boolean} barDraggable_=true
         * @reactive
         */
        barDraggable_: true,
        /**
         * Vertical padding percentage (`0..45`) left above and below packed bars inside a row cell.
         * @member {Number} barMarginPct_=8
         * @reactive
         */
        barMarginPct_: 8,
        /**
         * Optional custom hook `(barDescriptor, context) => Object|String|null` forwarded to {@link Neo.timeline.Column}.
         * @member {Function|null} barRenderer_=null
         * @reactive
         */
        barRenderer_: null,
        /**
         * Horizontal overscan buffer in pixels on each side of the visible center viewport.
         * @member {Number} bufferPx_=400
         * @reactive
         */
        bufferPx_: 400,
        /**
         * Enables opening the shared {@link Neo.timeline.EventEditor} dialog on bar double-click,
         * focused `Enter`, or {@link #openEventEditor}.
         * @member {Boolean} editable_=true
         * @reactive
         */
        editable_: true,
        /**
         * Optional config overrides passed when creating the shared {@link #eventEditor}.
         * @member {Object|null} editorConfig=null
         */
        editorConfig: null,
        /**
         * Allow resizing past the opposite edge to flip start and end dates while honoring `minimumDuration`.
         * @member {Boolean} enableResizingAcrossOppositeEdge_=true
         * @reactive
         */
        enableResizingAcrossOppositeEdge_: true,
        /**
         * Field name on event records holding the end date.
         * @member {String} endDateField_='endDate'
         * @reactive
         */
        endDateField_: 'endDate',
        /**
         * Config overrides passed when creating {@link #eventDragZone}.
         * @member {Object|null} eventDragZoneConfig=null
         */
        eventDragZoneConfig: null,
        /**
         * The {@link Neo.timeline.store.Events} holding scheduled event records across resources.
         * @member {Neo.timeline.store.Events|Object|null} eventStore_=null
         * @reactive
         */
        eventStore_: null,
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
         * Minimum rendered bar width in pixels so short events remain visible and grabbable.
         * @member {Number} minBarWidthPx_=4
         * @reactive
         */
        minBarWidthPx_: 4,
        /**
         * Minimum allowed event duration in minutes (`>= 1`) during drag-resize, keyboard resize, and {@link #moveEvent}.
         * @member {Number} minimumDuration_=15
         * @reactive
         */
        minimumDuration_: 15,
        /**
         * Optional formatter `(tick, timeAxis) => String` forwarded to `TimeAxisHeader`.
         * @member {Function|null} minorFormatter_=null
         * @reactive
         */
        minorFormatter_: null,
        /**
         * Field name on event records holding completion percentage (`0..100`).
         * @member {String} percentDoneField_='percentDone'
         * @reactive
         */
        percentDoneField_: 'percentDone',
        /**
         * When `true`, renders `.neo-resizable-start` and `.neo-resizable-end` handles inside each bar.
         * @member {Boolean} resizableBars_=true
         * @reactive
         */
        resizableBars_: true,
        /**
         * Column descriptors for the resource table (locked `'start'` by default unless a column specifies `locked`).
         * @member {Object[]} resourceColumns_=[{dataField:'name',text:'Resource',width:200,locked:'start'}]
         * @reactive
         */
        resourceColumns_: [
            {dataField: 'name', text: 'Resource', width: 200, locked: 'start'}
        ],
        /**
         * Field or key property on resource row records used to look up events in `eventStore`.
         * @member {String} resourceIdField_='id'
         * @reactive
         */
        resourceIdField_: 'id',
        /**
         * Default row height in pixels for resource timeline rows.
         * @member {Number} rowHeight=48
         * @reactive
         */
        rowHeight: 48,
        /**
         * When `true`, renders `.neo-timeline-non-working` shading bands in both {@link #timelineColumn}
         * and its {@link Neo.timeline.TimeAxisHeader}.
         * @member {Boolean} showNonWorkingTime_=false
         * @reactive
         */
        showNonWorkingTime_: false,
        /**
         * Field name on event records holding the start date.
         * @member {String} startDateField_='startDate'
         * @reactive
         */
        startDateField_: 'startDate',
        /**
         * The {@link Neo.timeline.TimeAxis} instance driving horizontal bar coordinates, header ticks, and column width.
         * @member {Neo.timeline.TimeAxis|Object|null} timeAxis_=null
         * @reactive
         */
        timeAxis_: null,
        /**
         * Optional config overrides merged into the synthesized center {@link Neo.timeline.Column}.
         * @member {Object|null} timelineColumnConfig=null
         */
        timelineColumnConfig: null,
        /**
         * `dataField` identifier used for the center {@link Neo.timeline.Column}.
         * @member {String} timelineDataField_='timeline'
         * @reactive
         */
        timelineDataField_: 'timeline',
        /**
         * Header fallback label for the center {@link Neo.timeline.Column}.
         * @member {String} timelineText_='Timeline'
         * @reactive
         */
        timelineText_: 'Timeline',
        /**
         * Field name on event records holding the display title.
         * @member {String} titleField_='title'
         * @reactive
         */
        titleField_: 'title',
        /**
         * Initial center viewport width fallback in pixels before live body clip measurement completes.
         * @member {Number} viewportWidth_=1200
         * @reactive
         */
        viewportWidth_: 1200
    }

    /**
     * Active {@link Neo.scheduler.EventDragZone} instance managing bar move and edge resize gestures.
     * @member {Neo.scheduler.EventDragZone|null} eventDragZone=null
     */
    eventDragZone = null

    /**
     * Shared {@link Neo.timeline.EventEditor} dialog instance created lazily on first open and reused across bars.
     * @member {Neo.timeline.EventEditor|null} eventEditor=null
     */
    eventEditor = null

    /**
     * Synthesized center {@link Neo.timeline.Column} instance.
     * @member {Neo.timeline.Column|null} timelineColumn=null
     */
    timelineColumn = null

    /** Axis instances constructed from this container's config. */
    #ownedAxes = new WeakSet()

    /** Event stores constructed from this container's config. */
    #ownedStores = new WeakSet()

    /**
     * @summary Installs the Scheduler's bar editing, drag and keyboard handlers.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.addDomListeners([
            {dblclick    : me.onBarDoubleClick, delegate: '.neo-timeline-bar', scope: me},
            {'drag:start': me.onBarDragStart,   delegate: '.neo-timeline-bar', scope: me},
            {keydown     : me.onBarKeyDown,     delegate: '.neo-timeline-bar', scope: me},
            {keydown     : me.onSchedulerKeyDown, scope: me}
        ]);

        if (me.barDraggable) {
            me.ensureEventDragZone()
        }
    }

    /**
     * @summary Forwards `appName` to {@link #eventDragZone} and {@link #eventEditor}.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);

        if (value && this.eventDragZone) {
            this.eventDragZone.appName = value
        }
        if (value && this.eventEditor) {
            this.eventEditor.appName = value
        }
    }

    /**
     * @summary Creates or tears down {@link #eventDragZone} when `barDraggable` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetBarDraggable(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            if (value) {
                this.ensureEventDragZone()
            } else if (this.eventDragZone) {
                this.eventDragZone.destroy();
                this.eventDragZone = null
            }
        }
    }

    /**
     * @summary Hides {@link #eventEditor} if open when `editable` is set to `false`.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetEditable(value, oldValue) {
        if (!value && this.eventEditor && !this.eventEditor.hidden) {
            this.eventEditor.hide()
        }
    }

    /** @summary Relays a replacement store before releasing the previous owned store. */
    afterSetEventStore(value, oldValue) {
        this.relayTimelineConfig('eventStore', value, oldValue);
        if (oldValue && oldValue !== value && this.#ownedStores.has(oldValue)) oldValue.destroy()
    }

    /** @summary Relays a replacement axis before releasing the previous owned axis. */
    afterSetTimeAxis(value, oldValue) {
        this.relayTimelineConfig('timeAxis', value, oldValue);
        if (oldValue && oldValue !== value && this.#ownedAxes.has(oldValue)) oldValue.destroy()
    }

    /**
     * @summary Rebuilds the grid columns when `resourceColumns` changes at runtime.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetResourceColumns(value, oldValue) {
        if (oldValue !== undefined && this.configsApplied && this._columns) {
            this.createColumns(null, this._columns)
        }
    }

    /**
     * @summary Forwards `windowId` to {@link #eventDragZone} and {@link #eventEditor}.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        if (this.eventDragZone) {
            this.eventDragZone.windowId = value
        }
        if (this.eventEditor) {
            this.eventEditor.windowId = value
        }
    }

    /**
     * @summary Relays a container-level timeline config change to {@link #timelineColumn}, its header component, and/or {@link #eventDragZone}.
     * @description Consults {@link Neo.scheduler.Container.timelineRelays} for `configName`, forwarding `value` to
     * `timelineColumn`, `timelineColumn.headerComponent`, and `eventDragZone`, and refreshing mounted rows when `refreshRows` is set.
     * @param {String} configName
     * @param {*} value
     * @param {*} oldValue
     * @protected
     */
    relayTimelineConfig(configName, value, oldValue) {
        const
            descriptor = this.constructor.timelineRelays?.[configName],
            column     = this.timelineColumn;

        if (!descriptor || (!descriptor.always && oldValue === undefined)) {
            return
        }

        if (descriptor.column && column) {
            const colProp  = typeof descriptor.column === 'string' ? descriptor.column : configName;
            const colValue = configName === 'eventStore' ? this.getTimelineColumnStore() : value;
            if (!descriptor.always || column[colProp] !== colValue) {
                column[colProp] = colValue
            }
            if (descriptor.header && column.headerComponent) {
                const headerProp = typeof descriptor.header === 'string' ? descriptor.header : configName;
                column.headerComponent[headerProp] = value
            }
            if (descriptor.refreshRows) {
                column.refreshMountedRows()
            }
        }

        if (descriptor.dragZone && this.eventDragZone) {
            this.eventDragZone[descriptor.dragZone] = configName === 'eventStore' ? this.getTimelineRecordStore() : value
        }
    }

    /**
     * @summary Coerces `eventStore` config objects into a {@link Neo.timeline.store.Events} instance.
     * @param {Neo.timeline.store.Events|Object|null} value
     * @returns {Neo.timeline.store.Events|null}
     * @protected
     */
    beforeSetEventStore(value) {
        if (!value) {
            return null
        }
        const store = ClassSystemUtil.beforeSetInstance(value, EventStore);
        if (store !== value) this.#ownedStores.add(store);
        return store
    }

    /**
     * @summary Coerces `timeAxis` config objects into a {@link Neo.timeline.TimeAxis} instance.
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
     * @summary Returns the descriptors for the locked resource columns.
     * @returns {Object[]}
     * @protected
     */
    getTimelineLockedColumns() { return this.resourceColumns }

    /**
     * @summary Returns the timeline column class used by this family.
     * @returns {Function}
     * @protected
     */
    getTimelineColumnClass() { return TimelineColumn }

    /**
     * @summary Returns the store whose records the timeline edits.
     * @returns {Neo.data.Store|null}
     * @protected
     */
    getTimelineRecordStore() { return this.eventStore }

    /**
     * @summary Returns the gesture zone class used by this family.
     * @returns {Function}
     * @protected
     */
    getEventDragZoneClass() { return SchedulerEventDragZone }

    /**
     * @summary Returns the family defaults used when creating its gesture zone.
     * @returns {Object}
     * @protected
     */
    getEventDragZoneDefaults() { return {useProxy: true, moveInMainThread: false} }

    /**
     * @summary Returns the event store projected by the timeline column.
     * @returns {Neo.data.Store|null}
     * @protected
     */
    getTimelineColumnStore() { return this.eventStore }

    /**
     * @summary Assembles the locked and timeline column descriptors.
     * @param {Object[]|null} [extraColumns=null] Additional columns.
     * @returns {Object[]}
     * @protected
     */
    buildSchedulerColumns(extraColumns=null) {
        const
            me              = this,
            lockedColumns   = me.getTimelineLockedColumns(),
            resourceColumns = Array.isArray(lockedColumns) ? lockedColumns : [],
            columnClass     = me.getTimelineColumnClass(),
            built           = [];

        for (const col of resourceColumns) {
            if (col && typeof col === 'object') {
                built.push({
                    locked: 'start',
                    ...col
                })
            }
        }

        if (Array.isArray(extraColumns)) {
            for (const col of extraColumns) {
                if (
                    col &&
                    typeof col === 'object' &&
                    col.dataField !== me.timelineDataField &&
                    col.module !== TimelineColumn &&
                    col.module !== columnClass &&
                    !(col instanceof TimelineColumn) &&
                    !built.some(existing => existing.dataField === col.dataField)
                ) {
                    built.push({...col})
                }
            }
        }

        built.push({
            module            : columnClass,
            ntype             : 'timeline-header',
            barCls            : me.barCls,
            barMarginPct      : me.barMarginPct,
            barRenderer       : me.barRenderer,
            bufferPx          : me.bufferPx,
            dataField         : me.timelineDataField,
            endDateField      : me.endDateField,
            eventStore        : me.getTimelineColumnStore(),
            majorFormatter    : me.majorFormatter,
            majorTickStep     : me.majorTickStep,
            majorTickUnit     : me.majorTickUnit,
            minBarWidthPx     : me.minBarWidthPx,
            minorFormatter    : me.minorFormatter,
            percentDoneField  : me.percentDoneField,
            resizableBars     : me.resizableBars,
            resourceIdField   : me.resourceIdField,
            showNonWorkingTime: me.showNonWorkingTime,
            startDateField    : me.startDateField,
            text              : me.timelineText,
            timeAxis          : me.timeAxis,
            titleField        : me.titleField,
            viewportWidth     : me.viewportWidth,
            ...me.timelineColumnConfig
        });

        return built
    }

    /**
     * @summary Builds the combined resource + timeline column collection and caches {@link #timelineColumn}.
     * @param {Object[]|null} columns
     * @param {Neo.collection.Base|Object[]} [oldColumns=this._columns]
     * @returns {Neo.collection.Base}
     */
    createColumns(columns, oldColumns=this._columns) {
        const
            me         = this,
            built      = me.buildSchedulerColumns(columns),
            collection = super.createColumns(built, oldColumns);

        me.timelineColumn = collection?.get(me.timelineDataField) ||
            collection?.items?.find(col => col instanceof TimelineColumn) || null;

        return collection
    }

    /**
     * @summary Destroys {@link #eventEditor} and {@link #eventDragZone} before tearing down the grid container.
     * @param {...any} args
     */
    destroy(...args) {
        const axis = this.timeAxis, store = this.eventStore;
        this.eventEditor?.destroy();
        this.eventEditor    = null;
        this.eventDragZone?.destroy();
        this.eventDragZone  = null;
        this.timelineColumn = null;

        super.destroy(...args);
        if (axis && this.#ownedAxes.has(axis)) axis.destroy();
        if (store && this.#ownedStores.has(store)) store.destroy()
    }

    /**
     * @summary Commits an editor or drag gesture through the scheduler's single writer.
     * @param {Neo.data.Model} record Current event record.
     * @param {Object} changes Requested changes.
     * @param {Object} [meta] Gesture metadata.
     * @returns {Object|Boolean} Applied changes, or false when the edit was not accepted.
     */
    commitTimelineEdit(record, changes, meta={}) {
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return false;
        return this.moveEvent(record, {...changes, fields: {...changes, ...changes.fields}}, meta) ?? false
    }

    /**
     * @summary Returns the container's shared {@link Neo.timeline.EventEditor} instance, creating it lazily on first access.
     * @returns {Neo.timeline.EventEditor}
     */
    ensureEventEditor() {
        const me = this;

        if (!me.eventEditor || me.eventEditor.isDestroyed) {
            me.eventEditor = Neo.create({
                module  : EventEditor,
                appName : me.appName,
                id      : `${me.id}__event-editor`,
                owner   : me,
                theme   : me.theme,
                windowId: me.windowId,
                ...me.getDefaultEditorConfig(),
                ...me.editorConfig
            })
        }

        return me.eventEditor
    }

    /**
     * @summary Lazily instantiates and configures {@link #eventDragZone} ({@link Neo.scheduler.EventDragZone}).
     * @returns {Neo.scheduler.EventDragZone}
     */
    ensureEventDragZone() {
        const me = this;

        if (!me.eventDragZone || me.eventDragZone.isDestroyed) {
            me.eventDragZone = Neo.create({
                module                          : me.getEventDragZoneClass(),
                appName                         : me.appName,
                axis                            : me.timeAxis,
                dragElement                     : me.vdom,
                enableResizingAcrossOppositeEdge: me.enableResizingAcrossOppositeEdge,
                minimumDuration                 : me.minimumDuration,
                orientation                     : 'horizontal',
                owner                           : me,
                store                           : me.getTimelineRecordStore(),
                windowId                        : me.windowId,
                ...me.getEventDragZoneDefaults(),
                ...me.eventDragZoneConfig
            })
        } else {
            me.eventDragZone.set({
                appName                         : me.appName,
                axis                            : me.timeAxis,
                enableResizingAcrossOppositeEdge: me.enableResizingAcrossOppositeEdge,
                minimumDuration                 : me.minimumDuration,
                store                           : me.getTimelineRecordStore(),
                windowId                        : me.windowId
            })
        }

        return me.eventDragZone
    }

    /**
     * @summary Extracts the `.neo-timeline-bar` node and optional resize handle edge (`'start' | 'end' | null`) from `path`.
     * @param {Object[]} [path=[]]
     * @returns {{barNode: Object|null, resizeEdge: ('start'|'end'|null), trackNode: Object|null}}
     * @protected
     */
    extractBarTarget(path=[]) {
        let barNode    = null,
            resizeEdge = null,
            trackNode  = null;

        for (const node of path) {
            const cls = Array.isArray(node?.cls)
                ? node.cls
                : typeof node?.cls === 'string'
                    ? node.cls.split(/\s+/)
                    : [];

            if (!resizeEdge) {
                if (cls.includes('neo-resizable-start')) {
                    resizeEdge = 'start'
                } else if (cls.includes('neo-resizable-end')) {
                    resizeEdge = 'end'
                }
            }

            if (!barNode && cls.includes('neo-timeline-bar')) {
                barNode = node
            }

            if (!trackNode && cls.includes('neo-timeline-track')) {
                trackNode = node
            }
        }

        return {barNode, resizeEdge, trackNode}
    }

    /**
     * @summary Finds the rendered `.neo-timeline-bar` VDOM node id for `eventId`, if currently mounted in a row.
     * @param {String|Number} eventId
     * @returns {String|null}
     * @protected
     */
    findBarId(eventId) {
        if (eventId === null || eventId === undefined) {
            return null
        }

        const
            column = this.timelineColumn,
            rows   = this.body?.items || [];

        for (const row of rows) {
            const barId = column?.getBarNodeId?.(row?.vdom, eventId);
            if (barId) {
                return barId
            }
        }

        return null
    }

    /**
     * @summary Default config overrides for {@link #eventEditor} per container subclass.
     * @returns {Object}
     * @protected
     */
    getDefaultEditorConfig() {
        return {
            showResourceField: Boolean(this.eventStore),
            title            : 'Edit event'
        }
    }

    /**
     * @summary Returns events for a resource intersecting the given range, or the axis range by default.
     * @param {String|Number} resourceId
     * @param {Date|String|Number|null} [start=null]
     * @param {Date|String|Number|null} [end=null]
     * @returns {Neo.data.Model[]}
     */
    getResourceEvents(resourceId, start=null, end=null) {
        const {eventStore: store, timeAxis: axis} = this;
        if (!store) return [];
        if (typeof store.getResourceEvents === 'function') {
            return store.getResourceEvents(resourceId, start, end)
        }

        const from = start ?? axis?.start, to = end ?? axis?.end;
        if (from == null || to == null) return [];

        if (resourceId != null && typeof store.getRangeRecords === 'function' &&
            store.getRangeRecords !== EventStore.prototype.getRangeRecords) {
            return store.getRangeRecords(from, to, resourceId)
        }

        if (this.startDateField === 'startDate' && this.endDateField === 'endDate' && resourceId != null) {
            return typeof store.getRangeRecords === 'function'
                ? store.getRangeRecords(from, to, resourceId)
                : EventStore.getRangeRecords(store, from, to, resourceId)
        }

        const
            fromMs = new Date(from).getTime(),
            toMs   = new Date(to).getTime(),
            result = [];

        for (let i = 0; i < store.getCount(); i++) {
            const record = store.getAt(i);
            if (record && EventStore.sameResourceId(record.resourceId, resourceId) &&
                EventStore.intersectsRange(new Date(record[this.startDateField]).getTime(),
                    new Date(record[this.endDateField]).getTime(), fromMs, toMs)) {
                result.push(record)
            }
        }
        return result
    }

    /**
     * @summary Normalizes single-object `{record|key|eventId, ...changes, meta}` arguments into
     * `{eventIdOrRecord, changes, meta}` for {@link #moveEvent} and subclass overrides.
     * @param {Neo.data.Model|Object|String|Number} eventIdOrRecord
     * @param {Object} [changes={}]
     * @param {Object} [meta={}]
     * @param {Number} [argCount=arguments.length]
     * @returns {{eventIdOrRecord: *, changes: Object, meta: Object}}
     * @protected
     */
    normalizeMoveEventArgs(eventIdOrRecord, changes={}, meta={}, argCount=arguments.length, idField='eventId') {
        if (
            argCount === 1 &&
            eventIdOrRecord &&
            typeof eventIdOrRecord === 'object' &&
            !eventIdOrRecord.isModel &&
            (
                eventIdOrRecord.record  !== undefined ||
                eventIdOrRecord.key     !== undefined ||
                eventIdOrRecord[idField] !== undefined
            )
        ) {
            const {record: optRecord, key, [idField]: id, meta: optMeta, ...rest} = eventIdOrRecord;
            eventIdOrRecord = optRecord ?? key ?? id;
            changes         = rest;
            meta            = optMeta || {}
        }

        return {eventIdOrRecord, changes, meta}
    }

    /**
     * @summary Single writer for rescheduling, reassigning, or editing an event record (`drag`, `resize`, `keyboard`,
     * `EventEditor`, or programmatic/NL API). Validates and clamps `[startDate, endDate]` against {@link #timeAxis} and
     * {@link #minimumDuration}, merges any extra `fields` into one reactive `record.set(updates)` (running
     * `eventStore.doSort()` only when `eventStore.sorters?.length > 0`), and fires `eventChange`. Returns `null` when
     * nothing changed.
     * @param {Neo.data.Model|Object|String|Number} eventIdOrRecord Record instance, record key, or single-object options `{record|key|eventId, startDate, endDate, resourceId, percentDone, title, fields, meta}`
     * @param {Object} [changes={}] Accepts `startDate` (or `[startDateField]`), `endDate` (or `[endDateField]`),
     * `resourceId`, `percentDone` (or `[percentDoneField]`), `title` (or `[titleField]`), and `fields` (plain object of extra model fields; `keyProperty` is refused)
     * @param {Date|String|Number} [changes.startDate]
     * @param {Date|String|Number} [changes.endDate]
     * @param {String|Number} [changes.resourceId]
     * @param {Number} [changes.percentDone]
     * @param {String} [changes.title]
     * @param {Object} [changes.fields]
     * @param {Object} [meta={}]
     * @param {String} [meta.action]
     * @param {Boolean} [meta.clamp=true]
     * @param {String|null} [meta.resizeEdge=null]
     * @param {String} [meta.source='api']
     * @returns {Object|null} The applied `updates` object, or `null` if no-op/invalid
     */
    moveEvent(eventIdOrRecord, changes={}, meta={}) {
        ({eventIdOrRecord, changes, meta} = this.normalizeMoveEventArgs(eventIdOrRecord, changes, meta, arguments.length));

        const
            me     = this,
            record = me.resolveEventRecord(eventIdOrRecord);

        if (!record || !changes || typeof changes !== 'object') {
            return null
        }

        const
            axis       = me.timeAxis,
            startField = me.startDateField   || 'startDate',
            endField   = me.endDateField     || 'endDate',
            pctField   = me.percentDoneField || 'percentDone',
            titleField = me.titleField       || 'title',
            keyProp    = me.eventStore?.keyProperty || me.store?.keyProperty || 'id',
            rawFields  = changes.fields && typeof changes.fields === 'object' && !Array.isArray(changes.fields)
                ? changes.fields
                : {},
            rawPrevStart  = record[startField],
            rawPrevEnd    = record[endField],
            prevStartMs   = rawPrevStart instanceof Date ? rawPrevStart.getTime() : new Date(rawPrevStart).getTime(),
            prevEndMs     = rawPrevEnd   instanceof Date ? rawPrevEnd.getTime()   : new Date(rawPrevEnd).getTime(),
            prevResource  = record.resourceId,
            rawStartInput = changes.startDate !== undefined ? changes.startDate : changes[startField],
            rawEndInput   = changes.endDate   !== undefined ? changes.endDate   : changes[endField],
            hasStartInput = rawStartInput !== undefined && rawStartInput !== null,
            hasEndInput   = rawEndInput   !== undefined && rawEndInput   !== null,
            toMs          = val => {
                if (val instanceof Date) {
                    return val.getTime()
                }
                if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
                    return (axis || TimeAxis).parseDayKey(val.trim()).getTime()
                }
                return new Date(val).getTime()
            };

        let startMs = hasStartInput ? toMs(rawStartInput) : prevStartMs,
            endMs   = hasEndInput   ? toMs(rawEndInput)   : prevEndMs;

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
            return null
        }

        const minMs = Math.max(1, me.minimumDuration || axis?.snapMinutes || 15) * MS_PER_MINUTE;

        if (hasStartInput || hasEndInput) {
            if (axis && meta.clamp !== false) {
                const
                    axisStartMs = axis.start.getTime(),
                    axisEndMs   = axis.end.getTime(),
                    durationMs  = Math.max(minMs, endMs - startMs);

                if (hasStartInput && hasEndInput && meta.source !== 'resize') {
                    startMs = Math.max(axisStartMs, Math.min(startMs, axisEndMs - durationMs));
                    endMs   = Math.min(axisEndMs, startMs + durationMs)
                } else if (hasStartInput && !hasEndInput) {
                    endMs   = Math.min(axisEndMs, prevEndMs);
                    startMs = Math.max(axisStartMs, Math.min(startMs, endMs - minMs))
                } else if (!hasStartInput && hasEndInput) {
                    startMs = Math.max(axisStartMs, prevStartMs);
                    endMs   = Math.min(axisEndMs, Math.max(endMs, startMs + minMs))
                }
            } else if (endMs < startMs + minMs) {
                endMs = startMs + minMs
            }
        }

        const
            nextStart     = new Date(startMs),
            nextEnd       = new Date(endMs),
            nextResource  = changes.resourceId !== undefined ? changes.resourceId : prevResource,
            updates       = {},
            forbiddenKeys = new Set([
                'id', keyProp, 'endDate', 'eventId', 'fields', 'key', 'meta', 'record', 'resourceId', 'startDate', 'taskId',
                startField, endField
            ]);

        if (startMs !== prevStartMs) {
            updates[startField] = nextStart
        }

        if (endMs !== prevEndMs) {
            updates[endField] = nextEnd
        }

        if (nextResource !== undefined && !EventStore.sameResourceId(nextResource, prevResource)) {
            updates.resourceId = nextResource
        }

        const
            rawPctInput   = changes.percentDone !== undefined ? changes.percentDone : changes[pctField] !== undefined ? changes[pctField] : rawFields.percentDone !== undefined ? rawFields.percentDone : rawFields[pctField],
            rawTitleInput = changes.title       !== undefined ? changes.title       : changes[titleField] !== undefined ? changes[titleField] : rawFields.title !== undefined ? rawFields.title : rawFields[titleField];

        if (rawPctInput !== undefined) {
            const
                prevPct    = record[pctField] ?? 0,
                clampedPct = rawPctInput === null ? 0 : Math.min(100, Math.max(0, Number(rawPctInput) || 0));

            if (clampedPct !== prevPct) {
                updates[pctField] = clampedPct
            }
        }

        if (rawTitleInput !== undefined) {
            const prevTitle = record[titleField];
            if (rawTitleInput !== prevTitle) {
                updates[titleField] = rawTitleInput
            }
        }

        for (const [fieldKey, fieldVal] of Object.entries(rawFields)) {
            if (
                forbiddenKeys.has(fieldKey) ||
                fieldKey === pctField ||
                fieldKey === 'percentDone' ||
                fieldKey === titleField ||
                fieldKey === 'title' ||
                fieldVal === undefined
            ) {
                continue
            }

            if (fieldVal !== record[fieldKey]) {
                updates[fieldKey] = fieldVal
            }
        }

        if (Object.keys(updates).length === 0) {
            return null
        }

        const previous = {};
        for (const key of Object.keys(updates)) {
            const val = record[key];
            previous[key] = val instanceof Date ? new Date(val.getTime()) : val
        }

        record.set(updates);

        if (me.eventStore?.sorters?.length > 0) {
            me.eventStore.doSort()
        }

        const action = meta.action || (meta.resizeEdge ? 'resize' : 'move');

        me.fire('eventChange', {
            action,
            changes   : updates,
            endDate   : nextEnd,
            previous,
            record,
            resizeEdge: meta.resizeEdge || null,
            resourceId: nextResource,
            source    : meta.source || 'api',
            startDate : nextStart,
            updates
        });

        return updates
    }

    /**
     * @summary Opens the shared {@link #eventEditor} when a `.neo-timeline-bar` is double-clicked and {@link #editable} is `true`.
     * @param {Object} [data={}]
     * @returns {Neo.timeline.EventEditor|null}
     * @protected
     */
    onBarDoubleClick(data={}) {
        const me = this;

        if (!me.editable) {
            return null
        }

        const
            {barNode, resizeEdge} = me.extractBarTarget(data.path || data.targetPath || []),
            eventId               = barNode?.data?.eventId ?? data.target?.data?.eventId;

        if (resizeEdge || (eventId === undefined || eventId === null)) {
            return null
        }

        return me.openEventEditor(eventId, barNode?.id || data.target?.id || null)
    }

    /**
     * @summary Returns gesture context when a bar gesture is enabled for this family.
     * @param {Neo.timeline.draggable.EventDragZone} zone Gesture zone.
     * @param {Object[]} path Pointer path.
     * @returns {Object|null}
     * @protected
     */
    getBarDragContext(zone, path) { return this.barDraggable ? {} : null }

    /**
     * @summary Configures the floating preview for a bar gesture.
     * @param {Neo.timeline.draggable.EventDragZone} zone Gesture zone.
     * @param {Object} barNode Dragged bar VDOM.
     * @param {Neo.data.Model} record Dragged record.
     * @protected
     */
    configureEventDragPreview(zone, barNode, record) {
        const barClasses = Array.isArray(barNode.cls) ? barNode.cls : String(barNode.cls || '').split(/\s+/);
        zone.dragProxyConfig = {
            ...zone.dragProxyConfig,
            vdom: {
                cls : ['neo-scheduler-drag-preview', ...barClasses.filter(cls => cls.startsWith('neo-scheduler-bar-'))],
                text: String(record[this.titleField] ?? '')
            }
        }
    }

    /**
     * @summary Handles delegated drag starts on timeline bars and resize handles.
     * @param {Object} data Pointer event data.
     * @protected
     */
    async onBarDragStart(data={}) {
        const me = this;

        if ((!me.barDraggable && !me.eventDragZone) || !me.timeAxis || !me.getTimelineRecordStore()) {
            return
        }

        const
            path                             = data.path || data.targetPath || [],
            {barNode, resizeEdge, trackNode} = me.extractBarTarget(path),
            eventId                          = barNode?.data?.eventId,
            record                           = me.resolveEventRecord(eventId);

        if (!barNode || !record || (resizeEdge && !me.resizableBars)) {
            return
        }

        const zone    = me.ensureEventDragZone();
        const gesture = me.getBarDragContext(zone, path);
        if (!gesture) return;

        let trackOrigin = 0;

        if (Number.isFinite(trackNode?.rect?.left)) {
            trackOrigin = trackNode.rect.left
        } else if (Number.isFinite(trackNode?.rect?.x)) {
            trackOrigin = trackNode.rect.x
        } else if (Number.isFinite(barNode?.rect?.left)) {
            trackOrigin = barNode.rect.left - me.timeAxis.dateToOffset(record[me.startDateField])
        }

        zone.set({
            axis       : me.timeAxis,
            dragElement: barNode,
            eventRecord: record,
            resizeEdge,
            store      : me.getTimelineRecordStore(),
            trackOrigin
        });

        if (zone.useProxy) {
            me.configureEventDragPreview(zone, barNode, record)
        }

        await zone.dragStart(data, gesture.terminal)
    }

    /**
     * @summary Keyboard handler for focused `.neo-timeline-bar` elements:
     * - `Enter` opens the shared {@link #eventEditor} when {@link #editable} is `true`;
     * - `Escape` aborts an active drag gesture;
     * - `ArrowLeft` / `ArrowRight` shifts `[startDate, endDate]` by `±snapMinutes`;
     * - `Shift+ArrowLeft` / `Shift+ArrowRight` resizes `endDate` by `±snapMinutes`.
     * @param {Object} data
     * @returns {Neo.timeline.EventEditor|null|undefined}
     * @protected
     */
    onBarKeyDown(data={}) {
        const
            me   = this,
            key  = data.key,
            axis = me.timeAxis;

        if (key === 'Escape' && (me.eventDragZone?.initialSnapshot || me.eventDragZone?.isDragStarting)) {
            me.eventDragZone.onDragCancel(data);
            return
        }

        if (key === 'Enter') {
            if (!me.editable) {
                return null
            }

            const
                {barNode} = me.extractBarTarget(data.path || data.targetPath || []),
                eventId   = barNode?.data?.eventId ?? data.target?.data?.eventId;

            if (eventId === undefined || eventId === null) {
                return null
            }

            return me.openEventEditor(eventId, barNode?.id || data.target?.id || null)
        }

        if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
            return
        }

        const
            {barNode} = me.extractBarTarget(data.path || data.targetPath || []),
            record    = me.resolveEventRecord(barNode?.data?.eventId);

        if (!record || !axis) {
            return
        }

        const
            direction   = key === 'ArrowRight' ? 1 : -1,
            stepMinutes = Math.max(1, axis.snapMinutes || me.minimumDuration || 15),
            deltaMs     = direction * stepMinutes * MS_PER_MINUTE,
            startMs     = new Date(record[me.startDateField]).getTime(),
            endMs       = new Date(record[me.endDateField]).getTime();

        if (data.shiftKey) {
            if (!me.resizableBars) {
                return
            }

            me.moveEvent(record, {
                endDate: new Date(endMs + deltaMs)
            }, {
                resizeEdge: 'end',
                source    : 'keyboard'
            })
        } else {
            me.moveEvent(record, {
                endDate  : new Date(endMs + deltaMs),
                startDate: new Date(startMs + deltaMs)
            }, {
                source: 'keyboard'
            })
        }
    }

    /**
     * @summary Cancels an active bar drag when `Escape` reaches the scheduler container directly.
     * @param {Object} data
     * @protected
     */
    onSchedulerKeyDown(data={}) {
        if (data.key === 'Escape' && (this.eventDragZone?.initialSnapshot || this.eventDragZone?.isDragStarting)) {
            this.eventDragZone.onDragCancel(data)
        }
    }

    /**
     * @summary Alias for {@link #onBarKeyDown} handling timeline bar keyboard events (`Enter`, `Escape`, `ArrowLeft`/`ArrowRight`).
     * @param {Object} [data={}]
     * @returns {Neo.timeline.EventEditor|null|undefined}
     */
    onTimelineKeyDown(data={}) {
        return this.onBarKeyDown(data)
    }

    /**
     * @summary Opens the shared {@link Neo.timeline.EventEditor} bound to `eventIdOrRecord`.
     * Returns `null` when {@link #editable} is `false` or the record cannot be resolved.
     * @param {Neo.data.Model|String|Number} eventIdOrRecord
     * @param {String|null} [barId=null]
     * @returns {Neo.timeline.EventEditor|null}
     */
    openEventEditor(eventIdOrRecord, barId=null) {
        const me = this;

        if (!me.editable) {
            return null
        }

        const record = me.resolveEventRecord(eventIdOrRecord);
        if (!record) {
            return null
        }

        const resolvedBarId = barId || me.findBarId(record.id);

        return me.ensureEventEditor().openForRecord(record, resolvedBarId)
    }

    /**
     * @summary Resolves an event record strictly from {@link #eventStore} by key or verifies that a passed record instance belongs to {@link #eventStore}.
     * @param {Neo.data.Model|String|Number} eventIdOrRecord
     * @returns {Neo.data.Model|null}
     */
    resolveEventRecord(eventIdOrRecord) {
        const store = this.getTimelineRecordStore();
        if (!store || eventIdOrRecord === null || eventIdOrRecord === undefined) {
            return null
        }

        if (typeof eventIdOrRecord === 'object') {
            const key = eventIdOrRecord[store.keyProperty || 'id'];
            if (key === null || key === undefined) {
                return null
            }
            return store.get(key) === eventIdOrRecord ? eventIdOrRecord : null
        }

        let record = store.get(eventIdOrRecord) || null;

        if (!record && typeof eventIdOrRecord === 'string' && /^-?\d+$/.test(eventIdOrRecord)) {
            record = store.get(Number(eventIdOrRecord)) || null
        }

        return record
    }

    /**
     * @summary Delegates row drop-target resolution (`{id, resourceId}`) to {@link #eventDragZone}.
     * @param {Object} [data={}]
     * @returns {{id: String, resourceId: *}|null}
     */
    resolveRowTarget(data={}) {
        return this.ensureEventDragZone().resolveTarget(data)
    }

    /**
     * @summary Applies a named zoom preset (`'hour' | 'day' | 'week'`) or custom `timeAxis` configuration object.
     * @param {String|Object} presetOrConfig
     * @returns {Neo.timeline.TimeAxis|null}
     */
    zoomTo(presetOrConfig) {
        const
            me     = this,
            axis   = me.timeAxis,
            config = typeof presetOrConfig === 'string'
                ? me.constructor.zoomPresets[presetOrConfig]
                : presetOrConfig;

        if (!axis || !config || typeof config !== 'object') {
            return axis
        }

        const {majorTickStep, majorTickUnit, ...axisConfig} = config;

        if (majorTickUnit !== undefined) {
            me.majorTickUnit = majorTickUnit
        }
        if (majorTickStep !== undefined) {
            me.majorTickStep = majorTickStep
        }

        axis.set(axisConfig);
        return axis
    }
}

for (const configName of Object.keys(Container.timelineRelays)) {
    if (configName === 'eventStore' || configName === 'timeAxis') continue;
    const methodName = `afterSet${configName[0].toUpperCase()}${configName.slice(1)}`;

    Container.prototype[methodName] = function(value, oldValue) {
        this.relayTimelineConfig(configName, value, oldValue)
    }
}

export default Neo.setupClass(Container);
