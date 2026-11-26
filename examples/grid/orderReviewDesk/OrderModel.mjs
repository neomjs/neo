import Model           from '../../../src/data/Model.mjs';
import {MAX_ORDER_QTY} from './orderData.mjs';

/**
 * @summary Order record contract shared between `examples/grid/orderReviewDesk` and the enterprise Grid
 * tutorial. Uses pure `calculate` fields with explicit `depends` so `OrderStore` runs in Turbo Mode
 * (`autoInitRecords: false`) over `100,000` raw objects while hydrating edited rows lazily.
 * @class Neo.examples.grid.orderReviewDesk.OrderModel
 * @extends Neo.data.Model
 */
class OrderModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.orderReviewDesk.OrderModel'
         * @protected
         */
        className: 'Neo.examples.grid.orderReviewDesk.OrderModel',
        /**
         * @member {String} keyProperty='orderId'
         */
        keyProperty: 'orderId',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'orderId',
            type: 'String'
        }, {
            name: 'customer',
            type: 'String'
        }, {
            name: 'region',
            type: 'String'
        }, {
            name: 'sku',
            type: 'String'
        }, {
            name: 'item',
            type: 'String'
        }, {
            name: 'quantity',
            type: 'Int'
        }, {
            defaultValue: MAX_ORDER_QTY,
            name        : 'maxOrderQty',
            type        : 'Int'
        }, {
            name: 'unitPrice',
            type: 'Float'
        }, {
            name: 'shipDate',
            type: 'Date'
        }, {
            calculate: data => Math.round(Math.max(0, data.quantity) * data.unitPrice * 100) / 100,
            depends  : ['quantity', 'unitPrice'],
            name     : 'lineTotal',
            type     : 'Float'
        }, {
            calculate: data => data.quantity < 1 || data.quantity > (data.maxOrderQty ?? MAX_ORDER_QTY),
            depends  : ['quantity', 'maxOrderQty'],
            name     : 'hasException',
            type     : 'Boolean'
        }, {
            calculate: data => {
                let limit = data.maxOrderQty ?? MAX_ORDER_QTY;

                if (data.quantity < 1) {
                    return 'Min 1 unit'
                }
                if (data.quantity > limit) {
                    return `Exceeds limit (${limit})`
                }
                return 'OK'
            },
            depends: ['hasException', 'quantity', 'maxOrderQty'],
            name   : 'exceptionReason',
            type   : 'String'
        }]
    }
}

export default Neo.setupClass(OrderModel);
