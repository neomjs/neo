import Scheduler from '../../../src/scheduler/Container.mjs';

/**
 * @summary Resource bookings over the same tasks as the planning chart.
 * @class Neo.examples.dashboard.planning.Scheduler
 * @extends Neo.scheduler.Container
 */
class PlanningScheduler extends Scheduler {
    static config = {
        className: 'Neo.examples.dashboard.planning.Scheduler',
        cls      : ['planning-scheduler'],
        /** @member {Function|null} getTaskChart Resolves the shared task writer after the panes mount. */
        getTaskChart   : null,
        resourceColumns: [{dataField: 'name', text: 'Person', width: 140, locked: 'start'}]
    }

    /**
     * @summary Sends pointer, keyboard and API edits through the chart's task and dependency writer once.
     * @param {Object|String|Number} eventIdOrRecord Event record, key, or an options object.
     * @param {Object} [changes={}] Requested dates and resource.
     * @param {Object} [meta={}] Gesture source and resize edge.
     * @returns {Object|null} The committed fields, or null when the writer refuses the edit.
     */
    moveEvent(eventIdOrRecord, changes={}, meta={}) {
        ({eventIdOrRecord, changes, meta} = this.normalizeMoveEventArgs(eventIdOrRecord, changes, meta, arguments.length));
        const record = this.resolveEventRecord(eventIdOrRecord), chart = this.getTaskChart?.();
        if (!record || !chart || !changes || typeof changes !== 'object') return null;

        const previous = {}, fields = {...changes, ...changes.fields};
        for (const key of ['startDate', 'endDate', 'resourceId', 'duration', ...Object.keys(fields)]) {
            const value = record[key];
            previous[key] = value instanceof Date ? new Date(value) : value
        }
        const result = chart.moveTask(record, {...changes, fields}, meta);
        if (!result || (result.status && result.status !== 'committed') || !result.updates) return null;

        const updates = result.updates, before = {};
        for (const key of Object.keys(updates)) before[key] = previous[key];
        this.fire('eventChange', {
            action      : meta.action || (meta.resizeEdge ? 'resize' : 'move'),
            changeSource: meta.source || 'api', changes: updates,
            endDate     : record.endDate, previous: before, record,
            resizeEdge  : meta.resizeEdge || null, resourceId: record.resourceId,
            startDate   : record.startDate, updates
        });
        return updates
    }
}

export default Neo.setupClass(PlanningScheduler);
