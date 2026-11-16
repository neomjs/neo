import Model            from '../../../src/data/Model.mjs';
import {timelineFields} from '../../../src/timeline/model/Event.mjs';

/**
 * @summary One work item of the planning arrangement: a board card and a scheduler bar in one record.
 *
 * The timeline's fields place the bar: `resourceId` picks the person's row, `startDate` and `endDate` its span.
 * They keep their canonical names because the event store's range query reads them by name. The board reads
 * its fields through its own configs: `status` picks the card's column and `order` its place in it. `progress`
 * is the card's progress field, and the schedule reads it as the bar's fill (`percentDoneField`).
 *
 * @class Workstation.model.WorkItem
 * @extends Neo.data.Model
 */
class WorkItem extends Model {
    static config = {
        /**
         * @member {String} className='Workstation.model.WorkItem'
         * @protected
         */
        className: 'Workstation.model.WorkItem',
        /**
         * @member {Object[]} fields
         */
        fields: [...timelineFields, {
            name: 'order',
            type: 'Float'
        }, {
            name        : 'progress',
            type        : 'Int',
            defaultValue: 0
        }, {
            name: 'status',
            type: 'String'
        }],
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id'
    }
}

export default Neo.setupClass(WorkItem);
