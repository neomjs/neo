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
         * @member {String[]} baseCls=['neo-table-header-toolbar']
         */
        baseCls: ['neo-table-header-toolbar'],
        /**
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {String} layout='base'
         * @reactive
         */
        layout: 'base',
        /**
         * @member {Object} itemDefaults={ntype : 'table-header-button'}
         * @reactive
         */
        itemDefaults: {
            ntype: 'table-header-button'
        },
        /**
         * Convenience shortcut to pass resizable to all toolbar items.
         * If set to true, header buttons can be resized via drag & drop on their right edge.
         * @member {Boolean} resizable_=true
         * @reactive
         */
        resizable_: true,
        /**
         * @member {Boolean} showHeaderFilters_=false
         * @reactive
         */
        showHeaderFilters_: false,
        /**
         * Convenience shortcut to pass sortable to all toolbar items.
         * If set to true, header clicks will sort the matching column (ASC, DESC, null)
         * @member {Boolean} sortable_=true
         * @reactive
         */
        sortable_: true,
        /**
         * @member {Object} _vdom={tag:'thead',cn:[{tag:'tr',cn:[]}]}
         */
        _vdom:
        {tag: 'thead', cn: [
            {tag: 'tr', cn: []}
        ]}
    }

    /**
     * Triggered after the resizable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetResizable(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                item.resizable = value
            });

            me.updateDepth = 2;
            me.update()
        }
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

            me.updateDepth = 2;
            me.update()
        }
    }

    /**
     *
     */
    createItems() {
        let me = this;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        me.items.forEach(item => {
            if (!Object.hasOwn(item, 'resizable')) {
                item.resizable = me.resizable
            }

            if (!Object.hasOwn(item, 'sortable')) {
                item.sortable = me.sortable
            }
        });

        super.createItems();

        let style;

        me.items.forEach(item => {
            style = item.wrapperStyle;

            // todo: only add px if number
            if (item.maxWidth) {style.maxWidth = item.maxWidth + 'px'}
            if (item.minWidth) {style.minWidth = item.minWidth + 'px'}
            if (item.width)    {style.width    = item.width    + 'px'}

            item.vdom.cls     = item.dock ? ['neo-locked'] : []; // remove the button cls from the th tag
            item.wrapperStyle = style
        });

        me.updateDockOffsets();
        me.update()
    }

    /**
     * Configures the header SortZone to ignore resize handles when initiating column reorder drags.
     * @param {Object} config
     */
    createSortZone(config) {
        Neo.merge(config, {
            ignoreDragSelector: '.neo-resizable'
        });

        super.createSortZone(config)
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

    /**
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../../draggable/table/header/toolbar/SortZone.mjs')
    }

    /**
     * @summary Recalculates sticky `left` / `right` dock offsets across header cells and refreshes the table body
     * when docked columns are present.
     */
    passSizeToBody() {
        let me   = this,
            body = me.parent?.body;

        if (me.updateDockOffsets() && body?.store?.getCount() > 0) {
            body.createViewData()
        }
    }

    /**
     * @summary Writes sticky `left` / `right` dock offsets across header cells and reports whether any column is docked.
     * @returns {Boolean} True when at least one header item has a `dock` config
     */
    updateDockOffsets() {
        let dockLeftWidth  = 0,
            dockRightWidth = 0,
            hasDocked      = false,
            {items}        = this,
            len            = items.length,
            rightItem, style;

        items.forEach((item, index) => {
            if (item.dock === 'left') {
                hasDocked         = true;
                style             = item.wrapperStyle;
                style.left        = dockLeftWidth + 'px';
                item.wrapperStyle = style;
                dockLeftWidth    += (item.width + 1) // todo: borders fix
            }

            rightItem = items[len - index - 1];

            if (rightItem.dock === 'right') {
                hasDocked              = true;
                style                  = rightItem.wrapperStyle;
                style.right            = dockRightWidth + 'px';
                rightItem.wrapperStyle = style;
                dockRightWidth        += (rightItem.width + 1) // todo: borders fix
            }
        });

        return hasDocked
    }
}

export default Neo.setupClass(Toolbar);
