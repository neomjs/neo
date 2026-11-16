import DateUtil from '../../util/Date.mjs';
import DragZone from '../../draggable/DragZone.mjs';
import Events   from '../store/Events.mjs';

const MS_PER_MINUTE = 60_000;

/**
 * @summary Orientation-agnostic, cancel-safe timeline event drag and resize zone.
 * @description Extends `Neo.draggable.DragZone` (`super.dragStart` / `super.dragEnd` /
 * `super.onDragCancel`) and delegates all coordinate↔date conversion, snapping, and boundary clamping
 * to a `Neo.timeline.TimeAxis` (`axis`). Supports whole-bar move (`resizeEdge: null`) and edge
 * resizing (`resizeEdge: 'start' | 'end'`, with optional opposite-edge flip when
 * `enableResizingAcrossOppositeEdge: true`). Commits through `owner.commitTimelineEdit(...)` when present on
 * `owner` (or a single reactive `record.set(...)` + `store.doSort()` otherwise, never `setSilent`),
 * and restores original state without mutating `eventRecord` when `onDragCancel` or
 * `dragEnd({cancelled: true})` fires.
 * @class Neo.timeline.draggable.EventDragZone
 * @extends Neo.draggable.DragZone
 */
class EventDragZone extends DragZone {
    /**
     * Valid values for `orientation`.
     * @member {String[]} orientations=['horizontal','vertical']
     * @protected
     * @static
     */
    static orientations = ['horizontal', 'vertical']

    static config = {
        /**
         * @member {String} className='Neo.timeline.draggable.EventDragZone'
         * @protected
         */
        className: 'Neo.timeline.draggable.EventDragZone',
        /**
         * @member {String} ntype='timeline-event-dragzone'
         * @protected
         */
        ntype: 'timeline-event-dragzone',
        /**
         * Always forward `drag:move` events from `Neo.main.addon.DragDrop` to the App Worker so
         * `DomEvent` routes every frame to {@link #onDragMove} by `dragZoneId`.
         * @member {Boolean} alwaysFireDragMove=true
         */
        alwaysFireDragMove: true,
        /**
         * Owning `Neo.timeline.TimeAxis` instance used for offset↔date math, snapping, and clamping.
         * @member {Neo.timeline.TimeAxis|null} axis_=null
         * @reactive
         */
        axis_: null,
        /**
         * Allow resizing past the opposite edge to flip start and end dates while honoring `minimumDuration`.
         * @member {Boolean} enableResizingAcrossOppositeEdge_=true
         * @reactive
         */
        enableResizingAcrossOppositeEdge_: true,
        /**
         * Active timeline event or task record being moved or resized.
         * @member {Neo.data.Model|Object|null} eventRecord_=null
         * @reactive
         */
        eventRecord_: null,
        /**
         * Minimum allowed event duration in minutes (`>= 1`).
         * @member {Number} minimumDuration_=15
         * @reactive
         */
        minimumDuration_: 15,
        /**
         * Drag axis orientation: `'horizontal'` or `'vertical'`.
         * @member {String} orientation_='horizontal'
         * @reactive
         */
        orientation_: 'horizontal',
        /**
         * Active resize handle edge (`'start' | 'end'`), or `null` for a full-bar move.
         * @member {String|null} resizeEdge_=null
         * @reactive
         */
        resizeEdge_: null,
        /**
         * Optional store holding `eventRecord`; `doSort()` is called after a direct record update.
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null,
        /**
         * CSS class marker used by `resolveTarget(data)` to identify a drop row/resource container in `targetPath`.
         * @member {String} targetCls='neo-timeline-row'
         */
        targetCls: 'neo-timeline-row',
        /**
         * Origin coordinate (clientX or clientY) of the timeline track in viewport pixels when pointer events
         * use client coordinates.
         * @member {Number} trackOrigin=0
         */
        trackOrigin: 0,
        /**
         * Timeline bar drags update `pendingDrop` and commit on drop without cloning a floating DOM proxy by default.
         * @member {Boolean} useProxy=false
         */
        useProxy: false
    }

    /**
     * Captured initial `{startDate, endDate, resourceId}` snapshot at `dragStart`.
     * @member {Object|null} initialSnapshot=null
     * @protected
     */
    initialSnapshot = null
    /**
     * Candidate `{startDate, endDate, targetId, resourceId}` computed during the latest `dragMove`.
     * @member {Object|null} pendingDrop=null
     * @protected
     */
    pendingDrop = null
    /**
     * Pointer grab offset inside the bar along the active axis (`px`).
     * @member {Number} grabOffset=0
     * @protected
     */
    grabOffset = 0

    /**
     * @summary Syncs `moveHorizontal` and `moveVertical` flags when `orientation` changes.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetOrientation(value, oldValue) {
        this.moveHorizontal = value === 'horizontal';
        this.moveVertical   = value === 'vertical'
    }

    /**
     * @summary Re-registers the zone with `Neo.main.addon.DragDrop` when `windowId` changes.
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        value && this.registerZone()
    }

    /**
     * @summary Validates `orientation` against `static orientations`.
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetOrientation(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'orientation')
    }

    /**
     * @summary Computes the snapped, clamped `{startDate, endDate, resourceId}` for a pointer axis offset and target descriptor.
     * @param {Number} offset Axis-relative pixel offset (`px` from `axis.start`)
     * @param {Object|null} [target=null] Resolved drop target descriptor from `resolveTarget(data)`
     * @returns {{startDate: Date, endDate: Date, resourceId: *}}
     */
    datesFor(offset, target=null) {
        const
            me     = this,
            {axis} = me,
            snap   = me.initialSnapshot;

        if (!axis || !snap) {
            return null
        }

        const
            minMs       = Math.max(1, me.minimumDuration || axis.snapMinutes || 15) * MS_PER_MINUTE,
            axisStartMs = axis.start.getTime(),
            axisEndMs   = axis.end.getTime(),
            origStartMs = snap.startDate.getTime(),
            origEndMs   = snap.endDate.getTime(),
            durationMs  = Math.max(0, origEndMs - origStartMs),
            pointerMs   = axis.snap(axis.offsetToDate(offset)).getTime(),
            resourceId  = target?.resourceId !== undefined ? target.resourceId : snap.resourceId;

        let startMs, endMs;

        if (me.resizeEdge === 'start') {
            if (me.enableResizingAcrossOppositeEdge && pointerMs > origEndMs && origEndMs + minMs <= axisEndMs) {
                startMs = origEndMs;
                endMs   = Math.min(axisEndMs, Math.max(origEndMs + minMs, pointerMs))
            } else {
                endMs   = origEndMs;
                startMs = Math.max(axisStartMs, Math.min(pointerMs, endMs - minMs))
            }
        } else if (me.resizeEdge === 'end') {
            if (me.enableResizingAcrossOppositeEdge && pointerMs < origStartMs && origStartMs - minMs >= axisStartMs) {
                endMs   = origStartMs;
                startMs = Math.max(axisStartMs, Math.min(origStartMs - minMs, pointerMs))
            } else {
                startMs = origStartMs;
                endMs   = Math.min(axisEndMs, Math.max(pointerMs, startMs + minMs))
            }
        } else {
            // Full-bar move: preserve exact duration (including milestones, short events, and axis-spanning bars)
            startMs = Math.max(axisStartMs, Math.min(pointerMs, Math.max(axisStartMs, axisEndMs - durationMs)));
            endMs   = startMs + durationMs
        }

        return {
            startDate: new Date(startMs),
            endDate  : new Date(endMs),
            resourceId
        }
    }

    /**
     * @summary Commits the pending drop through `owner.commitTimelineEdit(...)` when present (or a single reactive
     * `record.set(...)` + `store.doSort()` otherwise), or leaves the record untouched when `data.cancelled` is true.
     * @param {Object} [data={}]
     */
    dragEnd(data={}) {
        const
            me      = this,
            edge    = me.resizeEdge,
            owner   = me.owner,
            pending = me.pendingDrop,
            record  = me.eventRecord;

        if (owner?.cls) {
            super.dragEnd(data)
        }

        if (!data?.cancelled && record && pending) {
            const updates = {
                startDate: pending.startDate,
                endDate  : pending.endDate
            };

            if (pending.resourceId !== undefined && !Events.sameResourceId(pending.resourceId, record.resourceId)) {
                updates.resourceId = pending.resourceId
            }

            let committed = updates;

            if (typeof owner?.commitTimelineEdit === 'function') {
                committed = owner.commitTimelineEdit(record, updates, {
                    resizeEdge: edge,
                    source    : edge ? 'resize' : 'drag'
                })
            } else {
                if (typeof record.set === 'function') {
                    record.set(updates)
                } else {
                    Object.assign(record, updates)
                }

                me.store?.doSort?.()
            }

            if (committed !== false && committed?.status !== 'refused') {
                me.fire('dropCommit', {
                    record,
                    ...updates
                })
            }
        }

        me.resetDragState()
    }

    /**
     * @summary Updates `pendingDrop` and proxy geometry along the active orientation during pointer movement.
     * @param {Object} data
     */
    dragMove(data={}) {
        const
            me     = this,
            {axis} = me;

        if (!axis || !me.initialSnapshot) {
            return
        }

        const
            target = me.resolveTarget(data),
            offset = me.pointerOffset(data),
            next   = me.datesFor(offset, target);

        if (!next) {
            return
        }

        me.pendingDrop = {
            ...next,
            targetId: target?.id || null
        };

        if (me.dragProxy) {
            Neo.applyDeltas(me.windowId, [{
                id   : me.dragProxy.id,
                style: me.getDragProxyStyle(next, data)
            }])
        }

        me.fire('dragMove', {
            ...data,
            ...me.pendingDrop
        })
    }

    /**
     * @summary Computes proxy geometry for a snapped drop in the active axis coordinates.
     * @param {Object} next Candidate dates and resource.
     * @param {Object} data Pointer event data.
     * @returns {Object} Style delta for the drag proxy.
     */
    getDragProxyStyle(next, data) {
        const start = this.axis.dateToOffset(next.startDate),
              end   = this.axis.dateToOffset(next.endDate),
              span  = Math.max(1, end - start);
        return this.orientation === 'horizontal'
            ? {left: `${start}px`, width: `${span}px`}
            : {top: `${start}px`, height: `${span}px`}
    }

    /**
     * @summary Runs the base `DragZone#dragStart` handshake (`getMainThreadConfigs()`) and captures the initial record snapshot and grab offset.
     * @param {Object} data
     * @param {AbortSignal} [signal] Discards the snapshot when the press ended during setup.
     */
    async dragStart(data={}, signal) {
        const
            me     = this,
            record = me.eventRecord,
            {axis} = me;

        if (!record || !axis) {
            return
        }

        if (me.owner?.cls) {
            await super.dragStart({
                clientX: data.clientX ?? 0,
                clientY: data.clientY ?? 0,
                ...data,
                path      : data.path       || [],
                targetPath: data.targetPath || []
            }, signal);
            if (signal?.aborted) return
        }

        me.initialSnapshot = {
            startDate : DateUtil.clone(record.startDate),
            endDate   : DateUtil.clone(record.endDate),
            resourceId: record.resourceId
        };

        const
            barStartOffset = axis.dateToOffset(record.startDate),
            rawPointer     = me.rawPointerPosition(data);

        // When resizing an edge, the pointer drives the active edge directly (grabOffset = 0);
        // when moving a bar, preserve where inside the bar the pointer grabbed.
        me.grabOffset  = me.resizeEdge ? 0 : (rawPointer - barStartOffset);
        me.pendingDrop = null;

        me.dragMove(data)
    }

    /**
     * @summary Resolves the bounding rect of `dragElement` from `data.path` or `data.targetPath`, falling back to a zero rect when synthetic payloads omit `rect`.
     * @param {Object} [data={}]
     * @returns {Object}
     */
    getDragElementRect(data={}) {
        const root = this.getDragElementRoot();

        if (root?.id) {
            const rect = super.getDragElementRect({
                path      : data?.path       || [],
                targetPath: data?.targetPath || []
            });

            if (rect) {
                return rect
            }
        }

        return root?.rect || {height: 0, left: 0, top: 0, width: 0, x: 0, y: 0}
    }

    /**
     * @summary Returns the active `dragElement` VDOM node, or a synthetic `{id}` descriptor for `owner` / `this` when no element is assigned yet.
     * @returns {Object}
     */
    getDragElementRoot() {
        return super.getDragElementRoot() || this.owner?.vdom || {id: this.owner?.id || this.id}
    }

    /**
     * @summary Returns the main-thread `DragDrop.setConfigs` handshake descriptor for this timeline drag zone.
     * @returns {Object}
     * @protected
     */
    getMainThreadConfigs() {
        const me = this;

        return {
            ...super.getMainThreadConfigs(),
            alwaysFireDragMove: me.alwaysFireDragMove,
            dragElementRootId : me.getRegistrationRootId(),
            moveHorizontal    : true,
            moveVertical      : true
        }
    }

    /**
     * @summary Uses the owning container's root id when available so `registerZone`, `setConfigs`, and `unregisterZone` share one stable registration key across virtualized bar re-renders.
     * @returns {String|null}
     * @protected
     */
    getRegistrationRootId() {
        return this.owner?.id || super.getRegistrationRootId() || null
    }

    /**
     * @summary Cancels the active drag on Escape / gesture cancel, clearing `pendingDrop` so `dragEnd({cancelled: true})` never mutates `eventRecord`.
     * @param {Object} [data={}]
     */
    onDragCancel(data={}) {
        this.pendingDrop = null;
        super.onDragCancel(data)
    }

    /**
     * @summary Entry point invoked by `Neo.manager.DomEvent` when a `'drag:end'` event carries `data.dragZoneId === this.id`.
     * @param {Object} [data={}]
     */
    onDragEnd(data={}) {
        if (this.initialSnapshot) {
            this.dragEnd(data)
        }
    }

    /**
     * @summary Entry point invoked by `Neo.manager.DomEvent` when a `'drag:move'` event carries `data.dragZoneId === this.id`.
     * @param {Object} [data={}]
     */
    onDragMove(data={}) {
        if (this.initialSnapshot) {
            this.dragMove(data)
        }
    }

    /**
     * @summary Extracts the axis-relative offset (`px` from `axis.start`) for a pointer event payload.
     * @param {Object} data
     * @returns {Number}
     */
    pointerOffset(data={}) {
        return this.rawPointerPosition(data) - this.grabOffset
    }

    /**
     * @summary Computes the raw pointer position along the active orientation relative to `trackOrigin`.
     * @param {Object} data
     * @returns {Number}
     * @protected
     */
    rawPointerPosition(data={}) {
        if (typeof data.axisOffset === 'number') {
            return data.axisOffset
        }

        const clientCoord = this.orientation === 'horizontal'
            ? (data.clientX ?? data.x ?? 0)
            : (data.clientY ?? data.y ?? 0);

        return clientCoord - (this.trackOrigin || 0)
    }

    /**
     * @summary Clears transient drag state after `dragEnd` or `onDragCancel`.
     * @protected
     */
    resetDragState() {
        this.initialSnapshot = null;
        this.pendingDrop     = null;
        this.grabOffset      = 0;
        this.resizeEdge      = null
    }

    /**
     * @summary Hook that resolves the drop target row/resource from `data.targetPath` or `data.path`.
     * @param {Object} data
     * @returns {{id: String, resourceId: *}|null}
     */
    resolveTarget(data={}) {
        const
            path      = data.targetPath || data.path || [],
            targetCls = this.targetCls;

        for (const node of path) {
            const cls = node?.cls;
            if (Array.isArray(cls) ? cls.includes(targetCls) : (typeof cls === 'string' && cls.split(/\s+/).includes(targetCls))) {
                return {
                    id        : node.id,
                    resourceId: node.resourceId ?? node.data?.resourceId
                }
            }
        }

        return null
    }
}

export default Neo.setupClass(EventDragZone);
