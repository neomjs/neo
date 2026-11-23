import Model from '../../../src/data/Model.mjs';

/**
 * @summary One order: who placed it, what it holds, its amount, its date and whether it is paid.
 * @class Neo.examples.grid.filtering.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.filtering.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.filtering.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'id',       type: 'Integer'},
            {name: 'customer', type: 'String'},
            {name: 'category', type: 'String'},
            {name: 'amount',   type: 'Integer'},
            // A calendar day as its ISO string: a Date field turns the typed day into UTC midnight, which the
            // header projects back as the previous day west of UTC
            {name: 'date',     type: 'String'},
            {name: 'paid',     type: 'Boolean'}
        ]
    }
}

export default Neo.setupClass(MainModel);
