import Model from '../../data/Model.mjs';

/**
 * @class Neo.calendar.model.Color
 * @extends Neo.data.Model
 */
class Color extends Model {
    static config = {
        /**
         * @member {String} className='Neo.calendar.model.Color'
         * @protected
         */
        className: 'Neo.calendar.model.Color',
        /**
         * @member {Object[]} fields
         * @protected
         */
        fields: [{
            name: 'id',
            type: 'Integer'
        }, {
            name: 'name',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Color);
