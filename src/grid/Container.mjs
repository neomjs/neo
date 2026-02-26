import BaseContainer     from '../container/Base.mjs';
import ClassSystemUtil   from '../util/ClassSystem.mjs';
import Collection        from '../collection/Base.mjs';
import GridBody          from './Body.mjs';
import ScrollManager     from './ScrollManager.mjs';
import Store             from '../data/Store.mjs';
import VerticalScrollbar from './VerticalScrollbar.mjs';
import FooterToolbar     from './footer/Toolbar.mjs';
import * as column       from './column/_export.mjs';
import * as header       from './header/_export.mjs';
import {isDescriptor}    from '../core/ConfigSymbols.mjs';

/**
 * @summary The main entry point for creating Data Grids in Neo.mjs.
 *
 * `Neo.grid.Container` orchestrates the entire Grid component. It uses a composite architecture consisting of:
 * 1.  `headerToolbar` ({@link Neo.grid.header.Toolbar}): Manages column headers, sorting, and filtering UI.
 * 2.  `body` ({@link Neo.grid.Body}): The scrollable area containing the data rows.
 * 3.  `scrollbar` ({@link Neo.grid.VerticalScrollbar}): A virtualized scrollbar for handling large datasets.
 *
 * Key features include:
 * -   **Virtual Scrolling:** Only renders visible rows and columns (plus a small buffer) for high performance with large datasets.
 * -   **Store Integration:** Binds directly to a {@link Neo.data.Store} for data management, sorting, and filtering.
 * -   **Column Management:** Supports various column types (text, component, widget) via the `columns` config.
 * -   **Multi-Threaded:** Logic runs in the App Worker, ensuring the UI stays responsive.
 *
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 * @see Neo.grid.Body
 * @see Neo.grid.Row
 * @see Neo.data.Store
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
        countryFlag     : column.CountryFlag,
        currency        : column.Currency,
        githubOrgs      : column.GitHubOrgs,
        githubUser      : column.GitHubUser,
        icon            : column.Icon,
        iconLink        : column.IconLink,
        index           : column.Index,
        linkedin        : column.LinkedIn,
        progress        : column.Progress,
        sparkline       : column.Sparkline
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
         * Configs for Neo.grid.Body
         * @member {Object|null} [body_={[isDescriptor]: true, merge: 'deep', value: null}]
         * @reactive
         */
        body_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
        /**
         * true uses grid.plugin.CellEditing
         * @member {Boolean} cellEditing_=false
         * @reactive
         */
        cellEditing_: false,
        /**
         * Default configs for each column
         * @member {Object} columnDefaults=null
         */
        columnDefaults: null,
        /**
         * @member {Object[]} columns_=[]
         * @reactive
         */
        columns_: [],
        /**
         * Configs for Neo.toolbar.Base
         * @member {Object|null} [footerToolbar_={[isDescriptor]:true,merge:'deep',value:null}]
         * @reactive
         */
        footerToolbar_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
        /**
         * Configs for Neo.grid.header.Toolbar
         * @member {Object|null} [headerToolbar_={[isDescriptor]:true,merge:'deep',value:null}]
         * @reactive
         */
        headerToolbar_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : null
        },
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} role='grid'
         * @reactive
         */
        role: 'grid',
        /**
         * Number in px
         * @member {Number} rowHeight_=32
         * @reactive
         */
        rowHeight_: 32,
        /**
         * @member {Neo.grid.Scrollbar|null} scrollbar=null
         * @protected
         */
        scrollbar: null,
        /**
         * @member {Boolean} showHeaderFilters_=false
         * @reactive
         */
        showHeaderFilters_: false,
        /**
         * @member {Boolean} sortable_=true
         * @reactive
         */
        sortable_: true,
        /**
         * @member {Boolean} useInternalId_=true
         * @reactive
         */
        useInternalId_: true,
        /**
         * True enables restoring the initial sort state (ASC, DESC, null)
         * @member {Boolean} useTriStateSorting_=false
         * @reactive
         */
        useTriStateSorting_: false,
        /**
         * @member {Neo.data.Store} store_=null
         * @reactive
         */
        store_: null,
        /**
         * @member {Array|null} items=null
         * @protected
         * @reactive
         */
        items: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cls: ['neo-grid-wrapper'], cn: [
            {'aria-colcount': 0, 'aria-rowcount': 1, cn: []} // aria-rowcount includes the column headers
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this,
            {appName, rowHeight, store, windowId} = me;

        me.items = [me.headerToolbar, me.body];

        if (me.footerToolbar) {
            me.items.push(me.footerToolbar)
        }

        me.scrollbar = Neo.create({
            module  : VerticalScrollbar,
            appName,
            parentId: me.id,
            rowHeight,
            store,
            theme   : me.theme,
            windowId
        });

        me.vdom.cn.push(me.scrollbar.createVdomReference())

        me.vdom.id = me.getWrapperId();

        me._columns = me.createColumns(me.columns);
        me.updateColCount();

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
            await me.passSizeToBody()
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
        let me              = this,
            {headerToolbar} = me;

        // - If columns changed at run-time OR
        // - In case the `header.Toolbar#createItems()` method has run before columns where available
        if (oldValue?.count || (value?.count && headerToolbar?.isConstructed)) {
            headerToolbar?.createItems()

            await me.timeout(50);

            await me.passSizeToBody();

            me.body?.createViewData()
        }

        me.configsApplied && me.updateColCount()
    }

    /**
     * Triggered after the footerToolbar config got changed
     * @param {Neo.toolbar.Base} value
     * @param {Neo.toolbar.Base} oldValue
     * @protected
     */
    afterSetFooterToolbar(value, oldValue) {
        let me = this;

        if (value && me.store && value.store !== me.store) {
            value.store = me.store
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
        oldValue !== undefined && this.addResizeObserver(value);

        let {scrollManager} = this;

        if (scrollManager) {
            scrollManager.mounted = value
        }
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        if (value > 0) {
            let {body, scrollbar} = this;

            if (scrollbar) {
                scrollbar.rowHeight = value
            }

            if (body) {
                body.rowHeight = value
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
     * Triggered after the useTriStateSorting config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseTriStateSorting(value, oldValue) {
        if (oldValue !== undefined) {
            this.headerToolbar.useTriStateSorting = value
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

        // in case we dynamically change the store, grid.Body needs to get the new reference
        if (me.body) {
            me.body.store = value
        }

        if (me.footerToolbar && me.footerToolbar.store !== value) {
            me.footerToolbar.store = value
        }
    }

    /**
     * Triggered after the useInternalId config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseInternalId(value, oldValue) {
        if (oldValue !== undefined && this.body) {
            this.body.useInternalId = value
        }
    }

    /**
     * Triggered before the body config gets changed.
     * @param {Object|Neo.grid.Body|null} value
     * @param {Object|Neo.grid.Body|null} oldValue
     * @protected
     */
    beforeSetBody(value, oldValue) {
        const me = this;

        return ClassSystemUtil.beforeSetInstance(value, GridBody, {
            flex         : 1,
            gridContainer: me,
            parentId     : me.id,
            store        : me.store,
            theme        : me.theme,
            useInternalId: me.useInternalId
        })
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
     * Triggered before.footerToolbar config gets changed.
     * @param {Object|Neo.toolbar.Base|null} value
     * @param {Object|Neo.toolbar.Base|null} oldValue
     * @returns {Neo.toolbar.Base|null}
     * @protected
     */
    beforeSetFooterToolbar(value, oldValue) {
        if (!value) return null;

        const me = this;

        return ClassSystemUtil.beforeSetInstance(value, FooterToolbar, {
            flex    : 'none',
            parentId: me.id,
            theme   : me.theme
        })
    }

    /**
     * Triggered before the headerToolbar config gets changed.
     * @param {Object|Neo.grid.header.Toolbar|null} value
     * @param {Object|Neo.grid.header.Toolbar|null} oldValue
     * @returns {Neo.toolbar.Base|null}
     * @protected
     */
    beforeSetHeaderToolbar(value, oldValue) {
        const me = this;

        return ClassSystemUtil.beforeSetInstance(value, header.Toolbar, {
            flex              : 'none',
            parentId          : me.id,
            showHeaderFilters : me.showHeaderFilters,
            sortable          : me.sortable,
            theme             : me.theme,
            useTriStateSorting: me.useTriStateSorting
        })
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
     * In case you want to update multiple existing records in parallel,
     * using this method is faster than updating each record one by one.
     * At least until we introduce row based vdom updates.
     * @param {Object[]} records
     */
    bulkUpdateRecords(records) {
        let {body, store} = this,
            {keyProperty} = store;

        if (body) {
            body.silentVdomUpdate = true;

            for (let i = 0, len = records.length; i < len; i++) {
                store.get(records[i][keyProperty])?.set(records[i])
            }

            body.silentVdomUpdate = false;

            body.update()
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

        if (columns) {
            for (let index = 0, len = columns.length; index < len; index++) {
                let column = columns[index];
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
            }
        }

        me.headerToolbar.items = headerButtons;
        me.headerToolbar.createItems();

        if (Neo.typeOf(me._columns) === 'NeoInstance') {
            me._columns.clear();
            me._columns.add(columns);

            return me._columns
        }

        return Neo.create(Collection, {
            keyProperty: 'dataField',
            items      : columns,
            listeners  : {mutate: me.onColumnsMutate, scope: me}
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
     * @param {Object} data
     */
    onColumnsMutate(data) {
        this.updateColCount()
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.scrollManager = Neo.create({
            gridBody     : me.body,
            module       : ScrollManager,
            gridContainer: me
        })
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onResize(data) {
        let me = this;

        if (!me.initialResizeEvent) {
            await me.passSizeToBody(true);

            me.body.updateMountedAndVisibleColumns();

            await me.headerToolbar.passSizeToBody()
        } else {
            me.initialResizeEvent = false
        }
    }

    /**
     * @param {Object} data
     */
    onScrollCapture(data) {
        super.onScrollCapture(data);
        this.scrollManager.onContainerScroll(data)
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
        me.removeSortingCss(opts.property)
    }

    /**
     *
     */
    onStoreFilter() {
        this.updateRowCount()
    }

    /**
     * @param {Object}   data
     * @param {Object[]} data.items
     * @param {Number}   [data.total]
     * @protected
     */
    onStoreLoad(data) {
        let me         = this,
            totalCount = data.total ? data.total : this.store.count;

        me.updateRowCount(totalCount);

        if (me.store.sorters?.length < 1) {
            me.removeSortingCss()
        }
    }

    /**
     * @param {Boolean} silent=false
     * @returns {Promise<void>}
     */
    async passSizeToBody(silent=false) {
        let me            = this,
            {footerToolbar, headerToolbar} = me,
            domRects      = [me.id, headerToolbar.id],
            containerRect, footerRect, headerRect;

        if (footerToolbar) {
            domRects.push(footerToolbar.id)
        }

        [containerRect, headerRect, footerRect] = await me.getDomRect(domRects);

        // delay for slow connections, where the container-sizing is not done yet
        if (containerRect.height === headerRect.height) {
            await me.timeout(100);
            await me.passSizeToBody(silent)
        } else {
            me.body[silent ? 'setSilent' : 'set']({
                availableHeight: containerRect.height - headerRect.height - (footerRect?.height || 0),
                containerWidth : containerRect.width
            })
        }
    }

    /**
     * @param {String} dataField
     * @protected
     */
    removeSortingCss(dataField) {
        let items = this.headerToolbar?.items;
        if (items) {
            for (let i = 0, len = items.length; i < len; i++) {
                if (items[i].dataField !== dataField) {
                    items[i].removeSortingCss()
                }
            }
        }
    }

    /**
     * Used for keyboard navigation (selection models)
     * @param {Number} index
     * @param {Number} step
     */
    scrollByColumns(index, step) {
        let me           = this,
            {body}       = me,
            {columnPositions, containerWidth, mountedColumns, visibleColumns} = body,
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
                id       : me.getVdomRoot().id,
                value    : scrollLeft,
                windowId : me.windowId
            })
        }
    }

    /**
     * Serializes the instance into a JSON-compatible object for the Neural Link.
     * @returns {Object}
     */
    toJSON() {
        let me = this;

        return {
            ...super.toJSON(),
            body             : me.body?.toJSON(),
            cellEditing      : me.cellEditing,
            columns          : me.columns?.items.map(item => item.toJSON()),
            footerToolbar    : me.footerToolbar?.toJSON(),
            headerToolbar    : me.headerToolbar?.toJSON(),
            rowHeight        : me.rowHeight,
            scrollbar         : me.scrollbar?.toJSON(),
            scrollManager     : me.scrollManager?.toJSON(),
            showHeaderFilters : me.showHeaderFilters,
            sortable          : me.sortable,
            store             : me.store?.toJSON(),
            useTriStateSorting: me.useTriStateSorting
        }
    }

    /**
     * @param {Boolean} [silent=false]
     */
    updateColCount(silent=false) {
        let me = this;

        me.getVdomRoot()['aria-colcount'] = me.columns.count;
        !silent && me.update()
    }

    /**
     * @param {Number} [count] The total number of rows in the store. Optional, will use store.count if not provided.
     * @param {Boolean} [silent=false]
     */
    updateRowCount(count, silent=false) {
        let me         = this,
            finalCount = count ? count : me.store.count;

        me.getVdomRoot()['aria-rowcount'] = finalCount + 1;
        !silent && me.update()
    }
}

export default Neo.setupClass(GridContainer);
