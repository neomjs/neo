import Model  from '../../data/Model.mjs';

/**
 * @class Neo.calendar.model.Calendar
 * @extends Neo.data.Model
 */
class Calendar extends Model {
    static getConfig() {return {
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
            name: 'id',
            type: 'Integer'
        }, {
            name: 'color',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }]
    }}
}

Neo.applyClassConfig(Calendar);

export {Calendar as default};