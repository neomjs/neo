import BaseToolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.table.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static config = {
        /**
         * @member {String} className='Neo.table.header.Toolbar'
         * @protected
         */
        className: 'Neo.table.header.Toolbar',
        /**
         * @member {String} ntype='table-header-toolbar'
         * @protected
         */
        ntype: 'table-header-toolbar',
        /**
         * @member {String[]} baseCls=['table-header-toolbar']
         */
        baseCls: ['table-header-toolbar'],
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Object} itemDefaults={ntype : 'table-header-button'}
         */
        itemDefaults: {
            ntype : 'table-header-button'
        },
        /**
         * @member {Boolean} showHeaderFilters_=false
         */
        showHeaderFilters_: false,
        /**
         * @member {Boolean} sortable=true
         */
        sortable: true,
        /**
         * @member {Object} _vdom={tag:'thead',cn:[{tag:'tr',cn:[]}]}
         */
        _vdom:
        {tag: 'thead', cn: [
            {tag: 'tr', cn: []}
        ]}
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
                item.vdom.cls = ['neo-locked'];

                if (item.dock === 'left') {
                    style.left = dockLeftWidth + 'px'
                }

                dockLeftWidth += (item.width + 1) // todo: borders fix
            } else {
                item.vdom.cls = [] // remove the button cls from the th tag
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
     * @param {String} dock
     * @returns {String} layoutConfig
     * @override
     */
    getLayoutConfig(dock) {
        return 'base'
    }

    /**
     * Specify a different vdom root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVnodeRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vdom root
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * Specify a different vnode root if needed to apply the top level style attributes on a different level.
     * Make sure to use getVdomRoot() as well, to keep the vdom & vnode trees in sync.
     * @returns {Object} The new vnode root
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }
}

export default Neo.setupClass(Toolbar);
