import EventDragZone from '../timeline/draggable/EventDragZone.mjs';

/**
 * @summary Scheduler-specific timeline drag and resize zone (`Neo.scheduler.EventDragZone`) that resolves cross-resource drop targets from `Neo.grid.Row` nodes.
 * @description Subclasses {@link Neo.timeline.draggable.EventDragZone} so the drag zone owns its gesture lifecycle end to end:
 * `Neo.manager.DomEvent` routes `drag:move`, `drag:end`, and `drag:cancel` directly to this zone by `dragZoneId`,
 * {@link #resolveTarget} maps `.neo-grid-row` and `.neo-timeline-row` targets to `{id, resourceId}` via the owning
 * {@link Neo.scheduler.Container}, and `dragEnd` commits through the owner's timeline edit hook.
 * @class Neo.scheduler.EventDragZone
 * @extends Neo.timeline.draggable.EventDragZone
 */
class SchedulerEventDragZone extends EventDragZone {
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
     * @summary Resolves the target resource row (`{id, resourceId}`) from `data.targetPath` or `data.path` across
     * `.neo-timeline-row` and `.neo-grid-row` nodes belonging to `owner`.
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

            if (cls.includes('neo-timeline-row') && (node.resourceId !== undefined || node.data?.resourceId !== undefined)) {
                return {
                    id        : node.id,
                    resourceId: node.resourceId ?? node.data?.resourceId
                }
            }

            if (cls.includes('neo-grid-row') || node.data?.recordId !== undefined) {
                if (node.resourceId !== undefined || node.data?.resourceId !== undefined) {
                    return {
                        id        : node.id,
                        resourceId: node.resourceId ?? node.data?.resourceId
                    }
                }

                const
                    recordId  = node.data?.recordId,
                    rowComp   = node.id ? Neo.getComponent(node.id) : null,
                    rowRecord = rowComp?.record ||
                        (node.id && (
                            owner?.body?.getRecordByRowId?.(node.id) ||
                            owner?.bodyStart?.getRecordByRowId?.(node.id) ||
                            owner?.bodyEnd?.getRecordByRowId?.(node.id)
                        )) ||
                        (recordId !== undefined && (
                            owner?.store?.getByInternalId?.(recordId) ||
                            owner?.store?.get?.(recordId) ||
                            owner?.body?.getRecord?.(recordId)
                        )) ||
                        (node.id && owner?.body?.getRecord?.(node.id)) ||
                        null;

                if (rowRecord) {
                    const resourceId = owner?.timelineColumn
                        ? owner.timelineColumn.getResourceId(rowRecord)
                        : (rowRecord[owner?.resourceIdField || 'id'] ?? rowRecord.id);

                    if (resourceId !== null && resourceId !== undefined) {
                        return {
                            id: node.id,
                            resourceId
                        }
                    }
                } else if (recordId !== undefined && !String(recordId).startsWith('neo-record-')) {
                    return {
                        id        : node.id,
                        resourceId: recordId
                    }
                }
            }
        }

        return super.resolveTarget(data)
    }
}

export default Neo.setupClass(SchedulerEventDragZone);
