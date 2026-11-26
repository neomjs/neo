import {setup} from '../../../../setup.mjs';

const appName = 'OrderReviewDeskUnitTest';

setup({appConfig: {name: appName}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs';
import OrderModel from '../../../../../../examples/grid/orderReviewDesk/OrderModel.mjs';
import OrderStore from '../../../../../../examples/grid/orderReviewDesk/OrderStore.mjs';
import {
    DEFAULT_ORDER_COUNT,
    MAX_ORDER_QTY,
    SEEDED_EXCEPTIONS,
    generateOrders
} from '../../../../../../examples/grid/orderReviewDesk/orderData.mjs';

test.describe('examples/grid/orderReviewDesk data & Turbo-Mode store contract (#22233)', () => {
    let store;

    test.afterEach(() => {
        store?.destroy();
        store = null
    });

    test('generateOrders(100000) is deterministic and seeds exactly 6 invalid-quantity exceptions across top, middle, and deep rows', () => {
        const firstRun  = generateOrders(),
              secondRun = generateOrders();

        expect(firstRun).toHaveLength(DEFAULT_ORDER_COUNT);
        expect(firstRun[0]).toEqual(secondRun[0]);
        expect(firstRun[3]).toEqual(secondRun[3]);
        expect(firstRun[99984]).toEqual(secondRun[99984]);
        expect(firstRun[99999].orderId).toBe('ORD-100000');

        const exceptions = firstRun.filter(row => row.quantity < 1 || row.quantity > MAX_ORDER_QTY);
        expect(exceptions.map(row => ({orderId: row.orderId, quantity: row.quantity}))).toEqual(
            SEEDED_EXCEPTIONS.map(({orderId, quantity}) => ({orderId, quantity}))
        )
    });

    test('OrderStore keeps 100,000 rows in Turbo Mode, filters to 6 exceptions, recalculates lineTotal on edit, and reaches 0-row empty state', () => {
        store = Neo.create(OrderStore, {
            appName,
            data: generateOrders()
        });

        expect(store.autoInitRecords).toBe(false);
        expect(store.count).toBe(DEFAULT_ORDER_COUNT);
        expect(store.model.className).toBe(OrderModel.prototype.className);

        // Unhydrated raw entries remain plain objects until accessed via get/getAt
        expect(Neo.data.RecordFactory.isRecord(store._items[50000])).toBe(false);

        const filter = store.getFilter('hasException');
        expect(filter).toBeTruthy();
        filter.disabled = false;

        expect(store.count).toBe(SEEDED_EXCEPTIONS.length);

        // Repair the first exception and verify lineTotal + automatic filter reapplication (`reapplyOnRecordChange: true`)
        const firstException = store.get('ORD-000004');
        expect(firstException.hasException).toBe(true);
        expect(firstException.exceptionReason).toBe(`Exceeds limit (${MAX_ORDER_QTY})`);

        firstException.set({quantity: 10});
        expect(firstException.lineTotal).toBe(10 * firstException.unitPrice);
        expect(firstException.hasException).toBe(false);
        expect(firstException.exceptionReason).toBe('OK');
        expect(store.count).toBe(SEEDED_EXCEPTIONS.length - 1);

        // Repair the remaining 5 exceptions down to the zero-exceptions empty state
        for (const {orderId} of SEEDED_EXCEPTIONS.slice(1)) {
            const record = store.get(orderId);
            expect(record.hasException).toBe(true);
            record.set({quantity: 5});
            expect(record.hasException).toBe(false);
            expect(record.lineTotal).toBe(5 * record.unitPrice)
        }

        expect(store.count).toBe(0);

        // Re-enabling all orders shows all 100,000 rows with updated totals intact in memory
        filter.disabled = true;
        expect(store.count).toBe(DEFAULT_ORDER_COUNT);
        expect(store.get('ORD-000004').quantity).toBe(10);
        expect(store.get('ORD-099985').quantity).toBe(5)
    })
});
