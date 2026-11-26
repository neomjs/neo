import OrderModel from './OrderModel.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @summary Local in-memory store holding `100,000` deterministic orders in Turbo Mode (`autoInitRecords: false`).
 * Declares an opt-in `hasException` filter with `reapplyOnRecordChange: true` so repairing an invalid quantity while
 * filtered to exceptions immediately updates the visible repair queue.
 * @class Neo.examples.grid.orderReviewDesk.OrderStore
 * @extends Neo.data.Store
 */
class OrderStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.orderReviewDesk.OrderStore'
         * @protected
         */
        className: 'Neo.examples.grid.orderReviewDesk.OrderStore',
        /**
         * Keeps all `100,000` unedited rows as lightweight raw objects and hydrates only visible/edited `Record`s.
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {Object[]} filters
         */
        filters: [{
            disabled             : true,
            operator             : '===',
            property             : 'hasException',
            reapplyOnRecordChange: true,
            value                : true
        }],
        /**
         * @member {String} keyProperty='orderId'
         */
        keyProperty: 'orderId',
        /**
         * @member {Neo.data.Model} model=OrderModel
         */
        model: OrderModel
    }
}

export default Neo.setupClass(OrderStore);
