import Model from '../../data/Model.mjs';

/**
 * Shared field definitions for timeline event and task models.
 * Exported as a plain array so models that extend `Neo.data.TreeModel` (such as Gantt tasks)
 * can spread the shared timeline schema alongside hierarchy fields without single-inheritance conflicts.
 * @type {Object[]}
 */
export const timelineFields = [{
    name: 'id'
}, {
    name        : 'title',
    type        : 'String',
    defaultValue: ''
}, {
    name        : 'description',
    type        : 'String',
    defaultValue: ''
}, {
    name: 'startDate',
    type: 'Date'
}, {
    name: 'endDate',
    type: 'Date'
}, {
    name        : 'allDay',
    type        : 'Boolean',
    defaultValue: false
}, {
    // Owning resource id for Scheduler rows; nullable for unscheduled or calendar-only events
    name        : 'resourceId',
    defaultValue: null,
    nullable    : true
}];

/**
 * @summary Shared timeline event record schema.
 * @description Defines the canonical temporal record fields (`id`, `title`, `description`, `startDate`,
 * `endDate`, `allDay`, `resourceId`). Also exports
 * `timelineFields` so `Neo.data.TreeModel` subclasses in Gantt can spread the exact same temporal fields.
 * @class Neo.timeline.model.Event
 * @extends Neo.data.Model
 */
class Event extends Model {
    static config = {
        /**
         * @member {String} className='Neo.timeline.model.Event'
         * @protected
         */
        className: 'Neo.timeline.model.Event',
        /**
         * @member {Object[]} fields
         */
        fields: [
            ...timelineFields,
            {
                name        : 'cls',
                defaultValue: null,
                nullable    : true
            },
            {
                name        : 'percentDone',
                type        : 'Number',
                defaultValue: 0
            }
        ]
    }
}

export default Neo.setupClass(Event);
