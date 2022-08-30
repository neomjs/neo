import BaseContainer from '../container/Base.mjs';

/**
 * @class Neo.grid.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
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
         * @member {String} _layout='base'
         */
        _layout: 'base',
        /**
         * @member {Array} _items
         */
        _items: [
            {
                ntype: 'grid-header-toolbar'
            },
            {
                ntype: 'grid-view'
            }/*,
            {
                ntype: 'component',
                cls  : ['neo-grid-y-scroller'],
                style: {
                    height: 'calc(100% - 32px)',
                    top   : '32px'
                },
                vdom: {
                    cn: [{
                        height: 800
                    }]
                }
            }*/
        ],
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {style: {height: '300px', width: '100%'}, cn: [
            {cls: ['neo-grid-container'], cn: []}
        ]}
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.createRandomViewData(this.amountRows);
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
     * @param columns
     * @returns {*}
     */
    createColumns(columns) {
        let me = this;

        if (!columns || !columns.length) {
            Neo.logError('Attempting to create a grid.Container without defined columns', me.id);
        }

        columns.forEach(function(column) {
            if (column.locked && !column.width) {
                Neo.logError('Attempting to create a locked column without a defined width', column, me.id);
            }
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
     * @override
     * @returns {Neo.vdom.VNode}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }
}

Neo.applyClassConfig(Container);

export default Container;
