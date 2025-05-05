import BaseContainer   from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import CssUtil         from '../util/Css.mjs';
import NeoArray        from '../util/Array.mjs';
import Store           from '../data/Store.mjs';
import View            from './View.mjs';
import * as header     from './header/_export.mjs';

/**
 * @class Neo.table.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.table.Container'
         * @protected
         */
        className: 'Neo.table.Container',
        /**
         * @member {String} ntype='table-container'
         * @protected
         */
        ntype: 'table-container',
        /**
         * @member {String[]} baseCls=['neo-table-container']
         */
        baseCls: ['neo-table-container'],
        /**
         * true uses table.plugin.CellEditing
         * @member {Boolean} cellEditing_=false
         */
        cellEditing_: false,
        /**
         * Default configs for each column
         * @member {Object} columnDefaults=null
         */
        columnDefaults: null,
        /**
         * @member {Object[]} columns_=[]
         */
        columns_: [],
        /**
         * Configs for Neo.table.header.Toolbar
         * @member {Object|null} [headerToolbarConfig=null]
         */
        headerToolbarConfig: null,
        /**
         * @member {String|null} headerToolbarId_=null
         */
        headerToolbarId_: null,
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Boolean} scrollbarsCssApplied=false
         * @protected
         */
        scrollbarsCssApplied: false,
        /**
         * @member {Boolean} showHeaderFilters_=false
         */
        showHeaderFilters_: false,
        /**
         * @member {Boolean} sortable_=true
         */
        sortable_: true,
        /**
         * @member {Neo.data.Store} store_=null
         */
        store_: null,
        /**
         * todo: only works for chrome & safari -> add a check
         * @member {Boolean} useCustomScrollbars_=true
         */
        useCustomScrollbars_: true,
        /**
         * Configs for Neo.table.View
         * @member {Object|null} [viewConfig=null]
         */
        viewConfig: null,
        /**
         * @member {String|null} viewId_=null
         * @protected
         */
        viewId_: null,
        /**
         * @member {Array|null} items=null
         * @protected
         */
        items: null,
        /**
         * @member {Object} _vdom={cls: ['neo-table-wrapper'],cn : [{tag: 'table',cn : []}]}
         */
        _vdom:
        {cls: ['neo-table-wrapper'], cn: [
            {tag: 'table', cn: []}
        ]}
    }

    /**
     * Convenience method to access the Neo.table.header.Toolbar
     * @returns {Neo.table.header.Toolbar|null}
     */
    get headerToolbar() {
        return Neo.getComponent(this.headerToolbarId) || Neo.get(this.headerToolbarId)
    }

    /**
     * Convenience method to access the Neo.table.View
     * @returns {Neo.table.View|null}
     */
    get view() {
        return Neo.getComponent(this.viewId) || Neo.get(this.viewId)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.headerToolbarId = Neo.getId('table-header-toolbar');
        me.viewId          = Neo.getId('table-view');

        me.items = [{
            module           : header.Toolbar,
            id               : me.headerToolbarId,
            showHeaderFilters: me.showHeaderFilters,
            sortable         : me.sortable,
            ...me.headerToolbarConfig
        }, {
            module     : View,
            containerId: me.id,
            id         : me.viewId,
            store      : me.store,
            ...me.viewConfig
        }];

        me.vdom.id = me.getWrapperId();

        me.createColumns(me.columns)
    }

    /**
     * Triggered after the cellEditing config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetCellEditing(value, oldValue) {
        if (value) {
            import('./plugin/CellEditing.mjs').then(module => {
                let me        = this,
                    {appName} = me,
                    plugins   = me.plugins || [];

                plugins.push({
                    module: module.default,
                    appName
                });

                me.plugins = plugins
            })
        }
    }

    /**
     * Triggered after the columns config got changed
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetColumns(value, oldValue) {
        if (Array.isArray(oldValue) && oldValue.length > 0) {
            let me              = this,
                {headerToolbar} = me;

            if (headerToolbar) {
                headerToolbar.items = value;
                headerToolbar.createItems()
            }

            me.view?.createViewData()
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
            this.headerToolbar.showHeaderFilters = value
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
            this.headerToolbar.sortable = value
        }
    }

    /**
     * Triggered after the store config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me        = this,
            listeners = {
                filter: me.onStoreFilter,
                load  : me.onStoreLoad,
                scope : me
            };

        value   ?.on(listeners);
        oldValue?.un(listeners);

        // in case we dynamically change the store, the view needs to get the new reference
        if (me.view) {
            me.view.store = value
        }
    }

    /**
     * Triggered after the useCustomScrollbars config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseCustomScrollbars(value, oldValue) {
        if (value === true) {
            this.vdom.cls = NeoArray.union(this.vdom.cls, ['neo-use-custom-scrollbar'])
        }
    }

    /**
     * @protected
     */
    applyCustomScrollbarsCss() {
        let me       = this,
            id       = me.getWrapperId(),
            cssRules = [];

        if (me.dockLeftMargin) {
            cssRules.push('#' + id + '::-webkit-scrollbar-track:horizontal {margin-left: ' + me.dockLeftMargin + 'px;}')
        }

        if (me.dockRightMargin) {
            cssRules.push('#' + id + '::-webkit-scrollbar-track:horizontal {margin-right: ' + me.dockRightMargin + 'px;}')
        }

        if (cssRules.length > 0) {
            CssUtil.insertRules(me.windowId, cssRules)
        }

        me.scrollbarsCssApplied = true
    }

    /**
     * Triggered before the columns config gets changed.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    beforeSetColumns(value, oldValue) {
        if (this.configsApplied) {
            return this.createColumns(value)
        }

        return value
    }

    /**
     * Triggered before the headerToolbarId config gets changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetHeaderToolbarId(value, oldValue) {
        return value || oldValue
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store}             oldValue
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (value) {
            value = ClassSystemUtil.beforeSetInstance(value, Store)
        }

        return value
    }

    /**
     * Triggered before the viewId config gets changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetViewId(value, oldValue) {
        return value || oldValue
    }

    /**
     * In case you want to update multiple existing records in parallel,
     * using this method is faster than updating each record one by one.
     * At least until we introduce row based vdom updates.
     * @param {Object[]} records
     */
    bulkUpdateRecords(records) {
        let {store, view} = this,
            {keyProperty} = store;

        if (view) {
            view.silentVdomUpdate = true;

            records.forEach(item => {
                store.get(item[keyProperty])?.set(item)
            });

            view.silentVdomUpdate = false;

            view.update()
        }
    }

    /**
     * @param {Object[]} columns
     * @returns {*}
     */
    createColumns(columns) {
        let me               = this,
            {columnDefaults} = me,
            sorters          = me.store?.sorters,
            renderer;

        if (!columns || !columns.length) {
            Neo.logError('Attempting to create a table.Container without defined columns', me.id);
        }

        columns.forEach(column => {
            renderer = column.renderer;

            columnDefaults && Neo.assignDefaults(column, columnDefaults);

            if (column.dock && !column.width) {
                Neo.logError('Attempting to create a docked column without a defined width', column, me.id);
            }

            if (renderer && Neo.isString(renderer) && me[renderer]) {
                column.renderer = me[renderer]
            }

            if (sorters?.[0]) {
                if (column.dataField === sorters[0].property) {
                    column.isSorted = sorters[0].direction
                }
            }

            column.listeners = {
                sort : me.onSortColumn,
                scope: me
            }
        });

        me.items[0].items = columns;

        return columns
    }

    /**
     * @override
     * @returns {*}
     */
    getVdomRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @returns {Object[]} The new vdom items root
     */
    getVdomItemsRoot() {
        return this.vdom.cn[0]
    }

    /**
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     * @returns {String}
     */
    getWrapperId() {
        return `${this.id}__wrapper`
    }

    /**
     * @param {Object} opts
     * @param {String} opts.direction
     * @param {String} opts.property
     * @protected
     */
    onSortColumn(opts) {
        let me = this;

        me.store.sort(opts);
        me.removeSortingCss(opts.property);
        opts.direction && me.view.onStoreLoad()
    }

    /**
     *
     */
    onStoreFilter() {
        this.onStoreLoad()
    }

    /**
     * @protected
     */
    onStoreLoad() {
        let me = this;

        if (me.useCustomScrollbars && me.scrollbarsCssApplied === false) {
            me.applyCustomScrollbarsCss()
        }

        if (me.store.sorters?.length < 1) {
            me.removeSortingCss()
        }
    }

    /**
     * @param {String} dataField
     * @protected
     */
    removeSortingCss(dataField) {
        this.headerToolbar.items.forEach(column => {
            if (column.dataField !== dataField) {
                column.removeSortingCss()
            }
        })
    }
}

export default Neo.setupClass(Container);
