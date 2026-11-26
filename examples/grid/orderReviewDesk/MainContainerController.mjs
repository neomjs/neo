import ComponentController                                  from '../../../src/controller/Component.mjs';
import {DEFAULT_ORDER_COUNT, MAX_ORDER_QTY, generateOrders} from './orderData.mjs';

const currencyFormatter = new Intl.NumberFormat('en-US', {
    currency             : 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style                : 'currency'
});

const integerFormatter = new Intl.NumberFormat('en-US');

/**
 * @summary Coordinates deterministic seed loading, `Exceptions only` filtering, deep-row buffered jumps, O(1) live
 * exception counting across `100,000` local orders, and theme switching for the Order Review Desk.
 * @class Neo.examples.grid.orderReviewDesk.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.orderReviewDesk.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.grid.orderReviewDesk.MainContainerController'
    }

    /**
     * Set of `orderId` keys currently violating the `1..maxOrderQty` contract, updated in O(1) on `recordChange`
     * without hydrating untouched raw rows.
     * @member {Set<String>} exceptionKeys=new Set()
     * @protected
     */
    exceptionKeys = new Set()

    /**
     * @summary Detaches store listeners before teardown.
     * @param {...*} args
     */
    destroy(...args) {
        let me    = this,
            store = me.getStore('orders');

        store?.un({
            load        : me.onStoreLoad,
            recordChange: me.onStoreRecordChange,
            scope       : me
        });

        super.destroy(...args)
    }

    /**
     * @summary Counts rendered `.neo-grid-row` pool instances across active grid bodies to surface buffered DOM pooling.
     * @returns {Number}
     */
    getMountedRowPoolCount() {
        let grid = this.getReference('grid');

        if (!grid) {
            return 0
        }

        let bodies = [grid.bodyStart, grid.body, grid.bodyEnd].filter(Boolean);

        if (bodies.length === 0) {
            return 0
        }

        // Report the center body's active row pool size (each region pools the same viewport-bounded row window)
        return (grid.body || bodies[0]).items?.filter(row => Boolean(row.record)).length || 0
    }

    /**
     * @summary Loads or reloads the deterministic `100,000`-row order dataset into `OrderStore` and initializes the
     * O(1) exception key ledger.
     * @param {String} [reason='initial']
     */
    loadSeedOrders(reason = 'initial') {
        let me            = this,
            store         = me.getStore('orders'),
            stateProvider = me.getStateProvider(),
            rows          = generateOrders(DEFAULT_ORDER_COUNT),
            exceptionKeys = new Set();

        for (let i = 0, len = rows.length; i < len; i++) {
            let row   = rows[i],
                limit = row.maxOrderQty ?? MAX_ORDER_QTY;

            if (row.quantity < 1 || row.quantity > limit) {
                exceptionKeys.add(row.orderId)
            }
        }

        me.exceptionKeys = exceptionKeys;
        store.data       = rows;

        stateProvider.setData({
            exceptionCount: exceptionKeys.size,
            totalOrders   : rows.length,
            visibleOrders : store.count,
            lastReceipt   : reason === 'reset'
                ? `Reset deterministic seed: ${exceptionKeys.size} quantity exceptions restored across ${integerFormatter.format(rows.length)} local orders.`
                : `${exceptionKeys.size} quantity exceptions flagged across ${integerFormatter.format(rows.length)} local orders. Filter to Exceptions only, then double-click or press Enter on Quantity (1–50) to repair.`
        })
    }

    /**
     * @summary Shows all `100,000` local orders in the grid.
     */
    onAllOrdersClick() {
        this.setExceptionsOnly(false)
    }

    /**
     * @summary Wires store listeners, populates the deterministic `100,000`-row seed, and syncs the theme button once
     * the view's references and state provider exist.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me    = this,
            store = me.getStore('orders');

        store.on({
            load        : me.onStoreLoad,
            recordChange: me.onStoreRecordChange,
            scope       : me
        });

        me.loadSeedOrders('initial');
        me.syncThemeButton()
    }

    /**
     * @summary Filters the grid down to rows where `hasException === true`.
     */
    onExceptionsOnlyClick() {
        this.setExceptionsOnly(true)
    }

    /**
     * @summary Scrolls directly to deep order `ORD-099985` (row `99,985` of `100,000`), selects its `quantity` cell,
     * and reports the viewport-bounded mounted row pool on the live receipt banner.
     */
    onJumpDeepOrderClick() {
        let me            = this,
            grid          = me.getReference('grid'),
            store         = me.getStore('orders'),
            stateProvider = me.getStateProvider(),
            targetOrderId = 'ORD-099985';

        // If `Exceptions only` is active and ORD-099985 was already repaired, switch back to All Orders so it is reachable
        if (stateProvider.getData('exceptionsOnly') && !me.exceptionKeys.has(targetOrderId)) {
            me.setExceptionsOnly(false)
        }

        let record   = store.get(targetOrderId),
            rowIndex = record ? store.indexOf(record) : -1;

        if (!grid || !record || rowIndex < 0) {
            return
        }

        grid.view.scrollByRows(rowIndex, 0);

        if (grid.view.selectionModel?.selectsCells) {
            grid.view.selectionModel.select(grid.view.getLogicalCellId(record, 'quantity'))
        }

        grid.view.focus?.();

        let poolCount = me.getMountedRowPoolCount();

        stateProvider.setData({
            lastReceipt: `Jumped to ${targetOrderId} (row ${integerFormatter.format(rowIndex + 1)} of ${integerFormatter.format(store.count)}) · Mounted row pool: ${poolCount} rows.`
        })
    }

    /**
     * @summary Restores the initial `100,000` deterministic orders and `6` seeded exceptions in memory.
     */
    onResetSeedClick() {
        this.loadSeedOrders('reset')
    }

    /**
     * @summary Keeps `visibleOrders` synchronized whenever filters or seed loads change the store's active count.
     */
    onStoreLoad() {
        let me    = this,
            store = me.getStore('orders');

        if (!store || me.component?.isDestroyed) {
            return
        }

        me.getStateProvider().setData({
            exceptionCount: me.exceptionKeys.size,
            visibleOrders : store.count
        })
    }

    /**
     * @summary Updates the O(1) exception set, visible row count, and live recalculated-total receipt whenever an
     * order's `quantity` is edited inline.
     * @param {Object} data
     * @param {Object[]} data.fields
     * @param {Neo.data.Model} data.record
     */
    onStoreRecordChange({fields, record}) {
        let me             = this,
            store          = me.getStore('orders'),
            stateProvider  = me.getStateProvider(),
            quantityChange = fields?.find(field => field.name === 'quantity'),
            wasException   = me.exceptionKeys.has(record.orderId);

        if (record.hasException) {
            me.exceptionKeys.add(record.orderId)
        } else {
            me.exceptionKeys.delete(record.orderId)
        }

        let remaining     = me.exceptionKeys.size,
            formattedLine = currencyFormatter.format(record.lineTotal),
            qtyTransition = quantityChange ? `${quantityChange.oldValue} → ${record.quantity}` : `${record.quantity}`,
            outcomeText   = !record.hasException && wasException
                ? (remaining === 0
                    ? 'All exceptions resolved (0 remaining)'
                    : `Exception resolved (${remaining} remaining)`)
                : record.hasException
                    ? `Flagged (${record.exceptionReason} · ${remaining} remaining)`
                    : `Updated (${remaining} exceptions remaining)`;

        stateProvider.setData({
            exceptionCount: remaining,
            visibleOrders : store.count,
            lastReceipt   : `${record.orderId} · Quantity ${qtyTransition} · Line total ${formattedLine} · ${outcomeText}.`
        })
    }

    /**
     * @summary Toggles the viewport between `neo-theme-neo-dark` and `neo-theme-neo-light`.
     * @param {Object} [data]
     * @returns {Promise<void>}
     */
    async onThemeButtonClick(data) {
        let me   = this,
            view = me.component;

        await Neo.main.DomAccess.startViewTransition({
            delay   : 100,
            reveal  : {x: data?.clientX, y: data?.clientY},
            windowId: view.windowId
        }).catch(() => {});

        view.theme = view.getTheme() === 'neo-theme-neo-dark' ? 'neo-theme-neo-light' : 'neo-theme-neo-dark';
        me.syncThemeButton()
    }

    /**
     * @summary Enables or disables the store's `hasException` filter and updates the receipt line.
     * @param {Boolean} exceptionsOnly
     */
    setExceptionsOnly(exceptionsOnly) {
        let me            = this,
            store         = me.getStore('orders'),
            filter        = store.getFilter('hasException'),
            stateProvider = me.getStateProvider();

        if (filter && filter.disabled === exceptionsOnly) {
            filter.disabled = !exceptionsOnly
        }

        let remaining = me.exceptionKeys.size;

        stateProvider.setData({
            exceptionCount: remaining,
            exceptionsOnly,
            visibleOrders : store.count,
            lastReceipt   : exceptionsOnly
                ? (remaining > 0
                    ? `Showing ${remaining} exception ${remaining === 1 ? 'order' : 'orders'} out of ${integerFormatter.format(stateProvider.getData('totalOrders'))}. Double-click or press Enter on Quantity (1–50) to repair.`
                    : '0 exceptions remain across 100,000 local orders.')
                : `Showing all ${integerFormatter.format(store.count)} local orders (${remaining} ${remaining === 1 ? 'exception' : 'exceptions'} remaining).`
        })
    }

    /**
     * @summary Updates the theme toggle button's label and icon to name the next theme.
     */
    syncThemeButton() {
        let me     = this,
            dark   = me.component.getTheme() === 'neo-theme-neo-dark',
            button = me.getReference('themeButton');

        button?.set({
            iconCls: dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon',
            text   : dark ? 'Light theme' : 'Dark theme'
        })
    }
}

export default Neo.setupClass(MainContainerController);
