import Model from '../../../src/data/Model.mjs';

/**
 * @summary One order line: what was ordered, how many, at which price, when and where it ships. The line total is
 * calculated from quantity and unit price, so an edited quantity changes it.
 * @class Neo.examples.grid.cellEditing.MainModel
 * @extends Neo.data.Model
 */
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.grid.cellEditing.MainModel',

        fields: [{
            name: 'country',
            type: 'String'
        }, {
            name: 'delivery',
            type: 'Date'
        }, {
            name: 'item',
            type: 'String'
        }, {
            name: 'orderId',
            type: 'String'
        }, {
            name: 'quantity',
            type: 'Int'
        }, {
            name     : 'total',
            type     : 'Float',
            calculate: data => data.quantity * data.unitPrice
        }, {
            name: 'unitPrice',
            type: 'Float'
        }]
    }
}

export default Neo.setupClass(MainModel);
