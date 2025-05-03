import BaseContainer     from '../container/Base.mjs';
import ClassSystemUtil   from '../util/ClassSystem.mjs';
import Collection        from '../collection/Base.mjs';
import GridView          from './View.mjs';
import ScrollManager     from './ScrollManager.mjs';
import Store             from '../data/Store.mjs';
import VerticalScrollbar from './VerticalScrollbar.mjs';
import * as column       from './column/_export.mjs';
import * as header       from './header/_export.mjs';

/**
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 */
class GridContainer extends BaseContainer {
    /**
     * @member {Object} columnTypes
     * @protected
     * @static
     */
    static columnTypes = {
        animatedChange  : column.AnimatedChange,
        animatedCurrency: column.AnimatedCurrency,
        column          : column.Base,
        component       : column.Component,
        currency        : column.Currency,
        index           : column.Index,
        progress        : column.Progress
    }
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
         * @member {Neo.grid.Scrollbar|null} scrollbar=null
         * @protected
         */
        scrollbar: null,
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
         * @member {Object} _vdom
         */
        _vdom:
        {cls: ['neo-grid-wrapper'], cn: [
            {'aria-rowcount': 1, cn: []} // aria-rowcount includes the column headers
        ]}
    }

    /**
     * We do not need the first event to trigger logic, since afterSetMounted() handles this
     * @member {Boolean} initialResizeEvent=true
     * @protected
     */
    initialResizeEvent = true
    /**
     * @member {Neo.grid.ScrollManager|null} scrollManager=null
     * @protected
     */
    scrollManager = null

    /**
     * Convenience method to access the Neo.grid.header.Toolbar
     * @returns {Neo.grid.header.Toolbar|null}
     */
    get headerToolbar() {
        return Neo.getComponent(this.headerToolbarId) || Neo.get(this.headerToolbarId)
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

        let me = this,
            {appName, rowHeight, store, windowId} = me;

        me.headerToolbarId = Neo.getId('grid-header-toolbar');
        me.viewId          = Neo.getId('grid-view');

        me.items = [{
            module           : header.Toolbar,
            id               : me.headerToolbarId,
            showHeaderFilters: me.showHeaderFilters,
            sortable         : me.sortable,
            ...me.headerToolbarConfig
        }, {
            module       : GridView,
            flex         : 1,
            gridContainer: me,
            id           : me.viewId,
            rowHeight,
            store,
            ...me.viewConfig
        }];

        me.scrollbar = Neo.create({
            module  : VerticalScrollbar,
            appName,
            parentId: me.id,
            rowHeight,
            store,
            windowId
        });

        me.vdom.cn.push(me.scrollbar.createVdomReference())

        me.vdom.id = me.getWrapperId();

        me._columns = me.createColumns(me.columns);

        me.addDomListeners({
            resize: me.onResize,
            scope : me
        })
    }

    /**
     * @param {Boolean} mounted
     * @protected
     */
    async addResizeObserver(mounted) {
        let me             = this,
            {windowId}     = me,
            ResizeObserver = await Neo.currentWorker.getAddon('ResizeObserver', windowId),
            resizeParams   = {id: me.id, windowId};

        if (mounted) {
            ResizeObserver.register(resizeParams);
            await me.passSizeToView()
        } else {
            me.initialResizeEvent = true;
            ResizeObserver.unregister(resizeParams)
        }
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
     * @param {Neo.collection.Base|null}          value
     * @param {Object[]|Neo.collection.Base|null} oldValue
     * @protected
     */
    async afterSetColumns(value, oldValue) {
        if (oldValue?.getCount?.() > 0) {
            let me = this;

            me.headerToolbar?.createItems()

            await me.timeout(50);

            await me.passSizeToView();

            me.view?.createViewData()
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
            headerButtons    = [],
            sorters          = me.store?.sorters,
            columnClass, renderer;

        columns?.forEach((column, index) => {
            renderer = column.renderer;

            columnDefaults && Neo.assignDefaults(column, columnDefaults);

            if (renderer && Neo.isString(renderer) && me[renderer]) {
                column.renderer = me[renderer]
            }

            if (sorters?.[0] && column.dataField === sorters[0].property) {
                column.isSorted = sorters[0].direction
            }

            column.listeners = {
                sort : me.onSortColumn,
                scope: me
            };

            headerButtons.push(column);

            if (column.component && !column.type) {
                column.type = 'component'
            }

            columnClass = me.constructor.columnTypes[column.type || 'column'];
            delete column.type;

            columns[index] = Neo.create(columnClass, {
                parent  : me,
                windowId: me.windowId,
                ...column
            })
        });

        me.items[0].items = headerButtons;

        if (Neo.typeOf(me._columns) === 'NeoInstance') {
            me._columns.clear();
            me._columns.add(columns);

            return me._columns
        }

        return Neo.create(Collection, {
            keyProperty: 'dataField',
            items      : columns
        })
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.store = null; // remove the listeners

        me.scrollManager.destroy();

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

        let me = this;

        me.scrollManager = Neo.create({
            module       : ScrollManager,
            gridContainer: me,
            gridView     : me.view
        })
    }

    /**
     * @param {Object} data
     */
    async onResize(data) {
        let me = this;

        if (!me.initialResizeEvent) {
            await me.passSizeToView(true);

            me.view.updateMountedAndVisibleColumns();

            await me.headerToolbar.passSizeToView()
        } else {
            me.initialResizeEvent = false
        }
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
        this.updateRowCount()
    }

    /**
     * @param {Object[]} data
     * @protected
     */
    onStoreLoad(data) {
        let me = this;

        me.updateRowCount();

        if (me.store.sorters?.length < 1) {
            me.removeSortingCss()
        }
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
        this.headerToolbar?.items.forEach(column => {
            if (column.dataField !== dataField) {
                column.removeSortingCss()
            }
        })
    }

    /**
     * Used for keyboard navigation (selection models)
     * @param {Number} index
     * @param {Number} step
     */
    scrollByColumns(index, step) {
        let me           = this,
            {view}       = me,
            {columnPositions, containerWidth, mountedColumns, visibleColumns} = view,
            countColumns = columnPositions.getCount(),
            newIndex     = index + step,
            column, mounted, scrollLeft, visible;

        if (newIndex >= countColumns) {
            newIndex %= countColumns;
            step     = newIndex - index
        }

        while (newIndex < 0) {
            newIndex += countColumns;
            step     += countColumns
        }

        mounted = newIndex >= mountedColumns[0] && newIndex <= mountedColumns[1];

        // Not using >= or <=, since the first / last column might not be fully visible
        visible = newIndex > visibleColumns[0] && newIndex < visibleColumns[1];

        if (!visible) {
            // Leaving the mounted area will re-calculate the visibleColumns for us
            if (mounted) {
                visibleColumns[0] += step;
                visibleColumns[1] += step
            }

            column = columnPositions.getAt(newIndex);

            if (step < 0) {
                scrollLeft = column.x
            } else {
                scrollLeft = column.x - containerWidth + column.width
            }

            Neo.main.DomAccess.scrollTo({
                direction: 'left',
                id       : me.id,
                value    : scrollLeft,
                windowId : me.windowId
            })
        }
    }

    /**
     * @param {Boolean} silent=false
     */
    updateRowCount(silent=false) {
        let me = this;

        this.getVdomRoot()['aria-rowcount'] = me.store.getCount() + 2; // 1 based & the header row counts as well
        !silent && this.update()
    }
}

export default Neo.setupClass(GridContainer);
