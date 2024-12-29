import BaseToolbar from '../../toolbar/Base.mjs';
import NeoArray    from '../../util/Array.mjs';

/**
 * @class Neo.grid.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static config = {
        /**
         * @member {String} className='Neo.grid.header.Toolbar'
         * @protected
         */
        className: 'Neo.grid.header.Toolbar',
        /**
         * @member {String} ntype='grid-header-toolbar'
         * @protected
         */
        ntype: 'grid-header-toolbar',
        /**
         * @member {String[]} baseCls=['neo-grid-header-toolbar','neo-toolbar']
         */
        baseCls: ['neo-grid-header-toolbar', 'neo-toolbar'],
        /**
         * @member {Object} itemDefaults={ntype: 'grid-header-button'}
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * @member {Boolean} showHeaderFilters_=false
         */
        showHeaderFilters_: false,
        /**
         * @member {Boolean} sortable=true
         */
        sortable: true
    }

    /**
     * Triggered after the showHeaderFilters config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHeaderFilters(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.setSilent({
                    showHeaderFilter: value
                })
            });

            me.updateDepth = -1; // filters can be deeply nested
            me.update()
        }
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.setSilent({
                    sortable: value
                })
            });

            me.update()
        }
    }

    /**
     *
     */
    createItems() {
        let me = this;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        super.createItems();

        let dockLeftWidth  = 0,
            dockRightWidth = 0,
            {items}        = me,
            len            = items.length,
            style;

        items.forEach((item, index) => {
            style = item.wrapperStyle;

            // todo: only add px if number
            if (item.maxWidth) {style.maxWidth = item.maxWidth + 'px'}
            if (item.minWidth) {style.minWidth = item.minWidth + 'px'}
            if (item.width)    {style.width    = item.width    + 'px'}

            if (item.dock) {
                NeoArray.add(item.vdom.cls, 'neo-locked');

                if (item.dock === 'left') {
                    style.left = dockLeftWidth + 'px'
                }

                dockLeftWidth += (item.width + 1) // todo: borders fix
            }

            item.sortable = me.sortable;
            item.wrapperStyle = style;

            // inverse loop direction
            item = items[len - index -1];

            if (item.dock === 'right') {
                style = item.wrapperStyle;
                style.right = dockRightWidth + 'px';

                item.wrapperStyle = style;

                dockRightWidth += (item.width + 1) // todo: borders fix
            }
        });

        me.update()
    }

    /**
     * @param {String} dataField
     * @returns {Neo.button.Base|null}
     */
    getColumn(dataField) {
        for (const item of this.items) {
            if (item.dataField === dataField) {
                return item
            }
        }

        return null
    }
}

export default Neo.setupClass(Toolbar);
