import EventDragZone from '../timeline/draggable/EventDragZone.mjs';

/**
 * @summary Scheduler-specific timeline drag and resize zone (`Neo.scheduler.EventDragZone`) that resolves cross-resource drop targets from `Neo.grid.Row` nodes.
 * @description Subclasses {@link Neo.timeline.draggable.EventDragZone} so the drag zone owns its gesture lifecycle end to end:
 * `Neo.manager.DomEvent` routes `drag:move`, `drag:end`, and `drag:cancel` directly to this zone by `dragZoneId`,
 * {@link #resolveTarget} reads the resource from the target row of this grid, and `dragEnd` commits
 * through the owning {@link Neo.scheduler.Container}'s timeline edit hook.
 * @class Neo.scheduler.EventDragZone
 * @extends Neo.timeline.draggable.EventDragZone
 */
class SchedulerEventDragZone extends EventDragZone {
    #pendingStart = null

    static config = {
        /**
         * @member {String} className='Neo.scheduler.EventDragZone'
         * @protected
         */
        className: 'Neo.scheduler.EventDragZone',
        /**
         * @member {String} ntype='scheduler-event-dragzone'
         * @protected
         */
        ntype: 'scheduler-event-dragzone'
    }

    /** @summary True while this booking's drag-start handshake is outstanding. */
    get isDragStarting() { return this.#pendingStart !== null }

    /**
     * @summary Starts a booking gesture and releases its preview if setup fails.
     * @param {Object} [data={}] Pointer event data.
     */
    async dragStart(data={}) {
        const {resizeEdge} = this;
        if (this.cancelPendingStart()) this.resizeEdge = resizeEdge;
        const start = this.#pendingStart = new AbortController();
        try {
            await super.dragStart(data, start.signal)
        } catch (error) {
            if (start.signal.aborted) return;
            this.cancelPendingStart();
            throw error
        } finally {
            if (start === this.#pendingStart) this.#pendingStart = null
        }
    }

    /**
     * @summary Cancels setup before a late response can create a preview or change the booking.
     * @returns {Boolean} Whether a start was pending.
     * @protected
     */
    cancelPendingStart() {
        if (!this.#pendingStart) return false;
        this.#pendingStart.abort();
        this.#pendingStart = null;
        this.clearDragVisuals();
        this.resetDragState();
        this.data = null;
        return true
    }

    /** @summary Escape cancels the current press even while the main thread is answering. */
    onDragCancel(data) {
        if (!this.cancelPendingStart()) super.onDragCancel(data)
    }

    /** @summary A release during startup ends the press before an edit exists. */
    onDragEnd(data) {
        if (!this.cancelPendingStart()) super.onDragEnd(data)
    }

    /** @summary Retires the body-mounted preview when its Scheduler is removed. */
    destroy(...args) {
        if (!this.cancelPendingStart() && this.dragProxy) this.clearDragVisuals();
        super.destroy(...args)
    }

    /**
     * @summary Positions a floating preview in viewport coordinates while preserving snapped width.
     * @param {Object} next Candidate dates and resource.
     * @param {Object} data Pointer event data.
     * @returns {Object} Style delta for the drag proxy.
     */
    getDragProxyStyle(next, data) {
        const style = super.getDragProxyStyle(next, data);
        return {...style, left: `${(this.trackOrigin || 0) + parseFloat(style.left)}px`,
            top: `${(data.clientY ?? 0) - (this.offsetY || 0)}px`}
    }

    /**
     * @summary Resolves the owning grid's target row from `data.targetPath` or `data.path`.
     * @param {Object} [data={}]
     * @returns {{id: String, resourceId: *}|null}
     */
    resolveTarget(data={}) {
        const
            owner = this.owner,
            path  = data.targetPath || data.path || [];

        for (const node of path) {
            if (!node) {
                continue
            }

            const cls = Array.isArray(node.cls)
                ? node.cls
                : typeof node.cls === 'string'
                    ? node.cls.split(/\s+/)
                    : [];

            if (cls.includes('neo-grid-row')) {
                const row = node.id ? Neo.getComponent(node.id) : null;
                if (!row?.record || row.parent.gridContainer !== owner) return null;
                const resourceId = owner.timelineColumn.getResourceId(row.record);
                return resourceId == null ? null : {id: node.id, resourceId}
            }
        }

        // Explicit custom targets retain the generic drag-zone contract; the default is not a Scheduler row.
        return this.targetCls === EventDragZone.config.targetCls ? null : super.resolveTarget(data)
    }
}

export default Neo.setupClass(SchedulerEventDragZone);
