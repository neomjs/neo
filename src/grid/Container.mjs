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
         * todo: testing config, remove when Stores are ready
         * @member {Number} amountRows=20
         */
        amountRows: 20,
        /**
         * @member {Array} cls=['neo-grid-container']
         */
        cls: ['neo-grid-container'],
        /**
         * @member {Array} columns=[]
         */
        columns: [],
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
        _vdom: {
            cn: [{
                cls: ['neo-grid-container'],
                cn : []
            }],
            style: {
                height: '300px',
                width : '100%'
            }
        }
    }}

    get columns() {
        return this._columns;
    }
    set columns(value) {
        this._columns = this.createColumns(value); // todo: beforeSetColumns
    }

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        this.createRandomViewData(this.amountRows);
    }

    /**
     *
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
     *
     * Dummy method until we have a data package in place
     * @param {Number} amountRows
     */
    createRandomViewData(amountRows) {
        let me      = this,
            columns = me.items[0].items,
            i      = 0,
            data   = [],
            vdom   = me.items[1].vdom;

        for (; i < amountRows; i++) {
            data.push({
                cls: ['neo-grid-row'],
                cn : []
            });

            columns.forEach(function(column, index) {
                data[i].cn.push({
                    cls      : ['neo-grid-cell'],
                    innerHTML: 'Column' + (index + 1) + ' - ' + Math.round(Math.random() / 1.5),
                    style: {
                        backgroundColor: Math.round(Math.random() / 1.7) > 0 ? 'brown' : '#3c3f41'
                    }
                });
            });
        }

        vdom.cn = data;

        // we want to ignore id checks inside of the vdom helper
        if (me.items[1].vnode) {
            me.syncVdomIds(me.items[1].vnode, vdom);
        }

        me.items[1].vdom = vdom;
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

export {Container as default};