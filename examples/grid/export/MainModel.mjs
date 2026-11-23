import Model from '../../../src/data/Model.mjs';

/**
 * @summary One invoice: its number, customer, issue date, amount and status.
 *
 * `date` is an ISO 8601 day (`2026-03-04`), so it sorts as text and exports unchanged.
 * @class Neo.examples.grid.export.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.export.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.export.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'amount',   type: 'Number'},
            {name: 'customer', type: 'String'},
            {name: 'date',     type: 'String'},
            {name: 'id',       type: 'Integer'},
            {name: 'invoice',  type: 'String'},
            {name: 'status',   type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);
