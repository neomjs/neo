import OrderStore            from './OrderStore.mjs';
import StateProvider         from '../../../src/state/Provider.mjs';
import {DEFAULT_ORDER_COUNT} from './orderData.mjs';

/**
 * @summary Root state provider for the Order Review Desk, binding exception counters, active filter state, and the
 * live edit-receipt banner to the shared `orders` store.
 * @class Neo.examples.grid.orderReviewDesk.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.orderReviewDesk.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.examples.grid.orderReviewDesk.MainContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            exceptionCount: 6,
            exceptionsOnly: false,
            lastReceipt   : '6 quantity exceptions flagged across 100,000 local orders. Filter to Exceptions only, then double-click or press Enter on Quantity (1–50) to repair.',
            totalOrders   : DEFAULT_ORDER_COUNT,
            visibleOrders : DEFAULT_ORDER_COUNT
        },
        /**
         * @member {Object} stores
         */
        stores: {
            orders: {
                module: OrderStore
            }
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
