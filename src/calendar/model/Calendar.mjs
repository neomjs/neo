import Model from '../../data/Model.mjs';

/**
 * @class Neo.calendar.model.Calendar
 * @extends Neo.data.Model
 */
class Calendar extends Model {
    static config = {
        /**
         * @member {String} className='Neo.calendar.model.Calendar'
         * @protected
         */
        className: 'Neo.calendar.model.Calendar',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'active',
            type: 'Boolean'
        }, {
            name: 'color',
            type: 'String'
        }, {
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }]
    }
}

Neo.setupClass(Calendar);

export default Calendar;
