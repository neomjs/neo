import Model from '../../../src/data/Model.mjs';

/**
 * @summary One payment settlement event streamed into the ledger grid.
 * @class Neo.examples.grid.streaming.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.streaming.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.streaming.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [
            {name: 'amount',       type: 'Float'},
            {name: 'corridor',     type: 'String'},
            {name: 'counterparty', type: 'String'},
            {name: 'desk',         type: 'String'},
            {name: 'id',           type: 'Integer'},
            {name: 'latencyMs',    type: 'Integer'},
            {name: 'settledAt',    type: 'String'},
            {name: 'settlementId', type: 'String'},
            {name: 'status',       type: 'String'}
        ]
    }
}

export default Neo.setupClass(MainModel);
