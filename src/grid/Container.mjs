import BaseContainer   from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import RowModel        from '../selection/grid/RowModel.mjs';
import Store           from '../data/Store.mjs';
import View            from './View.mjs';
import * as header     from './header/_export.mjs';

/**
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
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
         */
        baseCls: ['neo-grid-container'],
        /**
         * @member {Object[]} columns_=[]
         */
        columns_: [],
        /**
         * Additional used keys for the selection model
         * @member {Object} keys={}
         */
        keys: {},
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {Neo.data.Store} store_=null
         */
        store_: null,
        /**
         * @member {Object} _vdom={cls:['neo-grid-wrapper'],cn:[{cn:[]}]}
         */
        _vdom:
        {cls: ['neo-grid-wrapper'], cn: [
            {cn: []}
        ]}
    }

    /**
     * Configs for Neo.grid.header.Toolbar
     * @member {Object|null} [headerToolbarConfig=null]
     */
    headerToolbarConfig = null
    /**
     * @member {String|null} headerToolbarId_=null
     */
    headerToolbarId = null
    /**
     * Configs for Neo.grid.View
     * @member {Object|null} [viewConfig=null]
     */
    viewConfig = null
    /**
     * @member {String|null} viewId_=null
     * @protected
     */
    viewId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.headerToolbarId = Neo.getId('grid-header-toolbar');
        me.viewId          = Neo.getId('grid-view');

        me.items = [{
            module           : header.Toolbar,
            id               : me.headerToolbarId,
            showHeaderFilters: me.showHeaderFilters,
            ...me.headerToolbarConfig
        }, {
            module     : View,
            containerId: me.id,
            id         : me.viewId,
            store      : me.store,
            ...me.viewConfig
        }];

        me.vdom.id = me.id + 'wrapper';

        me.createColumns(me.columns)
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
     * @param {Object[]} columns
     * @returns {*}
     */
    createColumns(columns) {
        let me               = this,
            {columnDefaults} = me,
            sorters          = me.store?.sorters,
            renderer;

        if (!columns || !columns.length) {
            Neo.logError('Attempting to create a grid.Container without defined columns', me.id)
        }

        columns.forEach(column => {
            renderer = column.renderer;

            columnDefaults && Neo.assignDefaults(column, columnDefaults);

            if (column.dock && !column.width) {
                Neo.logError('Attempting to create a docked column without a defined width', column, me.id)
            }

            if (renderer && Neo.isString(renderer) && me[renderer]) {
                column.renderer = me[renderer]
            }

            if (sorters?.[0]) {
                if (column.field === sorters[0].property) {
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
     * @param {Object[]} inputData
     */
    createViewData(inputData) {
        this.getView().createViewData(inputData)
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
     * @returns {Neo.grid.View}
     */
    getView() {
        return Neo.getComponent(this.viewId) || Neo.get(this.viewId)
    }

    /**
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0]
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this)
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
        let me = this,
            listenerId;

        if (me.rendered) {
            me.createViewData(data);

            if (me.store.sorters.length < 1) {
                me.removeSortingCss()
            }
        } else {
            listenerId = me.on('rendered', () => {
                me.un('rendered', listenerId);
                setTimeout(() => {
                    me.createViewData(data)
                }, 50)
            })
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
        this.getView().onStoreRecordChange(opts)
    }

    /**
     * @param {String} field
     * @protected
     */
    removeSortingCss(field) {
        this.items[0].items.forEach(column => {
            column.field !== field && column.removeSortingCss()
        })
    }
}

Neo.setupClass(Container);

export default Container;
