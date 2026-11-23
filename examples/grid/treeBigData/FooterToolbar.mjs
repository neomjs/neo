import GridFooterToolbar from '../../../src/grid/footer/Toolbar.mjs';
import Label             from '../../../src/component/Label.mjs';

const format = new Intl.NumberFormat('en-US').format;

/**
 * @summary The tree's size in its first frame: every row the store holds, its depth, and the rows shown now.
 *
 * `Neo.grid.footer.Toolbar` binds the store's `load` and `filter` events, which a new size, Expand All, Collapse All
 * and a filter fire. One expand or collapse fires `mutate`, which this subclass binds as well. A store assigned after
 * its load is shown at once.
 * @class Neo.examples.grid.treeBigData.FooterToolbar
 * @extends Neo.grid.footer.Toolbar
 */
class FooterToolbar extends GridFooterToolbar {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.treeBigData.FooterToolbar'
         * @protected
         */
        className: 'Neo.examples.grid.treeBigData.FooterToolbar',
        /**
         * @member {String[]} cls=['neo-examples-treebigdata-footer']
         * @reactive
         */
        cls: ['neo-examples-treebigdata-footer'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Label,
            reference: 'size'
        }]
    }

    /**
     * Triggered after the store config got changed. A store assigned after its load fires no further event, so the
     * line shows the size the store holds now. The first assignment arrives before the label exists;
     * `onConstructed()` covers it.
     * @param {Neo.data.TreeStore|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        value && this.getItem('size') && this.updateSize()
    }

    /**
     * Adds the `mutate` binding to the base class's `load`, `filter` and `progress` ones.
     * @param {Neo.data.TreeStore|Object|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @returns {Neo.data.TreeStore|Object|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me = this;

        value = super.beforeSetStore(value, oldValue);

        oldValue?.un({mutate: me.onStoreMutate, scope: me});

        if (value?.on) {
            value.on({mutate: me.onStoreMutate, scope: me})
        } else if (value) {
            // The base class created the listeners object with this scope
            value.listeners.mutate = me.onStoreMutate
        }

        return value
    }

    /** @summary Shows the size of a store that arrived with the configuration, already loaded. */
    onConstructed() {
        super.onConstructed();
        this.store && this.updateSize()
    }

    /**
     * @param {Object} data
     */
    onStoreFilter(data) {
        this.updateSize()
    }

    /**
     * @param {Object} data
     */
    onStoreLoad(data) {
        this.updateSize()
    }

    /**
     * @param {Object} data
     */
    onStoreMutate(data) {
        this.updateSize()
    }

    /**
     * Writes all rows and how deep their units go (people sit one level below), then the rows the tree shows now:
     * expanded and kept by the filters.
     */
    updateSize() {
        let {store} = this;

        this.getItem('size').text = `${format(store.amountRows)} rows · ${store.maxDepth} levels of units · ${format(store.getCount())} shown`
    }
}

export default Neo.setupClass(FooterToolbar);
