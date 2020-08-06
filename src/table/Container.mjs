import {default as BaseContainer}   from '../container/Base.mjs';
import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import Css                          from '../util/Css.mjs';
import NeoArray                     from '../util/Array.mjs';
import RowModel                     from '../selection/table/RowModel.mjs';
import Store                        from '../data/Store.mjs';
import View                         from './View.mjs';
import * as header from './header/_export.mjs';

/**
 * @class Neo.table.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
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
         * todo: testing config, remove when Stores are ready
         * @member {Number} amountRows=20
         */
        amountRows: 20,
        /**
         * Default configs for each column
         * @member {Object} columnDefaults=null
         */
        columnDefaults: null,
        /**
         * todo: testing config, remove when Stores are ready
         * @member {Boolean} createRandomData=false
         */
        createRandomData: false,
        /**
         * @member {Array} cls=['neo-table-container']
         */
        cls: ['neo-table-container'],
        /**
         * @member {Array} columns_=[]
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
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
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
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {Boolean} showHeaderFilters_=false
         */
        showHeaderFilters_: false,
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
        _vdom: {
            cls: ['neo-table-wrapper'],
            cn : [{
                tag: 'table',
                cn : []
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me = this;

        me.headerToolbarId = Neo.getId('table-header-toolbar');
        me.viewId          = Neo.getId('table-view');

        me.items = [{
            module           : header.Toolbar,
            id               : me.headerToolbarId,
            showHeaderFilters: me.showHeaderFilters,
            ...me.headerToolbarConfig || {}
        }, {
            module     : View,
            containerId: me.id,
            id         : me.viewId,
            store      : me.store,
            ...me.viewConfig || {}
        }];

        me.vdom.id = me.id + 'wrapper';

        me.createColumns(me.columns);console.log(me);
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.selectionModel) {
            me.selectionModel.register(me);
        }

        if (me.createRandomData) {
            // todo: if mounting apply after mount
            setTimeout(() => {
                me.createRandomViewData(me.amountRows);
            }, 50);
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);
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
            Neo.getComponent(this.headerToolbarId).showHeaderFilters = value;
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
            this.vdom.cls = NeoArray.union(this.vdom.cls, ['neo-use-custom-scrollbar']);
        }
    }

    /**
     * @protected
     */
    applyCustomScrollbarsCss() {
        let me       = this,
            cssRules = [];

        if (me.dockLeftMargin) {
            cssRules.push('#' + me.id + 'wrapper' + '::-webkit-scrollbar-track:horizontal {margin-left: ' + me.dockLeftMargin + 'px;}');
        }

        if (me.dockRightMargin) {
            cssRules.push('#' + me.id + 'wrapper' + '::-webkit-scrollbar-track:horizontal {margin-right: ' + me.dockRightMargin + 'px;}');
        }
        if (cssRules.length > 0) {
            Css.insertRules(cssRules);
        }

        me.scrollbarsCssApplied = true;
    }

    /**
     * Triggered before the columns config gets changed.
     * @param {Array} value
     * @param {Array} oldValue
     * @protected
     */
    beforeSetColumns(value, oldValue) {
        if (this.configsApplied) {
            return this.createColumns(value);
        }

        return value;
    }

    /**
     * Triggered before the headerToolbarId config gets changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetHeaderToolbarId(value, oldValue) {
        return value ? value : oldValue;
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, RowModel);
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        let me = this;

        value = ClassSystemUtil.beforeSetInstance(value, Store, {
            listeners: {
                load        : me.onStoreLoad,
                recordChange: me.onStoreRecordChange,
                scope       : me
            }
        });

        // in case we dynamically change the store, the new needs to get the new reference
        if (me.view) {
            me.view.store = value;
        }

        return value;
    }

    /**
     * Triggered before the viewId config gets changed.
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetViewId(value, oldValue) {
        return value ? value : oldValue;
    }

    /**
     *
     * @param columns
     * @returns {*}
     */
    createColumns(columns) {
        let me             = this,
            columnDefaults = me.columnDefaults,
            sorters        = me.store.sorters;

        if (!columns || !columns.length) {
            Neo.logError('Attempting to create a table.Container without defined columns', me.id);
        }

        columns.forEach(column => {
            if (column.dock && !column.width) {
                Neo.logError('Attempting to create a docked column without a defined width', column, me.id);
            }

            if (columnDefaults) {
                Neo.assignDefaults(column, columnDefaults);
            }

            if (sorters && sorters[0]) {
                if (column.dataField === sorters[0].property) {
                    column.isSorted = sorters[0].direction;
                }
            }

            column.listeners = {
                sort : me.onSortColumn,
                scope: me
            };
        });

        me.items[0].items = columns;

        return columns;
    }

    /**
     *
     * @param {Number} countRows
     */
    createRandomViewData(countRows) {
        this.loadData(countRows);
    }

    /**
     * @param {Array} inputData
     */
    createViewData(inputData) {
        let me    = this,
            items = me.items;

        items[1].createViewData(inputData); // todo: save a reference to the view & headerContainer

        if (me.useCustomScrollbars && me.scrollbarsCssApplied === false) {
            me.applyCustomScrollbarsCss();
        }

        me.items = items;
    }

    /**
     * @override
     * @returns {*}
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }

    /**
     *
     * @param {Number} countRows
     */
    loadData(countRows) {
        let me           = this,
            columns      = me.items[0].items,
            countColumns = columns.length;

        Neo.manager.Store.createRandomData([countColumns, countRows]).then(data => {
            me.createViewData(data);
        }).catch(err => {
            console.log('Error attempting to call createRandomViewData', err, me);
        });
    }

    /**
     *
     * @param {Object} opts
     * @param {String} opts.direction
     * @param {String} opts.property
     * @protected
     */
    onSortColumn(opts) {
        let me = this;

        me.store.sort(opts);
        me.removeSortingCss(opts.property);
        me.onStoreLoad(me.store.items);
    }

    /**
     *
     * @param {Array} data
     * @protected
     */
    onStoreLoad(data) {
        let me = this,
            listenerId;

        if (me.rendered) {
            me.createViewData(data);

            if (me.store.sorters.length < 1) {
                me.removeSortingCss();
            }
        } else {
            listenerId = me.on('rendered', () => {
                me.un('rendered', listenerId);
                setTimeout(() => {
                    me.createViewData(data);
                }, 50);
            });
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
        Neo.getComponent(this.viewId).onStoreRecordChange(opts);
    }

    /**
     *
     * @param {String} dataField
     * @protected
     */
    removeSortingCss(dataField) {
        this.items[0].items.forEach(column => {
            if (column.dataField !== dataField) {
                column.removeSortingCss();
            }
        });
    }
}

Neo.applyClassConfig(Container);

export {Container as default};