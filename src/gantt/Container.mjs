import ClassSystemUtil    from '../util/ClassSystem.mjs';
import Component          from '../component/Base.mjs';
import SchedulerContainer from '../scheduler/Container.mjs';
import TimeAxis           from '../timeline/TimeAxis.mjs';
import Body               from './Body.mjs';
import Cascade            from './Cascade.mjs';
import Column             from './Column.mjs';
import DependencyLayer    from './DependencyLayer.mjs';
import DependencyStore    from './DependencyStore.mjs';
import EventDragZone      from './EventDragZone.mjs';
import TaskStore          from './TaskStore.mjs';

const GanttColumn = Column, GanttBody = Body,
    MS_PER_MINUTE = 60_000, MS_PER_HOUR = 3_600_000, MS_PER_DAY = 86_400_000;

/**
 * @summary Task tree and dependency timeline with a single task-edit writer.
 * @description A row is a task from the tree store. A parent shows its stored dates, so its span can be
 * edited independently of its children. When a date edit triggers a cascade, each reachable successor
 * starts at the latest start required by its incoming links. A shorter predecessor can pull work earlier;
 * a longer one can push work beyond the visible axis. The working calendar, when enabled, determines
 * the elapsed span of the task's working duration. See {@link #moveTask} and {@link #schedule}.
 * @class Neo.gantt.Container
 * @extends Neo.scheduler.Container
 */
class Container extends SchedulerContainer {
    static config = {
        /** @member {String} className='Neo.gantt.Container' @protected */
        className: 'Neo.gantt.Container',
        /** @member {String} ntype='gantt' @protected */
        ntype: 'gantt',
        /** @member {String[]} baseCls=['neo-gantt','neo-grid-container'] @protected */
        baseCls: ['neo-gantt', 'neo-grid-container'],
        /** @member {Number} barMarginPct=14 Padding around bars in each row. */
        barMarginPct: 14,
        /** @member {Boolean} cascadeDependencies_=true Recompute dependent tasks after an edit. @reactive */
        cascadeDependencies_: true,
        /** @member {Boolean|Function} dependencyCreation_=false Enables or filters link gestures. @reactive */
        dependencyCreation_: false,
        /** @member {Object|null} dependencyLayerConfig=null Overrides for the dependency overlay. */
        dependencyLayerConfig: null,
        /** @member {Neo.gantt.DependencyStore|Object|null} dependencyStore_=null Dependency records. @reactive */
        dependencyStore_: null,
        /** @member {Number} minBarWidthPx=6 Minimum visible width for a task bar. */
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
        /** @member {Boolean} showNonWorkingTime=true Displays the axis working calendar. */
        showNonWorkingTime: true,
        /** @member {Object[]} taskColumns_ Locked task tree column descriptors. @reactive */
        taskColumns_: [{type: 'tree', dataField: 'title', text: 'Task', width: 260, locked: 'start'}],
        /** @member {Boolean} useWorkingTime_=false Evaluate task durations using the axis calendar. @reactive */
        useWorkingTime_: false
    }

    dependencyLayer = null
    _movingTask = false
    #cleanups = []
    #storeCleanups = []
    #dependencyCleanups = []
    #ownedDependencies = new WeakSet()
    #ownedTasks = new WeakSet()
    #keyboardLinkSource = null
    #keyboardLinkStatus = null
    #analysis = null
    #analysisPrevious = null
    #serviceCleanup = null
    #pendingCleanup = null

    /** @summary Constructs the chart and binds its overlay to the timeline. */
    construct(config) {
        super.construct(config);
        this.ensureDependencyLayer();
        if (this.dependencyCreation) this.#ensureKeyboardLinkStatus();
        if (this.dependencyCreation && !this.barDraggable) this.ensureEventDragZone();
        this.bindTimelineSubscriptions();
        this.syncDependencyLayer()
    }

    /** @summary Creates the grid body that mounts the dependency layer. */
    beforeSetBody(value) {
        return ClassSystemUtil.beforeSetInstance(value, GanttBody, {
            flex : 1, gridContainer: this, parentId: this.id, store: this.store,
            theme: this.theme, useInternalId: this.useInternalId
        })
    }

    /** @summary Converts task store configurations to a task store. */
    beforeSetStore(value, oldValue) {
        if (!value) return null;
        const store = ClassSystemUtil.beforeSetInstance(value, TaskStore);
        if (store !== value) this.#ownedTasks.add(store);
        return super.beforeSetStore(store, oldValue)
    }

    /** @summary Creates and tracks a configured dependency store. */
    beforeSetDependencyStore(value) {
        if (!value) return null;
        const store = ClassSystemUtil.beforeSetInstance(value, DependencyStore);
        if (store !== value) this.#ownedDependencies.add(store);
        return store
    }

    /** @summary Binds record changes and keeps the overlay aligned. */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);
        this.#analysis?.invalidateSchedule();
        this.#storeCleanups.forEach(fn => fn());
        this.#storeCleanups = [];
        if (value) {
            const changed = data => {
                if (this._movingTask) return;
                this.#analysis?.invalidateSchedule(data);
                if (!(this.schedule?.isPublishing && this.#serviceCleanup)) this.syncDependencyLayer()
            };
            const recordChange = data => {
                if (this._movingTask) return;
                const fields = data?.fields;
                if (!Array.isArray(fields) || !fields.length || fields.some(field => {
                    const name = typeof field === 'string' ? field : field?.name;
                    return !name || [this.startDateField, this.endDateField, 'milestone', 'parentId', 'isLeaf', 'id', value.keyProperty].includes(name)
                })) this.#analysis?.invalidateSchedule();
                if (!(this.schedule?.isPublishing && this.#serviceCleanup)) this.syncDependencyLayer()
            };
            const listeners = {mutate: changed, recordChange, filter: changed};
            value.on(listeners);
            this.#storeCleanups.push(() => value.un(listeners))
        }
        if (this.eventDragZone) this.eventDragZone.store = value;
        if (this.dependencyLayer) { this.dependencyLayer.taskStore = value; this.syncDependencyLayer() }
        if (oldValue && oldValue !== value && this.#ownedTasks.has(oldValue)) oldValue.destroy()
    }

    /** @summary Rebinds dependency changes and releases a store owned by this chart. */
    afterSetDependencyStore(value, oldValue) {
        this.#analysis?.invalidateSchedule();
        this.#dependencyCleanups.forEach(fn => fn());
        this.#dependencyCleanups = [];
        if (value) {
            const changed = () => {
                if (this._movingTask) return;
                this.#analysis?.invalidateSchedule();
                if (!(this.schedule?.isPublishing && this.#serviceCleanup)) this.syncDependencyLayer()
            };
            const listeners = {mutate: changed, recordChange: changed, filter: changed};
            value.on(listeners);
            this.#dependencyCleanups.push(() => value.un(listeners))
        }
        if (this.dependencyLayer) { this.dependencyLayer.dependencyStore = value; this.syncDependencyLayer() }
        if (oldValue && oldValue !== value && this.#ownedDependencies.has(oldValue)) oldValue.destroy()
    }

    /** @summary Enables link gestures when creation is available. */
    afterSetDependencyCreation(value, oldValue) {
        if (oldValue !== undefined && this.isConstructed) {
            this.#setKeyboardLinkSource(null);
            if (value) this.#ensureKeyboardLinkStatus();
            if (value && !this.eventDragZone) this.ensureEventDragZone();
            this.timelineColumn?.refreshMountedRows()
        }
    }

    /** @summary Keeps the drag zone available for link gestures when bar dragging is disabled. */
    afterSetBarDraggable(value, oldValue) {
        super.afterSetBarDraggable(value, oldValue);
        if (!value && this.isConstructed && this.dependencyCreation) this.ensureEventDragZone()
    }

    /** @summary Keeps the overlay associated with the active application. */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);
        if (this.dependencyLayer) this.dependencyLayer.appName = value
    }

    /** @summary Forwards axis buffer changes to the overlay. */
    afterSetBufferPx(value, oldValue) {
        super.afterSetBufferPx(value, oldValue);
        if (oldValue !== undefined && this.dependencyLayer) { this.dependencyLayer.bufferPx = value; this.syncDependencyLayer() }
    }

    /** @summary Forwards row size changes to the overlay. */
    afterSetRowHeight(value, oldValue) {
        super.afterSetRowHeight(value, oldValue);
        if (this.dependencyLayer) { this.dependencyLayer.rowHeight = value; this.syncDependencyLayer() }
    }

    /** @summary Forwards start-field changes and invalidates dependent analysis. */
    afterSetStartDateField(value, oldValue) {
        super.afterSetStartDateField(value, oldValue);
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        if (this.dependencyLayer) { this.dependencyLayer.startDateField = value; this.syncDependencyLayer() }
    }

    /** @summary Forwards end-field changes and invalidates dependent analysis. */
    afterSetEndDateField(value, oldValue) {
        super.afterSetEndDateField(value, oldValue);
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        if (this.dependencyLayer) { this.dependencyLayer.endDateField = value; this.syncDependencyLayer() }
    }

    /** @summary Forwards viewport size changes to the overlay. */
    afterSetViewportWidth(value, oldValue) {
        super.afterSetViewportWidth(value, oldValue);
        if (oldValue !== undefined && this.dependencyLayer) { this.dependencyLayer.viewportWidth = value; this.syncDependencyLayer() }
    }

    /** @summary Keeps the overlay in the chart's window. */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);
        if (this.dependencyLayer) this.dependencyLayer.windowId = value
    }

    /** @summary Updates the overlay after an axis replacement. */
    afterSetTimeAxis(value, oldValue) {
        super.afterSetTimeAxis(value, oldValue);
        if (oldValue !== undefined) this.#analysis?.invalidateSchedule();
        if (this.dependencyLayer) { this.dependencyLayer.timeAxis = value; this.bindTimelineSubscriptions(); this.syncDependencyLayer() }
    }

    /** @summary Refreshes scheduling projections when the working-calendar mode changes. */
    afterSetUseWorkingTime(value, oldValue) {
        if (oldValue !== undefined) {
            this.#analysis?.invalidateSchedule();
            if (this.isConstructed) this.syncDependencyLayer()
        }
    }

    /** @summary Subscribes to committed service changes and releases an earlier service. */
    afterSetSchedule(value) {
        this.#pendingCleanup?.();
        this.#pendingCleanup = null;
        this.#serviceCleanup?.();
        this.#serviceCleanup = value?.onCommit?.(() => {
            if (this.#usesService(value)) {
                this.#analysis?.invalidateSchedule();
                this.syncDependencyLayer()
            }
        }) || null
    }

    /** @summary Checks that an external service still describes the chart's current stores. */
    #usesService(service) {
        return Boolean(service && service === this.schedule && !service.isDestroyed &&
            (!('store' in service) || service.store === this.store) &&
            (!('dependencyStore' in service) || service.dependencyStore === this.dependencyStore))
    }

    /** @summary Publishes a service's committed receipt without repeating its writes. */
    #publishServiceResult(record, result, meta) {
        const convert = (row, fields={}) => Object.fromEntries(Object.entries(fields).map(([key, value]) =>
            [key, row?.[key] instanceof Date && value != null ? new Date(value) : value]));
        const updates = convert(record, result.updates), previous = convert(record, result.previous),
            cascaded  = (result.cascaded || []).map(item => {
                const row = this.resolveTaskRecord(item.taskId);
                return {record: row, changes: convert(row, item.changes), previous: convert(row, item.previous)}
            });
        if (!this.#serviceCleanup) { this.#analysis?.invalidateSchedule(); this.syncDependencyLayer() }
        return this.#publishTaskChange(record, updates, previous, cascaded, result.cycles || [], meta,
            record[this.startDateField], record[this.endDateField])
    }

    /** @summary Rebuilds columns when task column configuration changes. */
    afterSetTaskColumns(value, oldValue) {
        if (oldValue !== undefined && this.configsApplied && this._columns) this.createColumns(null, this._columns)
    }

    /** @summary Subscribes to axis and viewport changes used by the overlay. */
    bindTimelineSubscriptions() {
        this.#cleanups.forEach(fn => fn());
        this.#cleanups = [];
        if (this.timeAxis) for (const key of ['start', 'end', 'pxPerMinute', 'size', 'tickUnit', 'tickStep', 'nonWorkingDays', 'nonWorkingDates', 'timeZone']) {
            this.#cleanups.push(this.observeConfig(this.timeAxis, key, () => {
                if (['nonWorkingDays', 'nonWorkingDates', 'timeZone'].includes(key)) this.#analysis?.invalidateSchedule();
                this.syncDependencyLayer()
            }))
        }
        if (this.headerToolbar) this.#cleanups.push(this.observeConfig(this.headerToolbar, 'scrollLeft', value => {
            if (this.dependencyLayer) this.dependencyLayer.scrollLeft = value || 0
        }))
    }

    /** @summary Updates the dependency layer from the current chart geometry. */
    syncDependencyLayer() {
        const layer = this.ensureDependencyLayer();
        if (!layer) return [];
        const highlights = this.#analysis?.getHighlights() || {};
        let dependencyIds;
        if (this.#analysis) {
            const taskIds = highlights.taskIds || [];
            dependencyIds = highlights.dependencyIds || [];
            if (this.timelineColumn && !Neo.isEqual(this.timelineColumn.highlightedRecordIds, taskIds)) {
                this.timelineColumn.highlightedRecordIds = [...taskIds]
            }
        }
        layer.set({bufferPx: this.bufferPx, dependencyStore: this.dependencyStore, endDateField: this.endDateField,
            rowHeight: this.rowHeight, scrollLeft: this.headerToolbar?.scrollLeft || 0, startDateField: this.startDateField,
            taskStore: this.store, timeAxis: this.timeAxis, viewportWidth: this.timelineColumn?.effectiveViewportWidth || this.viewportWidth});
        if (dependencyIds && !Neo.isEqual(layer.highlightedDependencyIds, dependencyIds)) {
            layer.highlightedDependencyIds = [...dependencyIds];
            return layer.arrows
        }
        return layer.project()
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

    /** @summary Adds an admitted finish-to-start link. */
    linkTasks(input={}) {
        const from = this.resolveTaskRecord(input?.fromId), to = this.resolveTaskRecord(input?.toId);
        if (!to || !this.dependencyStore || !this.canLinkTasks(from, to)) return {status: 'refused', reason: 'invalid-endpoints'};
        const edge = {...input, fromId: this.store.getKey(from), toId: this.store.getKey(to)};
        if (this.schedule?.linkTasks) {
            return this.#usesService(this.schedule) ? this.schedule.linkTasks(edge) :
                {status: 'refused', message: 'The service does not match the current stores.'}
        }
        return this.dependencyStore.addFinishToStart(edge)
    }

    /**
     * @summary Uses one writer for timeline edits and retains service receipts.
     * @param {Neo.data.Model} record The task being edited.
     * @param {Object} changes Changes keyed by their configured field names.
     * @param {Object} [meta] Gesture source and resize information.
     * @returns {Object|Boolean} Applied changes or a service receipt; false when the gesture did not commit.
     */
    commitTimelineEdit(record, changes, meta={}) {
        const result = this.moveTask(record, {...changes, fields: {...changes, ...changes.fields}}, meta);
        if (meta.source !== 'editor' && result?.status && result.status !== 'committed') {
            this.fire('scheduleResult', {record, result});
            return false
        }
        return result ?? false
    }

    /** @summary Adapts inherited keyboard edits to the task writer. */
    moveEvent(record, changes={}, meta={}) {
        const result = this.moveTask(record, changes, meta);
        if (result?.status && result.status !== 'committed') {
            this.fire('scheduleResult', {record, result});
            return null
        }
        return result?.updates || null
    }

    /** @summary Releases owned dependencies and all chart subscriptions. */
    destroy(...args) {
        this.#pendingCleanup?.();
        this.#serviceCleanup?.();
        this.#pendingCleanup = this.#serviceCleanup = null;
        this.#analysis = null;
        this.#cleanups.forEach(fn => fn());
        this.#storeCleanups.forEach(fn => fn());
        this.#dependencyCleanups.forEach(fn => fn());
        const deps = this.dependencyStore, tasks = this.store;
        this.dependencyLayer?.destroy();
        this.dependencyLayer = null;
        super.destroy(...args);
        if (deps && this.#ownedDependencies.has(deps)) deps.destroy();
        if (tasks && this.#ownedTasks.has(tasks)) tasks.destroy()
    }

    /** @summary Computes a lagged timestamp. */
    addLag(...args) { return Cascade.addLag(this, ...args) }
    /** @summary Converts lag to milliseconds. */
    convertLagToMs(...args) { return Cascade.convertLagToMs(...args) }
    /** @summary Computes a successor start. */
    computeRequiredStartMs(...args) { return Cascade.computeRequiredStartMs(this, ...args) }
    /** @summary Cascades dependency changes and reports cycles. */
    runDependencyCascade(...args) { return Cascade.runDependencyCascade(this, ...args) }

    /**
     * @summary Returns the task-tree column descriptors.
     * @returns {Object[]}
     * @protected
     */
    getTimelineLockedColumns() { return this.taskColumns }

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
     * @summary Returns the task store edited by timeline gestures.
     * @returns {Neo.gantt.TaskStore|null}
     * @protected
     */
    getTimelineRecordStore() { return this.store }

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

    /** @summary Creates the dependency overlay and mounts it in the center body. */
    ensureDependencyLayer() {
        const me = this;

        if (!me.dependencyLayer || me.dependencyLayer.isDestroyed) {
            me.dependencyLayer = Neo.create({
                module         : DependencyLayer,
                appName        : me.appName,
                bufferPx       : me.bufferPx,
                dependencyStore: me.dependencyStore,
                endDateField   : me.endDateField,
                id             : `${me.id}__dependency-layer`,
                parentId       : me.body?.id || me.id,
                rowHeight      : me.rowHeight,
                startDateField : me.startDateField,
                taskStore      : me.store,
                timeAxis       : me.timeAxis,
                viewportWidth  : me.viewportWidth,
                windowId       : me.windowId,
                ...me.dependencyLayerConfig
            })
        }

        const rootCn = me.body?.getVdomRoot?.()?.cn;

        if (Array.isArray(rootCn) && !rootCn.some(node => node?.componentId === me.dependencyLayer.id)) {
            rootCn.push(me.dependencyLayer.createVdomReference())
        }

        return me.dependencyLayer
    }

    /** @summary Configures the shared editor for task records. */
    getDefaultEditorConfig() {
        return {
            showResourceField: false,
            title            : 'Edit task'
        }
    }

    /** @summary Collects task records across expanded and collapsed tree branches. */
    collectAllTasks() {
        const
            store   = this.store,
            records = [];

        if (!store) {
            return records
        }

        const
            keyProp = store.keyProperty || 'id',
            seen    = new Set();

        const roots = store.getChildren('root');

        if (roots.length > 0) {
            const rawNodes = [];

            for (const root of roots) {
                store.collectAllDescendants(root, rawNodes)
            }

            for (const node of rawNodes) {
                const
                    record = store.hydrateRecord(node),
                    id     = record?.[keyProp];

                if (record && id !== undefined && id !== null) {
                    const key = String(id);
                    if (!seen.has(key)) {
                        seen.add(key);
                        records.push(record)
                    }
                }
            }
        }

        if (records.length === 0) {
            const count = store.getCount();

            for (let i = 0; i < count; i++) {
                const
                    record = store.getAt(i),
                    id     = record?.[keyProp];

                if (record && id !== undefined && id !== null) {
                    const key = String(id);
                    if (!seen.has(key)) {
                        seen.add(key);
                        records.push(record)
                    }
                }
            }
        }

        return records
    }

    /** @summary Checks whether the configured link affordance accepts the endpoints. */
    canLinkTasks(from, to=null) {
        const allowed = this.dependencyCreation;
        return Boolean(allowed && from && from !== to && (allowed === true || typeof allowed === 'function' && allowed(from, to)))
    }

    /** @summary Creates the live region used for keyboard link announcements. */
    #ensureKeyboardLinkStatus() {
        this.#keyboardLinkStatus ??= this.add({
            module: Component, cls: ['neo-gantt-link-status'], role: 'status', text: '',
            vdom  : {'aria-live': 'polite', 'aria-atomic': 'true'}
        }, !this.vnodeInitialized)
    }

    /** @summary Arms or clears the first keyboard link endpoint. */
    #setKeyboardLinkSource(record, barId=null) {
        const previous = this.#keyboardLinkSource;
        if (!previous && !record) return;
        const row = record && this.body?.items.find(item => item.record === record);
        this.#keyboardLinkSource = record ? {record, barId, row} : null;
        const title = record && (record[this.titleField] || this.store.getKey(record));
        this.#keyboardLinkStatus.text = record
            ? `Link from ${title}. Focus the destination and press L, or press Escape to cancel.` : '';
        if (previous && previous.row?.record === previous.record && previous.row !== row) previous.row.createVdom(false, false);
        row?.createVdom(false, false)
    }

    /** @summary Checks whether a rendered bar owns the armed endpoint. */
    isKeyboardLinkSource(record, barId) {
        const source = this.#keyboardLinkSource;
        return Boolean(source && source.record === record && source.barId === barId)
    }

    /** @summary Discards a keyboard endpoint whose row was recycled. */
    checkKeyboardLinkSource() {
        const source = this.#keyboardLinkSource;
        if (source && (!this.resolveTaskRecord(source.record) || source.row?.record !== source.record ||
            this.timelineColumn?.getBarNodeId(source.row.vdom, this.store.getKey(source.record)) !== source.barId)) {
            this.#setKeyboardLinkSource(null)
        }
    }

    /** @summary Cancels the active keyboard link gesture. */
    cancelKeyboardLink() { this.#setKeyboardLinkSource(null) }

    /** @summary Routes link keys and delegates ordinary task editing keys. */
    onBarKeyDown(data={}) {
        if (data.key === 'Escape') this.#setKeyboardLinkSource(null);
        if (!this.dependencyCreation || data.altKey || data.ctrlKey || data.metaKey || data.key?.toLowerCase() !== 'l') {
            return super.onBarKeyDown(data)
        }
        const {barNode} = this.extractBarTarget(data.path || data.targetPath || []),
              target    = this.resolveTaskRecord(barNode?.data?.eventId), source = this.#keyboardLinkSource;
        if (source) {
            this.#setKeyboardLinkSource(null);
            if (target) return this.linkTasks({fromId: source.record, toId: target})
        }
        else if (this.canLinkTasks(target)) this.#setKeyboardLinkSource(target, barNode.id)
    }

    /** @summary Opens the shared editor for a task record. */
    openTaskEditor(taskIdOrRecord, barId=null) {
        return this.openEventEditor(taskIdOrRecord, barId)
    }

    /** @summary Admits task move and dependency-link gestures. */
    getBarDragContext(zone, path) {
        const terminal = zone.getLinkTerminal(path);
        if (terminal ? !this.dependencyCreation : !this.barDraggable) return null;
        this.#setKeyboardLinkSource(null);
        return {terminal: terminal || null}
    }

    /** @summary Resolves a task key or verifies a record belongs to the task store. */
    resolveTaskRecord(taskIdOrRecord) {
        return this.resolveEventRecord(taskIdOrRecord)
    }

    /** @summary Updates the axis scale and dependency projection. */
    zoomTo(presetOrConfig) {
        const axis = super.zoomTo(presetOrConfig);
        this.syncDependencyLayer();
        return axis
    }

    /**
     * @summary Updates a task and cascades dependent task dates.
     * @param {Neo.data.Model|String|Number|Object} taskIdOrRecord Task, key, or an object containing a task key and changes.
     * @param {Object} [changes={}] Start, end, title, completion, or additional fields under `fields`.
     * @param {Object} [meta={}] Source, resize edge, and optional clamp and cascade controls.
     * @returns {Object|null} Updates and cascade details, an external service receipt, or null for a no-op.
     */
    moveTask(taskIdOrRecord, changes={}, meta={}) {
        ({eventIdOrRecord: taskIdOrRecord, changes, meta} =
            this.normalizeMoveEventArgs(taskIdOrRecord, changes, meta, arguments.length, 'taskId'));

        const
            me     = this,
            record = me.resolveTaskRecord(taskIdOrRecord);

        if (!record || !changes || typeof changes !== 'object' || Array.isArray(changes)) {
            return null
        }


        const
            axis       = me.timeAxis,
            startField = me.startDateField   || 'startDate',
            endField   = me.endDateField     || 'endDate',
            pctField   = me.percentDoneField || 'percentDone',
            titleField = me.titleField       || 'title',
            keyProp    = me.store?.keyProperty || 'id',
            rawFields  = changes.fields && typeof changes.fields === 'object' && !Array.isArray(changes.fields)
                ? changes.fields
                : {},
            rawPrevStart  = record[startField],
            rawPrevEnd    = record[endField],
            prevStartMs   = rawPrevStart instanceof Date ? rawPrevStart.getTime() : new Date(rawPrevStart).getTime(),
            prevEndMs     = rawPrevEnd   instanceof Date ? rawPrevEnd.getTime()   : new Date(rawPrevEnd).getTime(),
            prevPct       = record[pctField] ?? 0,
            prevTitle     = record[titleField],
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

        const
            isMilestone = Boolean(record.milestone),
            minMs       = isMilestone ? 0 : Math.max(1, me.minimumDuration || axis?.snapMinutes || 15) * MS_PER_MINUTE,
            useWorking  = Boolean(me.useWorkingTime && axis?.hasWorkingCalendar());

        if (hasStartInput || hasEndInput) {
            if (useWorking) {
                const
                    isEndResize   = meta.resizeEdge === 'end'   || (!hasStartInput && hasEndInput),
                    isStartResize = meta.resizeEdge === 'start' || (hasStartInput && !hasEndInput && meta.source === 'resize');

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
                    const
                        prevWallMs      = Math.max(0, prevEndMs - prevStartMs),
                        prevWorkMs      = Math.max(0, axis.diffWorkingMs(prevStartMs, prevEndMs)),
                        preservedWorkMs = prevWorkMs > 0 ? prevWorkMs : prevWallMs,
                        inputWallMs     = hasEndInput ? Math.max(0, endMs - startMs) : preservedWorkMs;

                    let requestedWorkMs = preservedWorkMs;

                    if (hasEndInput && Math.abs(inputWallMs - prevWallMs) > 1) {
                        const rawInputWorkMs = Math.max(0, axis.diffWorkingMs(startMs, endMs));
                        requestedWorkMs = rawInputWorkMs > 0 ? rawInputWorkMs : inputWallMs
                    }

                    const workingDurationMs = isMilestone ? 0 : Math.max(minMs, requestedWorkMs);

                    startMs = axis.snapToWorkingTime(startMs, 1).getTime();
                    endMs   = axis.addWorkingMs(startMs, workingDurationMs).getTime()
                }

                if (axis && meta.clamp !== false) {
                    const
                        axisStartMs = axis.start.getTime(),
                        axisEndMs   = axis.end.getTime(),
                        workDurMs   = isMilestone ? 0 : Math.max(minMs, axis.diffWorkingMs(startMs, endMs));

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
                }
            } else if (axis && meta.clamp !== false) {
                const
                    axisStartMs = axis.start.getTime(),
                    axisEndMs   = axis.end.getTime(),
                    durationMs  = Math.max(0, endMs - startMs);

                if (hasStartInput && hasEndInput && meta.source !== 'resize') {
                    startMs = Math.max(axisStartMs, Math.min(startMs, Math.max(axisStartMs, axisEndMs - durationMs)));
                    endMs   = startMs + durationMs
                } else if (hasStartInput && !hasEndInput) {
                    endMs   = Math.min(axisEndMs, prevEndMs);
                    startMs = Math.max(axisStartMs, Math.min(startMs, endMs - minMs))
                } else if (!hasStartInput && hasEndInput) {
                    startMs = Math.max(axisStartMs, prevStartMs);
                    endMs   = Math.min(axisEndMs, Math.max(endMs, startMs + minMs))
                }
            } else if (meta.source === 'resize' && endMs < startMs + minMs) {
                endMs = startMs + minMs
            } else if (endMs < startMs) {
                endMs = startMs
            }
        }

        const
            updates       = {},
            forbiddenKeys = new Set([
                'id', keyProp, 'endDate', 'eventId', 'fields', 'key', 'meta', 'percentDone', 'record', 'startDate', 'taskId', 'title',
                startField, endField, pctField, titleField
            ]);

        if (startMs !== prevStartMs) {
            updates[startField] = new Date(startMs)
        }

        if (endMs !== prevEndMs) {
            updates[endField] = new Date(endMs)
        }

        const rawPctInput = changes.percentDone !== undefined
            ? changes.percentDone
            : changes[pctField] !== undefined
                ? changes[pctField]
                : rawFields.percentDone !== undefined
                    ? rawFields.percentDone
                    : rawFields[pctField];

        if (rawPctInput !== undefined && rawPctInput !== null) {
            const clampedPct = Math.min(100, Math.max(0, Number(rawPctInput) || 0));
            if (clampedPct !== prevPct) {
                updates[pctField] = clampedPct
            }
        }

        const rawTitleInput = changes.title !== undefined
            ? changes.title
            : changes[titleField] !== undefined
                ? changes[titleField]
                : rawFields.title !== undefined
                    ? rawFields.title
                    : rawFields[titleField];

        if (rawTitleInput !== undefined && rawTitleInput !== prevTitle) {
            updates[titleField] = rawTitleInput
        }

        for (const [fieldKey, fieldVal] of Object.entries(rawFields)) {
            if (forbiddenKeys.has(fieldKey) || fieldVal === undefined) {
                continue
            }
            if (fieldVal !== record[fieldKey]) {
                updates[fieldKey] = fieldVal
            }
        }

        if (Object.keys(updates).length === 0) {
            return null
        }

        if ((updates[startField] || updates[endField]) && record.duration !== undefined) {
            const
                unit         = String(record.durationUnit || 'hour').toLowerCase(),
                unitMs       = unit.startsWith('day') ? MS_PER_DAY : unit.startsWith('min') ? MS_PER_MINUTE : MS_PER_HOUR,
                spanMs       = useWorking ? Math.max(0, axis.diffWorkingMs(startMs, endMs)) : (endMs - startMs),
                nextDuration = Math.round((spanMs / unitMs) * 100) / 100;

            if (nextDuration !== record.duration) {
                updates.duration = nextDuration
            }
        }

        const service = me.schedule;
        if (service && !me.#usesService(service)) {
            return {status: 'refused', message: 'The service does not match the current stores.'}
        }
        if (service?.moveTask && (!service.handlesTask || service.handlesTask(me.store.getKey(record)))) {
            const proposal = {...updates};
            delete proposal.duration;
            me._movingTask = true;
            let result;
            try { result = service.moveTask(me.store.getKey(record), proposal) }
            finally { me._movingTask = false }
            if (result?.status === 'committed') {
                const native = me.#publishServiceResult(record, result, meta);
                return {...native, status: 'committed', notificationErrors: result.notificationErrors}
            }
            if (result?.status === 'pending' && result.pending?.id != null && service.onDecisionSettled) {
                me.#pendingCleanup?.();
                const taskId = me.store.getKey(record);
                me.#pendingCleanup = service.onDecisionSettled(result.pending.id, settled => {
                    me.#pendingCleanup = null;
                    if (settled?.status === 'committed' && (!settled.action || settled.action === 'moveTask') &&
                        (settled.taskId === undefined || String(settled.taskId) === String(taskId)) &&
                        me.#usesService(service) && me.resolveTaskRecord(record)) {
                        me.#publishServiceResult(record, settled, meta)
                    }
                })
            }
            return result
        }

        const previous = {};
        for (const key of Object.keys(updates)) {
            const val = record[key];
            previous[key] = val instanceof Date ? new Date(val.getTime()) : val
        }

        let cascaded = [],
            cycles   = [];

        me._movingTask = true;

        try {
            record.set(updates);

            if (
                me.cascadeDependencies &&
                meta.cascade !== false &&
                me.dependencyStore &&
                (updates[startField] || updates[endField])
            ) {
                cascaded = me.runDependencyCascade(record, cycles)
            }
        } finally {
            me._movingTask = false
        }

        if (updates[startField] || updates[endField] || cascaded.length) me.#analysis?.invalidateSchedule();
        me.syncDependencyLayer();

        if (cycles.length > 0) {
            me.fire('dependencyCycle', {
                cycles,
                record
            })
        }

        return me.#publishTaskChange(record, updates, previous, cascaded, cycles, meta, startMs, endMs)
    }

    /** @summary Emits the settled task edit. */
    #publishTaskChange(record, updates, previous, cascaded, cycles, meta, startMs, endMs) {
        const
            action       = meta.action || (meta.resizeEdge ? 'resize' : 'move'),
            changesById  = {[this.store.getKey(record)]: updates},
            previousById = {[this.store.getKey(record)]: previous};

        for (const item of cascaded) {
            changesById[this.store.getKey(item.record)]  = item.changes;
            previousById[this.store.getKey(item.record)] = item.previous
        }

        this.fire('taskChange', {
            action,
            cascaded,
            changes   : updates,
            changesById,
            cycles,
            endDate   : new Date(endMs),
            previous,
            previousById,
            record,
            resizeEdge: meta.resizeEdge || null,
            source    : meta.source || 'api',
            startDate : new Date(startMs),
            updates
        });

        return {updates, cascaded, cycles}
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
 * Fires once after a task edit and its dependent changes have been applied.
 * @event taskChange
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object} data
 * @param {Neo.data.Model} data.record Edited task.
 * @param {Object} data.changes Changed primary fields. `updates` is an alias for this object.
 * @param {Object} data.updates Changed primary fields.
 * @param {Object} data.previous Previous values of those fields.
 * @param {Object[]} data.cascaded Successors with their `record`, `changes` and `previous` fields.
 * @param {Object} data.changesById All changed fields indexed by task store key.
 * @param {Object} data.previousById Previous values indexed by the same keys.
 * @param {String[]} data.cycles Dependency identifiers encountered in cycles during this edit.
 * @param {Date} data.startDate Resulting start of the edited task.
 * @param {Date} data.endDate Resulting end of the edited task.
 * @param {String} data.action Edit action, e.g. `move` or `resize`.
 * @param {String} data.source Origin of the edit, e.g. `api`, `editor` or `keyboard`.
 * @param {'start'|'end'|null} data.resizeEdge The edge moved for a resize.
 */

/**
 * Fires when the ordinary cascade encounters a cycle reachable from the edited task.
 * @event dependencyCycle
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object} data
 * @param {Neo.data.Model} data.record The task whose edit started the cascade.
 * @param {String[]} data.cycles Identifiers of the dependency edges reported by the cascade.
 */

/**
 * Fires when a pointer or keyboard edit receives a service outcome other than a commit.
 * The task editor instead receives the receipt directly from `commitTimelineEdit`.
 * @event scheduleResult
 * @memberof Neo.gantt.Container
 * @instance
 * @param {Object} data
 * @param {Neo.data.Model} data.record The task whose edit was attempted.
 * @param {Neo.gantt.Container.GanttScheduleReceipt} data.result The service outcome.
 */

export default Neo.setupClass(Container);
