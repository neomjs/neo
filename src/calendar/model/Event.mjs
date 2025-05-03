import Model from '../../data/Model.mjs';

/**
 * @class Neo.calendar.model.Event
 * @extends Neo.data.Model
 */
class Event extends Model {
    static config = {
        /**
         * @member {String} className='Neo.calendar.model.Event'
         * @protected
         */
        className: 'Neo.calendar.model.Event',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'attendees',
            type: 'Array'
        }, {
            name: 'allDay',
            type: 'Boolean'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'calendarId',
            type: 'Integer'
        }, {
            name: 'description',
            type: 'String'
        }, {
            name: 'endDate',
            type: 'Date'
        }, {
            name: 'startDate',
            type: 'Date'
        }, {
            name: 'title',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Event);
