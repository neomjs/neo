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
         * @member {Neo.grid.Container|null} gridContainer=null
         */
        gridContainer: null,
        /**
         * @member {Object} itemDefaults={ntype: 'grid-header-button'}
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * @member {String} role='row'
         */
        role: 'row',
        /**
         * @member {Boolean} showHeaderFilters_=false
         */
        showHeaderFilters_: false,
        /**
         * @member {Boolean} sortable=true
         */
        sortable: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {'aria-rowindex': 1, cn: [{cn: []}]}
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && this.passSizeToView()
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
        let me        = this,
            {mounted} = me;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        super.createItems();

        let {items} = me,
            style;

        items.forEach((item, index) => {
            item.vdom['aria-colindex'] = index + 1; // 1 based

            style = item.wrapperStyle;

            // todo: only add px if number
            if (item.maxWidth) {style.maxWidth = item.maxWidth + 'px'}
            if (item.minWidth) {style.minWidth = item.minWidth + 'px'}
            if (item.width)    {style.width    = item.width    + 'px'}

            item.sortable = me.sortable;
            item.wrapperStyle = style
        });

        me.promiseUpdate().then(() => {
            // To prevent duplicate calls, we need to check the mounted state before the update call
            mounted && me.passSizeToView()
        })
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

    /**
     * @param {Boolean} silent=false
     * @returns {Promise<void>}
     */
    async passSizeToView(silent=false) {
        let me              = this,
            rects           = await me.getDomRect(me.items.map(item => item.id)),
            lastItem        = rects[rects.length - 1],
            columnPositions = rects.map(item => ({width: item.width, x: item.x - rects[0].x})),
            i               = 1,
            len             = columnPositions.length,
            layoutFinished  = true;

        // If the css sizing is not done, columns after the first one can get x = 0
        for (; i < len; i++) {
            if (columnPositions[i].x === 0) {
                layoutFinished = false;
                break;
            }
        }

        // Delay for slow connections, where the container-sizing is not done yet
        if (!layoutFinished) {
            await me.timeout(100);
            await me.passSizeToView(silent)
        } else {
            me.gridContainer.view[silent ? 'setSilent' : 'set']({
                availableWidth: lastItem.x + lastItem.width - rects[0].x,
                columnPositions
            })
        }
    }
}

export default Neo.setupClass(Toolbar);
