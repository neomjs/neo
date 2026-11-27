import ClassSystemUtil    from '../util/ClassSystem.mjs';
import Component          from '../component/Base.mjs';
import SchedulerContainer from '../scheduler/Container.mjs';
import TimeAxis           from '../timeline/TimeAxis.mjs';
import {isDescriptor}     from '../core/ConfigSymbols.mjs';
import Body               from './Body.mjs';
import Cascade            from './Cascade.mjs';
import CascadeMotion      from './CascadeMotion.mjs';
import Column             from './Column.mjs';
import DependencyLayer    from './DependencyLayer.mjs';
import DependencyStore    from './DependencyStore.mjs';
import EventDragZone      from './EventDragZone.mjs';
import TaskStore          from './TaskStore.mjs';

const GanttColumn = Column, GanttBody = Body,
    MS_PER_MINUTE = 60_000, MS_PER_HOUR = 3_600_000, MS_PER_DAY = 86_400_000;

/**
 * @summary Task tree and dependency timeline with a single task-edit writer.
 * @description A row is a task from the tree store. Parents use their stored dates by default. A task store
 * with `rollupParents` derives each phase from its children and publishes edits to every chart that shares it.
 * When a date edit triggers a cascade, each reachable successor
 * starts at the latest start required by its incoming links. A shorter predecessor can pull work earlier;
 * a longer one can push work beyond the visible axis. The working calendar, when enabled, determines
 * the elapsed span of the task's working duration. See {@link #moveTask} and {@link #schedule}.
 * @class Neo.gantt.Container
 * @extends Neo.scheduler.Container
 */
class Container extends SchedulerContainer {
    /**
     * The scheduler's relay descriptors with the dependency layer as a further target: `layer` names the layer
     * config a chart config feeds, at the layer's creation ({@link #getDependencyLayerInputs}) and on every later
     * change ({@link #relayTimelineConfig}).
     * @member {Object} timelineRelays
     * @static
     */
    static timelineRelays = Neo.merge(Neo.clone(SchedulerContainer.timelineRelays, true), {
        appName        : {layer: 'appName'},
        bufferPx       : {layer: 'bufferPx'},
        dependencyStore: {layer: 'dependencyStore'},
        endDateField   : {layer: 'endDateField'},
        rowHeight      : {layer: 'rowHeight'},
        startDateField : {layer: 'startDateField'},
        store          : {layer: 'taskStore'},
        timeAxis       : {layer: 'timeAxis'},
        windowId       : {layer: 'windowId'}
    })

    static config = {
        /**
         * @member {String} className='Neo.gantt.Container'
         * @protected
         */
        className: 'Neo.gantt.Container',
        /**
         * @member {String} ntype='gantt'
         * @protected
         */
        ntype: 'gantt',
        /**
         * Moves the bars and links a cascade changed from their previous to their final dates over the chart's
         * `--motion-panel` with `--ease-out-soft`, instead of in one update. A dragged or resized task stays where
         * its preview dropped it while its successors move. Reduced motion collapses that tier to `0ms` and keeps
         * one update, and so does a chart whose tier read has not answered yet. A scroll, a zoom, a store load,
         * filter or sort, and the next move land a running move at once; another store drops it. A service decision
         * that settles later lands in one update.
         * See {@link Neo.gantt.CascadeMotion}.
         * @member {Boolean} animateCascade_=false
         * @reactive
         */
        animateCascade_: false,
        /**
         * Padding around bars in each row.
         * @member {Number} barMarginPct=14
         * @reactive
         */
        barMarginPct: 14,
        /**
         * @member {String[]} baseCls=['neo-gantt','neo-grid-container']
         * @protected
         */
        baseCls: ['neo-gantt', 'neo-grid-container'],
        /**
         * Dependency arithmetic and downstream cascade collaborator, normalized via
         * {@link Neo.util.ClassSystem#beforeSetInstance}. Pass `{module: CustomCascade}`, a class, or an instance;
         * `null` instantiates the default {@link Neo.gantt.Cascade} class (use {@link #cascadeDependencies} to disable edit cascades).
         * @member {Neo.gantt.Cascade|Object|null} cascade_=null
         * @reactive
         */
        cascade_: null,
        /**
         * Recompute dependent tasks after an edit.
         * @member {Boolean} cascadeDependencies_=true
         * @reactive
         */
        cascadeDependencies_: true,
        /**
         * Enables or filters link gestures.
         * @member {Boolean|Function} dependencyCreation_=false
         * @reactive
         */
        dependencyCreation_: false,
        /**
         * Overrides for the dependency overlay, merged deep: a subclass or an instance changes one key, or the
         * layer class through `module`. Applied once, when {@link #ensureDependencyLayer} creates the layer.
         * Reactive so that an instance config merges too: a plain config merges only between classes.
         * @member {Object|null} dependencyLayerConfig_={[isDescriptor]:true,merge:'deep',value:null}
         * @reactive
         */
        dependencyLayerConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
        /**
         * Dependency records.
         * @member {Neo.gantt.DependencyStore|Object|null} dependencyStore_=null
         * @reactive
         */
        dependencyStore_: null,
        /**
         * The armed first endpoint of a keyboard link as `{record, barId, row}`, null while none is armed. Write
         * `{record, barId}`: {@link #beforeSetKeyboardLinkSource} adds the task's rendered row.
         * @member {Object|null} keyboardLinkSource_=null
         * @protected
         * @reactive
         */
        keyboardLinkSource_: null,
        /**
         * Minimum visible width for a task bar.
         * @member {Number} minBarWidthPx=6
         * @reactive
         */
        minBarWidthPx: 6,
        /**
         * Optional service borrowed from the application. It writes accepted edits into the same task and
         * dependency stores the chart displays. If supplied, its `store` and `dependencyStore` must be the
         * same instances as the chart's. Each hook is optional:
         *
         * - `handlesTask(key)` selects service-owned tasks; false uses the ordinary cascade.
         * - `moveTask(key, changes)` applies an edit and returns its receipt; `linkTasks(edge)` handles a link.
         *   If a method is absent, the chart handles that operation.
         * - `onCommit(listener)` returns an unsubscribe function and notifies after a committed batch.
         *   `isPublishing` marks the batch's notification phase so subscribed charts defer intermediate redraws.
         * - `onDecisionSettled(id, listener)` returns an unsubscribe function or null and delivers a pending
         *   decision's terminal receipt once. The originating chart publishes a committed edit if its owner,
         *   stores and record still match.
         *
         * A task-edit receipt has status `committed`, `pending`, `refused`, or `unchanged`. A commit can carry
         * `updates`, `previous`, `cascaded` entries (`taskId`, `changes`, `previous`), `cycles`, and
         * `notificationErrors`; a pending receipt carries `pending.id`. A refusal can carry a `message` for
         * the editor. Settled receipts can also identify their `taskId` and `action`.
         * @member {Neo.gantt.Container.GanttScheduleService|null} schedule_=null
         * @reactive
         */
        schedule_: null,
        /**
         * Displays the axis working calendar.
         * @member {Boolean} showNonWorkingTime=true
         * @reactive
         */
        showNonWorkingTime: true,
        /**
         * Locked task tree column descriptors.
         * @member {Object[]} taskColumns_=[{type:'tree',dataField:'title',text:'Task',width:260,locked:'start'}]
         * @reactive
         */
        taskColumns_: [{type: 'tree', dataField: 'title', text: 'Task', width: 260, locked: 'start'}],
        /**
         * Evaluate task durations using the axis calendar.
         * @member {Boolean} useWorkingTime_=false
         * @reactive
         */
        useWorkingTime_: false
    }

    /**
     * The registered schedule analysis, an object providing `invalidateSchedule` and `getHighlights`.
     * @member {Object|null} #analysis=null
     * @private
     */
    #analysis = null
    /**
     * The highlights from before an analysis registered as `{tasks, edges}`, restored on its release.
     * @member {Object|null} #analysisPrevious=null
     * @private
     */
    #analysisPrevious = null
    /**
     * The motion that moves a cascade's bars and links, created on first use.
     * @member {Neo.gantt.CascadeMotion|null} #cascadeMotion=null
     * @private
     */
    #cascadeMotion = null
    /**
     * Functions that end the axis, header and body subscriptions of {@link #bindTimelineSubscriptions}.
     * @member {Function[]} #cleanups=[]
     * @private
     */
    #cleanups = []
    /**
     * Functions that remove this chart's listeners from the current dependency store.
     * @member {Function[]} #dependencyCleanups=[]
     * @private
     */
    #dependencyCleanups = []
    /**
     * The dependency overlay, created by {@link #ensureDependencyLayer}.
     * @member {Neo.gantt.DependencyLayer|null} dependencyLayer=null
     */
    dependencyLayer = null
    /**
     * In-flight spans `[startMs, endMs]`, by task key as a String, of the tasks a cascade is moving. Bars and links
     * draw a listed task over its span instead of its dates. Empty unless {@link #animateCascade} moves a cascade.
     * @member {Map<String, Number[]>} drawnSpans
     */
    drawnSpans = new Map()
    /**
     * The live region that announces the steps of a keyboard link, created once link creation is on.
     * @member {Neo.component.Base|null} #keyboardLinkStatus=null
     * @private
     */
    #keyboardLinkStatus = null
    /**
     * True while the chart itself writes task dates: its store listeners then leave the overlay and a running
     * move to the writer. Only {@link #asTaskWrite} sets it.
     * @member {Boolean} _movingTask=false
     * @protected
     */
    _movingTask = false
    /**
     * The cascade collaborators this chart created from a config or `null`, which it destroys.
     * @member {WeakSet} #ownedCascades
     * @private
     */
    #ownedCascades = new WeakSet()
    /**
     * The dependency stores this chart created from a config, which it destroys.
     * @member {WeakSet} #ownedDependencies
     * @private
     */
    #ownedDependencies = new WeakSet()
    /**
     * The task stores this chart created from a config, which it destroys.
     * @member {WeakSet} #ownedTasks
     * @private
     */
    #ownedTasks = new WeakSet()
    /**
     * Ends the wait for a pending service decision, null while none is pending.
     * @member {Function|null} #pendingCleanup=null
     * @private
     */
    #pendingCleanup = null
    /**
     * Ends the subscription to the service's commits, null without a service that offers `onCommit`.
     * @member {Function|null} #serviceCleanup=null
     * @private
     */
    #serviceCleanup = null
    /**
     * Functions that remove this chart's listeners from the current task store.
     * @member {Function[]} #storeCleanups=[]
     * @private
     */
    #storeCleanups = []

    /**
     * @summary Constructs the chart and binds its overlay to the timeline.
     * @param {Object} config The instance config
     */
    construct(config) {
        super.construct(config);
        this.ensureDependencyLayer();
        if (this.dependencyCreation) this.ensureKeyboardLinkStatus();
        if (this.dependencyCreation && !this.barDraggable) this.ensureEventDragZone();
        this.bindTimelineSubscriptions();
        this.syncDependencyLayer()
    }

    /**
     * @summary Reads the motion tier when the transition is switched on; lands a running move when it is switched off.
     * @param {Boolean} value
     * @protected
     */
    afterSetAnimateCascade(value) {
        value ? this.ensureCascadeMotion().readTokens() : this.#cascadeMotion?.end()
    }

    /**
     * @summary Keeps the overlay associated with the active application.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);
        this.relayTimelineConfig('appName', value, oldValue)
    }

    /**
     * @summary Keeps the drag zone available for link gestures when bar dragging is disabled.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetBarDraggable(value, oldValue) {
        super.afterSetBarDraggable(value, oldValue);
        if (!value && this.isConstructed && this.dependencyCreation) this.ensureEventDragZone()
    }

    /**
     * @summary Destroys a replaced cascade collaborator created by this chart, or detaches a borrowed one.
     * @param {Neo.gantt.Cascade}      value
     * @param {Neo.gantt.Cascade|null} oldValue
     * @protected
     */
    afterSetCascade(value, oldValue) {
        if (oldValue && oldValue !== value) {
            if (this.#ownedCascades.has(oldValue)) {
                oldValue.destroy()
            } else if (oldValue.chart === this) {
                oldValue.chart = null
            }
        }
    }

    /**
     * @summary Enables link gestures when creation is available.
     * @param {Boolean|Function} value
     * @param {Boolean|Function} oldValue
     * @protected
     */
    afterSetDependencyCreation(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.keyboardLinkSource = null;
            if (value) this.ensureKeyboardLinkStatus();
            if (value && !this.eventDragZone) this.ensureEventDragZone();
            this.timelineColumn?.refreshMountedRows()
        }
    }

    /**
     * @summary Rebinds dependency changes and releases a store owned by this chart.
     * @description Like the task store, a batch of link edits re-projects the overlay once, on its `rowsChange`.
     * @param {Neo.gantt.DependencyStore|null} value
     * @param {Neo.gantt.DependencyStore|null} oldValue
     * @protected
     */
    afterSetDependencyStore(value, oldValue) {
        this.#analysis?.invalidateSchedule();
        this.#dependencyCleanups.forEach(fn => fn());
        this.#dependencyCleanups = [];
        if (value) {
            let changed = () => {
                    if (this._movingTask || value.isUpdatingRows) return;
                    this.#analysis?.invalidateSchedule();
                    if (!(this.schedule?.isPublishing && this.#serviceCleanup)) this.syncDependencyLayer()
                },
                listeners = {mutate: changed, recordChange: changed, rowsChange: changed, filter: changed};
            value.on(listeners);
            this.#dependencyCleanups.push(() => value.un(listeners))
        }
        this.relayTimelineConfig('dependencyStore', value, oldValue);
        if (oldValue && oldValue !== value && this.#ownedDependencies.has(oldValue)) oldValue.destroy()
    }

    /**
     * @summary Invalidates dependent analysis, then forwards the end field: the relay draws it with the new highlights.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetEndDateField(value, oldValue) {
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        super.afterSetEndDateField(value, oldValue)
    }

    /**
     * @summary Announces the armed endpoint in the live region and redraws the rows of the old and the new one.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetKeyboardLinkSource(value, oldValue) {
        if (!value && !oldValue) return;

        let me    = this,
            title = value && (value.record[me.titleField] || me.store.getKey(value.record));

        me.#keyboardLinkStatus.text = value
            ? `Link from ${title}. Focus the destination and press L, or press Escape to cancel.` : '';
        if (oldValue && oldValue.row?.record === oldValue.record && oldValue.row !== value?.row) oldValue.row.createVdom(false, false);
        value?.row?.createVdom(false, false)
    }

    /**
     * @summary A chart that mounts with the transition on reads its motion tier from its node, which exists now.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        if (value && this.animateCascade) this.ensureCascadeMotion().readTokens()
    }

    /**
     * @summary Forwards row size changes to the overlay.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        super.afterSetRowHeight(value, oldValue);
        this.relayTimelineConfig('rowHeight', value, oldValue)
    }

    /**
     * @summary Subscribes to committed service changes and releases an earlier service.
     * @param {Neo.gantt.Container.GanttScheduleService|null} value
     * @protected
     */
    afterSetSchedule(value) {
        this.#pendingCleanup?.();
        this.#pendingCleanup = null;
        this.#serviceCleanup?.();
        this.#serviceCleanup = value?.onCommit?.(() => {
            if (this.usesService(value)) {
                this.#analysis?.invalidateSchedule();
                this.syncDependencyLayer()
            }
        }) || null
    }

    /**
     * @summary Invalidates dependent analysis, then forwards the start field: the relay draws it with the new highlights.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetStartDateField(value, oldValue) {
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        super.afterSetStartDateField(value, oldValue)
    }

    /**
     * @summary Binds record changes and keeps the overlay aligned.
     * @description A store batch (`updateRows()`) re-projects the overlay once, on its `rowsChange`. Its records'
     * `recordChange` events and the filter or sort it reapplies arrive first, while `store.isUpdatingRows` is true,
     * and leave the overlay to that final event.
     * @param {Neo.gantt.TaskStore|null} value
     * @param {Neo.gantt.TaskStore|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        // Another store's records reuse the keys of a running move: drop it before the grid draws them
        if (oldValue) this.#cascadeMotion?.stop();
        super.afterSetStore(value, oldValue);
        this.#analysis?.invalidateSchedule();
        this.#storeCleanups.forEach(fn => fn());
        this.#storeCleanups = [];
        if (value) {
            // A batch's events only note that the schedule went stale; its final rowsChange invalidates and projects once
            let stale  = false,
                settle = (invalidate, data) => {
                    if (this._movingTask) return;
                    stale ||= invalidate;
                    if (value.isUpdatingRows) return;
                    if (stale) { stale = false; this.#analysis?.invalidateSchedule(data) }
                    if (!(this.schedule?.isPublishing && this.#serviceCleanup)) this.syncDependencyLayer()
                },
                // A load, filter, sort or mutation lands a running cascade move, unless that move made it
                land         = () => this._movingTask || this.#cascadeMotion?.end(),
                changed      = data => { land(); settle(true, data) },
                recordChange = data => {
                    let fields = data?.fields;
                    settle(!Array.isArray(fields) || !fields.length || fields.some(field => {
                        let name = typeof field === 'string' ? field : field?.name;
                        return !name || [this.startDateField, this.endDateField, 'milestone', 'parentId', 'isLeaf', 'id', value.keyProperty].includes(name)
                    }))
                },
                // A sort moves rows, never dates: it lands a running move, and the links follow without a schedule pass
                listeners = {load: land, mutate: changed, recordChange, rowsChange: recordChange, filter: changed, sort: data => { land(); settle(false, data) }};
            value.on(listeners);
            this.#storeCleanups.push(() => value.un(listeners))
        }
        if (this.eventDragZone) this.eventDragZone.store = value;
        this.relayTimelineConfig('store', value, oldValue);
        if (oldValue && oldValue !== value && this.#ownedTasks.has(oldValue)) oldValue.destroy()
    }

    /**
     * @summary Rebuilds columns when task column configuration changes.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetTaskColumns(value, oldValue) {
        if (oldValue !== undefined && this.configsApplied && this._columns) this.createColumns(null, this._columns)
    }

    /**
     * @summary Invalidates dependent analysis, relays the replaced axis with the new highlights, and follows the
     * new axis' changes.
     * @param {Neo.timeline.TimeAxis|null} value
     * @param {Neo.timeline.TimeAxis|null} oldValue
     * @protected
     */
    afterSetTimeAxis(value, oldValue) {
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        super.afterSetTimeAxis(value, oldValue);
        if (this.dependencyLayer) this.bindTimelineSubscriptions()
    }

    /**
     * @summary Reschedules task spans and dependent tasks through the writer when the working-calendar mode flips.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseWorkingTime(value, oldValue) {
        if (oldValue !== undefined && Boolean(value) !== Boolean(oldValue)) {
            if (this.isConstructed) {
                this.rescheduleWorkingTime(Boolean(value), Boolean(oldValue))
            } else {
                this.#analysis?.invalidateSchedule()
            }
        }
    }

    /**
     * @summary Sends the width the timeline column now shows to the overlay.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetViewportWidth(value, oldValue) {
        super.afterSetViewportWidth(value, oldValue);
        if (oldValue !== undefined) this.syncDependencyLayerGeometry()
    }

    /**
     * @summary Keeps the overlay in the chart's window.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        this.relayTimelineConfig('windowId', value, oldValue)
    }

    /**
     * @summary Runs `write` as the chart's own task write: meanwhile its store listeners leave the overlay and a
     * running move to the writer. The previous state returns afterwards, also when `write` throws, so a nested
     * write keeps the outer one's. The shape of {@link Neo.data.Store#asContinuation}.
     * @param {Function} write Writes task records, or asks the service to
     * @returns {*} What `write` returns
     * @protected
     */
    asTaskWrite(write) {
        let me       = this,
            previous = me._movingTask;

        me._movingTask = true;

        try {
            return write()
        } finally {
            me._movingTask = previous
        }
    }

    /**
     * @summary Creates the grid body that mounts the dependency layer.
     * @param {Neo.gantt.Body|Object|null} value
     * @returns {Neo.gantt.Body}
     * @protected
     */
    beforeSetBody(value) {
        return ClassSystemUtil.beforeSetInstance(value, GanttBody, {
            flex : 1, gridContainer: this, parentId: this.id, store: this.store,
            theme: this.theme, useInternalId: this.useInternalId
        })
    }

    /**
     * @summary Creates or binds the chart's cascade collaborator.
     * @param {Neo.gantt.Cascade|Function|Object|null} value
     * @returns {Neo.gantt.Cascade}
     * @protected
     */
    beforeSetCascade(value) {
        let instance = ClassSystemUtil.beforeSetInstance(value, Cascade, {chart: this});

        if (instance !== value) {
            this.#ownedCascades.add(instance)
        } else {
            instance.chart = this
        }

        return instance
    }

    /**
     * @summary Creates and tracks a configured dependency store.
     * @param {Neo.gantt.DependencyStore|Object|null} value
     * @returns {Neo.gantt.DependencyStore|null}
     * @protected
     */
    beforeSetDependencyStore(value) {
        if (!value) return null;
        let store = ClassSystemUtil.beforeSetInstance(value, DependencyStore);
        if (store !== value) this.#ownedDependencies.add(store);
        return store
    }

    /**
     * @summary Completes an armed endpoint with the task's rendered row.
     * @param {Object|null} value `{record, barId}`, or null to disarm
     * @returns {Object|null} `{record, barId, row}`, or null
     * @protected
     */
    beforeSetKeyboardLinkSource(value) {
        let record = value?.record;

        return record ? {barId: value.barId ?? null, record, row: this.body?.items.find(item => item.record === record)} : null
    }

    /**
     * @summary Converts task store configurations to a task store.
     * @param {Neo.gantt.TaskStore|Object|null} value
     * @param {Neo.gantt.TaskStore|null}        oldValue
     * @returns {Neo.gantt.TaskStore|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (!value) return null;
        let store = ClassSystemUtil.beforeSetInstance(value, TaskStore);
        if (store !== value) this.#ownedTasks.add(store);
        return super.beforeSetStore(store, oldValue)
    }

    /**
     * @summary Subscribes to axis and viewport changes used by the overlay. A scroll lands a running cascade move.
     */
    bindTimelineSubscriptions() {
        let {body} = this;
        this.#cleanups.forEach(fn => fn());
        this.#cleanups = [];
        if (this.timeAxis) for (let key of ['start', 'end', 'pxPerMinute', 'size', 'tickUnit', 'tickStep', 'nonWorkingDays', 'nonWorkingDates', 'timeZone']) {
            this.#cleanups.push(this.observeConfig(this.timeAxis, key, () => {
                if (['nonWorkingDays', 'nonWorkingDates', 'timeZone'].includes(key)) this.#analysis?.invalidateSchedule();
                this.syncDependencyLayer()
            }))
        }
        if (this.headerToolbar) this.#cleanups.push(this.observeConfig(this.headerToolbar, 'scrollLeft', () => {
            this.#cascadeMotion?.end();
            this.syncDependencyLayerGeometry()
        }))
        if (body) {
            // A column moving before or after the timeline moves the axis: the rebuild's second event carries the
            // geometry, and a live column resize moves it in place
            let syncGeometry = () => this.syncDependencyLayerGeometry(),
                listeners    = {cellPositionsChange: syncGeometry, isScrollingChange: ({value}) => value && this.#cascadeMotion?.end()},
                onPositions  = ({addedItems}) => {if (addedItems?.length) syncGeometry()},
                scrollbar    = this.horizontalScrollbar;
            body.on(listeners);
            body.columnPositions.on('mutate', onPositions);
            // The width the column shows is the body's less both locked regions'. The scrollbar carries those two
            // widths as its margins and outlives the locked bodies, which come and go with their columns
            this.#cleanups.push(
                this.observeConfig(body,      'containerWidth', syncGeometry),
                this.observeConfig(scrollbar, 'endWidth',       syncGeometry),
                this.observeConfig(scrollbar, 'startWidth',     syncGeometry),
                () => body.isDestroyed || (body.un(listeners), body.columnPositions.un('mutate', onPositions)))
        }
    }

    /**
     * @summary Builds the fields an edit changes: the resolved dates, the completion, the title, the further
     * `fields`, and the duration a new span gives.
     * @param {Neo.gantt.Container.GanttTaskEdit} edit      The edit, with its resolved span
     * @param {Number[]}                          edit.span The `[startMs, endMs]` {@link #resolveTaskDates} returned
     * @returns {Object} The changed fields, empty when nothing changes
     * @protected
     */
    buildTaskUpdates({axis, changes, endField, keyProp, pctField, prevSpan, record, span, startField, titleField, useWorking}) {
        let [prevStartMs, prevEndMs] = prevSpan,
            [startMs, endMs]         = span,
            prevPct                  = record[pctField] ?? 0,
            prevTitle                = record[titleField],
            rawFields                = changes.fields && typeof changes.fields === 'object' && !Array.isArray(changes.fields)
                ? changes.fields
                : {},
            updates                  = {},
            forbiddenKeys            = new Set([
                'id', keyProp, 'endDate', 'eventId', 'fields', 'key', 'meta', 'percentDone', 'record', 'startDate', 'taskId', 'title',
                startField, endField, pctField, titleField
            ]);

        if (startMs !== prevStartMs) {
            updates[startField] = new Date(startMs)
        }

        if (endMs !== prevEndMs) {
            updates[endField] = new Date(endMs)
        }

        let rawPctInput = changes.percentDone !== undefined
            ? changes.percentDone
            : changes[pctField] !== undefined
                ? changes[pctField]
                : rawFields.percentDone !== undefined
                    ? rawFields.percentDone
                    : rawFields[pctField];

        if (rawPctInput !== undefined && rawPctInput !== null) {
            let clampedPct = Math.min(100, Math.max(0, Number(rawPctInput) || 0));
            if (clampedPct !== prevPct) {
                updates[pctField] = clampedPct
            }
        }

        let rawTitleInput = changes.title !== undefined
            ? changes.title
            : changes[titleField] !== undefined
                ? changes[titleField]
                : rawFields.title !== undefined
                    ? rawFields.title
                    : rawFields[titleField];

        if (rawTitleInput !== undefined && rawTitleInput !== prevTitle) {
            updates[titleField] = rawTitleInput
        }

        for (let [fieldKey, fieldVal] of Object.entries(rawFields)) {
            if (forbiddenKeys.has(fieldKey) || fieldVal === undefined) {
                continue
            }
            if (fieldVal !== record[fieldKey]) {
                updates[fieldKey] = fieldVal
            }
        }

        if ((updates[startField] || updates[endField]) && record.duration !== undefined) {
            let unit         = String(record.durationUnit || 'hour').toLowerCase(),
                unitMs       = unit.startsWith('day') ? MS_PER_DAY : unit.startsWith('min') ? MS_PER_MINUTE : MS_PER_HOUR,
                spanMs       = useWorking ? Math.max(0, axis.diffWorkingMs(startMs, endMs)) : (endMs - startMs),
                nextDuration = Math.round((spanMs / unitMs) * 100) / 100;

            if (nextDuration !== record.duration) {
                updates.duration = nextDuration
            }
        }

        return updates
    }

    /**
     * @summary Cancels the active keyboard link gesture.
     */
    cancelKeyboardLink() { this.keyboardLinkSource = null }

    /**
     * @summary Checks whether the configured link affordance accepts the endpoints.
     * @param {Neo.data.Model}      from      The predecessor task
     * @param {Neo.data.Model|null} [to=null] The successor task; null asks whether `from` can start a link
     * @returns {Boolean}
     */
    canLinkTasks(from, to=null) {
        let allowed = this.dependencyCreation;
        return Boolean(allowed && from && from !== to && !this.store?.isDerivedParent?.(to) &&
            (allowed === true || typeof allowed === 'function' && allowed(from, to)))
    }

    /**
     * @summary Discards a keyboard endpoint whose row was recycled.
     */
    checkKeyboardLinkSource() {
        let source = this.keyboardLinkSource;
        if (source && (!this.resolveTaskRecord(source.record) || source.row?.record !== source.record ||
            this.timelineColumn?.getBarNodeId(source.row.vdom, this.store.getKey(source.record)) !== source.barId)) {
            this.keyboardLinkSource = null
        }
    }

    /**
     * @summary Keeps a resolved span inside the axis, and keeps the minimum duration where the axis bounds the
     * edit. A moved task keeps its duration; a resized one keeps its other end. With working time, durations
     * count working time.
     * @param {Number[]}                             span    The `[startMs, endMs]` resolved so far
     * @param {Neo.gantt.Container.GanttSpanRequest} request What the edit asks for
     * @returns {Number[]} The clamped `[startMs, endMs]`
     * @protected
     */
    clampTaskToAxis([startMs, endMs], {axis, hasEndInput, hasStartInput, isEndResize, isMilestone, isStartResize, meta, minMs, prevSpan, useWorking}) {
        let [prevStartMs, prevEndMs] = prevSpan,
            axisStartMs              = axis.start.getTime(),
            axisEndMs                = axis.end.getTime();

        if (useWorking) {
            let workDurMs = isMilestone ? 0 : Math.max(minMs, axis.diffWorkingMs(startMs, endMs));

            if (startMs < axisStartMs) {
                startMs = axis.snapToWorkingTime(axisStartMs, 1).getTime();
                endMs   = axis.addWorkingMs(startMs, workDurMs).getTime()
            }
            if (endMs > axisEndMs) {
                endMs = axisEndMs;
                if (!isEndResize && !isStartResize) {
                    startMs = Math.max(axisStartMs, axis.addWorkingMs(endMs, -workDurMs).getTime())
                }
            }
        } else {
            let durationMs = Math.max(0, endMs - startMs);

            if (isMilestone || (hasStartInput && hasEndInput && meta.source !== 'resize')) {
                startMs = Math.max(axisStartMs, Math.min(startMs, Math.max(axisStartMs, axisEndMs - durationMs)));
                endMs   = startMs + durationMs
            } else if (hasStartInput && !hasEndInput) {
                endMs   = Math.min(axisEndMs, prevEndMs);
                startMs = Math.max(axisStartMs, Math.min(startMs, endMs - minMs))
            } else if (!hasStartInput && hasEndInput) {
                startMs = Math.max(axisStartMs, prevStartMs);
                endMs   = Math.min(axisEndMs, Math.max(endMs, startMs + minMs))
            }
        }

        return [startMs, endMs]
    }

    /**
     * @summary Collects task records across expanded and collapsed tree branches.
     * @returns {Neo.data.Model[]}
     */
    collectAllTasks() {
        let store   = this.store,
            records = [];

        if (!store) {
            return records
        }

        let keyProp = store.keyProperty || 'id',
            seen    = new Set(),
            roots   = store.getChildren('root');

        if (roots.length > 0) {
            let rawNodes = [];

            for (let root of roots) {
                store.collectAllDescendants(root, rawNodes)
            }

            for (let node of rawNodes) {
                let record = store.hydrateRecord(node),
                    id     = record?.[keyProp];

                if (record && id !== undefined && id !== null) {
                    let key = String(id);
                    if (!seen.has(key)) {
                        seen.add(key);
                        records.push(record)
                    }
                }
            }
        }

        if (records.length === 0) {
            let count = store.getCount();

            for (let i = 0; i < count; i++) {
                let record = store.getAt(i),
                    id     = record?.[keyProp];

                if (record && id !== undefined && id !== null) {
                    let key = String(id);
                    if (!seen.has(key)) {
                        seen.add(key);
                        records.push(record)
                    }
                }
            }
        }

        return records
    }

    /**
     * @summary Uses one writer for timeline edits and retains service receipts.
     * @param {Neo.data.Model} record    The task being edited.
     * @param {Object}         changes   Changes keyed by their configured field names.
     * @param {Object}         [meta={}] Gesture source and resize information.
     * @returns {Object|Boolean} Applied changes or a service receipt; false when the gesture did not commit.
     */
    commitTimelineEdit(record, changes, meta={}) {
        let result = this.moveTask(record, {...changes, fields: {...changes, ...changes.fields}}, meta);
        if (meta.source !== 'editor' && result?.status && result.status !== 'committed') {
            this.fire('scheduleResult', {record, result});
            return false
        }
        return result ?? false
    }

    /**
     * @summary Proposes an edit to the schedule service, which writes it, and publishes a committed receipt. A
     * pending decision is awaited: a later commit is published while the service, the stores and the task still
     * match.
     * @param {Neo.gantt.Container.GanttTaskEdit} edit         The edit, with its changed fields
     * @param {Object}                            edit.updates The changed fields {@link #buildTaskUpdates} returned
     * @returns {Neo.gantt.Container.GanttScheduleReceipt} The service's receipt
     * @protected
     */
    consultScheduleService({meta, record, updates}) {
        let me       = this,
            service  = me.schedule,
            proposal = {...updates},
            result;

        delete proposal.duration;
        result = me.asTaskWrite(() => service.moveTask(me.store.getKey(record), proposal));

        if (result?.status === 'committed') {
            let native = me.publishServiceResult(record, result, meta, true);
            return {...native, status: 'committed', notificationErrors: result.notificationErrors}
        }

        if (result?.status === 'pending' && result.pending?.id != null && service.onDecisionSettled) {
            me.#pendingCleanup?.();
            let taskId = me.store.getKey(record);
            me.#pendingCleanup = service.onDecisionSettled(result.pending.id, settled => {
                me.#pendingCleanup = null;
                if (settled?.status === 'committed' && (!settled.action || settled.action === 'moveTask') &&
                    (settled.taskId === undefined || String(settled.taskId) === String(taskId)) &&
                    me.usesService(service) && me.resolveTaskRecord(record)) {
                    me.publishServiceResult(record, settled, meta)
                }
            })
        }

        return result
    }

    /**
     * @summary Releases owned dependencies and all chart subscriptions.
     * @param {...*} args Passed on to the scheduler
     */
    destroy(...args) {
        this.#pendingCleanup?.();
        this.#serviceCleanup?.();
        this.#pendingCleanup = this.#serviceCleanup = null;
        this.#analysis = null;
        this.#cascadeMotion?.destroy();
        this.#cascadeMotion = null; // the grid's teardown unbinds the store next, which reads it
        this.#cleanups.forEach(fn => fn());
        this.#storeCleanups.forEach(fn => fn());
        this.#dependencyCleanups.forEach(fn => fn());
        let cascade = this.cascade,
            deps    = this.dependencyStore,
            tasks   = this.store;
        this.dependencyLayer?.destroy();
        this.dependencyLayer = null;
        super.destroy(...args);
        if (cascade) {
            if (this.#ownedCascades.has(cascade)) {
                cascade.destroy()
            } else if (cascade.chart === this) {
                cascade.chart = null
            }
        }
        if (deps && this.#ownedDependencies.has(deps)) deps.destroy();
        if (tasks && this.#ownedTasks.has(tasks)) tasks.destroy()
    }

    /**
     * @summary The chart's cascade motion, created on first use.
     * @returns {Neo.gantt.CascadeMotion}
     * @protected
     */
    ensureCascadeMotion() {
        return this.#cascadeMotion ??= Neo.create(CascadeMotion, {chart: this})
    }

    /**
     * @summary Returns the dependency overlay, creating it on first use from the chart's values and
     * {@link #dependencyLayerConfig}. The center body mounts it: see {@link Neo.gantt.Body#createRowPool}.
     * @description `dependencyLayerConfig` overrides the mirrored inputs of {@link #getDependencyLayerInputs} until
     * the chart config behind one changes. It does not replace the chart's {@link #drawnSpans}: bars and links
     * read the same in-flight spans.
     * @returns {Neo.gantt.DependencyLayer}
     */
    ensureDependencyLayer() {
        let me = this;

        if (!me.dependencyLayer || me.dependencyLayer.isDestroyed) {
            me.dependencyLayer = Neo.create({
                module       : DependencyLayer,
                id           : `${me.id}__dependency-layer`,
                parentId     : me.body?.id || me.id,
                viewportWidth: me.viewportWidth,
                ...me.getDependencyLayerInputs(),
                ...me.dependencyLayerConfig,
                drawnSpans   : me.drawnSpans
            })
        }

        return me.dependencyLayer
    }

    /**
     * @summary Creates the live region used for keyboard link announcements.
     * @protected
     */
    ensureKeyboardLinkStatus() {
        this.#keyboardLinkStatus ??= this.add({
            module: Component, cls: ['neo-gantt-link-status'], role: 'status', text: '',
            vdom  : {'aria-live': 'polite', 'aria-atomic': 'true'}
        }, !this.vnodeInitialized)
    }

    /**
     * @summary Applies the working-time rules to a resolved span: a resized edge snaps to working time and keeps the
     * minimum working duration; a moved task keeps its working duration, or takes the one its new dates span.
     * @param {Number[]}                             span    The `[startMs, endMs]` resolved so far
     * @param {Neo.gantt.Container.GanttSpanRequest} request What the edit asks for
     * @returns {Number[]} The `[startMs, endMs]` in working time
     * @protected
     */
    fitTaskToWorkingTime([startMs, endMs], {axis, hasEndInput, isEndResize, isMilestone, isStartResize, minMs, prevSpan}) {
        let [prevStartMs, prevEndMs] = prevSpan;

        if (isEndResize) {
            startMs = axis.snapToWorkingTime(prevStartMs, 1).getTime();
            endMs   = axis.snapToWorkingTime(endMs, -1).getTime();

            if (axis.diffWorkingMs(startMs, endMs) < minMs) {
                endMs = axis.addWorkingMs(startMs, minMs).getTime()
            }
        } else if (isStartResize) {
            endMs   = axis.snapToWorkingTime(prevEndMs, -1).getTime();
            startMs = axis.snapToWorkingTime(startMs, 1).getTime();

            if (axis.diffWorkingMs(startMs, endMs) < minMs) {
                startMs = axis.addWorkingMs(endMs, -minMs).getTime()
            }
        } else {
            let prevWallMs      = Math.max(0, prevEndMs - prevStartMs),
                prevWorkMs      = Math.max(0, axis.diffWorkingMs(prevStartMs, prevEndMs)),
                preservedWorkMs = prevWorkMs > 0 ? prevWorkMs : prevWallMs,
                inputWallMs     = hasEndInput ? Math.max(0, endMs - startMs) : preservedWorkMs,
                requestedWorkMs = preservedWorkMs;

            if (hasEndInput && Math.abs(inputWallMs - prevWallMs) > 1) {
                let rawInputWorkMs = Math.max(0, axis.diffWorkingMs(startMs, endMs));
                requestedWorkMs = rawInputWorkMs > 0 ? rawInputWorkMs : inputWallMs
            }

            let workingDurationMs = isMilestone ? 0 : Math.max(minMs, requestedWorkMs);

            startMs = axis.snapToWorkingTime(startMs, 1).getTime();
            endMs   = axis.addWorkingMs(startMs, workingDurationMs).getTime()
        }

        return [startMs, endMs]
    }

    /**
     * @summary Admits task move and dependency-link gestures.
     * @param {Neo.gantt.EventDragZone} zone   Gesture zone.
     * @param {Object[]}                path   Pointer path.
     * @param {Neo.data.Model}          record The task under the pointer
     * @returns {Object|null} `{terminal}` for an admitted gesture, else null
     * @protected
     */
    getBarDragContext(zone, path, record) {
        let terminal = zone.getLinkTerminal(path);
        if (terminal ? !this.dependencyCreation : !this.barDraggable || this.store?.isDerivedParent?.(record)) return null;
        this.keyboardLinkSource = null;
        return {terminal: terminal || null}
    }

    /**
     * @summary Configures the shared editor for task records.
     * @returns {Object}
     * @protected
     */
    getDefaultEditorConfig() {
        return {
            showResourceField: false,
            title            : 'Edit task'
        }
    }

    /**
     * @summary Returns the chart values the dependency layer mirrors, keyed by the layer config each one feeds.
     * @description Reads {@link Neo.gantt.Container.timelineRelays}, as {@link #relayTimelineConfig} does for every
     * later change: a subclass that points a relay at another layer config moves the layer's first value with it.
     * @returns {Object}
     * @protected
     */
    getDependencyLayerInputs() {
        let me     = this,
            inputs = {};

        for (let [configName, {layer}] of Object.entries(me.constructor.timelineRelays)) {
            if (layer) {
                inputs[layer] = me[configName]
            }
        }

        return inputs
    }

    /**
     * @summary Uses the task gesture zone.
     * @returns {Function}
     * @protected
     */
    getEventDragZoneClass() { return EventDragZone }

    /**
     * @summary Leaves gesture defaults to the task zone.
     * @returns {Object}
     * @protected
     */
    getEventDragZoneDefaults() { return {} }

    /**
     * @summary The shortest span an edit leaves a task: none for a milestone, else {@link #minimumDuration} minutes,
     * or the axis' snap or 15 when it is unset, and at least one minute.
     * @param {Object}                     data        The task and its axis
     * @param {Neo.timeline.TimeAxis|null} data.axis   The chart's time axis
     * @param {Neo.data.Model}             data.record The edited task
     * @returns {Number} Milliseconds
     * @protected
     */
    getMinimumTaskDuration({axis, record}) {
        return record.milestone ? 0 : Math.max(1, this.minimumDuration || axis?.snapMinutes || 15) * MS_PER_MINUTE
    }

    /**
     * @summary Uses the task-specific timeline column.
     * @returns {Function}
     * @protected
     */
    getTimelineColumnClass() { return GanttColumn }

    /**
     * @summary Task rows supply their own bars.
     * @returns {null}
     * @protected
     */
    getTimelineColumnStore() { return null }

    /**
     * @summary Returns the task-tree column descriptors.
     * @returns {Object[]}
     * @protected
     */
    getTimelineLockedColumns() { return this.taskColumns }

    /**
     * @summary Returns the task store edited by timeline gestures.
     * @returns {Neo.gantt.TaskStore|null}
     * @protected
     */
    getTimelineRecordStore() { return this.store }

    /**
     * @summary Checks whether a rendered bar owns the armed endpoint.
     * @param {Neo.data.Model} record The task the bar draws
     * @param {String}         barId  The bar's node id
     * @returns {Boolean}
     */
    isKeyboardLinkSource(record, barId) {
        let source = this.keyboardLinkSource;
        return Boolean(source && source.record === record && source.barId === barId)
    }

    /**
     * @summary Checks whether the schedule service writes this task's edits: it offers `moveTask`, and its
     * `handlesTask`, when present, selects the task.
     * @param {Neo.data.Model}                                record                   The edited task
     * @param {Neo.gantt.Container.GanttScheduleService|null} [service=this.schedule] The service to ask
     * @returns {Boolean}
     * @protected
     */
    isServiceTask(record, service=this.schedule) {
        return Boolean(service?.moveTask && (!service.handlesTask || service.handlesTask(this.store.getKey(record))))
    }

    /**
     * @summary Adds an admitted finish-to-start link.
     * @param {Object}                       [input={}]     The proposed link; its other fields go into the edge
     * @param {Neo.data.Model|String|Number} [input.fromId] The predecessor task or its key
     * @param {Neo.data.Model|String|Number} [input.toId]   The successor task or its key
     * @returns {Object} The committed edge, a refusal, or the service's result
     */
    linkTasks(input={}) {
        let from = this.resolveTaskRecord(input?.fromId),
            to   = this.resolveTaskRecord(input?.toId);
        if (!to || !this.dependencyStore || !this.canLinkTasks(from, to)) return {status: 'refused', reason: 'invalid-endpoints'};
        let edge = {...input, fromId: this.store.getKey(from), toId: this.store.getKey(to)};
        if (this.schedule?.linkTasks) {
            return this.usesService(this.schedule) ? this.schedule.linkTasks(edge) :
                {status: 'refused', message: 'The service does not match the current stores.'}
        }
        return this.dependencyStore.addFinishToStart(edge, this.store)
    }

    /**
     * @summary With {@link #animateCascade}, moves the changed tasks from their previous dates to their current ones.
     * A drag or resize already showed its task at the new dates in its preview, so that task stays there.
     * @param {Neo.data.Model} record   The edited task
     * @param {Object}         previous Its previous values
     * @param {Object[]}       cascaded `{record, previous}` per changed successor
     * @param {Object}         meta     The edit's gesture source
     * @protected
     */
    moveCascade(record, previous, cascaded, meta) {
        if (this.animateCascade) {
            let dropped = meta.source === 'drag' || meta.source === 'resize';
            this.ensureCascadeMotion().start(dropped ? cascaded : [{record, previous}, ...cascaded])
        }
    }

    /**
     * @summary Adapts inherited keyboard edits to the task writer.
     * @param {Neo.data.Model|Object|String|Number} record       Task, key, or the single-object form of {@link #moveTask}
     * @param {Object}                              [changes={}] The requested changes, passed on to {@link #moveTask}
     * @param {Object}                              [meta={}]    The gesture metadata, passed on to {@link #moveTask}
     * @returns {Object|null} The applied updates, or null when the edit did not commit
     */
    moveEvent(record, changes={}, meta={}) {
        let result = this.moveTask(record, changes, meta);
        if (result?.status && result.status !== 'committed') {
            this.fire('scheduleResult', {record, result});
            return null
        }
        return result?.updates || null
    }

    /**
     * @summary Updates a task and cascades dependent task dates.
     * @description Runs the edit's steps, each a `@protected` seam: {@link #resolveTaskDates},
     * {@link #buildTaskUpdates} and {@link #refuseTaskEdit}, then {@link #consultScheduleService} for a task that
     * {@link #isServiceTask} gives the service, else {@link #writeTaskEdit} and {@link #publishTaskEdit}.
     * @param {Neo.data.Model|String|Number|Object} taskIdOrRecord      Task, key, or an object containing a task key and changes.
     * @param {Object}                              [changes={}]        Start, end, title, completion, or additional fields under `fields`.
     * @param {Object}                              [meta={}]           Source, resize edge, and optional clamp and cascade controls.
     * @param {String}                              [meta.source='api'] Edit origin delivered as `taskChange.changeSource`; the event's `source` is the sender id.
     * @returns {Object|null} Updates and cascade details, an external service receipt, or null for a no-op.
     */
    moveTask(taskIdOrRecord, changes={}, meta={}) {
        ({eventIdOrRecord: taskIdOrRecord, changes, meta} =
            this.normalizeMoveEventArgs(taskIdOrRecord, changes, meta, arguments.length, 'taskId'));

        let me     = this,
            record = me.resolveTaskRecord(taskIdOrRecord);

        if (!record || !changes || typeof changes !== 'object' || Array.isArray(changes)) {
            return null
        }

        let axis       = me.timeAxis,
            endField   = me.endDateField   || 'endDate',
            startField = me.startDateField || 'startDate',
            edit       = {
                axis,
                changes,
                endField,
                keyProp   : me.store?.keyProperty || 'id',
                meta,
                pctField  : me.percentDoneField || 'percentDone',
                prevSpan  : [new Date(record[startField]).getTime(), new Date(record[endField]).getTime()],
                record,
                startField,
                titleField: me.titleField || 'title',
                useWorking: Boolean(me.useWorkingTime && axis?.hasWorkingCalendar())
            },
            span       = me.resolveTaskDates(edit);

        if (!span) {
            return null
        }

        let updates = me.buildTaskUpdates({...edit, span});

        if (!Object.keys(updates).length) {
            return null
        }

        let refusal = me.refuseTaskEdit({...edit, updates});

        if (refusal) {
            return refusal
        }

        if (me.isServiceTask(record)) {
            return me.consultScheduleService({...edit, updates})
        }

        let written = me.writeTaskEdit({...edit, updates});

        return me.publishTaskEdit({
            ...written,
            meta,
            moved: Boolean(updates[startField] || updates[endField] || written.cascaded.length),
            record,
            span,
            updates
        })
    }

    /**
     * @summary Routes link keys and delegates ordinary task editing keys.
     * @param {Object} [data={}] The keydown event data
     * @returns {Neo.timeline.EventEditor|Object|null|undefined} A link result, or what the scheduler's handler returns
     * @protected
     */
    onBarKeyDown(data={}) {
        if (data.key === 'Escape') this.keyboardLinkSource = null;
        if (!this.dependencyCreation || data.altKey || data.ctrlKey || data.metaKey || data.key?.toLowerCase() !== 'l') {
            return super.onBarKeyDown(data)
        }
        let {barNode} = this.extractBarTarget(data.path || data.targetPath || []),
            target    = this.resolveTaskRecord(barNode?.data?.eventId),
            source    = this.keyboardLinkSource;
        if (source) {
            this.keyboardLinkSource = null;
            if (target) return this.linkTasks({fromId: source.record, toId: target})
        }
        else if (this.canLinkTasks(target)) this.keyboardLinkSource = {barId: barNode.id, record: target}
    }

    /**
     * @summary Opens the shared editor for a task record.
     * @param {Neo.data.Model|String|Number} taskIdOrRecord The task or its key
     * @param {String|null}                  [barId=null]   The id of the bar the editor opens from
     * @returns {Neo.timeline.EventEditor|null}
     */
    openTaskEditor(taskIdOrRecord, barId=null) {
        return this.openEventEditor(taskIdOrRecord, barId)
    }

    /**
     * @summary Publishes a service's committed receipt without repeating its writes. A receipt committed within
     * the edit moves its tasks (`animate`); one settled later lands in one update.
     * @param {Neo.data.Model}                           record          The edited task
     * @param {Neo.gantt.Container.GanttScheduleReceipt} result          The service's committed receipt
     * @param {Object}                                   meta            The edit's gesture source and resize edge
     * @param {Boolean}                                  [animate=false] True moves the changed tasks when {@link #animateCascade} is on
     * @returns {Object} The published `{updates, cascaded, cycles}`
     * @protected
     */
    publishServiceResult(record, result, meta, animate=false) {
        let convert = (row, fields={}) => Object.fromEntries(Object.entries(fields).map(([key, value]) =>
                [key, row?.[key] instanceof Date && value != null ? new Date(value) : value])),
            updates  = convert(record, result.updates),
            previous = convert(record, result.previous),
            cascaded = (result.cascaded || []).map(item => {
                let row = this.resolveTaskRecord(item.taskId);
                return {record: row, changes: convert(row, item.changes), previous: convert(row, item.previous)}
            });
        if (animate) this.moveCascade(record, previous, cascaded, meta);
        if (!this.#serviceCleanup) { this.#analysis?.invalidateSchedule(); this.syncDependencyLayer() }
        return this.publishTaskChange({
            cascaded,
            cycles: result.cycles || [],
            meta,
            previous,
            record,
            span  : [record[this.startDateField], record[this.endDateField]],
            updates
        })
    }

    /**
     * @summary Emits the settled task edit.
     * @param {Object}         data          The edit to publish
     * @param {Object[]}       data.cascaded The changed successors with their `record`, `changes` and `previous`
     * @param {String[]}       data.cycles   Dependency identifiers found in cycles during the edit
     * @param {Object}         data.meta     The edit's action, source and resize edge
     * @param {Object}         data.previous The previous values of the changed fields
     * @param {Neo.data.Model} data.record   The edited task
     * @param {Array}          data.span     The edited task's resulting `[start, end]`, as times or dates
     * @param {Object}         data.updates  Its changed fields
     * @returns {Object} `{updates, cascaded, cycles}`
     * @protected
     */
    publishTaskChange({cascaded, cycles, meta, previous, record, span, updates}) {
        let me           = this,
            key          = me.store.getKey(record),
            changesById  = {[key]: updates},
            previousById = {[key]: previous};

        for (let item of cascaded) {
            changesById[me.store.getKey(item.record)]  = item.changes;
            previousById[me.store.getKey(item.record)] = item.previous
        }

        me.fire('taskChange', {
            action      : meta.action || (meta.resizeEdge ? 'resize' : 'move'),
            cascaded,
            changeSource: meta.source || 'api',
            changes     : updates,
            changesById,
            cycles,
            endDate     : new Date(span[1]),
            previous,
            previousById,
            record,
            resizeEdge  : meta.resizeEdge || null,
            startDate   : new Date(span[0]),
            updates
        });

        return {updates, cascaded, cycles}
    }

    /**
     * @summary Publishes the chart's own written edit: a moved edit invalidates the analysis and moves the
     * changed tasks, the overlay redraws, cycles are reported, and the change is published.
     * @param {Object}         data          The written edit
     * @param {Object[]}       data.cascaded The changed successors with their `record`, `changes` and `previous`
     * @param {String[]}       data.cycles   Dependency identifiers found in cycles during the edit
     * @param {Object}         data.meta     The edit's action, source and resize edge
     * @param {Boolean}        data.moved    True when the edit changed dates
     * @param {Object}         data.previous The previous values of the changed fields
     * @param {Neo.data.Model} data.record   The edited task
     * @param {Number[]}       data.span     The edited task's resulting `[startMs, endMs]`
     * @param {Object}         data.updates  Its changed fields
     * @returns {Object} `{updates, cascaded, cycles}`
     * @protected
     */
    publishTaskEdit({cascaded, cycles, meta, moved, previous, record, span, updates}) {
        let me = this;

        if (moved) {
            me.#analysis?.invalidateSchedule();
            me.moveCascade(record, previous, cascaded, meta)
        }

        me.syncDependencyLayer();

        if (cycles.length > 0) {
            me.fire('dependencyCycle', {cycles, record})
        }

        return me.publishTaskChange({cascaded, cycles, meta, previous, record, span, updates})
    }

    /**
     * @summary Refuses an edit the chart cannot take: a derived phase's dates or progress, or an edit while the
     * schedule service describes other stores.
     * @param {Neo.gantt.Container.GanttTaskEdit} edit         The edit, with its changed fields
     * @param {Object}                            edit.updates The changed fields {@link #buildTaskUpdates} returned
     * @returns {Object|null} A refusal receipt, or null
     * @protected
     */
    refuseTaskEdit({endField, pctField, record, startField, updates}) {
        let me      = this,
            service = me.schedule;

        if (me.store?.isDerivedParent?.(record) && [startField, endField, pctField, 'duration'].some(key => key in updates)) {
            return {status: 'refused', message: 'This phase takes its dates and progress from its tasks.'}
        }

        if (service && !me.usesService(service)) {
            return {status: 'refused', message: 'The service does not match the current stores.'}
        }

        return null
    }

    /**
     * @summary Registers an optional analysis and returns a fenced release function.
     * @param {Object} analysis Object providing `invalidateSchedule` and `getHighlights`.
     * @returns {Function} Releases this registration only while it remains current.
     */
    registerScheduleAnalysis(analysis) {
        if (!this.#analysis) this.#analysisPrevious = {
            tasks: [...(this.timelineColumn?.highlightedRecordIds || [])],
            edges: [...(this.dependencyLayer?.highlightedDependencyIds || [])]
        };
        this.#analysis = analysis;
        return () => {
            if (this.#analysis !== analysis) return false;
            this.#analysis = null;
            if (this.timelineColumn) this.timelineColumn.highlightedRecordIds = this.#analysisPrevious?.tasks || [];
            if (this.dependencyLayer) this.dependencyLayer.highlightedDependencyIds = this.#analysisPrevious?.edges || [];
            this.#analysisPrevious = null;
            return true
        }
    }

    /**
     * @summary Relays a chart config as the scheduler does, then to the dependency layer where
     * {@link Neo.gantt.Container.timelineRelays} names a `layer` config for it.
     * @description The layer takes the value in one write with the registered analysis' highlights, so an input
     * that changes them is projected once. A hook that invalidates the analysis does so before it relays.
     * @param {String} configName The chart config that changed
     * @param {*}      value      Its new value
     * @param {*}      oldValue   Its previous value
     * @protected
     */
    relayTimelineConfig(configName, value, oldValue) {
        super.relayTimelineConfig(configName, value, oldValue);

        let key = this.constructor.timelineRelays[configName]?.layer;

        if (key) {
            this.syncScheduleHighlights({[key]: value})
        }
    }

    /**
     * @summary Recomputes task spans and reachable dependencies when {@link #useWorkingTime} changes, publishing through the writer.
     * @param {Boolean} [useWorking=Boolean(this.useWorkingTime)] Target working-calendar mode.
     * @param {Boolean} [wasWorking=!useWorking]                  Prior working-calendar mode.
     * @returns {Object|null} Published task-change summary, service receipt, or `null` when no dates changed.
     */
    rescheduleWorkingTime(useWorking=Boolean(this.useWorkingTime), wasWorking=!useWorking) {
        let me            = this,
            hasCalendar   = Boolean(me.timeAxis?.hasWorkingCalendar()),
            effectiveNext = Boolean(useWorking && hasCalendar),
            effectivePrev = Boolean(wasWorking && hasCalendar),
            service       = me.schedule,
            cycles        = [],
            meta          = {action: 'workingTime', source: 'workingTime'};

        if (service && !me.usesService(service)) {
            let result = {status: 'refused', message: 'The service does not match the current stores.'};
            me.fire('scheduleResult', {record: null, result});
            return result
        }

        let entries = effectiveNext !== effectivePrev
            ? me.cascade.planWorkingTimeSchedule(effectiveNext, effectivePrev, cycles)
            : [];

        if (!entries.length) {
            me.#analysis?.invalidateSchedule();
            if (me.isConstructed) me.syncDependencyLayer();
            if (cycles.length) me.fire('dependencyCycle', {cycles, record: null});
            return null
        }

        if (service?.moveTask) {
            let nativeEntries     = [],
                lastServiceResult = null;

            for (let entry of entries) {
                if (me.isServiceTask(entry.record, service)) {
                    let result = me.asTaskWrite(() => service.moveTask(me.store.getKey(entry.record), {...entry.changes}));

                    if (result?.status === 'committed') {
                        let native = me.publishServiceResult(entry.record, result, meta, true);
                        lastServiceResult = {...native, status: 'committed', notificationErrors: result.notificationErrors}
                    } else {
                        if (result?.status && result.status !== 'committed') {
                            me.fire('scheduleResult', {record: entry.record, result})
                        }
                        lastServiceResult = result
                    }
                } else {
                    nativeEntries.push(entry)
                }
            }

            if (!nativeEntries.length) {
                return lastServiceResult
            }
            entries.splice(0, entries.length, ...nativeEntries)
        }

        me.writeTaskChanges(entries, Boolean(me.store.rollupParents && !service));

        let [first, ...rest] = entries,
            cascaded         = rest.map(({changes, dependencyId, endDate, previous, record, startDate}) => ({
                changes,
                dependencyId,
                endDate,
                previous,
                record,
                startDate
            }));

        return me.publishTaskEdit({
            cascaded,
            cycles,
            meta,
            moved   : true,
            previous: first.previous,
            record  : first.record,
            span    : [first.startMs, first.endMs],
            updates : first.changes
        })
    }

    /**
     * @summary Resolves the span an edit asks for: parses the requested dates, keeps a milestone a point, then
     * applies {@link #fitTaskToWorkingTime} with working time and {@link #clampTaskToAxis} on an axis, unless
     * `meta.clamp` is false. Both receive the minimum {@link #getMinimumTaskDuration} returns. A resized milestone
     * keeps its dates.
     * @param {Neo.gantt.Container.GanttTaskEdit} edit The edit {@link #moveTask} builds
     * @returns {Number[]|null} `[startMs, endMs]`, or null when a requested date is not a date
     * @protected
     */
    resolveTaskDates({axis, changes, endField, meta, prevSpan, record, startField, useWorking}) {
        let me            = this,
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
            },
            startMs       = hasStartInput ? toMs(rawStartInput) : prevSpan[0],
            endMs         = hasEndInput   ? toMs(rawEndInput)   : prevSpan[1];

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
            return null
        }

        let isMilestone = Boolean(record.milestone),
            request     = {
                axis,
                hasEndInput,
                hasStartInput,
                isEndResize  : meta.resizeEdge === 'end'   || (!hasStartInput && hasEndInput),
                isMilestone,
                isStartResize: meta.resizeEdge === 'start' || (hasStartInput && !hasEndInput && meta.source === 'resize'),
                meta,
                minMs        : me.getMinimumTaskDuration({axis, record}),
                prevSpan,
                useWorking
            },
            span        = [startMs, endMs];

        if (isMilestone && (meta.resizeEdge === 'start' || meta.resizeEdge === 'end' || meta.source === 'resize')) {
            return [...prevSpan]
        }

        if (hasStartInput || hasEndInput) {
            if (isMilestone && hasStartInput !== hasEndInput) {
                span = hasStartInput ? [startMs, startMs] : [endMs, endMs]
            }

            if (useWorking) {
                span = me.fitTaskToWorkingTime(span, request)
            }

            if (axis && meta.clamp !== false) {
                span = me.clampTaskToAxis(span, request)
            } else if (!useWorking) {
                let [start, end] = span;

                if (meta.source === 'resize' && end < start + request.minMs) {
                    span = [start, start + request.minMs]
                } else if (end < start) {
                    span = [start, start]
                }
            }
        }

        return span
    }

    /**
     * @summary Resolves a task key or verifies a record belongs to the task store.
     * @param {Neo.data.Model|String|Number} taskIdOrRecord The task or its key
     * @returns {Neo.data.Model|null}
     */
    resolveTaskRecord(taskIdOrRecord) {
        return this.resolveEventRecord(taskIdOrRecord)
    }

    /**
     * @summary Draws the dependency layer after the data in the chart's stores or on its axis changed: sends the
     * current geometry and highlights, then projects once.
     * @returns {Object[]} The projected arrow descriptors
     */
    syncDependencyLayer() {
        let me    = this,
            layer = me.ensureDependencyLayer();

        me.syncDependencyLayerGeometry();

        // A changed highlight set re-projects by itself
        return me.syncScheduleHighlights() ? layer.arrows : layer.project()
    }

    /**
     * @summary Sends the timeline column's geometry to the dependency layer: where the axis starts in its
     * scrolling region, how far that region has scrolled, and the width the column shows. The one writer of
     * those three inputs.
     * @protected
     */
    syncDependencyLayerGeometry() {
        let me     = this,
            column = me.timelineColumn;

        me.dependencyLayer?.set({
            axisLeft     : column?.axisLeft || 0,
            scrollLeft   : me.headerToolbar?.scrollLeft || 0,
            viewportWidth: column?.effectiveViewportWidth || me.viewportWidth
        })
    }

    /**
     * @summary Applies the registered analysis' highlights to the timeline column and the dependency layer.
     * @param {Object} [layerInputs={}] Layer configs to write with the highlights: one write, one projection
     * @returns {Boolean} True when the layer's highlights changed, which re-projects it
     * @protected
     */
    syncScheduleHighlights(layerInputs={}) {
        let me       = this,
            analysis = me.#analysis,
            column   = me.timelineColumn,
            layer    = me.dependencyLayer,
            changed  = false;

        if (analysis) {
            let highlights    = analysis.getHighlights() || {},
                dependencyIds = highlights.dependencyIds || [],
                taskIds       = highlights.taskIds || [];

            if (column && !Neo.isEqual(column.highlightedRecordIds, taskIds)) {
                column.highlightedRecordIds = [...taskIds]
            }

            if (layer && !Neo.isEqual(layer.highlightedDependencyIds, dependencyIds)) {
                layerInputs = {...layerInputs, highlightedDependencyIds: [...dependencyIds]};
                changed     = true
            }
        }

        if (layer && Object.keys(layerInputs).length) {
            layer.set(layerInputs)
        }

        return changed
    }

    /**
     * @summary Checks that an external service still describes the chart's current stores.
     * @param {Neo.gantt.Container.GanttScheduleService|null} service The service to check
     * @returns {Boolean}
     * @protected
     */
    usesService(service) {
        return Boolean(service && service === this.schedule && !service.isDestroyed &&
            (!('store' in service) || service.store === this.store) &&
            (!('dependencyStore' in service) || service.dependencyStore === this.dependencyStore))
    }

    /**
     * @summary Writes `{record, changes}` entries as the chart's own write: in one store batch (`updateRows()`), or
     * record by record.
     * @param {Object[]} entries       `{record, changes}` per task
     * @param {Boolean}  [batch=false] True writes one store batch
     * @protected
     */
    writeTaskChanges(entries, batch=false) {
        let store = this.store;

        this.asTaskWrite(() => {
            if (batch) {
                store.updateRows(entries.map(({changes, record}) => ({key: store.getKey(record), values: changes})))
            } else {
                entries.forEach(({changes, record}) => record.set(changes))
            }
        })
    }

    /**
     * @summary Writes the chart's own edit and its cascade. With store-owned phase dates, the cascade or the phase
     * rollups are planned first and land in one store batch with the edit; otherwise the edit lands, then the
     * cascade follows it.
     * @param {Neo.gantt.Container.GanttTaskEdit} edit         The edit, with its changed fields
     * @param {Object}                            edit.updates The changed fields {@link #buildTaskUpdates} returned
     * @returns {Object} `{cascaded, cycles, previous}`: the changed successors, the cycle edges, the previous values
     * @protected
     */
    writeTaskEdit({endField, meta, record, startField, updates}) {
        let me       = this,
            store    = me.store,
            cascade  = me.cascadeDependencies && meta.cascade !== false && me.dependencyStore && (updates[startField] || updates[endField]),
            cascaded = [],
            cycles   = [],
            previous = {},
            entry    = {changes: updates, record};

        for (let key of Object.keys(updates)) {
            let val = record[key];
            previous[key] = val instanceof Date ? new Date(val.getTime()) : val
        }

        me.asTaskWrite(() => {
            if (store.rollupParents) {
                let pending = new Map([[record, updates]]);
                cascaded = cascade ? me.cascade.runDependencyCascade(record, cycles, pending) : store.planParentRollups(pending, [record]);
                me.writeTaskChanges([entry, ...cascaded], true)
            } else {
                me.writeTaskChanges([entry]);
                if (cascade) cascaded = me.cascade.runDependencyCascade(record, cycles)
            }
        });

        return {cascaded, cycles, previous}
    }

    /**
     * @summary Lands a running cascade move, then updates the axis scale and dependency projection.
     * @param {String|Object} presetOrConfig A named zoom preset or a `timeAxis` config
     * @returns {Neo.timeline.TimeAxis|null}
     */
    zoomTo(presetOrConfig) {
        this.#cascadeMotion?.end();
        let axis = super.zoomTo(presetOrConfig);
        this.syncDependencyLayer();
        return axis
    }
}

/**
 * @typedef {Object} GanttScheduleService
 * @memberof Neo.gantt.Container
 * @property {Neo.gantt.TaskStore} [store] When supplied, must be the identical instance bound to the chart.
 * @property {Neo.gantt.DependencyStore} [dependencyStore] When supplied, must also match by identity.
 * @property {Function} [handlesTask] `handlesTask(key) => Boolean`. Return false to use the ordinary cascade.
 * @property {Function} [moveTask] `moveTask(key, changes) => GanttScheduleReceipt`. Receives the store key
 * and a normalized field patch. Apply accepted writes before returning a committed receipt.
 * @property {Function} [linkTasks] `linkTasks(edge) => Object`. Admits or refuses a link between the
 * resolved `fromId` and `toId`. The chart returns the service's result to the caller.
 * @property {Function} [onCommit] `onCommit(listener) => unsubscribe`. Notify after a batch of writes
 * is committed so every attached chart refreshes its analysis and dependency overlay.
 * @property {Boolean} [isPublishing] Set while publishing such a batch to defer intermediate redraws
 * in charts subscribed through `onCommit`.
 * @property {Function} [onDecisionSettled] `onDecisionSettled(id, listener) => unsubscribe | null`.
 * Deliver the terminal receipt for that decision once. The originating chart publishes a committed
 * task change if the same service, stores and record still apply.
 */

/**
 * @typedef {Object} GanttScheduleReceipt
 * @memberof Neo.gantt.Container
 * @property {'committed'|'pending'|'refused'|'unchanged'} status Outcome of the proposed edit.
 * @property {Object} [updates] Committed fields of the edited task, keyed by model field.
 * @property {Object} [previous] Previous values for the fields in `updates`.
 * @property {Object[]} [cascaded] Changed successors as `{taskId, changes, previous}`.
 * @property {String[]} [cycles] Dependency identifiers reported by the service.
 * @property {Object} [pending] Deferred decision. Its `id` is passed to `onDecisionSettled`.
 * @property {String|Number} [pending.id] Token for this pending decision.
 * @property {String|Number} [taskId] Originating task key on a settled receipt, if supplied.
 * @property {String} [action] Originating command on a settled receipt, e.g. `moveTask`.
 * @property {String} [message] Explanation the task editor can display after a refusal.
 * @property {Array<Error|String>} [notificationErrors] Observer errors reported after a committed service edit.
 */

/**
 * What {@link Neo.gantt.Container#resolveTaskDates} read from an edit, for {@link Neo.gantt.Container#fitTaskToWorkingTime}
 * and {@link Neo.gantt.Container#clampTaskToAxis}.
 * @typedef {Object} GanttSpanRequest
 * @memberof Neo.gantt.Container
 * @property {Neo.timeline.TimeAxis|null} axis          The chart's time axis
 * @property {Boolean}                    hasEndInput   True when the edit asks for an end
 * @property {Boolean}                    hasStartInput True when the edit asks for a start
 * @property {Boolean}                    isEndResize   True when a working-time edit moves the end alone
 * @property {Boolean}                    isMilestone   True for a milestone
 * @property {Boolean}                    isStartResize True when a working-time edit moves the start alone
 * @property {Object}                     meta          The edit's gesture source, resize edge and switches
 * @property {Number}                     minMs         The task's minimum duration
 * @property {Number[]}                   prevSpan      The task's `[startMs, endMs]` before the edit
 * @property {Boolean}                    useWorking    True when durations count working time
 */

/**
 * The edit {@link Neo.gantt.Container#moveTask} builds once and hands to each of its steps.
 * @typedef {Object} GanttTaskEdit
 * @memberof Neo.gantt.Container
 * @property {Neo.timeline.TimeAxis|null} axis       The chart's time axis
 * @property {Object}                     changes    The requested changes, with further fields under `fields`
 * @property {String}                     endField   The task's end date field
 * @property {String}                     keyProp    The task store's key property
 * @property {Object}                     meta       The edit's gesture source, resize edge, and clamp and cascade switches
 * @property {String}                     pctField   The task's completion field
 * @property {Number[]}                   prevSpan   The task's `[startMs, endMs]` before the edit
 * @property {Neo.data.Model}             record     The edited task
 * @property {String}                     startField The task's start date field
 * @property {String}                     titleField The task's title field
 * @property {Boolean}                    useWorking True when durations count working time
 */

/**
 * Fires once after a task edit and its dependent changes have been applied.
 * @event taskChange
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object}             data
 * @param {Neo.data.Model}     data.record       Edited task.
 * @param {Object}             data.changes      Changed primary fields. `updates` is an alias for this object.
 * @param {Object}             data.updates      Changed primary fields.
 * @param {Object}             data.previous     Previous values of those fields.
 * @param {Object[]}           data.cascaded     Successors with their `record`, `changes` and `previous` fields.
 * @param {Object}             data.changesById  All changed fields indexed by task store key.
 * @param {Object}             data.previousById Previous values indexed by the same keys.
 * @param {String[]}           data.cycles       Dependency identifiers encountered in cycles during this edit.
 * @param {Date}               data.startDate    Resulting start of the edited task.
 * @param {Date}               data.endDate      Resulting end of the edited task.
 * @param {String}             data.action       Edit action, e.g. `move` or `resize`.
 * @param {String}             data.changeSource Origin of the edit, e.g. `api`, `editor` or `keyboard`.
 * @param {String}             data.source       The sender's component id.
 * @param {'start'|'end'|null} data.resizeEdge   The edge moved for a resize.
 */

/**
 * Fires when the ordinary cascade encounters a cycle reachable from the edited task.
 * @event dependencyCycle
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object}         data
 * @param {Neo.data.Model} data.record The task whose edit started the cascade.
 * @param {String[]}       data.cycles Identifiers of the dependency edges reported by the cascade.
 */

/**
 * Fires when a pointer or keyboard edit receives a service outcome other than a commit.
 * The task editor instead receives the receipt directly from `commitTimelineEdit`.
 * @event scheduleResult
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object}                                   data
 * @param {Neo.data.Model}                           data.record The task whose edit was attempted.
 * @param {Neo.gantt.Container.GanttScheduleReceipt} data.result The service outcome.
 */

export default Neo.setupClass(Container);
