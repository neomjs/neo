import BaseContainer from '../container/Base.mjs';
import View          from './View.mjs';
import * as header   from './header/_export.mjs';

/**
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
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

    static getConfig() {return {
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
         * @member {String[]} cls=['neo-grid-container']
         */
        cls: ['neo-grid-container'],
        /**
         * @member {Object[]} columns_=[]
         */
        columns_: [],
        /**
         * @member {String} layout='base'
         */
        layout: 'base',
        /**
         * @member {Object} _vdom={cls:['neo-grid-wrapper'],cn:[{cn:[]}]}
         */
        _vdom:
        {cls: ['neo-grid-wrapper'], cn: [
            {cn: []}
        ]}
    }}

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

        me.createColumns(me.columns);
    }

    /**
     * Triggered before the columns config gets changed.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    beforeSetColumns(value, oldValue) {
        if (this.configsApplied) {
            return this.createColumns(value);
        }

        return value;
    }

    /**
     * @param {Object[]} columns
     * @returns {*}
     */
    createColumns(columns) {
        let me             = this,
            columnDefaults = me.columnDefaults,
            sorters        = me.store?.sorters;

        if (!columns || !columns.length) {
            Neo.logError('Attempting to create a grid.Container without defined columns', me.id);
        }

        columns.forEach(column => {
            if (column.dock && !column.width) {
                Neo.logError('Attempting to create a docked column without a defined width', column, me.id);
            }

            columnDefaults && Neo.assignDefaults(column, columnDefaults);

            if (sorters?.[0]) {
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
     * @override
     * @returns {*}
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     * @returns {Object[]} The new vdom items root
     */
    getVdomItemsRoot() {
        return this.vdom.cn[0];
    }

    /**
     * @returns {Neo.grid.View}
     */
    getView() {
        return Neo.getComponent(this.viewId) || Neo.get(this.viewId);
    }

    /**
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
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
        me.onStoreLoad(me.store.items);
    }
}

Neo.applyClassConfig(Container);

export default Container;
