import ChipComponent from '../component/Chip.mjs';
import ComponentList from './Component.mjs';

/**
 * @class Neo.list.Chip
 * @extends Neo.list.Component
 */
class Chip extends ComponentList {
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
         * @member {String[]} cls=['neo-chip-list','neo-list']
         */
        cls: ['neo-chip-list', 'neo-list'],
        /**
         * @member {String} itemCls='neo-chip'
         */
        itemCls: 'neo-chip',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module : ChipComponent,
            iconCls: 'fa fa-home'
        },
        /**
         * True will flex each list item horizontally
         * @member {Boolean} stacked_=true
         */
        stacked_: true,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: []} // we are using a div instead of a li tag
    }}

    /**
     * Triggered after the stacked config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetStacked(value, oldValue) {
        if (oldValue !== undefined) {
            let me    = this,
                items = me.items || [];

            items.forEach(item => {
                item.display = value ? 'flex' : 'inline-flex';
            });
        }
    }

    /**
     * Override this method for custom list items
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} The list item object
     */
    createItem(record, index) {
        let me       = this,
            id       = record[me.store.keyProperty],
            items    = me.items || [],
            listItem = items[index],

            config = {
                display: me.stacked ? 'flex' : 'inline-flex',
                id     : me.getComponentId(id),
                text   : record[me.displayField]
            };

        if (listItem) {
            listItem.set(config);
        } else {
            items[index] = listItem = Neo.create({
                appName  : me.appName,
                cls      : [me.itemCls],
                parentId : me.id,
                tabIndex : -1,
                ...me.itemDefaults,
                ...config
            });
        }

        me.items = items;

        return listItem.vdom;
    }
}

Neo.applyClassConfig(Chip);

export {Chip as default};
