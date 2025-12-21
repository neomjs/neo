import BaseToolbar from '../../toolbar/Base.mjs';

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
         * @member {Boolean} dragResortable=true
         * @reactive
         */
        dragResortable: true,
        /**
         * @member {Object} itemDefaults={ntype: 'grid-header-button'}
         * @reactive
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * @member {String} role='row'
         * @reactive
         */
        role: 'row',
        /**
         * @member {Number} scrollLeft_=0
         * @reactive
         */
        scrollLeft_: 0,
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
        value && this.passSizeToBody()
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
     * Triggered after the scrollLeft config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetScrollLeft(value, oldValue) {
        if (oldValue !== undefined && this.sortZone) {
            this.sortZone.scrollLeft = value
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
        let me        = this,
            {mounted} = me;

        me.itemDefaults.showHeaderFilter = me.showHeaderFilters;

        me.items.forEach(item => {
            if (!Object.hasOwn(item, 'sortable')) {
                item.sortable = me.sortable
            }
        });

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

            item.wrapperStyle = style
        });

        me.promiseUpdate().then(() => {
            // To prevent duplicate calls, we need to check the mounted state before the update call
            mounted && me.passSizeToBody()
        })
    }

    /**
     * @param {Object} config
     */
    createSortZone(config) {
        let me = this;

        Neo.merge(config, {
            boundaryContainerId: [me.id, me.parent.id],
            scrollLeft         : me.scrollLeft
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
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../../draggable/grid/header/toolbar/SortZone.mjs')
    }

    /**
     * @param {Boolean} silent=false
     * @returns {Promise<void>}
     */
    async passSizeToBody(silent=false) {
        let me              = this,
            {items}         = me,
            {body}          = me.parent,
            rects           = await me.getDomRect(items.map(item => item.id)),
            lastItem        = rects[rects.length - 1],
            columnPositions = rects.map((item, index) => ({dataField: items[index].dataField, width: item.width, x: item.x - rects[0].x})),
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
            await me.passSizeToBody(silent)
        } else {
            body.columnPositions.clear();
            body.columnPositions.add(columnPositions);

            body[silent ? 'setSilent' : 'set']({
                availableWidth: lastItem.x + lastItem.width - rects[0].x
            });

            !silent && body.updateMountedAndVisibleColumns()
        }
    }

    /**
     * @param {Number}  index
     * @returns {Promise<void>}
     */
    async scrollToIndex(index) {
        await Neo.main.DomAccess.scrollIntoView({
            delay   : 125,
            id      : this.items[index].id,
            windowId: this.windowId
        })
    }
}

export default Neo.setupClass(Toolbar);
