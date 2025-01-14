import BaseContainer   from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import GridView        from './View.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';
import Store           from '../data/Store.mjs';
import * as header     from './header/_export.mjs';

/**
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 */
class GridContainer extends BaseContainer {
    /**
     * @member {Object} delayable
     * @protected
     * @static
     */
    static delayable = {
        onResize: {type: 'buffer', timer: 300}
    }

    static config = {
        /**
         * @member {String} className='Neo.grid.Container'
         * @protected
         */
        className: 'Neo.grid.Container',
        /**
         * @member {String} ntype='grid-container'
         * @protected
         */
        ntype: 'grid-container',
        /**
         * @member {String[]} baseCls=['neo-grid-container']
         * @protected
         */
        baseCls: ['neo-grid-container'],
        /**
         * true uses grid.plugin.CellEditing
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
         * Configs for Neo.grid.header.Toolbar
         * @member {Object|null} [headerToolbarConfig=null]
         */
        headerToolbarConfig: null,
        /**
         * @member {String|null} headerToolbarId_=null
         */
        headerToolbarId_: null,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {String} role='grid'
         */
        role: 'grid',
        /**
         * Number in px
         * @member {Number} rowHeight_=32
         */
        rowHeight_: 32,
        /**
         * @member {String|null} scrollbarId_=null
         * @protected
         */
        scrollbarId_: null,
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
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
         * Configs for Neo.grid.View
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
         * @member {Object} _vdom={cls:['neo-grid-wrapper'],cn:[{cn:[]}]}
         */
        _vdom:
        {cls: ['neo-grid-wrapper'], cn: [
            {'aria-rowcount': 1, cn: []} // aria-rowcount includes the column headers
        ]}
    }

    /**
     * We do not need the first event to trigger logic, since afterSetMounted() handles this
     * @member {Boolean}} initialResizeEvent=true
     */
    initialResizeEvent = true

    /**
     * Convenience method to access the Neo.grid.header.Toolbar
     * @returns {Neo.grid.header.Toolbar|null}
     */
    get headerToolbar() {
        return Neo.getComponent(this.headerToolbarId) || Neo.get(this.headerToolbarId)
    }

    /**
     * Convenience method to access the Neo.grid.Scrollbar
     * @returns {Neo.grid.Scrollbar|null}
     */
    get scrollbar() {
        return Neo.getComponent(this.scrollbarId) || Neo.get(this.scrollbarId)
    }

    /**
     * Convenience method to access the Neo.grid.View
     * @returns {Neo.grid.View|null}
     */
    get view() {
        return Neo.getComponent(this.viewId) || Neo.get(this.viewId)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me                 = this,
            {rowHeight, store} = me;

        me.headerToolbarId = Neo.getId('grid-header-toolbar');
        me.scrollbarId     = Neo.getId('grid-scrollbar');
        me.viewId          = Neo.getId('grid-view');

        me.items = [{
            module           : header.Toolbar,
            gridContainer    : me,
            id               : me.headerToolbarId,
            showHeaderFilters: me.showHeaderFilters,
            sortable         : me.sortable,
            ...me.headerToolbarConfig
        }, {
            module     : GridView,
            containerId: me.id,
            id         : me.viewId,
            rowHeight,
            store,
            ...me.viewConfig
        }];

        me.vdom.id = me.getWrapperId();

        me.createColumns(me.columns);

        me.addDomListeners({
            resize: me.onResize,
            scroll: me.onScroll,
            scope : me
        })
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
                let me                  = this,
                    {appName, windowId} = me,
                    plugins             = me.plugins || [];

                plugins.push({
                    module : module.default,
                    appName,
                    windowId
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
        if (oldValue?.length > 0) {
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
     * @param {Boolean} mounted
     * @protected
     */
    async addResizeObserver(mounted) {
        let me             = this,
            ResizeObserver = Neo.main?.addon?.ResizeObserver,
            resizeParams   = {id: me.id, windowId: me.windowId};

        // Check if the remotes api is ready for slow network connections & dist/prod
        if (!ResizeObserver) {
            await me.timeout(100);
            await me.addResizeObserver(mounted)
        } else {
            if (mounted) {
                ResizeObserver.register(resizeParams);
                await me.passSizeToView()
            } else {
                me.initialResizeEvent = true;
                ResizeObserver.unregister(resizeParams)
            }
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        oldValue !== undefined && this.addResizeObserver(value)
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        if (value > 0) {
            let {scrollbar, view} = this;

            if (scrollbar) {
                scrollbar.rowHeight = value
            }

            if (view) {
                view.rowHeight = value
            }
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        this.rendered && value.register(this)
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
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, RowModel)
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();

        if (value) {
            let me = this,

                listeners = {
                    filter      : me.onStoreFilter,
                    load        : me.onStoreLoad,
                    recordChange: me.onStoreRecordChange,
                    scope       : me
                };

            if (value instanceof Store) {
                value.on(listeners);
                value.getCount() > 0 && me.onStoreLoad(value.items)
            } else {
                value = ClassSystemUtil.beforeSetInstance(value, Store, {
                    listeners
                })
            }

            // in case we dynamically change the store, the view needs to get the new reference
            if (me.view) {
                me.view.store = value
            }
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
            Neo.logError('Attempting to create a grid.Container without defined columns', me.id);
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
     * @param {Array} inputData
     */
    createViewData(inputData) {
        let me = this;

        me.getVdomRoot()['aria-rowcount'] = inputData.length + 2; // 1 based & the header row counts as well
        me.update();

        me.view.createViewData()
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.mounted && Neo.main.addon.ResizeObserver.unregister({
            id      : me.id,
            windowId: me.windowId
        });

        super.destroy(...args)
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
     *
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this)
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;

        if (!me.initialResizeEvent) {
            await me.passSizeToView(true);

            me.view.updateVisibleColumns();

            await me.headerToolbar.passSizeToView()
        } else {
            me.initialResizeEvent = false
        }
    }

    /**
     * @param {Object} data
     */
    onScroll(data) {
        this.view.scrollPosition = {x: data.scrollLeft, y: this.view.scrollPosition.y}
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
        me.onStoreLoad(me.store.items)
    }

    /**
     *
     */
    onStoreFilter() {
        this.onStoreLoad(this.store.items)
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        let me = this;

        if (me.rendered) {
            me.createViewData(data);

            if (me.store.sorters.length < 1) {
                me.removeSortingCss()
            }
        } else {
            me.on('rendered', () => {
                me.timeout(50).then(() => {
                    me.createViewData(data)
                })
            }, me, {once: true})
        }
    }

    /**
     * Gets triggered after changing the value of a record field.
     * E.g. myRecord.foo = 'bar';
     * @param {Object} opts
     * @param {String} opts.field The name of the field which got changed
     * @param {Neo.data.Model} opts.model The model instance of the changed record
     * @param {*} opts.oldValue
     * @param {Object} opts.record
     * @param {*} opts.value
     */
    onStoreRecordChange(opts) {
        this.view.onStoreRecordChange(opts)
    }

    /**
     * @param {Boolean} silent=false
     * @returns {Promise<void>}
     */
    async passSizeToView(silent=false) {
        let me                          = this,
            [containerRect, headerRect] = await me.getDomRect([me.id, me.headerToolbarId]);

        // delay for slow connections, where the container-sizing is not done yet
        if (containerRect.height === headerRect.height) {
            await me.timeout(100);
            await me.passSizeToView(silent)
        } else {
            me.view[silent ? 'setSilent' : 'set']({
                availableHeight: containerRect.height - headerRect.height,
                containerWidth : containerRect.width
            })
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

export default Neo.setupClass(GridContainer);
