import {default as BaseToolbar} from '../../container/Toolbar.mjs';

/**
 * @class Neo.grid.header.Toolbar
 * @extends Neo.container.Toolbar
 */
class Toolbar extends BaseToolbar {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.grid.header.Toolbar'
         * @private
         */
        className: 'Neo.grid.header.Toolbar',
        /**
         * @member {String} ntype='grid-header-toolbar'
         * @private
         */
        ntype: 'grid-header-toolbar',
        /**
         * @member {Array} cls=['neo-grid-header-toolbar']
         */
        cls: ['grid-header-toolbar'],
        /**
         * @member {String} _layout='base'
         * @private
         */
        _layout  : 'base',
        /**
         * @member {Object} itemDefaults={ntype:'grid-header-button'}
         * @private
         */
        itemDefaults: {
            ntype: 'grid-header-button'
        },
        /**
         * @member {Object} _vdom
         * @private
         */
        _vdom: {
            cn: [{
                cls: ['neo-grid-row'],
                cn : []
            }]
        }
    }}

    /**
     *
     * @param dock
     * @returns {String} layoutConfig
     * @override
     */
    getLayoutConfig(dock) {
        return 'base';
    }

    /**
     *
     * @returns {Object}
     */
    getVdomRoot() {
        return this.vdom.cn[0];
    }

    /**
     *
     * @returns {Object}
     */
    getVnodeRoot() {
        return this.vnode.childNodes[0];
    }

    /**
     *
     * @param {Array} items
     */
    createItems(items) {
        let me = this,
            cn = [],
            i  = 0,
            len, vdom;

        super.createItems();

        items = me.items;
        len   = items.length;
        vdom  = me.vdom;

        for (; i < len; i++) {
            cn.push(items[i]._vdom = {
                cls: ['neo-grid-header-cell'],
                cn : items[i].vdom
            });

            //items[i].vdom.cls = []; // remove the button cls from the th tag
        }

        vdom.cn[0].cn = cn;

        me.vdom = vdom;
    }

    /**
     *
     */
    render() {
        console.log(this.items);

        super.render();
    }
}

Neo.applyClassConfig(Toolbar);

export {Toolbar as default};