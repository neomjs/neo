import Model from '../../src/data/Model.mjs';

/**
 * @class Neo.examples.tableFiltering.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.tableFiltering.MainModel',

        fields: [{
            name: 'active',
            type: 'Boolean'
        }, {
            name: 'country',
            type: 'String'
        }, {
            name: 'customer',
            type: 'String'
        }, {
            name: 'id',
            type: 'Int'
        }, {
            name: 'lastOrder',
            type: 'Date'
        }, {
            name: 'openOrders',
            type: 'Int'
        }]
    }
}

export default Neo.setupClass(MainModel);
