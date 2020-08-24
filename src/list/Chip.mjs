import Base          from './Base.mjs';
import ChipComponent from '../component/Chip.mjs';

/**
 * @class Neo.list.Chip
 * @extends Neo.list.Base
 */
class Chip extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Chip'
         * @protected
         */
        className: 'Neo.list.Chip',
        /**
         * @member {String} ntype='chiplist'
         * @protected
         */
        ntype: 'chiplist',
        /**
         * @member {Object|null} chipConfig=null
         */
        chipConfig: null,
        /**
         * @member {String[]} cls=['neo-chip-list', 'neo-list']
         */
        cls: ['neo-chip-list', 'neo-list'],
        /**
         * @member {String} itemCls='neo-chip'
         */
        itemCls: 'neo-chip',
        /**
         * True will flex each list item horizontally
         * @member {Boolean} stacked_=true
         */
        stacked_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: []
        }
    }}

    /**
     * Triggered after the stacked config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetStacked(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this,
                itemId;

            me.store.items.forEach(record => {
                itemId = me.getItemId(record[me.getKeyProperty()]);
                Neo.getComponent(itemId).display = value ? 'flex' : 'inline-flex';
            });
        }
    }

    /**
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me   = this,
            vdom = me.vdom,
            listItem;

        vdom.cn = [];

        me.store.items.forEach(item => {
            listItem = Neo.create({
                module  : ChipComponent,
                display : me.stacked ? 'flex' : 'inline-flex',
                iconCls : 'fa fa-home',
                id      : me.getItemId(item[me.getKeyProperty()]),
                parentId: me.id,
                text    : item[me.displayField],
                ...me.chipConfig || {}
            });

            vdom.cn.push(listItem.vdom);
        });

        if (silent) {
            me._vdom = vdom;
        } else {
            me.promiseVdomUpdate().then(() => {
                me.fire('createItems');
            });
        }
    }

    /**
     *
     */
    destroy() {
        let me = this,
            itemId;

        me.store.items.forEach(record => {
            itemId = me.getItemId(record[me.getKeyProperty()]);
            Neo.getComponent(itemId).destroy();
        });

        super.destroy();
    }
}

Neo.applyClassConfig(Chip);

export {Chip as default};