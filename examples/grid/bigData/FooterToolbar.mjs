import GridFooterToolbar from '../../../src/grid/footer/Toolbar.mjs';
import Label             from '../../../src/component/Label.mjs';
import MainStore         from './MainStore.mjs';

const format     = new Intl.NumberFormat('en-US').format,
      maxColumns = Math.max(...MainStore.amountColumnsOptions),
      maxRows    = Math.max(...MainStore.amountRowsOptions);

/**
 * @summary The grid's size in its first frame: rows × columns = cells, and the largest size Settings offers.
 *
 * `Neo.grid.footer.Toolbar` binds the store's `load` and `filter` events, so the line follows every size the
 * Settings panel generates and every filter; a store assigned after its load is shown at once. Below the largest size,
 * a second label names it: the size the page title promises.
 * @class Neo.examples.grid.bigData.FooterToolbar
 * @extends Neo.grid.footer.Toolbar
 */
class FooterToolbar extends GridFooterToolbar {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.FooterToolbar'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.FooterToolbar',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-footer']
         * @reactive
         */
        cls: ['neo-examples-bigdata-footer'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Label,
            reference: 'size'
        }, {
            module   : Label,
            cls      : ['neo-examples-bigdata-footer-max'],
            reference: 'max',
            text     : `Up to ${format(maxRows)} × ${format(maxColumns)} in ☰ Settings`
        }],
        /**
         * Wraps the second label below the first on a narrow screen.
         * @member {Object} layout={ntype:'flexbox',align:'center',direction:'row',pack:'start',wrap:'wrap'}
         * @reactive
         */
        layout: {ntype: 'flexbox', align: 'center', direction: 'row', pack: 'start', wrap: 'wrap'}
    }

    /**
     * Triggered after the store config got changed. A store assigned after its load fires no further load event, so
     * the line shows the size the store holds now. The first assignment arrives before the labels exist;
     * `onConstructed()` covers it.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        value && this.getItem('size') && this.updateSize()
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
     * Writes the size the store holds now. A filter shows the rows it keeps of all rows, and the cells they hold.
     */
    updateSize() {
        let me                          = this,
            {amountColumns, amountRows} = me.store,
            rows                        = me.store.getCount(),
            rowsText                    = rows === amountRows ? format(rows) : `${format(rows)} of ${format(amountRows)}`;

        me.getItem('size').text = `${rowsText} rows × ${format(amountColumns)} columns = ${format(rows * amountColumns)} cells`;
        me.getItem('max').hidden = amountRows === maxRows && amountColumns === maxColumns
    }
}

export default Neo.setupClass(FooterToolbar);
