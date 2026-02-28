import Toolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.grid.footer.Toolbar
 * @extends Neo.toolbar.Base
 *
 * @summary A specialized Toolbar designed for the footer area of a Grid Container.
 *
 * This class extends the standard Toolbar to provide built-in integration with the Grid's Data Store.
 * It automatically binds to the following Store events when a store is assigned:
 * - `load`: Triggers `onStoreLoad`
 * - `filter`: Triggers `onStoreFilter`
 * - `progress`: Triggers `onStoreProgress` (useful for streaming proxies)
 *
 * Subclasses should override these placeholder methods to implement specific logic, such as
 * updating status text, progress bars, or pagination controls.
 *
 * @see Neo.grid.Container
 */
class GridFooterToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='Neo.grid.footer.Toolbar'
         * @protected
         */
        className: 'Neo.grid.footer.Toolbar',
        /**
         * @member {String} ntype='grid-footer-toolbar'
         * @protected
         */
        ntype: 'grid-footer-toolbar',
        /**
         * @member {String[]} baseCls=['neo-grid-footer-toolbar', 'neo-toolbar']
         * @protected
         */
        baseCls: ['neo-grid-footer-toolbar', 'neo-toolbar'],
        /**
         * @member {Neo.data.Store|null} store_=null
         * @reactive
         */
        store_: null
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|Object|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me        = this,
            listeners = {
                filter  : me.onStoreFilter,
                load    : me.onStoreLoad,
                progress: me.onStoreProgress,
                scope   : me
            };

        oldValue?.un(listeners);

        // Store might be passed as an instance or config
        if (value && value.on) {
            value.on(listeners)
        } else if (value) {
            value.listeners ??= {};
            Object.assign(value.listeners, listeners)
        }

        return value
    }

    /**
     Overwrite as needed
     * @param {Object} data
     */
    onStoreFilter(data) {}

    /**
     * Overwrite as needed
     * @param {Object} data
     */
    onStoreLoad(data) {}

    /**
     Overwrite as needed
     * @param {Object} data {loaded, total}
     */
    onStoreProgress(data) {}
}

export default Neo.setupClass(GridFooterToolbar);
